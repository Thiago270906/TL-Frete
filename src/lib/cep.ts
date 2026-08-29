import { normalizarCep } from "@/lib/utils";

/**
 * Cálculo de distância entre dois CEPs.
 *
 * Estratégia (decisão de projeto): consultamos APIs públicas de CEP em tempo real
 * (BrasilAPI v2 e, como fallback de endereço, ViaCEP) — ambas sem chave.
 * A BrasilAPI v2 às vezes devolve as coordenadas geográficas do CEP; quando
 * devolve, usamos direto. Quando não devolve (ou a API falha), caímos numa
 * tabela de centróides aproximados por faixa de CEP para ainda estimar a
 * distância. O número final é sempre editável no formulário.
 */

export interface EnderecoCep {
  cep: string;
  uf: string;
  cidade: string;
  bairro: string;
  logradouro: string;
  lat: number;
  lon: number;
  /** true quando lat/lon vieram da tabela aproximada, não da API. */
  coordenadaAproximada: boolean;
}

export interface ResultadoDistancia {
  origem: EnderecoCep;
  destino: EnderecoCep;
  /** Distância rodoviária estimada em km, já com fator de correção e 1 casa. */
  distanciaKm: number;
  /** true se qualquer uma das pontas usou coordenada aproximada. */
  aproximada: boolean;
}

// Centróides aproximados (lat, lon) por 1º dígito do CEP — regiões dos Correios.
const CENTROIDES_POR_DIGITO: Record<string, [number, number]> = {
  "0": [-23.55, -46.63], // Grande São Paulo
  "1": [-22.9, -47.06], // Interior de SP (Campinas como referência)
  "2": [-22.91, -43.2], // RJ / ES
  "3": [-19.92, -43.94], // MG
  "4": [-12.97, -38.5], // BA / SE
  "5": [-8.05, -34.9], // PE / PB / RN / AL
  "6": [-3.73, -38.52], // CE / PI / MA / Norte
  "7": [-15.79, -47.88], // DF / GO / TO / Centro-Oeste
  "8": [-25.43, -49.27], // PR / SC
  "9": [-30.03, -51.23], // RS
};

// Refinos por 2 dígitos para os maiores polos (melhora a estimativa quando não
// há coordenada da API).
const CENTROIDES_POR_DOIS_DIGITOS: Record<string, [number, number]> = {
  "01": [-23.55, -46.63],
  "04": [-23.63, -46.65],
  "13": [-22.9, -47.06], // Campinas
  "14": [-21.18, -47.81], // Ribeirão Preto
  "20": [-22.91, -43.2], // Rio de Janeiro
  "24": [-22.88, -43.1], // Niterói
  "29": [-20.32, -40.34], // Vitória
  "30": [-19.92, -43.94], // Belo Horizonte
  "38": [-18.92, -48.28], // Uberlândia
  "40": [-12.97, -38.5], // Salvador
  "49": [-10.95, -37.07], // Aracaju
  "50": [-8.05, -34.9], // Recife
  "58": [-7.12, -34.86], // João Pessoa
  "59": [-5.79, -35.21], // Natal
  "60": [-3.73, -38.52], // Fortaleza
  "64": [-5.09, -42.8], // Teresina
  "65": [-2.53, -44.3], // São Luís
  "66": [-1.46, -48.5], // Belém
  "69": [-3.12, -60.02], // Manaus
  "70": [-15.79, -47.88], // Brasília
  "74": [-16.69, -49.26], // Goiânia
  "78": [-15.6, -56.1], // Cuiabá
  "79": [-20.46, -54.62], // Campo Grande
  "80": [-25.43, -49.27], // Curitiba
  "88": [-27.6, -48.55], // Florianópolis
  "89": [-26.9, -49.07], // Blumenau
  "90": [-30.03, -51.23], // Porto Alegre
  "95": [-29.17, -51.18], // Caxias do Sul
};

