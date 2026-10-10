import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useRequestUploadUrl, type UploadUrlRequest } from '@workspace/api-client-react';

export const AUDIENCE_LABEL: Record<string, string> = {
  organizers: 'Organizadores',
  athletes: 'Deportistas',
};
export const KIND_LABEL: Record<string, string> = { image: 'Imagen', video: 'Video' };
export const STATUS_LABEL: Record<string, string> = {
  generating: 'Generando',
  completed: 'Listo',
  failed: 'Falló',
};
export const PREFILL_KEY = 'cz-prefill';
export const MAX_BYTES = 5 * 1024 * 1024;
export const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];

export function errMsg(e: unknown): string {
  const anyE = e as { data?: { error?: string; message?: string }; message?: string } | null;
  return anyE?.data?.error ?? anyE?.data?.message ?? anyE?.message ?? 'Algo salió mal. Probá de nuevo.';
}

export function fmtDate(iso: string) {
  try {
    return format(new Date(iso), "d 'de' MMM, HH:mm", { locale: es });
  } catch {
    return iso;
  }
}

export function storageUrl(objectPath?: string | null) {
  return objectPath ? '/api/storage' + objectPath : null;
}

export function validateImage(file: File): string | null {
  if (!ALLOWED.includes(file.type)) return `"${file.name}": solo PNG, JPEG o WEBP.`;
  if (file.size > MAX_BYTES) return `"${file.name}": pesa más de 5 MB.`;
  return null;
}

export function useUploadFile() {
  const req = useRequestUploadUrl();
  const upload = async (file: File): Promise<string> => {
    const bad = validateImage(file);
    if (bad) throw new Error(bad);
    const r = await req.mutateAsync({
      data: { name: file.name, size: file.size, contentType: file.type as UploadUrlRequest['contentType'] },
    });
    const put = await fetch(r.uploadURL, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
    if (!put.ok) throw new Error('No se pudo subir el archivo. Probá de nuevo.');
    return r.objectPath;
  };
  return { upload };
}
