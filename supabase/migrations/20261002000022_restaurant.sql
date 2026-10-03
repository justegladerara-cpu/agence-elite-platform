-- Restaurant (2026-10-02) : les modules « restaurant_salle » et « restaurant_cuisine », jusqu'ici « Prévus », deviennent réels.
-- Salle : tables rattachées à un Hub qui vend, commandes par table (ou à emporter), envoi en cuisine/bar,
-- transfert de table, addition séparée, encaissement par la caisse (une vraie vente d'origine « restaurant »).
-- Cuisine : file des plats par poste (cuisine, bar), « en préparation » puis « prêt », le serveur est prévenu.
-- Rien ne se supprime : une ligne envoyée s'annule avec motif ; une vente encaissée s'annule comme toute vente de caisse.
-- Les fiches techniques (recettes, ingrédients déduits du stock) restent une évolution future documentée.

-- ---------------------------------------------------------------------------
-- 1. Catalogue et droits
-- ---------------------------------------------------------------------------
update public.modules set
  description = 'Tables par zone, commandes par table ou à emporter, envoi en cuisine, addition séparée, encaissement en caisse.',
  documentation = 'docs/RESTAURANT.md',
  parametres_schema = '[
    {"cle": "couverts_obligatoires", "libelle": "Demander le nombre de couverts à l''ouverture d''une table", "type": "booleen", "defaut": true}
  ]'::jsonb
where id = 'restaurant_salle';
update public.modules set
  description = 'Écran cuisine et bar : plats envoyés, en préparation, prêts ; le serveur est prévenu.',
  documentation = 'docs/RESTAURANT.md'
where id = 'restaurant_cuisine';

insert into public.permissions (id, module_id, description) values
  ('restaurant_salle.lire', 'restaurant_salle', 'Voir le plan de salle et les commandes'),
  ('restaurant_salle.servir', 'restaurant_salle', 'Ouvrir une table, prendre la commande, envoyer en cuisine, servir'),
  ('restaurant_salle.encaisser', 'restaurant_salle', 'Encaisser une commande (addition entière ou séparée)'),
  ('restaurant_salle.annuler', 'restaurant_salle', 'Annuler un plat envoyé ou une commande (avec motif)'),
  ('restaurant_salle.gerer', 'restaurant_salle', 'Gérer les tables, les zones et les postes de préparation'),
  ('restaurant_cuisine.lire', 'restaurant_cuisine', 'Voir l''écran cuisine et bar'),
  ('restaurant_cuisine.preparer', 'restaurant_cuisine', 'Passer un plat en préparation puis prêt')
on conflict (id) do nothing;

insert into public.roles (id, nom, description, ordre, modules_requis) values
  ('serveur', 'Serveur', 'Tables, commandes, envoi en cuisine, service et encaissement', 55, '{restaurant_salle}'),
  ('cuisinier', 'Cuisinier', 'Écran cuisine et bar : préparer les plats', 58, '{restaurant_cuisine}')
on conflict (id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['gerant', 'responsable']) r
cross join unnest(array['restaurant_salle.lire', 'restaurant_salle.servir', 'restaurant_salle.encaisser', 'restaurant_salle.annuler',
  'restaurant_salle.gerer', 'restaurant_cuisine.lire', 'restaurant_cuisine.preparer']) p
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id) values
  ('responsable_hub', 'restaurant_salle.lire'), ('responsable_hub', 'restaurant_salle.servir'),
  ('responsable_hub', 'restaurant_salle.encaisser'), ('responsable_hub', 'restaurant_salle.annuler'),
  ('responsable_hub', 'restaurant_cuisine.lire'), ('responsable_hub', 'restaurant_cuisine.preparer'),
  ('employe', 'restaurant_salle.lire'), ('employe', 'restaurant_salle.servir'), ('employe', 'restaurant_salle.encaisser'),
  ('employe', 'restaurant_cuisine.lire'),
  ('serveur', 'etablissement.lire'), ('serveur', 'articles.lire'), ('serveur', 'caisse.utiliser'), ('serveur', 'paiements.encaisser'),
  ('serveur', 'restaurant_salle.lire'), ('serveur', 'restaurant_salle.servir'), ('serveur', 'restaurant_salle.encaisser'),
  ('serveur', 'restaurant_cuisine.lire'),
  ('cuisinier', 'etablissement.lire'), ('cuisinier', 'restaurant_cuisine.lire'), ('cuisinier', 'restaurant_cuisine.preparer'),
  ('comptable', 'restaurant_salle.lire'), ('lecteur', 'restaurant_salle.lire'), ('lecteur', 'restaurant_cuisine.lire')
on conflict do nothing;

