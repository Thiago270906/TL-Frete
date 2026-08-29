-- ===========================================================================
-- Migration: guarda o trajeto da cotação
--
--  * adiciona cotacoes.rota (jsonb) — polilinha [lat, lon] do melhor trajeto
--    calculada via OSRM ao "Calcular distância". Null quando não roteado.
--
-- Idempotente. Rodar via `supabase db push` OU colando no SQL Editor.
-- ===========================================================================

begin;

alter table public.cotacoes add column if not exists rota jsonb;

commit;
