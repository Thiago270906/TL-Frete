import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getServerEnv } from "@/lib/server-env";

/**
 * Operações privilegiadas de usuário.
 *
 * Fluxo de segurança em TODO handler (a segurança REAL é esta revalidação no
 * servidor + RLS no banco — o gate por role no client é só UX):
 *   1. Com a ANON key + o accessToken do chamador, confirmar `auth.getUser()`.
 *   2. Checar `role === 'admin'` em `profiles` (consulta feita já autenticada
 *      como o chamador, respeitando RLS).
 *   3. SÓ ENTÃO instanciar um client com a SERVICE ROLE KEY (lida via
 *      `getServerEnv()`, nunca `import.meta.env`, nunca exposta ao client).
 */

const papel = z.enum(["admin", "funcionario"]);

const criarUsuarioSchema = z.object({
  accessToken: z.string().min(10),
  nome: z.string().min(2),
  email: z.string().email(),
  senha: z.string().min(6),
  role: papel,
});

const definirPapelSchema = z.object({
  accessToken: z.string().min(10),
  usuarioId: z.string().uuid(),
  role: papel,
});

function clienteDoChamador(url: string, anonKey: string, accessToken: string) {
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function exigirAdmin(accessToken: string) {
  const { url, anonKey, serviceRoleKey } = getServerEnv();
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.");
  }

  const chamador = clienteDoChamador(url, anonKey, accessToken);

  const { data: auth, error } = await chamador.auth.getUser();
  if (error || !auth.user) throw new Error("Sessão inválida ou expirada.");

  const { data: perfil, error: erroPerfil } = await chamador
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .single();
  if (erroPerfil || perfil?.role !== "admin") {
    throw new Error("Apenas administradores podem executar esta ação.");
  }

  // client privilegiado — criado somente depois de validar o chamador
  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { admin, chamadorId: auth.user.id };
}

export const criarUsuario = createServerFn({ method: "POST" })
  .validator((d: unknown) => criarUsuarioSchema.parse(d))
  .handler(async ({ data }) => {
    const { admin } = await exigirAdmin(data.accessToken);

    const { data: criado, error } = await admin.auth.admin.createUser({
      email: data.email,
      password: data.senha,
      email_confirm: true,
      user_metadata: { nome: data.nome, role: data.role },
    });
    if (error) throw new Error(error.message);

    // O trigger `handle_new_user` já cria o profile a partir do metadata;
    // reforçamos nome/role para o caso de o trigger ter defaults diferentes.
    if (criado.user) {
      await admin
        .from("profiles")
        .update({ nome: data.nome, role: data.role })
        .eq("id", criado.user.id);
    }

    return { id: criado.user?.id ?? null };
  });

export const definirPapelUsuario = createServerFn({ method: "POST" })
  .validator((d: unknown) => definirPapelSchema.parse(d))
  .handler(async ({ data }) => {
    const { admin, chamadorId } = await exigirAdmin(data.accessToken);

    if (data.usuarioId === chamadorId && data.role !== "admin") {
      throw new Error("Você não pode remover o próprio acesso de administrador.");
    }

    const { error } = await admin
      .from("profiles")
      .update({ role: data.role })
      .eq("id", data.usuarioId);
    if (error) throw new Error(error.message);

    return { ok: true };
  });
