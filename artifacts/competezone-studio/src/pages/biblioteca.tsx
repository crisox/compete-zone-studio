import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@workspace/replit-auth-web';
import {
  getGetStudioSummaryQueryKey,
  getListCreationsQueryKey,
  useDeleteCreation,
  useListCreations,
  type Creation,
} from '@workspace/api-client-react';
import { Trash2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { EmptyState, ErrorState, LoginNudge, PageHead } from '@/components/shell';
import { CreationMedia, DownloadLink, StatusPill } from '@/components/creation-media';
import { AUDIENCE_LABEL, KIND_LABEL, errMsg, fmtDate } from '@/lib/studio';

export default function Biblioteca() {
  const { isAuthenticated, isLoading: authLoading, login } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [preview, setPreview] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Creation | null>(null);

  const list = useListCreations({
    query: {
      enabled: isAuthenticated,
      queryKey: getListCreationsQueryKey(),
      refetchInterval: (q) => (q.state.data?.some((c) => c.status === 'generating') ? 3000 : false),
    },
  });
  const del = useDeleteCreation();
  const items = list.data ?? [];
  const generating = items.filter((c) => c.status === 'generating').length;
  const prevGen = useRef(0);
  useEffect(() => {
    if (generating < prevGen.current) qc.invalidateQueries({ queryKey: getGetStudioSummaryQueryKey() });
    prevGen.current = generating;
  }, [generating, qc]);

  const current = items.find((c) => c.id === preview) ?? null;

  const confirmDelete = () => {
    if (!toDelete) return;
    const id = toDelete.id;
    del.mutate(
      { id },
      {
        onSuccess: () => {
          setToDelete(null);
          if (preview === id) setPreview(null);
          qc.invalidateQueries({ queryKey: getListCreationsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetStudioSummaryQueryKey() });
          toast({ title: 'Pieza eliminada' });
        },
        onError: (e) => toast({ title: 'No se pudo eliminar', description: errMsg(e), variant: 'destructive' }),
      },
    );
  };

  return (
    <div>
      <PageHead kicker="Historial" title="Biblioteca">
        {generating > 0 && (
          <span className="rounded-full bg-sky-100 px-3 py-1.5 text-xs font-bold text-sky-800" data-testid="text-generating-count">
            {generating} generando · se actualiza cada 3 s
          </span>
        )}
      </PageHead>

      {authLoading ? null : !isAuthenticated ? (
        <div className="space-y-4">
          <LoginNudge text="Ingresá para ver y guardar tu historial de piezas." />
          <EmptyState title="Tu biblioteca está vacía" body="Cada imagen y video que generes queda guardado acá, con descarga y vista previa." action={<button onClick={login} className="rounded-md bg-accent px-4 py-2 text-sm font-bold text-[#0F172A]">Ingresar</button>} />
        </div>
      ) : list.isLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[4/5] animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : list.isError ? (
        <ErrorState message={errMsg(list.error)} onRetry={() => list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title="Todavía no hay piezas" body="Generá la primera y va a aparecer acá." action={<Link href="/" className="rounded-md bg-accent px-4 py-2 text-sm font-bold text-[#0F172A]">Ir a crear</Link>} />
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {items.map((c, i) => (
            <article key={c.id} data-testid={`card-creation-${c.id}`} className="cz-rise overflow-hidden rounded-xl border bg-card" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
              <button onClick={() => setPreview(c.id)} className="block w-full p-2 text-left" data-testid={`button-preview-${c.id}`}>
                <div className="aspect-square overflow-hidden rounded-lg">
                  <CreationMedia c={{ ...c, aspectRatio: '1:1' }} />
                </div>
              </button>
              <div className="space-y-2 px-3 pb-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 text-sm font-bold leading-tight">{c.title}</h3>
                  <StatusPill status={c.status} />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {KIND_LABEL[c.kind]} · {c.aspectRatio} · {AUDIENCE_LABEL[c.audience]}
                  <br />
                  {fmtDate(c.createdAt)}
                </p>
                <div className="flex items-center justify-between">
                  {c.status === 'completed' ? <DownloadLink c={c} /> : <span />}
                  <button onClick={() => setToDelete(c)} aria-label="Eliminar" data-testid={`button-delete-${c.id}`} className="rounded p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {current && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-sidebar/80 p-4 backdrop-blur-sm" onClick={() => setPreview(null)} data-testid="modal-preview">
          <div className="cz-rise max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-xl bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">{current.title}</h2>
                <p className="text-xs text-muted-foreground">{current.model} · {fmtDate(current.createdAt)}</p>
              </div>
              <button onClick={() => setPreview(null)} aria-label="Cerrar" className="rounded p-1.5 hover:bg-muted"><X className="h-5 w-5" /></button>
            </div>
            <CreationMedia c={current} />
            <p className="mt-3 text-sm text-muted-foreground">{current.prompt}</p>
            {current.status === 'failed' && <p className="mt-3 rounded-md bg-destructive/10 p-3 text-xs text-destructive">{current.error ?? 'Google no devolvió detalles.'}</p>}
            <div className="mt-4 flex gap-2"><DownloadLink c={current} /></div>
          </div>
        </div>
      )}

      {toDelete && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-sidebar/80 p-4" data-testid="modal-delete">
          <div className="cz-rise w-full max-w-sm rounded-xl bg-card p-6">
            <h2 className="text-lg font-black">¿Eliminar esta pieza?</h2>
            <p className="mt-2 text-sm text-muted-foreground">"{toDelete.title}" se borra de tu biblioteca y no se puede recuperar.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setToDelete(null)} data-testid="button-cancel-delete" className="rounded-md px-4 py-2 text-sm font-semibold hover:bg-muted">Cancelar</button>
              <button onClick={confirmDelete} disabled={del.isPending} data-testid="button-confirm-delete" className="rounded-md bg-destructive px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
                {del.isPending ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
