-- ===========================================================================
-- Migration: ajuste do modelo de cotação
--
--  * cotacoes.valor_km (R$/km)  ->  cotacoes.km_faixa + cotacoes.valor_faixa
--       tarifa passa a ser "a cada `km_faixa` km, cobra-se `valor_faixa` reais".
--       Conversão dos dados existentes: km_faixa = 1, valor_faixa = valor_km
--       (mantém exatamente o mesmo custo por km).
--  * remove cotacoes.prioridade e cotacoes.ativo
--  * remove pedagios.responsavel
--  * simplifica pedagios_guard_update (não compara mais `responsavel`)
--
-- Idempotente. Rodar via `supabase db push` OU colando no SQL Editor.
-- ===========================================================================

begin;

alter table public.cotacoes add column if not exists km_faixa numeric not null default 0;
alter table public.cotacoes add column if not exists valor_faixa numeric not null default 0;

-- converte a tarifa antiga só se a coluna valor_km ainda existir
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cotacoes'
      and column_name = 'valor_km'
  ) then
    execute $sql$
      update public.cotacoes
         set km_faixa = 1,
             valor_faixa = coalesce(valor_km, 0)
       where km_faixa = 0 and valor_faixa = 0
    $sql$;
  end if;
end $$;

alter table public.cotacoes drop column if exists valor_km;
alter table public.cotacoes drop column if exists prioridade;
alter table public.cotacoes drop column if exists ativo;

alter table public.pedagios drop column if exists responsavel;

-- trigger da tabela filha sem a regra de "responsável"
create or replace function public.pedagios_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.cotacao_id is distinct from old.cotacao_id
     or new.praca is distinct from old.praca
     or new.valor is distinct from old.valor
     or new.posicao is distinct from old.posicao then
    raise exception 'Apenas administradores podem editar o pedágio (exceto o status).';
  end if;

  return new;
end;
$$;

commit;