function centroideAproximado(cep: string): [number, number] {
  const d = normalizarCep(cep);
  return (
    CENTROIDES_POR_DOIS_DIGITOS[d.slice(0, 2)] ??
    CENTROIDES_POR_DIGITO[d.slice(0, 1)] ??
    [-15.79, -47.88] // fallback: centro do país
  );
}

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const lat1 = rad(a[0]);
  const lat2 = rad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Distância em linha reta x distância por estrada: fator empírico.
const FATOR_RODOVIARIO = 1.3;

interface RespostaBrasilApi {
  cep?: string;
  state?: string;
  city?: string;
  neighborhood?: string;
  street?: string;
  location?: {
    coordinates?: { latitude?: string | number; longitude?: string | number };
  };
}

interface RespostaViaCep {
  cep?: string;
  uf?: string;
  localidade?: string;
  bairro?: string;
  logradouro?: string;
  erro?: boolean | string;
}

async function buscarBrasilApi(cep: string): Promise<EnderecoCep | null> {
  try {
    const resp = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`, {
      headers: { Accept: "application/json" },
    });
    if (!resp.ok) return null;
    const dados = (await resp.json()) as RespostaBrasilApi;

    const latBruta = dados.location?.coordinates?.latitude;
    const lonBruta = dados.location?.coordinates?.longitude;
    const lat = latBruta != null && latBruta !== "" ? Number(latBruta) : NaN;
    const lon = lonBruta != null && lonBruta !== "" ? Number(lonBruta) : NaN;

    const temCoord = Number.isFinite(lat) && Number.isFinite(lon);
    const aprox = temCoord ? ([lat, lon] as [number, number]) : centroideAproximado(cep);

    return {
      cep,
      uf: dados.state ?? "",
      cidade: dados.city ?? "",
      bairro: dados.neighborhood ?? "",
      logradouro: dados.street ?? "",
      lat: aprox[0],
      lon: aprox[1],
      coordenadaAproximada: !temCoord,
    };
  } catch {
    return null;
  }
}

async function buscarViaCep(cep: string): Promise<EnderecoCep | null> {
  try {
    const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      headers: { Accept: "application/json" },
    });
    if (!resp.ok) return null;
    const dados = (await resp.json()) as RespostaViaCep;
    if (dados.erro) return null;

    const aprox = centroideAproximado(cep);
    return {
      cep,
      uf: dados.uf ?? "",
      cidade: dados.localidade ?? "",
      bairro: dados.bairro ?? "",
      logradouro: dados.logradouro ?? "",
      lat: aprox[0],
      lon: aprox[1],
      coordenadaAproximada: true,
    };
  } catch {
    return null;
  }
}

/** Busca um CEP. Lança erro se o CEP não existir em nenhuma das fontes. */
export async function buscarCep(cepEntrada: string): Promise<EnderecoCep> {
  const cep = normalizarCep(cepEntrada);
  if (cep.length !== 8) {
    throw new Error("CEP inválido: informe 8 dígitos.");
  }

  const resultado = (await buscarBrasilApi(cep)) ?? (await buscarViaCep(cep));
  if (!resultado) {
    throw new Error(`CEP ${cep} não encontrado.`);
  }
  return resultado;
}

/** Consulta os dois CEPs e devolve a distância rodoviária estimada. */
export async function calcularDistanciaEntreCeps(
  cepOrigem: string,
  cepDestino: string,
): Promise<ResultadoDistancia> {
  const [origem, destino] = await Promise.all([
    buscarCep(cepOrigem),
    buscarCep(cepDestino),
  ]);

  const linhaReta = haversineKm([origem.lat, origem.lon], [destino.lat, destino.lon]);
  const distanciaKm = Math.round(linhaReta * FATOR_RODOVIARIO * 10) / 10;

  return {
    origem,
    destino,
    distanciaKm,
    aproximada: origem.coordenadaAproximada || destino.coordenadaAproximada,
  };
}
