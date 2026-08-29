import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmarExclusao } from "@/components/confirmar-exclusao";
import {
  EditarCotacaoDialog,
  PainelNovoCalculo,
} from "@/components/cotacao-form-dialog";
import {
  subtotalDistancia,
  totalCotacao,
  totalPedagios,
  useCotacoes,
} from "@/lib/cotacoes-store";
import { validarFiltrosCalculadora } from "@/lib/filtros-calculadora";
import { formatarBRL, formatarCep, formatarKm } from "@/lib/utils";
import type { CotacaoComPedagios } from "@/lib/supabase";

export const Route = createFileRoute("/calculadora")({
  validateSearch: validarFiltrosCalculadora,
  component: PaginaCalculadora,
});

/** Descrição curta da tarifa: "a cada 50 km · R$ 50,00". */
function descricaoTarifa(c: CotacaoComPedagios): string {
  if (!c.km_faixa || !c.valor_faixa) return "tarifa não definida";
  return `a cada ${formatarKm(c.km_faixa)} · ${formatarBRL(c.valor_faixa)}`;
}

function PaginaCalculadora() {
  const { destaque } = Route.useSearch();
  const { cotacoes, isLoading, excluirCotacao } = useCotacoes();

  return (
    <AppShell
      titulo="Calculadora"
      subtitulo="Registros de cálculo de frete"
      faixaTopo={<PainelNovoCalculo />}
    >
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Cálculos salvos
        </h2>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando cotações…</p>
        ) : cotacoes.length === 0 ? (
          <Card>
            <p className="text-sm text-muted-foreground">
              Nenhum cálculo salvo ainda. Faça um cálculo acima e clique em
              “Salvar cálculo”.
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {cotacoes.map((c) => (
              <CartaoCotacao
                key={c.id}
                cotacao={c}
                destacada={destaque === c.id}
                aoExcluir={() => excluirCotacao(c.id)}
              />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function CartaoCotacao({
  cotacao,
  destacada,
  aoExcluir,
}: {
  cotacao: CotacaoComPedagios;
  destacada: boolean;
  aoExcluir: () => void | Promise<void>;
}) {
  const subtotal = subtotalDistancia(cotacao);
  const pedagios = totalPedagios(cotacao);

  return (
    <Card
      className={
        destacada ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold tracking-tight">{cotacao.nome}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatarCep(cotacao.cep_origem)} → {formatarCep(cotacao.cep_destino)} ·{" "}
            {formatarKm(cotacao.distancia_km)} · {descricaoTarifa(cotacao)}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <EditarCotacaoDialog cotacao={cotacao}>
            <Button variant="outline" size="sm">
              <Pencil className="size-3.5" />
              Editar
            </Button>
          </EditarCotacaoDialog>
          <ConfirmarExclusao
            nome={cotacao.nome}
            dependentes={{
              rotuloSingular: "pedágio",
              rotuloPlural: "pedágios",
              quantidade: cotacao.pedagios.length,
            }}
            aoConfirmar={aoExcluir}
          >
            <Button
              variant="destructive"
              size="sm"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="size-3.5" />
              Excluir
            </Button>
          </ConfirmarExclusao>
        </div>
      </div>

      {/* Valores */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <ResumoValor rotulo={`Distância (${descricaoTarifa(cotacao)})`} valor={subtotal} />
        <ResumoValor rotulo={`Pedágios (${cotacao.pedagios.length})`} valor={pedagios} />
        <ResumoValor rotulo="Total" valor={totalCotacao(cotacao)} destaque />
      </div>

      {/* Lista de pedágios (apenas registro) */}
      {cotacao.pedagios.length > 0 && (
        <ul className="mt-4 space-y-2">
          {cotacao.pedagios.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate">{p.praca}</span>
              <span className="shrink-0 font-medium">{formatarBRL(p.valor)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ResumoValor({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: number;
  destaque?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p
        className={
          "mt-0.5 font-semibold tracking-tight " + (destaque ? "text-primary" : "")
        }
      >
        {formatarBRL(valor)}
      </p>
    </div>
  );
}
