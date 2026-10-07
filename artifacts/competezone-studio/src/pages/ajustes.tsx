import { getGetStudioStatusQueryKey, useGetStudioStatus } from '@workspace/api-client-react';
import { CheckCircle2, CircleAlert, Lock } from 'lucide-react';
import { ErrorState, PageHead } from '@/components/shell';
import { errMsg } from '@/lib/studio';

export default function Ajustes() {
  const q = useGetStudioStatus({ query: { queryKey: getGetStudioStatusQueryKey() } });
  const s = q.data;
  const row = (k: string, v: string, id: string) => (
    <div className="flex items-center justify-between gap-4 border-b py-3 last:border-0">
      <span className="text-sm text-muted-foreground">{k}</span>
      <code className="rounded bg-muted px-2 py-1 text-xs font-semibold" data-testid={id}>{v}</code>
    </div>
  );
  return (
    <div>
      <PageHead kicker="Proveedor" title="Ajustes" />
      {q.isLoading ? (
        <div className="h-56 animate-pulse rounded-xl bg-muted" />
      ) : q.isError || !s ? (
        <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <div className="cz-rise grid gap-6 md:grid-cols-[1.2fr_1fr]">
          <div className="rounded-xl border bg-card p-6">
            <div className="mb-4 flex items-center gap-3">
              {s.configured ? <CheckCircle2 className="h-6 w-6 text-primary" /> : <CircleAlert className="h-6 w-6 text-amber-500" />}
              <div>
                <div className="font-black" data-testid="text-configured">{s.configured ? 'Clave de Google configurada' : 'Falta la clave de Google'}</div>
                <p className="text-sm text-muted-foreground">{s.message}</p>
              </div>
            </div>
            {row('Modelo de imagen', s.imageModel, 'text-image-model')}
            {row('Modelo de video', s.videoModel, 'text-video-model')}
          </div>
          <div className="space-y-4">
            <div className="flex gap-3 rounded-xl bg-sidebar p-5 text-sm text-slate-200">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <p>Solo lectura. La clave vive en el servidor y nunca se muestra ni se edita desde acá.</p>
            </div>
            <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
              Este estado indica que hay una clave cargada, no que Google haya verificado acceso a los modelos. Si un modelo no está disponible para tu cuenta, el error de Google aparece en la pieza fallida. Cuotas y facturación se gestionan en tu cuenta de Google.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
