-- Menu QR sur les tables (2026-10-12, demande de Juste : « QR codes sur les tables d'abord pour consulter le menu, puis
-- commander », et « déploiement multi-établissements »).
--   1. Menu en ligne : un QR code par table (ou par emplacement : terrasse, comptoir…) ouvre #/menu/<jeton> sans compte.
--      Le menu reprend les articles de l'établissement, leur prix et leur disponibilité en direct (stock du Hub de la
--      table, article épuisé ou indisponible) : rien à ressaisir.
--   2. Commande depuis la table (désactivée par défaut) : le client choisit, envoie ; la commande arrive dans la caisse
--      (« Commandes des tables »). Une personne de la caisse l'accepte : elle devient une facture en cours de SA caisse
--      (vente en attente) ou, avec le module Salle, une commande de la table. Le stock ne bouge qu'à l'encaissement.
--   3. Copier le catalogue d'un établissement vers un autre établissement du même client (ouverture d'une 2e adresse).
-- Le tout appartient au module Caisse : aucune activation de module, mais rien n'est public tant que le gérant n'a pas
-- allumé le menu (menus_qr.actif, faux par défaut).

-- ---------------------------------------------------------------------------
-- 1. Droit, colonne « visible sur le menu »
-- ---------------------------------------------------------------------------
insert into public.permissions (id, module_id, description) values
  ('caisse.menu_qr', 'caisse', 'Régler le menu en ligne et les QR codes des tables')
on conflict (id) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, 'caisse.menu_qr' from unnest(array['gerant', 'responsable']) r
where exists (select 1 from public.roles where id = r)
on conflict do nothing;

alter table public.articles add column if not exists visible_menu boolean not null default true;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
create table public.menus_qr (
  etablissement_id uuid primary key references public.etablissements(id) on delete restrict,
  actif boolean not null default false,
  commandes_actives boolean not null default false,
  titre text check (titre is null or length(titre) <= 80),
  message text check (message is null or length(message) <= 300),
  afficher_epuises boolean not null default true,
  modifie_par uuid references auth.users(id) on delete restrict,
  modifie_le timestamptz not null default now()
);

create table public.emplacements_qr (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  hub_id uuid not null,
  libelle text not null check (length(btrim(libelle)) between 1 and 40),
  table_id uuid references public.rest_tables(id) on delete restrict,
  jeton text not null unique check (jeton ~ '^[a-f0-9]{20}$'),
  commande boolean not null default true,
  actif boolean not null default true,
  ordre integer not null default 0,
  cree_le timestamptz not null default now(),
  foreign key (hub_id, etablissement_id) references public.hubs(id, etablissement_id) on delete restrict
);
create unique index emplacements_qr_libelle on public.emplacements_qr(etablissement_id, lower(btrim(libelle)));
create index emplacements_qr_etablissement_idx on public.emplacements_qr(etablissement_id, ordre);

create table public.commandes_qr (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  emplacement_id uuid not null references public.emplacements_qr(id) on delete restrict,
  hub_id uuid not null references public.hubs(id) on delete restrict,
  numero text not null,
  lignes jsonb not null check (jsonb_typeof(lignes) = 'array' and jsonb_array_length(lignes) between 1 and 30),
  total numeric(14, 2) not null check (total >= 0),
  nom_client text check (nom_client is null or length(nom_client) <= 60),
  note text check (note is null or length(note) <= 300),
  couverts integer check (couverts is null or couverts between 1 and 50),
  statut text not null default 'nouvelle' check (statut in ('nouvelle', 'acceptee', 'refusee')),
  motif_refus text check (motif_refus is null or length(motif_refus) <= 200),
  traitee_par uuid references auth.users(id) on delete restrict,
  traitee_le timestamptz,
  vente_en_attente_id uuid references public.ventes_en_attente(id) on delete restrict,
  rest_commande_id uuid references public.rest_commandes(id) on delete restrict,
  cree_le timestamptz not null default now(),
  unique (etablissement_id, numero),
  check ((statut = 'nouvelle') = (traitee_le is null))
);
create index commandes_qr_etablissement_idx on public.commandes_qr(etablissement_id, statut, cree_le desc);
create index commandes_qr_emplacement_idx on public.commandes_qr(emplacement_id, cree_le desc);

