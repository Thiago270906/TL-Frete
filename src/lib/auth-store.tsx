import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, type LinhaProfile } from "@/lib/supabase";

interface ValorAuth {
  session: Session | null;
  profile: LinhaProfile | null;
  isLoading: boolean;
  isAdmin: boolean;
  signIn: (email: string, senha: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<ValorAuth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<LinhaProfile | null>(null);
  // começa carregando: ainda não sabemos se há sessão salva no storage
  const [carregandoSessao, setCarregandoSessao] = useState(true);
  const [carregandoProfile, setCarregandoProfile] = useState(false);

  // Efeito 1 — SÓ cuida da sessão.
  // getSession() resolve o estado inicial (sessão persistida); onAuthStateChange
  // mantém sincronizado em login/logout/refresh de token. Manter isso isolado
  // evita corrida com a busca do profile.
  useEffect(() => {
    let ativo = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return;
      setSession(data.session);
      setCarregandoSessao(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      setSession(novaSessao);
      setCarregandoSessao(false);
    });

    return () => {
      ativo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Efeito 2 — busca o profile na tabela `profiles` sempre que a sessão muda.
  // Separado do efeito 1 porque depende de `session?.user.id` e tem seu próprio
  // ciclo de loading.
  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) {
      setProfile(null);
      return;
    }

    let ativo = true;
    setCarregandoProfile(true);

    supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        if (!ativo) return;
        setProfile((data as LinhaProfile | null) ?? null);
        setCarregandoProfile(false);
      });

    return () => {
      ativo = false;
    };
  }, [session?.user.id]);

  const signIn = useCallback(async (email: string, senha: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const valor = useMemo<ValorAuth>(
    () => ({
      session,
      profile,
      isLoading: carregandoSessao || carregandoProfile,
      isAdmin: profile?.role === "admin",
      signIn,
      signOut,
    }),
    [session, profile, carregandoSessao, carregandoProfile, signIn, signOut],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth(): ValorAuth {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>.");
  return ctx;
}
