import { useEffect, useState } from 'react';
import { useGetCreationMetadata, getGetCreationMetadataQueryKey, type Creation, type ProviderRequestMetadata } from '@workspace/api-client-react';
import { Copy, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { errMsg, fmtDate } from '@/lib/studio';

const STAGE: Record<string, string> = {
  'speech-planning': 'Planificación del guion hablado',
  'video-generation': 'Generación de video',
  'video-status': 'Consulta de estado',
};
const STATE: Record<string, string> = { prepared: 'Preparada', received: 'Respuesta recibida', error: 'Error' };

function parse(s: string | null | undefined): Record<string, unknown> | null {
  if (!s) return null;
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function textParts(payload: string | null): string[] {
  const p = parse(payload);
  const input = p?.input;
  if (!Array.isArray(input)) return [];
  return input
    .filter((x) => x && typeof x === 'object' && (x as { type?: string }).type === 'text')
    .map((x) => String((x as { text?: unknown }).text ?? ''));
}

function Block({ label, text, empty }: { label: string; text: string | null | undefined; empty?: string }) {
  const [msg, setMsg] = useState('');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text ?? '');
      setMsg('Copiado');
    } catch {
      setMsg('No se pudo copiar');
    }
    setTimeout(() => setMsg(''), 2000);
  };
  return (
    <section className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-black uppercase tracking-wide text-muted-foreground">{label}</h4>
        {text ? (
          <button onClick={copy} className="flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold hover:bg-muted">
            <Copy className="h-3 w-3" /> {msg || 'Copiar'}
          </button>
        ) : null}
      </div>
      {text ? (
        <pre tabIndex={0} className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 font-mono text-xs">{text}</pre>
      ) : (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">{empty ?? 'Sin datos registrados.'}</p>
      )}
    </section>
  );
}

function Request({ r }: { r: ProviderRequestMetadata }) {
  return (
    <li className="rounded-md border p-3">
      <details>
        <summary className="cursor-pointer text-sm font-bold">
          {STAGE[r.stage] ?? r.stage} · {STATE[r.state] ?? r.state}
        </summary>
        <div className="mt-2 space-y-2 text-xs text-muted-foreground">
          <p>{r.method} {r.apiPath} · {r.model}</p>
          <p className="break-words">Preparada: {r.requestedAt}{r.respondedAt ? ` · Respuesta: ${r.respondedAt}` : ''}</p>
          {r.interactionId && <p className="break-all">ID de interacción: {r.interactionId}</p>}
          <Block label="Payload JSON" text={r.payloadJson} empty="Sin payload registrado." />
        </div>
      </details>
    </li>
  );
}

