/**
 * Lê variáveis de ambiente do SERVIDOR.
 *
 * IMPORTANTE: nunca use `import.meta.env` aqui. O Vite só injeta no bundle do
 * client as variáveis com prefixo `VITE_`; a `SUPABASE_SERVICE_ROLE_KEY` NÃO tem
 * esse prefixo e é copiada para `process.env` apenas no processo Node pelo plugin
 * `copiarEnvDoServidor` do `vite.config.ts`. Assim ela nunca vaza para o client.
 *
 * Use somente dentro de `createServerFn().handler(...)`.
 */
export function getServerEnv() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Ambiente do servidor incompleto: defina SUPABASE_URL e SUPABASE_ANON_KEY no .env.",
    );
  }

  return { url, anonKey, serviceRoleKey };
}
