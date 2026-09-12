import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmarExclusao } from "@/components/confirmar-exclusao";
import { useAuth } from "@/lib/auth-store";
import { supabase, type LinhaPracaPedagio } from "@/lib/supabase";
import { formatarBRL, formatarDataHora } from "@/lib/utils";

export const Route = createFileRoute("/pedagios")({
  component: PaginaPedagios,
});

const CHAVE_PRACAS = ["pracas-pedagio"] as const;

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE",
  "TO",
] as const;

const TODOS_ESTADOS = "todos";

function PaginaPedagios() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [ufFiltro, setUfFiltro] = useState<string>(TODOS_ESTADOS);

  const consulta = useQuery({
    queryKey: CHAVE_PRACAS,
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pracas_pedagio")
        .select("*")
        .order("uf", { ascending: true })
        .order("praca", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LinhaPracaPedagio[];
    },
  });

  const mutExcluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pracas_pedagio").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Praça removida.");
      qc.invalidateQueries({ queryKey: CHAVE_PRACAS });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível remover."),
  });

  const revalidar = () => qc.invalidateQueries({ queryKey: CHAVE_PRACAS });

  if (!isAdmin) {
    return (
      <AppShell titulo="Pedágios" subtitulo="Cadastro de praças">
        <Card>
          <p className="text-sm text-muted-foreground">
            Acesso restrito a administradores.
          </p>
        </Card>
      </AppShell>
    );
  }

  const pracas = consulta.data ?? [];

  const ufsDisponiveis = Array.from(new Set(pracas.map((p) => p.uf))).sort();

  const termo = busca.trim().toLowerCase();
  const pracasFiltradas = pracas.filter((p) => {
    const passaUf = ufFiltro === TODOS_ESTADOS || p.uf === ufFiltro;
    const passaBusca =
      termo.length === 0 ||
      p.praca.toLowerCase().includes(termo) ||
      p.uf.toLowerCase().includes(termo);
    return passaUf && passaBusca;
  });

  return (
    <AppShell
      titulo="Pedágios"
      subtitulo="Cadastro de praças de pedágio"
      acao={
        <PracaFormDialog aoSalvar={revalidar}>
          <Button size="sm">
            <Plus className="size-4" />
            Nova praça
          </Button>
        </PracaFormDialog>
      }
    >
      {!consulta.isLoading && pracas.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por praça, rodovia ou local…"
              className="pl-8"
            />
          </div>

          <Select value={ufFiltro} onValueChange={setUfFiltro}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS_ESTADOS}>Todos os estados</SelectItem>
              {ufsDisponiveis.map((uf) => (
                <SelectItem key={uf} value={uf}>
                  {uf}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {consulta.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando praças…</p>
      ) : pracas.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            Nenhuma praça cadastrada. Clique em “Nova praça”.
          </p>
        </Card>
      ) : pracasFiltradas.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            Nenhuma praça encontrada para esse filtro.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {pracasFiltradas.map((p) => (
            <Card key={p.id} className="flex flex-wrap items-center gap-4">
              <Badge variant="secondary" className="shrink-0">
                {p.uf}
              </Badge>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.praca}</p>
                <p className="truncate text-xs text-muted-foreground">
                  Atualizado em {formatarDataHora(p.atualizado_em)}
                </p>
              </div>

              <span className="shrink-0 text-sm font-semibold tracking-tight">
                {formatarBRL(p.valor)}
              </span>

              <div className="flex items-center gap-1">
                <PracaFormDialog praca={p} aoSalvar={revalidar}>
                  <Button variant="outline" size="sm">
                    <Pencil className="size-3.5" />
                    Editar
                  </Button>
                </PracaFormDialog>
                <ConfirmarExclusao
                  nome={`${p.praca} (${p.uf})`}
                  aoConfirmar={() => mutExcluir.mutateAsync(p.id)}
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
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Catálogo de referência. Cada praça guarda a data em que foi atualizada
        pela última vez.
      </p>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Formulário (criar / editar)
// ---------------------------------------------------------------------------

const schema = z.object({
  uf: z.string().length(2, "Selecione o estado"),
  praca: z.string().min(2, "Informe a praça / rodovia"),
  valor: z
    .number({ invalid_type_error: "Informe o valor" })
    .min(0, "O valor não pode ser negativo"),
});
type ValoresForm = z.infer<typeof schema>;

function PracaFormDialog({
  praca,
  aoSalvar,
  children,
}: {
  praca?: LinhaPracaPedagio;
  aoSalvar: () => void;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ValoresForm>({
    resolver: zodResolver(schema),
    defaultValues: valoresIniciais(praca),
  });

  useEffect(() => {
    if (aberto) reset(valoresIniciais(praca));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  async function aoEnviar(v: ValoresForm) {
    try {
      const linha = {
        uf: v.uf,
        praca: v.praca.trim(),
        valor: Math.round((Number(v.valor) || 0) * 100) / 100,
        atualizado_em: new Date().toISOString(),
      };
      if (praca) {
        const { error } = await supabase
          .from("pracas_pedagio")
          .update(linha)
          .eq("id", praca.id);
        if (error) throw error;
        toast.success("Praça atualizada.");
      } else {
        const { error } = await supabase.from("pracas_pedagio").insert(linha);
        if (error) throw error;
        toast.success("Praça cadastrada.");
      }
      setAberto(false);
      aoSalvar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{praca ? "Editar praça" : "Nova praça de pedágio"}</DialogTitle>
          <DialogDescription>
            Estado, praça / rodovia e valor. A data de atualização é registrada
            automaticamente ao salvar.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(aoEnviar)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[7rem_1fr]">
            <div className="space-y-1.5">
              <Label className="text-xs">Estado (UF)</Label>
              <Select
                value={watch("uf")}
                onValueChange={(v) => setValue("uf", v, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="UF" />
                </SelectTrigger>
                <SelectContent>
                  {UFS.map((uf) => (
                    <SelectItem key={uf} value={uf}>
                      {uf}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.uf && (
                <p className="text-xs font-medium text-destructive">
                  {errors.uf.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="praca" className="text-xs">
                Praça / rodovia
              </Label>
              <Input
                id="praca"
                placeholder="Ex.: Anhanguera (SP-330) — Praça Jundiaí"
                {...register("praca")}
              />
              {errors.praca && (
                <p className="text-xs font-medium text-destructive">
                  {errors.praca.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="valor" className="text-xs">
              Valor (R$)
            </Label>
            <Input
              id="valor"
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              className="w-40"
              {...register("valor", { valueAsNumber: true })}
            />
            {errors.valor && (
              <p className="text-xs font-medium text-destructive">
                {errors.valor.message}
              </p>
            )}
          </div>

          {praca && (
            <p className="text-xs text-muted-foreground">
              Última atualização: {formatarDataHora(praca.atualizado_em)}
            </p>
          )}

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
              {isSubmitting ? "Salvando…" : praca ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function valoresIniciais(praca: LinhaPracaPedagio | undefined): ValoresForm {
  return {
    uf: praca?.uf ?? "",
    praca: praca?.praca ?? "",
    valor: praca?.valor ?? 0,
  };
}
