-- Plateforme modulaire et personnalisable (complément de mission du 2026-10-02, 14:20).
-- 1. Identité affichée (white-label contrôlé) : plateforme → client → établissement, par héritage.
--    L'identité technique (ids, modules, solution) ne change jamais.
-- 2. Profils utilisateurs complets (profil ≠ authentification ≠ rôle ≠ permissions ≠ périmètre).
-- 3. Catalogue : catégories, icônes, documentation, capacités Hub, paramètres déclarés,
--    statuts Disponible / Bêta / En développement / Prévu / Indisponible, nouvelles solutions et
--    modules PRÉVUS (déclarés au catalogue, sans écran ni permission : aucun faux module).
-- 4. Applications d'un établissement : disponible ≠ inclus ≠ accordé ≠ activé ≠ autorisé.
-- Non destructive : aucune donnée supprimée, aucune migration antérieure modifiée.

-- ---------------------------------------------------------------------------
-- 1. Identité affichée
-- ---------------------------------------------------------------------------

-- Palette contrôlée : uniquement des couleurs lisibles avec du texte blanc (contraste ≥ 4,5).
create function public.couleurs_marque()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['#2563eb', '#1d4ed8', '#4338ca', '#7c3aed', '#a21caf', '#be123c', '#b91c1c', '#c2410c',
               '#b45309', '#4d7c0f', '#15803d', '#0f766e', '#0e7490', '#334155', '#18202f']
$$;

