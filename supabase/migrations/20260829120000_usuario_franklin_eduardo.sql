-- ===========================================================================
-- Migration: cria o usuário Franklin Eduardo
--   email: eduardo@rodomarques.com
--   senha: Rodomarques@2026
--
-- Insere direto no schema `auth` (users + identities) com a senha já
-- criptografada em bcrypt (pgcrypto). Idempotente: se o usuário já existir,
-- apenas garante a senha e o profile.
--
-- Rodar via Supabase CLI (`supabase db push`) OU colar no SQL Editor do painel.
-- Depende de `supabase/full_setup.sql` já ter sido aplicado (tabela
-- `public.profiles` e trigger `handle_new_user`).
-- ===========================================================================

-- pgcrypto no Supabase fica no schema `extensions`; garante `crypt`/`gen_salt`.
set search_path = public, extensions, auth;

do $$
declare
  v_email   text := 'eduardo@rodomarques.com';
  v_senha   text := 'Rodomarques@2026';
  v_nome    text := 'Franklin Eduardo';
  v_role    text := 'admin';   -- troque para 'funcionario' se preferir
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where email = v_email;

  if v_user_id is null then
    v_user_id := gen_random_uuid();

    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_senha, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('nome', v_nome, 'role', v_role),
      now(),
      now(),
      '', '', '', ''
    );

    -- identidade de e-mail (necessária para login com senha no GoTrue atual)
    insert into auth.identities (
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      v_user_id::text,
      v_user_id,
      jsonb_build_object(
        'sub', v_user_id::text,
        'email', v_email,
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      now(),
      now(),
      now()
    );

    raise notice 'Usuário criado: % (%)', v_email, v_user_id;
  else
    update auth.users
       set encrypted_password = crypt(v_senha, gen_salt('bf')),
           email_confirmed_at  = coalesce(email_confirmed_at, now()),
           raw_user_meta_data  = raw_user_meta_data
                                 || jsonb_build_object('nome', v_nome, 'role', v_role),
           updated_at          = now()
     where id = v_user_id;

    raise notice 'Usuário já existia, senha atualizada: % (%)', v_email, v_user_id;
  end if;

  -- profile: o trigger handle_new_user já cria a partir do metadata;
  -- este upsert reforça nome/role e cobre o caso do trigger não ter rodado.
  insert into public.profiles (id, nome, email, role)
  values (v_user_id, v_nome, v_email, v_role)
  on conflict (id) do update
     set nome = excluded.nome,
         role = excluded.role,
         email = excluded.email;
end $$;
