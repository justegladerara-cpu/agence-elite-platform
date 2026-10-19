-- Mission 01 (audit du 19/10/2026, SEC-01) : double authentification (TOTP, Supabase Auth MFA) pour l'équipe
-- Agence Elite (plateforme_admins : super_admin, admin, support), contrôlée PAR LA BASE.
--
-- Principe (même règle que private.mfa_ok() du CRM, plus stricte) :
--   * Un compte de l'équipe qui a un facteur TOTP vérifié n'a ses droits d'administration qu'avec une session
--     validée par le code (jeton aal2). Mot de passe seul (aal1) = aucun droit d'administration.
--   * Transition sans verrouillage : tant que le mode « obligatoire » n'est pas activé, un compte de l'équipe SANS
--     facteur garde ses droits en aal1 (il peut ainsi enrôler son téléphone). Le mode obligatoire ne s'active que
--     si TOUS les comptes actifs de l'équipe ont déjà un facteur vérifié (fonction definir_mfa_admin_obligatoire).
--   * Session révoquée (déconnexion, « fermer les autres sessions », réinitialisation) = plus aucun droit
--     d'administration, même si le jeton d'accès n'a pas encore expiré (contrôle de auth.sessions).
--   * Droits d'administration limités à 12 heures après la connexion : ensuite, il faut se reconnecter.
--   * Le contrôle est dans est_super_admin() / est_editeur() : les 80 fonctions et 27 politiques qui s'en servent
--     (exiger_super_admin, exiger_editeur, RLS) en profitent sans être réécrites. Les deux fonctions de session
--     support, qui lisaient plateforme_admins directement, passent par le même contrôle.
--   * Journal : connexions, facteurs et opérations de sécurité de l'équipe dans public.evenements (ajout seul),
--     lisibles par les super administrateurs.
-- Non destructive : aucune donnée supprimée, aucun compte modifié. Retour arrière : voir docs/SOP/91_DOUBLE_AUTHENTIFICATION.md.

-- Réglages de sécurité de la plateforme (une seule ligne) ---------------------------------------------------
create table public.securite_plateforme (
  id boolean primary key default true check (id),
  mfa_admin_obligatoire boolean not null default false,
  duree_session_admin interval not null default interval '12 hours'
    check (duree_session_admin between interval '15 minutes' and interval '7 days'),
  modifie_le timestamptz not null default now(),
  modifie_par uuid references auth.users(id) on delete restrict
);
insert into public.securite_plateforme default values;
alter table public.securite_plateforme enable row level security;
-- Aucune politique : lecture et écriture uniquement par les fonctions ci-dessous.
revoke all on public.securite_plateforme from anon, authenticated;

-- Briques de contrôle (appelées par les fonctions d'accès ; aucune n'est appelable directement) -------------

-- Niveau d'authentification du jeton : 'aal2' seulement après le code TOTP.
create function public.session_aal()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(auth.jwt() ->> 'aal', ''), 'aal1')
$$;

-- Le jeton correspond-il à une session encore ouverte dans Supabase Auth ?
-- Un jeton sans session_id n'est pas un jeton d'utilisateur Supabase (simulateur local, clé de service) :
-- il ne donne de droits d'administration que si le reste des contrôles le permet.
create function public.session_admin_valide()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session uuid;
  v_cree timestamptz;
  v_fin timestamptz;
  v_duree interval;
begin
  begin
    v_session := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when others then
    return false;
  end;
  if v_session is null then
    return true;
  end if;
  select s.created_at, s.not_after into v_cree, v_fin
  from auth.sessions s
  where s.id = v_session and s.user_id = auth.uid();
  if not found then
    return false;
  end if;
  select duree_session_admin into v_duree from public.securite_plateforme where id;
  return (v_fin is null or v_fin > now())
    and (v_cree is null or v_cree > now() - coalesce(v_duree, interval '12 hours'));
end
$$;

create function public.a_facteur_mfa_verifie(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.mfa_factors f
    where f.user_id = p_user_id and f.status::text = 'verified'
  )
$$;

-- Règle MFA de l'équipe, pour la personne connectée.
create function public.admin_mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.session_admin_valide() and (
    public.session_aal() = 'aal2'
    or (
      not coalesce((select mfa_admin_obligatoire from public.securite_plateforme where id), false)
      and not public.a_facteur_mfa_verifie(auth.uid())
    )
  )
$$;