create function public.texte_court(p text, p_max integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is null or (length(btrim(p)) between 1 and p_max and p !~ '[<>]')
$$;

create table public.plateforme_identite (
  id boolean primary key default true check (id),
  nom_logiciel text not null default 'Agence Elite' check (public.texte_court(nom_logiciel, 40)),
  nom_court text not null default 'AE' check (public.texte_court(nom_court, 4)),
  sous_titre text default 'Logiciels de gestion' check (public.texte_court(sous_titre, 60)),
  logo_url text check (public.image_acceptable(logo_url)),
  favicon_url text check (public.image_acceptable(favicon_url)),
  couleur_accent text not null default '#2563eb' check (couleur_accent = any (public.couleurs_marque())),
  modifie_le timestamptz not null default now()
);
insert into public.plateforme_identite (id) values (true) on conflict do nothing;
create trigger plateforme_identite_modifie_le before update on public.plateforme_identite
for each row execute function public.fixer_modifie_le();
create trigger plateforme_identite_sans_suppression before delete on public.plateforme_identite
for each row execute function public.refuser_suppression();
alter table public.plateforme_identite enable row level security;
create policy plateforme_identite_lecture on public.plateforme_identite for select to authenticated using (true);

create table public.client_identite (
  client_id uuid primary key references public.clients(id) on delete restrict,
  nom_logiciel text check (public.texte_court(nom_logiciel, 40)),
  nom_court text check (public.texte_court(nom_court, 4)),
  sous_titre text check (public.texte_court(sous_titre, 60)),
  logo_url text check (public.image_acceptable(logo_url)),
  favicon_url text check (public.image_acceptable(favicon_url)),
  couleur_accent text check (couleur_accent is null or couleur_accent = any (public.couleurs_marque())),
  -- Informations d'entreprise reprises sur les documents quand l'établissement n'en a pas.
  nom_commercial text check (public.texte_court(nom_commercial, 80)),
  adresse text, telephone text, email text, rccm text, niu text,
  mentions_documents text check (mentions_documents is null or length(mentions_documents) <= 300),
  pied_documents text check (pied_documents is null or length(pied_documents) <= 300),
  -- Écran de connexion à l'image du client : #/connexion/<adresse>.
  adresse_connexion text unique check (adresse_connexion is null or adresse_connexion ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  -- Agence Elite décide si le client peut régler lui-même l'apparence de ses établissements.
  personnalisation_client boolean not null default false,
  modifie_le timestamptz not null default now()
);
create trigger client_identite_modifie_le before update on public.client_identite
for each row execute function public.fixer_modifie_le();
create trigger client_identite_sans_suppression before delete on public.client_identite
for each row execute function public.refuser_suppression();
create trigger client_identite_audit after insert or update or delete on public.client_identite
for each row execute function public.journaliser_modification();
alter table public.client_identite enable row level security;
create policy client_identite_lecture on public.client_identite for select to authenticated
  using (public.est_editeur() or public.est_dirigeant(client_id)
         or exists (select 1 from public.etablissements e where e.client_id = client_identite.client_id and public.est_membre(e.id)));

-- Surcharge par établissement (seulement si nécessaire). Le Hub n'a pas d'identité visuelle.
alter table public.etablissement_identite
  add column nom_logiciel text check (public.texte_court(nom_logiciel, 40)),
  add column nom_court text check (public.texte_court(nom_court, 4)),
  add column sous_titre text check (public.texte_court(sous_titre, 60)),
  add column favicon_url text check (public.image_acceptable(favicon_url)),
  add column couleur_accent text check (couleur_accent is null or couleur_accent = any (public.couleurs_marque())),
  add column pied_documents text check (pied_documents is null or length(pied_documents) <= 300);

-- Identité effective d'un établissement : établissement, sinon client, sinon plateforme.
create function public.identite_effective(p_etablissement_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'nom_logiciel', coalesce(i.nom_logiciel, ci.nom_logiciel, p.nom_logiciel),
    'nom_court', coalesce(i.nom_court, ci.nom_court, p.nom_court),
    'sous_titre', coalesce(i.sous_titre, ci.sous_titre,
                           case when ci.nom_logiciel is null and i.nom_logiciel is null then 'Solution ' || s.nom end, p.sous_titre),
    'logo_url', coalesce(i.logo_url, ci.logo_url, p.logo_url),
    'favicon_url', coalesce(i.favicon_url, ci.favicon_url, p.favicon_url),
    'couleur_accent', coalesce(i.couleur_accent, ci.couleur_accent, p.couleur_accent),
    'personnalisee', coalesce(i.nom_logiciel, ci.nom_logiciel, i.couleur_accent, ci.couleur_accent, ci.logo_url) is not null,
    'personnalisation_client', coalesce(ci.personnalisation_client, false),
    'documents', jsonb_build_object(
      'nom_commercial', coalesce(i.nom_commercial, ci.nom_commercial, e.nom),
      'adresse', coalesce(i.adresse, ci.adresse),
      'telephone', coalesce(i.telephone, ci.telephone),
      'email', coalesce(i.email, ci.email),
      'rccm', coalesce(i.rccm, ci.rccm),
      'niu', coalesce(i.niu, ci.niu),
      'logo_url', coalesce(i.logo_url, ci.logo_url),
      'mentions', coalesce(i.mentions_recu, ci.mentions_documents),
      'pied', coalesce(i.pied_documents, ci.pied_documents)
    )
  )
  from public.etablissements e
  join public.solutions s on s.id = e.solution_id
  cross join public.plateforme_identite p
  left join public.client_identite ci on ci.client_id = e.client_id
  left join public.etablissement_identite i on i.etablissement_id = e.id
  where e.id = p_etablissement_id
$$;
revoke execute on function public.identite_effective(uuid) from public, anon, authenticated;

-- Écran de connexion personnalisé : seulement le nom, le logo et la couleur (rien d'autre n'est public).
create function public.marque_connexion(p_adresse text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'nom_logiciel', coalesce(ci.nom_logiciel, p.nom_logiciel),
    'nom_court', coalesce(ci.nom_court, p.nom_court),
    'sous_titre', coalesce(ci.sous_titre, p.sous_titre),
    'logo_url', coalesce(ci.logo_url, p.logo_url),
    'favicon_url', coalesce(ci.favicon_url, p.favicon_url),
    'couleur_accent', coalesce(ci.couleur_accent, p.couleur_accent)
  )
  from public.plateforme_identite p
  left join public.client_identite ci
    on ci.adresse_connexion = lower(btrim(p_adresse))
   and exists (select 1 from public.clients c where c.id = ci.client_id and c.statut = 'actif')
$$;
revoke execute on function public.marque_connexion(text) from public;
grant execute on function public.marque_connexion(text) to anon, authenticated;

create function public.identite_nettoyee(p jsonb, p_cle text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(p ->> p_cle), '')
$$;

create function public.enregistrer_identite_plateforme(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exiger_super_admin();
  update public.plateforme_identite set
    nom_logiciel = coalesce(public.identite_nettoyee(p, 'nom_logiciel'), 'Agence Elite'),
    nom_court = coalesce(public.identite_nettoyee(p, 'nom_court'), 'AE'),
    sous_titre = public.identite_nettoyee(p, 'sous_titre'),
    logo_url = public.identite_nettoyee(p, 'logo_url'),
    favicon_url = public.identite_nettoyee(p, 'favicon_url'),
    couleur_accent = coalesce(public.identite_nettoyee(p, 'couleur_accent'), '#2563eb')
  where id;
end
$$;

-- Identité d'un client (Agence Elite uniquement). Une valeur vide = retour à la valeur héritée.
create function public.enregistrer_identite_client(p_client_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exiger_editeur();
  if not exists (select 1 from public.clients where id = p_client_id) then
    raise exception 'Client introuvable';
  end if;
  insert into public.client_identite as ci (
    client_id, nom_logiciel, nom_court, sous_titre, logo_url, favicon_url, couleur_accent, nom_commercial, adresse,
    telephone, email, rccm, niu, mentions_documents, pied_documents, adresse_connexion, personnalisation_client
  ) values (
    p_client_id, public.identite_nettoyee(p, 'nom_logiciel'), public.identite_nettoyee(p, 'nom_court'),
    public.identite_nettoyee(p, 'sous_titre'), public.identite_nettoyee(p, 'logo_url'), public.identite_nettoyee(p, 'favicon_url'),
    public.identite_nettoyee(p, 'couleur_accent'), public.identite_nettoyee(p, 'nom_commercial'), public.identite_nettoyee(p, 'adresse'),
    public.identite_nettoyee(p, 'telephone'), public.identite_nettoyee(p, 'email'), public.identite_nettoyee(p, 'rccm'),
    public.identite_nettoyee(p, 'niu'), public.identite_nettoyee(p, 'mentions_documents'), public.identite_nettoyee(p, 'pied_documents'),
    lower(public.identite_nettoyee(p, 'adresse_connexion')), coalesce((p ->> 'personnalisation_client')::boolean, false)
  )
  on conflict (client_id) do update set
    nom_logiciel = excluded.nom_logiciel, nom_court = excluded.nom_court, sous_titre = excluded.sous_titre,
    logo_url = excluded.logo_url, favicon_url = excluded.favicon_url, couleur_accent = excluded.couleur_accent,
    nom_commercial = excluded.nom_commercial, adresse = excluded.adresse, telephone = excluded.telephone,
    email = excluded.email, rccm = excluded.rccm, niu = excluded.niu, mentions_documents = excluded.mentions_documents,
    pied_documents = excluded.pied_documents, adresse_connexion = excluded.adresse_connexion,
    personnalisation_client = excluded.personnalisation_client;
exception when unique_violation then
  raise exception 'Cette adresse de connexion est déjà utilisée par un autre client';
end
$$;

-- Apparence d'un établissement : Agence Elite, ou le client si Agence Elite l'y autorise.
create function public.enregistrer_apparence_etablissement(p_etablissement_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.est_editeur() then
    perform public.exiger_permission(p_etablissement_id, 'etablissement.modifier');
    if not exists (
      select 1 from public.etablissements e join public.client_identite ci on ci.client_id = e.client_id
      where e.id = p_etablissement_id and ci.personnalisation_client
    ) then
      raise exception 'La personnalisation de l''apparence n''est pas incluse : contactez Agence Elite' using errcode = '42501';
    end if;
  elsif not exists (select 1 from public.etablissements where id = p_etablissement_id) then
    raise exception 'Établissement introuvable';
  end if;
  insert into public.etablissement_identite as i (etablissement_id, nom_logiciel, nom_court, sous_titre, favicon_url, couleur_accent)
  values (p_etablissement_id, public.identite_nettoyee(p, 'nom_logiciel'), public.identite_nettoyee(p, 'nom_court'),
          public.identite_nettoyee(p, 'sous_titre'), public.identite_nettoyee(p, 'favicon_url'), public.identite_nettoyee(p, 'couleur_accent'))
  on conflict (etablissement_id) do update set
    nom_logiciel = excluded.nom_logiciel, nom_court = excluded.nom_court, sous_titre = excluded.sous_titre,
    favicon_url = excluded.favicon_url, couleur_accent = excluded.couleur_accent;
end
$$;

-- Informations de l'établissement sur les documents (reçus…) : ajoute le pied de document.
create or replace function public.enregistrer_identite(p_etablissement_id uuid, p_identite jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exiger_permission(p_etablissement_id, 'etablissement.modifier');
  insert into public.etablissement_identite as i (
    etablissement_id, nom_commercial, logo_url, couleur_principale, adresse, telephone, email, rccm, niu, mentions_recu, pied_documents
  ) values (
    p_etablissement_id,
    nullif(btrim(p_identite ->> 'nom_commercial'), ''),
    nullif(p_identite ->> 'logo_url', ''),
    nullif(p_identite ->> 'couleur_principale', ''),
    nullif(btrim(p_identite ->> 'adresse'), ''),
    nullif(btrim(p_identite ->> 'telephone'), ''),
    nullif(btrim(p_identite ->> 'email'), ''),
    nullif(btrim(p_identite ->> 'rccm'), ''),
    nullif(btrim(p_identite ->> 'niu'), ''),
    nullif(btrim(p_identite ->> 'mentions_recu'), ''),
    nullif(btrim(p_identite ->> 'pied_documents'), '')
  )
  on conflict (etablissement_id) do update set
    nom_commercial = excluded.nom_commercial,
    logo_url = excluded.logo_url,
    couleur_principale = excluded.couleur_principale,
    adresse = excluded.adresse,
    telephone = excluded.telephone,
    email = excluded.email,
    rccm = excluded.rccm,
    niu = excluded.niu,
    mentions_recu = excluded.mentions_recu,
    pied_documents = case when p_identite ? 'pied_documents' then excluded.pied_documents else i.pied_documents end;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Profils utilisateurs
-- ---------------------------------------------------------------------------
alter table public.profils
  add column prenom text check (public.texte_court(prenom, 60)),
  add column nom text check (public.texte_court(nom, 60)),
  add column nom_affiche text check (public.texte_court(nom_affiche, 80)),
  add column initiales text check (initiales is null or initiales ~ '^[A-Z0-9]{1,3}$'),
  add column avatar_url text check (public.image_acceptable(avatar_url)),
  add column fonction text check (public.texte_court(fonction, 80)),
  add column preferences jsonb not null default '{}' check (jsonb_typeof(preferences) = 'object');

-- Le profil ne donne aucun droit : rôle, permissions et périmètre restent ailleurs.
create function public.enregistrer_mon_profil(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prenom text := public.identite_nettoyee(p, 'prenom');
  v_nom text := public.identite_nettoyee(p, 'nom');
  v_affiche text := public.identite_nettoyee(p, 'nom_affiche');
  v_prefs jsonb := coalesce(p -> 'preferences', '{}'::jsonb);
begin
  if auth.uid() is null then
    raise exception 'Une authentification est requise';
  end if;
  if jsonb_typeof(v_prefs) <> 'object' or exists (
    select 1 from jsonb_object_keys(v_prefs) k where k not in ('page_accueil')
  ) then
    raise exception 'Préférence inconnue';
  end if;
  if coalesce(v_affiche, nullif(btrim(concat_ws(' ', v_prenom, v_nom)), '')) is null then
    raise exception 'Indiquez au moins un prénom, un nom ou un nom affiché';
  end if;
  insert into public.profils (id, nom_complet, prenom, nom, nom_affiche, initiales, avatar_url, telephone, fonction, preferences)
  values (
    auth.uid(),
    coalesce(v_affiche, btrim(concat_ws(' ', v_prenom, v_nom))),
    v_prenom, v_nom, v_affiche,
    upper(public.identite_nettoyee(p, 'initiales')),
    public.identite_nettoyee(p, 'avatar_url'),
    public.identite_nettoyee(p, 'telephone'),
    public.identite_nettoyee(p, 'fonction'),
    v_prefs
  )
  on conflict (id) do update set
    nom_complet = excluded.nom_complet, prenom = excluded.prenom, nom = excluded.nom, nom_affiche = excluded.nom_affiche,
    initiales = excluded.initiales, avatar_url = excluded.avatar_url, telephone = excluded.telephone,
    fonction = excluded.fonction, preferences = excluded.preferences;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Catalogue
-- ---------------------------------------------------------------------------
create table public.categories_modules (
  id text primary key check (id ~ '^[a-z][a-z0-9_]*$'),
  nom text not null check (btrim(nom) <> ''),
  description text,
  icone text not null default 'modules',
  ordre integer not null default 0
);
alter table public.categories_modules enable row level security;
create policy categories_modules_lecture on public.categories_modules for select to authenticated using (true);
create trigger categories_modules_sans_suppression before delete on public.categories_modules
for each row execute function public.refuser_suppression();
create trigger categories_modules_audit after insert or update or delete on public.categories_modules
for each row execute function public.journaliser_modification();

insert into public.categories_modules (id, nom, description, icone, ordre) values
  ('socle', 'Socle', 'Établissement, équipe, droits : présents partout.', 'parametres', 0),
  ('reporting', 'Pilotage et rapports', 'Tableaux de bord et indicateurs.', 'tableau', 5),
  ('ventes', 'Ventes et catalogue', 'Produits, prix, ventes.', 'ventes', 10),
  ('pos', 'Caisse et point de vente', 'Caisse, paiements, reçus, clôtures.', 'caisse', 20),
  ('stock', 'Stock et inventaire', 'Mouvements, transferts, inventaires.', 'stock', 30),
  ('achats', 'Achats et fournisseurs', 'Commandes et réceptions fournisseurs.', 'depot', 40),
  ('facturation', 'Facturation', 'Devis, factures, avoirs.', 'cloture', 50),
  ('finances', 'Finances et dépenses', 'Dépenses et suivi financier.', 'depenses', 60),
  ('comptabilite', 'Comptabilité', 'Écritures et états comptables.', 'activite', 65),
  ('crm', 'Relations clients (CRM)', 'Contacts, prospects, opportunités.', 'contacts', 70),
  ('rh', 'Ressources humaines', 'Employés, présences, congés.', 'membres', 80),
  ('restaurant', 'Restaurant', 'Salle, tables, cuisine.', 'panier', 90),
  ('hotel', 'Hôtel', 'Chambres, réservations, séjours.', 'cle', 100),
  ('ecommerce', 'E-commerce', 'Boutique en ligne et commandes.', 'panier', 110),
  ('site_web', 'Site web', 'Pages et blocs du site du client.', 'editeur', 120),
  ('marketing', 'Marketing', 'Campagnes, fidélité, messages.', 'activite', 130),
  ('projets', 'Projets et services', 'Projets, tâches, temps.', 'echeance', 140),
  ('documents', 'Documents', 'Fichiers et modèles de documents.', 'cloture', 150),
  ('support', 'Support', 'Demandes et assistance.', 'oeil', 160)
on conflict (id) do nothing;

update public.modules set categorie = case
  when id in ('etablissement', 'membres') then 'socle'
  when id = 'tableau_de_bord' then 'reporting'
  when id in ('articles', 'ventes') then 'ventes'
  when id in ('caisse', 'paiements', 'recus', 'cloture') then 'pos'
  when id = 'stock' then 'stock'
  when id = 'contacts' then 'crm'
  when id = 'depenses' then 'finances'
  else 'socle' end;
alter table public.modules
  add constraint modules_categorie_fk foreign key (categorie) references public.categories_modules(id) on delete restrict,
  add column icone text not null default 'modules',
  add column documentation text,
  add column capacites_hub text[] not null default '{}'
    check (capacites_hub <@ array['vente', 'stock', 'caisse', 'transfert']),
  add column parametres_schema jsonb not null default '[]' check (jsonb_typeof(parametres_schema) = 'array');
alter table public.modules drop constraint modules_statut_check;
alter table public.modules add constraint modules_statut_check
  check (statut in ('actif', 'beta', 'en_preparation', 'futur', 'retire'));

update public.modules m set icone = v.icone, capacites_hub = v.capacites, documentation = v.doc
from (values
  ('etablissement', 'editeur', '{}'::text[], 'Identité, Hubs, paramètres. docs/ARCHITECTURE.md'),
  ('membres', 'membres', '{}'::text[], 'Équipe, rôles, accès par Hub. docs/SOP/20_CREER_GERER_UTILISATEURS.md'),
  ('tableau_de_bord', 'tableau', '{}'::text[], 'Indicateurs déclarés par chaque module (widgets). docs/SOP/37_AJOUTER_UN_WIDGET.md'),
  ('articles', 'articles', '{}'::text[], 'Catalogue produits, import CSV. docs/COMMERCE.md'),
  ('stock', 'stock', '{stock}'::text[], 'Stock par Hub, transferts, inventaires. docs/SOP/27_TRANSFERT_DE_STOCK.md'),
  ('caisse', 'caisse', '{caisse,vente}'::text[], 'Sessions de caisse par Hub. docs/COMMERCE.md'),
  ('ventes', 'ventes', '{vente}'::text[], 'Ventes, annulations avec motif. docs/COMMERCE.md'),
  ('paiements', 'points', '{vente}'::text[], 'Paiements mixtes, crédits. docs/COMMERCE.md'),
  ('recus', 'imprimer', '{vente}'::text[], 'Ticket 80 mm à l''identité de l''établissement. docs/COMMERCE.md'),
  ('cloture', 'cloture', '{caisse}'::text[], 'Ticket Z non modifiable. docs/SOP/29_CLOTURE_DE_CAISSE.md'),
  ('contacts', 'contacts', '{}'::text[], 'Clients et fournisseurs de l''établissement. docs/COMMERCE.md'),
  ('depenses', 'depenses', '{}'::text[], 'Dépenses par Hub. docs/COMMERCE.md')
) as v(id, icone, capacites, doc)
where m.id = v.id;

-- Paramètres réellement utilisés par le code (la caisse lit stock_negatif).
update public.modules set parametres_schema = '[
  {"cle": "stock_negatif", "libelle": "Autoriser la vente quand le stock est à zéro (le stock devient négatif)", "type": "booleen", "defaut": false}
]'::jsonb where id = 'caisse';

alter table public.solutions
  add column icone text not null default 'modules',
  add column ordre integer not null default 0;
update public.solutions set icone = 'panier', ordre = 1 where id = 'commerce';
update public.solutions set icone = 'panier', ordre = 2 where id = 'restaurant';
update public.solutions set icone = 'cle', ordre = 3 where id = 'hotel';
create trigger solutions_sans_suppression before delete on public.solutions
for each row execute function public.refuser_suppression();
create trigger solutions_audit after insert or update or delete on public.solutions
for each row execute function public.journaliser_modification();

-- Solutions prévues (déclarées, aucune application encore).
insert into public.solutions (id, nom, description, statut, icone, ordre) values
  ('rh', 'Ressources humaines', 'Employés, présences, congés, documents RH. La paie viendra seulement avec des règles sociales et fiscales validées.', 'future', 'membres', 4),
  ('ecommerce', 'E-commerce', 'Boutique en ligne branchée sur le même stock et les mêmes ventes.', 'future', 'panier', 5),
  ('services', 'Services et projets', 'Prestations, projets, tâches, temps passé.', 'future', 'echeance', 6)
on conflict (id) do nothing;
update public.solutions set description = coalesce(description, 'Salle, tables, cuisine, réutilise caisse, stock, paiements et contacts.') where id = 'restaurant';
update public.solutions set description = coalesce(description, 'Chambres, réservations, séjours ; réception, restaurant et boutique en Hubs.') where id = 'hotel';

-- Modules PRÉVUS : déclarés au catalogue pour l'organisation et les dépendances.
-- Aucun écran, aucune permission, aucune table : ils ne peuvent être ni vendus ni activés.
insert into public.modules (id, nom, description, nature, statut, categorie, icone, ordre) values
  ('rh_employes', 'Employés et organisation', 'Fiches employés, départements, postes, contrats, documents.', 'metier', 'futur', 'rh', 'membres', 200),
  ('rh_presences', 'Présences et horaires', 'Pointage, plannings, retards.', 'metier', 'futur', 'rh', 'echeance', 201),
  ('rh_conges', 'Congés et absences', 'Demandes, validations, soldes.', 'metier', 'futur', 'rh', 'echeance', 202),
  ('restaurant_salle', 'Salle et tables', 'Zones, tables, commandes par table.', 'metier', 'futur', 'restaurant', 'panier', 210),
  ('restaurant_cuisine', 'Cuisine', 'Tickets cuisine, suivi des plats.', 'metier', 'futur', 'restaurant', 'imprimer', 211),
  ('hotel_chambres', 'Chambres', 'Types de chambres, chambres, tarifs, entretien.', 'metier', 'futur', 'hotel', 'cle', 220),
  ('hotel_reservations', 'Réservations et séjours', 'Disponibilités, réservations, arrivées, départs.', 'metier', 'futur', 'hotel', 'echeance', 221),
  ('ecommerce_boutique', 'Boutique en ligne', 'Catalogue public, panier, commandes, livraison ; ventes et stock communs.', 'metier', 'futur', 'ecommerce', 'panier', 230),
  ('site_web', 'Site web', 'Pages construites par blocs contrôlés, brouillon et publication.', 'transversal', 'futur', 'site_web', 'editeur', 240),
  ('crm_pipeline', 'Prospects et opportunités', 'Pipeline commercial, activités, relances.', 'transversal', 'futur', 'crm', 'contacts', 250),
  ('achats', 'Achats et fournisseurs', 'Commandes fournisseurs, réceptions qui alimentent le stock.', 'metier', 'futur', 'achats', 'depot', 260),
  ('facturation', 'Devis et factures', 'Devis, factures, avoirs à partir des ventes.', 'transversal', 'futur', 'facturation', 'cloture', 270),
  ('projets', 'Projets et tâches', 'Projets, tâches, échéances, temps passé.', 'metier', 'futur', 'projets', 'echeance', 280)
on conflict (id) do nothing;

insert into public.module_dependances (module_id, depend_de) values
  ('rh_employes', 'membres'), ('rh_presences', 'rh_employes'), ('rh_conges', 'rh_employes'),
  ('restaurant_salle', 'caisse'), ('restaurant_salle', 'articles'), ('restaurant_cuisine', 'restaurant_salle'),
  ('hotel_chambres', 'etablissement'), ('hotel_reservations', 'hotel_chambres'), ('hotel_reservations', 'contacts'),
  ('hotel_reservations', 'paiements'),
  ('ecommerce_boutique', 'articles'), ('ecommerce_boutique', 'stock'), ('ecommerce_boutique', 'ventes'),
  ('ecommerce_boutique', 'paiements'), ('ecommerce_boutique', 'contacts'),
  ('site_web', 'etablissement'), ('crm_pipeline', 'contacts'),
  ('achats', 'articles'), ('achats', 'stock'), ('achats', 'contacts'),
  ('facturation', 'ventes'), ('facturation', 'contacts'), ('projets', 'membres')
on conflict do nothing;

-- Quels modules chaque solution peut proposer (les briques communes sont réutilisées, jamais dupliquées).
insert into public.solution_modules (solution_id, module_id, par_defaut)
select s, m, false from (values
  ('commerce', 'achats'), ('commerce', 'facturation'), ('commerce', 'crm_pipeline'), ('commerce', 'ecommerce_boutique'),
  ('commerce', 'site_web'), ('commerce', 'rh_employes'), ('commerce', 'rh_presences'), ('commerce', 'rh_conges'),
  ('restaurant', 'articles'), ('restaurant', 'stock'), ('restaurant', 'caisse'), ('restaurant', 'ventes'),
  ('restaurant', 'paiements'), ('restaurant', 'recus'), ('restaurant', 'cloture'), ('restaurant', 'contacts'),
  ('restaurant', 'depenses'), ('restaurant', 'restaurant_salle'), ('restaurant', 'restaurant_cuisine'),
  ('restaurant', 'achats'), ('restaurant', 'site_web'), ('restaurant', 'rh_employes'),
  ('hotel', 'articles'), ('hotel', 'stock'), ('hotel', 'caisse'), ('hotel', 'ventes'), ('hotel', 'paiements'),
  ('hotel', 'recus'), ('hotel', 'cloture'), ('hotel', 'contacts'), ('hotel', 'depenses'),
  ('hotel', 'hotel_chambres'), ('hotel', 'hotel_reservations'), ('hotel', 'site_web'), ('hotel', 'rh_employes'),
  ('rh', 'etablissement'), ('rh', 'membres'), ('rh', 'tableau_de_bord'),
  ('rh', 'rh_employes'), ('rh', 'rh_presences'), ('rh', 'rh_conges'),
  ('ecommerce', 'etablissement'), ('ecommerce', 'membres'), ('ecommerce', 'tableau_de_bord'),
  ('ecommerce', 'articles'), ('ecommerce', 'stock'), ('ecommerce', 'ventes'), ('ecommerce', 'paiements'),
  ('ecommerce', 'contacts'), ('ecommerce', 'ecommerce_boutique'), ('ecommerce', 'site_web'),
  ('services', 'etablissement'), ('services', 'membres'), ('services', 'tableau_de_bord'),
  ('services', 'contacts'), ('services', 'crm_pipeline'), ('services', 'facturation'), ('services', 'projets')
) as v(s, m)
on conflict (solution_id, module_id) do nothing;
update public.solution_modules set par_defaut = true
where solution_id in ('rh', 'ecommerce', 'services') and module_id in ('etablissement', 'membres', 'tableau_de_bord');

-- Défense en profondeur : un module qui n'est pas disponible (ou en bêta) ne s'active jamais,
-- même si une ancienne offre le mentionnait.
create function public.verifier_module_disponible()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.actif and exists (select 1 from public.modules where id = new.module_id and statut not in ('actif', 'beta')) then
    raise exception 'Le module % n''est pas disponible : il ne peut pas être activé', new.module_id;
  end if;
  return new;
end
$$;
create trigger etablissement_modules_disponible
before insert or update of actif on public.etablissement_modules
for each row execute function public.verifier_module_disponible();

-- Une dépendance ne doit jamais former de boucle.
create function public.verifier_dependance_module()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    with recursive chaine(id) as (
      select new.depend_de
      union
      select d.depend_de from public.module_dependances d join chaine c on d.module_id = c.id
    )
    select 1 from chaine where id = new.module_id
  ) then
    raise exception 'Dépendance circulaire : % dépend déjà de %', new.depend_de, new.module_id;
  end if;
  return new;
end
$$;
create trigger module_dependances_sans_boucle before insert or update on public.module_dependances
for each row execute function public.verifier_dependance_module();

-- Seul un module Disponible ou Bêta peut entrer dans une offre ou être accordé.
create or replace function public.verifier_modules_offre(p_solution_id text, p_modules text[])
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  manquant text;
begin
  select m into manquant from unnest(p_modules) m
  where not exists (select 1 from public.solution_modules sm where sm.solution_id = p_solution_id and sm.module_id = m)
  limit 1;
  if manquant is not null then
    raise exception 'Le module % n''est pas proposé par cette solution', manquant;
  end if;
  select m.id into manquant from public.modules m
  where m.id = any (p_modules) and m.statut not in ('actif', 'beta')
  limit 1;
  if manquant is not null then
    raise exception 'Le module % n''est pas encore disponible', manquant;
  end if;
  select d.depend_de into manquant
  from unnest(p_modules) m
  join public.module_dependances d on d.module_id = m
  join public.modules dm on dm.id = d.depend_de
  where dm.nature <> 'socle' and not d.depend_de = any (p_modules)
  limit 1;
  if manquant is not null then
    raise exception 'Il manque le module % dont dépend un module choisi', manquant;
  end if;
end
$$;
revoke execute on function public.verifier_modules_offre(text, text[]) from public, anon, authenticated;

-- Fiche d'un module (super administrateur). « Disponible » ou « Bêta » exige un module
-- réellement programmé : au moins une permission déclarée par une migration.
create or replace function public.enregistrer_module(p_module_id text, p_module jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_statut text;
  v_categorie text := nullif(btrim(p_module ->> 'categorie'), '');
  v_nature text;
begin
  perform public.exiger_super_admin();
  select nature, coalesce(nullif(p_module ->> 'statut', ''), statut) into v_nature, v_statut
  from public.modules where id = p_module_id;
  if v_nature is null then
    raise exception 'Module inconnu : un module se crée dans le code (voir docs/SOP/02_CREER_UN_MODULE.md)';
  end if;
  if v_statut not in ('actif', 'beta', 'en_preparation', 'futur', 'retire') then
    raise exception 'Statut de module inconnu : %', v_statut;
  end if;
  if v_statut in ('actif', 'beta') and v_nature <> 'socle'
     and not exists (select 1 from public.permissions where module_id = p_module_id) then
    raise exception 'Ce module n''est pas encore programmé : il ne peut pas être déclaré disponible';
  end if;
  if v_statut in ('retire', 'futur', 'en_preparation')
     and exists (select 1 from public.etablissement_modules where module_id = p_module_id and actif) then
    raise exception 'Ce module est encore actif dans un établissement';
  end if;
  if coalesce(btrim(p_module ->> 'nom'), '') = '' then
    raise exception 'Le nom du module est obligatoire';
  end if;
  if v_categorie is not null and not exists (select 1 from public.categories_modules where id = v_categorie) then
    raise exception 'Catégorie inconnue';
  end if;
  update public.modules set
    nom = btrim(p_module ->> 'nom'),
    description = nullif(btrim(p_module ->> 'description'), ''),
    categorie = coalesce(v_categorie, categorie),
    version = coalesce(nullif(btrim(p_module ->> 'version'), ''), version),
    ordre = coalesce((p_module ->> 'ordre')::integer, ordre),
    icone = coalesce(nullif(btrim(p_module ->> 'icone'), ''), icone),
    documentation = case when p_module ? 'documentation' then nullif(btrim(p_module ->> 'documentation'), '') else documentation end,
    statut = v_statut
  where id = p_module_id;
end
$$;

create function public.enregistrer_categorie_module(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text := nullif(btrim(p ->> 'id'), '');
begin
  perform public.exiger_super_admin();
  if v_id is null or v_id !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'Identifiant de catégorie invalide (minuscules, chiffres, _)';
  end if;
  if coalesce(btrim(p ->> 'nom'), '') = '' then
    raise exception 'Le nom de la catégorie est obligatoire';
  end if;
  insert into public.categories_modules (id, nom, description, icone, ordre)
  values (v_id, btrim(p ->> 'nom'), nullif(btrim(p ->> 'description'), ''), coalesce(nullif(btrim(p ->> 'icone'), ''), 'modules'),
          coalesce((p ->> 'ordre')::integer, 999))
  on conflict (id) do update set nom = excluded.nom, description = excluded.description, icone = excluded.icone, ordre = excluded.ordre;
end
$$;

-- Une solution est une configuration : la créer ou la décrire ne crée aucun code.
create function public.enregistrer_solution(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text := nullif(btrim(p ->> 'id'), '');
  v_statut text := coalesce(nullif(p ->> 'statut', ''), 'future');
begin
  perform public.exiger_super_admin();
  if v_id is null or v_id !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'Identifiant de solution invalide (minuscules, chiffres, _)';
  end if;
  if coalesce(btrim(p ->> 'nom'), '') = '' then
    raise exception 'Le nom de la solution est obligatoire';
  end if;
  if v_statut not in ('active', 'en_preparation', 'future', 'retiree') then
    raise exception 'Statut de solution inconnu';
  end if;
  if v_statut = 'active' and not exists (
    select 1 from public.solution_modules sm join public.modules m on m.id = sm.module_id
    where sm.solution_id = v_id and m.nature <> 'socle' and m.statut in ('actif', 'beta')
  ) then
    raise exception 'Une solution ne peut être active sans au moins un module métier disponible';
  end if;
  if v_statut = 'retiree' and exists (select 1 from public.etablissements where solution_id = v_id and statut <> 'archive') then
    raise exception 'Des établissements utilisent encore cette solution';
  end if;
  insert into public.solutions (id, nom, description, statut, icone, ordre)
  values (v_id, btrim(p ->> 'nom'), nullif(btrim(p ->> 'description'), ''), v_statut,
          coalesce(nullif(btrim(p ->> 'icone'), ''), 'modules'), coalesce((p ->> 'ordre')::integer, 99))
  on conflict (id) do update set nom = excluded.nom, description = excluded.description, statut = excluded.statut,
    icone = excluded.icone, ordre = excluded.ordre;
  -- Toute solution reçoit le socle.
  insert into public.solution_modules (solution_id, module_id, par_defaut)
  select v_id, id, true from public.modules where nature = 'socle'
  on conflict (solution_id, module_id) do nothing;
end
$$;

-- Fiches modules enrichies pour le catalogue.
create or replace function public.editeur_modules()
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
      'id', m.id, 'nom', m.nom, 'description', m.description, 'nature', m.nature, 'statut', m.statut,
      'categorie', m.categorie, 'version', m.version, 'ordre', m.ordre, 'modifie_le', m.modifie_le,
      'icone', m.icone, 'documentation', m.documentation, 'capacites_hub', to_jsonb(m.capacites_hub),
      'parametres', m.parametres_schema,
      'programme', m.nature = 'socle' or exists (select 1 from public.permissions p where p.module_id = m.id),
      'depend_de', coalesce((select jsonb_agg(d.depend_de order by d.depend_de) from public.module_dependances d where d.module_id = m.id), '[]'::jsonb),
      'requis_par', coalesce((select jsonb_agg(d.module_id order by d.module_id) from public.module_dependances d where d.depend_de = m.id), '[]'::jsonb),
      'solutions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nom', s.nom, 'par_defaut', sm.par_defaut) order by s.ordre, s.nom)
                             from public.solution_modules sm join public.solutions s on s.id = sm.solution_id where sm.module_id = m.id), '[]'::jsonb),
      'offres', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'nom', o.nom) order by o.ordre)
                          from public.offres o where m.id = any (o.modules)), '[]'::jsonb),
      'etablissements_accordes', (select count(*) from public.etablissements e where e.statut <> 'archive' and m.nature <> 'socle'
                                  and public.module_couvert(e.id, m.id)),
      'etablissements_actifs', (select count(*) from public.etablissement_modules em where em.module_id = m.id and em.actif),
      'permissions', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'description', p.description,
                                 'roles', coalesce((select jsonb_agg(rp.role_id order by rp.role_id) from public.role_permissions rp where rp.permission_id = p.id), '[]'::jsonb)
                               ) order by p.id)
                               from public.permissions p where p.module_id = m.id), '[]'::jsonb),
      'utilisateurs', (select count(distinct em.user_id) from public.etablissement_membres em
                       join public.role_permissions rp on rp.role_id = em.role_id
                       join public.permissions p on p.id = rp.permission_id
                       where em.actif and p.module_id = m.id
                         and public.module_actif(em.etablissement_id, m.id))
    ) order by m.ordre, m.nom)
    from public.modules m
  ), '[]'::jsonb);
