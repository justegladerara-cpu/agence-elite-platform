-- Restaurant en service réel (2026-10-05) — générique, aucun client n'est nommé ici.
-- 1. Catégories d'articles administrables : description, ordre, activation, archivage/restauration,
--    déplacement d'articles en masse ; une catégorie qui contient des articles en vente ne s'archive
--    jamais en silence (il faut choisir où vont ses articles).
-- 2. Disponibilité opérationnelle : un article indisponible ou épuisé ne se commande plus en salle.
-- 3. Serveur affecté à une table, avec historique (début/fin, auteur) : la commande ouverte sur la table
--    prend le serveur affecté et le garde ; un changement de serveur d'une commande est un transfert
--    volontaire, autorisé, motivé et tracé.
-- 4. Statistiques par serveur (soi-même, ou tous avec la permission dédiée) et service en cours au tableau de bord.
-- 5. Import de catalogue : dédoublonnage par désignation, rapport détaillé (catégories, réutilisations,
--    avertissements), stock existant préservé, audit de l'import.
-- Rien n'est supprimé, aucune donnée existante n'est réécrite, sauf le remplissage de rest_commandes.pris_par.

-- ---------------------------------------------------------------------------
-- 1. Permissions
-- ---------------------------------------------------------------------------
insert into public.permissions (id, module_id, description) values
  ('articles.categories', 'articles', 'Créer, renommer, ordonner, archiver les catégories et y déplacer les articles'),
  ('restaurant_salle.affecter', 'restaurant_salle', 'Affecter, changer ou retirer le serveur d''une table'),
  ('restaurant_salle.transferer', 'restaurant_salle', 'Transférer une commande ouverte à un autre serveur (avec motif)'),
  ('restaurant_salle.performances', 'restaurant_salle', 'Voir l''activité et le chiffre de tous les serveurs')
on conflict (id) do nothing;

-- Les catégories suivent ceux qui gèrent déjà les articles (aucun droit nouveau pour les autres rôles).
insert into public.role_permissions (role_id, permission_id)
select role_id, 'articles.categories' from public.role_permissions where permission_id = 'articles.gerer'
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['gerant', 'responsable', 'responsable_hub']) r
cross join unnest(array['restaurant_salle.affecter', 'restaurant_salle.transferer', 'restaurant_salle.performances']) p
where exists (select 1 from public.roles where id = r)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Catégories d'articles
-- ---------------------------------------------------------------------------
alter table public.categories_articles add column if not exists description text
  check (description is null or length(description) <= 300);
alter table public.categories_articles add column if not exists archivee_le timestamptz;
alter table public.categories_articles add column if not exists modifie_le timestamptz not null default now();
alter table public.categories_articles add constraint categories_articles_archivee_inactive
  check (archivee_le is null or not actif);
create trigger categories_articles_modifie_le before update on public.categories_articles
for each row execute function public.fixer_modifie_le();

-- Création rapide depuis la fiche article : une catégorie archivée du même nom est restaurée.
create or replace function public.enregistrer_categorie(p_etablissement_id uuid, p_nom text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'articles.gerer');
  if coalesce(btrim(p_nom), '') = '' then
    raise exception 'Le nom de la catégorie est obligatoire';
  end if;
  select id into resultat from public.categories_articles
  where etablissement_id = p_etablissement_id and lower(nom) = lower(btrim(p_nom));
  if resultat is null then
    insert into public.categories_articles(etablissement_id, nom, ordre)
    values (p_etablissement_id, btrim(p_nom),
      coalesce((select max(ordre) + 10 from public.categories_articles where etablissement_id = p_etablissement_id), 10))
    returning id into resultat;
  else
    update public.categories_articles set actif = true, archivee_le = null where id = resultat and not actif;
  end if;
  return resultat;
end
$$;

-- Crée ou modifie une catégorie. p : { id?, nom, description?, ordre?, actif? }
create function public.enregistrer_categorie_article(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p ->> 'id', '')::uuid;
  existante public.categories_articles%rowtype;
  v_nom text := btrim(coalesce(p ->> 'nom', ''));
begin
  perform public.exiger_permission(p_etablissement_id, 'articles.categories');
  if v_nom = '' then
    raise exception 'Le nom de la catégorie est obligatoire';
  end if;
  if length(v_nom) > 80 then
    raise exception 'Nom de catégorie trop long (80 caractères)';
  end if;
  if length(coalesce(p ->> 'description', '')) > 300 then
    raise exception 'Description trop longue (300 caractères)';
  end if;
  if resultat is not null then
    select * into existante from public.categories_articles
    where id = resultat and etablissement_id = p_etablissement_id for update;
    if existante.id is null then
      raise exception 'Catégorie introuvable dans cet établissement';
    end if;
    if existante.archivee_le is not null then
      raise exception 'Cette catégorie est archivée : restaurez-la avant de la modifier';
    end if;
  end if;
  if exists (select 1 from public.categories_articles where etablissement_id = p_etablissement_id
             and lower(nom) = lower(v_nom) and id is distinct from resultat) then
    raise exception 'Une catégorie « % » existe déjà (éventuellement archivée)', v_nom;
  end if;
  if resultat is null then
    insert into public.categories_articles(etablissement_id, nom, description, ordre, actif)
    values (p_etablissement_id, v_nom, nullif(btrim(p ->> 'description'), ''),
      coalesce(nullif(p ->> 'ordre', '')::integer,
        (select max(ordre) + 10 from public.categories_articles where etablissement_id = p_etablissement_id), 10),
      coalesce((p ->> 'actif')::boolean, true))
    returning id into resultat;
  else
    update public.categories_articles set
      nom = v_nom,
      description = case when p ? 'description' then nullif(btrim(p ->> 'description'), '') else description end,
      ordre = coalesce(nullif(p ->> 'ordre', '')::integer, ordre),
      actif = coalesce((p ->> 'actif')::boolean, actif)
    where id = resultat;
  end if;
  return resultat;
end
$$;