alter table public.menus_qr enable row level security;
alter table public.emplacements_qr enable row level security;
alter table public.commandes_qr enable row level security;
create policy lecture on public.menus_qr for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'caisse.utiliser') or public.a_permission(etablissement_id, 'caisse.menu_qr'));
create policy lecture on public.emplacements_qr for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'caisse.utiliser') or public.a_permission(etablissement_id, 'caisse.menu_qr'));
create policy lecture on public.commandes_qr for select to authenticated
  using ((public.lecture_autorisee(etablissement_id, 'caisse.utiliser') or public.a_permission(etablissement_id, 'restaurant_salle.servir'))
    and public.lecture_hub(etablissement_id, hub_id));

create trigger menus_qr_verrou_etablissement before update on public.menus_qr
  for each row execute function public.verrouiller_etablissement_id();
create trigger emplacements_qr_verrou_etablissement before update on public.emplacements_qr
  for each row execute function public.verrouiller_etablissement_id();
create trigger emplacements_qr_sans_suppression before delete on public.emplacements_qr
  for each row execute function public.refuser_suppression();
create trigger commandes_qr_verrou_etablissement before update on public.commandes_qr
  for each row execute function public.verrouiller_etablissement_id();
create trigger commandes_qr_sans_suppression before delete on public.commandes_qr
  for each row execute function public.refuser_suppression();
create trigger commandes_qr_audit after update on public.commandes_qr
  for each row execute function public.journaliser_modification();

create function public.nouveau_jeton_qr()
returns text
language sql
volatile
set search_path = ''
as $$
  select left(replace(gen_random_uuid()::text, '-', ''), 12) || left(replace(gen_random_uuid()::text, '-', ''), 8)
$$;

