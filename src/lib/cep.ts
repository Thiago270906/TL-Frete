import { normalizarCep } from "@/lib/utils";

/**
 * Cálculo de distância entre dois CEPs.
 *
 * Estratégia (decisão de projeto): consultamos APIs públicas de CEP em tempo real
 * (BrasilAPI v2 e, como fallback de endereço, ViaCEP) — ambas sem chave.
 * A BrasilAPI v2 às vezes devolve as coordenadas geográficas do CEP; quando
 * devolve, usamos direto. Quando não devolve (ou a API falha), caímos numa
 * tabela de centróides aproximados por faixa de CEP.
 *
 * Com as coordenadas, o trajeto é traçado no Valhalla público da FOSSGIS com
 * `costing=truck` (dimensões/peso de caminhão) — sem chave. Se o Valhalla falhar,
 * a distância vira haversine × fator. O número final é sempre editável no form.
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
  /**
   * Polilinha `[lat, lon]` do melhor trajeto (OSRM). Vazia quando não foi
   * possível rotear — aí `distanciaKm` é só a estimativa em linha reta.
   */
  geometria: [number, number][];
  /** Duração estimada do trajeto em minutos (0 quando não roteado). */
  duracaoMin: number;
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

interface RotaRoteador {
  distanciaKm: number;
  duracaoMin: number;
  geometria: [number, number][];
}

// Dimensões/peso de um caminhão "médio" brasileiro (articulado simples). Fazem
// o Valhalla evitar pontes baixas, vias com restrição de peso e ruas estreitas.
const CAMINHAO = {
  height: 4.4, // m
  width: 2.6, // m
  length: 18.75, // m
  weight: 23.0, // t
  axle_load: 10.0, // t
  hazmat: false,
};

/** Decodifica a polilinha do Valhalla (precisão 6) para pares `[lat, lon]`. */
function decodificarPolyline6(texto: string): [number, number][] {
  let indice = 0;
  let lat = 0;
  let lon = 0;
  const pontos: [number, number][] = [];

  while (indice < texto.length) {
    let resultado = 0;
    let desloc = 0;
    let byte: number;
    do {
      byte = texto.charCodeAt(indice++) - 63;
      resultado |= (byte & 0x1f) << desloc;
      desloc += 5;
    } while (byte >= 0x20);
    lat += resultado & 1 ? ~(resultado >> 1) : resultado >> 1;

    resultado = 0;
    desloc = 0;
    do {
      byte = texto.charCodeAt(indice++) - 63;
      resultado |= (byte & 0x1f) << desloc;
      desloc += 5;
    } while (byte >= 0x20);
    lon += resultado & 1 ? ~(resultado >> 1) : resultado >> 1;

    pontos.push([lat / 1e6, lon / 1e6]);
  }
  return pontos;
}

/**
 * Trajeto de CAMINHÃO entre dois pontos via Valhalla público da FOSSGIS
 * (`valhalla1.openstreetmap.de`, sem chave). Servidor comunitário — sem SLA:
 * se falhar, devolve `null` e o chamador cai na estimativa em linha reta.
 */
async function rotearCaminhao(
  origem: EnderecoCep,
  destino: EnderecoCep,
): Promise<RotaRoteador | null> {
  try {
    const resp = await fetch("https://valhalla1.openstreetmap.de/route", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        locations: [
          { lat: origem.lat, lon: origem.lon },
          { lat: destino.lat, lon: destino.lon },
        ],
        costing: "truck",
        costing_options: { truck: CAMINHAO },
        directions_options: { units: "kilometers" },
        id: "tl-frete",
      }),
    });
    if (!resp.ok) return null;

    const dados = (await resp.json()) as {
      trip?: {
        status?: number;
        summary?: { length?: number; time?: number };
        legs?: { shape?: string }[];
      };
    };
    const trip = dados.trip;
    if (!trip || trip.status !== 0 || !trip.legs?.length) return null;

    const geometria = trip.legs.flatMap((l) =>
      l.shape ? decodificarPolyline6(l.shape) : [],
    );
    if (geometria.length < 2) return null;

    return {
      distanciaKm: trip.summary?.length ?? 0,
      duracaoMin: (trip.summary?.time ?? 0) / 60,
      geometria,
    };
  } catch {
    return null;
  }
}

/**
 * Consulta os dois CEPs e devolve o trajeto de caminhão (distância, duração e
 * polilinha). Sem rota do Valhalla, cai na distância em linha reta × fator.
 */
export async function calcularDistanciaEntreCeps(
  cepOrigem: string,
  cepDestino: string,
): Promise<ResultadoDistancia> {
  const [origem, destino] = await Promise.all([
    buscarCep(cepOrigem),
    buscarCep(cepDestino),
  ]);

  const rota = await rotearCaminhao(origem, destino);
  const aproximada = origem.coordenadaAproximada || destino.coordenadaAproximada;

  if (rota) {
    return {
      origem,
      destino,
      distanciaKm: Math.round(rota.distanciaKm * 10) / 10,
      aproximada,
      geometria: rota.geometria,
      duracaoMin: Math.round(rota.duracaoMin),
    };
  }

  const linhaReta = haversineKm([origem.lat, origem.lon], [destino.lat, destino.lon]);
  return {
    origem,
    destino,
    distanciaKm: Math.round(linhaReta * FATOR_RODOVIARIO * 10) / 10,
    aproximada: true,
    geometria: [],
    duracaoMin: 0,
  };
}
