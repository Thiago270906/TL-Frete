import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CircleDollarSign,
  ListChecks,
  Milestone,
  Receipt,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { useCotacoes, agregacoesDashboard } from "@/lib/cotacoes-store";
import { formatarBRL, formatarKm } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: PaginaDashboard,
});

function CardMetrica({
  titulo,
  valor,
  apoio,
  icone: Icone,
}: {
  titulo: string;
  valor: string;
  apoio?: string;
  icone: typeof ListChecks;
}) {
  return (
    <Link to="/calculadora" search={{}}>
      <Card className="transition-colors hover:border-primary/40">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{titulo}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{valor}</p>
          </div>
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <Icone className="size-4" />
          </div>
        </div>
        <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
          {apoio ?? "Ver na calculadora"} <ArrowRight className="size-3" />
        </p>
      </Card>
    </Link>
  );
}

function PaginaDashboard() {
  const { cotacoes, isLoading } = useCotacoes();
  const ag = agregacoesDashboard(cotacoes);

  return (
    <AppShell titulo="Dashboard" subtitulo="Visão geral dos cálculos de frete">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando dados…</p>
      ) : (
        <>
          {/* Métricas */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <CardMetrica
              titulo="Cotações"
              valor={String(ag.totalCotacoes)}
              icone={ListChecks}
            />
            <CardMetrica
              titulo="Distância total"
              valor={formatarKm(ag.distanciaTotal)}
              icone={Milestone}
            />
            <CardMetrica
              titulo="Valor total"
              valor={formatarBRL(ag.valorTotal)}
              apoio={`Média ${formatarBRL(ag.valorMedio)} por cotação`}
              icone={CircleDollarSign}
            />
            <CardMetrica
              titulo="Total em pedágios"
              valor={formatarBRL(ag.totalEmPedagios)}
              icone={Receipt}
            />
          </div>

          {/* Seção 1 — Valor por cotação */}
          <Card>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold tracking-tight">
                Valor por cotação
              </h2>
              <span className="text-xs text-muted-foreground">
                {ag.valorPorCotacao.length} cotações
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {ag.valorPorCotacao.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhuma cotação registrada ainda.
                </p>
              )}
              {ag.valorPorCotacao.map((item) => (
                <Link
                  key={item.id}
                  to="/calculadora"
                  search={{ destaque: item.id }}
                  className="block"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate">{item.nome}</span>
                    <span className="ml-3 shrink-0 font-medium">
                      {formatarBRL(item.valor)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${item.pct}%` }}
                    />
                  </div>
                </Link>
              ))}
            </div>
          </Card>

          {/* Seção 2 — Cotações recentes */}
          <Card>
            <h2 className="text-base font-semibold tracking-tight">
              Cotações recentes
            </h2>
            <div className="mt-4 divide-y divide-border">
              {ag.recentes.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhuma cotação registrada ainda.
                </p>
              )}
              {ag.recentes.map((c) => (
                <Link
                  key={c.id}
                  to="/calculadora"
                  search={{ destaque: c.id }}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{c.nome}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatarKm(c.distancia_km)} · {c.pedagios} pedágio
                      {c.pedagios === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-medium">
                    {formatarBRL(c.total)}
                  </span>
                </Link>
              ))}
            </div>
          </Card>
        </>
      )}
    </AppShell>
  );
}
