import { useEffect, useRef, useState } from 'react';
import { createCreativeVariant, type CreativeVariant, type CreativeVariantInput } from '@workspace/api-client-react';
import { Loader2, Wand2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { errMsg } from '@/lib/studio';

type Phase = 'idle' | 'pending' | 'error' | 'ready';

type Props = {
  title: string;
  prompt: string;
  audience: CreativeVariantInput['audience'];
  kind: CreativeVariantInput['kind'];
  aspectRatio: NonNullable<CreativeVariantInput['aspectRatio']>;
  isAuthenticated: boolean;
  login: () => void;
  onApprove: (v: { title: string; prompt: string }) => void;
};

const btn = 'rounded-md px-4 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50';

export function CreativeVariantButton({ title, prompt, audience, kind, aspectRatio, isAuthenticated, login, onApprove }: Props) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<CreativeVariant | null>(null);
  const [error, setError] = useState('');
  const snapRef = useRef<CreativeVariantInput | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);
  const runRef = useRef(0);

  const valid = title.trim().length > 0 && title.trim().length <= 100 && prompt.trim().length >= 10 && prompt.trim().length <= 4000;

  useEffect(() => () => ctrlRef.current?.abort(), []);

  const run = async () => {
    const snap: CreativeVariantInput = { title: title.trim(), prompt: prompt.trim(), audience, kind, aspectRatio };
    snapRef.current = snap;
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    const id = ++runRef.current;
    setResult(null);
    setError('');
    setPhase('pending');
    setOpen(true);
    try {
      const r = await createCreativeVariant(snap, { signal: ctrl.signal });
      if (id !== runRef.current || ctrl.signal.aborted) return;
      setResult(r);
      setPhase('ready');
    } catch (e) {
      if (id !== runRef.current || ctrl.signal.aborted) return;
      setError(errMsg(e));
      setPhase('error');
    }
  };

  const close = () => {
    runRef.current++;
    ctrlRef.current?.abort();
    setOpen(false);
    setPhase('idle');
    setResult(null);
  };

  const s = snapRef.current;
  const stale =
    !isAuthenticated || (!!s && (s.title !== title.trim() || s.prompt !== prompt.trim() || s.audience !== audience || s.kind !== kind || s.aspectRatio !== aspectRatio));

  const approve = () => {
    if (!result || stale) return;
    onApprove({ title: result.title, prompt: result.prompt });
    close();
  };

  return (
    <>
      <button
        type="button"
        data-testid="button-variant"
        disabled={isAuthenticated && !valid}
        onClick={() => (isAuthenticated ? run() : login())}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-primary py-3 text-sm font-bold text-primary transition hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Wand2 className="h-4 w-4" aria-hidden="true" />
        {isAuthenticated ? 'Proponer variante visual' : 'Ingresá para proponer una variante'}
      </button>
      <p className="-mt-3 text-[11px] text-muted-foreground">
        Mantiene el mensaje y la llamada a la acción; cambia composición, luz, escena y cámara. Solo genera texto y usa la cuota de Google: no crea imagen ni video.
      </p>

      <Dialog open={open} onOpenChange={(o) => !o && close()}>
        <DialogContent className="flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl flex-col gap-4 p-5 sm:p-6" data-testid="dialog-variant">
          <DialogHeader>
            <DialogTitle>Variante visual propuesta</DialogTitle>
            <DialogDescription>
              Revisá la propuesta. Tu título y tu descripción actuales no cambian hasta que apruebes el reemplazo.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1" aria-live="polite" aria-busy={phase === 'pending'}>
            {phase === 'pending' && (
              <div className="space-y-3" data-testid="status-variant-pending">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Generando la variante...
                </div>
                <div className="h-8 animate-pulse rounded bg-muted" />
                <div className="h-32 animate-pulse rounded bg-muted" />
              </div>
            )}
            {phase === 'error' && (
              <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" data-testid="text-variant-error">
                {error}
              </p>
            )}
            {phase === 'ready' && result && (
              <>
                <div>
                  <div className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Título</div>
                  <div className="break-words rounded-md border bg-muted/50 p-3 text-sm font-bold" data-testid="text-variant-title">{result.title}</div>
                </div>
                <div>
                  <div className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Qué querés ver</div>
                  <div className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-md border bg-muted/50 p-3 text-sm" tabIndex={0} role="region" aria-label="Descripción propuesta" data-testid="text-variant-prompt">
                    {result.prompt}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Qué cambió</div>
                  <p className="break-words rounded-md bg-sky-50 p-3 text-sm text-sky-900" data-testid="text-variant-changes">{result.changes}</p>
                </div>
                {stale && (
                  <p role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                    Los datos del formulario cambiaron después de pedir esta variante. Generá una nueva para poder aprobarla.
                  </p>
                )}
              </>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2 sm:space-x-0">
            <button type="button" data-testid="button-variant-cancel" onClick={close} className={`${btn} border`}>
              Cancelar
            </button>
            {(phase === 'error' || (phase === 'ready' && stale)) && (
              <button type="button" data-testid="button-variant-retry" disabled={!valid} onClick={run} className={`${btn} border border-primary text-primary`}>
                {phase === 'error' ? 'Reintentar' : 'Generar de nuevo'}
              </button>
            )}
            {phase === 'ready' && (
              <button type="button" data-testid="button-variant-approve" disabled={stale} onClick={approve} className={`${btn} bg-primary text-white hover:brightness-110`}>
                Aprobar y reemplazar
              </button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
