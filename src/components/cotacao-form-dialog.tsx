import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  subtotalDistancia,
  totalPedagios,
  useCotacoes,
  type CotacaoForm,
} from "@/lib/cotacoes-store";
import { calcularDistanciaEntreCeps, buscarCep, type EnderecoCep } from "@/lib/cep";
import { MapaRota } from "@/components/mapa-rota";
import { supabase, type CotacaoComPedagios, type LinhaPracaPedagio } from "@/lib/supabase";
import { formatarBRL, formatarCep, formatarKm, normalizarCep } from "@/lib/utils";

/** Mesma chave usada em `/pedagios`, para compartilhar cache entre as duas telas. */
const CHAVE_CATALOGO_PEDAGIO = ["pracas-pedagio"] as const;

/** Sentinela usado no seletor de praça para "não está no catálogo". */
const PRACA_MANUAL = "__manual__";

async function carregarCatalogoPedagio(): Promise<LinhaPracaPedagio[]> {
  const { data, error } = await supabase
    .from("pracas_pedagio")
    .select("*")
    .order("uf", { ascending: true })
    .order("praca", { ascending: true });
  if (error) throw error;
  return (data ?? []) as LinhaPracaPedagio[];
}

/**
 * Rótulo de uma ponta do trajeto: `Cidade/UF` (ex.: `São Paulo/SP`).
 * Cai no CEP formatado se a API não trouxer cidade/UF.
 */
function rotuloLocalidade(e: EnderecoCep): string {
  return [e.cidade, e.uf].filter(Boolean).join("/") || formatarCep(e.cep);
}