-- Poste de préparation de chaque article : cuisine, bar, ou aucun (servi directement : bouteille, dessert prêt).
alter table public.articles add column if not exists poste_preparation text not null default 'aucun'
  check (poste_preparation in ('aucun', 'cuisine', 'bar'));

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
create table public.rest_tables (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  hub_id uuid not null,
  zone text not null default 'Salle' check (btrim(zone) <> '' and length(zone) <= 60),
  nom text not null check (btrim(nom) <> '' and length(nom) <= 40),
  places integer not null default 4 check (places between 1 and 100),
  ordre integer not null default 0,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (hub_id, nom),
  unique (id, etablissement_id),
  foreign key (hub_id, etablissement_id) references public.hubs(id, etablissement_id) on delete restrict
);
create index rest_tables_etablissement_idx on public.rest_tables(etablissement_id, hub_id);

create table public.rest_commandes (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  hub_id uuid not null,
  numero text not null,
  table_id uuid,
  type text not null default 'sur_place' check (type in ('sur_place', 'a_emporter')),
  couverts integer check (couverts is null or couverts between 1 and 200),
  nom_client text check (nom_client is null or length(nom_client) <= 120),
  note text check (note is null or length(note) <= 500),
  statut text not null default 'ouverte' check (statut in ('ouverte', 'encaissee', 'annulee')),
  serveur_id uuid not null references auth.users(id) on delete restrict,
  ouverte_le timestamptz not null default now(),
  cloturee_le timestamptz,
  motif_annulation text,
  modifie_le timestamptz not null default now(),
  unique (etablissement_id, numero),
  unique (id, etablissement_id),
  check ((type = 'sur_place') = (table_id is not null)),
  check ((statut = 'ouverte') = (cloturee_le is null)),
  check (statut <> 'annulee' or btrim(coalesce(motif_annulation, '')) <> ''),
  foreign key (hub_id, etablissement_id) references public.hubs(id, etablissement_id) on delete restrict,
  foreign key (table_id, etablissement_id) references public.rest_tables(id, etablissement_id) on delete restrict
);
-- Une table n'a qu'une commande ouverte à la fois.
create unique index rest_commandes_table_ouverte on public.rest_commandes(table_id) where statut = 'ouverte';
create index rest_commandes_etablissement_idx on public.rest_commandes(etablissement_id, statut, ouverte_le);

create table public.rest_lignes (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  commande_id uuid not null,
  article_id uuid not null references public.articles(id) on delete restrict,
  libelle text not null,
  quantite numeric(10, 3) not null check (quantite > 0),
  note text check (note is null or length(note) <= 200),
  poste text not null check (poste in ('aucun', 'cuisine', 'bar')),
  statut text not null default 'en_attente'
    check (statut in ('en_attente', 'envoyee', 'en_preparation', 'prete', 'servie', 'annulee')),
  vente_id uuid references public.ventes(id) on delete restrict,
  ajoutee_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default clock_timestamp(),
  envoyee_le timestamptz,
  prete_le timestamptz,
  servie_le timestamptz,
  annulee_le timestamptz,
  annulee_par uuid references auth.users(id) on delete restrict,
  motif_annulation text,
  modifie_le timestamptz not null default now(),
  unique (id, etablissement_id),
  check (statut <> 'annulee' or (annulee_le is not null and btrim(coalesce(motif_annulation, '')) <> '')),
  check (vente_id is null or statut <> 'annulee'),
  foreign key (commande_id, etablissement_id) references public.rest_commandes(id, etablissement_id) on delete restrict
);
create index rest_lignes_commande_idx on public.rest_lignes(commande_id);
create index rest_lignes_cuisine_idx on public.rest_lignes(etablissement_id, poste, statut) where statut in ('envoyee', 'en_preparation', 'prete');
create index rest_lignes_vente_idx on public.rest_lignes(vente_id);

do $$
declare
  nom_table text;
begin
  foreach nom_table in array array['rest_tables', 'rest_commandes', 'rest_lignes'] loop
    execute format('create trigger %I_modifie_le before update on public.%I for each row execute function public.fixer_modifie_le()', nom_table, nom_table);
    execute format('create trigger %I_sans_suppression before delete on public.%I for each row execute function public.refuser_suppression()', nom_table, nom_table);
    execute format('create trigger %I_verrou_etablissement before update on public.%I for each row execute function public.verrouiller_etablissement_id()', nom_table, nom_table);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.journaliser_modification()', nom_table, nom_table);
    execute format('alter table public.%I enable row level security', nom_table);
  end loop;
end
$$;
-- Lecture : la salle, ou la cuisine (qui voit les plats et leur table), dans les Hubs autorisés.
create policy lecture on public.rest_tables for select to authenticated
using ((public.lecture_autorisee(etablissement_id, 'restaurant_salle.lire') or public.lecture_autorisee(etablissement_id, 'restaurant_cuisine.lire'))
  and public.lecture_hub(etablissement_id, hub_id));
