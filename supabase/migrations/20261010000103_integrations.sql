-- Socle des intégrations (I00 du plan docs/AMELIORATIONS/PROPOSITIONS_2026-10-09.md, doc docs/INTEGRATIONS.md).
-- Une connexion par établissement et par fournisseur. Les clés sont chiffrées par le serveur (AES-GCM, clé
-- INTEGRATIONS_CLE dans Cloudflare) AVANT d'arriver ici : la base ne voit jamais une clé en clair, et l'interface ne
-- peut jamais la relire. Journal des appels, idempotence des événements reçus, désactivation en un clic.

-- ---------------------------------------------------------------------------
-- 1. Droit : réservé au gérant (les clés engagent l'établissement)
-- ---------------------------------------------------------------------------
insert into public.permissions (id, module_id, description) values
  ('etablissement.integrations', 'etablissement', 'Connecter, tester et désactiver les services externes (paiement, messages, agenda…)')
on conflict (id) do nothing;
insert into public.role_permissions (role_id, permission_id)
select 'gerant', 'etablissement.integrations' where exists (select 1 from public.roles where id = 'gerant')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
create table public.integrations_connexions (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  fournisseur text not null check (fournisseur ~ '^[a-z][a-z0-9_]{1,40}$'),
  mode text not null default 'test' check (mode in ('test', 'reel')),
  actif boolean not null default true,
  config jsonb not null default '{}' check (jsonb_typeof(config) = 'object' and length(config::text) <= 4000),
  secret_apercu text check (secret_apercu is null or length(secret_apercu) <= 16),
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_par uuid references auth.users(id) on delete restrict,
  modifie_le timestamptz not null default now(),
  desactive_le timestamptz,
  unique (etablissement_id, fournisseur)
);

-- Textes chiffrés seulement, dans une table sans aucune règle de lecture : personne ne la lit par l'API.
create table public.integrations_secrets (
  connexion_id uuid primary key references public.integrations_connexions(id) on delete restrict,
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  secret_chiffre text check (secret_chiffre is null or secret_chiffre ~ '^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'),
  webhook_secret_chiffre text check (webhook_secret_chiffre is null or webhook_secret_chiffre ~ '^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'),
  modifie_le timestamptz not null default now()
);

create table public.integrations_journal (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  connexion_id uuid not null references public.integrations_connexions(id) on delete restrict,
  sens text not null check (sens in ('sortant', 'entrant')),
  operation text not null check (length(operation) between 1 and 60),
  statut text not null check (statut in ('ok', 'erreur', 'refuse', 'doublon')),
  code_http integer check (code_http is null or code_http between 0 and 999),
  duree_ms integer check (duree_ms is null or duree_ms >= 0),
  reference_externe text check (reference_externe is null or length(reference_externe) <= 200),
  idempotence text check (idempotence is null or length(idempotence) <= 200),
  erreur text check (erreur is null or length(erreur) <= 500),
  par uuid references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now()
);
create index integrations_journal_connexion_idx on public.integrations_journal(connexion_id, cree_le desc);
-- Un même événement entrant (même identifiant chez le fournisseur) n'est traité qu'une fois.
create unique index integrations_journal_idempotence_idx on public.integrations_journal(connexion_id, sens, idempotence)
  where idempotence is not null and statut <> 'doublon';

alter table public.integrations_connexions enable row level security;
alter table public.integrations_secrets enable row level security;
alter table public.integrations_journal enable row level security;
create policy lecture on public.integrations_connexions for select to authenticated
  using (public.a_permission(etablissement_id, 'etablissement.integrations'));
create policy lecture on public.integrations_journal for select to authenticated
  using (public.a_permission(etablissement_id, 'etablissement.integrations'));
revoke all on public.integrations_secrets from anon, authenticated;

create trigger integrations_connexions_verrou_etablissement before update on public.integrations_connexions
  for each row execute function public.verrouiller_etablissement_id();
create trigger integrations_connexions_sans_suppression before delete on public.integrations_connexions
  for each row execute function public.refuser_suppression();
create trigger integrations_connexions_audit after insert or update or delete on public.integrations_connexions
  for each row execute function public.journaliser_modification();
create trigger integrations_secrets_sans_suppression before delete on public.integrations_secrets
  for each row execute function public.refuser_suppression();
create trigger integrations_journal_sans_modification before update on public.integrations_journal
  for each row execute function public.refuser_modification();
create trigger integrations_journal_sans_suppression before delete on public.integrations_journal
  for each row execute function public.refuser_suppression();

-- ---------------------------------------------------------------------------
-- 3. Fonctions appelées par le serveur avec le jeton de la personne (droit vérifié ici)
-- ---------------------------------------------------------------------------
create function public.enregistrer_connexion_integration(
  p_etablissement_id uuid, p_fournisseur text, p_mode text, p_config jsonb default '{}'::jsonb,
  p_secret_chiffre text default null, p_secret_apercu text default null, p_webhook_secret_chiffre text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  connexion public.integrations_connexions%rowtype;
begin
  perform public.exiger_permission(p_etablissement_id, 'etablissement.integrations');
  if p_fournisseur is null or p_fournisseur !~ '^[a-z][a-z0-9_]{1,40}$' then raise exception 'Fournisseur inconnu'; end if;
  if p_mode not in ('test', 'reel') then raise exception 'Mode inconnu : test ou reel'; end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' or length(p_config::text) > 4000 then raise exception 'Réglages invalides'; end if;
  -- Une clé ne se range jamais dans les réglages en clair.
  if exists (select 1 from jsonb_object_keys(p_config) k where k ~* '(secret|cle|key|token|password|mot_de_passe)') then
    raise exception 'Une clé secrète ne se met pas dans les réglages';
  end if;
  insert into public.integrations_connexions(etablissement_id, fournisseur, mode, config, secret_apercu, cree_par, modifie_par)
  values (p_etablissement_id, p_fournisseur, p_mode, p_config, nullif(left(p_secret_apercu, 16), ''), auth.uid(), auth.uid())
  on conflict (etablissement_id, fournisseur) do update
    set mode = excluded.mode, config = excluded.config, actif = true, desactive_le = null,
        secret_apercu = coalesce(excluded.secret_apercu, public.integrations_connexions.secret_apercu),
        modifie_par = auth.uid(), modifie_le = now()
  returning * into connexion;
  insert into public.integrations_secrets(connexion_id, etablissement_id, secret_chiffre, webhook_secret_chiffre)
  values (connexion.id, connexion.etablissement_id, p_secret_chiffre, p_webhook_secret_chiffre)
  on conflict (connexion_id) do update
    set secret_chiffre = coalesce(excluded.secret_chiffre, public.integrations_secrets.secret_chiffre),
        webhook_secret_chiffre = coalesce(excluded.webhook_secret_chiffre, public.integrations_secrets.webhook_secret_chiffre),
        modifie_le = now();
  return connexion.id;
end
$$;

create function public.desactiver_connexion_integration(p_connexion_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  connexion public.integrations_connexions%rowtype;
begin
  select * into connexion from public.integrations_connexions where id = p_connexion_id for update;
  if connexion.id is null then raise exception 'Connexion introuvable'; end if;
  perform public.exiger_permission(connexion.etablissement_id, 'etablissement.integrations');
  update public.integrations_connexions set actif = false, desactive_le = now(), modifie_par = auth.uid(), modifie_le = now()
  where id = connexion.id;
end
$$;

-- Textes chiffrés pour le serveur (seul lui détient la clé de déchiffrement). Jamais appelée par l'interface.
create function public.lire_secrets_integration(p_connexion_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  connexion public.integrations_connexions%rowtype;
  secrets public.integrations_secrets%rowtype;
begin
  select * into connexion from public.integrations_connexions where id = p_connexion_id;
  if connexion.id is null then raise exception 'Connexion introuvable'; end if;
  perform public.exiger_permission(connexion.etablissement_id, 'etablissement.integrations');
  select * into secrets from public.integrations_secrets where connexion_id = connexion.id;
  return jsonb_build_object('id', connexion.id, 'etablissement_id', connexion.etablissement_id, 'fournisseur', connexion.fournisseur,
    'mode', connexion.mode, 'actif', connexion.actif, 'config', connexion.config,
    'secret_chiffre', secrets.secret_chiffre, 'webhook_secret_chiffre', secrets.webhook_secret_chiffre);
end
$$;

create function public.journaliser_appel_integration(
  p_connexion_id uuid, p_operation text, p_statut text, p_code_http integer default null, p_duree_ms integer default null,
  p_reference text default null, p_erreur text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  connexion public.integrations_connexions%rowtype;
begin
  select * into connexion from public.integrations_connexions where id = p_connexion_id;
  if connexion.id is null then raise exception 'Connexion introuvable'; end if;
  perform public.exiger_permission(connexion.etablissement_id, 'etablissement.integrations');
  insert into public.integrations_journal(etablissement_id, connexion_id, sens, operation, statut, code_http, duree_ms, reference_externe, erreur, par)
  values (connexion.etablissement_id, connexion.id, 'sortant', left(p_operation, 60), p_statut, p_code_http, p_duree_ms,
    left(p_reference, 200), left(p_erreur, 500), auth.uid());
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Événements entrants (webhooks) : appelés par le serveur avec la clé service, jamais par une personne
-- ---------------------------------------------------------------------------
create function public.connexion_pour_webhook(p_connexion_id uuid, p_fournisseur text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', c.id, 'etablissement_id', c.etablissement_id, 'mode', c.mode, 'actif', c.actif,
    'webhook_secret_chiffre', s.webhook_secret_chiffre)
  from public.integrations_connexions c
  left join public.integrations_secrets s on s.connexion_id = c.id
  where c.id = p_connexion_id and c.fournisseur = p_fournisseur
$$;

-- Idempotent : un événement déjà reçu (même identifiant) est noté « doublon » et n'est pas retraité.
create function public.recevoir_evenement_integration(
  p_connexion_id uuid, p_evenement text, p_type text, p_statut text, p_erreur text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  connexion public.integrations_connexions%rowtype;
begin
  select * into connexion from public.integrations_connexions where id = p_connexion_id;
  if connexion.id is null then raise exception 'Connexion introuvable'; end if;
  if p_evenement is null or length(p_evenement) not between 1 and 200 then raise exception 'Identifiant d''événement manquant'; end if;
  if p_statut not in ('ok', 'refuse', 'erreur') then raise exception 'Statut inconnu'; end if;
  if p_statut = 'ok' and exists (
    select 1 from public.integrations_journal
    where connexion_id = connexion.id and sens = 'entrant' and idempotence = p_evenement and statut <> 'doublon'
  ) then
    insert into public.integrations_journal(etablissement_id, connexion_id, sens, operation, statut, idempotence)
    values (connexion.etablissement_id, connexion.id, 'entrant', left(coalesce(p_type, 'evenement'), 60), 'doublon', p_evenement);
    return jsonb_build_object('doublon', true);
  end if;
  insert into public.integrations_journal(etablissement_id, connexion_id, sens, operation, statut, idempotence, erreur)
  values (connexion.etablissement_id, connexion.id, 'entrant', left(coalesce(p_type, 'evenement'), 60), p_statut,
    case when p_statut = 'ok' then p_evenement end, left(p_erreur, 500));
  return jsonb_build_object('doublon', false);
end
$$;

revoke execute on function public.enregistrer_connexion_integration(uuid, text, text, jsonb, text, text, text) from public, anon;
grant execute on function public.enregistrer_connexion_integration(uuid, text, text, jsonb, text, text, text) to authenticated;
revoke execute on function public.desactiver_connexion_integration(uuid) from public, anon;
grant execute on function public.desactiver_connexion_integration(uuid) to authenticated;
revoke execute on function public.lire_secrets_integration(uuid) from public, anon;
grant execute on function public.lire_secrets_integration(uuid) to authenticated;
revoke execute on function public.journaliser_appel_integration(uuid, text, text, integer, integer, text, text) from public, anon;
grant execute on function public.journaliser_appel_integration(uuid, text, text, integer, integer, text, text) to authenticated;
revoke execute on function public.connexion_pour_webhook(uuid, text) from public, anon, authenticated;
grant execute on function public.connexion_pour_webhook(uuid, text) to service_role;
revoke execute on function public.recevoir_evenement_integration(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.recevoir_evenement_integration(uuid, text, text, text, text) to service_role;

notify pgrst, 'reload schema';
