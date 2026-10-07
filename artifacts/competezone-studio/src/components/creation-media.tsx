import type { Creation } from '@workspace/api-client-react';
import { AlertTriangle, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STATUS_LABEL } from '@/lib/studio';

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      data-testid={`status-${status}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider',
        status === 'completed' && 'bg-accent text-[#0F172A]',
        status === 'generating' && 'bg-sky-100 text-sky-800',
        status === 'failed' && 'bg-destructive/10 text-destructive',
      )}
    >
      {status === 'generating' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-600" />}
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function CreationMedia({ c, className }: { c: Creation; className?: string }) {
  const ratio = c.aspectRatio.replace(':', ' / ');
  return (
    <div
      className={cn('relative mx-auto w-full overflow-hidden rounded-lg bg-sidebar', className)}
      style={{ aspectRatio: ratio, maxHeight: '70vh' }}
    >
      {c.status === 'completed' && c.mediaUrl ? (
        c.kind === 'video' ? (
          <video src={c.mediaUrl} controls playsInline className="h-full w-full object-contain" data-testid={`video-${c.id}`} />
        ) : (
          <img src={c.mediaUrl} alt={c.title} className="h-full w-full object-cover" data-testid={`img-${c.id}`} />
        )
      ) : c.status === 'failed' ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-white">
          <AlertTriangle className="h-6 w-6 text-amber-400" />
          <p className="text-xs font-semibold">No se pudo generar</p>
        </div>
      ) : (
        <div className="cz-sweep cz-stripe relative flex h-full flex-col items-center justify-center gap-2 overflow-hidden text-white">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent" />
          <p className="text-xs font-semibold">Generando {c.kind === 'video' ? 'video' : 'imagen'}...</p>
        </div>
      )}
    </div>
  );
}

export function DownloadLink({ c }: { c: Creation }) {
  if (!c.mediaUrl) return null;
  return (
    <a
      href={`${c.mediaUrl}?download=1`}
      download={`${c.title}.${c.kind === 'video' ? 'mp4' : 'png'}`}
      data-testid={`button-download-${c.id}`}
      className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-bold text-white hover:brightness-110"
    >
      <Download className="h-4 w-4" /> Descargar
    </a>
  );
}
