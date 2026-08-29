import { z } from "zod";

/**
 * A tela Calculadora não tem filtros — só um parâmetro `destaque` na URL, com o
 * ID da cotação que os cards do dashboard pedem para realçar (ring) ao navegar.
 */
export const filtrosCalculadoraSchema = z.object({
  destaque: z.string().optional(),
});

export type FiltrosCalculadora = z.infer<typeof filtrosCalculadoraSchema>;

export function validarFiltrosCalculadora(
  entrada: Record<string, unknown>,
): FiltrosCalculadora {
  const r = filtrosCalculadoraSchema.safeParse(entrada);
  return r.success ? r.data : {};
}
