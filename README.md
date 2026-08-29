<<<<<<< HEAD
# TL-Frete
=======
# TL Frete

MVP web para **cálculo de fretes**: informe o CEP inicial e o CEP final, calcule a
distância em km, defina o valor por km e some os pedágios. Cada cálculo fica
salvo como uma **cotação** na tela **Calculadora**.

## Stack

- **TanStack Start** (React 19 + TanStack Router com rotas por arquivo + TanStack Query)
- **Vite** + **Tailwind CSS v4** + **shadcn/ui** (new-york, ícones `lucide-react`)
- **Supabase** (Auth + Postgres + RLS)
- **react-hook-form** + **zod**, toasts com **sonner**
- Tema escuro fixo. Todo o texto e os identificadores em pt-BR.

## Como rodar

1. **Dependências**

   ```bash
   npm install
   ```

2. **Banco (Supabase)**

   - Crie um projeto em <https://supabase.com>.
   - No **SQL Editor**, cole e rode `supabase/full_setup.sql` (é idempotente).
   - `supabase/migrations/` traz migrations avulsas (ex.: criação de usuários).
     Rode com `supabase db push` ou colando o `.sql` no SQL Editor.
   - Crie o primeiro usuário em **Authentication → Users** (ou pela tela de login
     após habilitar signups) e promova-o a admin:

     ```sql
     update public.profiles set role = 'admin' where email = 'voce@empresa.com.br';
     ```

3. **Variáveis de ambiente**

   ```bash
   cp .env.example .env
   ```

   Preencha com os dados de **Configurações → API** do Supabase:

   | variável | onde é usada |
   | --- | --- |
   | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | client (browser) |
   | `SUPABASE_URL` / `SUPABASE_ANON_KEY` | server functions (validação do chamador) |
   | `SUPABASE_SERVICE_ROLE_KEY` | **só servidor** — nunca vai para o bundle do client |

   As variáveis sem prefixo `VITE_` são copiadas para `process.env` apenas no
   processo Node por um plugin em `vite.config.ts`.

   > O Vite injeta as variáveis `VITE_*` **no momento do build**. O `.env`
   > precisa existir **antes** de `npm run build`; em `npm run dev` ele é lido
   > em tempo real.

4. **Desenvolvimento**

   ```bash
   npm run dev      # http://localhost:3000
   ```

5. **Produção**

   ```bash
   npm run build      # gera dist/ (com .env já preenchido)
   npm run start      # server-prod.mjs — serve dist/client + SSR na porta 3000 (ou $PORT)
   ```

   `server-prod.mjs` é um servidor Node mínimo e sem dependências: entrega os
   assets estáticos de `dist/client/` e delega SSR + *server functions* ao
   handler gerado em `dist/server/server.js`. Em plataformas de deploy
   (Vercel/Netlify/etc.) use o *preset* correspondente do TanStack Start.

## Domínio

- **Cotação** (pai): nome, cliente, CEP de origem/destino, distância (km),
  tarifa por faixa (**a cada `km_faixa` km, custa `valor_faixa` reais** — dois
  inputs), observações, e uma lista de **pedágios**.
- **Pedágio** (filho): praça, valor, posição. É só registro — sem status/confirmação.
- **Custo da distância** = `distancia_km / km_faixa × valor_faixa` (proporcional).
- **Total** = custo da distância + Σ pedágios (funções puras em
  `src/lib/cotacoes-store.tsx`).

### Telas

| Rota | Conteúdo | Acesso |
| --- | --- | --- |
| `/` | Dashboard: *Cotações*, *Distância total*, *Valor total*, *Total em pedágios*; seções *Valor por cotação* e *Cotações recentes* | autenticado |
| `/calculadora` | Lista dos cálculos registrados, CRUD (sem filtros) | autenticado |
| `/equipe` | Usuários e papéis; criação via *server function* | **admin** |
| `/login` | Autenticação | público |

> O gate por role no client é só UX. A segurança real é a **RLS** no Postgres +
> a revalidação do papel de admin dentro das *server functions*
> (`src/lib/usuarios-server.ts`).

### Cálculo da distância

`src/lib/cep.ts` consulta **BrasilAPI** (e **ViaCEP** como fallback de endereço),
sem chave. Quando a API devolve as coordenadas do CEP, a distância é o haversine
entre elas × 1,3 (fator rodoviário); quando não devolve, usa um centróide
aproximado por faixa de CEP. O valor sempre fica editável no formulário.

## Notas de arquitetura

- **Ordem dos providers** (`src/routes/__root.tsx`):
  `QueryClientProvider > AuthProvider > CotacoesProvider > AuthGate > Outlet`.
- **Update otimista** em todas as mutações (`queryClient.setQueryData`), com
  `toast.error` + `invalidateQueries` no `onError` para reverter.
- **Edição de cotação** apaga e regrava os pedágios (a tabela é só registro,
  não há estado a preservar).
- **IDs de texto** = slug do nome (e `<cotacao>-<praça>` para pedágios), com
  sufixo `-2`, `-3`… em caso de colisão (checado contra o cache do React Query).
>>>>>>> 101f5b2 (TL-Frete)
