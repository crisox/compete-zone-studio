import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { getGetTemplatesQueryKey, useGetTemplates } from '@workspace/api-client-react';
import { ArrowRight, Film, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState, ErrorState, PageHead } from '@/components/shell';
import { AUDIENCE_LABEL, PREFILL_KEY, errMsg } from '@/lib/studio';

export default function Plantillas() {
  const [, nav] = useLocation();
  const q = useGetTemplates({ query: { queryKey: getGetTemplatesQueryKey() } });
  const [aud, setAud] = useState<'all' | 'organizers' | 'athletes'>('all');
  const items = (q.data ?? []).filter((t) => aud === 'all' || t.audience === aud);

  const pick = (t: NonNullable<typeof q.data>[number]) => {
    sessionStorage.setItem(
      PREFILL_KEY,
      JSON.stringify({ title: t.title, prompt: t.prompt, audience: t.audience, kind: t.kind, includeLogo: true }),
    );
    nav('/');
  };

  return (
    <div>
      <PageHead kicker="Puntos de partida" title="Plantillas">
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {([['all', 'Todas'], ['organizers', 'Organizadores'], ['athletes', 'Deportistas']] as const).map(([v, l]) => (
            <button key={v} data-testid={`filter-${v}`} onClick={() => setAud(v)} className={cn('rounded-md px-3 py-1.5 text-sm font-bold', aud === v ? 'bg-sidebar text-white' : 'text-muted-foreground')}>
              {l}
            </button>
          ))}
        </div>
      </PageHead>

      <Link href="/ideas-ia" data-testid="link-ideas-ia" className="mb-6 flex items-center justify-between gap-3 rounded-xl bg-sidebar p-4 text-white">
        <span className="text-sm font-semibold">Nuevas ideas con IA basadas en funciones reales del producto.</span>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-bold text-accent">Ideas IA <ArrowRight className="h-4 w-4" /></span>
      </Link>

      {q.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-44 animate-pulse rounded-xl bg-muted" />)}
        </div>
      ) : q.isError ? (
        <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title="Sin plantillas acá" body="Probá con otro filtro." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((t, i) => (
            <button key={t.id} onClick={() => pick(t)} data-testid={`card-template-${t.id}`} className="cz-rise group relative overflow-hidden rounded-xl border bg-card p-5 text-left transition hover:-translate-y-0.5 hover:border-primary" style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}>
              <span className="absolute inset-y-0 left-0 w-1 bg-primary transition-all group-hover:w-1.5 group-hover:bg-accent" />
              <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {t.kind === 'video' ? <Film className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
                {t.category} · {AUDIENCE_LABEL[t.audience]}
              </div>
              <h3 className="text-lg font-black leading-tight">{t.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{t.description}</p>
              <p className="mt-3 line-clamp-2 rounded-md bg-muted p-2.5 text-xs text-muted-foreground">{t.prompt}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-primary">
                Usar plantilla <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
