-- Correctifs de sécurité issus de l'audit du Lot 1 (2026-10-02).

-- 1. Invitation : comparaison sûre face à un courriel absent.
create or replace function public.accepter_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.invitations%rowtype;
  courriel text;
begin
  if auth.uid() is null then
    raise exception 'Une authentification est requise';
  end if;
  select lower(email) into courriel from auth.users where id = auth.uid();
  if courriel is null or courriel = '' then
    raise exception 'Un compte sans adresse courriel ne peut pas accepter d''invitation';
  end if;
  select * into invitation from public.invitations where id = p_invitation_id for update;
  if invitation.id is null
     or invitation.email is distinct from courriel
     or invitation.acceptee_le is not null
     or invitation.annulee_le is not null
     or invitation.expire_le <= now() then
    raise exception 'Cette invitation ne peut pas être acceptée';
  end if;
  if invitation.etablissement_id is not null then
    insert into public.etablissement_membres(etablissement_id, user_id, role_id)
    values (invitation.etablissement_id, auth.uid(), invitation.role_id)
    on conflict (etablissement_id, user_id) do update set role_id = excluded.role_id, actif = true;
  else
    insert into public.client_membres(client_id, user_id, role)
    values (invitation.client_id, auth.uid(), invitation.role_client)
    on conflict (client_id, user_id) do update set role = excluded.role, actif = true;
  end if;
  update public.invitations set acceptee_le = now() where id = invitation.id;
end
$$;

-- 2. Écriture : l'établissement ET son client doivent être actifs.
create or replace function public.etablissement_autorise_ecriture(p_etablissement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.etablissements e
    join public.clients c on c.id = e.client_id
    where e.id = p_etablissement_id and e.statut = 'actif' and c.statut = 'actif'
  )
$$;

-- 3. Portée de colonne corrigée : un membre voit le client de son établissement.
drop policy clients_lecture on public.clients;
create policy clients_lecture on public.clients for select to authenticated
using (
  public.est_super_admin()
  or public.est_dirigeant(clients.id)
  or exists (
    select 1 from public.etablissements e
    where e.client_id = clients.id and public.est_membre(e.id)
  )
);

-- 4. L'acteur d'un événement est toujours l'utilisateur connecté.
drop policy evenements_ajout on public.evenements;
create policy evenements_ajout on public.evenements for insert to authenticated
with check (
  etablissement_id is not null
  and acteur = auth.uid()
  and public.est_membre(etablissement_id)
  and public.etablissement_autorise_ecriture(etablissement_id)
);

-- 5. Mode support : ouverture et fermeture explicites, journalisées.
create function public.ouvrir_session_support(p_etablissement_id uuid, p_motif text)
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
  insert into public.sessions_support(admin_id, etablissement_id, motif)
  values (auth.uid(), p_etablissement_id, p_motif)
  returning id into resultat;
  return resultat;
end
$$;

create function public.fermer_session_support(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.sessions_support
  set fermee_le = now()
  where id = p_session_id and admin_id = auth.uid() and fermee_le is null;
  if not found then
    raise exception 'Session support introuvable ou déjà fermée';
  end if;
end
$$;

-- 6. Le super admin ne lit plus les données d'établissement hors mode support.
drop policy identite_lecture on public.etablissement_identite;
create policy identite_lecture on public.etablissement_identite for select to authenticated
using (
  public.est_membre(etablissement_id)
  or public.est_dirigeant((select e.client_id from public.etablissements e where e.id = etablissement_id))
);

drop policy evenements_lecture on public.evenements;
create policy evenements_lecture on public.evenements for select to authenticated
using (
  (etablissement_id is not null and (
    public.est_membre(etablissement_id)
    or public.est_dirigeant((select e.client_id from public.etablissements e where e.id = etablissement_id))
  ))
  or (client_id is not null and public.est_dirigeant(client_id))
);

drop policy profils_lecture on public.profils;
create policy profils_lecture on public.profils for select to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.etablissement_membres moi
    join public.etablissement_membres autre on autre.etablissement_id = moi.etablissement_id
    where moi.user_id = auth.uid() and moi.actif and autre.user_id = profils.id
  )
);

-- 7. Membres : ajout direct réservé au super admin ; personne ne modifie sa propre ligne.
drop policy membres_ecriture on public.etablissement_membres;
create policy membres_ajout on public.etablissement_membres for insert to authenticated
with check (public.est_super_admin());
create policy membres_modification on public.etablissement_membres for update to authenticated
using (
  user_id <> auth.uid()
  and public.a_permission(etablissement_id, 'membres.gerer')
  and public.etablissement_autorise_ecriture(etablissement_id)
)
with check (
  user_id <> auth.uid()
  and public.a_permission(etablissement_id, 'membres.gerer')
  and public.etablissement_autorise_ecriture(etablissement_id)
);

create function public.verrouiller_utilisateur_membre()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'Le compte associé à une adhésion ne peut pas être modifié';
  end if;
  return new;
end
$$;
create trigger etablissement_membres_verrou_utilisateur
before update on public.etablissement_membres
for each row execute function public.verrouiller_utilisateur_membre();

-- 8. Les ajustements de permissions sont toujours des booléens.
create function public.permissions_ajustees_valides(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'object'
    and not exists (select 1 from jsonb_each(p) e where jsonb_typeof(e.value) <> 'boolean')
$$;
alter table public.etablissement_membres
  add constraint etablissement_membres_permissions_booleennes
  check (public.permissions_ajustees_valides(permissions_ajustees));

-- Les fonctions privilégiées ne sont jamais appelables par anon.
revoke execute on function public.ouvrir_session_support(uuid, text) from public, anon;
revoke execute on function public.fermer_session_support(uuid) from public, anon;
revoke execute on function public.accepter_invitation(uuid) from public, anon;
grant execute on function public.ouvrir_session_support(uuid, text) to authenticated;
grant execute on function public.fermer_session_support(uuid) to authenticated;
grant execute on function public.accepter_invitation(uuid) to authenticated;
