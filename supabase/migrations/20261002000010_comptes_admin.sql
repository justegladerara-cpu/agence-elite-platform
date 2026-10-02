-- Mise à jour « Hubs » (2026-10-02), partie 1 : comptes, mot de passe temporaire, identifiant,
-- rôle plateforme « admin ».
-- Règles :
--   * Supabase Auth reste la seule autorité des mots de passe (auth.users, haché bcrypt) ;
--     aucune table applicative ne contient de mot de passe, en clair ou haché.
--   * Un compte créé avec un mot de passe temporaire est « non prêt » : toutes les fonctions
--     d'accès (est_membre, a_permission, est_dirigeant, est_editeur, session support) renvoient
--     faux tant que le mot de passe n'a pas été changé. Le contrôle est côté base, pas dans l'écran.
--   * Le drapeau est levé uniquement par un vrai changement de mot de passe dans auth.users
--     (déclencheur), jamais par une écriture de l'utilisateur.
--   * est_super_admin() reste strict (super_admin). est_editeur() = super_admin ou admin :
--     l'admin gère clients, établissements, licences, Hubs, comptes et support, mais pas les
--     tarifs, le catalogue des modules ni les administrateurs.

-- Rôle plateforme « admin » ------------------------------------------------------
do $$
declare
  contrainte text;
begin
  select c.conname into contrainte
  from pg_constraint c
  where c.conrelid = 'public.plateforme_admins'::regclass and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%super_admin%';
  if contrainte is not null then
    execute format('alter table public.plateforme_admins drop constraint %I', contrainte);
  end if;
end
$$;
alter table public.plateforme_admins
  add constraint plateforme_admins_role_check check (role in ('super_admin', 'admin', 'support'));

-- Comptes : identifiant de connexion et changement de mot de passe obligatoire -------
create table public.comptes_connexion (
  user_id uuid primary key references auth.users(id) on delete restrict,
  identifiant text check (identifiant is null or identifiant ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,39}$'),
  doit_changer_mot_de_passe boolean not null default false,
  temporaire_expire_le timestamptz,
  mot_de_passe_change_le timestamptz,
  cree_par uuid references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
create unique index comptes_connexion_identifiant_unique on public.comptes_connexion (lower(identifiant)) where identifiant is not null;
create trigger comptes_connexion_modifie_le before update on public.comptes_connexion
for each row execute function public.fixer_modifie_le();
create trigger comptes_connexion_audit after insert or update or delete on public.comptes_connexion
for each row execute function public.journaliser_modification();
alter table public.comptes_connexion enable row level security;
create policy comptes_connexion_lecture_propre on public.comptes_connexion for select to authenticated
using (user_id = auth.uid());

-- Tentatives de connexion par identifiant (verrou anti force brute), qu'il existe ou non.
create table public.tentatives_connexion (
  cle text primary key,
  echecs integer not null default 0,
  bloque_jusqu_au timestamptz,
  derniere_le timestamptz not null default now()
);
alter table public.tentatives_connexion enable row level security;

-- Un compte est « prêt » s'il n'a pas de mot de passe temporaire à changer.
create function public.compte_pret()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.comptes_connexion
    where user_id = auth.uid() and doit_changer_mot_de_passe
  )
$$;

-- Mots de passe refusés comme nouveaux mots de passe (le temporaire et les plus faibles).
create function public.mot_de_passe_refuse(p_hache text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  candidat text;
begin
  if p_hache is null or p_hache = '' then
    return true;
  end if;
  foreach candidat in array array['1234', '12345', '123456', '1234567', '12345678', '123456789', '0000', '000000',
    '00000000', 'azerty', 'azerty123', 'motdepasse', 'password', 'password1', 'qwerty', 'admin', 'admin123'] loop
    if extensions.crypt(candidat, p_hache) = p_hache then
      return true;
    end if;
  end loop;
  return false;
end
$$;

-- Déclencheur sur auth.users : un vrai changement de mot de passe lève le drapeau.
create function public.controler_changement_mot_de_passe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  compte public.comptes_connexion%rowtype;
begin
  if new.encrypted_password is not distinct from old.encrypted_password then
    return new;
  end if;
  -- Pose d'un mot de passe temporaire par l'équipe Agence Elite (fonction dédiée).
  if coalesce(current_setting('app.pose_mot_de_passe_temporaire', true), '') = 'oui' then
    return new;
  end if;
  select * into compte from public.comptes_connexion where user_id = new.id for update;
  if compte.user_id is null or not compte.doit_changer_mot_de_passe then
    return new;
  end if;
  if compte.temporaire_expire_le is not null and compte.temporaire_expire_le < now() then
    raise exception 'Mot de passe temporaire expiré : demandez-en un nouveau à Agence Elite';
  end if;
  if public.mot_de_passe_refuse(new.encrypted_password) then
    raise exception 'Ce mot de passe est trop simple : choisissez-en un autre';
  end if;
  update public.comptes_connexion
  set doit_changer_mot_de_passe = false, temporaire_expire_le = null, mot_de_passe_change_le = now()
  where user_id = new.id;
  return new;
end
$$;
create trigger auth_users_changement_mot_de_passe
before update of encrypted_password on auth.users
for each row execute function public.controler_changement_mot_de_passe();

-- Fonctions d'accès : rien n'est permis tant que le compte n'est pas prêt -------------
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
  )
$$;

