-- ===========================================================================
-- Migration: cotação sem campo "observacoes"
--
--  * remove cotacoes.observacoes
--
-- Idempotente. Rodar via `supabase db push` OU colando no SQL Editor.
-- ===========================================================================

begin;

alter table public.cotacoes drop column if exists observacoes;

commit;
