-- ===========================================================================
-- Migration: pedágio vira só registro (sem workflow de confirmação)
--
--  * remove pedagios.status
--  * remove o trigger/função pedagios_guard_update
--  * pedagios_update passa a ser só admin (como insert/delete)
--
-- Idempotente. Rodar via `supabase db push` OU colando no SQL Editor.
-- ===========================================================================

begin;

drop trigger if exists trg_pedagios_guard_update on public.pedagios;
drop function if exists public.pedagios_guard_update();

alter table public.pedagios drop column if exists status;

drop policy if exists pedagios_update on public.pedagios;
create policy pedagios_update on public.pedagios
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

commit;