export function GenerationMetadataDialog({ creation, onClose }: { creation: Creation | null; onClose: () => void }) {
  const id = creation?.id ?? '';
  const open = !!creation;
  const q = useGetCreationMetadata(id, {
    query: {
      enabled: open,
      refetchOnMount: 'always',
      queryKey: getGetCreationMetadataQueryKey(id),
      refetchInterval: creation?.status === 'generating' ? 3000 : false,
    },
  });
  useEffect(() => {
    if (open && creation?.status !== 'generating') void q.refetch();
  }, [open, id, creation?.status, q.refetch]);
  const m = q.data;
  const legacy = m?.availability === 'legacy';
  const gen = m?.requests.find((r) => r.stage === 'video-generation');
  const genPayload = parse(gen?.payloadJson ?? null);
  const finalPrompt = gen ? textParts(gen.payloadJson).join('\n\n') : '';
  const original = parse(m?.originalInputJson);
  const originalPrompt = typeof original?.prompt === 'string' ? original.prompt : null;
  const config = (genPayload?.generation_config ?? genPayload?.config ?? null) as Record<string, unknown> | null;
  const format = genPayload?.response_format as Record<string, unknown> | undefined;
  const videoConfig = config?.video_config as Record<string, unknown> | undefined;
  const facts: [string, unknown][] = genPayload
    ? [
        ['Modelo', genPayload.model ?? gen?.model],
        ['Relación de aspecto', format?.aspect_ratio],
        ['Resolución', format?.resolution],
        ['Tarea', videoConfig?.task],
        ['store', genPayload.store],
        ['stream', genPayload.stream],
        ['background', genPayload.background],
      ]
    : legacy && original ? [['Modelo guardado', original.model], ['Relación de aspecto guardada', original.aspectRatio], ['Público', original.audience]] : [];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl flex-col overflow-hidden" data-testid="modal-metadata">
        <DialogHeader>
          <DialogTitle>Detalle técnico</DialogTitle>
          <DialogDescription>
             {creation?.title}: registro técnico de la generación de este video.
          </DialogDescription>
        </DialogHeader>

        {q.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-md bg-muted" />)}
          </div>
        ) : q.isError ? (
          <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
            <p>{errMsg(q.error)}</p>
            <button onClick={() => q.refetch()} className="mt-2 flex items-center gap-1 font-bold underline">
              <RefreshCw className="h-3 w-3" /> Reintentar
            </button>
          </div>
        ) : m ? (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-2">
            {legacy && (
              <div className="rounded-md bg-amber-100 p-3 text-sm text-amber-900">
                <p className="font-black">Registro histórico limitado</p>
                <p>Este video se creó antes del registro técnico. No se conoce el prompt exacto enviado ni la configuración final.</p>
              </div>
            )}
            {m.limitations.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {m.limitations.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            )}
            {m.recordedAt && <p className="text-xs text-muted-foreground">Registrado: {fmtDate(m.recordedAt)} · versión {m.version}</p>}

            <Block label="Prompt original" text={originalPrompt} empty="No disponible." />
            {!legacy && (
              <Block
                label="Prompt final enviado a Gemini"
                text={finalPrompt}
                empty={gen ? 'La solicitud no contiene partes de texto.' : 'Pendiente: la solicitud de video todavía no se registró.'}
              />
            )}
            {!legacy && (
              m.speechScript === null ? (
                <Block label="Guion hablado" text={null} empty="Todavía no registrado o desconocido." />
              ) : m.speechScript === '' ? (
                <Block label="Guion hablado" text={null} empty="Sin voz: se indicó explícitamente que no hay guion hablado." />
              ) : (
                <Block label="Guion hablado" text={m.speechScript} />
              )
            )}

            {facts.length > 0 && (
              <section>
                <h4 className="mb-1 text-xs font-black uppercase tracking-wide text-muted-foreground">Configuración</h4>
                <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  {facts.map(([k, v]) => (
                    <div key={k} className="rounded-md bg-muted p-2">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="break-words font-mono font-bold">{v === undefined || v === null ? 'no registrado' : String(v)}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-1 text-[11px] text-muted-foreground">{legacy ? 'Solo se muestran valores históricos guardados, no una configuración de envío reconstruida.' : 'La duración se pidió por prompt; no se midió la duración real.'}</p>
              </section>
            )}

            <section className="space-y-2">
              <h4 className="text-xs font-black uppercase tracking-wide text-muted-foreground">Línea de tiempo de solicitudes</h4>
              {m.requests.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  {legacy ? 'No hay solicitudes registradas para este registro histórico.' : 'Aún no hay solicitudes al proveedor registradas.'}
                </p>
              ) : (
                <ol className="space-y-2">{m.requests.map((r, i) => <Request key={i} r={r} />)}</ol>
              )}
            </section>

            <Block label="Marca (instantánea)" text={m.brandSnapshotJson} empty={legacy ? 'No registrada; no se usa la marca actual para reconstruirla.' : 'No registrada.'} />
            <Block label="Posprocesamiento" text={m.postProcessingJson} empty="Sin datos de posprocesamiento." />
            <Block label="Resultado" text={m.resultJson} empty="Sin resultado registrado todavía." />
            <Block label="Entrada original (JSON)" text={m.originalInputJson} />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
