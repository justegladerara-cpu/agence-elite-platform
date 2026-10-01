-- Fonctions d'accès centralisées. Leur propriétaire contourne la RLS afin d'éviter
-- toute récursion entre les politiques et les tables d'appartenance.
create function public.est_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.plateforme_admins
    where user_id = auth.uid() and role = 'super_admin' and actif
  )
$$;

create function public.est_membre(p_etablissement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.etablissement_membres
    where etablissement_id = p_etablissement_id and user_id = auth.uid() and actif
  )
$$;

create function public.est_dirigeant(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.client_membres
    where client_id = p_client_id and user_id = auth.uid() and actif
  )
$$;

create function public.module_actif(p_etablissement_id uuid, p_module_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.etablissement_modules em
    join public.etablissements e on e.id = em.etablissement_id
    where em.etablissement_id = p_etablissement_id
      and em.module_id = p_module_id
      and em.actif
      and e.statut <> 'archive'
  )
$$;

create function public.a_permission(p_etablissement_id uuid, p_permission_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
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

create function public.etablissement_autorise_ecriture(p_etablissement_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.etablissements where id = p_etablissement_id and statut = 'actif')
$$;

-- Le catalogue est nécessaire au rendu de l'application authentifiée.
create policy catalogue_lecture on public.solutions for select to authenticated using (true);
create policy catalogue_lecture on public.modules for select to authenticated using (true);
create policy catalogue_lecture on public.module_dependances for select to authenticated using (true);
create policy catalogue_lecture on public.solution_modules for select to authenticated using (true);
create policy catalogue_lecture on public.roles for select to authenticated using (true);
create policy catalogue_lecture on public.permissions for select to authenticated using (true);
create policy catalogue_lecture on public.role_permissions for select to authenticated using (true);

create policy admins_lecture_propre on public.plateforme_admins for select to authenticated
using (user_id = auth.uid());
create policy clients_lecture on public.clients for select to authenticated
using (public.est_super_admin() or public.est_dirigeant(id) or exists (
  select 1 from public.etablissements e where e.client_id = id and public.est_membre(e.id)
));
create policy client_membres_lecture on public.client_membres for select to authenticated
using (public.est_super_admin() or user_id = auth.uid() or public.est_dirigeant(client_id));
create policy etablissements_lecture on public.etablissements for select to authenticated
using (public.est_super_admin() or public.est_membre(id) or public.est_dirigeant(client_id));
create policy etablissement_modules_lecture on public.etablissement_modules for select to authenticated
using (public.est_super_admin() or public.est_membre(etablissement_id) or exists (
  select 1 from public.etablissements e where e.id = etablissement_id and public.est_dirigeant(e.client_id)
));

create policy profils_lecture on public.profils for select to authenticated
using (id = auth.uid() or public.est_super_admin() or exists (
  select 1 from public.etablissement_membres moi
  join public.etablissement_membres autre on autre.etablissement_id = moi.etablissement_id
  where moi.user_id = auth.uid() and moi.actif and autre.user_id = profils.id
));
create policy profils_modification on public.profils for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());
create policy membres_lecture on public.etablissement_membres for select to authenticated
using (public.est_super_admin() or user_id = auth.uid() or public.est_dirigeant((select client_id from public.etablissements where id = etablissement_id)) or public.a_permission(etablissement_id, 'membres.lire'));
create policy membres_ecriture on public.etablissement_membres for all to authenticated
using (public.a_permission(etablissement_id, 'membres.gerer') and public.etablissement_autorise_ecriture(etablissement_id))
with check (public.a_permission(etablissement_id, 'membres.gerer') and public.etablissement_autorise_ecriture(etablissement_id));
create policy invitations_lecture on public.invitations for select to authenticated
using (public.est_super_admin() or (etablissement_id is not null and public.a_permission(etablissement_id, 'membres.lire')) or (client_id is not null and public.est_dirigeant(client_id)));
create policy invitations_ecriture on public.invitations for all to authenticated
using (etablissement_id is not null and public.a_permission(etablissement_id, 'membres.gerer') and public.etablissement_autorise_ecriture(etablissement_id))
with check (etablissement_id is not null and public.a_permission(etablissement_id, 'membres.gerer') and public.etablissement_autorise_ecriture(etablissement_id));

