import { QueryClient } from "@tanstack/react-query";
import { createRouter as criarRouterTanstack } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export interface ContextoRouter {
  queryClient: QueryClient;
}

/**
 * O plugin do TanStack Start espera um export chamado `getRouter` neste arquivo
 * (`src/router.tsx`). É chamado uma vez por request no servidor e uma vez no
 * client, então o QueryClient criado aqui fica isolado por request no SSR.
 *
 * O QueryClient vai no `context` do router; o <QueryClientProvider> em si é
 * montado no `__root.tsx` (ver a ordem de providers comentada lá).
 */
export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });

  return criarRouterTanstack({
    routeTree,
    context: { queryClient } satisfies ContextoRouter,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
