import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // Falha cedo e com mensagem clara em vez de erros obscuros de rede depois.
  throw new Error(
    "Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env (veja .env.example).",
  );
}

/** Client do Supabase para uso no browser (chave ANON + RLS). */
export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// ---------------------------------------------------------------------------
// Interfaces das linhas das tabelas (espelham supabase/full_setup.sql)
// ---------------------------------------------------------------------------

export type PapelUsuario = "admin" | "funcionario";

export interface LinhaProfile {
  id: string;
  nome: string;
  email: string;
  role: PapelUsuario;
  created_at: string;
  updated_at: string;
}

export interface LinhaCotacao {
  id: string;
  nome: string;
  cep_origem: string;
  cep_destino: string;
  distancia_km: number;
  /** Tarifa por faixa: "a cada `km_faixa` km, cobra-se `valor_faixa` reais". */
  km_faixa: number;
  valor_faixa: number;
  /** Polilinha [lat, lon] do trajeto (OSRM); null se não roteado. */
  rota: [number, number][] | null;
  created_at: string;
  updated_at: string;
}

export interface LinhaPedagio {
  id: string;
  cotacao_id: string;
  praca: string;
  valor: number;
  posicao: number;
  created_at: string;
  updated_at: string;
}

/** Cadastro (catálogo) de praças de pedágio — referência, mantida pelo admin. */
export interface LinhaPracaPedagio {
  id: string;
  /** UF onde fica a praça (2 letras). */
  uf: string;
  /** Praça / rodovia. */
  praca: string;
  valor: number;
  /** Quando o admin atualizou este pedágio pela última vez. */
  atualizado_em: string;
  created_at: string;
  updated_at: string;
}

/** Cotação com seus pedágios aninhados — formato usado no cache do React Query. */
export interface CotacaoComPedagios extends LinhaCotacao {
  pedagios: LinhaPedagio[];
}