end
$$;

create function public.editeur_catalogue()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exiger_editeur();
  return jsonb_build_object(
    'categories', coalesce((select jsonb_agg(to_jsonb(c) order by c.ordre, c.nom) from public.categories_modules c), '[]'::jsonb),
    'solutions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'nom', s.nom, 'description', s.description, 'statut', s.statut, 'icone', s.icone, 'ordre', s.ordre,
        'modules', coalesce((select jsonb_agg(jsonb_build_object('id', sm.module_id, 'par_defaut', sm.par_defaut) order by sm.module_id)
                             from public.solution_modules sm where sm.solution_id = s.id), '[]'::jsonb),
        'offres', (select count(*) from public.offres o where o.solution_id = s.id and o.actif),
        'etablissements', (select count(*) from public.etablissements e where e.solution_id = s.id and e.statut <> 'archive')
      ) order by s.ordre, s.nom)
      from public.solutions s
    ), '[]'::jsonb),
    'modules', public.editeur_modules(),
    'plateforme', (select to_jsonb(p) - 'id' from public.plateforme_identite p),
    'couleurs', to_jsonb(public.couleurs_marque())
  );
end
$$;

-- Identités d'un client et de ses établissements (espace Agence Elite).
create function public.editeur_identite_client(p_client_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exiger_editeur();
  return jsonb_build_object(
    'client', (select to_jsonb(ci) - 'client_id' from public.client_identite ci where ci.client_id = p_client_id),
    'plateforme', (select to_jsonb(p) - 'id' from public.plateforme_identite p),
    'couleurs', to_jsonb(public.couleurs_marque()),
    'etablissements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'nom', e.nom,
        'surcharge', (select jsonb_build_object('nom_logiciel', i.nom_logiciel, 'nom_court', i.nom_court, 'sous_titre', i.sous_titre,
                                                'favicon_url', i.favicon_url, 'couleur_accent', i.couleur_accent)
                      from public.etablissement_identite i where i.etablissement_id = e.id),
        'effective', public.identite_effective(e.id)
      ) order by e.nom)
      from public.etablissements e where e.client_id = p_client_id and e.statut <> 'archive'
    ), '[]'::jsonb)
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Applications d'un établissement (les cinq niveaux, jamais confondus)
-- ---------------------------------------------------------------------------
create function public.mes_applications(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_offre text[];
begin
  if not (public.est_membre(p_etablissement_id) or public.est_editeur() or public.est_dirigeant(
            (select client_id from public.etablissements where id = p_etablissement_id))) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  select o.modules into v_offre
  from public.licences l join public.offres o on o.id = l.offre_id
  where l.etablissement_id = p_etablissement_id and l.statut <> 'terminee';
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id, 'nom', m.nom, 'description', m.description, 'icone', m.icone, 'categorie', c.nom, 'statut', m.statut,
      'disponible', m.statut in ('actif', 'beta'),
      'inclus_offre', m.id = any (coalesce(v_offre, '{}')),
      'accorde', public.module_couvert(p_etablissement_id, m.id),
      'active', public.module_actif(p_etablissement_id, m.id),
      'autorise', exists (select 1 from public.permissions p where p.module_id = m.id and public.a_permission(p_etablissement_id, p.id))
    ) order by c.ordre, m.ordre, m.nom)
    from public.etablissements e
    join public.solution_modules sm on sm.solution_id = e.solution_id
    join public.modules m on m.id = sm.module_id
    join public.categories_modules c on c.id = m.categorie
    where e.id = p_etablissement_id and m.nature <> 'socle' and m.statut <> 'retire'
  ), '[]'::jsonb);
