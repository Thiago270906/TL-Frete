import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Converte um texto em slug: sem acentos, minúsculo, e qualquer sequência de
 * caracteres não `[a-z0-9]` vira um único hífen. Hífens das pontas são removidos.
 */
export function paraSlug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // marcas de acento combinantes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Gera um ID de texto a partir do nome (slug). Se já existir no conjunto de IDs
 * conhecidos, acrescenta sufixo `-2`, `-3`, ... até achar um livre.
 * O chamador passa os IDs já presentes no cache do React Query.
 */
export function gerarIdUnico(nome: string, idsExistentes: Iterable<string>): string {
  const base = paraSlug(nome) || "item";
  const usados = new Set(idsExistentes);
  if (!usados.has(base)) return base;

  let n = 2;
  while (usados.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** Iniciais para o avatar: primeira letra do primeiro e do último nome. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase();
  return (partes[0]![0]! + partes[partes.length - 1]![0]!).toUpperCase();
}

const formatadorBRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatarBRL(valor: number): string {
  return formatadorBRL.format(Number.isFinite(valor) ? valor : 0);
}

const formatadorKm = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatarKm(valor: number): string {
  return `${formatadorKm.format(Number.isFinite(valor) ? valor : 0)} km`;
}

/** Normaliza um CEP para 8 dígitos (remove tudo que não for número). */
export function normalizarCep(cep: string): string {
  return cep.replace(/\D/g, "").slice(0, 8);
}

/** Formata um CEP como `00000-000` para exibição. */
export function formatarCep(cep: string): string {
  const d = normalizarCep(cep);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}
