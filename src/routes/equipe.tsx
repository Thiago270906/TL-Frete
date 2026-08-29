import { useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, ShieldCheck } from "lucide-react";
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
import { useAuth } from "@/lib/auth-store";
import { supabase, type LinhaProfile, type PapelUsuario } from "@/lib/supabase";
import { criarUsuario, definirPapelUsuario } from "@/lib/usuarios-server";
import { iniciais } from "@/lib/utils";

export const Route = createFileRoute("/equipe")({
  component: PaginaEquipe,
});

const CHAVE_PROFILES = ["profiles"] as const;

function PaginaEquipe() {
  const { isAdmin, session, profile } = useAuth();
  const qc = useQueryClient();

  const consulta = useQuery({
    queryKey: CHAVE_PROFILES,
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LinhaProfile[];
    },
  });

  const mutPapel = useMutation({
    mutationFn: async (v: { usuarioId: string; role: PapelUsuario }) => {
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("Sessão ausente.");
      // A segurança real está no handler (revalida admin) + RLS. Este client-gate
      // é só para não mostrar controles inúteis.
      await definirPapelUsuario({ data: { accessToken, ...v } });
    },
    onSuccess: () => {
      toast.success("Papel atualizado.");
      qc.invalidateQueries({ queryKey: CHAVE_PROFILES });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível atualizar."),
  });

  // Gate por role: além de esconder o link no AppShell, protegemos o corpo.
  if (!isAdmin) {
    return (
      <AppShell titulo="Equipe" subtitulo="Gestão de usuários">
        <Card>
          <p className="text-sm text-muted-foreground">
            Acesso restrito a administradores.
          </p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      titulo="Equipe"
      subtitulo="Usuários com acesso ao sistema"
      acao={
        <NovoUsuarioDialog
          onCriado={() => qc.invalidateQueries({ queryKey: CHAVE_PROFILES })}
        >
          <Button size="sm">
            <Plus className="size-4" />
            Novo usuário
          </Button>
        </NovoUsuarioDialog>
      }
    >
      {consulta.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando usuários…</p>
      ) : (
        <div className="space-y-3">
          {(consulta.data ?? []).map((u) => (
            <Card key={u.id} className="flex flex-wrap items-center gap-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {iniciais(u.nome || u.email)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{u.nome || "—"}</p>
                <p className="truncate text-xs text-muted-foreground">{u.email}</p>
              </div>

              {u.role === "admin" ? (
                <Badge>
                  <ShieldCheck className="mr-1 size-3" />
                  Administrador
                </Badge>
              ) : (
                <Badge variant="secondary">Funcionário</Badge>
              )}

              <Select
                value={u.role}
                onValueChange={(v) =>
                  mutPapel.mutate({ usuarioId: u.id, role: v as PapelUsuario })
                }
                disabled={u.id === profile?.id || mutPapel.isPending}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="funcionario">Funcionário</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        A criação de usuários usa uma <span className="font-mono">server function</span>{" "}
        que revalida o papel de administrador no servidor antes de usar a chave de
        serviço do Supabase.
      </p>
    </AppShell>
  );
}

const novoUsuarioSchema = z.object({
  nome: z.string().min(2, "Informe o nome"),
  email: z.string().email("E-mail inválido"),
  senha: z.string().min(6, "Mínimo de 6 caracteres"),
  role: z.enum(["admin", "funcionario"]),
});
type NovoUsuario = z.infer<typeof novoUsuarioSchema>;

function NovoUsuarioDialog({
  children,
  onCriado,
}: {
  children: ReactNode;
  onCriado: () => void;
}) {
  const { session } = useAuth();
  const [aberto, setAberto] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<NovoUsuario>({
    resolver: zodResolver(novoUsuarioSchema),
    defaultValues: { nome: "", email: "", senha: "", role: "funcionario" },
  });

  async function aoEnviar(v: NovoUsuario) {
    try {
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("Sessão ausente.");
      await criarUsuario({ data: { accessToken, ...v } });
      toast.success("Usuário criado.");
      reset();
      setAberto(false);
      onCriado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar o usuário.");
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>
            A conta é criada já confirmada. A pessoa entra com e-mail e senha.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(aoEnviar)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nome" className="text-xs">
              Nome
            </Label>
            <Input id="nome" {...register("nome")} />
            {errors.nome && (
              <p className="text-xs font-medium text-destructive">{errors.nome.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs">
              E-mail
            </Label>
            <Input id="email" type="email" {...register("email")} />
            {errors.email && (
              <p className="text-xs font-medium text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="senha" className="text-xs">
              Senha provisória
            </Label>
            <Input id="senha" type="text" {...register("senha")} />
            {errors.senha && (
              <p className="text-xs font-medium text-destructive">
                {errors.senha.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Papel</Label>
            <Select
              value={watch("role")}
              onValueChange={(v) =>
                setValue("role", v as NovoUsuario["role"], { shouldDirty: true })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="funcionario">Funcionário</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
              {isSubmitting ? "Criando…" : "Criar usuário"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
