-- ===========================================================================
-- TL Frete — setup completo do backend (Supabase / Postgres)
-- Script ÚNICO e IDEMPOTENTE: pode ser rodado várias vezes sem quebrar.
-- Rode no SQL Editor do painel do Supabase.
-- ===========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- TABELAS
-- ---------------------------------------------------------------------------

-- profiles: 1:1 com auth.users. `id` é o próprio uuid do usuário.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '',
  email text not null default '',
  role text not null default 'funcionario' check (role in ('admin', 'funcionario')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- cotacoes: entidade PAI. PK de texto (o app gera o slug do nome).
create table if not exists public.cotacoes (
  id text primary key,
  nome text not null,
  cep_origem text not null default '',
  cep_destino text not null default '',
  distancia_km numeric not null default 0,
  -- tarifa por faixa: "a cada `km_faixa` km, cobra-se `valor_faixa` reais"
  km_faixa numeric not null default 0,
  valor_faixa numeric not null default 0,
  -- polilinha [lat, lon] do melhor trajeto (OSRM); null quando não roteado
  rota jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- pedagios: entidade FILHA. Padrão pai/filho: FK com on delete cascade e
-- coluna `posicao`. É apenas registro — sem workflow de status.
create table if not exists public.pedagios (
  id text primary key,
  cotacao_id text not null references public.cotacoes(id) on delete cascade,
  praca text not null default '',
  valor numeric not null default 0,
  posicao integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pedagios_cotacao on public.pedagios (cotacao_id);

-- ---------------------------------------------------------------------------
-- FUNÇÕES
-- ---------------------------------------------------------------------------

-- Mantém updated_at sempre atualizado.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Cria o profile automaticamente quando um usuário nasce em auth.users.
-- Lê nome/role do raw_user_meta_data (enviado no signUp / admin.createUser).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nome, email, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)),
    coalesce(new.email, ''),
    case when new.raw_user_meta_data ->> 'role' = 'admin' then 'admin' else 'funcionario' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- is_admin(): usada nas policies de RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- TRIGGERS
-- ---------------------------------------------------------------------------

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists trg_set_updated_at_profiles on public.profiles;
create trigger trg_set_updated_at_profiles
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at_cotacoes on public.cotacoes;
create trigger trg_set_updated_at_cotacoes
  before update on public.cotacoes
  for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at_pedagios on public.pedagios;
create trigger trg_set_updated_at_pedagios
  before update on public.pedagios
  for each row execute function public.set_updated_at();

-- (não há mais trigger de guarda em pedagios — a tabela é só registro)
drop trigger if exists trg_pedagios_guard_update on public.pedagios;
drop function if exists public.pedagios_guard_update();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.cotacoes enable row level security;
alter table public.pedagios enable row level security;

-- profiles: cada um vê/edita o seu; admin vê/edita todos.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete to authenticated
  using (public.is_admin());

-- cotacoes: todos autenticados leem; só admin escreve.
drop policy if exists cotacoes_select on public.cotacoes;
create policy cotacoes_select on public.cotacoes
  for select to authenticated
  using (true);

drop policy if exists cotacoes_insert on public.cotacoes;
create policy cotacoes_insert on public.cotacoes
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists cotacoes_update on public.cotacoes;
create policy cotacoes_update on public.cotacoes
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists cotacoes_delete on public.cotacoes;
create policy cotacoes_delete on public.cotacoes
  for delete to authenticated
  using (public.is_admin());

-- pedagios: todos autenticados leem; escrita (insert/update/delete) só admin.
drop policy if exists pedagios_select on public.pedagios;
create policy pedagios_select on public.pedagios
  for select to authenticated
  using (true);

drop policy if exists pedagios_insert on public.pedagios;
create policy pedagios_insert on public.pedagios
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists pedagios_update on public.pedagios;
create policy pedagios_update on public.pedagios
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists pedagios_delete on public.pedagios;
create policy pedagios_delete on public.pedagios
  for delete to authenticated
  using (public.is_admin());

-- ===========================================================================
-- DADOS — seed de demonstração (idempotente via on conflict do nothing)
-- Serve só para validar o fluxo visual. Nenhum vínculo com auth.users.
-- ===========================================================================

insert into public.cotacoes
  (id, nome, cep_origem, cep_destino, distancia_km, km_faixa, valor_faixa)
values
  ('entrega-sp-campinas', 'São Paulo/SP → Campinas/SP', '01001000', '13010000', 95.0, 50, 160.00),
  ('coleta-guarulhos-santos', 'Guarulhos/SP → Santos/SP', '07010000', '11010000', 85.0, 50, 175.00),
  ('distribuicao-rj-bh', 'Rio de Janeiro/RJ → Belo Horizonte/MG', '20040002', '30140071', 440.0, 100, 410.00),
  ('transferencia-curitiba-floripa', 'Curitiba/PR → Florianópolis/SC', '80010000', '88010000', 300.0, 100, 380.00),
  ('entrega-brasilia-goiania', 'Brasília/DF → Goiânia/GO', '70040010', '74003010', 210.0, 50, 180.00),
  ('coleta-campinas-ribeirao', 'Campinas/SP → Ribeirão Preto/SP', '13010000', '14010000', 215.0, 50, 170.00)
on conflict (id) do nothing;

insert into public.pedagios
  (id, cotacao_id, praca, valor, posicao)
values
  -- entrega-sp-campinas
  ('entrega-sp-campinas-anhanguera-jundiai', 'entrega-sp-campinas', 'Anhanguera — Praça Jundiaí', 12.40, 0),
  ('entrega-sp-campinas-valinhos', 'entrega-sp-campinas', 'Praça Valinhos', 8.90, 1),
  ('entrega-sp-campinas-louveira', 'entrega-sp-campinas', 'Praça Louveira', 6.70, 2),
  -- coleta-guarulhos-santos
  ('coleta-guarulhos-santos-anchieta-sbc', 'coleta-guarulhos-santos', 'Anchieta — Praça São Bernardo', 15.20, 0),
  ('coleta-guarulhos-santos-cubatao', 'coleta-guarulhos-santos', 'Praça Cubatão', 10.10, 1),
  ('coleta-guarulhos-santos-imigrantes-diadema', 'coleta-guarulhos-santos', 'Imigrantes — Praça Diadema', 16.40, 2),
  -- distribuicao-rj-bh
  ('distribuicao-rj-bh-dutra-volta-redonda', 'distribuicao-rj-bh', 'Via Dutra — Praça Volta Redonda', 18.70, 0),
  ('distribuicao-rj-bh-fernao-dias-betim', 'distribuicao-rj-bh', 'Fernão Dias — Praça Betim', 14.30, 1),
  ('distribuicao-rj-bh-tres-coracoes', 'distribuicao-rj-bh', 'Praça Três Corações', 11.80, 2),
  -- transferencia-curitiba-floripa
  ('transferencia-curitiba-floripa-br116-mafra', 'transferencia-curitiba-floripa', 'BR-116 — Praça Mafra', 9.50, 0),
  ('transferencia-curitiba-floripa-br101-garuva', 'transferencia-curitiba-floripa', 'BR-101 — Praça Garuva', 12.00, 1),
  ('transferencia-curitiba-floripa-palhoca', 'transferencia-curitiba-floripa', 'Praça Palhoça', 8.40, 2),
  -- entrega-brasilia-goiania
  ('entrega-brasilia-goiania-br060-alexania', 'entrega-brasilia-goiania', 'BR-060 — Praça Alexânia', 10.90, 0),
  ('entrega-brasilia-goiania-abadiania', 'entrega-brasilia-goiania', 'Praça Abadiânia', 9.20, 1),
  ('entrega-brasilia-goiania-anapolis', 'entrega-brasilia-goiania', 'Praça Anápolis', 8.10, 2),
  -- coleta-campinas-ribeirao
  ('coleta-campinas-ribeirao-bandeirantes-cordeiropolis', 'coleta-campinas-ribeirao', 'Bandeirantes — Praça Cordeirópolis', 13.10, 0),
  ('coleta-campinas-ribeirao-pirassununga', 'coleta-campinas-ribeirao', 'Praça Pirassununga', 10.60, 1),
  ('coleta-campinas-ribeirao-santa-rita', 'coleta-campinas-ribeirao', 'Anhanguera — Praça Santa Rita', 9.80, 2)
on conflict (id) do nothing;

-- ===========================================================================
-- PASSO MANUAL — promover o primeiro administrador
-- ---------------------------------------------------------------------------
-- 1. Crie um usuário normalmente (tela de login do app dá erro de acesso até
--    existir a conta; use o painel Authentication > Users do Supabase, ou o
--    endpoint de signUp, para criar o primeiro).
-- 2. Rode, trocando pelo e-mail real:
--
--    update public.profiles set role = 'admin' where email = 'voce@empresa.com.br';
--
-- A partir daí esse usuário pode criar os demais pela tela "Equipe".
-- ===========================================================================
