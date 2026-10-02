-- Complément du simulateur Supabase (PGlite) : colonnes d'auth.users, auth.identities et
-- fonctions extensions.crypt / gen_salt simulées. Idempotent : appliqué à chaque démarrage,
-- y compris sur une base locale créée avant ce fichier. Jamais utilisé en production.
alter table auth.users add column if not exists instance_id uuid;
alter table auth.users add column if not exists aud text;
alter table auth.users add column if not exists role text;
alter table auth.users add column if not exists encrypted_password text;
alter table auth.users add column if not exists email_confirmed_at timestamptz;
alter table auth.users add column if not exists raw_app_meta_data jsonb;
alter table auth.users add column if not exists raw_user_meta_data jsonb;
alter table auth.users add column if not exists created_at timestamptz default now();
alter table auth.users add column if not exists updated_at timestamptz default now();
alter table auth.users add column if not exists last_sign_in_at timestamptz;
alter table auth.users add column if not exists banned_until timestamptz;
alter table auth.users add column if not exists confirmation_token text;
alter table auth.users add column if not exists recovery_token text;
alter table auth.users add column if not exists email_change_token_new text;
alter table auth.users add column if not exists email_change text;
create table if not exists auth.identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  provider_id text,
  identity_data jsonb,
  provider text,
  last_sign_in_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;
-- Hachage simulé (PGlite n'a pas pgcrypto) : déterministe, suffisant pour les tests.
create or replace function extensions.gen_salt(p_type text) returns text language sql volatile as $$
  select 'sim$' || substr(md5(random()::text), 1, 8) || '$'
$$;
-- Comme bcrypt : le sel est lu au début du haché, donc crypt(mdp, haché) = haché si mdp est juste.
create or replace function extensions.crypt(p_mot_de_passe text, p_sel text) returns text language sql immutable as $$
  select prefixe || md5(prefixe || p_mot_de_passe)
  from (select substring(p_sel from '^sim\$[0-9a-f]*\$') as prefixe) s
$$;
