import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/login")({
  component: PaginaLogin,
});

const schema = z.object({
  email: z.string().email("E-mail inválido"),
  senha: z.string().min(6, "Mínimo de 6 caracteres"),
});
type Valores = z.infer<typeof schema>;

function PaginaLogin() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Valores>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", senha: "" },
  });

  async function aoEnviar(v: Valores) {
    try {
      await signIn(v.email, v.senha);
      navigate({ to: "/" });
    } catch (erro) {
      toast.error(
        erro instanceof Error && erro.message.toLowerCase().includes("invalid")
          ? "E-mail ou senha incorretos."
          : "Não foi possível entrar. Tente novamente.",
      );
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm space-y-6 overflow-hidden p-0">
        <div className="flex items-center justify-center bg-black px-6 py-8">
          <img src="/logo-branca.png" alt="TL Frete" className="h-16 w-auto" />
        </div>

        <div className="space-y-6 px-5 pb-5">
          <p className="text-center text-xs text-muted-foreground">
            Acesse para calcular fretes
          </p>

          <form onSubmit={handleSubmit(aoEnviar)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs">
                E-mail
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="voce@empresa.com.br"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-xs font-medium text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="senha" className="text-xs">
                Senha
              </Label>
              <Input
                id="senha"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                {...register("senha")}
              />
              {errors.senha && (
                <p className="text-xs font-medium text-destructive">
                  {errors.senha.message}
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Entrando…" : "Entrar"}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground">
            O cadastro de usuários é feito por um administrador na tela “Equipe”.
          </p>
        </div>
      </Card>
    </div>
  );
}