create policy lecture on public.rest_commandes for select to authenticated
using ((public.lecture_autorisee(etablissement_id, 'restaurant_salle.lire') or public.lecture_autorisee(etablissement_id, 'restaurant_cuisine.lire'))
  and public.lecture_hub(etablissement_id, hub_id));
create policy lecture on public.rest_lignes for select to authenticated
using ((public.lecture_autorisee(etablissement_id, 'restaurant_salle.lire') or public.lecture_autorisee(etablissement_id, 'restaurant_cuisine.lire'))
  and exists (select 1 from public.rest_commandes c where c.id = rest_lignes.commande_id and public.lecture_hub(c.etablissement_id, c.hub_id)));

-- Une ligne payée ou annulée est figée ; une ligne ne change jamais d'article, de commande ni de quantité une fois envoyée.
create function public.proteger_ligne_restaurant()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.statut = 'annulee' then
    raise exception 'Ce plat est annulé : il ne change plus';
  end if;
  if old.vente_id is not null and (new.vente_id is distinct from old.vente_id or new.statut = 'annulee') then
    raise exception 'Ce plat est déjà encaissé';
  end if;
  if new.commande_id <> old.commande_id or new.article_id <> old.article_id or new.libelle <> old.libelle
     or new.ajoutee_par <> old.ajoutee_par or new.cree_le <> old.cree_le
     or (old.statut <> 'en_attente' and (new.note is distinct from old.note or new.poste <> old.poste
       or (new.quantite <> old.quantite and not (coalesce(current_setting('restaurant.scission', true), '') = 'oui'
         and new.quantite < old.quantite and old.vente_id is null)))) then
    raise exception 'Un plat envoyé ne se modifie pas : annulez-le avec un motif et ressaisissez-le';
  end if;
  return new;
end
$$;
create trigger rest_lignes_protection before update on public.rest_lignes
for each row execute function public.proteger_ligne_restaurant();

-- ---------------------------------------------------------------------------
-- 3. Fonctions
-- ---------------------------------------------------------------------------
-- p : { id?, hub_id, zone?, nom, places?, ordre?, actif? }
create function public.enregistrer_table_restaurant(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p ->> 'id', '')::uuid;
  v_hub uuid := nullif(p ->> 'hub_id', '')::uuid;
  hub public.hubs%rowtype;
  existant public.rest_tables%rowtype;
begin
  perform public.exiger_permission(p_etablissement_id, 'restaurant_salle.gerer');
  if resultat is not null then
    select * into existant from public.rest_tables where id = resultat and etablissement_id = p_etablissement_id for update;
    if existant.id is null then
      raise exception 'Table introuvable dans cet établissement';
    end if;
    v_hub := coalesce(v_hub, existant.hub_id);
    if v_hub <> existant.hub_id and exists (select 1 from public.rest_commandes where table_id = resultat and statut = 'ouverte') then
      raise exception 'Cette table a une commande en cours : encaissez-la avant de la déplacer';
    end if;
    if not coalesce((p ->> 'actif')::boolean, true) and exists (select 1 from public.rest_commandes where table_id = resultat and statut = 'ouverte') then
      raise exception 'Cette table a une commande en cours : encaissez-la avant de la retirer';
    end if;
  end if;
  select * into hub from public.hubs where id = v_hub and etablissement_id = p_etablissement_id;
  if hub.id is null then
    raise exception 'Choisissez le Hub (salle) de la table';
  end if;
  perform public.exiger_acces_hub(hub.id);
  if not hub.actif or not hub.capacite_vente then
    raise exception 'Le Hub « % » ne vend pas : impossible d''y placer des tables', hub.nom;
  end if;
  if coalesce(btrim(p ->> 'nom'), '') = '' then
    raise exception 'Le nom de la table est obligatoire';
  end if;
  if exists (select 1 from public.rest_tables where hub_id = hub.id and lower(nom) = lower(btrim(p ->> 'nom')) and id is distinct from resultat) then
    raise exception 'Une table « % » existe déjà dans ce Hub', btrim(p ->> 'nom');
  end if;
  if resultat is null then
    insert into public.rest_tables (etablissement_id, hub_id, zone, nom, places, ordre, actif)
    values (p_etablissement_id, hub.id, coalesce(nullif(btrim(p ->> 'zone'), ''), 'Salle'), btrim(p ->> 'nom'),
      coalesce(nullif(p ->> 'places', '')::integer, 4), coalesce(nullif(p ->> 'ordre', '')::integer, 0),
      coalesce((p ->> 'actif')::boolean, true))
    returning id into resultat;
  else
    update public.rest_tables set hub_id = hub.id, zone = coalesce(nullif(btrim(p ->> 'zone'), ''), 'Salle'), nom = btrim(p ->> 'nom'),
      places = coalesce(nullif(p ->> 'places', '')::integer, places), ordre = coalesce(nullif(p ->> 'ordre', '')::integer, ordre),
      actif = coalesce((p ->> 'actif')::boolean, true)
    where id = resultat;
  end if;
  return resultat;
