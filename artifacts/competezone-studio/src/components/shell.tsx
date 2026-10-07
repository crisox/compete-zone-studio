import { useEffect, useRef, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@workspace/replit-auth-web';
import {
  getGetBrandQueryKey,
  getGetStudioSummaryQueryKey,
  getGetTemplatesQueryKey,
  getListCreationsQueryKey,
  getListTemplateIdeasQueryKey,
  useGetStudioSummary,
} from '@workspace/api-client-react';
import { Clapperboard, FolderOpen, Lightbulb, LayoutTemplate, LogIn, LogOut, Palette, Settings2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/', label: 'Crear', icon: Sparkles },
  { href: '/biblioteca', label: 'Biblioteca', icon: FolderOpen },
  { href: '/plantillas', label: 'Plantillas', icon: LayoutTemplate },
  { href: '/ideas-ia', label: 'Ideas IA', icon: Lightbulb },
  { href: '/marca', label: 'Marca', icon: Palette },
  { href: '/ajustes', label: 'Ajustes', icon: Settings2 },
];

export function useAuthCacheSync() {
  const { isAuthenticated, isLoading } = useAuth();
  const qc = useQueryClient();
  const prev = useRef<boolean | null>(null);
  useEffect(() => {
    if (isLoading) return;
    if (prev.current !== null && prev.current !== isAuthenticated) {
      qc.removeQueries({ queryKey: getListTemplateIdeasQueryKey() });
      qc.invalidateQueries({ queryKey: getGetTemplatesQueryKey() });
      qc.removeQueries({ queryKey: getListCreationsQueryKey() });
      qc.removeQueries({ queryKey: getGetStudioSummaryQueryKey() });
      qc.invalidateQueries({ queryKey: getGetBrandQueryKey() });
    }
    prev.current = isAuthenticated;
  }, [isAuthenticated, isLoading, qc]);
}

export function Wordmark({ dark = true }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground">
        <Clapperboard className="h-[18px] w-[18px]" />
        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-sm bg-accent" />
      </div>
      <div className="leading-none">
        <div className={cn('text-[15px] font-extrabold tracking-tight', dark ? 'text-white' : 'text-foreground')}>
          CompeteZone
        </div>
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-400">Studio</div>
      </div>
    </div>
  );
}

function AuthBlock() {
  const { user, isAuthenticated, isLoading, login, logout } = useAuth();
  if (isLoading) return <div className="h-12 animate-pulse rounded-md bg-white/5" />;
  if (!isAuthenticated)
    return (
      <button
        data-testid="button-login"
        onClick={login}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2.5 text-sm font-bold text-[#0F172A] transition hover:brightness-95"
      >
        <LogIn className="h-4 w-4" /> Ingresar
      </button>
    );
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'Tu cuenta';
  return (
    <div className="flex items-center gap-2.5 rounded-md bg-white/5 p-2">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-white">
        {name.slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1 truncate text-sm font-medium text-white" data-testid="text-username">
        {name}
      </div>
      <button
        data-testid="button-logout"
        onClick={logout}
        title="Salir"
        className="rounded p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}

function SummaryMini() {
  const { isAuthenticated } = useAuth();
  const { data } = useGetStudioSummary({
    query: { enabled: isAuthenticated, queryKey: getGetStudioSummaryQueryKey() },
  });
  if (!isAuthenticated) return null;
  const items = [
    ['Imágenes', data?.images],
    ['Videos', data?.videos],
    ['En curso', data?.generating],
  ] as const;
  return (
    <div className="grid grid-cols-3 gap-1 rounded-md border border-white/10 p-2" data-testid="summary-mini">
      {items.map(([l, v]) => (
        <div key={l} className="text-center">
          <div className="text-lg font-extrabold tabular-nums text-white">{v ?? '–'}</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">{l}</div>
        </div>
      ))}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  useAuthCacheSync();
  const active = (href: string) => (href === '/' ? loc === '/' : loc.startsWith(href));
  return (
    <div className="min-h-[100dvh] md:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-6 bg-sidebar p-5 md:flex">
        <Link href="/" data-testid="link-home">
          <Wordmark />
        </Link>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              data-testid={`link-nav-${n.label.toLowerCase()}`}
              className={cn(
                'group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition',
                active(n.href)
                  ? 'bg-primary text-white'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white',
              )}
            >
              <n.icon className="h-4 w-4" />
              {n.label}
              {active(n.href) && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-3">
          <SummaryMini />
          <p className="px-1 text-xs font-semibold text-sky-300/80">Menos vueltas. Más competencia.</p>
          <AuthBlock />
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between bg-sidebar px-4 py-3 md:hidden">
        <Wordmark />
        <div className="w-36">
          <AuthBlock />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:px-8 md:pb-16 md:pt-10">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-white/10 bg-sidebar md:hidden">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            data-testid={`link-tab-${n.label.toLowerCase()}`}
            className={cn(
              'flex min-w-0 flex-col items-center gap-1 px-0.5 py-2.5 text-[10px] font-semibold',
              active(n.href) ? 'text-accent' : 'text-slate-400',
            )}
          >
            <n.icon className="h-5 w-5" />
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function PageHead({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <div className="cz-rise mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
          <span className="h-[3px] w-6 bg-accent" /> {kicker}
        </div>
        <h1 className="text-3xl font-black tracking-tight md:text-4xl">{title}</h1>
      </div>
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="cz-stripe relative overflow-hidden rounded-xl bg-sidebar px-6 py-14 text-center text-white">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-accent text-[#0F172A]">
        <Clapperboard className="h-5 w-5" />
      </div>
      <h3 className="text-xl font-extrabold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-300">{body}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center" data-testid="state-error">
      <h3 className="font-bold text-destructive">No pudimos cargar esto</h3>
      <p className="mt-1 text-sm text-muted-foreground">{message ?? 'Revisá tu conexión y reintentá.'}</p>
      <button
        onClick={onRetry}
        data-testid="button-retry"
        className="mt-4 rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background"
      >
        Reintentar
      </button>
    </div>
  );
}

export function LoginNudge({ text }: { text: string }) {
  const { login } = useAuth();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
      <p className="text-sm font-medium">{text}</p>
      <button
        onClick={login}
        data-testid="button-login-nudge"
        className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-white hover:brightness-110"
      >
        Ingresar
      </button>
    </div>
  );
}
