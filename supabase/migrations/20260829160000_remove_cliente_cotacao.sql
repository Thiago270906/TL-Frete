-- ===========================================================================
-- Migration: cotação sem campo "cliente"
--
--  * remove cotacoes.cliente
--
-- O nome da cotação passa a ser gerado pelas cidades dos CEPs
-- (`Cidade/UF → Cidade/UF`), então o campo livre de cliente não é mais usado.
--
-- Idempotente. Rodar via `supabase db push` OU colando no SQL Editor.
-- ===========================================================================

begin;

alter table public.cotacoes drop column if exists cliente;

commit;