/** Nome do cálculo montado a partir das duas pontas: `Cidade/UF → Cidade/UF`. */
function nomePelasCidades(origem: EnderecoCep, destino: EnderecoCep): string {
  return `${rotuloLocalidade(origem)} → ${rotuloLocalidade(destino)}`;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const cepValido = (rotulo: string) =>
  z
    .string()
    .min(1, `Informe o ${rotulo}`)
    .refine((v) => normalizarCep(v).length === 8, "CEP precisa ter 8 dígitos");

const pedagioSchema = z.object({
  id: z.string().optional(),
  /** ID da praça no catálogo (`pracas_pedagio`); `PRACA_MANUAL` quando digitada à mão. */
  praca_id: z.string().optional(),
  praca: z.string().min(1, "Informe a praça"),
  valor: z
    .number({ invalid_type_error: "Informe um valor" })
    .min(0, "Valor não pode ser negativo"),
});

const schema = z.object({
  // Preenchido automaticamente (cidades dos CEPs) no envio — nunca digitado.
  nome: z.string(),
  cep_origem: cepValido("CEP inicial"),
  cep_destino: cepValido("CEP final"),
  distancia_km: z
    .number({ invalid_type_error: "Calcule ou informe a distância" })
    .positive("A distância precisa ser maior que zero"),
  km_faixa: z
    .number({ invalid_type_error: "Informe os km da faixa" })
    .positive("Os km da faixa precisam ser maiores que zero"),
  valor_faixa: z
    .number({ invalid_type_error: "Informe o valor da faixa" })
    .positive("O valor da faixa precisa ser maior que zero"),
  pedagios: z.array(pedagioSchema),
  // Polilinha [lat, lon] do trajeto (OSRM). Preenchida por "Calcular distância".
  rota: z.array(z.tuple([z.number(), z.number()])),
});

type ValoresForm = z.infer<typeof schema>;

function valoresIniciais(cotacao: CotacaoComPedagios | undefined): ValoresForm {
  if (!cotacao) {
    return {
      nome: "",
      cep_origem: "",
      cep_destino: "",
      distancia_km: 0,
      km_faixa: 0,
      valor_faixa: 0,
      pedagios: [],
      rota: [],
    };
  }
  return {
    nome: cotacao.nome,
    cep_origem: cotacao.cep_origem,
    cep_destino: cotacao.cep_destino,
    distancia_km: cotacao.distancia_km,
    km_faixa: cotacao.km_faixa,
    valor_faixa: cotacao.valor_faixa,
    pedagios: cotacao.pedagios.map((p) => ({
      id: p.id,
      // Pedágio já salvo: abre em modo manual (mostra o texto atual, editável).
      // Escolher uma praça do catálogo no select substitui esse texto.
      praca_id: PRACA_MANUAL,
      praca: p.praca,
      valor: p.valor,
    })),
    rota: cotacao.rota ?? [],
  };
}

// ---------------------------------------------------------------------------
// Hook — toda a lógica do formulário (compartilhado entre o dialog de edição
// e o painel inline de "Novo cálculo").
// ---------------------------------------------------------------------------

interface RotaCalculada {
  origem: string;
  destino: string;
  aproximada: boolean;
  /** true quando o OSRM devolveu uma polilinha de trajeto. */
  temTrajeto: boolean;
  duracaoMin: number;
}

function useFormularioCotacao(
  opcoes: { cotacao?: CotacaoComPedagios; aoSalvar?: () => void } = {},
) {
  const { cotacao, aoSalvar } = opcoes;
  const { cotacoes, criarCotacao, editarCotacao } = useCotacoes();
  const qc = useQueryClient();
  const catalogo = useQuery({
    queryKey: CHAVE_CATALOGO_PEDAGIO,
    queryFn: carregarCatalogoPedagio,
    staleTime: 30_000,
  });
  const [calculando, setCalculando] = useState(false);
  const [rota, setRota] = useState<RotaCalculada | null>(null);

  const form = useForm<ValoresForm>({
    resolver: zodResolver(schema),
    defaultValues: valoresIniciais(cotacao),
  });
  const { control, handleSubmit, reset, setValue, getValues, watch } = form;

  const pedagios = useFieldArray({ control, name: "pedagios" });

  const cepOrigemDig = normalizarCep(watch("cep_origem"));
  const cepDestinoDig = normalizarCep(watch("cep_destino"));

  // Assim que os dois CEPs ficam completos, busca as cidades e já deixa o nome
  // montado (`Cidade/UF → Cidade/UF`) para o momento de salvar. Não é editável.
  useEffect(() => {
    if (cepOrigemDig.length !== 8 || cepDestinoDig.length !== 8) return;

    let cancelado = false;
    Promise.all([buscarCep(cepOrigemDig), buscarCep(cepDestinoDig)])
      .then(([origem, destino]) => {
        if (!cancelado) {
          setValue("nome", nomePelasCidades(origem, destino));
        }
      })
      .catch(() => {
        // CEP inexistente: no envio cai no nome pelo CEP formatado.
        if (!cancelado) setValue("nome", "");
      });

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cepOrigemDig, cepDestinoDig]);

  function restaurar(base: CotacaoComPedagios | undefined = cotacao) {
    reset(valoresIniciais(base));
    setRota(null);
  }

  async function calcularDistancia() {
    const origem = getValues("cep_origem");
    const destino = getValues("cep_destino");
    if (normalizarCep(origem).length !== 8 || normalizarCep(destino).length !== 8) {
      toast.error("Preencha o CEP inicial e o CEP final com 8 dígitos.");
      return;
    }
    try {
      setCalculando(true);
      const r = await calcularDistanciaEntreCeps(origem, destino);
      setValue("distancia_km", r.distanciaKm, {
        shouldValidate: true,
        shouldDirty: true,
      });
      setValue("rota", r.geometria, { shouldDirty: true });
      setRota({
        origem: rotuloLocalidade(r.origem),
        destino: rotuloLocalidade(r.destino),
        aproximada: r.aproximada,
        temTrajeto: r.geometria.length >= 2,
        duracaoMin: r.duracaoMin,
      });
      setValue("nome", nomePelasCidades(r.origem, r.destino), {
        shouldValidate: true,
      });
      toast.success(
        r.geometria.length >= 2
          ? `Trajeto de caminhão: ${formatarKm(r.distanciaKm)} · ~${r.duracaoMin} min`
          : `Distância estimada (sem trajeto): ${formatarKm(r.distanciaKm)}`,
      );
    } catch (erro) {
      toast.error(
        erro instanceof Error ? erro.message : "Não foi possível calcular a distância.",
      );
    } finally {
      setCalculando(false);
    }
  }

  function adicionarPedagio() {
    pedagios.append({ praca_id: "", praca: "", valor: 0 });
  }

  /**
   * Praças escolhidas do catálogo cujo valor foi alterado no formulário: ao
   * salvar, isso atualiza o preço "real" em `pracas_pedagio` (some/fica
   * restrito a admins pela RLS — falha é silenciosa para os demais).
   */
  async function sincronizarCatalogo(pedagiosForm: ValoresForm["pedagios"]) {
    const catalogoAtual = catalogo.data ?? [];
    const alterados = pedagiosForm.filter((p) => {
      if (!p.praca_id || p.praca_id === PRACA_MANUAL) return false;
      const item = catalogoAtual.find((c) => c.id === p.praca_id);
      if (!item) return false;
      const novoValor = Math.round((Number(p.valor) || 0) * 100) / 100;
      return Math.abs(novoValor - item.valor) > 0.001;
    });
    if (alterados.length === 0) return;

    const resultados = await Promise.allSettled(
      alterados.map(async (p) => {
        const { error } = await supabase
          .from("pracas_pedagio")
          .update({
            valor: Math.round((Number(p.valor) || 0) * 100) / 100,
            atualizado_em: new Date().toISOString(),
          })
          .eq("id", p.praca_id as string);
        if (error) throw error;
      }),
    );

    const falhas = resultados.filter((r) => r.status === "rejected").length;
    if (falhas < alterados.length) {
      qc.invalidateQueries({ queryKey: CHAVE_CATALOGO_PEDAGIO });
    }
    if (falhas > 0) {
      toast.warning(
        falhas === alterados.length
          ? "Cálculo salvo, mas o catálogo de pedágios não foi atualizado (só administradores alteram os preços)."
          : `Cálculo salvo. ${falhas} preço(s) não puderam ser atualizados no catálogo.`,
      );
    }
  }

  const submeter = handleSubmit(async (valores) => {
    // No envio, garante um nome: usa o gerado pelas cidades ou cai no CEP.
    const nome =
      valores.nome.trim() ||
      `${formatarCep(valores.cep_origem)} → ${formatarCep(valores.cep_destino)}`;
    const payload: CotacaoForm = {
      ...valores,
      nome,
      pedagios: valores.pedagios.map((p) => ({
        id: p.id,
        praca: p.praca,
        valor: Number(p.valor) || 0,
      })),
    };
    if (cotacao) {
      await editarCotacao(cotacao.id, payload);
    } else {
      await criarCotacao(payload);
      restaurar(undefined); // limpa para o próximo cálculo
    }
    await sincronizarCatalogo(valores.pedagios);
    aoSalvar?.();
  });

  return {
    form,
    pedagios,
    catalogo,
    calculando,
    rota,
    calcularDistancia,
    adicionarPedagio,
    restaurar,
    submeter,
  };
}

type ControleFormulario = ReturnType<typeof useFormularioCotacao>;

// ---------------------------------------------------------------------------
// Campos — o corpo do formulário, sem o <form> nem os botões de ação.
// ---------------------------------------------------------------------------

function CamposCotacao({ ctrl }: { ctrl: ControleFormulario }) {
  const { form, pedagios, catalogo, calculando, rota, calcularDistancia, adicionarPedagio } =
    ctrl;
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = form;

  const distanciaKm = Number(watch("distancia_km")) || 0;
  const kmFaixa = Number(watch("km_faixa")) || 0;
  const valorFaixa = Number(watch("valor_faixa")) || 0;
  const pedagiosAtuais = watch("pedagios");
  const trajeto = watch("rota") ?? [];

  const catalogoPorUf = useMemo(() => {
    const mapa = new Map<string, LinhaPracaPedagio[]>();
    for (const item of catalogo.data ?? []) {
      const lista = mapa.get(item.uf) ?? [];
      lista.push(item);
      mapa.set(item.uf, lista);
    }
    return mapa;
  }, [catalogo.data]);

  function selecionarPraca(i: number, pracaId: string) {
    setValue(`pedagios.${i}.praca_id`, pracaId, { shouldDirty: true });
    if (pracaId === PRACA_MANUAL) {
      setValue(`pedagios.${i}.praca`, "", { shouldDirty: true, shouldValidate: true });
      return;
    }
    const item = catalogo.data?.find((c) => c.id === pracaId);
    if (!item) return;
    setValue(`pedagios.${i}.praca`, `${item.uf} · ${item.praca}`, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(`pedagios.${i}.valor`, item.valor, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  const subtotal = subtotalDistancia({
    distancia_km: distanciaKm,
    km_faixa: kmFaixa,
    valor_faixa: valorFaixa,
  });
  const somaPedagios = totalPedagios({
    pedagios: (pedagiosAtuais ?? []).map((p) => ({ valor: Number(p.valor) || 0 })),
  });

  return (
    <div className="space-y-3.5">
      {/* Nome: preenchido no envio (cidades dos CEPs). Nunca digitado. */}
      <input type="hidden" {...register("nome")} />

      {/* Calculadora de distância */}
      <div className="rounded-xl border border-border bg-background/40 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Distância
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="cep_origem" className="text-xs">
              CEP inicial
            </Label>
            <Input
              id="cep_origem"
              inputMode="numeric"
              placeholder="00000-000"
              {...register("cep_origem")}
            />
            {errors.cep_origem && (
              <p className="text-xs font-medium text-destructive">
                {errors.cep_origem.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="cep_destino" className="text-xs">
              CEP final
            </Label>
            <Input
              id="cep_destino"
              inputMode="numeric"
              placeholder="00000-000"
              {...register("cep_destino")}
            />
            {errors.cep_destino && (
              <p className="text-xs font-medium text-destructive">
                {errors.cep_destino.message}
              </p>
            )}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-end gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={calcularDistancia}
            disabled={calculando}
          >
            {calculando ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MapPin className="size-4" />
            )}
            Calcular distância (km)
          </Button>

          <div className="space-y-1">
            <Label htmlFor="distancia_km" className="text-xs">
              Distância (km)
            </Label>
            <Input
              id="distancia_km"
              type="number"
              step="0.1"
              min="0"
              className="w-32"
              {...register("distancia_km", { valueAsNumber: true })}
            />
          </div>
        </div>

        {rota && (
          <p className="mt-2 text-xs text-muted-foreground">
            {rota.origem} → {rota.destino}
            {rota.temTrajeto && rota.duracaoMin > 0 && ` · ~${rota.duracaoMin} min`}
            {rota.aproximada && " · distância aproximada (sem coordenada exata do CEP)"}
            {!rota.temTrajeto && " · sem trajeto (roteador indisponível)"}
          </p>
        )}
        {errors.distancia_km && (
          <p className="mt-1 text-xs font-medium text-destructive">
            {errors.distancia_km.message}
          </p>
        )}

        {trajeto.length >= 2 && (
          <MapaRota geometria={trajeto} className="mt-3 h-56" />
        )}
      </div>

      {/* Tarifa por distância — "a cada X km, R$ Y" */}
      <div className="rounded-xl border border-border bg-background/40 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Tarifa por distância
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="km_faixa" className="text-xs">
              A cada (km)
            </Label>
            <Input
              id="km_faixa"
              type="number"
              step="1"
              min="0"
              placeholder="50"
              {...register("km_faixa", { valueAsNumber: true })}
            />
            {errors.km_faixa && (
              <p className="text-xs font-medium text-destructive">
                {errors.km_faixa.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="valor_faixa" className="text-xs">
              Valor (R$)
            </Label>
            <Input
              id="valor_faixa"
              type="number"
              step="0.01"
              min="0"
              placeholder="50,00"
              {...register("valor_faixa", { valueAsNumber: true })}
            />
            {errors.valor_faixa && (
              <p className="text-xs font-medium text-destructive">
                {errors.valor_faixa.message}
              </p>
            )}
          </div>
        </div>
        {kmFaixa > 0 && valorFaixa > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            A cada {formatarKm(kmFaixa)}: {formatarBRL(valorFaixa)} ·{" "}
            {formatarBRL(valorFaixa / kmFaixa)} por km
          </p>
        )}
      </div>

      {/* Pedágios (lista aninhada) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Pedágios</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={adicionarPedagio}
          >
            <Plus className="size-4" />
            Adicionar pedágio
          </Button>
        </div>

        {pedagios.fields.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nenhum pedágio adicionado.
          </p>
        )}

        <div className="space-y-1.5">
          {pedagios.fields.map((campo, i) => {
            const pracaIdAtual = pedagiosAtuais?.[i]?.praca_id ?? "";
            const manual = pracaIdAtual === PRACA_MANUAL;
            const itemSelecionado =
              !manual && pracaIdAtual
                ? catalogo.data?.find((c) => c.id === pracaIdAtual)
                : undefined;

            return (
              <div
                key={campo.id}
                className="grid items-start gap-2 rounded-lg border border-border p-2.5 sm:grid-cols-[1fr_8rem_auto]"
              >
                <div className="space-y-1">
                  <Select
                    value={pracaIdAtual || undefined}
                    onValueChange={(v) => selecionarPraca(i, v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a praça">
                        {manual ? "Outro (digitar manualmente)" : itemSelecionado?.praca}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={PRACA_MANUAL}>
                        Outro (digitar manualmente)
                      </SelectItem>
                      {Array.from(catalogoPorUf.entries()).map(([uf, itens]) => (
                        <SelectGroup key={uf}>
                          <SelectLabel>{uf}</SelectLabel>
                          {itens.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.praca} · {formatarBRL(item.valor)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>

                  {manual && (
                    <Input
                      placeholder="Nome da praça / rodovia"
                      {...register(`pedagios.${i}.praca` as const)}
                    />
                  )}

                  {errors.pedagios?.[i]?.praca && (
                    <p className="text-xs font-medium text-destructive">
                      {errors.pedagios[i]?.praca?.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="R$"
                    {...register(`pedagios.${i}.valor` as const, {
                      valueAsNumber: true,
                    })}
                  />
                  {errors.pedagios?.[i]?.valor && (
                    <p className="text-xs font-medium text-destructive">
                      {errors.pedagios[i]?.valor?.message}
                    </p>
                  )}
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => pedagios.remove(i)}
                  aria-label="Remover pedágio"
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Resumo */}
      <div className="rounded-xl border border-border bg-background/40 p-3 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>
            Distância ({formatarKm(distanciaKm)} · a cada {formatarKm(kmFaixa)}{" "}
            {formatarBRL(valorFaixa)})
          </span>
          <span>{formatarBRL(subtotal)}</span>
        </div>
        <div className="mt-1 flex justify-between text-muted-foreground">
          <span>Pedágios ({pedagios.fields.length})</span>
          <span>{formatarBRL(somaPedagios)}</span>
        </div>
        <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold">
          <span>Total estimado</span>
          <span>{formatarBRL(subtotal + somaPedagios)}</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Painel inline "Novo cálculo" — faixa full-bleed logo abaixo do header, com a
// paleta escura do header/sidebar (classe `.panel-escuro`). Sem card: o fundo
// escuro ocupa toda a largura; o conteúdo fica alinhado ao container do `main`.
// ---------------------------------------------------------------------------

export function PainelNovoCalculo() {
  const ctrl = useFormularioCotacao();
  const { submeter, restaurar, form } = ctrl;
  const { isSubmitting } = form.formState;

  return (
    <section className="panel-escuro border-b border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
        <div className="mb-4">
          <h2 className="text-sm font-semibold tracking-tight">
            Novo cálculo de frete
          </h2>
          <p className="mt-0.5 text-xs text-sidebar-foreground/70">
            Informe os CEPs e a tarifa para ver o total na hora. Salve só se
            quiser guardar o cálculo — ele aparece na lista abaixo.
          </p>
        </div>

        <form onSubmit={submeter} className="space-y-4">
          <CamposCotacao ctrl={ctrl} />

          <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => restaurar(undefined)}
              disabled={isSubmitting}
            >
              Limpar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Salvando…" : "Salvar cálculo"}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Dialog de edição de um cálculo já salvo.
// ---------------------------------------------------------------------------

export function EditarCotacaoDialog({
  cotacao,
  children,
}: {
  cotacao: CotacaoComPedagios;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const ctrl = useFormularioCotacao({
    cotacao,
    aoSalvar: () => setAberto(false),
  });
  const { submeter, restaurar, form } = ctrl;
  const { isSubmitting } = form.formState;

  // Reabrir o dialog recarrega os valores (a `cotacao` pode ter mudado enquanto
  // o dialog estava fechado).
  useEffect(() => {
    if (aberto) restaurar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{`Editar “${cotacao.nome}”`}</DialogTitle>
          <DialogDescription>
            Atualize os dados do cálculo e a lista de pedágios.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submeter} className="space-y-4">
          <CamposCotacao ctrl={ctrl} />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAberto(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Salvando…" : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