create function public.est_editeur()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.compte_pret() and exists (
    select 1 from public.plateforme_admins
    where user_id = auth.uid() and role in ('super_admin', 'admin') and actif
  )
$$;

create function public.exiger_editeur()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.est_editeur() then
    raise exception 'Cette opération est réservée à l''équipe Agence Elite (super administrateurs et administrateurs)' using errcode = '42501';
  end if;
end
$$;

create or replace function public.exiger_super_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.est_super_admin() then
    raise exception 'Cette opération est réservée aux super administrateurs' using errcode = '42501';
  end if;
end
$$;

create or replace function public.est_membre(p_etablissement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.compte_pret() and exists (
    select 1 from public.etablissement_membres
    where etablissement_id = p_etablissement_id and user_id = auth.uid() and actif
  )
$$;

create or replace function public.est_dirigeant(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.compte_pret() and exists (
    select 1 from public.client_membres
    where client_id = p_client_id and user_id = auth.uid() and actif
  )
$$;

create or replace function public.a_permission(p_etablissement_id uuid, p_permission_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.compte_pret() and exists (
    select 1
    from public.etablissement_membres em
    join public.permissions p on p.id = p_permission_id
    where em.etablissement_id = p_etablissement_id
      and em.user_id = auth.uid()
      and em.actif
      and public.module_actif(p_etablissement_id, p.module_id)
      and coalesce(
        (em.permissions_ajustees ->> p_permission_id)::boolean,
        exists (
          select 1 from public.role_permissions rp
          where rp.role_id = em.role_id and rp.permission_id = p_permission_id
        )
      )
  )
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
  )
$$;

-- Politiques de lecture éditeur : super admin ou admin ----------------------------------
alter policy client_membres_lecture on public.client_membres
  using (public.est_editeur() or user_id = auth.uid() or public.est_dirigeant(client_id));
alter policy clients_lecture on public.clients
  using (public.est_editeur() or public.est_dirigeant(id)
    or exists (select 1 from public.etablissements e where e.client_id = clients.id and public.est_membre(e.id)));
alter policy membres_ajout on public.etablissement_membres
  with check (public.est_editeur());
alter policy membres_lecture on public.etablissement_membres
  using (public.est_editeur() or user_id = auth.uid()
    or public.est_dirigeant((select etablissements.client_id from public.etablissements where etablissements.id = etablissement_membres.etablissement_id))
    or public.a_permission(etablissement_id, 'membres.lire'));
alter policy etablissement_modules_lecture on public.etablissement_modules
  using (public.est_editeur() or public.est_membre(etablissement_id)
    or exists (select 1 from public.etablissements e where e.id = etablissement_modules.etablissement_id and public.est_dirigeant(e.client_id)));
alter policy etablissements_lecture on public.etablissements
  using (public.est_editeur() or public.est_membre(id) or public.est_dirigeant(client_id));
alter policy invitations_lecture on public.invitations
  using (public.est_editeur()
    or (etablissement_id is not null and public.a_permission(etablissement_id, 'membres.lire'))
    or (client_id is not null and public.est_dirigeant(client_id)));
alter policy audit_lecture_admin on public.journal_audit
  using (public.est_editeur());
alter policy lecture on public.licence_evenements
  using (public.est_editeur() or public.a_permission(etablissement_id, 'etablissement.modifier')
    or public.est_dirigeant((select e.client_id from public.etablissements e where e.id = licence_evenements.etablissement_id)));
alter policy lecture on public.licences
  using (public.est_editeur() or public.a_permission(etablissement_id, 'etablissement.lire')
    or public.est_dirigeant((select e.client_id from public.etablissements e where e.id = licences.etablissement_id))
    or public.session_support_active(etablissement_id));
create policy comptes_connexion_lecture_editeur on public.comptes_connexion for select to authenticated
using (public.est_editeur());
create policy plateforme_admins_lecture_editeur on public.plateforme_admins for select to authenticated
using (public.est_editeur());

-- Fonctions éditeur : ouvertes à l'admin (copie exacte, seul le contrôle d'accès change) ---
CREATE OR REPLACE FUNCTION public.annuler_invitation(p_invitation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  invitation public.invitations%rowtype;
begin
  select * into invitation from public.invitations where id = p_invitation_id for update;
  if invitation.id is null or invitation.acceptee_le is not null or invitation.annulee_le is not null then
    raise exception 'Invitation introuvable ou déjà utilisée';
  end if;
  if invitation.etablissement_id is not null then
    perform public.exiger_gestion_membres(invitation.etablissement_id, invitation.role_id);
  else
    perform public.exiger_editeur();
  end if;
  update public.invitations set annulee_le = now() where id = p_invitation_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.attribuer_licence(p_etablissement_id uuid, p_offre_id text, p_formule text, p_debut date DEFAULT CURRENT_DATE, p_echeance date DEFAULT NULL::date, p_montant numeric DEFAULT 0, p_modules_supplementaires text[] DEFAULT '{}'::text[], p_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  etab public.etablissements%rowtype;
  offre public.offres%rowtype;
  debut date := coalesce(p_debut, current_date);
  echeance date := p_echeance;
  supplementaires text[] := coalesce(p_modules_supplementaires, '{}');
  resultat uuid;
begin
  perform public.exiger_editeur();
  select * into etab from public.etablissements where id = p_etablissement_id;
  if etab.id is null then
    raise exception 'Établissement introuvable';
  end if;
  select * into offre from public.offres where id = p_offre_id;
  if offre.id is null or not offre.actif or offre.solution_id <> etab.solution_id then
    raise exception 'Offre inconnue ou non disponible pour cette solution';
  end if;
  if p_formule not in ('essai', 'acquisition', 'mensuel', 'annuel') then
    raise exception 'Formule invalide';
  end if;
  if coalesce(p_montant, 0) < 0 then
    raise exception 'Le montant ne peut pas être négatif';
  end if;
  if echeance is null then
    echeance := case p_formule
      when 'mensuel' then (debut + interval '1 month')::date
      when 'annuel' then (debut + interval '1 year')::date
      when 'essai' then debut + 30
    end;
  end if;
  if echeance is not null and echeance < debut then
    raise exception 'L''échéance doit suivre le début';
  end if;
  perform public.verifier_modules_offre(etab.solution_id, offre.modules || supplementaires);

  update public.licences
  set statut = 'terminee', motif_statut = 'Remplacée par une nouvelle licence'
  where etablissement_id = p_etablissement_id and statut <> 'terminee';

  insert into public.licences(etablissement_id, offre_id, formule, debut, echeance, modules_supplementaires, montant, devise, note, cree_par)
  values (p_etablissement_id, offre.id, p_formule, debut, echeance, supplementaires, coalesce(p_montant, 0), offre.devise, nullif(btrim(p_note), ''), auth.uid())
  returning id into resultat;
  insert into public.licence_evenements(licence_id, etablissement_id, type, nouvelle_echeance, montant, reference, motif, acteur)
  values (resultat, p_etablissement_id, 'attribution', echeance, coalesce(p_montant, 0), nullif(btrim(p_reference), ''), nullif(btrim(p_note), ''), auth.uid());

  perform public.synchroniser_modules_licence(p_etablissement_id);
  return resultat;
end
$function$;

CREATE OR REPLACE FUNCTION public.creer_client(p_nom text, p_pays text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare resultat uuid;
begin
  perform public.exiger_editeur();
  insert into public.clients(nom, pays) values (p_nom, p_pays) returning id into resultat;
  return resultat;
end
$function$;

CREATE OR REPLACE FUNCTION public.creer_etablissement(p_client_id uuid, p_solution_id text, p_nom text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  resultat uuid;
begin
  perform public.exiger_editeur();
  insert into public.etablissements(client_id, solution_id, nom)
  values (p_client_id, p_solution_id, p_nom)
  returning id into resultat;
  insert into public.etablissement_modules(etablissement_id, module_id, actif, active_le, active_par, source)
  with recursive profondeur(module_id, niveau) as (
    select sm.module_id, 0
    from public.solution_modules sm
    where sm.solution_id = p_solution_id and sm.par_defaut
    union all
    select d.depend_de, p.niveau + 1
    from profondeur p
    join public.module_dependances d on d.module_id = p.module_id
    where p.niveau < 20
  )
  select resultat, sm.module_id, true, now(), auth.uid(), 'inclus'
  from public.solution_modules sm
  join (select module_id, max(niveau) as niveau from profondeur group by module_id) p on p.module_id = sm.module_id
  where sm.solution_id = p_solution_id and sm.par_defaut
  order by p.niveau desc;
  insert into public.points_de_vente(etablissement_id, nom) values (resultat, 'Caisse principale');
  insert into public.etablissement_identite(etablissement_id, nom_commercial) values (resultat, p_nom);
  return resultat;
end
$function$;

CREATE OR REPLACE FUNCTION public.definir_module_etablissement(p_etablissement_id uuid, p_module_id text, p_actif boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.exiger_editeur();
  insert into public.etablissement_modules(etablissement_id, module_id, actif, active_le, active_par, source)
  values (p_etablissement_id, p_module_id, p_actif, case when p_actif then now() end, auth.uid(), 'manuel')
  on conflict (etablissement_id, module_id) do update
  set actif = excluded.actif, active_le = excluded.active_le, active_par = excluded.active_par, source = 'manuel';
end
$function$;

CREATE OR REPLACE FUNCTION public.definir_statut_client(p_client_id uuid, p_statut text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.exiger_editeur();
  if p_statut not in ('actif', 'suspendu', 'archive') then raise exception 'Statut client invalide'; end if;
  update public.clients set statut = p_statut where id = p_client_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.definir_statut_etablissement(p_etablissement_id uuid, p_statut text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.exiger_editeur();
  if p_statut not in ('actif', 'suspendu', 'archive') then raise exception 'Statut établissement invalide'; end if;
  update public.etablissements set statut = p_statut where id = p_etablissement_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.definir_statut_licence(p_licence_id uuid, p_statut text, p_motif text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  licence public.licences%rowtype;
begin
  perform public.exiger_editeur();
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Le motif est obligatoire';
  end if;
  if p_statut not in ('active', 'suspendue', 'terminee') then
    raise exception 'Statut de licence invalide';
  end if;
  select * into licence from public.licences where id = p_licence_id for update;
  if licence.id is null or licence.statut = 'terminee' then
    raise exception 'Licence introuvable ou terminée';
  end if;
  if licence.statut = p_statut then
    return;
  end if;
  update public.licences set statut = p_statut, motif_statut = btrim(p_motif) where id = p_licence_id;
  insert into public.licence_evenements(licence_id, etablissement_id, type, ancienne_echeance, nouvelle_echeance, motif, acteur)
  values (
    p_licence_id, licence.etablissement_id,
    case p_statut when 'active' then 'reactivation' when 'suspendue' then 'suspension' else 'fin' end,
    licence.echeance, licence.echeance, btrim(p_motif), auth.uid()
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.definir_support_licence(p_licence_id uuid, p_support boolean, p_montant numeric DEFAULT 0, p_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  licence public.licences%rowtype;
begin
  perform public.exiger_editeur();
  select * into licence from public.licences where id = p_licence_id for update;
  if licence.id is null or licence.statut = 'terminee' then
    raise exception 'Licence introuvable ou terminée';
  end if;
  if p_support is null then
    raise exception 'Indiquer si le support est inclus';
  end if;
  if coalesce(p_montant, 0) < 0 or coalesce(p_montant, 0) = 'NaN'::numeric then
    raise exception 'Montant invalide';
  end if;
  if licence.support = p_support then
    return;
  end if;
  update public.licences set support = p_support where id = p_licence_id;
  insert into public.licence_evenements(licence_id, etablissement_id, type, ancienne_echeance, nouvelle_echeance, montant, reference, motif, acteur)
  values (
    p_licence_id, licence.etablissement_id, 'support', licence.echeance, licence.echeance, coalesce(p_montant, 0),
    nullif(btrim(p_reference), ''), coalesce(nullif(btrim(p_note), ''), case when p_support then 'Support ajouté' else 'Support retiré' end), auth.uid()
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.editeur_etablissement(p_etablissement_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  etab public.etablissements%rowtype;
begin
  perform public.exiger_editeur();
  select * into etab from public.etablissements where id = p_etablissement_id;
  if etab.id is null then
    raise exception 'Établissement introuvable';
  end if;
  return jsonb_build_object(
    'etablissement', to_jsonb(etab),
    'client', (select jsonb_build_object('id', c.id, 'nom', c.nom, 'statut', c.statut) from public.clients c where c.id = etab.client_id),
    'licence', public.resume_licence(etab.id),
    'ecriture', public.etablissement_autorise_ecriture(etab.id),
    'historique_licences', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', ev.type, 'cree_le', ev.cree_le, 'ancienne_echeance', ev.ancienne_echeance,
        'nouvelle_echeance', ev.nouvelle_echeance, 'montant', ev.montant, 'reference', ev.reference,
        'motif', ev.motif, 'offre', o.nom, 'formule', l.formule
      ) order by ev.cree_le desc)
      from public.licence_evenements ev
      join public.licences l on l.id = ev.licence_id
      join public.offres o on o.id = l.offre_id
      where ev.etablissement_id = etab.id
    ), '[]'::jsonb),
    'modules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'nom', m.nom, 'nature', m.nature,
        'actif', coalesce(em.actif, false),
        'couvert', public.module_couvert(etab.id, m.id),
        'depend_de', coalesce((select jsonb_agg(d.depend_de) from public.module_dependances d where d.module_id = m.id), '[]'::jsonb)
      ) order by n.niveau desc, m.nom)
      from public.solution_modules sm
      join public.modules m on m.id = sm.module_id
      join public.niveaux_modules(etab.solution_id) n on n.module_id = m.id
      left join public.etablissement_modules em on em.etablissement_id = etab.id and em.module_id = m.id
      where sm.solution_id = etab.solution_id
    ), '[]'::jsonb),
    'equipe', public.equipe_etablissement(etab.id),
    'mise_en_service', public.etat_mise_en_service(etab.id),
    'sessions_support', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'motif', s.motif, 'ouverte_le', s.ouverte_le, 'fermee_le', s.fermee_le,
        'active', s.fermee_le is null and s.ouverte_le > now() - interval '8 hours'
      ) order by s.ouverte_le desc)
      from (select * from public.sessions_support where etablissement_id = etab.id and admin_id = auth.uid() order by ouverte_le desc limit 10) s
    ), '[]'::jsonb)
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.editeur_vue()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.exiger_editeur();
  return jsonb_build_object(
    'solutions', (select jsonb_agg(to_jsonb(s) order by s.nom) from public.solutions s),
    'offres', coalesce((select jsonb_agg(to_jsonb(o) order by o.solution_id, o.ordre) from public.offres o), '[]'::jsonb),
    'roles', (select jsonb_agg(jsonb_build_object('id', r.id, 'nom', r.nom, 'ordre', r.ordre) order by r.ordre) from public.roles r),
    'clients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'nom', c.nom,
        'pays', c.pays,
        'statut', c.statut,
        'devise_facturation', c.devise_facturation,
        'contact', c.contact,
        'cree_le', c.cree_le,
        'dirigeants', coalesce((
          select jsonb_agg(jsonb_build_object('email', u.email, 'nom', p.nom_complet, 'actif', cm.actif))
          from public.client_membres cm
          join auth.users u on u.id = cm.user_id
          left join public.profils p on p.id = cm.user_id
          where cm.client_id = c.id
        ), '[]'::jsonb),
        'invitations', coalesce((
          select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'expire_le', i.expire_le))
          from public.invitations i
          where i.client_id = c.id and i.acceptee_le is null and i.annulee_le is null and i.expire_le > now()
        ), '[]'::jsonb),
        'etablissements', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', e.id,
            'nom', e.nom,
            'ville', e.ville,
            'pays', e.pays,
            'devise', e.devise,
            'statut', e.statut,
            'solution_id', e.solution_id,
            'cree_le', e.cree_le,
            'mis_en_service_le', e.mis_en_service_le,
            'ecriture', public.etablissement_autorise_ecriture(e.id),
            'licence', public.resume_licence(e.id),
            'membres_actifs', (select count(*) from public.etablissement_membres m where m.etablissement_id = e.id and m.actif),
            'gerants', coalesce((
              select jsonb_agg(u.email)
              from public.etablissement_membres m join auth.users u on u.id = m.user_id
              where m.etablissement_id = e.id and m.actif and m.role_id = 'gerant'
            ), '[]'::jsonb),
            'invitations_en_attente', (
              select count(*) from public.invitations i
              where i.etablissement_id = e.id and i.acceptee_le is null and i.annulee_le is null and i.expire_le > now()
            )
          ) order by e.nom)
          from public.etablissements e where e.client_id = c.id
        ), '[]'::jsonb)
      ) order by c.nom)
      from public.clients c
    ), '[]'::jsonb)
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.equipe_etablissement(p_etablissement_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (
    public.est_editeur()
    or public.a_permission(p_etablissement_id, 'membres.lire')
    or public.est_dirigeant((select client_id from public.etablissements where id = p_etablissement_id))
  ) then
    raise exception 'Permission refusée : membres.lire' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'membres', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id,
        'email', u.email,
        'nom', p.nom_complet,
        'role_id', m.role_id,
        'actif', m.actif,
        'permissions_ajustees', m.permissions_ajustees,
        'moi', m.user_id = auth.uid()
      ) order by m.actif desc, r.ordre, p.nom_complet)
      from public.etablissement_membres m
      join public.roles r on r.id = m.role_id
      join auth.users u on u.id = m.user_id
      left join public.profils p on p.id = m.user_id
      where m.etablissement_id = p_etablissement_id
    ), '[]'::jsonb),
    'invitations', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'role_id', i.role_id, 'expire_le', i.expire_le) order by i.cree_le desc)
      from public.invitations i
      where i.etablissement_id = p_etablissement_id and i.acceptee_le is null and i.annulee_le is null and i.expire_le > now()
    ), '[]'::jsonb)
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.etat_mise_en_service(p_etablissement_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  identite public.etablissement_identite%rowtype;
  etapes jsonb;
begin
  if not (
    public.est_editeur()
    or public.a_permission(p_etablissement_id, 'etablissement.lire')
    or public.est_dirigeant((select client_id from public.etablissements where id = p_etablissement_id))
  ) then
    raise exception 'Permission refusée : etablissement.lire' using errcode = '42501';
  end if;
  select * into identite from public.etablissement_identite where etablissement_id = p_etablissement_id;
  etapes := jsonb_build_array(
    jsonb_build_object('id', 'licence', 'libelle', 'Licence active', 'fait', public.licence_valide(p_etablissement_id)),
    jsonb_build_object('id', 'gerant', 'libelle', 'Responsable invité et connecté', 'fait', exists (
      select 1 from public.etablissement_membres where etablissement_id = p_etablissement_id and role_id = 'gerant' and actif)),
    jsonb_build_object('id', 'identite', 'libelle', 'Nom, adresse et téléphone sur les reçus', 'fait',
      coalesce(identite.nom_commercial, '') <> '' and coalesce(identite.adresse, '') <> '' and coalesce(identite.telephone, '') <> ''),
    jsonb_build_object('id', 'logo', 'libelle', 'Logo', 'fait', coalesce(identite.logo_url, '') <> ''),
    jsonb_build_object('id', 'caisses', 'libelle', 'Caisse(s) nommée(s)', 'fait', exists (
      select 1 from public.points_de_vente where etablissement_id = p_etablissement_id and actif)),
    jsonb_build_object('id', 'equipe', 'libelle', 'Équipe invitée', 'fait', exists (
      select 1 from public.etablissement_membres where etablissement_id = p_etablissement_id and role_id <> 'gerant')
      or exists (select 1 from public.invitations where etablissement_id = p_etablissement_id and role_id <> 'gerant' and annulee_le is null)),
    jsonb_build_object('id', 'articles', 'libelle', 'Articles enregistrés', 'fait', exists (
      select 1 from public.articles where etablissement_id = p_etablissement_id)),
    jsonb_build_object('id', 'stock', 'libelle', 'Stock de départ saisi', 'fait', exists (
      select 1 from public.mouvements_stock where etablissement_id = p_etablissement_id)),
    jsonb_build_object('id', 'premiere_vente', 'libelle', 'Première vente', 'fait', exists (
      select 1 from public.ventes where etablissement_id = p_etablissement_id))
  );
  return jsonb_build_object(
    'etapes', etapes,
    'faites', (select count(*) from jsonb_array_elements(etapes) e where (e ->> 'fait')::boolean),
    'total', jsonb_array_length(etapes),
    'mis_en_service_le', (select mis_en_service_le from public.etablissements where id = p_etablissement_id)
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.exiger_gestion_membres(p_etablissement_id uuid, p_role_id text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  rang_cible integer;
begin
  if auth.uid() is null then
    raise exception 'Une authentification est requise';
  end if;
  if public.est_editeur() then
    if not exists (select 1 from public.etablissements where id = p_etablissement_id) then
      raise exception 'Établissement introuvable';
    end if;
    return;
  end if;
  perform public.exiger_permission(p_etablissement_id, 'membres.gerer');
  if p_role_id is not null then
    select ordre into rang_cible from public.roles where id = p_role_id;
    if rang_cible < public.rang_role_connecte(p_etablissement_id) then
      raise exception 'Vous ne pouvez pas attribuer un rôle supérieur au vôtre' using errcode = '42501';
    end if;
  end if;
end
$function$;

CREATE OR REPLACE FUNCTION public.inviter_dirigeant(p_client_id uuid, p_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  courriel text := lower(btrim(coalesce(p_email, '')));
  resultat uuid;
begin
  perform public.exiger_editeur();
  if courriel !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Adresse e-mail invalide';
  end if;
  update public.invitations set annulee_le = now()
  where client_id = p_client_id and email = courriel and acceptee_le is null and annulee_le is null;
  insert into public.invitations(email, client_id, role_client, cree_par)
  values (courriel, p_client_id, 'dirigeant', auth.uid())
  returning id into resultat;
  return resultat;
end
$function$;

CREATE OR REPLACE FUNCTION public.inviter_gerant(p_etablissement_id uuid, p_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.exiger_editeur();
  return (public.inviter_membre(p_etablissement_id, p_email, 'gerant') ->> 'id')::uuid;
end
$function$;

CREATE OR REPLACE FUNCTION public.mettre_en_service(p_etablissement_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  resultat timestamptz;
begin
  if not public.est_editeur() then
    perform public.exiger_permission(p_etablissement_id, 'etablissement.modifier');
  end if;
  if not public.licence_valide(p_etablissement_id) then
    raise exception 'Une licence active est nécessaire pour la mise en service';
  end if;
  update public.etablissements set mis_en_service_le = coalesce(mis_en_service_le, now())
  where id = p_etablissement_id
  returning mis_en_service_le into resultat;
  return resultat;
end
$function$;

CREATE OR REPLACE FUNCTION public.modifier_client(p_client_id uuid, p_client jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.exiger_editeur();
  update public.clients set
    nom = coalesce(nullif(btrim(p_client ->> 'nom'), ''), nom),
    pays = case when p_client ? 'pays' then nullif(btrim(p_client ->> 'pays'), '') else pays end,
    devise_facturation = coalesce(nullif(p_client ->> 'devise_facturation', ''), devise_facturation),
    contact = case when p_client ? 'contact' and jsonb_typeof(p_client -> 'contact') = 'object' then p_client -> 'contact' else contact end
  where id = p_client_id;
  if not found then
    raise exception 'Client introuvable';
  end if;
end
$function$;

CREATE OR REPLACE FUNCTION public.modifier_etablissement(p_etablissement_id uuid, p_etablissement jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.est_editeur() then
    perform public.exiger_permission(p_etablissement_id, 'etablissement.modifier');
  end if;
  update public.etablissements set
    nom = coalesce(nullif(btrim(p_etablissement ->> 'nom'), ''), nom),
    ville = case when p_etablissement ? 'ville' then nullif(btrim(p_etablissement ->> 'ville'), '') else ville end,
    pays = case when p_etablissement ? 'pays' then nullif(btrim(p_etablissement ->> 'pays'), '') else pays end,
    devise = coalesce(nullif(p_etablissement ->> 'devise', ''), devise),
    fuseau = coalesce(nullif(p_etablissement ->> 'fuseau', ''), fuseau)
  where id = p_etablissement_id;
  if not found then
    raise exception 'Établissement introuvable';
  end if;
end
$function$;

CREATE OR REPLACE FUNCTION public.modifier_membre(p_etablissement_id uuid, p_user_id uuid, p_role_id text, p_permissions_ajustees jsonb DEFAULT '{}'::jsonb, p_actif boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actuel public.etablissement_membres%rowtype;
  solution text;
begin
  select * into actuel from public.etablissement_membres
  where etablissement_id = p_etablissement_id and user_id = p_user_id for update;
  if actuel.user_id is null then
    raise exception 'Membre introuvable';
  end if;
  if not exists (select 1 from public.roles where id = p_role_id) then
    raise exception 'Rôle inconnu';
  end if;
  if p_user_id = auth.uid() and not public.est_editeur() then
    raise exception 'Vous ne pouvez pas modifier votre propre accès' using errcode = '42501';
  end if;
  perform public.exiger_gestion_membres(p_etablissement_id, p_role_id);
  perform public.exiger_gestion_membres(p_etablissement_id, actuel.role_id);
  if not public.permissions_ajustees_valides(coalesce(p_permissions_ajustees, '{}'::jsonb)) then
    raise exception 'Les ajustements de permissions doivent être des valeurs vrai/faux';
  end if;
  select solution_id into solution from public.etablissements where id = p_etablissement_id;
  if exists (
    select 1 from jsonb_object_keys(coalesce(p_permissions_ajustees, '{}'::jsonb)) k
    where not exists (
      select 1 from public.permissions p
      join public.solution_modules sm on sm.module_id = p.module_id and sm.solution_id = solution
      where p.id = k
    )
  ) then
    raise exception 'Permission inconnue pour cette solution';
  end if;
  -- Un non-gérant ne peut pas recevoir la gestion d'équipe par ajustement, sinon il
  -- pourrait inviter des gérants : seul le super admin le décide.
  if not public.est_editeur()
     and coalesce((p_permissions_ajustees ->> 'membres.gerer')::boolean, false)
     and p_role_id <> 'gerant' then
    raise exception 'Seule l''équipe Agence Elite peut confier la gestion d''équipe à ce rôle' using errcode = '42501';
  end if;
  -- L'établissement garde toujours au moins un gérant actif.
  if actuel.role_id = 'gerant' and actuel.actif and (p_role_id <> 'gerant' or not p_actif)
     and not exists (
       select 1 from public.etablissement_membres
       where etablissement_id = p_etablissement_id and role_id = 'gerant' and actif and user_id <> p_user_id
     ) then
    raise exception 'L''établissement doit garder au moins un gérant actif';
  end if;
  update public.etablissement_membres
  set role_id = p_role_id,
      permissions_ajustees = coalesce(p_permissions_ajustees, '{}'::jsonb),
      actif = p_actif
  where etablissement_id = p_etablissement_id and user_id = p_user_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.renouveler_licence(p_licence_id uuid, p_nouvelle_echeance date DEFAULT NULL::date, p_montant numeric DEFAULT 0, p_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS date
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  licence public.licences%rowtype;
  base date;
  nouvelle date := p_nouvelle_echeance;
begin
  perform public.exiger_editeur();
  select * into licence from public.licences where id = p_licence_id for update;
  if licence.id is null or licence.statut = 'terminee' then
    raise exception 'Licence introuvable ou terminée';
  end if;
  if coalesce(p_montant, 0) < 0 then
    raise exception 'Le montant ne peut pas être négatif';
  end if;
  -- Le renouvellement part de l'échéance, ou d'aujourd'hui si elle est dépassée.
  base := greatest(coalesce(licence.echeance, current_date), current_date);
  if nouvelle is null then
    nouvelle := case licence.formule
      when 'mensuel' then (base + interval '1 month')::date
      when 'annuel' then (base + interval '1 year')::date
      else null
    end;
  end if;
  if nouvelle is null or nouvelle <= coalesce(licence.echeance, licence.debut) then
    raise exception 'La nouvelle échéance doit être postérieure à l''actuelle';
  end if;
  update public.licences set echeance = nouvelle where id = p_licence_id;
  insert into public.licence_evenements(licence_id, etablissement_id, type, ancienne_echeance, nouvelle_echeance, montant, reference, motif, acteur)
  values (p_licence_id, licence.etablissement_id, 'renouvellement', licence.echeance, nouvelle, coalesce(p_montant, 0), nullif(btrim(p_reference), ''), nullif(btrim(p_note), ''), auth.uid());
  return nouvelle;
end
$function$;

-- Création de comptes par l'équipe Agence Elite ----------------------------------------
-- Le mot de passe temporaire est transmis en paramètre puis haché par Supabase (bcrypt) ;
-- il n'est jamais écrit dans une table applicative. Le compte doit le changer à la première
-- connexion (contrôlé en base, voir compte_pret).
create function public.normaliser_identifiant(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(coalesce(p, '')), '')
$$;

create function public.creer_compte(
  p_email text,
  p_identifiant text,
  p_nom text,
  p_mot_de_passe_temporaire text,
  p_expire_jours integer default 30
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
  perform public.exiger_editeur();
  if courriel !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Adresse e-mail invalide';
  end if;
  if v_identifiant is null or v_identifiant !~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,39}$' then
    raise exception 'Identifiant invalide : 3 à 40 caractères (lettres, chiffres, point, tiret)';
  end if;
  if coalesce(length(p_mot_de_passe_temporaire), 0) < 4 then
    raise exception 'Le mot de passe temporaire doit contenir au moins 4 caractères';
  end if;
  if exists (select 1 from auth.users where lower(email) = courriel) then
    raise exception 'Un compte existe déjà avec cette adresse';
  end if;
  if exists (select 1 from public.comptes_connexion where lower(comptes_connexion.identifiant) = lower(v_identifiant)) then
    raise exception 'Cet identifiant est déjà utilisé';
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

-- Identifiant de connexion d'un compte existant (sans toucher à son mot de passe).
create function public.definir_identifiant(p_user_id uuid, p_identifiant text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_identifiant text := public.normaliser_identifiant(p_identifiant);
begin
  perform public.exiger_editeur();
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Compte introuvable';
  end if;
  if exists (select 1 from public.plateforme_admins where user_id = p_user_id and role = 'super_admin')
     and not public.est_super_admin() then
    raise exception 'Seul un super administrateur peut modifier ce compte' using errcode = '42501';
  end if;
  if v_identifiant is not null and v_identifiant !~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,39}$' then
    raise exception 'Identifiant invalide : 3 à 40 caractères (lettres, chiffres, point, tiret)';
  end if;
  if v_identifiant is not null and exists (
    select 1 from public.comptes_connexion where lower(comptes_connexion.identifiant) = lower(v_identifiant) and user_id <> p_user_id
  ) then
    raise exception 'Cet identifiant est déjà utilisé';
  end if;
  insert into public.comptes_connexion (user_id, identifiant, cree_par)
  values (p_user_id, v_identifiant, auth.uid())
  on conflict (user_id) do update set identifiant = excluded.identifiant;
end
$$;

-- Nouveau mot de passe temporaire (compte bloqué jusqu'à son changement).
create function public.reinitialiser_mot_de_passe_temporaire(p_user_id uuid, p_mot_de_passe_temporaire text, p_expire_jours integer default 7)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exiger_editeur();
  if p_user_id = auth.uid() then
    raise exception 'Changez votre propre mot de passe depuis votre profil';
  end if;
  if exists (select 1 from public.plateforme_admins where user_id = p_user_id and role in ('super_admin', 'admin') and actif)
     and not public.est_super_admin() then
    raise exception 'Seul un super administrateur peut réinitialiser un compte Agence Elite' using errcode = '42501';
  end if;
  if coalesce(length(p_mot_de_passe_temporaire), 0) < 4 then
    raise exception 'Le mot de passe temporaire doit contenir au moins 4 caractères';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Compte introuvable';
  end if;
  insert into public.comptes_connexion (user_id, cree_par) values (p_user_id, auth.uid())
  on conflict (user_id) do nothing;
  perform set_config('app.pose_mot_de_passe_temporaire', 'oui', true);
  update auth.users
  set encrypted_password = extensions.crypt(p_mot_de_passe_temporaire, extensions.gen_salt('bf')), updated_at = now()
  where id = p_user_id;
  perform set_config('app.pose_mot_de_passe_temporaire', '', true);
  update public.comptes_connexion
  set doit_changer_mot_de_passe = true,
      temporaire_expire_le = now() + make_interval(days => greatest(coalesce(p_expire_jours, 7), 1))
  where user_id = p_user_id;
end
$$;

-- Connexion par identifiant : renvoie l'adresse du compte seulement si le mot de passe est juste,
-- puis l'application se connecte normalement à Supabase Auth avec cette adresse.
-- Même réponse pour un identifiant inconnu ou un mauvais mot de passe ; 5 échecs = 15 minutes de verrou.
create function public.resoudre_connexion(p_identifiant text, p_mot_de_passe text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cle text := lower(coalesce(public.normaliser_identifiant(p_identifiant), ''));
  tentative public.tentatives_connexion%rowtype;
  courriel text;
  hache text;
  refus constant jsonb := jsonb_build_object('ok', false, 'message', 'Identifiant ou mot de passe incorrect');
begin
  if v_cle = '' or length(v_cle) > 200 or coalesce(p_mot_de_passe, '') = '' or length(p_mot_de_passe) > 200 then
    return refus;
  end if;
  select * into tentative from public.tentatives_connexion where tentatives_connexion.cle = v_cle;
  if tentative.bloque_jusqu_au is not null and tentative.bloque_jusqu_au > now() then
    return jsonb_build_object('ok', false, 'message', 'Trop de tentatives : réessayez dans quelques minutes');
  end if;
  select u.email, u.encrypted_password into courriel, hache
  from public.comptes_connexion c
  join auth.users u on u.id = c.user_id
  where lower(c.identifiant) = v_cle;
  -- Hachage factice si l'identifiant est inconnu : même temps de réponse.
  if extensions.crypt(p_mot_de_passe, coalesce(nullif(hache, ''), '$2a$10$abcdefghijklmnopqrstuuJ0oO2V5ZPGh8Sc9YcFSvmnOpVv0Ilfe'))
       = coalesce(nullif(hache, ''), '-') and courriel is not null then
    delete from public.tentatives_connexion where tentatives_connexion.cle = v_cle;
    return jsonb_build_object('ok', true, 'email', courriel);
  end if;
  insert into public.tentatives_connexion as t (cle, echecs, derniere_le)
  values (v_cle, 1, now())
  on conflict (cle) do update set
    echecs = case when t.derniere_le < now() - interval '15 minutes' then 1 else t.echecs + 1 end,
    derniere_le = now(),
    bloque_jusqu_au = case
      when (case when t.derniere_le < now() - interval '15 minutes' then 1 else t.echecs + 1 end) >= 5
      then now() + interval '15 minutes' end;
  return refus;
end
$$;

-- Administrateurs de la plateforme (super administrateur uniquement).
create function public.definir_admin_plateforme(p_user_id uuid, p_role text, p_actif boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exiger_super_admin();
  if p_role not in ('super_admin', 'admin', 'support') then
    raise exception 'Rôle plateforme inconnu : %', p_role;
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Vous ne pouvez pas modifier votre propre rôle';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Compte introuvable';
  end if;
  insert into public.plateforme_admins (user_id, role, actif) values (p_user_id, p_role, coalesce(p_actif, true))
  on conflict (user_id) do update set role = excluded.role, actif = excluded.actif;
end
$$;

-- Liste des comptes pour l'espace Agence Elite (aucune donnée d'authentification sensible).
create function public.editeur_comptes()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exiger_editeur();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', u.id,
      'email', u.email,
      'nom', p.nom_complet,
      'identifiant', c.identifiant,
      'doit_changer_mot_de_passe', coalesce(c.doit_changer_mot_de_passe, false),
      'temporaire_expire_le', c.temporaire_expire_le,
      'role_plateforme', (select a.role from public.plateforme_admins a where a.user_id = u.id and a.actif),
      'derniere_connexion', u.last_sign_in_at,
      'cree_le', u.created_at,
      'acces', coalesce((
        select jsonb_agg(jsonb_build_object('etablissement', e.nom, 'etablissement_id', e.id, 'role', m.role_id, 'actif', m.actif) order by e.nom)
        from public.etablissement_membres m join public.etablissements e on e.id = m.etablissement_id
        where m.user_id = u.id
      ), '[]'::jsonb)
    ) order by coalesce(p.nom_complet, u.email))
    from auth.users u
    left join public.profils p on p.id = u.id
    left join public.comptes_connexion c on c.user_id = u.id
    where u.banned_until is null or u.banned_until < now()
  ), '[]'::jsonb);
end
$$;

revoke all on public.tentatives_connexion from anon, authenticated;
revoke execute on function public.controler_changement_mot_de_passe() from public, anon, authenticated;
grant execute on function public.resoudre_connexion(text, text) to anon, authenticated;
