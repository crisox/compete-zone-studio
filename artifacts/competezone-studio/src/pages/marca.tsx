import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@workspace/replit-auth-web';
import { getGetBrandQueryKey, useGetBrand, useUpdateBrand } from '@workspace/api-client-react';
import { Loader2, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ErrorState, LoginNudge, PageHead } from '@/components/shell';
import { errMsg, storageUrl, useUploadFile } from '@/lib/studio';

const field = 'w-full rounded-md border border-input bg-card px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/30 disabled:opacity-60';
const lbl = 'mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground';

export default function Marca() {
  const { isAuthenticated, login } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { upload } = useUploadFile();
  const fileRef = useRef<HTMLInputElement>(null);
  const brand = useGetBrand({ query: { queryKey: getGetBrandQueryKey() } });
  const update = useUpdateBrand();

  const [tagline, setTagline] = useState('');
  const [website, setWebsite] = useState('');
  const [tone, setTone] = useState('');
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inited = useRef(false);

  const b = brand.data;
  useEffect(() => {
    if (b && !inited.current) {
      inited.current = true;
      setTagline(b.tagline);
      setWebsite(b.website);
      setTone(b.tone);
      setLogoPath(b.logoPath ?? null);
    }
  }, [b]);

  const onLogo = async (f: File | undefined) => {
    if (!f) return;
    setUploading(true);
    try {
      setLogoPath(await upload(f));
      toast({ title: 'Logo cargado', description: 'Guardá los cambios para aplicarlo.' });
    } catch (e) {
      toast({ title: 'No se subió el logo', description: errMsg(e), variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = () =>
    update.mutate(
      { data: { tagline, website, tone, logoPath } },
      {
        onSuccess: (nb) => {
          qc.setQueryData(getGetBrandQueryKey(), nb);
          qc.invalidateQueries({ queryKey: getGetBrandQueryKey() });
          toast({ title: 'Marca guardada' });
        },
        onError: (e) => toast({ title: 'No se pudo guardar', description: errMsg(e), variant: 'destructive' }),
      },
    );

  const logoSrc = logoPath ? storageUrl(logoPath) : null;

  return (
    <div>
      <PageHead kicker="Identidad" title="Marca" />
      {!isAuthenticated && <div className="mb-6"><LoginNudge text="Podés mirar los valores por defecto. Para editar y subir el logo, ingresá." /></div>}
      {brand.isLoading ? (
        <div className="h-72 animate-pulse rounded-xl bg-muted" />
      ) : brand.isError || !b ? (
        <ErrorState message={errMsg(brand.error)} onRetry={() => brand.refetch()} />
      ) : (
        <div className="grid gap-6 md:grid-cols-[1fr_320px]">
          <div className="cz-rise space-y-5 rounded-xl border bg-card p-5 md:p-6">
            <div>
              <span className={lbl}>Nombre</span>
              <div className="text-2xl font-black" data-testid="text-brand-name">{b.name}</div>
              <p className="text-xs text-muted-foreground">En audio se pronuncia "Compit Zone".</p>
            </div>
            <div>
              <label className={lbl} htmlFor="tagline">Frase</label>
              <input id="tagline" data-testid="input-tagline" className={field} maxLength={200} disabled={!isAuthenticated} value={tagline} onChange={(e) => setTagline(e.target.value)} />
            </div>
            <div>
              <label className={lbl} htmlFor="website">Sitio web</label>
              <input id="website" data-testid="input-website" className={field} maxLength={200} disabled={!isAuthenticated} value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>
            <div>
              <label className={lbl} htmlFor="tone">Tono de voz</label>
              <textarea id="tone" data-testid="input-tone" rows={4} className={field} maxLength={1000} disabled={!isAuthenticated} value={tone} onChange={(e) => setTone(e.target.value)} />
            </div>
            <button onClick={() => (isAuthenticated ? save() : login())} disabled={isAuthenticated && (update.isPending || uploading)} data-testid="button-save-brand" className="flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-extrabold uppercase tracking-wider text-white hover:brightness-110 disabled:opacity-50">
              {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isAuthenticated ? 'Guardar marca' : 'Ingresá para editar'}
            </button>
          </div>

          <div className="space-y-4">
            <div className="cz-rise rounded-xl border bg-card p-5" style={{ animationDelay: '.08s' }}>
              <span className={lbl}>Logo oficial</span>
              <div className="grid aspect-video place-items-center overflow-hidden rounded-lg border-2 border-dashed bg-muted p-3">
                {logoSrc ? (
                  <img src={logoSrc} alt="Logo oficial" className="max-h-full max-w-full object-contain" data-testid="img-logo" />
                ) : b.logoUrl && !logoPath ? (
                  <img src={b.logoUrl} alt="Logo oficial" className="max-h-full max-w-full object-contain" />
                ) : (
                  <p className="text-center text-xs text-muted-foreground">Sin logo. Subí el archivo oficial: nunca generamos uno.</p>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => (isAuthenticated ? fileRef.current?.click() : login())} disabled={uploading} data-testid="button-upload-logo" className="flex flex-1 items-center justify-center gap-2 rounded-md bg-sidebar px-3 py-2.5 text-sm font-bold text-white disabled:opacity-60">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Subir logo
                </button>
                {logoPath && isAuthenticated && (
                  <button onClick={() => setLogoPath(null)} data-testid="button-remove-logo" className="rounded-md px-3 text-sm font-semibold text-destructive hover:bg-destructive/10">Quitar</button>
                )}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">PNG, JPEG o WEBP, hasta 5 MB.</p>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} data-testid="input-logo" />
            </div>
            <div className="cz-rise rounded-xl border bg-card p-5" style={{ animationDelay: '.16s' }}>
              <span className={lbl}>Paleta</span>
              <div className="grid grid-cols-3 gap-2">
                {b.colors.map((c) => (
                  <div key={c} className="overflow-hidden rounded-lg border">
                    <div className="h-12" style={{ background: c }} />
                    <div className="px-2 py-1 text-center font-mono text-[11px]">{c}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