end
$$;

-- Poste de préparation d'un article (cuisine, bar, aucun).
create function public.definir_poste_preparation(p_article_id uuid, p_poste text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_etab uuid;
begin
  select etablissement_id into v_etab from public.articles where id = p_article_id;
  if v_etab is null then
    raise exception 'Article introuvable';
  end if;
  perform public.exiger_permission(v_etab, 'restaurant_salle.gerer');
  if p_poste is null or p_poste not in ('aucun', 'cuisine', 'bar') then
    raise exception 'Poste inconnu : %', p_poste;
  end if;
  update public.articles set poste_preparation = p_poste where id = p_article_id;
end
$$;

-- Ouvre une commande : sur une table libre (sur place), ou à emporter dans un Hub qui vend.
-- p : { table_id?, hub_id? (à emporter), couverts?, nom_client?, note? }
create function public.ouvrir_commande_restaurant(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table public.rest_tables%rowtype;
  hub public.hubs%rowtype;
  v_couverts integer := nullif(p ->> 'couverts', '')::integer;
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
  insert into public.rest_commandes (etablissement_id, hub_id, numero, table_id, type, couverts, nom_client, note, serveur_id)
  values (p_etablissement_id, hub.id, public.prochain_numero(p_etablissement_id, 'commande_restaurant', 'CM-'), v_table.id,
    case when v_table.id is null then 'a_emporter' else 'sur_place' end, v_couverts,
    nullif(btrim(p ->> 'nom_client'), ''), nullif(btrim(p ->> 'note'), ''), auth.uid())
  returning id into resultat;
  return resultat;
end
$$;

-- Commande ouverte, verrouillée, dans un Hub autorisé.
create function public.commande_restaurant_ouverte(p_commande_id uuid, p_permission text)
returns public.rest_commandes
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.rest_commandes%rowtype;
begin
  select * into c from public.rest_commandes where id = p_commande_id for update;
  if c.id is null then
    raise exception 'Commande introuvable';
  end if;
  perform public.exiger_permission(c.etablissement_id, p_permission);
  perform public.exiger_acces_hub(c.hub_id);
  if c.statut <> 'ouverte' then
    raise exception 'La commande % est close', c.numero;
  end if;
  return c;
end
$$;

-- Ajoute des plats (en attente d'envoi). p_lignes : [{ article_id, quantite, note? }]
create function public.ajouter_lignes_restaurant(p_commande_id uuid, p_lignes jsonb)
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
    if length(coalesce(ligne ->> 'note', '')) > 200 then
      raise exception 'Note trop longue (200 caractères)';
    end if;
    insert into public.rest_lignes (etablissement_id, commande_id, article_id, libelle, quantite, note, poste, ajoutee_par)
    values (c.etablissement_id, c.id, article.id, article.nom, quantite, nullif(btrim(ligne ->> 'note'), ''),
      article.poste_preparation, auth.uid());
    nb := nb + 1;
  end loop;
  return nb;
end
$$;

-- Modifie la quantité ou la note d'un plat pas encore envoyé (quantité 0 = retiré, sans motif puisque rien n'est parti).
create function public.modifier_ligne_restaurant(p_ligne_id uuid, p_quantite numeric, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.rest_lignes%rowtype;
begin
  select * into l from public.rest_lignes where id = p_ligne_id for update;
  if l.id is null then
    raise exception 'Plat introuvable';
  end if;
  perform public.commande_restaurant_ouverte(l.commande_id, 'restaurant_salle.servir');
  if l.statut <> 'en_attente' then
    raise exception 'Ce plat est déjà envoyé : annulez-le avec un motif';
  end if;
  if p_quantite is null or p_quantite = 'NaN'::numeric or p_quantite < 0 or p_quantite > 1000 then
    raise exception 'Quantité invalide';
  end if;
  if length(coalesce(p_note, '')) > 200 then
    raise exception 'Note trop longue (200 caractères)';
  end if;
  if p_quantite = 0 then
    update public.rest_lignes set statut = 'annulee', annulee_le = now(), annulee_par = auth.uid(),
      motif_annulation = 'Retiré avant envoi' where id = l.id;
  else
    update public.rest_lignes set quantite = p_quantite, note = nullif(btrim(p_note), '') where id = l.id;
  end if;
end
$$;

-- Envoie les plats en attente : en cuisine ou au bar ; sans poste, ils sont servis directement.
create function public.envoyer_commande_restaurant(p_commande_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.rest_commandes%rowtype;
  nb integer;
  postes text[];
  v_table text;
begin
  c := public.commande_restaurant_ouverte(p_commande_id, 'restaurant_salle.servir');
  select array_agg(distinct poste) filter (where poste <> 'aucun') into postes
  from public.rest_lignes where commande_id = c.id and statut = 'en_attente';
  update public.rest_lignes set
    statut = case when poste = 'aucun' then 'servie' else 'envoyee' end,
    envoyee_le = now(),
    servie_le = case when poste = 'aucun' then now() end
  where commande_id = c.id and statut = 'en_attente';
  get diagnostics nb = row_count;
  if nb = 0 then
    raise exception 'Rien à envoyer : ajoutez des plats';
  end if;
  if postes is not null then
    select nom into v_table from public.rest_tables where id = c.table_id;
    perform public.notifier_permission(c.etablissement_id, 'restaurant_cuisine.preparer', 'restaurant.envoi',
      'Nouveau bon ' || c.numero, coalesce('Table ' || v_table, 'À emporter') || ' : ' || nb || ' ligne(s)', 'cuisine');
  end if;
  return nb;
end
$$;

-- Avance un plat : en préparation / prêt (cuisine), servi (salle).
create function public.avancer_ligne_restaurant(p_ligne_id uuid, p_statut text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.rest_lignes%rowtype;
  c public.rest_commandes%rowtype;
  v_table text;
begin
  select * into l from public.rest_lignes where id = p_ligne_id for update;
  if l.id is null then
    raise exception 'Plat introuvable';
  end if;
  c := public.commande_restaurant_ouverte(l.commande_id,
    case when p_statut = 'servie' then 'restaurant_salle.servir' else 'restaurant_cuisine.preparer' end);
  if p_statut = 'en_preparation' and l.statut = 'envoyee' then
    update public.rest_lignes set statut = 'en_preparation' where id = l.id;
  elsif p_statut = 'prete' and l.statut in ('envoyee', 'en_preparation') then
    update public.rest_lignes set statut = 'prete', prete_le = now() where id = l.id;
    select nom into v_table from public.rest_tables where id = c.table_id;
    if c.serveur_id <> auth.uid() then
      perform public.notifier(c.serveur_id, c.etablissement_id, 'restaurant.pret', 'Plat prêt',
        l.quantite || ' × ' || l.libelle || ' · ' || coalesce('table ' || v_table, c.numero), 'salle/' || c.id);
    end if;
  elsif p_statut = 'servie' and l.statut in ('envoyee', 'en_preparation', 'prete') then
    update public.rest_lignes set statut = 'servie', servie_le = now(), prete_le = coalesce(prete_le, now()) where id = l.id;
  else
    raise exception 'Passage impossible de « % » à « % »', l.statut, p_statut;
  end if;
end
$$;

-- Annule un plat envoyé (motif obligatoire, droit d'annulation) ; un plat encaissé s'annule par la vente.
create function public.annuler_ligne_restaurant(p_ligne_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.rest_lignes%rowtype;
begin
  select * into l from public.rest_lignes where id = p_ligne_id for update;
  if l.id is null then
    raise exception 'Plat introuvable';
  end if;
  perform public.commande_restaurant_ouverte(l.commande_id, 'restaurant_salle.annuler');
  if l.statut = 'annulee' then
    raise exception 'Ce plat est déjà annulé';
  end if;
  if l.vente_id is not null then
    raise exception 'Ce plat est déjà encaissé : annulez la vente depuis la caisse';
  end if;
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Le motif d''annulation est obligatoire';
  end if;
  update public.rest_lignes set statut = 'annulee', annulee_le = now(), annulee_par = auth.uid(), motif_annulation = btrim(p_motif)
  where id = l.id;
end
$$;

-- Change de table (table libre du même Hub).
create function public.transferer_commande_restaurant(p_commande_id uuid, p_table_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.rest_commandes%rowtype;
  t public.rest_tables%rowtype;
begin
  c := public.commande_restaurant_ouverte(p_commande_id, 'restaurant_salle.servir');
  select * into t from public.rest_tables where id = p_table_id and etablissement_id = c.etablissement_id for update;
  if t.id is null or not t.actif then
    raise exception 'Table introuvable ou retirée';
  end if;
  if t.hub_id <> c.hub_id then
    raise exception 'La table doit être dans le même Hub que la commande';
  end if;
  if exists (select 1 from public.rest_commandes where table_id = t.id and statut = 'ouverte') then
    raise exception 'La table % est déjà occupée', t.nom;
  end if;
  update public.rest_commandes set table_id = t.id, type = 'sur_place' where id = c.id;
end
$$;

-- Sépare une partie d'un plat (addition séparée par quantité) : la ligne d'origine garde le reste.
create function public.scinder_ligne_restaurant(p_ligne_id uuid, p_quantite numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.rest_lignes%rowtype;
  resultat uuid;
begin
  select * into l from public.rest_lignes where id = p_ligne_id for update;
  if l.id is null then
    raise exception 'Plat introuvable';
  end if;
  perform public.commande_restaurant_ouverte(l.commande_id, 'restaurant_salle.encaisser');
  if l.statut in ('annulee', 'en_attente') or l.vente_id is not null then
    raise exception 'Seul un plat envoyé et non encaissé se sépare';
  end if;
  if p_quantite is null or p_quantite = 'NaN'::numeric or p_quantite <= 0 or p_quantite >= l.quantite then
    raise exception 'Quantité à séparer invalide (entre 0 et %)', l.quantite;
  end if;
  -- Contournement contrôlé du verrou de quantité : seule la séparation change la quantité d'un plat envoyé.
  perform set_config('restaurant.scission', 'oui', true);
  insert into public.rest_lignes (etablissement_id, commande_id, article_id, libelle, quantite, note, poste, statut, ajoutee_par,
    envoyee_le, prete_le, servie_le)
  values (l.etablissement_id, l.commande_id, l.article_id, l.libelle, p_quantite, l.note, l.poste, l.statut, l.ajoutee_par,
    l.envoyee_le, l.prete_le, l.servie_le)
  returning id into resultat;
  update public.rest_lignes set quantite = quantite - p_quantite where id = l.id;
  perform set_config('restaurant.scission', '', true);
  return resultat;
end
$$;

-- Encaisse tout ou partie de la commande (addition séparée) par une vraie vente de caisse d'origine « restaurant ».
-- p_lignes_ids null = tous les plats envoyés non encaissés. La caisse ouverte doit être dans le Hub de la commande.
create function public.encaisser_commande_restaurant(
  p_commande_id uuid, p_session_id uuid, p_paiements jsonb default '[]'::jsonb, p_lignes_ids uuid[] default null,
  p_contact_id uuid default null, p_remise numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.rest_commandes%rowtype;
  v_session public.sessions_caisse%rowtype;
  lignes jsonb;
  ids uuid[];
  resultat jsonb;
  v_table text;
begin
  c := public.commande_restaurant_ouverte(p_commande_id, 'restaurant_salle.encaisser');
  select * into v_session from public.sessions_caisse where id = p_session_id and etablissement_id = c.etablissement_id;
  if v_session.id is null or v_session.statut <> 'ouverte' then
    raise exception 'Aucune caisse ouverte : ouvrez la caisse avant d''encaisser';
  end if;
  if v_session.hub_id <> c.hub_id then
    raise exception 'Encaissez avec une caisse du Hub de la commande';
  end if;
  if p_lignes_ids is null and exists (select 1 from public.rest_lignes where commande_id = c.id and statut = 'en_attente') then
    raise exception 'Des plats ne sont pas envoyés : envoyez-les ou retirez-les avant l''addition';
  end if;
  select array_agg(id order by cree_le, id) into ids
  from public.rest_lignes
  where commande_id = c.id and vente_id is null and statut not in ('annulee', 'en_attente')
    and (p_lignes_ids is null or id = any(p_lignes_ids))
  ;
  if p_lignes_ids is not null and coalesce(cardinality(ids), 0) <> (select count(distinct x) from unnest(p_lignes_ids) x) then
    raise exception 'Certains plats choisis sont déjà encaissés, annulés, pas encore envoyés ou d''une autre commande';
  end if;
  if ids is null then
    raise exception 'Aucun plat à encaisser';
  end if;
  select jsonb_agg(jsonb_build_object('article_id', article_id, 'quantite', quantite) order by cree_le, id) into lignes
  from public.rest_lignes where id = any(ids);
  select nom into v_table from public.rest_tables where id = c.table_id;
  resultat := public.enregistrer_vente(c.etablissement_id, p_session_id, lignes, p_paiements, p_contact_id, p_remise,
    c.numero || coalesce(' · table ' || v_table, ' · à emporter'));
  update public.ventes set origine = 'restaurant' where id = (resultat ->> 'vente_id')::uuid;
  update public.rest_lignes set vente_id = (resultat ->> 'vente_id')::uuid where id = any(ids);
  if not exists (
    select 1 from public.rest_lignes where commande_id = c.id and statut <> 'annulee' and vente_id is null
  ) then
    update public.rest_commandes set statut = 'encaissee', cloturee_le = now() where id = c.id;
    resultat := resultat || jsonb_build_object('commande_close', true);
  else
    resultat := resultat || jsonb_build_object('commande_close', false);
  end if;
  return resultat;
end
$$;

-- Annule une commande sans aucun plat encaissé (motif obligatoire) ; libère la table.
create function public.annuler_commande_restaurant(p_commande_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.rest_commandes%rowtype;
begin
  c := public.commande_restaurant_ouverte(p_commande_id, 'restaurant_salle.annuler');
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Le motif d''annulation est obligatoire';
  end if;
  if exists (select 1 from public.rest_lignes where commande_id = c.id and vente_id is not null) then
    raise exception 'Une partie est déjà encaissée : annulez les plats restants un par un';
  end if;
  update public.rest_lignes set statut = 'annulee', annulee_le = now(), annulee_par = auth.uid(),
    motif_annulation = 'Commande annulée : ' || btrim(p_motif)
  where commande_id = c.id and statut <> 'annulee';
  update public.rest_commandes set statut = 'annulee', cloturee_le = now(), motif_annulation = btrim(p_motif) where id = c.id;
end
$$;

-- Ferme une commande dont tout ce qui reste est déjà encaissé ou annulé (après annulation des derniers plats).
create function public.clore_commande_restaurant(p_commande_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.rest_commandes%rowtype;
begin
  c := public.commande_restaurant_ouverte(p_commande_id, 'restaurant_salle.servir');
  if exists (select 1 from public.rest_lignes where commande_id = c.id and statut <> 'annulee' and vente_id is null) then
    raise exception 'Il reste des plats à encaisser';
  end if;
  if not exists (select 1 from public.rest_lignes where commande_id = c.id and vente_id is not null) then
    raise exception 'Rien n''a été encaissé : annulez la commande avec un motif';
  end if;
  update public.rest_commandes set statut = 'encaissee', cloturee_le = now() where id = c.id;
end
$$;

-- Synthèse du jour (date locale de l'établissement) pour le tableau de bord et le widget.
create function public.tableau_de_bord_restaurant(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  jour date := public.date_locale(p_etablissement_id);
  resultat jsonb;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'restaurant_salle.lire') then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'tables', (select count(*) from public.rest_tables t where t.etablissement_id = p_etablissement_id and t.actif and public.lecture_hub(t.etablissement_id, t.hub_id)),
    'tables_occupees', (select count(*) from public.rest_commandes c where c.etablissement_id = p_etablissement_id and c.statut = 'ouverte' and c.table_id is not null and public.lecture_hub(c.etablissement_id, c.hub_id)),
    'commandes_ouvertes', (select count(*) from public.rest_commandes c where c.etablissement_id = p_etablissement_id and c.statut = 'ouverte' and public.lecture_hub(c.etablissement_id, c.hub_id)),
    'en_cuisine', (select count(*) from public.rest_lignes l join public.rest_commandes c on c.id = l.commande_id
      where l.etablissement_id = p_etablissement_id and l.statut in ('envoyee', 'en_preparation') and public.lecture_hub(c.etablissement_id, c.hub_id)),
    'prets', (select count(*) from public.rest_lignes l join public.rest_commandes c on c.id = l.commande_id
      where l.etablissement_id = p_etablissement_id and l.statut = 'prete' and public.lecture_hub(c.etablissement_id, c.hub_id)),
    'couverts_jour', (select coalesce(sum(c.couverts), 0) from public.rest_commandes c where c.etablissement_id = p_etablissement_id
      and c.statut <> 'annulee' and public.date_locale(p_etablissement_id, c.ouverte_le) = jour and public.lecture_hub(c.etablissement_id, c.hub_id)),
    'chiffre_jour', (select coalesce(sum(v.total), 0) from public.ventes v where v.etablissement_id = p_etablissement_id and v.origine = 'restaurant'
      and v.statut <> 'annulee' and public.date_locale(p_etablissement_id, v.cree_le) = jour and public.lecture_hub(v.etablissement_id, v.hub_id)),
    'tickets_jour', (select count(*) from public.ventes v where v.etablissement_id = p_etablissement_id and v.origine = 'restaurant'
      and v.statut <> 'annulee' and public.date_locale(p_etablissement_id, v.cree_le) = jour and public.lecture_hub(v.etablissement_id, v.hub_id)),
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

-- Une vente de restaurant s'annule comme une vente de caisse (même caisse ouverte, motif) ;
-- seules les ventes issues d'une facture (ou d'un autre module) passent par leur document.
create or replace function public.annuler_vente(p_vente_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  vente public.ventes%rowtype;
  session_statut text;
begin
  select * into vente from public.ventes where id = p_vente_id for update;
  if vente.id is null then
    raise exception 'Vente introuvable';
  end if;
  perform public.exiger_permission(vente.etablissement_id, 'ventes.annuler');
  perform public.exiger_acces_hub(vente.hub_id);
  if vente.statut = 'annulee' then
    raise exception 'Cette vente est déjà annulée';
  end if;
  if vente.origine not in ('caisse', 'restaurant') then
    raise exception 'Cette vente vient d''une facture ou d''un autre module : annulez-la depuis son document (avoir)';
  end if;
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Le motif d''annulation est obligatoire';
  end if;
  select statut into session_statut from public.sessions_caisse where id = vente.session_caisse_id for update;
  if session_statut is distinct from 'ouverte' then
    raise exception 'La caisse de cette vente est clôturée : l''annulation n''est plus possible';
  end if;
  if exists (
    select 1 from public.paiements p join public.sessions_caisse s on s.id = p.session_caisse_id
    where p.vente_id = vente.id and p.statut = 'valide' and s.statut <> 'ouverte'
  ) then
    raise exception 'Un paiement de cette vente appartient à une caisse clôturée : l''annulation n''est plus possible';
  end if;

  insert into public.mouvements_stock(etablissement_id, hub_id, article_id, type, quantite, cout_unitaire, motif, vente_id, acteur)
  select vente.etablissement_id, m.hub_id, m.article_id, 'retour_annulation', -m.quantite, m.cout_unitaire,
         'Annulation ' || vente.numero, vente.id, auth.uid()
  from public.mouvements_stock m
  where m.vente_id = vente.id and m.type = 'sortie_vente';

  update public.paiements
  set statut = 'annule', annule_le = now(), annule_par = auth.uid(), motif_annulation = 'Annulation de la vente : ' || btrim(p_motif)
  where vente_id = vente.id and statut = 'valide';

  update public.ventes
  set statut = 'annulee', annulee_le = now(), annulee_par = auth.uid(), motif_annulation = btrim(p_motif),
      montant_paye = 0, statut_paiement = 'impayee'
  where id = vente.id;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Disponibilité, solution « Restaurant », droits d'exécution
-- ---------------------------------------------------------------------------
update public.modules set statut = 'actif', version = '1.0' where id in ('restaurant_salle', 'restaurant_cuisine');
insert into public.solution_modules (solution_id, module_id, par_defaut) values
  ('restaurant', 'etablissement', true), ('restaurant', 'membres', true), ('restaurant', 'tableau_de_bord', true),
  ('restaurant', 'rh_presences', false), ('restaurant', 'rh_conges', false), ('restaurant', 'documents', false),
  ('restaurant', 'crm_pipeline', false), ('hotel', 'restaurant_salle', false), ('hotel', 'restaurant_cuisine', false)
on conflict (solution_id, module_id) do nothing;
update public.solution_modules set par_defaut = true where solution_id = 'restaurant'
  and module_id in ('etablissement', 'membres', 'tableau_de_bord', 'articles', 'stock', 'caisse', 'ventes', 'paiements', 'recus',
    'cloture', 'restaurant_salle', 'restaurant_cuisine');
update public.solutions set statut = 'active',
  description = 'Restaurants, bars, maquis : plan de salle, commandes par table, écran cuisine, addition séparée ; caisse, stock et paiements communs.'
where id = 'restaurant' and statut in ('future', 'en_preparation');
-- Offre d'essai (30 jours automatiques), prix à 0 : Agence Elite fixe les prix dans son espace avant toute vente.
insert into public.offres (id, solution_id, nom, description, modules, offre_essai, actif, ordre) values
  ('restaurant-complet', 'restaurant', 'Restaurant Complet',
   'Plan de salle, commandes, écran cuisine et bar, caisse, ventes, paiements, reçus, ticket Z, stock, contacts et dépenses.',
   array['articles', 'stock', 'caisse', 'ventes', 'paiements', 'recus', 'cloture', 'contacts', 'depenses',
     'restaurant_salle', 'restaurant_cuisine'], true, true, 20)
on conflict (id) do nothing;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.enregistrer_table_restaurant(uuid, jsonb)',
    'public.definir_poste_preparation(uuid, text)',
    'public.ouvrir_commande_restaurant(uuid, jsonb)',
    'public.ajouter_lignes_restaurant(uuid, jsonb)',
    'public.modifier_ligne_restaurant(uuid, numeric, text)',
    'public.envoyer_commande_restaurant(uuid)',
    'public.avancer_ligne_restaurant(uuid, text)',
    'public.annuler_ligne_restaurant(uuid, text)',
    'public.transferer_commande_restaurant(uuid, uuid)',
    'public.scinder_ligne_restaurant(uuid, numeric)',
    'public.encaisser_commande_restaurant(uuid, uuid, jsonb, uuid[], uuid, numeric)',
    'public.annuler_commande_restaurant(uuid, text)',
    'public.clore_commande_restaurant(uuid)',
    'public.tableau_de_bord_restaurant(uuid)',
    'public.annuler_vente(uuid, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
  foreach signature in array array['public.commande_restaurant_ouverte(uuid, text)', 'public.proteger_ligne_restaurant()'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', signature);
  end loop;
end
$$;
