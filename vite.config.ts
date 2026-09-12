import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";

/**
 * Plugin extra: copia variáveis SEM prefixo `VITE_` do arquivo `.env` para
 * `process.env`, e SOMENTE dentro do processo Node (dev server / SSR / server
 * functions). Assim a `SUPABASE_SERVICE_ROLE_KEY` fica disponível para o
 * `getServerEnv()` no servidor, mas o Vite nunca a injeta no bundle do client
 * (o Vite só expõe ao client o que tem prefixo `VITE_`).
 *
 * Substitui, de forma explícita e auditável, o comportamento equivalente do
 * pacote `@lovable.dev/vite-tanstack-config`.
 */
function copiarEnvDoServidor() {
  return {
    name: "copiar-env-do-servidor",
    config() {
      const caminhoEnv = path.resolve(process.cwd(), ".env");
      if (!fs.existsSync(caminhoEnv)) return;

      for (const linha of fs.readFileSync(caminhoEnv, "utf-8").split("\n")) {
        const limpa = linha.trim();
        if (!limpa || limpa.startsWith("#")) continue;

        const separador = limpa.indexOf("=");
        if (separador === -1) continue;

        const chave = limpa.slice(0, separador).trim();
        let valor = limpa.slice(separador + 1).trim();

        // remove aspas envolventes, se houver
        if (
          (valor.startsWith('"') && valor.endsWith('"')) ||
          (valor.startsWith("'") && valor.endsWith("'"))
        ) {
          valor = valor.slice(1, -1);
        }

        // não sobrescreve o que já veio do ambiente real e ignora VITE_*
        if (!chave.startsWith("VITE_") && process.env[chave] === undefined) {
          process.env[chave] = valor;
        }
      }
    },
  };
}

export default defineConfig({
  server: { port: 3000 },
  plugins: [
    copiarEnvDoServidor(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    // precisa vir antes do tanstackStart (builda o worker/SSR pra Cloudflare)
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart(),
    // o plugin react entra depois do tanstackStart
    viteReact(),
  ],
});
