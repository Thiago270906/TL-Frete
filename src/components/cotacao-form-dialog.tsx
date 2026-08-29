import { useEffect, useState, type ReactNode } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
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
  subtotalDistancia,
  totalPedagios,
  useCotacoes,
  type CotacaoForm,
} from "@/lib/cotacoes-store";
import { calcularDistanciaEntreCeps, buscarCep, type EnderecoCep } from "@/lib/cep";
import type { CotacaoComPedagios } from "@/lib/supabase";
import { formatarBRL, formatarCep, formatarKm, normalizarCep } from "@/lib/utils";

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
      praca: p.praca,
      valor: p.valor,
    })),
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
}

function useFormularioCotacao(
  opcoes: { cotacao?: CotacaoComPedagios; aoSalvar?: () => void } = {},
) {
  const { cotacao, aoSalvar } = opcoes;
  const { cotacoes, criarCotacao, editarCotacao } = useCotacoes();
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
      setRota({
        origem: rotuloLocalidade(r.origem),
        destino: rotuloLocalidade(r.destino),
        aproximada: r.aproximada,
      });
      setValue("nome", nomePelasCidades(r.origem, r.destino), {
        shouldValidate: true,
      });
      toast.success(`Distância estimada: ${formatarKm(r.distanciaKm)}`);
    } catch (erro) {
      toast.error(
        erro instanceof Error ? erro.message : "Não foi possível calcular a distância.",
      );
    } finally {
      setCalculando(false);
    }
  }

  function adicionarPedagio() {
    pedagios.append({ praca: "", valor: 0 });
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
    aoSalvar?.();
  });

  return {
    form,
    pedagios,
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
  const { form, pedagios, calculando, rota, calcularDistancia, adicionarPedagio } =
    ctrl;
  const {
    register,
    watch,
    formState: { errors },
  } = form;

  const distanciaKm = Number(watch("distancia_km")) || 0;
  const kmFaixa = Number(watch("km_faixa")) || 0;
  const valorFaixa = Number(watch("valor_faixa")) || 0;
  const pedagiosAtuais = watch("pedagios");

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
            {rota.aproximada && " · distância aproximada (sem coordenada exata do CEP)"}
          </p>
        )}
        {errors.distancia_km && (
          <p className="mt-1 text-xs font-medium text-destructive">
            {errors.distancia_km.message}
          </p>
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
            return (
              <div
                key={campo.id}
                className="grid items-start gap-2 rounded-lg border border-border p-2.5 sm:grid-cols-[1fr_8rem_auto]"
              >
                <div className="space-y-1">
                  <Input
                    placeholder="Praça / rodovia"
                    {...register(`pedagios.${i}.praca` as const)}
                  />
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
