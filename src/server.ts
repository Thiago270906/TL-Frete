import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import type { Register } from "@tanstack/react-router";
import type { RequestHandler } from "@tanstack/react-start/server";

/**
 * Entry de SSR customizado (sobrepõe o padrão do plugin).
 *
 * O handler padrão do TanStack Start faz o streaming do app. Aqui embrulhamos
 * numa barreira de erro catastrófico: se a renderização no servidor explodir
 * (ex.: variável de ambiente ausente), respondemos uma página HTML de erro
 * legível em vez de derrubar a conexão sem resposta.
 */
const fetchPadrao = createStartHandler(defaultStreamHandler);

function paginaErro(erro: unknown): string {
  const detalhe =
    erro instanceof Error ? `${erro.name}: ${erro.message}` : String(erro);
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>TL Frete — erro</title>
    <style>
      body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
        background:#0d0d10;color:#f2f2f5;font-family:system-ui,sans-serif}
      .caixa{max-width:32rem;padding:2rem;border:1px solid #2a2a33;border-radius:1rem;background:#17171c}
      h1{font-size:1rem;margin:0 0 .5rem}
      p{font-size:.8rem;color:#a1a1ad;margin:.25rem 0}
      code{font-size:.75rem;color:#c9c9d4;word-break:break-word}
    </style>
  </head>
  <body>
    <div class="caixa">
      <h1>Não foi possível carregar a aplicação</h1>
      <p>Ocorreu um erro na renderização do servidor.</p>
      <p><code>${detalhe.replace(/</g, "&lt;")}</code></p>
      <p>Verifique o arquivo <code>.env</code> (veja <code>.env.example</code>) e recarregue.</p>
    </div>
  </body>
</html>`;
}

export type ServerEntry = { fetch: RequestHandler<Register> };

export function createServerEntry(entry: ServerEntry): ServerEntry {
  return {
    async fetch(...args) {
      try {
        return await entry.fetch(...args);
      } catch (erro) {
        console.error("[server] erro catastrófico no SSR:", erro);
        return new Response(paginaErro(erro), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
    },
  };
}

export default createServerEntry({ fetch: fetchPadrao });