-- Archive une catégorie. Ses articles en vente doivent d'abord recevoir une autre catégorie
-- (p_deplacer_vers) ou être explicitement laissés sans catégorie (p_sans_categorie).
-- Retourne le nombre d'articles déplacés.
create function public.archiver_categorie_article(p_categorie_id uuid, p_deplacer_vers uuid default null,
  p_sans_categorie boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  cat public.categories_articles%rowtype;
  cible public.categories_articles%rowtype;
  en_vente integer;
  deplaces integer := 0;
begin
  select * into cat from public.categories_articles where id = p_categorie_id for update;
  if cat.id is null then
    raise exception 'Catégorie introuvable';
  end if;
  perform public.exiger_permission(cat.etablissement_id, 'articles.categories');
  if cat.archivee_le is not null then
    raise exception 'Cette catégorie est déjà archivée';
  end if;
  if p_deplacer_vers is not null then
    select * into cible from public.categories_articles where id = p_deplacer_vers and etablissement_id = cat.etablissement_id;
    if cible.id is null or cible.archivee_le is not null then
      raise exception 'Catégorie de destination introuvable ou archivée';
    end if;
    if cible.id = cat.id then
      raise exception 'Choisissez une autre catégorie de destination';
    end if;
  end if;
  select count(*) into en_vente from public.articles where categorie_id = cat.id and actif;
  if en_vente > 0 and p_deplacer_vers is null and not coalesce(p_sans_categorie, false) then
    raise exception 'La catégorie « % » contient % article(s) en vente : choisissez la catégorie qui les reçoit', cat.nom, en_vente;
  end if;
  if p_deplacer_vers is not null or coalesce(p_sans_categorie, false) then
    -- Tous les articles suivent (en vente et archivés), pour ne rien laisser dans une catégorie archivée.
    update public.articles set categorie_id = p_deplacer_vers where categorie_id = cat.id;
    get diagnostics deplaces = row_count;
  end if;
  update public.categories_articles set actif = false, archivee_le = now() where id = cat.id;
  return deplaces;
end
$$;

create function public.restaurer_categorie_article(p_categorie_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cat public.categories_articles%rowtype;
begin
  select * into cat from public.categories_articles where id = p_categorie_id for update;
  if cat.id is null then
    raise exception 'Catégorie introuvable';
  end if;
  perform public.exiger_permission(cat.etablissement_id, 'articles.categories');
  if cat.archivee_le is null then
    raise exception 'Cette catégorie n''est pas archivée';
  end if;
  update public.categories_articles set archivee_le = null, actif = true where id = cat.id;
end
$$;

-- Ordre d'affichage : la liste donnée devient l'ordre (10, 20, 30…) ; les autres catégories gardent le leur.
create function public.ordonner_categories_articles(p_etablissement_id uuid, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exiger_permission(p_etablissement_id, 'articles.categories');
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'Aucune catégorie à ordonner';
  end if;
  if cardinality(p_ids) > 500 then
    raise exception 'Trop de catégories en une fois';
  end if;
  if (select count(distinct x) from unnest(p_ids) x) <> cardinality(p_ids) then
    raise exception 'Catégorie en double dans l''ordre demandé';
  end if;
  if exists (select 1 from unnest(p_ids) x where not exists (
      select 1 from public.categories_articles c where c.id = x and c.etablissement_id = p_etablissement_id)) then
    raise exception 'Catégorie inconnue dans cet établissement';
  end if;
  update public.categories_articles c set ordre = o.rang * 10
  from unnest(p_ids) with ordinality as o(id, rang)
  where c.id = o.id and c.ordre is distinct from o.rang * 10;
  return cardinality(p_ids);
end
$$;

-- Déplace des articles (sélection multiple) vers une catégorie, ou les laisse sans catégorie (null).
create function public.deplacer_articles_categorie(p_etablissement_id uuid, p_article_ids uuid[], p_categorie_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  nb integer;
begin
  perform public.exiger_permission(p_etablissement_id, 'articles.categories');
  if p_article_ids is null or cardinality(p_article_ids) = 0 then
    raise exception 'Aucun article sélectionné';
  end if;
  if cardinality(p_article_ids) > 2000 then
    raise exception 'Trop d''articles en une fois (2 000)';
  end if;
  if p_categorie_id is not null and not exists (
      select 1 from public.categories_articles where id = p_categorie_id and etablissement_id = p_etablissement_id and archivee_le is null) then
    raise exception 'Catégorie de destination introuvable ou archivée';
  end if;
  if exists (select 1 from unnest(p_article_ids) x where not exists (
      select 1 from public.articles a where a.id = x and a.etablissement_id = p_etablissement_id)) then
    raise exception 'Article inconnu dans cet établissement';
  end if;
  update public.articles set categorie_id = p_categorie_id
  where etablissement_id = p_etablissement_id and id = any(p_article_ids) and categorie_id is distinct from p_categorie_id;
  get diagnostics nb = row_count;
  if nb > 0 then
    insert into public.evenements (etablissement_id, client_id, type, acteur, donnees)
    select e.id, e.client_id, 'articles.deplacement_categorie', auth.uid(),
      jsonb_build_object('categorie_id', p_categorie_id, 'articles', nb)
    from public.etablissements e where e.id = p_etablissement_id;
  end if;
  return nb;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Disponibilité opérationnelle des articles
-- ---------------------------------------------------------------------------
-- Gérant (articles), responsable de salle ou cuisine : « indisponible » (retiré pour le service) ou « épuisé ».
create function public.definir_disponibilite_article(p_article_id uuid, p_disponible boolean, p_epuise boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_etab uuid;
  v_permission text;
begin
  select etablissement_id into v_etab from public.articles where id = p_article_id;
  if v_etab is null then
    raise exception 'Article introuvable';
  end if;
  select x into v_permission from unnest(array['articles.gerer', 'restaurant_salle.gerer', 'restaurant_cuisine.preparer']) x
  where public.a_permission(v_etab, x) limit 1;
  perform public.exiger_permission(v_etab, coalesce(v_permission, 'articles.gerer'));
  if p_disponible is null or p_epuise is null then
    raise exception 'Précisez la disponibilité et l''épuisement';
  end if;
  update public.articles set disponible = p_disponible, epuise = p_epuise where id = p_article_id;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Serveurs : affectation aux tables, historique, transferts de commande
-- ---------------------------------------------------------------------------
-- Qui a pris la commande (peut différer du serveur affecté qui en est responsable).
alter table public.rest_commandes add column if not exists pris_par uuid references auth.users(id) on delete restrict;
update public.rest_commandes set pris_par = serveur_id where pris_par is null;

create table public.rest_affectations (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  hub_id uuid not null,
  table_id uuid not null,
  serveur_id uuid not null references auth.users(id) on delete restrict,
  debut timestamptz not null default now(),
  fin timestamptz,
  affectee_par uuid not null references auth.users(id) on delete restrict,
  motif text check (motif is null or length(motif) <= 200),
  terminee_par uuid references auth.users(id) on delete restrict,
  motif_fin text check (motif_fin is null or length(motif_fin) <= 200),
  modifie_le timestamptz not null default now(),
  unique (id, etablissement_id),
  check (fin is null or fin >= debut),
  foreign key (hub_id, etablissement_id) references public.hubs(id, etablissement_id) on delete restrict,
  foreign key (table_id, etablissement_id) references public.rest_tables(id, etablissement_id) on delete restrict
);
-- Une seule affectation en cours par table.
create unique index rest_affectations_en_cours on public.rest_affectations(table_id) where fin is null;
create index rest_affectations_serveur_idx on public.rest_affectations(etablissement_id, serveur_id, debut);

create table public.rest_transferts_serveur (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  commande_id uuid not null,
  ancien_serveur_id uuid not null references auth.users(id) on delete restrict,
  nouveau_serveur_id uuid not null references auth.users(id) on delete restrict,
  motif text not null check (btrim(motif) <> '' and length(motif) <= 200),
  transfere_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  check (ancien_serveur_id <> nouveau_serveur_id),
  foreign key (commande_id, etablissement_id) references public.rest_commandes(id, etablissement_id) on delete restrict
);
create index rest_transferts_serveur_commande_idx on public.rest_transferts_serveur(commande_id);

do $$
declare
  nom_table text;
begin
  foreach nom_table in array array['rest_affectations', 'rest_transferts_serveur'] loop
    execute format('create trigger %I_sans_suppression before delete on public.%I for each row execute function public.refuser_suppression()', nom_table, nom_table);
    execute format('create trigger %I_sans_vidage before truncate on public.%I for each statement execute function public.refuser_suppression()', nom_table, nom_table);
    execute format('create trigger %I_verrou_etablissement before update on public.%I for each row execute function public.verrouiller_etablissement_id()', nom_table, nom_table);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.journaliser_modification()', nom_table, nom_table);
    execute format('alter table public.%I enable row level security', nom_table);
  end loop;
end
$$;
create trigger rest_affectations_modifie_le before update on public.rest_affectations
for each row execute function public.fixer_modifie_le();
create trigger rest_transferts_serveur_immuable before update on public.rest_transferts_serveur
for each row execute function public.refuser_modification();

-- Une affectation ne fait que se terminer : serveur, table, début et auteur ne changent jamais.
create function public.proteger_affectation_restaurant()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.fin is not null then
    raise exception 'Une affectation terminée ne change plus';
  end if;
  if new.serveur_id <> old.serveur_id or new.table_id <> old.table_id or new.hub_id <> old.hub_id
     or new.debut <> old.debut or new.affectee_par <> old.affectee_par or new.motif is distinct from old.motif then
    raise exception 'Une affectation ne se modifie pas : terminez-la et créez-en une nouvelle';
  end if;
  return new;
end
$$;
create trigger rest_affectations_protection before update on public.rest_affectations
for each row execute function public.proteger_affectation_restaurant();

create policy lecture on public.rest_affectations for select to authenticated
using ((public.lecture_autorisee(etablissement_id, 'restaurant_salle.lire') or public.lecture_autorisee(etablissement_id, 'restaurant_cuisine.lire'))
  and public.lecture_hub(etablissement_id, hub_id));
create policy lecture on public.rest_transferts_serveur for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'restaurant_salle.lire')
  and exists (select 1 from public.rest_commandes c where c.id = rest_transferts_serveur.commande_id and public.lecture_hub(c.etablissement_id, c.hub_id)));

-- Table retirée ou déplacée dans un autre Hub : son affectation en cours se termine d'elle-même.
create function public.terminer_affectation_table()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.hub_id <> old.hub_id or (old.actif and not new.actif)) then
    update public.rest_affectations set fin = now(), terminee_par = coalesce(auth.uid(), affectee_par),
      motif_fin = case when new.hub_id <> old.hub_id then 'Table déplacée dans un autre Hub' else 'Table retirée' end
    where table_id = new.id and fin is null;
  end if;
  return new;
end
$$;
create trigger rest_tables_fin_affectation after update on public.rest_tables
for each row execute function public.terminer_affectation_table();

-- Un membre peut-il servir dans ce Hub ? (membre actif, droit de servir, accès au Hub)
create function public.membre_peut_servir(p_etablissement_id uuid, p_user_id uuid, p_hub_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.etablissement_membres em
      where em.etablissement_id = p_etablissement_id and em.user_id = p_user_id and em.actif
        and coalesce((em.permissions_ajustees ->> 'restaurant_salle.servir')::boolean,
          exists (select 1 from public.role_permissions rp where rp.role_id = em.role_id and rp.permission_id = 'restaurant_salle.servir')))
    and (
      not exists (select 1 from public.membre_hubs r where r.etablissement_id = p_etablissement_id and r.user_id = p_user_id)
      or exists (select 1 from public.membre_hubs r where r.hub_id = p_hub_id and r.user_id = p_user_id)
    )
$$;

-- Nom affichable d'un membre (jamais son e-mail).
create function public.nom_membre_restaurant(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select coalesce(nullif(btrim(p.nom_affiche), ''), nullif(btrim(p.nom_complet), '')) from public.profils p where p.id = p_user_id),
    (select c.identifiant from public.comptes_connexion c where c.user_id = p_user_id),
    'Membre')
$$;

-- Serveurs possibles (membres actifs ayant le droit de servir) et Hubs auxquels ils ont accès (null = tous).
create function public.serveurs_restaurant(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.lecture_autorisee(p_etablissement_id, 'restaurant_salle.lire') then
    raise exception 'Permission refusée : restaurant_salle.lire' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', em.user_id, 'nom', public.nom_membre_restaurant(em.user_id), 'role_id', em.role_id,
      'hubs', (select jsonb_agg(r.hub_id) from public.membre_hubs r where r.etablissement_id = em.etablissement_id and r.user_id = em.user_id),
      'moi', em.user_id = auth.uid())
      order by public.nom_membre_restaurant(em.user_id))
    from public.etablissement_membres em
    where em.etablissement_id = p_etablissement_id and em.actif
      and coalesce((em.permissions_ajustees ->> 'restaurant_salle.servir')::boolean,
        exists (select 1 from public.role_permissions rp where rp.role_id = em.role_id and rp.permission_id = 'restaurant_salle.servir'))
  ), '[]'::jsonb);