revoke execute on function public.session_admin_valide() from public, anon, authenticated;
revoke execute on function public.a_facteur_mfa_verifie(uuid) from public, anon, authenticated;
revoke execute on function public.admin_mfa_ok() from public, anon, authenticated;
revoke execute on function public.session_aal() from public, anon;

-- Fonctions d'accès : même définition qu'avant + admin_mfa_ok() en dernier (évalué seulement pour l'équipe) -----
create or replace function public.est_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.compte_pret() and exists (
    select 1 from public.plateforme_admins
    where user_id = auth.uid() and role = 'super_admin' and actif
  ) and public.admin_mfa_ok()
$$;

create or replace function public.est_editeur()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.compte_pret() and exists (
    select 1 from public.plateforme_admins
    where user_id = auth.uid() and role in ('super_admin', 'admin') and actif
  ) and public.admin_mfa_ok()
$$;

-- Membre actif de l'équipe (tous rôles, y compris « support »), compte prêt et règle MFA respectée.
create function public.est_equipe_plateforme()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.compte_pret() and exists (
    select 1 from public.plateforme_admins where user_id = auth.uid() and actif
  ) and public.admin_mfa_ok()
$$;

-- Sessions support : elles lisaient plateforme_admins directement (sans compte prêt ni MFA). Corps identique
-- à la version en production, seul le contrôle d'accès change.
create or replace function public.ouvrir_session_support(p_etablissement_id uuid, p_motif text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid;
begin
  if not public.est_equipe_plateforme() then
    raise exception 'Réservé à l''équipe Agence Elite' using errcode = '42501';
  end if;
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Le motif de la session support est obligatoire';
  end if;
  if not exists (select 1 from public.etablissements where id = p_etablissement_id) then
    raise exception 'Établissement introuvable';
  end if;
  -- Une seule session ouverte par administrateur et établissement.
  update public.sessions_support set fermee_le = now()
  where admin_id = auth.uid() and etablissement_id = p_etablissement_id and fermee_le is null;
  insert into public.sessions_support(admin_id, etablissement_id, motif)
  values (auth.uid(), p_etablissement_id, btrim(p_motif))
  returning id into resultat;
  return resultat;
end
$$;

create or replace function public.session_support_active(p_etablissement_id uuid, p_ecriture boolean default false)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.compte_pret() and exists (
    select 1
    from public.sessions_support s
    join public.plateforme_admins a on a.user_id = s.admin_id
    where s.admin_id = auth.uid()
      and s.etablissement_id = p_etablissement_id
      and s.fermee_le is null
      and s.ouverte_le > now() - interval '8 hours'
      and a.actif
      and (not p_ecriture or s.autorise_ecriture)
  ) and public.admin_mfa_ok()
$$;

-- Journal de sécurité (dans public.evenements, ajout seul) ---------------------------------------------------
-- acteur reste vide (la clé étrangère « restrict » bloquerait la suppression d'un compte) : la personne est dans donnees.
create function public.journaliser_securite_interne(p_type text, p_user_id uuid, p_donnees jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.evenements (etablissement_id, client_id, type, acteur, donnees)
  values (null, null, 'securite.' || p_type, null,
          jsonb_build_object('compte', p_user_id) || coalesce(p_donnees, '{}'::jsonb));
end
$$;
revoke execute on function public.journaliser_securite_interne(text, uuid, jsonb) from public, anon, authenticated;

-- Événements signalés par l'application (enrôlement, code accepté ou refusé, autres sessions fermées).
-- Réservé aux comptes de l'équipe (même sans aal2, pour journaliser un code refusé) ; 60 par heure au plus.
create function public.journaliser_securite(p_evenement text, p_details jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (select 1 from public.plateforme_admins where user_id = auth.uid() and actif) then
    return;
  end if;
  if p_evenement not in ('mfa_enrole', 'mfa_code_accepte', 'mfa_code_refuse', 'autres_sessions_fermees', 'connexion_admin') then
    raise exception 'Événement de sécurité inconnu';
  end if;
  if length(coalesce(p_details, '{}'::jsonb)::text) > 1000 then
    raise exception 'Détails trop longs';
  end if;
  if (select count(*) from public.evenements e
      where e.type like 'securite.%' and e.etablissement_id is null and e.cree_le > now() - interval '1 hour'
        and e.donnees ->> 'compte' = auth.uid()::text and e.donnees ->> 'source' = 'application') >= 60 then
    return;
  end if;
  perform public.journaliser_securite_interne(p_evenement, auth.uid(),
    jsonb_build_object('source', 'application', 'aal', public.session_aal(), 'details', coalesce(p_details, '{}'::jsonb)));
end
$$;
revoke execute on function public.journaliser_securite(text, jsonb) from public, anon;
grant execute on function public.journaliser_securite(text, jsonb) to authenticated;

-- Déclencheurs sur Supabase Auth : connexions et facteurs des comptes de l'équipe. Ils n'empêchent JAMAIS une
-- connexion : toute erreur est ignorée (bloc exception), et ils ne font rien pour les autres comptes.
create function public.journaliser_session_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if exists (select 1 from public.plateforme_admins where user_id = new.user_id) then
      if tg_op = 'INSERT' then
        perform public.journaliser_securite_interne('connexion', new.user_id,
          jsonb_build_object('source', 'auth', 'session', new.id, 'aal', new.aal::text,
                             'appareil', left(coalesce(to_jsonb(new) ->> 'user_agent', ''), 200),
                             'ip', to_jsonb(new) ->> 'ip'));
      elsif new.aal::text = 'aal2' and old.aal::text is distinct from 'aal2' then
        perform public.journaliser_securite_interne('connexion_aal2', new.user_id,
          jsonb_build_object('source', 'auth', 'session', new.id, 'aal', 'aal2'));
      end if;
    end if;
  exception when others then
    null;
  end;
  return null;
end
$$;

create function public.journaliser_facteur_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ligne jsonb := to_jsonb(coalesce(new, old));
  v_user uuid;
begin
  begin
    v_user := (ligne ->> 'user_id')::uuid;
    if exists (select 1 from public.plateforme_admins where user_id = v_user) then
      if tg_op = 'DELETE' then
        perform public.journaliser_securite_interne('facteur_supprime', v_user,
          jsonb_build_object('source', 'auth', 'facteur', ligne ->> 'id', 'type', ligne ->> 'factor_type'));
      elsif tg_op = 'INSERT' then
        perform public.journaliser_securite_interne('facteur_ajoute', v_user,
          jsonb_build_object('source', 'auth', 'facteur', ligne ->> 'id', 'type', ligne ->> 'factor_type', 'statut', ligne ->> 'status'));
      elsif (to_jsonb(new) ->> 'status') is distinct from (to_jsonb(old) ->> 'status') then
        perform public.journaliser_securite_interne('facteur_' || coalesce(ligne ->> 'status', 'modifie'), v_user,
          jsonb_build_object('source', 'auth', 'facteur', ligne ->> 'id', 'type', ligne ->> 'factor_type'));
      end if;
    end if;
  exception when others then
    null;
  end;
  return null;
end
$$;
revoke execute on function public.journaliser_session_auth() from public, anon, authenticated;
revoke execute on function public.journaliser_facteur_auth() from public, anon, authenticated;

-- Création des déclencheurs : si la plateforme refuse un déclencheur sur le schéma auth, la migration continue
-- sans lui (le reste de la sécurité ne dépend pas du journal).
do $$
begin
  begin
    create trigger journal_securite_sessions after insert or update of aal on auth.sessions
      for each row execute function public.journaliser_session_auth();
  exception when others then
    raise notice 'Journal des connexions non installé : %', sqlerrm;
  end;
  begin
    create trigger journal_securite_facteurs after insert or update of status or delete on auth.mfa_factors
      for each row execute function public.journaliser_facteur_auth();
  exception when others then
    raise notice 'Journal des facteurs non installé : %', sqlerrm;
  end;
end
$$;

-- État de sécurité de la personne connectée (pour l'écran de connexion de la plateforme et la porte du CRM) ---
create function public.mon_etat_securite()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_facteur boolean;
  v_obligatoire boolean;
  v_mfa_ok boolean;
begin
  if auth.uid() is null then
    return jsonb_build_object('connecte', false);
  end if;
  select role into v_role from public.plateforme_admins where user_id = auth.uid() and actif;
  if v_role is null then
    -- Comptes clients : aucune double authentification exigée, aucune information sur l'équipe.
    return jsonb_build_object('connecte', true, 'equipe', false, 'double_auth_requise', false, 'enrolement_requis', false);
  end if;
  v_facteur := public.a_facteur_mfa_verifie(auth.uid());
  select mfa_admin_obligatoire into v_obligatoire from public.securite_plateforme where id;
  v_mfa_ok := public.admin_mfa_ok();
  return jsonb_build_object(
    'connecte', true,
    'equipe', true,
    'role', v_role,
    'aal', public.session_aal(),
    'facteur_verifie', v_facteur,
    'mfa_obligatoire', coalesce(v_obligatoire, false),
    'session_valide', public.session_admin_valide(),
    -- Code à saisir pour retrouver les droits d'administration.
    'double_auth_requise', not v_mfa_ok and v_facteur and public.session_admin_valide(),
    -- Mode obligatoire et aucun téléphone enrôlé : enrôlement à faire avant toute administration.
    'enrolement_requis', not v_facteur and coalesce(v_obligatoire, false),
    -- Session expirée ou révoquée : se reconnecter.
    'reconnexion_requise', not public.session_admin_valide()
  );
end
$$;
revoke execute on function public.mon_etat_securite() from public, anon;
grant execute on function public.mon_etat_securite() to authenticated;

-- Activer ou désactiver le mode obligatoire. Garde-fou anti-verrouillage : impossible d'activer tant qu'un compte
-- actif de l'équipe n'a pas de facteur vérifié. Réservé à un super administrateur validé par son code (aal2).
create function public.definir_mfa_admin_obligatoire(p_obligatoire boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sans_facteur integer;
begin
  perform public.exiger_super_admin();
  if public.session_aal() <> 'aal2' then
    raise exception 'Validez d''abord votre code de double authentification' using errcode = '42501';
  end if;
  if p_obligatoire is null then
    raise exception 'Choix obligatoire';
  end if;
  select count(*) into sans_facteur
  from public.plateforme_admins a
  where a.actif and not public.a_facteur_mfa_verifie(a.user_id);
  if p_obligatoire and sans_facteur > 0 then
    raise exception '% compte(s) actif(s) de l''équipe n''ont pas encore de double authentification : activation refusée pour éviter un verrouillage', sans_facteur;
  end if;
  update public.securite_plateforme
  set mfa_admin_obligatoire = p_obligatoire, modifie_le = now(), modifie_par = auth.uid()
  where id;
  perform public.journaliser_securite_interne('mfa_obligatoire', auth.uid(),
    jsonb_build_object('source', 'application', 'valeur', p_obligatoire));
  return jsonb_build_object('mfa_admin_obligatoire', p_obligatoire, 'comptes_sans_facteur', sans_facteur);
end
$$;
revoke execute on function public.definir_mfa_admin_obligatoire(boolean) from public, anon;
grant execute on function public.definir_mfa_admin_obligatoire(boolean) to authenticated;

-- Fermer toutes les sessions d'un autre compte (compte compromis, téléphone perdu). Super administrateur en aal2.
-- Pour ses propres autres sessions, l'application utilise signOut({ scope: 'others' }).
create function public.revoquer_sessions_compte(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer := 0;
begin
  perform public.exiger_super_admin();
  if public.session_aal() <> 'aal2' then
    raise exception 'Validez d''abord votre code de double authentification' using errcode = '42501';
  end if;
  if p_user_id is null or p_user_id = auth.uid() then
    raise exception 'Pour vos propres appareils, utilisez « Fermer mes autres sessions »';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Compte introuvable';
  end if;
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics n = row_count;
  perform public.journaliser_securite_interne('sessions_revoquees', p_user_id,
    jsonb_build_object('source', 'application', 'par', auth.uid(), 'sessions', n));
  return n;
end
$$;
revoke execute on function public.revoquer_sessions_compte(uuid) from public, anon;
grant execute on function public.revoquer_sessions_compte(uuid) to authenticated;

-- Lecture du journal de sécurité (super administrateur validé par son code). Les événements de sécurité n'ont pas
-- d'établissement : la politique evenements_lecture ne les montre à personne, seule cette fonction les lit.
create function public.editeur_journal_securite(p_limite integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exiger_super_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object('le', e.cree_le, 'type', e.type, 'donnees', e.donnees) order by e.id desc)
    from (
      select * from public.evenements
      where type like 'securite.%' and etablissement_id is null
      order by id desc
      limit least(greatest(coalesce(p_limite, 200), 1), 1000)
    ) e
  ), '[]'::jsonb);
end
$$;
revoke execute on function public.editeur_journal_securite(integer) from public, anon;
grant execute on function public.editeur_journal_securite(integer) to authenticated;