end
$$;

-- Paramètres d'un module : seulement les clés déclarées par le module, avec le bon type.
create or replace function public.enregistrer_parametres_module(p_etablissement_id uuid, p_module_id text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  schema jsonb;
  cle text;
  attendu text;
begin
  perform public.exiger_permission(p_etablissement_id, 'etablissement.modifier');
  if not public.module_actif(p_etablissement_id, p_module_id) then
    raise exception 'Module inactif : %', p_module_id;
  end if;
  if jsonb_typeof(p_data) <> 'object' then
    raise exception 'Paramètres invalides';
  end if;
  select parametres_schema into schema from public.modules where id = p_module_id;
  for cle in select jsonb_object_keys(p_data) loop
    select d ->> 'type' into attendu from jsonb_array_elements(schema) d where d ->> 'cle' = cle;
    if attendu is null then
      raise exception 'Paramètre inconnu pour ce module : %', cle;
    end if;
    if (attendu = 'booleen' and jsonb_typeof(p_data -> cle) <> 'boolean')
       or (attendu = 'nombre' and jsonb_typeof(p_data -> cle) <> 'number')
       or (attendu = 'texte' and jsonb_typeof(p_data -> cle) <> 'string') then
      raise exception 'Valeur invalide pour le paramètre %', cle;
    end if;
  end loop;
  insert into public.etablissement_parametres(etablissement_id, module_id, data)
  values (p_etablissement_id, p_module_id, p_data)
  on conflict (etablissement_id, module_id) do update set data = excluded.data;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Contexte de l'utilisateur : profil complet + identité effective par établissement
-- ---------------------------------------------------------------------------
create or replace function public.mon_contexte()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with compte as (
    select c.identifiant, coalesce(c.doit_changer_mot_de_passe, false) as doit_changer, c.temporaire_expire_le
    from (select auth.uid() as id) moi
    left join public.comptes_connexion c on c.user_id = moi.id
  ),
  acces as (
    select m.etablissement_id as id, m.role_id as role, 1 as priorite
    from public.etablissement_membres m
    where m.user_id = auth.uid() and m.actif
    union all
    select e.id, 'dirigeant', 2
    from public.etablissements e
    join public.client_membres cm on cm.client_id = e.client_id
    where cm.user_id = auth.uid() and cm.actif
    union all
    select s.etablissement_id, 'support', 3
    from public.sessions_support s
    where s.admin_id = auth.uid() and s.fermee_le is null and public.session_support_active(s.etablissement_id)
  ),
  choisi as (
    select distinct on (id) id, role from acces
    where public.compte_pret()
    order by id, priorite
  )
  select jsonb_build_object(
    'utilisateur', (
      select jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'nom', p.nom_complet,
        'prenom', p.prenom,
        'nom_famille', p.nom,
        'nom_affiche', p.nom_affiche,
        'initiales', p.initiales,
        'avatar_url', p.avatar_url,
        'telephone', p.telephone,
        'fonction', p.fonction,
        'preferences', coalesce(p.preferences, '{}'::jsonb)
      )
      from auth.users u left join public.profils p on p.id = u.id
      where u.id = auth.uid()
    ),
    'compte', (select jsonb_build_object(
      'identifiant', identifiant,
      'doit_changer_mot_de_passe', doit_changer,
      'temporaire_expire_le', temporaire_expire_le,
      'temporaire_expire', doit_changer and temporaire_expire_le is not null and temporaire_expire_le < now()
    ) from compte),
    'editeur', case when public.compte_pret() then (select role from public.plateforme_admins where user_id = auth.uid() and actif) end,
    'plateforme', (select to_jsonb(p) - 'id' - 'modifie_le' from public.plateforme_identite p),
    'invitations', case when public.compte_pret() then public.mes_invitations() else '[]'::jsonb end,
    'etablissements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'nom', e.nom,
        'ville', e.ville,
        'devise', e.devise,
        'statut', e.statut,
        'solution_id', e.solution_id,
        'solution', (select s.nom from public.solutions s where s.id = e.solution_id),
        'client', c.nom,
        'client_id', c.id,
        'client_statut', c.statut,
        'ecriture', a.role not in ('dirigeant', 'support') and public.etablissement_autorise_ecriture(e.id),
        'role', a.role,
        'mis_en_service_le', e.mis_en_service_le,
        'licence', public.resume_licence(e.id),
        'identite', (select to_jsonb(i) - 'etablissement_id' from public.etablissement_identite i where i.etablissement_id = e.id),
        'marque', public.identite_effective(e.id),
        'modules', coalesce((
          select jsonb_agg(em.module_id order by em.module_id)
          from public.etablissement_modules em
          where em.etablissement_id = e.id and em.actif
        ), '[]'::jsonb),
        'parametres', coalesce((
          select jsonb_object_agg(ep.module_id, ep.data)
          from public.etablissement_parametres ep
          where ep.etablissement_id = e.id
        ), '{}'::jsonb),
        'permissions', coalesce((
          select jsonb_agg(p.id order by p.id)
          from public.permissions p
          where case
            when a.role in ('dirigeant', 'support') then p.id like '%.lire' and public.module_actif(e.id, p.module_id)
            else public.a_permission(e.id, p.id)
          end
        ), '[]'::jsonb),
        'hubs_restreints', exists (select 1 from public.membre_hubs r where r.etablissement_id = e.id and r.user_id = auth.uid()),
        'hubs', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', h.id, 'nom', h.nom, 'code', h.code, 'type', h.type, 'principal', h.principal, 'actif', h.actif,
            'capacite_vente', h.capacite_vente, 'capacite_stock', h.capacite_stock,
            'capacite_caisse', h.capacite_caisse, 'capacite_transfert', h.capacite_transfert,
            'caisses', coalesce((
              select jsonb_agg(jsonb_build_object('id', p.id, 'nom', p.nom, 'actif', p.actif) order by p.nom)
              from public.points_de_vente p where p.hub_id = h.id
            ), '[]'::jsonb)
          ) order by h.principal desc, h.nom)
          from public.hubs h
          where h.etablissement_id = e.id
            and (a.role in ('dirigeant', 'support') or public.acces_hub(h.id))
        ), '[]'::jsonb),
        'hubs_total', (select count(*) from public.hubs h where h.etablissement_id = e.id and h.actif)
      ) order by e.nom)
      from choisi a
      join public.etablissements e on e.id = a.id
      join public.clients c on c.id = e.client_id
      where e.statut <> 'archive' or a.role = 'support'
    ), '[]'::jsonb)
  )
$$;

-- Droits d'exécution
do $$
declare signature text;
begin
  foreach signature in array array[
    'public.enregistrer_identite_plateforme(jsonb)',
    'public.enregistrer_identite_client(uuid, jsonb)',
    'public.enregistrer_apparence_etablissement(uuid, jsonb)',
    'public.enregistrer_mon_profil(jsonb)',
    'public.enregistrer_categorie_module(jsonb)',
    'public.enregistrer_solution(jsonb)',
    'public.editeur_catalogue()',
    'public.editeur_identite_client(uuid)',
    'public.mes_applications(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
end
$$;
revoke execute on function public.identite_nettoyee(jsonb, text) from public, anon, authenticated;