-- ---------------------------------------------------------------------------
-- 3. Réglages (gérant, responsable)
-- ---------------------------------------------------------------------------
-- p : { actif?, commandes_actives?, titre?, message?, afficher_epuises? }
create function public.enregistrer_menu_qr(p_etablissement_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exiger_permission(p_etablissement_id, 'caisse.menu_qr');
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'Réglages invalides';
  end if;
  if length(btrim(coalesce(p ->> 'titre', ''))) > 80 then
    raise exception 'Titre trop long (80 caractères au plus)';
  end if;
  if length(btrim(coalesce(p ->> 'message', ''))) > 300 then
    raise exception 'Message trop long (300 caractères au plus)';
  end if;
  insert into public.menus_qr as m (etablissement_id, actif, commandes_actives, titre, message, afficher_epuises, modifie_par)
  values (p_etablissement_id, coalesce((p ->> 'actif')::boolean, false), coalesce((p ->> 'commandes_actives')::boolean, false),
    nullif(btrim(p ->> 'titre'), ''), nullif(btrim(p ->> 'message'), ''), coalesce((p ->> 'afficher_epuises')::boolean, true), auth.uid())
  on conflict (etablissement_id) do update set
    actif = coalesce((p ->> 'actif')::boolean, m.actif),
    commandes_actives = coalesce((p ->> 'commandes_actives')::boolean, m.commandes_actives),
    titre = case when p ? 'titre' then nullif(btrim(p ->> 'titre'), '') else m.titre end,
    message = case when p ? 'message' then nullif(btrim(p ->> 'message'), '') else m.message end,
    afficher_epuises = coalesce((p ->> 'afficher_epuises')::boolean, m.afficher_epuises),
    modifie_par = auth.uid(), modifie_le = now();
end
$$;

-- p : { id?, libelle, hub_id?, table_id?, commande?, actif?, ordre? } ; renvoie l'emplacement.
create function public.enregistrer_emplacement_qr(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  existant public.emplacements_qr%rowtype;
  v_libelle text := btrim(coalesce(p ->> 'libelle', ''));
  v_hub uuid := nullif(p ->> 'hub_id', '')::uuid;
  v_table uuid := nullif(p ->> 'table_id', '')::uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'caisse.menu_qr');
  if v_id is not null then
    select * into existant from public.emplacements_qr where id = v_id and etablissement_id = p_etablissement_id;
    if existant.id is null then
      raise exception 'QR code introuvable dans cet établissement';
    end if;
  end if;
  if v_libelle = '' and existant.id is not null then
    v_libelle := existant.libelle;
  end if;
  if v_libelle = '' or length(v_libelle) > 40 then
    raise exception 'Donnez un nom à la table ou à l''emplacement (40 caractères au plus)';
  end if;
  if v_table is not null then
    select hub_id into v_hub from public.rest_tables where id = v_table and etablissement_id = p_etablissement_id;
    if v_hub is null then
      raise exception 'Table introuvable dans cet établissement';
    end if;
  end if;
  v_hub := coalesce(v_hub, existant.hub_id, (
    select h.id from public.hubs h where h.etablissement_id = p_etablissement_id and h.actif and h.capacite_vente
    order by h.principal desc, h.cree_le limit 1));
  if v_hub is null or not exists (select 1 from public.hubs where id = v_hub and etablissement_id = p_etablissement_id and actif) then
    raise exception 'Choisissez un Hub de vente de cet établissement';
  end if;
  perform public.exiger_acces_hub(v_hub);
  if exists (select 1 from public.emplacements_qr where etablissement_id = p_etablissement_id
             and lower(btrim(libelle)) = lower(v_libelle) and id is distinct from v_id) then
    raise exception 'Un QR code s''appelle déjà « % »', v_libelle;
  end if;
  if existant.id is null then
    if (select count(*) from public.emplacements_qr where etablissement_id = p_etablissement_id) >= 300 then
      raise exception 'Pas plus de 300 QR codes par établissement';
    end if;
    insert into public.emplacements_qr (etablissement_id, hub_id, libelle, table_id, jeton, commande, actif, ordre)
    values (p_etablissement_id, v_hub, v_libelle, v_table, public.nouveau_jeton_qr(), coalesce((p ->> 'commande')::boolean, true),
      coalesce((p ->> 'actif')::boolean, true),
      coalesce(nullif(p ->> 'ordre', '')::integer,
        (select coalesce(max(ordre), 0) + 10 from public.emplacements_qr where etablissement_id = p_etablissement_id)))
    returning id into v_id;
  else
    update public.emplacements_qr set libelle = v_libelle, hub_id = v_hub,
      table_id = case when p ? 'table_id' then v_table else table_id end,
      commande = coalesce((p ->> 'commande')::boolean, commande), actif = coalesce((p ->> 'actif')::boolean, actif),
      ordre = coalesce(nullif(p ->> 'ordre', '')::integer, ordre)
    where id = v_id;
  end if;
  return v_id;
end
$$;

-- Plusieurs QR codes d'un coup : « Table 1 » à « Table 20 », ou toutes les tables de la Salle (module Restaurant).
-- p : { prefixe?, de?, a?, depuis_tables?: bool, hub_id? } ; renvoie le nombre de QR codes créés (les noms existants sont gardés).
create function public.generer_emplacements_qr(p_etablissement_id uuid, p jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefixe text := coalesce(nullif(btrim(p ->> 'prefixe'), ''), 'Table');
  v_de integer := coalesce(nullif(p ->> 'de', '')::integer, 1);
  v_a integer := coalesce(nullif(p ->> 'a', '')::integer, 10);
  v_nb integer := 0;
  i integer;
  t record;
begin
  perform public.exiger_permission(p_etablissement_id, 'caisse.menu_qr');
  if coalesce((p ->> 'depuis_tables')::boolean, false) then
    for t in select rt.id, rt.nom, rt.zone from public.rest_tables rt
             where rt.etablissement_id = p_etablissement_id and rt.actif and public.acces_hub(rt.hub_id)
               and not exists (select 1 from public.emplacements_qr e where e.table_id = rt.id)
             order by rt.zone, rt.ordre, rt.nom loop
      begin
        perform public.enregistrer_emplacement_qr(p_etablissement_id, jsonb_build_object('libelle', left(t.nom, 40), 'table_id', t.id));
      exception when others then
        -- Nom déjà pris par un QR code saisi à la main : on préfixe par la zone.
        perform public.enregistrer_emplacement_qr(p_etablissement_id, jsonb_build_object('libelle', left(t.zone || ' · ' || t.nom, 40), 'table_id', t.id));
      end;
      v_nb := v_nb + 1;
    end loop;
    return v_nb;
  end if;
  if length(v_prefixe) > 30 then
    raise exception 'Nom trop long (30 caractères au plus)';
  end if;
  if v_de < 0 or v_a < v_de or v_a - v_de >= 100 then
    raise exception 'Indiquez de 1 à 100 numéros (ex. de 1 à 20)';
  end if;
  for i in v_de..v_a loop
    if not exists (select 1 from public.emplacements_qr where etablissement_id = p_etablissement_id
                   and lower(btrim(libelle)) = lower(v_prefixe || ' ' || i)) then
      perform public.enregistrer_emplacement_qr(p_etablissement_id,
        jsonb_build_object('libelle', v_prefixe || ' ' || i, 'hub_id', nullif(p ->> 'hub_id', '')));
      v_nb := v_nb + 1;
    end if;
  end loop;
  return v_nb;
end
$$;

-- Nouveau QR code pour un emplacement (l'ancien, photographié ou volé, ne marche plus).
create function public.renouveler_jeton_qr(p_emplacement_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.emplacements_qr%rowtype;
  v_jeton text := public.nouveau_jeton_qr();
begin
  select * into e from public.emplacements_qr where id = p_emplacement_id;
  if e.id is null then
    raise exception 'QR code introuvable';
  end if;
  perform public.exiger_permission(e.etablissement_id, 'caisse.menu_qr');
  update public.emplacements_qr set jeton = v_jeton where id = e.id;
  return v_jeton;
end
$$;

-- Montrer ou cacher des articles sur le menu en ligne (ex. matières premières, articles internes).
create function public.regler_visibilite_menu(p_etablissement_id uuid, p_article_ids uuid[], p_visible boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nb integer;
begin
  perform public.exiger_permission(p_etablissement_id, 'caisse.menu_qr');
  if p_visible is null or p_article_ids is null or cardinality(p_article_ids) = 0 then
    raise exception 'Choisissez au moins un article';
  end if;
  if cardinality(p_article_ids) > 3000 then
    raise exception 'Pas plus de 3 000 articles à la fois';
  end if;
  update public.articles set visible_menu = p_visible
  where etablissement_id = p_etablissement_id and id = any(p_article_ids) and visible_menu is distinct from p_visible;
  get diagnostics v_nb = row_count;
  return v_nb;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Côté client (sans compte)
-- ---------------------------------------------------------------------------
create function public.emplacement_qr_ouvert(p_jeton text)
returns public.emplacements_qr
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e public.emplacements_qr%rowtype;
begin
  select em.* into e from public.emplacements_qr em
  join public.menus_qr m on m.etablissement_id = em.etablissement_id and m.actif
  where em.jeton = lower(btrim(coalesce(p_jeton, ''))) and em.actif;
  if e.id is null or not public.module_actif(e.etablissement_id, 'caisse') or not public.etablissement_autorise_ecriture(e.etablissement_id) then
    raise exception 'Menu introuvable ou fermé';
  end if;
  return e;
end
$$;

create function public.menu_public(p_jeton text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e public.emplacements_qr%rowtype;
  m public.menus_qr%rowtype;
begin
  e := public.emplacement_qr_ouvert(p_jeton);
  select * into m from public.menus_qr where etablissement_id = e.etablissement_id;
  return jsonb_build_object(
    'emplacement', e.libelle,
    'etablissement', coalesce((select nullif(btrim(i.nom_commercial), '') from public.etablissement_identite i where i.etablissement_id = e.etablissement_id),
      (select et.nom from public.etablissements et where et.id = e.etablissement_id)),
    'logo', (select i.logo_url from public.etablissement_identite i where i.etablissement_id = e.etablissement_id),
    'couleur', (select i.couleur_principale from public.etablissement_identite i where i.etablissement_id = e.etablissement_id),
    'telephone', (select i.telephone from public.etablissement_identite i where i.etablissement_id = e.etablissement_id),
    'devise', coalesce((select et.devise from public.etablissements et where et.id = e.etablissement_id), 'XAF'),
    'titre', m.titre, 'message', m.message,
    'commande', m.commandes_actives and e.commande,
    'salle', e.table_id is not null,
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('nom', g.nom, 'articles', g.articles) order by g.ordre nulls last, g.nom)
      from (
        select c.ordre, coalesce(c.nom, 'Autres') nom,
          jsonb_agg(jsonb_build_object(
            'id', a.id, 'nom', a.nom, 'variante', a.variante, 'description', a.description, 'prix', a.prix_vente, 'unite', a.unite,
            'photo', case when a.photo is not null and length(a.photo) <= 150000 then a.photo end,
            'disponible', a.disponible and not a.epuise and (not a.suivi_stock or public.stock_hub(e.hub_id, a.id) > 0)
          ) order by a.ordre_affichage, a.nom, a.variante) articles
        from public.articles a
        left join public.categories_articles c on c.id = a.categorie_id
        where a.etablissement_id = e.etablissement_id and a.actif and a.visible_menu and a.prix_vente > 0
          and (c.id is null or c.actif)
          and (m.afficher_epuises or (a.disponible and not a.epuise and (not a.suivi_stock or public.stock_hub(e.hub_id, a.id) > 0)))
        group by c.id, c.ordre, c.nom
      ) g), '[]'::jsonb)
  );
end
$$;

-- Commande du client. p : { lignes: [{ article_id, quantite, note? }], nom?, note?, couverts? }.
-- Prix relus ici ; seuls les articles visibles et disponibles passent. Anti-abus : 3 commandes en attente par table,
-- 20 commandes par heure et par table, 300 par heure et par établissement.
create function public.commander_par_qr(p_jeton text, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.emplacements_qr%rowtype;
  m public.menus_qr%rowtype;
  l jsonb;
  a public.articles%rowtype;
  v_quantite integer;
  v_lignes jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_vus uuid[] := '{}';
  v_couverts integer;
  resultat public.commandes_qr%rowtype;
begin
  e := public.emplacement_qr_ouvert(p_jeton);
  select * into m from public.menus_qr where etablissement_id = e.etablissement_id;
  if not (m.commandes_actives and e.commande) then
    raise exception 'La commande depuis la table n''est pas ouverte : appelez un serveur';
  end if;
  if p is null or jsonb_typeof(p -> 'lignes') is distinct from 'array' or jsonb_array_length(p -> 'lignes') = 0 then
    raise exception 'Votre commande est vide';
  end if;
  if jsonb_array_length(p -> 'lignes') > 30 then
    raise exception 'Pas plus de 30 articles différents par commande';
  end if;
  if length(btrim(coalesce(p ->> 'nom', ''))) > 60 or length(btrim(coalesce(p ->> 'note', ''))) > 300 then
    raise exception 'Nom ou note trop long';
  end if;
  begin
    v_couverts := nullif(p ->> 'couverts', '')::integer;
  exception when others then
    raise exception 'Nombre de personnes invalide';
  end;
  if v_couverts is not null and (v_couverts < 1 or v_couverts > 50) then
    raise exception 'Nombre de personnes invalide';
  end if;
  if (select count(*) from public.commandes_qr where emplacement_id = e.id and statut = 'nouvelle') >= 3 then
    raise exception 'Vos commandes précédentes n''ont pas encore été prises : patientez, un serveur arrive';
  end if;
  if (select count(*) from public.commandes_qr where emplacement_id = e.id and cree_le > now() - interval '1 hour') >= 20
     or (select count(*) from public.commandes_qr where etablissement_id = e.etablissement_id and cree_le > now() - interval '1 hour') >= 300 then
    raise exception 'Trop de commandes en peu de temps : appelez un serveur';
  end if;
  for l in select value from jsonb_array_elements(p -> 'lignes') loop
    if jsonb_typeof(l) <> 'object' then
      raise exception 'Ligne invalide';
    end if;
    begin
      v_quantite := (l ->> 'quantite')::integer;
    exception when others then
      raise exception 'Quantité invalide';
    end;
    if v_quantite is null or v_quantite < 1 or v_quantite > 50 then
      raise exception 'Quantité invalide (de 1 à 50)';
    end if;
    if length(coalesce(l ->> 'note', '')) > 100 then
      raise exception 'Précision trop longue (100 caractères au plus)';
    end if;
    select * into a from public.articles
    where id = nullif(l ->> 'article_id', '')::uuid and etablissement_id = e.etablissement_id and actif and visible_menu and prix_vente > 0;
    if a.id is null then
      raise exception 'Un article n''est plus sur le menu : rechargez la page';
    end if;
    if a.id = any(v_vus) then
      raise exception '« % » apparaît deux fois', a.nom;
    end if;
    v_vus := v_vus || a.id;
    if not a.disponible or a.epuise or (a.suivi_stock and public.stock_hub(e.hub_id, a.id) < v_quantite) then
      raise exception '« % » n''est plus disponible en cette quantité', a.nom;
    end if;
    v_lignes := v_lignes || jsonb_build_array(jsonb_build_object('article_id', a.id,
      'nom', a.nom || coalesce(' — ' || nullif(btrim(a.variante), ''), ''), 'quantite', v_quantite, 'prix', a.prix_vente,
      'note', nullif(btrim(coalesce(l ->> 'note', '')), '')));
    v_total := v_total + a.prix_vente * v_quantite;
  end loop;
  insert into public.commandes_qr (etablissement_id, emplacement_id, hub_id, numero, lignes, total, nom_client, note, couverts)
  values (e.etablissement_id, e.id, e.hub_id, public.prochain_numero(e.etablissement_id, 'commande_qr', 'QR-'), v_lignes,
    round(v_total, 2), nullif(btrim(p ->> 'nom'), ''), nullif(btrim(p ->> 'note'), ''), v_couverts)
  returning * into resultat;
  perform public.notifier_permission(e.etablissement_id, 'caisse.utiliser', 'caisse.commande_qr', 'Commande de « ' || e.libelle || ' »',
    resultat.numero || ' · ' || jsonb_array_length(v_lignes) || ' article(s)', 'commandes-qr');
  return jsonb_build_object('id', resultat.id, 'numero', resultat.numero, 'total', resultat.total, 'statut', resultat.statut);
end
$$;

-- Suivi par le client (avec le jeton de sa table et l'identifiant reçu à l'envoi).
create function public.suivi_commande_qr(p_jeton text, p_commande_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e public.emplacements_qr%rowtype;
  c public.commandes_qr%rowtype;
begin
  e := public.emplacement_qr_ouvert(p_jeton);
  select * into c from public.commandes_qr where id = p_commande_id and emplacement_id = e.id;
  if c.id is null then
    raise exception 'Commande introuvable';
  end if;
  return jsonb_build_object('numero', c.numero, 'statut', c.statut, 'total', c.total, 'lignes', c.lignes, 'motif_refus', c.motif_refus);
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Côté équipe : accepter ou refuser
-- ---------------------------------------------------------------------------
-- p_cible : 'caisse' (facture en cours de ma caisse ouverte p_session_id) ou 'salle' (commande de la table, module Salle).
create function public.accepter_commande_qr(p_commande_id uuid, p_cible text, p_session_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.commandes_qr%rowtype;
  e public.emplacements_qr%rowtype;
  v_attente uuid;
  v_rest uuid;
  v_lignes jsonb;
begin
  select * into c from public.commandes_qr where id = p_commande_id for update;
  if c.id is null then
    raise exception 'Commande introuvable';
  end if;
  if c.statut <> 'nouvelle' then
    raise exception 'Cette commande a déjà été prise (%)', c.statut;
  end if;
  select * into e from public.emplacements_qr where id = c.emplacement_id;
  if p_cible = 'caisse' then
    perform public.exiger_permission(c.etablissement_id, 'caisse.utiliser');
    if p_session_id is null or not exists (select 1 from public.sessions_caisse s where s.id = p_session_id
        and s.etablissement_id = c.etablissement_id and s.statut = 'ouverte' and s.hub_id = c.hub_id) then
      raise exception 'Ouvrez votre caisse (sur le Hub de la table) pour prendre cette commande';
    end if;
    select jsonb_agg(jsonb_build_object('article_id', x ->> 'article_id', 'quantite', (x ->> 'quantite')::numeric))
    into v_lignes from jsonb_array_elements(c.lignes) x;
    v_attente := public.mettre_vente_en_attente(p_session_id, v_lignes, left(e.libelle || ' · ' || c.numero, 60), null, 0);
  elsif p_cible = 'salle' then
    perform public.exiger_permission(c.etablissement_id, 'restaurant_salle.servir');
    if e.table_id is null then
      raise exception 'Ce QR code n''est pas relié à une table de la Salle : prenez la commande en caisse';
    end if;
    select id into v_rest from public.rest_commandes where table_id = e.table_id and statut = 'ouverte';
    if v_rest is null then
      v_rest := public.ouvrir_commande_restaurant(c.etablissement_id,
        jsonb_build_object('table_id', e.table_id, 'couverts', coalesce(c.couverts, 1), 'nom_client', c.nom_client,
          'note', 'Commande ' || c.numero || ' depuis le QR code'));
    end if;
    select jsonb_agg(jsonb_build_object('article_id', x ->> 'article_id', 'quantite', (x ->> 'quantite')::numeric, 'note', x ->> 'note'))
    into v_lignes from jsonb_array_elements(c.lignes) x;
    perform public.ajouter_lignes_restaurant(v_rest, v_lignes);
  else
    raise exception 'Choisissez : caisse ou salle';
  end if;
  update public.commandes_qr set statut = 'acceptee', traitee_par = auth.uid(), traitee_le = now(),
    vente_en_attente_id = v_attente, rest_commande_id = v_rest
  where id = c.id;
  return jsonb_build_object('vente_en_attente_id', v_attente, 'rest_commande_id', v_rest);
end
$$;

create function public.refuser_commande_qr(p_commande_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.commandes_qr%rowtype;
begin
  select * into c from public.commandes_qr where id = p_commande_id for update;
  if c.id is null then
    raise exception 'Commande introuvable';
  end if;
  if not (public.a_permission(c.etablissement_id, 'caisse.utiliser') or public.a_permission(c.etablissement_id, 'restaurant_salle.servir')) then
    raise exception 'Permission refusée : caisse.utiliser' using errcode = '42501';
  end if;
  perform public.exiger_acces_hub(c.hub_id);
  if c.statut <> 'nouvelle' then
    raise exception 'Cette commande a déjà été prise (%)', c.statut;
  end if;
  if btrim(coalesce(p_motif, '')) = '' or length(p_motif) > 200 then
    raise exception 'Dites au client pourquoi (200 caractères au plus)';
  end if;
  update public.commandes_qr set statut = 'refusee', motif_refus = btrim(p_motif), traitee_par = auth.uid(), traitee_le = now()
  where id = c.id;
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Déploiement multi-établissements : copier le catalogue
-- ---------------------------------------------------------------------------
-- Catégories et articles (prix, coût, casier, poste, visibilité menu, photo), conditionnements sans fournisseur.
-- Jamais le stock, les ventes ni les fournisseurs. Un article déjà présent (même référence, sinon même nom) est gardé ;
-- p_maj_prix met son prix de vente au niveau de la source. Les deux établissements appartiennent au même client.
create function public.copier_catalogue(p_source uuid, p_cible uuid, p_maj_prix boolean default false, p_simulation boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.articles%rowtype;
  v_existant public.articles%rowtype;
  v_cat_nom text;
  v_cat uuid;
  v_nouvel uuid;
  v_cats integer := 0;
  v_crees integer := 0;
  v_gardes integer := 0;
  v_prix integer := 0;
  v_conds integer := 0;
  v_noms text[] := '{}';
  v_code text;
begin
  if p_source is null or p_cible is null or p_source = p_cible then
    raise exception 'Choisissez deux établissements différents';
  end if;
  perform public.exiger_permission(p_cible, 'articles.gerer');
  if not public.lecture_autorisee(p_source, 'articles.lire') then
    raise exception 'Permission refusée : articles.lire sur l''établissement source' using errcode = '42501';
  end if;
  if (select client_id from public.etablissements where id = p_source) is distinct from (select client_id from public.etablissements where id = p_cible) then
    raise exception 'Les deux établissements doivent appartenir au même client';
  end if;
  -- Catégories manquantes (par nom), dans l'ordre de la source.
  for v_cat_nom in select c.nom from public.categories_articles c
                   where c.etablissement_id = p_source and c.actif
                     and not exists (select 1 from public.categories_articles d where d.etablissement_id = p_cible
                                     and lower(public.unaccent_simple(d.nom)) = lower(public.unaccent_simple(c.nom)))
                   order by c.ordre, c.nom loop
    v_cats := v_cats + 1;
    if not p_simulation then
      insert into public.categories_articles (etablissement_id, nom, ordre)
      values (p_cible, v_cat_nom, coalesce((select max(ordre) + 10 from public.categories_articles where etablissement_id = p_cible), 10));
    end if;
  end loop;
  for a in select * from public.articles where etablissement_id = p_source and actif order by nom loop
    v_existant := null;
    if a.reference is not null then
      select * into v_existant from public.articles where etablissement_id = p_cible and reference = a.reference;
    end if;
    if v_existant.id is null then
      select * into v_existant from public.articles where etablissement_id = p_cible and actif
        and lower(public.unaccent_simple(btrim(nom))) = lower(public.unaccent_simple(btrim(a.nom)))
        and coalesce(variante, '') = coalesce(a.variante, '')
      limit 1;
    end if;
    if v_existant.id is not null then
      v_gardes := v_gardes + 1;
      if p_maj_prix and v_existant.prix_vente <> a.prix_vente then
        v_prix := v_prix + 1;
        if not p_simulation then
          update public.articles set prix_vente = a.prix_vente where id = v_existant.id;
        end if;
      end if;
      continue;
    end if;
    -- Deux articles du même nom dans la source (sans référence) : un seul est copié.
    if lower(public.unaccent_simple(btrim(a.nom))) || '|' || coalesce(a.variante, '') = any(v_noms) then
      continue;
    end if;
    v_noms := v_noms || (lower(public.unaccent_simple(btrim(a.nom))) || '|' || coalesce(a.variante, ''));
    v_crees := v_crees + 1;
    if p_simulation then
      continue;
    end if;
    select d.id into v_cat from public.categories_articles c
    join public.categories_articles d on d.etablissement_id = p_cible
      and lower(public.unaccent_simple(d.nom)) = lower(public.unaccent_simple(c.nom))
    where c.id = a.categorie_id
    limit 1;
    v_code := case when a.code_barres is not null and not exists (
      select 1 from public.articles where etablissement_id = p_cible and code_barres = a.code_barres) then a.code_barres end;
    insert into public.articles (etablissement_id, reference, code_barres, nom, description, categorie_id, prix_vente, cout_achat, unite,
      suivi_stock, stock_minimum, photo, poste_preparation, variante, ordre_affichage, disponible, unites_par_lot, nom_lot, visible_menu)
    values (p_cible, a.reference, v_code, a.nom, a.description, v_cat, a.prix_vente, a.cout_achat, a.unite,
      a.suivi_stock, a.stock_minimum, a.photo, a.poste_preparation, a.variante, a.ordre_affichage, a.disponible, a.unites_par_lot,
      a.nom_lot, a.visible_menu)
    returning id into v_nouvel;
    insert into public.conditionnements_articles (etablissement_id, article_id, fournisseur_id, nom, unites, dernier_prix)
    select p_cible, v_nouvel, null, ca.nom, ca.unites, ca.dernier_prix
    from public.conditionnements_articles ca where ca.article_id = a.id and ca.fournisseur_id is null;
    get diagnostics v_conds = row_count;
  end loop;
  return jsonb_build_object('simulation', p_simulation, 'categories_creees', v_cats, 'articles_crees', v_crees,
    'articles_deja_presents', v_gardes, 'prix_mis_a_jour', v_prix,
    'source', (select nom from public.etablissements where id = p_source), 'cible', (select nom from public.etablissements where id = p_cible));
end
$$;

-- ---------------------------------------------------------------------------
-- 7. Droits d'exécution
-- ---------------------------------------------------------------------------
do $$
declare signature text;
begin
  foreach signature in array array[
    'public.enregistrer_menu_qr(uuid, jsonb)',
    'public.enregistrer_emplacement_qr(uuid, jsonb)',
    'public.generer_emplacements_qr(uuid, jsonb)',
    'public.renouveler_jeton_qr(uuid)',
    'public.regler_visibilite_menu(uuid, uuid[], boolean)',
    'public.accepter_commande_qr(uuid, text, uuid)',
    'public.refuser_commande_qr(uuid, text)',
    'public.copier_catalogue(uuid, uuid, boolean, boolean)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
  foreach signature in array array[
    'public.menu_public(text)',
    'public.commander_par_qr(text, jsonb)',
    'public.suivi_commande_qr(text, uuid)'
  ] loop
    execute format('revoke execute on function %s from public', signature);
    execute format('grant execute on function %s to anon, authenticated', signature);
  end loop;
  foreach signature in array array['public.emplacement_qr_ouvert(text)', 'public.nouveau_jeton_qr()'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', signature);
  end loop;
end
$$;

notify pgrst, 'reload schema';