end
$$;

-- Affecte (ou change) le serveur d'une table. L'affectation précédente se termine (historique conservé).
-- La commande déjà ouverte garde son serveur : la transférer est une action distincte et motivée.
create function public.affecter_serveur_table(p_table_id uuid, p_serveur_id uuid, p_motif text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.rest_tables%rowtype;
  en_cours public.rest_affectations%rowtype;
  resultat uuid;
begin
  select * into t from public.rest_tables where id = p_table_id for update;
  if t.id is null then
    raise exception 'Table introuvable';
  end if;
  perform public.exiger_permission(t.etablissement_id, 'restaurant_salle.affecter');
  perform public.exiger_acces_hub(t.hub_id);
  if not t.actif then
    raise exception 'Table retirée';
  end if;
  if p_serveur_id is null then
    raise exception 'Choisissez le serveur';
  end if;
  if length(coalesce(p_motif, '')) > 200 then
    raise exception 'Motif trop long (200 caractères)';
  end if;
  if not public.membre_peut_servir(t.etablissement_id, p_serveur_id, t.hub_id) then
    raise exception 'Ce membre ne peut pas servir dans ce Hub (membre inactif, sans droit de servir ou sans accès au Hub)';
  end if;
  select * into en_cours from public.rest_affectations where table_id = t.id and fin is null for update;
  if en_cours.id is not null and en_cours.serveur_id = p_serveur_id then
    return en_cours.id;
  end if;
  if en_cours.id is not null then
    update public.rest_affectations set fin = now(), terminee_par = auth.uid(),
      motif_fin = coalesce(nullif(btrim(p_motif), ''), 'Changement de serveur')
    where id = en_cours.id;
  end if;
  insert into public.rest_affectations (etablissement_id, hub_id, table_id, serveur_id, affectee_par, motif)
  values (t.etablissement_id, t.hub_id, t.id, p_serveur_id, auth.uid(), nullif(btrim(p_motif), ''))
  returning id into resultat;
  if p_serveur_id <> auth.uid() then
    perform public.notifier(p_serveur_id, t.etablissement_id, 'restaurant.affectation', 'Table affectée',
      'Vous servez la table ' || t.nom, 'salle');
  end if;
  return resultat;
end
$$;

create function public.retirer_serveur_table(p_table_id uuid, p_motif text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.rest_tables%rowtype;
begin
  select * into t from public.rest_tables where id = p_table_id;
  if t.id is null then
    raise exception 'Table introuvable';
  end if;
  perform public.exiger_permission(t.etablissement_id, 'restaurant_salle.affecter');
  perform public.exiger_acces_hub(t.hub_id);
  if length(coalesce(p_motif, '')) > 200 then
    raise exception 'Motif trop long (200 caractères)';
  end if;
  update public.rest_affectations set fin = now(), terminee_par = auth.uid(),
    motif_fin = coalesce(nullif(btrim(p_motif), ''), 'Affectation retirée')
  where table_id = t.id and fin is null;
  if not found then
    raise exception 'Aucun serveur n''est affecté à cette table';
  end if;
end
$$;

-- Transfert volontaire d'une commande ouverte à un autre serveur : droit dédié, motif, trace immuable.
create function public.transferer_serveur_commande(p_commande_id uuid, p_serveur_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.rest_commandes%rowtype;
  v_table text;
begin
  c := public.commande_restaurant_ouverte(p_commande_id, 'restaurant_salle.transferer');
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Le motif du transfert est obligatoire';
  end if;
  if length(p_motif) > 200 then
    raise exception 'Motif trop long (200 caractères)';
  end if;
  if p_serveur_id is null or p_serveur_id = c.serveur_id then
    raise exception 'Choisissez un autre serveur que le serveur actuel';
  end if;
  if not public.membre_peut_servir(c.etablissement_id, p_serveur_id, c.hub_id) then
    raise exception 'Ce membre ne peut pas servir dans ce Hub (membre inactif, sans droit de servir ou sans accès au Hub)';
  end if;
  insert into public.rest_transferts_serveur (etablissement_id, commande_id, ancien_serveur_id, nouveau_serveur_id, motif, transfere_par)
  values (c.etablissement_id, c.id, c.serveur_id, p_serveur_id, btrim(p_motif), auth.uid());
  update public.rest_commandes set serveur_id = p_serveur_id where id = c.id;
  select nom into v_table from public.rest_tables where id = c.table_id;
  if p_serveur_id <> auth.uid() then
    perform public.notifier(p_serveur_id, c.etablissement_id, 'restaurant.transfert', 'Commande transférée',
      c.numero || coalesce(' · table ' || v_table, ' · à emporter'), 'salle/' || c.id);
  end if;
end
$$;

-- Ouverture : sur table, le serveur affecté devient le serveur de la commande (sinon celui qui l'ouvre) ;
-- à emporter, celui qui la prend. pris_par garde toujours l'auteur réel.
create or replace function public.ouvrir_commande_restaurant(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table public.rest_tables%rowtype;
  hub public.hubs%rowtype;
  v_couverts integer := nullif(p ->> 'couverts', '')::integer;
  v_serveur uuid;
  resultat uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'restaurant_salle.servir');
  if nullif(p ->> 'table_id', '') is not null then
    select * into v_table from public.rest_tables where id = (p ->> 'table_id')::uuid and etablissement_id = p_etablissement_id for update;
    if v_table.id is null or not v_table.actif then
      raise exception 'Table introuvable ou retirée';
    end if;
    if exists (select 1 from public.rest_commandes where table_id = v_table.id and statut = 'ouverte') then
      raise exception 'La table % est déjà occupée', v_table.nom;
    end if;
    select * into hub from public.hubs where id = v_table.hub_id;
    if v_couverts is null and coalesce((public.parametre_module(p_etablissement_id, 'restaurant_salle', 'couverts_obligatoires') #>> '{}')::boolean, true) then
      raise exception 'Indiquez le nombre de couverts';
    end if;
    select a.serveur_id into v_serveur from public.rest_affectations a
    where a.table_id = v_table.id and a.fin is null
      and public.membre_peut_servir(p_etablissement_id, a.serveur_id, v_table.hub_id);
  else
    select * into hub from public.hubs where id = nullif(p ->> 'hub_id', '')::uuid and etablissement_id = p_etablissement_id;
    if hub.id is null then
      raise exception 'Choisissez une table, ou le Hub de la vente à emporter';
    end if;
  end if;
  perform public.exiger_acces_hub(hub.id);
  if not hub.actif or not hub.capacite_vente then
    raise exception 'Le Hub « % » ne vend pas', hub.nom;
  end if;
  insert into public.rest_commandes (etablissement_id, hub_id, numero, table_id, type, couverts, nom_client, note, serveur_id, pris_par)
  values (p_etablissement_id, hub.id, public.prochain_numero(p_etablissement_id, 'commande_restaurant', 'CM-'), v_table.id,
    case when v_table.id is null then 'a_emporter' else 'sur_place' end, v_couverts,
    nullif(btrim(p ->> 'nom_client'), ''), nullif(btrim(p ->> 'note'), ''), coalesce(v_serveur, auth.uid()), auth.uid())
  returning id into resultat;
  return resultat;
end
$$;

-- Ajout de plats : un article archivé, indisponible ou épuisé est refusé ; le libellé porte la variante.
create or replace function public.ajouter_lignes_restaurant(p_commande_id uuid, p_lignes jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.rest_commandes%rowtype;
  ligne jsonb;
  article public.articles%rowtype;
  quantite numeric;
  nb integer := 0;
begin
  c := public.commande_restaurant_ouverte(p_commande_id, 'restaurant_salle.servir');
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Aucun plat à ajouter';
  end if;
  if jsonb_array_length(p_lignes) > 100 then
    raise exception 'Trop de lignes en une fois';
  end if;
  for ligne in select * from jsonb_array_elements(p_lignes) loop
    if jsonb_typeof(ligne) <> 'object' then
      raise exception 'Ligne invalide';
    end if;
    quantite := nullif(ligne ->> 'quantite', '')::numeric;
    if quantite is null or quantite = 'NaN'::numeric or quantite <= 0 or quantite > 1000 then
      raise exception 'Quantité invalide';
    end if;
    select * into article from public.articles
    where id = nullif(ligne ->> 'article_id', '')::uuid and etablissement_id = c.etablissement_id;
    if article.id is null then
      raise exception 'Article inconnu dans cet établissement';
    end if;
    if not article.actif then
      raise exception 'L''article « % » est archivé', article.nom;
    end if;
    if not article.disponible then
      raise exception 'L''article « % » est indisponible', article.nom;
    end if;
    if article.epuise then
      raise exception 'L''article « % » est épuisé', article.nom;
    end if;
    if length(coalesce(ligne ->> 'note', '')) > 200 then
      raise exception 'Note trop longue (200 caractères)';
    end if;
    insert into public.rest_lignes (etablissement_id, commande_id, article_id, libelle, quantite, note, poste, ajoutee_par)
    values (c.etablissement_id, c.id, article.id, article.nom || coalesce(' — ' || nullif(btrim(article.variante), ''), ''),
      quantite, nullif(btrim(ligne ->> 'note'), ''), article.poste_preparation, auth.uid());
    nb := nb + 1;
  end loop;
  return nb;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Statistiques par serveur
-- ---------------------------------------------------------------------------
-- Sans la permission « performances », un membre ne voit que sa propre ligne.
-- Période : dates locales de l'établissement (aujourd'hui par défaut), commandes ouvertes dans la période.
create function public.statistiques_serveurs_restaurant(p_etablissement_id uuid, p_du date default null, p_au date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_du date := coalesce(p_du, public.date_locale(p_etablissement_id));
  v_au date := coalesce(p_au, p_du, public.date_locale(p_etablissement_id));
  v_tous boolean;
  resultat jsonb;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'restaurant_salle.lire') then
    raise exception 'Permission refusée : restaurant_salle.lire' using errcode = '42501';
  end if;
  if v_au < v_du or v_au - v_du > 366 then
    raise exception 'Période invalide (au plus un an)';
  end if;
  v_tous := public.a_permission(p_etablissement_id, 'restaurant_salle.performances')
    or public.est_dirigeant((select e.client_id from public.etablissements e where e.id = p_etablissement_id))
    or public.session_support_active(p_etablissement_id);
  with cmd as (
    select k.* from public.rest_commandes k
    where k.etablissement_id = p_etablissement_id and public.lecture_hub(k.etablissement_id, k.hub_id)
      and public.date_locale(p_etablissement_id, k.ouverte_le) between v_du and v_au
      and (v_tous or k.serveur_id = auth.uid())
  ),
  ventes_serveur as (
    select distinct k.serveur_id, v.id, v.total, v.montant_paye
    from cmd k join public.rest_lignes l on l.commande_id = k.id join public.ventes v on v.id = l.vente_id
    where v.statut <> 'annulee'
  ),
  affectations as (
    select a.serveur_id, count(*) as n from public.rest_affectations a
    where a.etablissement_id = p_etablissement_id and a.fin is null and public.lecture_hub(a.etablissement_id, a.hub_id)
      and (v_tous or a.serveur_id = auth.uid())
    group by a.serveur_id
  ),
  annulations as (
    select k.serveur_id, count(*) as n from cmd k join public.rest_lignes l on l.commande_id = k.id
    where l.statut = 'annulee' and l.envoyee_le is not null group by k.serveur_id
  ),
  serveurs as (select serveur_id from cmd union select serveur_id from affectations),
  lignes as (
    select s.serveur_id,
      public.nom_membre_restaurant(s.serveur_id) as nom,
      coalesce((select n from affectations a where a.serveur_id = s.serveur_id), 0) as tables_affectees,
      (select count(distinct k.table_id) from cmd k where k.serveur_id = s.serveur_id and k.table_id is not null and k.statut <> 'annulee') as tables_servies,
      (select count(*) from cmd k where k.serveur_id = s.serveur_id) as commandes,
      (select count(*) from cmd k where k.serveur_id = s.serveur_id and k.statut = 'ouverte') as commandes_en_cours,
      (select count(*) from cmd k where k.serveur_id = s.serveur_id and k.statut = 'encaissee') as commandes_cloturees,
      (select count(*) from cmd k where k.serveur_id = s.serveur_id and k.statut = 'annulee') as commandes_annulees,
      (select coalesce(sum(k.couverts), 0) from cmd k where k.serveur_id = s.serveur_id and k.statut <> 'annulee') as couverts,
      (select count(*) from ventes_serveur v where v.serveur_id = s.serveur_id) as additions,
      (select coalesce(sum(v.total), 0) from ventes_serveur v where v.serveur_id = s.serveur_id) as chiffre_affaires,
      (select coalesce(sum(v.montant_paye), 0) from ventes_serveur v where v.serveur_id = s.serveur_id) as encaisse,
      coalesce((select n from annulations a where a.serveur_id = s.serveur_id), 0) as plats_annules
    from serveurs s
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'serveur_id', l.serveur_id, 'nom', l.nom, 'moi', l.serveur_id = auth.uid(),
      'tables_affectees', l.tables_affectees, 'tables_servies', l.tables_servies,
      'commandes', l.commandes, 'commandes_en_cours', l.commandes_en_cours, 'commandes_cloturees', l.commandes_cloturees,
      'commandes_annulees', l.commandes_annulees, 'couverts', l.couverts, 'additions', l.additions,
      'chiffre_affaires', l.chiffre_affaires, 'encaisse', l.encaisse,
      'ticket_moyen', case when l.additions > 0 then round(l.chiffre_affaires / l.additions) else 0 end,
      'plats_annules', l.plats_annules)
    order by l.chiffre_affaires desc, l.nom), '[]'::jsonb)
  into resultat from lignes l;
  return jsonb_build_object('du', v_du, 'au', v_au, 'tous', v_tous, 'serveurs', resultat);
end
$$;

-- Synthèse du jour de la salle : mêmes clés qu'avant, plus postes, serveurs actifs et encaissements.
create or replace function public.tableau_de_bord_restaurant(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  jour date := public.date_locale(p_etablissement_id);
  resultat jsonb;
  v_ca numeric;
  v_tickets bigint;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'restaurant_salle.lire') then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  select coalesce(sum(v.total), 0), count(*) into v_ca, v_tickets from public.ventes v
  where v.etablissement_id = p_etablissement_id and v.origine = 'restaurant' and v.statut <> 'annulee'
    and public.date_locale(p_etablissement_id, v.cree_le) = jour and public.lecture_hub(v.etablissement_id, v.hub_id);
  select jsonb_build_object(
    'tables', (select count(*) from public.rest_tables t where t.etablissement_id = p_etablissement_id and t.actif and public.lecture_hub(t.etablissement_id, t.hub_id)),
    'tables_occupees', (select count(*) from public.rest_commandes c where c.etablissement_id = p_etablissement_id and c.statut = 'ouverte' and c.table_id is not null and public.lecture_hub(c.etablissement_id, c.hub_id)),
    'commandes_ouvertes', (select count(*) from public.rest_commandes c where c.etablissement_id = p_etablissement_id and c.statut = 'ouverte' and public.lecture_hub(c.etablissement_id, c.hub_id)),
    'en_cuisine', (select count(*) from public.rest_lignes l join public.rest_commandes c on c.id = l.commande_id
      where l.etablissement_id = p_etablissement_id and l.statut in ('envoyee', 'en_preparation') and public.lecture_hub(c.etablissement_id, c.hub_id)),
    'postes', jsonb_build_object(
      'cuisine', (select count(*) from public.rest_lignes l join public.rest_commandes c on c.id = l.commande_id
        where l.etablissement_id = p_etablissement_id and l.poste = 'cuisine' and l.statut in ('envoyee', 'en_preparation') and public.lecture_hub(c.etablissement_id, c.hub_id)),
      'bar', (select count(*) from public.rest_lignes l join public.rest_commandes c on c.id = l.commande_id
        where l.etablissement_id = p_etablissement_id and l.poste = 'bar' and l.statut in ('envoyee', 'en_preparation') and public.lecture_hub(c.etablissement_id, c.hub_id))),
    'prets', (select count(*) from public.rest_lignes l join public.rest_commandes c on c.id = l.commande_id
      where l.etablissement_id = p_etablissement_id and l.statut = 'prete' and public.lecture_hub(c.etablissement_id, c.hub_id)),
    'couverts_jour', (select coalesce(sum(c.couverts), 0) from public.rest_commandes c where c.etablissement_id = p_etablissement_id
      and c.statut <> 'annulee' and public.date_locale(p_etablissement_id, c.ouverte_le) = jour and public.lecture_hub(c.etablissement_id, c.hub_id)),
    'chiffre_jour', v_ca,
    'tickets_jour', v_tickets,
    'ticket_moyen', case when v_tickets > 0 then round(v_ca / v_tickets) else 0 end,
    'encaisse_jour', (select coalesce(sum(p.montant), 0) from public.paiements p join public.ventes v on v.id = p.vente_id
      where v.etablissement_id = p_etablissement_id and v.origine = 'restaurant' and p.statut = 'valide'
        and public.date_locale(p_etablissement_id, p.cree_le) = jour and public.lecture_hub(v.etablissement_id, v.hub_id)),
    'serveurs_actifs', (select count(distinct s) from (
        select a.serveur_id s from public.rest_affectations a where a.etablissement_id = p_etablissement_id and a.fin is null and public.lecture_hub(a.etablissement_id, a.hub_id)
        union select c.serveur_id from public.rest_commandes c where c.etablissement_id = p_etablissement_id and c.statut = 'ouverte' and public.lecture_hub(c.etablissement_id, c.hub_id)) x),
    'tables_affectees', (select count(*) from public.rest_affectations a where a.etablissement_id = p_etablissement_id and a.fin is null and public.lecture_hub(a.etablissement_id, a.hub_id)),
    'annulations_jour', (select count(*) from public.rest_lignes l where l.etablissement_id = p_etablissement_id and l.statut = 'annulee'
      and l.envoyee_le is not null and public.date_locale(p_etablissement_id, l.annulee_le) = jour),
    'top_plats', coalesce((select jsonb_agg(x order by x.quantite desc) from (
      select l.libelle, sum(l.quantite) as quantite from public.rest_lignes l
      where l.etablissement_id = p_etablissement_id and l.statut <> 'annulee' and l.cree_le > now() - interval '30 days'
      group by l.libelle order by 2 desc limit 5) x), '[]'::jsonb)
  ) into resultat;
  return resultat;
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Import de catalogue (remplace la version du 2026-10-03, jamais appliquée en production)
-- ---------------------------------------------------------------------------
-- Ligne : { reference, nom, prix_vente|prix, categorie?, description?, variante?, actif?, ordre_affichage?,
--           poste_preparation?, suivi_stock?, motif_attente? }
-- Correspondance : 1) même référence ; 2) sinon même désignation + même variante + même catégorie
-- (sans tenir compte de la casse, des accents ni des espaces) et sans autre référence → article réutilisé.
-- Une ligne sans prix ou déclarée inactive n'est jamais créée (« à confirmer ») : aucun prix n'est inventé.
-- Le stock n'est jamais créé ; un article réutilisé garde son suivi de stock sauf colonne suivi_stock explicite.
create or replace function public.importer_catalogue(
  p_etablissement_id uuid,
  p_lignes jsonb,
  p_simulation boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ligne jsonb;
  numero integer := 0;
  v_categorie uuid;
  v_cat_nom text;
  v_existant public.articles%rowtype;
  v_nom text;
  v_reference text;
  v_variante text;
  v_description text;
  v_poste text;
  v_suivi text;
  v_prix numeric;
  v_actif boolean;
  v_action text;
  v_crees integer := 0;
  v_modifies integer := 0;
  v_inchanges integer := 0;
  v_reutilises integer := 0;
  v_attente integer := 0;
  v_variantes integer := 0;
  v_categories_creees text[] := '{}';
  v_categories_reutilisees text[] := '{}';
  v_details jsonb := '[]'::jsonb;
  v_avertissements jsonb := '[]'::jsonb;
  v_doublon text;
  v_cle text;
  v_cles text[] := '{}';
begin
  perform public.exiger_permission(p_etablissement_id, 'articles.gerer');
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Le catalogue ne contient aucune ligne';
  end if;
  if jsonb_array_length(p_lignes) > 5000 then
    raise exception 'Import limité à 5 000 lignes à la fois';
  end if;
  select r into v_doublon from (
    select btrim(x ->> 'reference') r from jsonb_array_elements(p_lignes) x where nullif(btrim(x ->> 'reference'), '') is not null
  ) s group by r having count(*) > 1 limit 1;
  if v_doublon is not null then
    raise exception 'Référence « % » présente plusieurs fois dans le fichier', v_doublon;
  end if;

  for ligne in select value from jsonb_array_elements(p_lignes) loop
    numero := numero + 1;
    begin
      if jsonb_typeof(ligne) <> 'object' then raise exception 'ligne invalide'; end if;
      v_nom := btrim(coalesce(ligne ->> 'nom', ''));
      v_reference := nullif(btrim(ligne ->> 'reference'), '');
      v_variante := nullif(btrim(ligne ->> 'variante'), '');
      v_description := nullif(btrim(ligne ->> 'description'), '');
      v_cat_nom := nullif(btrim(ligne ->> 'categorie'), '');
      v_poste := nullif(btrim(ligne ->> 'poste_preparation'), '');
      v_suivi := lower(nullif(btrim(ligne ->> 'suivi_stock'), ''));
      v_actif := lower(coalesce(nullif(btrim(ligne ->> 'actif'), ''), 'oui')) in ('oui', 'true', '1', 'actif');
      if v_nom = '' then raise exception 'nom manquant'; end if;
      if length(v_nom) > 120 then raise exception 'nom trop long (120 caractères)'; end if;
      if v_reference is null then raise exception 'référence stable manquante'; end if;
      if v_variante is not null and length(v_variante) > 80 then raise exception 'variante trop longue (80 caractères)'; end if;
      if v_cat_nom is not null and length(v_cat_nom) > 80 then raise exception 'catégorie trop longue (80 caractères)'; end if;
      if v_poste is not null and v_poste not in ('aucun', 'cuisine', 'bar') then raise exception 'poste inconnu : %', v_poste; end if;
      if v_suivi is not null and v_suivi not in ('oui', 'non', 'true', 'false', '1', '0') then raise exception 'suivi_stock doit valoir oui ou non'; end if;

      if nullif(btrim(coalesce(ligne ->> 'prix', ligne ->> 'prix_vente')), '') is null or not v_actif then
        v_attente := v_attente + 1;
        v_details := v_details || jsonb_build_array(jsonb_build_object(
          'ligne', numero, 'reference', v_reference, 'nom', v_nom, 'action', 'attente',
          'motif', coalesce(nullif(btrim(ligne ->> 'motif_attente'), ''),
            case when nullif(btrim(coalesce(ligne ->> 'prix', ligne ->> 'prix_vente')), '') is null then 'Prix absent' else 'Article déclaré inactif' end)));
        continue;
      end if;
      v_prix := btrim(coalesce(ligne ->> 'prix', ligne ->> 'prix_vente'))::numeric;
      if v_prix < 0 or v_prix = 'NaN'::numeric then raise exception 'prix invalide'; end if;

      -- Deux lignes identiques (désignation + variante + catégorie) dans le fichier : signalé, pas fusionné.
      v_cle := lower(public.unaccent_simple(v_nom)) || '|' || coalesce(lower(v_variante), '') || '|' || coalesce(lower(public.unaccent_simple(v_cat_nom)), '');
      if v_cle = any(v_cles) then
        v_avertissements := v_avertissements || jsonb_build_array(jsonb_build_object('ligne', numero, 'reference', v_reference,
          'message', format('« %s » apparaît deux fois avec la même variante et la même catégorie', v_nom)));
      end if;
      v_cles := v_cles || v_cle;

      v_existant := null;
      select * into v_existant from public.articles
      where etablissement_id = p_etablissement_id and reference = v_reference;
      v_action := null;
      if v_existant.id is null then
        select a.* into v_existant from public.articles a
        left join public.categories_articles c on c.id = a.categorie_id
        where a.etablissement_id = p_etablissement_id and a.reference is null
          and lower(public.unaccent_simple(btrim(a.nom))) = lower(public.unaccent_simple(v_nom))
          and coalesce(lower(btrim(a.variante)), '') = coalesce(lower(v_variante), '')
          and coalesce(lower(public.unaccent_simple(c.nom)), '') = coalesce(lower(public.unaccent_simple(v_cat_nom)), '')
        order by a.actif desc, a.cree_le limit 1;
        if v_existant.id is not null then
          v_action := 'reutiliser';
          v_reutilises := v_reutilises + 1;
        end if;
      end if;

      if v_cat_nom is not null then
        select id into v_categorie from public.categories_articles
        where etablissement_id = p_etablissement_id and lower(nom) = lower(v_cat_nom);
        if v_categorie is null then
          if not lower(v_cat_nom) = any(v_categories_creees) then v_categories_creees := v_categories_creees || lower(v_cat_nom); end if;
        elsif not lower(v_cat_nom) = any(v_categories_reutilisees) and not lower(v_cat_nom) = any(v_categories_creees) then
          v_categories_reutilisees := v_categories_reutilisees || lower(v_cat_nom);
        end if;
      else
        v_categorie := null;
      end if;

      if v_action is null then
        if v_existant.id is null then
          v_action := 'creer';
          v_crees := v_crees + 1;
        elsif v_existant.nom = v_nom and v_existant.prix_vente = v_prix and v_existant.actif
          and v_existant.description is not distinct from v_description
          and v_existant.variante is not distinct from v_variante
          and (v_cat_nom is null or (v_categorie is not null and v_existant.categorie_id = v_categorie))
          and (v_poste is null or v_existant.poste_preparation = v_poste) then
          v_action := 'inchange';
          v_inchanges := v_inchanges + 1;
        else
          v_action := 'modifier';
          v_modifies := v_modifies + 1;
        end if;
      end if;
      if v_variante is not null then v_variantes := v_variantes + 1; end if;
      if v_action <> 'inchange' then
        v_details := v_details || jsonb_build_array(jsonb_build_object('ligne', numero, 'reference', v_reference, 'nom', v_nom,
          'action', v_action, 'prix', v_prix, 'ancien_prix', v_existant.prix_vente));
      end if;

      if not p_simulation then
        if v_cat_nom is not null and v_categorie is null then
          insert into public.categories_articles(etablissement_id, nom, ordre)
          values (p_etablissement_id, v_cat_nom,
            coalesce((select max(ordre) + 10 from public.categories_articles where etablissement_id = p_etablissement_id), 10))
          returning id into v_categorie;
        elsif v_categorie is not null then
          update public.categories_articles set actif = true, archivee_le = null where id = v_categorie and not actif;
        end if;
        if v_existant.id is null then
          insert into public.articles(etablissement_id, reference, nom, description, categorie_id, prix_vente,
            unite, suivi_stock, stock_minimum, actif, poste_preparation, variante, ordre_affichage, disponible, epuise)
          values (p_etablissement_id, v_reference, v_nom, v_description, v_categorie, v_prix,
            'unité', coalesce(v_suivi in ('oui', 'true', '1'), false), 0, true, coalesce(v_poste, 'aucun'),
            v_variante, coalesce(nullif(ligne ->> 'ordre_affichage', '')::integer, numero), true, false);
        elsif v_action <> 'inchange' then
          update public.articles set reference = v_reference, nom = v_nom, description = v_description,
            categorie_id = coalesce(v_categorie, categorie_id), prix_vente = v_prix, actif = true,
            suivi_stock = case when v_suivi is null then suivi_stock else v_suivi in ('oui', 'true', '1') end,
            poste_preparation = coalesce(v_poste, poste_preparation),
            variante = v_variante,
            ordre_affichage = coalesce(nullif(ligne ->> 'ordre_affichage', '')::integer, ordre_affichage)
          where id = v_existant.id;
        end if;
      end if;
    exception when others then
      raise exception 'Ligne % : %', numero, sqlerrm;
    end;
  end loop;

  if not p_simulation then
    insert into public.evenements (etablissement_id, client_id, type, acteur, donnees)
    select e.id, e.client_id, 'articles.import_catalogue', auth.uid(), jsonb_build_object(
      'lignes', numero, 'crees', v_crees, 'modifies', v_modifies, 'reutilises', v_reutilises, 'inchanges', v_inchanges,
      'attente', v_attente, 'categories_creees', cardinality(v_categories_creees))
    from public.etablissements e where e.id = p_etablissement_id;
  end if;

  return jsonb_build_object('simulation', p_simulation,
    'etablissement', (select jsonb_build_object('id', e.id, 'nom', e.nom, 'client', cl.nom)
                      from public.etablissements e join public.clients cl on cl.id = e.client_id where e.id = p_etablissement_id),
    'lignes', numero, 'crees', v_crees, 'modifies', v_modifies, 'reutilises', v_reutilises,
    'inchanges', v_inchanges, 'attente', v_attente,
    'categories_creees', cardinality(v_categories_creees), 'categories_reutilisees', cardinality(v_categories_reutilisees),
    'categories_a_creer', to_jsonb(v_categories_creees),
    'variantes', v_variantes, 'avertissements', v_avertissements, 'details', v_details);
end
$$;

-- Comparaison sans accents (é → e…) pour le dédoublonnage, sans dépendre d'une extension.
create function public.unaccent_simple(p_texte text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(coalesce(p_texte, ''),
    'àâäáãåçéèêëíìîïñóòôöõúùûüýÿÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝœŒæÆ',
    'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUYoOaA')
$$;

-- ---------------------------------------------------------------------------
-- 7. Droits d'exécution et rechargement du cache PostgREST
-- ---------------------------------------------------------------------------
do $$
declare signature text;
begin
  foreach signature in array array[
    'public.enregistrer_categorie(uuid, text)',
    'public.enregistrer_categorie_article(uuid, jsonb)',
    'public.archiver_categorie_article(uuid, uuid, boolean)',
    'public.restaurer_categorie_article(uuid)',
    'public.ordonner_categories_articles(uuid, uuid[])',
    'public.deplacer_articles_categorie(uuid, uuid[], uuid)',
    'public.definir_disponibilite_article(uuid, boolean, boolean)',
    'public.serveurs_restaurant(uuid)',
    'public.affecter_serveur_table(uuid, uuid, text)',
    'public.retirer_serveur_table(uuid, text)',
    'public.transferer_serveur_commande(uuid, uuid, text)',
    'public.ouvrir_commande_restaurant(uuid, jsonb)',
    'public.ajouter_lignes_restaurant(uuid, jsonb)',
    'public.statistiques_serveurs_restaurant(uuid, date, date)',
    'public.tableau_de_bord_restaurant(uuid)',
    'public.importer_catalogue(uuid, jsonb, boolean)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
  foreach signature in array array[
    'public.membre_peut_servir(uuid, uuid, uuid)', 'public.nom_membre_restaurant(uuid)', 'public.unaccent_simple(text)',
    'public.proteger_affectation_restaurant()', 'public.terminer_affectation_table()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', signature);
  end loop;
end
$$;

-- L'API (PostgREST) relit le schéma : les nouvelles fonctions sont appelables sans attendre.
notify pgrst, 'reload schema';
