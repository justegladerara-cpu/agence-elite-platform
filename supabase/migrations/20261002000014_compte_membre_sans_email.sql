-- Créer directement un compte d'équipe, sans e-mail, sans invitation à accepter.
-- La personne reçoit un identifiant et un mot de passe temporaire (à remplacer à la 1re connexion,
-- contrôle déjà assuré par comptes_connexion.doit_changer_mot_de_passe). Supabase Auth garde seul le
-- mot de passe (haché). Non destructive : aucune fonction existante n'est modifiée.

-- Création du compte Auth, réservée aux fonctions ci-dessous (aucun rôle ne peut l'appeler).
create function public.creer_compte_auth(
  p_email text,
  p_identifiant text,
  p_nom text,
  p_mot_de_passe_temporaire text,
  p_expire_jours integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  courriel text := lower(btrim(coalesce(p_email, '')));
  v_identifiant text := public.normaliser_identifiant(p_identifiant);
  nouvel_id uuid := gen_random_uuid();
begin
  if v_identifiant is null or v_identifiant !~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,39}$' then
    raise exception 'Identifiant invalide : 3 à 40 caractères (lettres, chiffres, point, tiret)';
  end if;
  if courriel = '' then
    courriel := lower(v_identifiant) || '@identifiants.agence-elite.fr';
  end if;
  if courriel !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Adresse e-mail invalide';
  end if;
  if coalesce(length(p_mot_de_passe_temporaire), 0) < 4 then
    raise exception 'Le mot de passe temporaire doit contenir au moins 4 caractères';
  end if;
  if exists (select 1 from public.comptes_connexion where lower(identifiant) = lower(v_identifiant)) then
    raise exception 'Cet identifiant est déjà utilisé';
  end if;
  if exists (select 1 from auth.users where lower(email) = courriel) then
    raise exception 'Un compte existe déjà avec cette adresse';
  end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', nouvel_id, 'authenticated', 'authenticated', courriel,
    extensions.crypt(p_mot_de_passe_temporaire, extensions.gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nom', nullif(btrim(coalesce(p_nom, '')), '')), now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), nouvel_id, nouvel_id::text,
    jsonb_build_object('sub', nouvel_id::text, 'email', courriel, 'email_verified', true), 'email', null, now(), now());
  insert into public.comptes_connexion (user_id, identifiant, doit_changer_mot_de_passe, temporaire_expire_le, cree_par)
  values (nouvel_id, v_identifiant, true, now() + make_interval(days => greatest(coalesce(p_expire_jours, 30), 1)), auth.uid());
  return nouvel_id;
end
$$;
revoke execute on function public.creer_compte_auth(text, text, text, text, integer) from public, anon, authenticated;

-- Compte + place dans l'équipe en une seule opération.
-- Autorisé : Agence Elite (super admin ou admin), ou un membre qui gère l'équipe (rôle ≤ le sien).
create function public.creer_membre_sans_email(
  p_etablissement_id uuid,
  p_identifiant text,
  p_nom text,
  p_role_id text,
  p_mot_de_passe_temporaire text,
  p_hubs uuid[] default null,
  p_email text default null,
  p_expire_jours integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  nouvel_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Une authentification est requise';
  end if;
  if coalesce(btrim(p_nom), '') = '' then
    raise exception 'Le nom est obligatoire';
  end if;
  if not exists (select 1 from public.roles where id = p_role_id) then
    raise exception 'Rôle inconnu';
  end if;
  if public.est_editeur() then
    if not exists (select 1 from public.etablissements where id = p_etablissement_id and statut <> 'archive') then
      raise exception 'Établissement introuvable';
    end if;
  else
    perform public.exiger_gestion_membres(p_etablissement_id, p_role_id);
    -- Une vraie adresse ne peut être rattachée que par Agence Elite (évite de « réserver » l'e-mail d'autrui).
    if coalesce(btrim(p_email), '') <> '' then
      raise exception 'Seul Agence Elite peut rattacher une adresse e-mail' using errcode = '42501';
    end if;
  end if;
  if exists (
    select 1 from unnest(coalesce(p_hubs, '{}')) h(id)
    where not exists (select 1 from public.hubs x where x.id = h.id and x.etablissement_id = p_etablissement_id and x.actif)
  ) then
    raise exception 'Hub inconnu dans cet établissement';
  end if;

  nouvel_id := public.creer_compte_auth(p_email, p_identifiant, p_nom, p_mot_de_passe_temporaire, p_expire_jours);
  insert into public.etablissement_membres (etablissement_id, user_id, role_id)
  values (p_etablissement_id, nouvel_id, p_role_id);
  insert into public.membre_hubs (etablissement_id, user_id, hub_id, cree_par)
  select distinct p_etablissement_id, nouvel_id, h, auth.uid() from unnest(coalesce(p_hubs, '{}')) h;

  return jsonb_build_object('user_id', nouvel_id, 'identifiant', public.normaliser_identifiant(p_identifiant));
end
$$;
revoke execute on function public.creer_membre_sans_email(uuid, text, text, text, text, uuid[], text, integer) from public, anon;
grant execute on function public.creer_membre_sans_email(uuid, text, text, text, text, uuid[], text, integer) to authenticated;
