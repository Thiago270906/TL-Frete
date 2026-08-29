import { useEffect, type ReactNode } from "react";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/lib/auth-store";
import { CotacoesProvider } from "@/lib/cotacoes-store";
import { Toaster } from "@/components/ui/sonner";
import type { ContextoRouter } from "@/router";
import appCss from "@/styles/app.css?url";

export const Route = createRootRouteWithContext<ContextoRouter>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "TL Frete — cálculo de fretes" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: ComponenteRaiz,
});

/**
 * Portão de autenticação. Roda como efeito (nunca durante o render) para não
 * disparar navegação no meio da renderização.
 * - sem sessão e fora de /login  -> manda para /login
 * - com sessão e em /login       -> manda para /
 * Enquanto o estado de auth carrega, mostra "Carregando…".
 */
function AuthGate({ children }: { children: ReactNode }) {
  const { session, isLoading } = useAuth();
  const navigate = useNavigate();
  const rota = useRouterState({ select: (s) => s.location.pathname });
  const emLogin = rota === "/login";

  useEffect(() => {
    if (isLoading) return;
    if (!session && !emLogin) {
      navigate({ to: "/login" });
    } else if (session && emLogin) {
      navigate({ to: "/" });
    }
  }, [session, isLoading, emLogin, navigate]);

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  // Evita piscar a tela protegida por um instante antes do redirect do efeito.
  if (!session && !emLogin) return null;
  if (session && emLogin) return null;

  return <>{children}</>;
}

function ComponenteRaiz() {
  return (
    <DocumentoHtml>
      {/*
        ORDEM DOS PROVIDERS (não trocar):
        1. QueryClientProvider — precisa envolver tudo que usa React Query,
           inclusive o AuthProvider (que lê profile) e o CotacoesProvider.
        2. AuthProvider — expõe sessão/perfil; o CotacoesProvider depende dele
           (`enabled: !!session`).
        3. CotacoesProvider — store de domínio; só faz sentido com auth pronta.
        4. AuthGate — decide render/redirect DEPOIS que os providers existem,
           para poder ler o estado de auth.
      */}
      <QueryClientProvider client={Route.useRouteContext().queryClient}>
        <AuthProvider>
          <CotacoesProvider>
            <AuthGate>
              <Outlet />
            </AuthGate>
          </CotacoesProvider>
        </AuthProvider>
      </QueryClientProvider>
      <Toaster />
    </DocumentoHtml>
  );
}

function DocumentoHtml({ children }: { children: ReactNode }) {
  return (
    // Tema claro FIXO: a classe `dark` fica sempre no <html>, mas `:root` e
    // `.dark` carregam a mesma paleta clara (ver src/styles/app.css).
    <html lang="pt-BR" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="bg-background text-foreground antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
