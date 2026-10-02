-- Phase 2-3 : profils automatiques, invitations et gestion des membres depuis
-- l'application, mode support utilisable avec Supabase (sans variable de session).

-- Profils -----------------------------------------------------------------------
-- Chaque compte reçoit son profil à la création ; le nom vient des métadonnées
-- d'inscription quand elles existent.
create function public.creer_profil_utilisateur()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profils(id, nom_complet)
  values (new.id, nullif(btrim(to_jsonb(new) -> 'raw_user_meta_data' ->> 'nom'), ''))
  on conflict (id) do nothing;
  return new;
end
$$;
create trigger creer_profil_apres_inscription
after insert on auth.users
for each row execute function public.creer_profil_utilisateur();

create function public.enregistrer_profil(p_nom text, p_telephone text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Une authentification est requise';
  end if;
  if coalesce(btrim(p_nom), '') = '' then
    raise exception 'Le nom est obligatoire';
  end if;
  insert into public.profils(id, nom_complet, telephone)
  values (auth.uid(), btrim(p_nom), nullif(btrim(p_telephone), ''))
  on conflict (id) do update set nom_complet = excluded.nom_complet, telephone = excluded.telephone;
end
$$;

-- Mode support ------------------------------------------------------------------
-- Une session ouverte par un administrateur actif, de moins de 8 heures, ouvre la
-- lecture de cet établissement uniquement. Plus besoin de variable de session :
-- cela fonctionne aussi au travers de l'API Supabase.
create or replace function public.session_support_active(p_etablissement_id uuid, p_ecriture boolean default false)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
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

create or replace function public.ouvrir_session_support(p_etablissement_id uuid, p_motif text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid;
begin
  if not exists (select 1 from public.plateforme_admins where user_id = auth.uid() and actif) then
    raise exception 'Réservé à l''équipe Agence Elite';
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

-- Invitations et membres ----------------------------------------------------------
-- Rang du rôle de l'utilisateur connecté dans l'établissement (1 = gérant).
create function public.rang_role_connecte(p_etablissement_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select r.ordre
  from public.etablissement_membres m
  join public.roles r on r.id = m.role_id
  where m.etablissement_id = p_etablissement_id and m.user_id = auth.uid() and m.actif
$$;

-- Autorise la gestion d'équipe : super admin, ou permission membres.gerer sur un
-- établissement modifiable. Un membre ne donne jamais un rôle supérieur au sien.
create function public.exiger_gestion_membres(p_etablissement_id uuid, p_role_id text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  rang_cible integer;
begin
  if auth.uid() is null then
    raise exception 'Une authentification est requise';
  end if;
  if public.est_super_admin() then
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
$$;

create function public.inviter_membre(p_etablissement_id uuid, p_email text, p_role_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  courriel text := lower(btrim(coalesce(p_email, '')));
  resultat public.invitations%rowtype;
begin
  if courriel !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Adresse e-mail invalide';
  end if;
  if not exists (select 1 from public.roles where id = p_role_id) then
    raise exception 'Rôle inconnu';
  end if;
  perform public.exiger_gestion_membres(p_etablissement_id, p_role_id);
  if exists (
    select 1 from public.etablissement_membres m
    join auth.users u on u.id = m.user_id
    where m.etablissement_id = p_etablissement_id and lower(u.email) = courriel and m.actif
  ) then
    raise exception 'Cette personne fait déjà partie de l''équipe';
  end if;
  -- Une nouvelle invitation remplace celle qui attendait encore.
  update public.invitations set annulee_le = now()
  where etablissement_id = p_etablissement_id and email = courriel and acceptee_le is null and annulee_le is null;
  insert into public.invitations(email, etablissement_id, role_id, cree_par)
  values (courriel, p_etablissement_id, p_role_id, auth.uid())
  returning * into resultat;
  return jsonb_build_object('id', resultat.id, 'email', resultat.email, 'role_id', resultat.role_id, 'expire_le', resultat.expire_le);
end
$$;

-- L'ancienne fonction reste disponible et suit désormais les mêmes règles.
create or replace function public.inviter_gerant(p_etablissement_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exiger_super_admin();
  return (public.inviter_membre(p_etablissement_id, p_email, 'gerant') ->> 'id')::uuid;
end
$$;

create function public.inviter_dirigeant(p_client_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  courriel text := lower(btrim(coalesce(p_email, '')));
  resultat uuid;
begin
  perform public.exiger_super_admin();
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
$$;

create function public.annuler_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
    perform public.exiger_super_admin();
  end if;
  update public.invitations set annulee_le = now() where id = p_invitation_id;
end
$$;

-- Invitations en attente pour l'adresse du compte connecté.
create function public.mes_invitations()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'role', coalesce(r.nom, case i.role_client when 'dirigeant' then 'Dirigeant' else 'Lecteur' end),
    'etablissement', e.nom,
    'client', coalesce(c.nom, ce.nom),
    'expire_le', i.expire_le
  ) order by i.cree_le), '[]'::jsonb)
  from public.invitations i
  left join public.roles r on r.id = i.role_id
  left join public.etablissements e on e.id = i.etablissement_id
  left join public.clients ce on ce.id = e.client_id
  left join public.clients c on c.id = i.client_id
  where i.email = (select lower(u.email) from auth.users u where u.id = auth.uid())
    and i.acceptee_le is null and i.annulee_le is null and i.expire_le > now()
$$;

-- Équipe d'un établissement, avec e-mails (que la RLS ne montre pas directement).
create function public.equipe_etablissement(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (
    public.est_super_admin()
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
$$;

-- Modifier le rôle, les ajustements de permissions ou l'activité d'un membre.
create function public.modifier_membre(
  p_etablissement_id uuid,
  p_user_id uuid,
  p_role_id text,
  p_permissions_ajustees jsonb default '{}'::jsonb,
  p_actif boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
  if p_user_id = auth.uid() and not public.est_super_admin() then
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
  if not public.est_super_admin()
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
$$;

-- Droits d'exécution ----------------------------------------------------------------
revoke execute on function public.creer_profil_utilisateur() from public, anon, authenticated;
revoke execute on function public.rang_role_connecte(uuid) from public, anon, authenticated;
revoke execute on function public.exiger_gestion_membres(uuid, text) from public, anon, authenticated;
do $$
declare signature text;
begin
  foreach signature in array array[
    'public.enregistrer_profil(text, text)',
    'public.ouvrir_session_support(uuid, text)',
    'public.inviter_membre(uuid, text, text)',
    'public.inviter_gerant(uuid, text)',
    'public.inviter_dirigeant(uuid, text)',
    'public.annuler_invitation(uuid)',
    'public.mes_invitations()',
    'public.equipe_etablissement(uuid)',
    'public.modifier_membre(uuid, uuid, text, jsonb, boolean)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
end
$$;
