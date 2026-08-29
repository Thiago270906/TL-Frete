// Servidor de produção mínimo e sem dependências.
// Serve os assets estáticos de `dist/client/` e delega todo o resto (SSR e
// server functions) para o handler `fetch` gerado em `dist/server/server.js`.
//
// Rode depois de `npm run build`:  node server-prod.mjs   (ou `npm run start`)

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import { Readable } from "node:stream";

const handler = (await import("./dist/server/server.js")).default;

const CLIENT_DIR = new URL("./dist/client/", import.meta.url);
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

function paraWebRequest(req, url) {
  const headers = new Headers();
  for (const [chave, valor] of Object.entries(req.headers)) {
    if (Array.isArray(valor)) valor.forEach((v) => headers.append(chave, v));
    else if (valor != null) headers.set(chave, valor);
  }
  const method = req.method || "GET";
  const temCorpo = method !== "GET" && method !== "HEAD";
  return new Request(url, {
    method,
    headers,
    body: temCorpo ? Readable.toWeb(req) : undefined,
    duplex: temCorpo ? "half" : undefined,
  });
}

const servidor = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    // 1) tenta servir arquivo estático do client
    if ((req.method === "GET" || req.method === "HEAD") && url.pathname !== "/") {
      const caminho = new URL("." + url.pathname, CLIENT_DIR);
      try {
        const info = await stat(caminho);
        if (info.isFile()) {
          const corpo = await readFile(caminho);
          res.writeHead(200, {
            "content-type": MIME[extname(caminho.pathname)] ?? "application/octet-stream",
            "cache-control": url.pathname.startsWith("/assets/")
              ? "public, max-age=31536000, immutable"
              : "no-cache",
          });
          res.end(req.method === "HEAD" ? undefined : corpo);
          return;
        }
      } catch {
        // não é arquivo -> segue para o SSR
      }
    }

    // 2) SSR + server functions
    const resposta = await handler.fetch(paraWebRequest(req, url));
    res.writeHead(resposta.status, Object.fromEntries(resposta.headers));
    if (resposta.body) {
      Readable.fromWeb(resposta.body).pipe(res);
    } else {
      res.end(Buffer.from(await resposta.arrayBuffer()));
    }
  } catch (erro) {
    console.error("[server-prod]", erro);
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("Internal Server Error");
  }
});

servidor.listen(PORT, () => {
  console.log(`TL Frete rodando em http://localhost:${PORT}`);
});
