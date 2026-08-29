import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-store";
import {
  supabase,
  type CotacaoComPedagios,
  type LinhaCotacao,
  type LinhaPedagio,
} from "@/lib/supabase";
import { gerarIdUnico, paraSlug } from "@/lib/utils";

export const CHAVE_COTACOES = ["cotacoes"] as const;

// ---------------------------------------------------------------------------
// Tipos de entrada dos formulários
// ---------------------------------------------------------------------------

export interface PedagioForm {
  /** presente quando é um pedágio que já existe (fluxo de edição). */
  id?: string;
  praca: string;
  valor: number;
}

export interface CotacaoForm {
  nome: string;
  cep_origem: string;
  cep_destino: string;
  distancia_km: number;
  /** "A cada `km_faixa` km" custa "`valor_faixa` reais". */
  km_faixa: number;
  valor_faixa: number;
  pedagios: PedagioForm[];
}

// ---------------------------------------------------------------------------
// Funções PURAS de derivação (sem hooks, testáveis isoladamente)
// ---------------------------------------------------------------------------

/**
 * Custo só da distância, pela tarifa por faixa.
 * Ex.: "a cada 50 km, R$ 50" -> 120 km custam 120 / 50 * 50 = R$ 120.
 * É proporcional (não arredonda para blocos inteiros de faixa).
 */
export function subtotalDistancia(
  c: Pick<LinhaCotacao, "distancia_km" | "km_faixa" | "valor_faixa">,
): number {
  const kmFaixa = Number(c.km_faixa) || 0;
  if (kmFaixa <= 0) return 0;
  const bruto = (Number(c.distancia_km) || 0) / kmFaixa * (Number(c.valor_faixa) || 0);
  return Math.round(bruto * 100) / 100;
}

/** Soma dos valores de todos os pedágios. */
export function totalPedagios(c: { pedagios: Pick<LinhaPedagio, "valor">[] }): number {
  const soma = c.pedagios.reduce((acc, p) => acc + (Number(p.valor) || 0), 0);
  return Math.round(soma * 100) / 100;
}

/** Valor total da cotação = distância + pedágios. */
export function totalCotacao(c: CotacaoComPedagios): number {
  return Math.round((subtotalDistancia(c) + totalPedagios(c)) * 100) / 100;
}

/** Agregações do dashboard a partir da lista completa. */
export function agregacoesDashboard(cotacoes: CotacaoComPedagios[]) {
  const totalCotacoes = cotacoes.length;
  const distanciaTotal = cotacoes.reduce((acc, c) => acc + (Number(c.distancia_km) || 0), 0);
  const valorTotal = cotacoes.reduce((acc, c) => acc + totalCotacao(c), 0);
  const totalEmPedagios = cotacoes.reduce((acc, c) => acc + totalPedagios(c), 0);
  const valorMedio = totalCotacoes === 0 ? 0 : valorTotal / totalCotacoes;

  // Seção "Valor por cotação": participação de cada cotação no valor somado.
  const maxValor = Math.max(1, ...cotacoes.map((c) => totalCotacao(c)));
  const valorPorCotacao = [...cotacoes]
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      valor: totalCotacao(c),
      pct: Math.round((totalCotacao(c) / maxValor) * 100),
    }))
    .sort((a, b) => b.valor - a.valor);

  // Seção "Cotações recentes".
  const recentes = [...cotacoes]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 6)
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      distancia_km: c.distancia_km,
      pedagios: c.pedagios.length,
      total: totalCotacao(c),
    }));

  return {
    totalCotacoes,
    distanciaTotal: Math.round(distanciaTotal * 10) / 10,
    valorTotal: Math.round(valorTotal * 100) / 100,
    totalEmPedagios: Math.round(totalEmPedagios * 100) / 100,
    valorMedio: Math.round(valorMedio * 100) / 100,
    valorPorCotacao,
    recentes,
  };
}

// ---------------------------------------------------------------------------
// Carregamento
// ---------------------------------------------------------------------------

async function carregarCotacoes(): Promise<CotacaoComPedagios[]> {
  const [{ data: cotacoes, error: erroCot }, { data: pedagios, error: erroPed }] =
    await Promise.all([
      supabase.from("cotacoes").select("*").order("created_at", { ascending: false }),
      supabase.from("pedagios").select("*").order("posicao", { ascending: true }),
    ]);

  if (erroCot) throw erroCot;
  if (erroPed) throw erroPed;

  const porCotacao = new Map<string, LinhaPedagio[]>();
  for (const p of (pedagios ?? []) as LinhaPedagio[]) {
    const lista = porCotacao.get(p.cotacao_id) ?? [];
    lista.push(p);
    porCotacao.set(p.cotacao_id, lista);
  }

  return ((cotacoes ?? []) as LinhaCotacao[]).map((c) => ({
    ...c,
    pedagios: (porCotacao.get(c.id) ?? []).sort((a, b) => a.posicao - b.posicao),
  }));
}

