import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Calculator,
  LogOut,
  Menu,
  Receipt,
  Users,
  X,
} from "lucide-react";
import { cn, iniciais } from "@/lib/utils";
import { useAuth } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";

interface ItemNav {
  rotulo: string;
  para: string;
  icone: typeof Calculator;
  soAdmin?: boolean;
}

const NAV: ItemNav[] = [
  { rotulo: "Calculadora", para: "/calculadora", icone: Calculator },
  { rotulo: "Pedágios", para: "/pedagios", icone: Receipt, soAdmin: true },
  { rotulo: "Equipe", para: "/equipe", icone: Users, soAdmin: true },
];

function LinksNav({
  isAdmin,
  aoNavegar,
}: {
  isAdmin: boolean;
  aoNavegar?: () => void;
}) {
  const principais = NAV.filter((i) => !i.soAdmin);
  const admin = NAV.filter((i) => i.soAdmin);

  const classe =
    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-primary/10 hover:text-sidebar-foreground data-[status=active]:bg-sidebar-primary/15 data-[status=active]:text-sidebar-primary";

  return (
    <nav className="flex flex-1 flex-col gap-1">
      {principais.map((item) => (
        <Link
          key={item.para}
          to={item.para}
          onClick={aoNavegar}
          activeOptions={{ exact: item.para === "/" }}
          className={classe}
        >
          <item.icone className="size-4 shrink-0" />
          {item.rotulo}
        </Link>
      ))}

      {isAdmin && admin.length > 0 && (
        <>
          <p className="mt-5 px-3 pb-1 text-xs uppercase tracking-wider text-sidebar-foreground/50">
            Administração
          </p>
          {admin.map((item) => (
            <Link
              key={item.para}
              to={item.para}
              onClick={aoNavegar}
              className={classe}
            >
              <item.icone className="size-4 shrink-0" />
              {item.rotulo}
            </Link>
          ))}
        </>
      )}
    </nav>
  );
}

function Marca() {
  return (
    <div className="flex items-center gap-3 px-1">
      <img src="/logo-branca.png" alt="TL Frete" className="h-6 w-auto" />
      <div className="h-8 w-px bg-sidebar-foreground/20" />
      <div className="leading-tight">
        <p className="text-sm font-semibold tracking-tight text-sidebar-foreground">TL Frete</p>
        <p className="text-xs text-sidebar-foreground/70">Cálculo de fretes</p>
      </div>
    </div>
  );
}

export function AppShell({
  titulo,
  subtitulo,
  acao,
  faixaTopo,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  acao?: ReactNode;
  /** Faixa full-bleed logo abaixo do header (sem o container do `main`). */
  faixaTopo?: ReactNode;
  children: ReactNode;
}) {
  const { profile, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const [menuAberto, setMenuAberto] = useState(false);

  async function sair() {
    await signOut();
    navigate({ to: "/login" });
  }

  const nomeUsuario = profile?.nome ?? profile?.email ?? "Usuário";

  return (
    <div className="min-h-svh bg-background">
      {/* Sidebar fixa (lg+) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar p-4 lg:flex">
        <Marca />
        <div className="mt-6 flex flex-1 flex-col">
          <LinksNav isAdmin={isAdmin} />
          <Button variant="ghost" className="mt-2 justify-start text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground" onClick={sair}>
            <LogOut className="size-4" />
            Sair
          </Button>
        </div>
      </aside>

      {/* Drawer mobile */}
      {menuAberto && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Fechar menu"
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setMenuAberto(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-sidebar-border bg-sidebar p-4">
            <div className="flex items-center justify-between">
              <Marca />
              <Button
                variant="ghost"
                size="icon"
                className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                onClick={() => setMenuAberto(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
            <div className="mt-6 flex flex-1 flex-col">
              <LinksNav
                isAdmin={isAdmin}
                aoNavegar={() => setMenuAberto(false)}
              />
              <Button
                variant="ghost"
                className="mt-2 justify-start text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                onClick={sair}
              >
                <LogOut className="size-4" />
                Sair
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Área principal */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-sidebar-border bg-sidebar/95 text-sidebar-foreground backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <Button
              variant="ghost"
              size="icon"
              className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground lg:hidden"
              onClick={() => setMenuAberto(true)}
            >
              <Menu className="size-4" />
            </Button>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold tracking-tight">
                {titulo}
              </h1>
              {subtitulo && (
                <p className="truncate text-xs text-sidebar-foreground/70">
                  {subtitulo}
                </p>
              )}
            </div>

            {acao}

            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
              title={nomeUsuario}
            >
              {iniciais(nomeUsuario)}
            </div>
          </div>
        </header>

        {faixaTopo}

        <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
