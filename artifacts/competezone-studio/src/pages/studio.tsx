import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@workspace/replit-auth-web';
import {
  getGetBrandQueryKey,
  getGetCreationQueryKey,
  getGetStudioStatusQueryKey,
  getGetStudioSummaryQueryKey,
  getListCreationsQueryKey,
  useCreateCreation,
  useGetBrand,
  useGetCreation,
  useGetStudioStatus,
  type CreationInput,
} from '@workspace/api-client-react';
import { ImagePlus, Info, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { PageHead } from '@/components/shell';
import { CreativeVariantButton } from '@/components/creative-variant';
import { CreationMedia, DownloadLink, StatusPill } from '@/components/creation-media';
import { PREFILL_KEY, errMsg, useUploadFile, validateImage } from '@/lib/studio';

type Ref = { id: string; name: string; preview: string; path?: string; uploading: boolean };
type Audience = CreationInput['audience'];
type Kind = CreationInput['kind'];
type Ratio = CreationInput['aspectRatio'];

function Seg<T extends string>({
  value,
  options,
  onChange,
  name,
}: {
  value: T;
  options: { v: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  name: string;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-muted p-1">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          disabled={o.disabled}
          data-testid={`toggle-${name}-${o.v}`}
          onClick={() => onChange(o.v)}
          className={cn(
            'flex-1 rounded-md px-3 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40',
            value === o.v ? 'bg-sidebar text-white shadow' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const label = 'mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground';
const field =
  'w-full rounded-md border border-input bg-card px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/30';

export default function Studio() {
  const { isAuthenticated, login } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { upload } = useUploadFile();
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [audience, setAudience] = useState<Audience>('organizers');
  const [kind, setKind] = useState<Kind>('image');
  const [ratio, setRatio] = useState<Ratio>('16:9');
  const [refs, setRefs] = useState<Ref[]>([]);
  const [includeLogo, setIncludeLogo] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const brand = useGetBrand({ query: { queryKey: getGetBrandQueryKey() } });
  const status = useGetStudioStatus({ query: { queryKey: getGetStudioStatusQueryKey() } });
  const create = useCreateCreation();

  const active = useGetCreation(activeId ?? '', {
    query: {
      enabled: !!activeId && isAuthenticated,
      queryKey: getGetCreationQueryKey(activeId ?? ''),
      refetchInterval: (q) => (q.state.data?.status === 'generating' ? 3000 : false),
    },
  });
  const activeC = active.data;
  const lastStatus = useRef<string | undefined>(undefined);
  useEffect(() => {
    const s = activeC?.status;
    if (s && lastStatus.current === 'generating' && s !== 'generating') {
      qc.invalidateQueries({ queryKey: getListCreationsQueryKey() });
      qc.invalidateQueries({ queryKey: getGetStudioSummaryQueryKey() });
    }
    lastStatus.current = s;
  }, [activeC?.status, qc]);

  useEffect(() => {
    const raw = sessionStorage.getItem(PREFILL_KEY);
    if (!raw) return;
    sessionStorage.removeItem(PREFILL_KEY);
    try {
      const p = JSON.parse(raw);
      setTitle(p.title ?? '');
      setPrompt(p.prompt ?? '');
      if (p.audience) setAudience(p.audience);
      if (p.kind) setKind(p.kind);
      if (p.includeLogo) setIncludeLogo(true);
    } catch {
      /* ignore */
    }
  }, []);

  const pickKind = (k: Kind) => {
    setKind(k);
    if (k === 'video' && ratio === '1:1') setRatio('16:9');
  };

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    if (!isAuthenticated) return login();
    const room = 3 - refs.length;
    const list = Array.from(files).slice(0, room);
    if (files.length > room) toast({ title: 'Máximo 3 referencias', variant: 'destructive' });
    for (const f of list) {
      const bad = validateImage(f);
      if (bad) {
        toast({ title: 'Archivo no válido', description: bad, variant: 'destructive' });
        continue;
      }
      const id = crypto.randomUUID();
      setRefs((r) => [...r, { id, name: f.name, preview: URL.createObjectURL(f), uploading: true }]);
      try {
        const path = await upload(f);
        setRefs((r) => r.map((x) => (x.id === id ? { ...x, path, uploading: false } : x)));
      } catch (e) {
        setRefs((r) => r.filter((x) => x.id !== id));
        toast({ title: 'No se subió la referencia', description: errMsg(e), variant: 'destructive' });
      }
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const uploading = refs.some((r) => r.uploading);
  const valid = title.trim().length > 0 && prompt.trim().length >= 10;

  const submit = () => {
    if (!isAuthenticated) return login();
    const paths = refs.map((r) => r.path).filter((p): p is string => !!p);
    create.mutate(
      {
        data: {
          title: title.trim(),
          prompt: prompt.trim(),
          kind,
          audience,
          aspectRatio: ratio,
          referencePaths: paths.length ? paths : undefined,
          includeLogo,
        },
      },
      {
        onSuccess: (c) => {
          setActiveId(c.id);
          lastStatus.current = c.status;
          qc.setQueryData(getGetCreationQueryKey(c.id), c);
          qc.invalidateQueries({ queryKey: getListCreationsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetStudioSummaryQueryKey() });
          toast({ title: 'Pedido enviado', description: 'Lo seguís desde acá o en la biblioteca.' });
        },
        onError: (e) => toast({ title: 'No se pudo crear', description: errMsg(e), variant: 'destructive' }),
      },
    );
  };

  const ratios: { v: Ratio; label: string; disabled?: boolean }[] = [
    { v: '9:16', label: '9:16 vertical' },
    { v: '16:9', label: '16:9 horizontal' },
    { v: '1:1', label: '1:1 cuadrado', disabled: kind === 'video' },
  ];

  return (
    <div>
      <section className="cz-rise relative mb-8 overflow-hidden rounded-2xl bg-sidebar text-white">
        <img src={`${import.meta.env.BASE_URL}hero.jpg`} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-r from-sidebar via-sidebar/80 to-transparent" />
        <div className="relative px-6 py-10 md:px-10 md:py-14">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-accent">
            <span className="h-[3px] w-6 bg-accent" /> Estudio audiovisual
          </div>
          <h1 className="max-w-xl text-4xl font-black leading-[1.02] tracking-tight md:text-6xl">
            Menos vueltas.
            <br />
            <span className="text-sky-400">Más competencia.</span>
          </h1>
          <p className="mt-4 max-w-md text-sm text-slate-300 md:text-base">
            Contanos la idea, sumá fotos reales de tu evento y salí con imágenes y videos de {brand.data?.name ?? 'CompeteZone'} listos para publicar.
          </p>
          <p className="mt-3 text-[11px] text-slate-400">Imagen decorativa del estudio, no es una creación tuya.</p>
        </div>
      </section>

      {status.data && !status.data.configured && (
        <div className="mb-6 flex gap-3 rounded-xl border border-amber-400/50 bg-amber-50 p-4 text-sm text-amber-900" data-testid="banner-not-configured">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{status.data.message}</p>
        </div>
      )}

      <PageHead kicker="Nueva pieza" title="Creá una imagen o un video" />

      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !uploading) submit();
          }}
          className="cz-rise space-y-5 rounded-xl border bg-card p-5 md:p-6"
        >
          <div>
            <label className={label} htmlFor="title">Título</label>
            <input id="title" data-testid="input-title" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Apertura inscripciones Rambla 10K" className={field} />
          </div>
          <div>
            <label className={label} htmlFor="prompt">Qué querés ver</label>
            <textarea id="prompt" data-testid="input-prompt" rows={5} maxLength={4000} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describí la escena, el ambiente, el mensaje y qué tiene que decir..." className={cn(field, 'resize-y')} />
            <div className="mt-1 text-right text-[11px] text-muted-foreground">{prompt.length}/4000 · mínimo 10</div>
          </div>
          <CreativeVariantButton
            title={title}
            prompt={prompt}
            audience={audience}
            kind={kind}
            aspectRatio={ratio}
            isAuthenticated={isAuthenticated}
            login={login}
            onApprove={(v) => {
              setTitle(v.title);
              setPrompt(v.prompt);
            }}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className={label}>Para quién</span>
              <Seg name="audience" value={audience} onChange={(v) => setAudience(v as Audience)} options={[{ v: 'organizers', label: 'Organizadores' }, { v: 'athletes', label: 'Deportistas' }]} />
            </div>
            <div>
              <span className={label}>Formato</span>
              <Seg name="kind" value={kind} onChange={pickKind} options={[{ v: 'image', label: 'Imagen' }, { v: 'video', label: 'Video' }]} />
            </div>
          </div>
          <div>
            <span className={label}>Proporción {kind === 'video' && <em className="font-normal normal-case">(video: solo 9:16 o 16:9)</em>}</span>
            <Seg name="ratio" value={ratio} onChange={(v) => setRatio(v as Ratio)} options={ratios} />
          </div>

          <div>
            <span className={label}>Fotos de referencia · hasta 3 · PNG, JPEG o WEBP · 5 MB</span>
            <div className="flex flex-wrap gap-3">
              {refs.map((r) => (
                <div key={r.id} className="relative h-20 w-20 overflow-hidden rounded-lg border" data-testid={`ref-${r.id}`}>
                  <img src={r.preview} alt={r.name} className="h-full w-full object-cover" />
                  {r.uploading && (
                    <div className="absolute inset-0 grid place-items-center bg-sidebar/70"><Loader2 className="h-5 w-5 animate-spin text-white" /></div>
                  )}
                  <button type="button" aria-label="Quitar" onClick={() => setRefs((x) => x.filter((y) => y.id !== r.id))} className="absolute right-1 top-1 rounded-full bg-sidebar/80 p-0.5 text-white">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {refs.length < 3 && (
                <button type="button" data-testid="button-add-reference" onClick={() => (isAuthenticated ? fileRef.current?.click() : login())} className="grid h-20 w-20 place-items-center rounded-lg border-2 border-dashed border-input text-muted-foreground transition hover:border-primary hover:text-primary">
                  <ImagePlus className="h-5 w-5" />
                </button>
              )}
              <input ref={fileRef} type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => onFiles(e.target.files)} data-testid="input-reference" />
            </div>
            {!isAuthenticated && <p className="mt-2 text-xs text-muted-foreground">Para subir fotos tenés que ingresar.</p>}
          </div>

          <label className={cn('flex items-start gap-3 rounded-lg border p-3', !brand.data?.logoUrl && 'opacity-70')}>
            <input type="checkbox" data-testid="checkbox-logo" className="mt-1 h-4 w-4 accent-[#0053B4]" disabled={!brand.data?.logoUrl && !includeLogo} checked={includeLogo} onChange={(e) => setIncludeLogo(e.target.checked)} />
            <span className="text-sm">
              <b>Incluir el logo oficial</b>
              <span className="block text-muted-foreground">
                {brand.data?.logoUrl ? 'Logo original sin fondos agregados: conservamos la transparencia, arriba a la izquierda y durante todo el video. Reemplaza el nombre escrito de la marca.' : (<>Todavía no subiste el logo. <Link href="/marca" className="font-semibold text-primary underline">Subilo en Marca</Link> y guardá los cambios. Nunca lo inventamos.</>)}
              </span>
            </span>
          </label>

          <div className="flex gap-3 rounded-lg bg-sky-50 p-3 text-xs text-sky-900" data-testid="note-billing">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              La generación usa los modelos de Google y se factura según la cuota y el plan de la clave configurada en Google. CompeteZone no ve ni muestra tu saldo. Si el modelo no está habilitado, Google devuelve el error y lo vas a ver tal cual en la pieza.
              {kind === 'video' && <span className="mt-1 block">Antes del video se prepara una locución de hasta 18 palabras. Se solicita una pieza de 10 s, con la voz terminada antes de 8,5 s y margen para el cierre.</span>}
            </p>
          </div>

          <button type="submit" data-testid="button-generate" disabled={isAuthenticated && (!valid || uploading || create.isPending)} className="flex w-full items-center justify-center gap-2 rounded-md bg-primary py-3.5 text-sm font-extrabold uppercase tracking-wider text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {!isAuthenticated ? 'Ingresá para generar' : uploading ? 'Subiendo referencias...' : `Generar ${kind === 'video' ? 'video' : 'imagen'}`}
          </button>
        </form>

        <aside className="cz-rise space-y-4 lg:sticky lg:top-6 lg:self-start" style={{ animationDelay: '.1s' }}>
          <div className="rounded-xl border bg-card p-5">
            <div className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Resultado</div>
            {activeC ? (
              <div className="space-y-3" data-testid="panel-active">
                <CreationMedia c={activeC} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-bold">{activeC.title}</div>
                    <div className="text-xs text-muted-foreground">{activeC.model}</div>
                  </div>
                  <StatusPill status={activeC.status} />
                </div>
                {activeC.status === 'failed' && (
                  <p className="rounded-md bg-destructive/10 p-3 text-xs text-destructive" data-testid="text-error">{activeC.error ?? 'Google no devolvió detalles.'}</p>
                )}
                {activeC.status === 'completed' && <DownloadLink c={activeC} />}
                <Link href="/biblioteca" className="block text-sm font-semibold text-primary underline">Ver en la biblioteca</Link>
              </div>
            ) : (
              <div className="cz-stripe grid place-items-center rounded-lg bg-sidebar px-6 py-16 text-center text-white" style={{ aspectRatio: ratio.replace(':', ' / '), maxHeight: '60vh' }}>
                <div>
                  <p className="font-extrabold">Acá aparece tu pieza</p>
                  <p className="mt-1 text-xs text-slate-300">Solo mostramos lo que Google genera de verdad. Nada de ejemplos falsos.</p>
                </div>
              </div>
            )}
          </div>
          <div className="rounded-xl border bg-card p-5 text-sm">
            <div className="mb-1 font-bold">Marca por defecto</div>
            {brand.isLoading ? (
              <div className="h-10 animate-pulse rounded bg-muted" />
            ) : brand.data ? (
              <>
                <p className="text-muted-foreground">{brand.data.tagline}</p>
                <div className="mt-3 flex gap-1.5">
                  {brand.data.colors.map((c) => (
                    <span key={c} title={c} className="h-6 w-6 rounded border" style={{ background: c }} />
                  ))}
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">No pudimos cargar la marca.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