function lerCache(qc: QueryClient): CotacaoComPedagios[] {
  return qc.getQueryData<CotacaoComPedagios[]>(CHAVE_COTACOES) ?? [];
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ValorCotacoes {
  cotacoes: CotacaoComPedagios[];
  isLoading: boolean;
  isError: boolean;
  criarCotacao: (dados: CotacaoForm) => Promise<void>;
  editarCotacao: (id: string, dados: CotacaoForm) => Promise<void>;
  excluirCotacao: (id: string) => Promise<void>;
}

const CotacoesContext = createContext<ValorCotacoes | null>(null);

export function CotacoesProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const qc = useQueryClient();

  const consulta = useQuery({
    queryKey: CHAVE_COTACOES,
    queryFn: carregarCotacoes,
    enabled: !!session, // só busca depois de autenticado
    staleTime: 30_000,
  });

  // ----- criar -----
  const mutCriar = useMutation({
    mutationFn: async (dados: CotacaoForm) => {
      const idsExistentes = lerCache(qc).map((c) => c.id);
      const idCotacao = gerarIdUnico(dados.nome, idsExistentes);

      const { error: e1 } = await supabase
        .from("cotacoes")
        .insert(montarLinhaCotacao(idCotacao, dados));
      if (e1) throw e1;

      const linhasPedagio = montarLinhasPedagio(idCotacao, dados.pedagios, idsPedagio(qc));
      if (linhasPedagio.length > 0) {
        const { error: e2 } = await supabase.from("pedagios").insert(linhasPedagio);
        if (e2) throw e2;
      }
    },
    onMutate: async (dados) => {
      await qc.cancelQueries({ queryKey: CHAVE_COTACOES });
      const anterior = lerCache(qc);
      const idCotacao = gerarIdUnico(dados.nome, anterior.map((c) => c.id));
      const agora = new Date().toISOString();
      const otimista: CotacaoComPedagios = {
        ...montarLinhaCotacao(idCotacao, dados),
        created_at: agora,
        updated_at: agora,
        pedagios: montarLinhasPedagio(idCotacao, dados.pedagios, idsPedagio(qc)).map(
          (p) => ({ ...p, created_at: agora, updated_at: agora }),
        ),
      };
      qc.setQueryData<CotacaoComPedagios[]>(CHAVE_COTACOES, [otimista, ...anterior]);
      return { anterior };
    },
    onError: (erro, _dados, ctx) => {
      // desfaz o otimismo e revalida a partir do servidor
      if (ctx?.anterior) qc.setQueryData(CHAVE_COTACOES, ctx.anterior);
      qc.invalidateQueries({ queryKey: CHAVE_COTACOES });
      toast.error(`Não foi possível criar a cotação: ${mensagemErro(erro)}`);
    },
    onSuccess: () => {
      toast.success("Cotação registrada.");
      qc.invalidateQueries({ queryKey: CHAVE_COTACOES });
    },
  });

  // ----- editar (sem status: apaga os pedágios e regrava) -----
  const mutEditar = useMutation({
    mutationFn: async ({ id, dados }: { id: string; dados: CotacaoForm }) => {
      const { error: e1 } = await supabase
        .from("cotacoes")
        .update(montarLinhaCotacao(id, dados, { comId: false }))
        .eq("id", id);
      if (e1) throw e1;

      const { error: e2 } = await supabase.from("pedagios").delete().eq("cotacao_id", id);
      if (e2) throw e2;

      const linhas = montarLinhasPedagio(id, dados.pedagios, idsPedagio(qc, id));
      if (linhas.length > 0) {
        const { error: e3 } = await supabase.from("pedagios").insert(linhas);
        if (e3) throw e3;
      }
    },
    onMutate: async ({ id, dados }) => {
      await qc.cancelQueries({ queryKey: CHAVE_COTACOES });
      const anterior = lerCache(qc);
      const agora = new Date().toISOString();
      qc.setQueryData<CotacaoComPedagios[]>(
        CHAVE_COTACOES,
        anterior.map((c) =>
          c.id !== id
            ? c
            : {
                ...c,
                ...montarLinhaCotacao(id, dados, { comId: false }),
                id,
                updated_at: agora,
                pedagios: montarLinhasPedagio(id, dados.pedagios, idsPedagio(qc, id)).map(
                  (p) => ({ ...p, created_at: agora, updated_at: agora }),
                ),
              },
        ),
      );
      return { anterior };
    },
    onError: (erro, _v, ctx) => {
      if (ctx?.anterior) qc.setQueryData(CHAVE_COTACOES, ctx.anterior);
      qc.invalidateQueries({ queryKey: CHAVE_COTACOES });
      toast.error(`Não foi possível salvar a cotação: ${mensagemErro(erro)}`);
    },
    onSuccess: () => {
      toast.success("Cotação atualizada.");
      qc.invalidateQueries({ queryKey: CHAVE_COTACOES });
    },
  });

  // ----- excluir -----
  const mutExcluir = useMutation({
    mutationFn: async (id: string) => {
      // pedágios saem via `on delete cascade` no banco
      const { error } = await supabase.from("cotacoes").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: CHAVE_COTACOES });
      const anterior = lerCache(qc);
      qc.setQueryData<CotacaoComPedagios[]>(
        CHAVE_COTACOES,
        anterior.filter((c) => c.id !== id),
      );
      return { anterior };
    },
    onError: (erro, _id, ctx) => {
      if (ctx?.anterior) qc.setQueryData(CHAVE_COTACOES, ctx.anterior);
      qc.invalidateQueries({ queryKey: CHAVE_COTACOES });
      toast.error(`Não foi possível excluir: ${mensagemErro(erro)}`);
    },
    onSuccess: () => {
      toast.success("Cotação excluída.");
      qc.invalidateQueries({ queryKey: CHAVE_COTACOES });
    },
  });

  const valor = useMemo<ValorCotacoes>(
    () => ({
      cotacoes: consulta.data ?? [],
      isLoading: consulta.isLoading,
      isError: consulta.isError,
      criarCotacao: (dados) => mutCriar.mutateAsync(dados).then(() => undefined),
      editarCotacao: (id, dados) =>
        mutEditar.mutateAsync({ id, dados }).then(() => undefined),
      excluirCotacao: (id) => mutExcluir.mutateAsync(id).then(() => undefined),
    }),
    [consulta.data, consulta.isLoading, consulta.isError, mutCriar, mutEditar, mutExcluir],
  );

  return <CotacoesContext.Provider value={valor}>{children}</CotacoesContext.Provider>;
}