create policy identite_lecture on public.etablissement_identite for select to authenticated
using (public.est_membre(etablissement_id) or public.est_dirigeant((select client_id from public.etablissements where id = etablissement_id)) or public.est_super_admin());
create policy identite_ecriture on public.etablissement_identite for all to authenticated
using (public.a_permission(etablissement_id, 'etablissement.modifier') and public.etablissement_autorise_ecriture(etablissement_id))
with check (public.a_permission(etablissement_id, 'etablissement.modifier') and public.etablissement_autorise_ecriture(etablissement_id));
create policy parametres_lecture on public.etablissement_parametres for select to authenticated
using ((public.est_membre(etablissement_id) or public.est_dirigeant((select client_id from public.etablissements where id = etablissement_id))) and public.module_actif(etablissement_id, module_id));
create policy parametres_ecriture on public.etablissement_parametres for all to authenticated
using (public.a_permission(etablissement_id, module_id || '.modifier') and public.etablissement_autorise_ecriture(etablissement_id))
with check (public.a_permission(etablissement_id, module_id || '.modifier') and public.etablissement_autorise_ecriture(etablissement_id));
create policy points_lecture on public.points_de_vente for select to authenticated
using (public.est_membre(etablissement_id) or public.est_dirigeant((select client_id from public.etablissements where id = etablissement_id)));
create policy points_ecriture on public.points_de_vente for all to authenticated
using (public.a_permission(etablissement_id, 'etablissement.modifier') and public.etablissement_autorise_ecriture(etablissement_id))
with check (public.a_permission(etablissement_id, 'etablissement.modifier') and public.etablissement_autorise_ecriture(etablissement_id));
create policy numerotations_lecture on public.numerotations for select to authenticated
using (public.est_membre(etablissement_id) or public.est_dirigeant((select client_id from public.etablissements where id = etablissement_id)));
create policy numerotations_ecriture on public.numerotations for all to authenticated
using (public.a_permission(etablissement_id, 'etablissement.modifier') and public.etablissement_autorise_ecriture(etablissement_id))
with check (public.a_permission(etablissement_id, 'etablissement.modifier') and public.etablissement_autorise_ecriture(etablissement_id));
create policy evenements_lecture on public.evenements for select to authenticated
using ((etablissement_id is not null and (public.est_membre(etablissement_id) or public.est_dirigeant((select client_id from public.etablissements where id = etablissement_id)))) or (client_id is not null and public.est_dirigeant(client_id)) or public.est_super_admin());
create policy evenements_ajout on public.evenements for insert to authenticated
with check (etablissement_id is not null and public.est_membre(etablissement_id) and public.etablissement_autorise_ecriture(etablissement_id));
create policy audit_lecture_admin on public.journal_audit for select to authenticated using (public.est_super_admin());

-- Empêche le déplacement transversal de toute ligne portant etablissement_id.
create function public.verrouiller_etablissement_id()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.etablissement_id is distinct from old.etablissement_id then
    raise exception 'L''établissement d''une ligne ne peut pas être modifié';
  end if;
  return new;
end
$$;

do $$
declare nom_table text;
begin
  foreach nom_table in array array['etablissement_modules','etablissement_membres','invitations','etablissement_identite','etablissement_parametres','points_de_vente','numerotations','evenements'] loop
    execute format('create trigger %I_verrou_etablissement before update on public.%I for each row execute function public.verrouiller_etablissement_id()', nom_table, nom_table);
  end loop;
end
$$;

create function public.verifier_dependances_module()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.actif and exists (
    select 1 from module_dependances d
    where d.module_id = new.module_id
      and not exists (
        select 1 from etablissement_modules em
        where em.etablissement_id = new.etablissement_id and em.module_id = d.depend_de and em.actif
      )
  ) then
    raise exception 'Toutes les dépendances du module doivent être actives';
  end if;
  if not new.actif and exists (
    select 1 from module_dependances d
    join etablissement_modules em on em.module_id = d.module_id
    where d.depend_de = new.module_id and em.etablissement_id = new.etablissement_id and em.actif
  ) then
    raise exception 'Un module actif dépend encore de ce module';
  end if;
  return new;
end
$$;
create trigger etablissement_modules_dependances
before insert or update of actif on public.etablissement_modules
for each row execute function public.verifier_dependances_module();
