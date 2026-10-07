import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@workspace/replit-auth-web';
import {
  getGetTemplateBriefQueryKey,
  getGetTemplatesQueryKey,
  getListTemplateIdeasQueryKey,
  useGenerateTemplateIdeas,
  useGetTemplateBrief,
  useGetTemplates,
  useListTemplateIdeas,
  useUpdateTemplateIdea,
  type TemplateIdea,
} from '@workspace/api-client-react';
import { ArrowRight, Bookmark, Film, Image as ImageIcon, Lightbulb, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState, ErrorState, LoginNudge, PageHead } from '@/components/shell';
import { AUDIENCE_LABEL, PREFILL_KEY, errMsg } from '@/lib/studio';
import { useToast } from '@/hooks/use-toast';

type Aud = 'all' | 'organizers' | 'athletes';
type Kind = 'mixed' | 'image' | 'video';

export default function IdeasIA() {
  const [, nav] = useLocation();
  const { isAuthenticated } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const brief = useGetTemplateBrief({ query: { queryKey: getGetTemplateBriefQueryKey() } });
  const templates = useGetTemplates({ query: { queryKey: getGetTemplatesQueryKey() } });
  const ideas = useListTemplateIdeas({
    query: { enabled: isAuthenticated, queryKey: getListTemplateIdeasQueryKey() },
  });
  const gen = useGenerateTemplateIdeas();
  const upd = useUpdateTemplateIdea();
  const [focus, setFocus] = useState('');
  const [audience, setAudience] = useState<Aud>('all');
  const [kind, setKind] = useState<Kind>('mixed');
  const [count, setCount] = useState(3);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getGetTemplatesQueryKey() });
    qc.invalidateQueries({ queryKey: getListTemplateIdeasQueryKey() });
  };

  const generate = async () => {
    try {
      const r = await gen.mutateAsync({ data: { focus: focus.trim(), audience, kind, count } });
      qc.invalidateQueries({ queryKey: getListTemplateIdeasQueryKey() });
      toast({ title: `${r.length} ideas nuevas para revisar` });
    } catch (e) {
      toast({ title: 'No pudimos generar ideas', description: errMsg(e), variant: 'destructive' });
    }
  };

  const setStatus = async (i: TemplateIdea, status: 'saved' | 'dismissed') => {
    setBusyId(i.id);
    try {
      await upd.mutateAsync({ id: i.id, data: { status } });
      refresh();
      toast({ title: status === 'saved' ? 'Guardada en Plantillas' : 'Idea descartada' });
    } catch (e) {
      toast({ title: 'No se pudo actualizar', description: errMsg(e), variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const use = (i: TemplateIdea) => {
    sessionStorage.setItem(
      PREFILL_KEY,
      JSON.stringify({ title: i.title, prompt: i.prompt, audience: i.audience, kind: i.kind, includeLogo: true }),
    );
    nav('/');
  };

  const saveAndUse = async (i: TemplateIdea) => {
    setBusyId(i.id);
    try {
      await upd.mutateAsync({ id: i.id, data: { status: 'saved' } });
      refresh();
      use(i);
    } catch (e) {
      toast({ title: 'No se pudo guardar', description: errMsg(e), variant: 'destructive' });
      setBusyId(null);
    }
  };

  const list = ideas.data ?? [];
  const suggested = list.filter((i) => i.status === 'suggested');
  const saved = list.filter((i) => i.status === 'saved');
  const seg = 'rounded-md px-3 py-1.5 text-sm font-bold';

  const card = (i: TemplateIdea) => (
    <article key={i.id} data-testid={`card-idea-${i.id}`} className="cz-rise relative overflow-hidden rounded-xl border bg-card p-5">
      <span className="absolute inset-y-0 left-0 w-1 bg-accent" />
      <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {i.kind === 'video' ? <Film className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
        {i.category} · {AUDIENCE_LABEL[i.audience]}
      </div>
      <h3 className="text-lg font-black leading-tight">{i.title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">{i.description}</p>
      <dl className="mt-3 grid gap-2 text-sm">
        <div><dt className="text-[11px] font-bold uppercase tracking-wider text-primary">Funcionalidad</dt><dd>{i.feature}</dd></div>
        <div><dt className="text-[11px] font-bold uppercase tracking-wider text-primary">Ángulo creativo</dt><dd>{i.angle}</dd></div>
        <div><dt className="text-[11px] font-bold uppercase tracking-wider text-primary">Por qué es distinta</dt><dd>{i.reason}</dd></div>
      </dl>
      <p className="mt-3 rounded-md bg-muted p-2.5 text-xs text-muted-foreground">{i.prompt}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {i.status === 'suggested' ? (
          <>
            <button disabled={busyId !== null} onClick={() => saveAndUse(i)} data-testid={`button-save-use-${i.id}`} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
              Guardar y usar <ArrowRight className="h-4 w-4" />
            </button>
            <button disabled={busyId !== null} onClick={() => setStatus(i, 'saved')} data-testid={`button-save-${i.id}`} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-bold disabled:opacity-50">
              <Bookmark className="h-4 w-4" /> Guardar en Plantillas
            </button>
            <button disabled={busyId !== null} onClick={() => setStatus(i, 'dismissed')} data-testid={`button-dismiss-${i.id}`} className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-bold text-muted-foreground disabled:opacity-50">
              <X className="h-4 w-4" /> Descartar
            </button>
          </>
        ) : (
          <button onClick={() => use(i)} data-testid={`button-use-${i.id}`} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-bold text-white">
            Usar en Crear <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </article>
  );

  return (
    <div>
      <PageHead kicker="Brainstorming de texto" title="Ideas IA" />
      <p className="-mt-4 mb-8 max-w-2xl text-sm text-muted-foreground">
        La API de Interactions analiza las plantillas que ya tenés y propone enfoques nuevos para promocionar la web. Tanto las propuestas de texto como las piezas que generes después en Crear usan la cuota y las tarifas de Google.
      </p>

      <section className="mb-10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-black uppercase tracking-wider">Funciones del producto</h2>
          {brief.data && <a href={brief.data.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-primary underline">Ver la web que promocionamos</a>}
        </div>
        {brief.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 4 }).map((_, k) => <div key={k} className="h-20 animate-pulse rounded-xl bg-muted" />)}</div>
        ) : brief.isError ? (
          <ErrorState message={errMsg(brief.error)} onRetry={() => brief.refetch()} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2" data-testid="list-features">
            {brief.data?.features.map((f) => (
              <div key={f.id} className="rounded-xl border bg-card p-4">
                <div className="font-extrabold">{f.title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{f.description}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-black uppercase tracking-wider">Plantillas existentes (contexto)</h2>
        {templates.isLoading ? (
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
        ) : templates.isError ? (
          <ErrorState message={errMsg(templates.error)} onRetry={() => templates.refetch()} />
        ) : (
          <div className="flex flex-wrap gap-2" data-testid="list-existing-templates">
            {templates.data?.map((t) => (
              <span key={t.id} className="rounded-full border bg-card px-3 py-1.5 text-xs font-semibold">
                {t.title} <span className="text-muted-foreground">· {t.category}</span>
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="mb-10 rounded-xl bg-sidebar p-5 text-white">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-black"><Lightbulb className="h-5 w-5 text-accent" /> Pedile ideas nuevas</h2>
        <p className="mb-4 text-xs text-slate-300">{brief.data?.model ?? 'Gemini'} · Interactions API · Solo propuestas de texto; no genera videos ni imágenes todavía.</p>
        {!isAuthenticated ? (
          <LoginNudge text="Ingresá para generar ideas y guardarlas en tus plantillas." />
        ) : (
          <div className="grid gap-4">
            <label className="grid gap-1.5 text-sm font-semibold">
              Enfoque (opcional)
              <textarea value={focus} maxLength={1500} onChange={(e) => setFocus(e.target.value)} rows={3} data-testid="input-focus" placeholder="Ej: torneos de fin de año, inscripciones abiertas..." className="rounded-md bg-white/10 p-3 text-sm font-normal text-white placeholder:text-slate-400" />
            </label>
            <div className="flex flex-wrap gap-4">
              <div role="group" aria-label="Público" className="flex gap-1 rounded-lg bg-white/10 p-1">
                {([['all', 'Todos'], ['organizers', 'Organizadores'], ['athletes', 'Deportistas']] as const).map(([v, l]) => (
                  <button key={v} aria-pressed={audience === v} data-testid={`ia-audience-${v}`} onClick={() => setAudience(v)} className={cn(seg, audience === v ? 'bg-accent text-[#0F172A]' : 'text-slate-300')}>{l}</button>
                ))}
              </div>
              <div role="group" aria-label="Formato" className="flex gap-1 rounded-lg bg-white/10 p-1">
                {([['mixed', 'Mixto'], ['image', 'Imagen'], ['video', 'Video']] as const).map(([v, l]) => (
                  <button key={v} aria-pressed={kind === v} data-testid={`ia-kind-${v}`} onClick={() => setKind(v)} className={cn(seg, kind === v ? 'bg-accent text-[#0F172A]' : 'text-slate-300')}>{l}</button>
                ))}
              </div>
              <div role="group" aria-label="Cantidad" className="flex gap-1 rounded-lg bg-white/10 p-1">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <button key={n} aria-pressed={count === n} data-testid={`ia-count-${n}`} onClick={() => setCount(n)} className={cn(seg, 'px-2.5', count === n ? 'bg-accent text-[#0F172A]' : 'text-slate-300')}>{n}</button>
                ))}
              </div>
            </div>
            <div>
              <button onClick={generate} disabled={gen.isPending} data-testid="button-generate-ideas" className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-black text-[#0F172A] disabled:opacity-60">
                {gen.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />}
                {gen.isPending ? 'Pensando ideas...' : 'Generar ideas'}
              </button>
            </div>
          </div>
        )}
      </section>

      {isAuthenticated && (
        <section aria-live="polite">
          {ideas.isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 2 }).map((_, k) => <div key={k} className="h-64 animate-pulse rounded-xl bg-muted" />)}</div>
          ) : ideas.isError ? (
            <ErrorState message={errMsg(ideas.error)} onRetry={() => ideas.refetch()} />
          ) : list.length === 0 ? (
            <EmptyState title="Todavía no hay ideas" body="Generá tu primera tanda y revisala acá. Las que guardes pasan a Plantillas." />
          ) : (
            <div className="grid gap-8">
              {suggested.length > 0 && (
                <div>
                  <h2 className="mb-3 text-sm font-black uppercase tracking-wider">Para revisar ({suggested.length})</h2>
                  <div className="grid gap-4 md:grid-cols-2">{suggested.map(card)}</div>
                </div>
              )}
              {saved.length > 0 && (
                <div>
                  <h2 className="mb-3 text-sm font-black uppercase tracking-wider">Guardadas ({saved.length})</h2>
                  <div className="grid gap-4 md:grid-cols-2">{saved.map(card)}</div>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