export function useCotacoes(): ValorCotacoes {
  const ctx = useContext(CotacoesContext);
  if (!ctx) throw new Error("useCotacoes precisa estar dentro de <CotacoesProvider>.");
  return ctx;
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/** Todos os IDs de pedágio no cache (opcionalmente excluindo os de uma cotação). */
function idsPedagio(qc: QueryClient, excetoCotacaoId?: string): string[] {
  return lerCache(qc)
    .filter((c) => c.id !== excetoCotacaoId)
    .flatMap((c) => c.pedagios.map((p) => p.id));
}

function montarLinhaCotacao(
  id: string,
  d: CotacaoForm,
  opcoes: { comId?: boolean } = { comId: true },
): LinhaCotacao {
  const base = {
    nome: d.nome.trim(),
    cep_origem: d.cep_origem.replace(/\D/g, "").slice(0, 8),
    cep_destino: d.cep_destino.replace(/\D/g, "").slice(0, 8),
    distancia_km: Math.round((Number(d.distancia_km) || 0) * 10) / 10,
    km_faixa: Math.round((Number(d.km_faixa) || 0) * 10) / 10,
    valor_faixa: Math.round((Number(d.valor_faixa) || 0) * 100) / 100,
  };
  // `created_at`/`updated_at` são preenchidos pelo banco; aqui só para o tipo.
  return {
    ...(opcoes.comId === false ? {} : { id }),
    ...base,
  } as LinhaCotacao;
}

/**
 * Constrói as linhas de pedágio a partir do formulário. `posicao` = índice;
 * o ID é o slug `<cotacao>-<praca>`, com sufixo em caso de colisão.
 */
function montarLinhasPedagio(
  cotacaoId: string,
  doForm: PedagioForm[],
  idsOcupados: string[],
): LinhaPedagio[] {
  const usados = new Set(idsOcupados);
  const agora = new Date().toISOString();

  return doForm.map((p, i) => {
    const nomeBase = `${cotacaoId}-${paraSlug(p.praca) || `pedagio-${i + 1}`}`;
    const id = gerarIdUnico(nomeBase, usados);
    usados.add(id);
    return {
      id,
      cotacao_id: cotacaoId,
      praca: p.praca.trim(),
      valor: Math.round((Number(p.valor) || 0) * 100) / 100,
      posicao: i,
      created_at: agora,
      updated_at: agora,
    };
  });
}

function mensagemErro(erro: unknown): string {
  if (erro && typeof erro === "object" && "message" in erro) {
    return String((erro as { message: unknown }).message);
  }
  return "erro desconhecido";
}
