-- ===========================================================================
-- Migration: cadastro (catálogo) de praças de pedágio
--
--  * cria public.pracas_pedagio { uf, praca, valor, atualizado_em }
--  * trigger de updated_at
--  * RLS: todos autenticados leem; só admin escreve (igual a cotacoes/pedagios)
--
-- É um catálogo de referência mantido pelo admin — NÃO tem vínculo com
-- cotacoes.pedagios (aquela é a lista por cálculo).
--
-- Idempotente. Rodar via `supabase db push` OU colando no SQL Editor.
-- ===========================================================================

begin;

create table if not exists public.pracas_pedagio (
  id uuid primary key default gen_random_uuid(),
  uf text not null,
  praca text not null,
  valor numeric not null default 0,
  -- data da última atualização feita pelo admin (a app grava a cada insert/update)
  atualizado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pracas_pedagio_uf on public.pracas_pedagio (uf);

drop trigger if exists trg_set_updated_at_pracas_pedagio on public.pracas_pedagio;
create trigger trg_set_updated_at_pracas_pedagio
  before update on public.pracas_pedagio
  for each row execute function public.set_updated_at();

alter table public.pracas_pedagio enable row level security;

drop policy if exists pracas_pedagio_select on public.pracas_pedagio;
create policy pracas_pedagio_select on public.pracas_pedagio
  for select to authenticated
  using (true);

drop policy if exists pracas_pedagio_insert on public.pracas_pedagio;
create policy pracas_pedagio_insert on public.pracas_pedagio
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists pracas_pedagio_update on public.pracas_pedagio;
create policy pracas_pedagio_update on public.pracas_pedagio
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists pracas_pedagio_delete on public.pracas_pedagio;
create policy pracas_pedagio_delete on public.pracas_pedagio
  for delete to authenticated
  using (public.is_admin());

commit;
