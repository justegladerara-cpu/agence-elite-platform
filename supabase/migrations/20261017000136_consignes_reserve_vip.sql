-- Trois besoins des bars et restaurants (2026-10-13, demande de Juste) — générique, aucun client n'est nommé ici.
--   1. Emballages consignés (casiers, bouteilles vides) : le gérant crée ses types d'emballage avec leur consigne
--      (0 permis). On note ce qui arrive du fournisseur, ce qu'on lui rend, ce qu'on confie à un client contre une
--      consigne et ce que le client rapporte (consigne rendue ou non). L'écran montre, par emballage : ce qu'on a chez
--      nous, ce qu'on doit à chaque fournisseur, ce que les clients ont chez eux.
--   2. Bouteille en réserve : un client achète une bouteille (vente normale), en boit une partie ; le reste est gardé à
--      son nom. Les services suivants diminuent le reste sans nouvelle vente, jusqu'à la fin de la bouteille. Chaque
--      service est journalisé (qui, quand).
--   3. Table VIP : une table ou une réservation porte un « minimum de consommation ». La commande le reprend à
--      l'ouverture. À l'encaissement final, sous le minimum, la base refuse tant que l'équipe n'a pas ajouté un
--      « complément minimum » (ligne de montant) ou qu'un responsable n'a pas levé le minimum avec un motif.
-- Rien ne se supprime : un mouvement, une réserve ou un service s'annule avec un motif. Écriture par fonctions
-- seulement ; lecture par RLS.

-- ---------------------------------------------------------------------------
-- 1. Droits
-- ---------------------------------------------------------------------------
insert into public.permissions (id, module_id, description) values
  ('stock.emballages', 'stock', 'Emballages consignés : noter les casiers et bouteilles reçus, rendus, confiés aux clients'),
  ('stock.emballages_gerer', 'stock', 'Emballages consignés : créer les types, corriger le compte, annuler un mouvement'),
  ('caisse.reserve', 'caisse', 'Bouteilles en réserve : mettre une bouteille de côté au nom d''un client et la servir'),
  ('caisse.reserve_annuler', 'caisse', 'Bouteilles en réserve : annuler une réserve ou un service (avec motif)'),
  ('restaurant_salle.minimum', 'restaurant_salle', 'Tables VIP : régler le minimum de consommation, le lever avec un motif')
on conflict (id) do nothing;

-- Emballages : ceux qui ajustent le stock et ceux qui tiennent la caisse (le client rapporte ses vides au comptoir).
insert into public.role_permissions (role_id, permission_id)
select distinct role_id, 'stock.emballages' from public.role_permissions where permission_id in ('stock.ajuster', 'caisse.utiliser')
on conflict do nothing;
-- Bouteilles en réserve : toute personne qui tient la caisse ou sert.
insert into public.role_permissions (role_id, permission_id)
select distinct role_id, 'caisse.reserve' from public.role_permissions where permission_id = 'caisse.utiliser'
on conflict do nothing;
-- Décisions de responsable : régler, corriger, annuler, lever un minimum.
insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['gerant', 'responsable', 'responsable_hub']) r
cross join unnest(array['stock.emballages_gerer', 'caisse.reserve_annuler', 'restaurant_salle.minimum']) p
where exists (select 1 from public.roles where id = r)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Emballages consignés
-- ---------------------------------------------------------------------------
create table public.emballages (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  nom text not null check (length(btrim(nom)) between 1 and 60),
  consigne numeric(14, 2) not null default 0 check (consigne >= 0),
  actif boolean not null default true,
  ordre integer not null default 0,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (id, etablissement_id)
);
create unique index emballages_nom on public.emballages(etablissement_id, lower(btrim(nom)));

-- Sens de chaque mouvement (quantite toujours > 0, sauf « ajustement » : + ou −) :
--   recu_fournisseur  : chez nous +q, dû au fournisseur +q
--   rendu_fournisseur : chez nous −q, dû au fournisseur −q
--   donne_client      : chez nous −q, chez les clients +q (consigne encaissée : montant)
--   rendu_client      : chez nous +q, chez les clients −q (consigne rendue : montant, 0 si gardée)
--   ajustement        : chez nous ±q (casse, comptage), motif obligatoire
create table public.emballages_mouvements (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  emballage_id uuid not null,
  type text not null check (type in ('recu_fournisseur', 'rendu_fournisseur', 'donne_client', 'rendu_client', 'ajustement')),
  quantite integer not null check (quantite <> 0 and abs(quantite) <= 100000),
  contact_id uuid references public.contacts(id) on delete restrict,
  nom_client text check (nom_client is null or length(nom_client) <= 120),
  montant numeric(14, 2) not null default 0 check (montant >= 0),
  note text check (note is null or length(note) <= 300),
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  annule_le timestamptz,
  annule_par uuid references auth.users(id) on delete restrict,
  motif_annulation text check (motif_annulation is null or length(motif_annulation) <= 300),
  check (type = 'ajustement' or quantite > 0),
  check (type not in ('recu_fournisseur', 'rendu_fournisseur') or contact_id is not null),
  check (type <> 'ajustement' or btrim(coalesce(note, '')) <> ''),
  check ((annule_le is null) = (motif_annulation is null)),
  foreign key (emballage_id, etablissement_id) references public.emballages(id, etablissement_id) on delete restrict
);
create index emballages_mouvements_idx on public.emballages_mouvements(etablissement_id, cree_le desc);
create index emballages_mouvements_emballage_idx on public.emballages_mouvements(emballage_id);

-- ---------------------------------------------------------------------------
-- 3. Bouteilles en réserve
-- ---------------------------------------------------------------------------
-- unite : « bouteille » (reste 0,5 = une demi-bouteille), « verre » ou « cl ».
create table public.reserves_bouteilles (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  numero text not null,
  contact_id uuid references public.contacts(id) on delete restrict,
  nom_client text not null check (length(btrim(nom_client)) between 1 and 120),
  telephone text check (telephone is null or length(telephone) <= 40),
  article_id uuid references public.articles(id) on delete restrict,
  libelle text not null check (length(btrim(libelle)) between 1 and 120),
  unite text not null default 'bouteille' check (unite in ('bouteille', 'verre', 'cl')),
  quantite_initiale numeric(10, 3) not null check (quantite_initiale > 0),
  reste numeric(10, 3) not null check (reste >= 0),
  vente_id uuid references public.ventes(id) on delete restrict,
  photo text check (photo is null or length(photo) <= 400000),
  expire_le date,
  note text check (note is null or length(note) <= 300),
  statut text not null default 'en_cours' check (statut in ('en_cours', 'terminee', 'annulee')),
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  annulee_le timestamptz,
  annulee_par uuid references auth.users(id) on delete restrict,
  motif_annulation text check (motif_annulation is null or length(motif_annulation) <= 300),
  unique (etablissement_id, numero),
  unique (id, etablissement_id),
  check (reste <= quantite_initiale),
  check ((statut = 'annulee') = (annulee_le is not null and motif_annulation is not null)),
  check (statut <> 'terminee' or reste = 0)
);
create index reserves_bouteilles_idx on public.reserves_bouteilles(etablissement_id, statut, cree_le desc);

create table public.reserves_services (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  reserve_id uuid not null,
  quantite numeric(10, 3) not null check (quantite > 0),
  note text check (note is null or length(note) <= 300),
  servi_par uuid not null references auth.users(id) on delete restrict,
  servi_le timestamptz not null default clock_timestamp(),
  annule_le timestamptz,
  annule_par uuid references auth.users(id) on delete restrict,
  motif_annulation text check (motif_annulation is null or length(motif_annulation) <= 300),
  check ((annule_le is null) = (motif_annulation is null)),
  foreign key (reserve_id, etablissement_id) references public.reserves_bouteilles(id, etablissement_id) on delete restrict
);
create index reserves_services_reserve_idx on public.reserves_services(reserve_id, servi_le desc);

-- ---------------------------------------------------------------------------
-- 4. Protections communes, lecture
-- ---------------------------------------------------------------------------
do $$
declare
  nom_table text;
begin
  foreach nom_table in array array['emballages', 'emballages_mouvements', 'reserves_bouteilles', 'reserves_services'] loop
    execute format('create trigger %I_sans_suppression before delete on public.%I for each row execute function public.refuser_suppression()', nom_table, nom_table);
    execute format('create trigger %I_verrou_etablissement before update on public.%I for each row execute function public.verrouiller_etablissement_id()', nom_table, nom_table);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.journaliser_modification()', nom_table, nom_table);
    execute format('alter table public.%I enable row level security', nom_table);
  end loop;
end
$$;
create trigger emballages_modifie_le before update on public.emballages for each row execute function public.fixer_modifie_le();
create trigger reserves_bouteilles_modifie_le before update on public.reserves_bouteilles for each row execute function public.fixer_modifie_le();

create policy lecture on public.emballages for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'stock.lire') or public.a_permission(etablissement_id, 'stock.emballages'));
create policy lecture on public.emballages_mouvements for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'stock.lire') or public.a_permission(etablissement_id, 'stock.emballages'));
create policy lecture on public.reserves_bouteilles for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'caisse.reserve'));
create policy lecture on public.reserves_services for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'caisse.reserve'));

-- ---------------------------------------------------------------------------
-- 5. Fonctions : emballages
-- ---------------------------------------------------------------------------
-- p : { id?, nom, consigne?, actif?, ordre? } ; renvoie l'emballage.
create function public.enregistrer_emballage(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_nom text := btrim(coalesce(p ->> 'nom', ''));
  v_consigne numeric := coalesce(nullif(p ->> 'consigne', '')::numeric, 0);
begin
  perform public.exiger_permission(p_etablissement_id, 'stock.emballages_gerer');
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'Emballage invalide';
  end if;
  if v_nom = '' or length(v_nom) > 60 then
    raise exception 'Donnez un nom à l''emballage (60 caractères au plus), ex. « Casier 12 bouteilles »';
  end if;
  if v_consigne = 'NaN'::numeric or v_consigne < 0 or v_consigne > 10000000 then
    raise exception 'Consigne invalide (0 ou plus)';
  end if;
  if exists (select 1 from public.emballages where etablissement_id = p_etablissement_id
             and lower(btrim(nom)) = lower(v_nom) and id is distinct from v_id) then
    raise exception 'Un emballage s''appelle déjà « % »', v_nom;
  end if;
  if v_id is null then
    if (select count(*) from public.emballages where etablissement_id = p_etablissement_id) >= 100 then
      raise exception 'Pas plus de 100 types d''emballage par établissement';
    end if;
    insert into public.emballages (etablissement_id, nom, consigne, ordre)
    values (p_etablissement_id, v_nom, round(v_consigne, 2), coalesce(nullif(p ->> 'ordre', '')::integer,
      (select coalesce(max(ordre), 0) + 10 from public.emballages where etablissement_id = p_etablissement_id)))
    returning id into v_id;
  else
    update public.emballages set nom = v_nom, consigne = round(v_consigne, 2),
      actif = coalesce((p ->> 'actif')::boolean, actif), ordre = coalesce(nullif(p ->> 'ordre', '')::integer, ordre)
    where id = v_id and etablissement_id = p_etablissement_id;
    if not found then
      raise exception 'Emballage introuvable dans cet établissement';
    end if;
  end if;
  return v_id;
end
$$;

-- p : { emballage_id, type, quantite, contact_id?, nom_client?, montant?, note? } ; renvoie le mouvement.
-- La consigne d'un client est proposée d'après l'emballage (quantité × consigne) si le montant n'est pas donné.
create function public.noter_mouvement_emballage(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.emballages%rowtype;
  v_type text := p ->> 'type';
  v_quantite integer;
  v_contact public.contacts%rowtype;
  v_montant numeric;
  v_note text := nullif(btrim(coalesce(p ->> 'note', '')), '');
  v_nom text := nullif(btrim(coalesce(p ->> 'nom_client', '')), '');
  v_id uuid;
begin
  if v_type = 'ajustement' then
    perform public.exiger_permission(p_etablissement_id, 'stock.emballages_gerer');
  else
    perform public.exiger_permission(p_etablissement_id, 'stock.emballages');
  end if;
  if v_type is null or v_type not in ('recu_fournisseur', 'rendu_fournisseur', 'donne_client', 'rendu_client', 'ajustement') then
    raise exception 'Mouvement inconnu';
  end if;
  select * into e from public.emballages where id = nullif(p ->> 'emballage_id', '')::uuid and etablissement_id = p_etablissement_id;
  if e.id is null then
    raise exception 'Choisissez un emballage de cet établissement';
  end if;
  if not e.actif then
    raise exception 'L''emballage « % » est retiré', e.nom;
  end if;
  begin
    v_quantite := (p ->> 'quantite')::integer;
  exception when others then
    raise exception 'Indiquez un nombre entier d''emballages';
  end;
  if v_quantite is null or v_quantite = 0 or abs(v_quantite) > 100000 or (v_type <> 'ajustement' and v_quantite < 0) then
    raise exception 'Indiquez un nombre d''emballages supérieur à 0';
  end if;
  if nullif(p ->> 'contact_id', '') is not null then
    select * into v_contact from public.contacts where id = (p ->> 'contact_id')::uuid and etablissement_id = p_etablissement_id;
    if v_contact.id is null then
      raise exception 'Contact inconnu dans cet établissement';
    end if;
  end if;
  if v_type in ('recu_fournisseur', 'rendu_fournisseur') then
    if v_contact.id is null or v_contact.type not in ('fournisseur', 'les_deux') then
      raise exception 'Choisissez le fournisseur';
    end if;
  end if;
  if v_type = 'ajustement' and v_note is null then
    raise exception 'Le motif est obligatoire (casse, comptage…)';
  end if;
  if length(coalesce(v_note, '')) > 300 or length(coalesce(v_nom, '')) > 120 then
    raise exception 'Texte trop long';
  end if;
  if v_type = 'rendu_fournisseur' and v_quantite > coalesce((
      select sum(case m.type when 'recu_fournisseur' then m.quantite else -m.quantite end) from public.emballages_mouvements m
      where m.emballage_id = e.id and m.contact_id = v_contact.id and m.annule_le is null
        and m.type in ('recu_fournisseur', 'rendu_fournisseur')), 0) then
    raise exception 'On ne doit pas autant de « % » à ce fournisseur : notez d''abord ce qu''il a livré', e.nom;
  end if;
  if v_type in ('donne_client', 'rendu_client') then
    v_montant := coalesce(nullif(p ->> 'montant', '')::numeric, case when v_type = 'donne_client' then e.consigne * v_quantite else 0 end);
    if v_montant = 'NaN'::numeric or v_montant < 0 or v_montant > 100000000 then
      raise exception 'Montant de consigne invalide';
    end if;
    if v_nom is null and v_contact.id is not null then
      v_nom := v_contact.nom;
    end if;
  end if;
  insert into public.emballages_mouvements (etablissement_id, emballage_id, type, quantite, contact_id, nom_client, montant, note, cree_par)
  values (p_etablissement_id, e.id, v_type, v_quantite, v_contact.id, v_nom, round(coalesce(v_montant, 0), 2), v_note, auth.uid())
  returning id into v_id;
  return v_id;
end
$$;

-- Une erreur de saisie s'annule (jamais supprimée) : le mouvement ne compte plus, le motif reste.
create function public.annuler_mouvement_emballage(p_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.emballages_mouvements%rowtype;
begin
  select * into m from public.emballages_mouvements where id = p_id for update;
  if m.id is null then
    raise exception 'Mouvement introuvable';
  end if;
  perform public.exiger_permission(m.etablissement_id, 'stock.emballages_gerer');
  if m.annule_le is not null then
    raise exception 'Ce mouvement est déjà annulé';
  end if;
  if coalesce(btrim(p_motif), '') = '' or length(btrim(p_motif)) > 300 then
    raise exception 'Le motif d''annulation est obligatoire';
  end if;
  update public.emballages_mouvements set annule_le = now(), annule_par = auth.uid(), motif_annulation = btrim(p_motif) where id = m.id;
end
$$;

-- Situation par emballage : chez nous, dû à chaque fournisseur, chez les clients, consignes gardées.
create function public.situation_emballages(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.lecture_autorisee(p_etablissement_id, 'stock.lire') or public.a_permission(p_etablissement_id, 'stock.emballages')) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'nom', e.nom, 'consigne', e.consigne, 'actif', e.actif,
      'chez_nous', coalesce((select sum(case m.type when 'recu_fournisseur' then m.quantite when 'rendu_client' then m.quantite
          when 'ajustement' then m.quantite else -m.quantite end)
        from public.emballages_mouvements m where m.emballage_id = e.id and m.annule_le is null), 0),
      'chez_clients', coalesce((select sum(case m.type when 'donne_client' then m.quantite else -m.quantite end)
        from public.emballages_mouvements m where m.emballage_id = e.id and m.annule_le is null and m.type in ('donne_client', 'rendu_client')), 0),
      'consignes_gardees', coalesce((select sum(case m.type when 'donne_client' then m.montant else -m.montant end)
        from public.emballages_mouvements m where m.emballage_id = e.id and m.annule_le is null and m.type in ('donne_client', 'rendu_client')), 0),
      'fournisseurs', coalesce((select jsonb_agg(jsonb_build_object('contact_id', f.contact_id, 'nom', c.nom, 'du', f.du) order by c.nom)
        from (select m.contact_id, sum(case m.type when 'recu_fournisseur' then m.quantite else -m.quantite end) du
              from public.emballages_mouvements m
              where m.emballage_id = e.id and m.annule_le is null and m.type in ('recu_fournisseur', 'rendu_fournisseur')
              group by m.contact_id) f
        join public.contacts c on c.id = f.contact_id where f.du <> 0), '[]'::jsonb),
      'clients', coalesce((select jsonb_agg(jsonb_build_object('contact_id', x.contact_id, 'nom', x.nom, 'quantite', x.q) order by x.nom)
        from (select m.contact_id, coalesce(m.nom_client, 'Client de passage') nom,
                sum(case m.type when 'donne_client' then m.quantite else -m.quantite end) q
              from public.emballages_mouvements m
              where m.emballage_id = e.id and m.annule_le is null and m.type in ('donne_client', 'rendu_client')
              group by m.contact_id, coalesce(m.nom_client, 'Client de passage')) x where x.q > 0), '[]'::jsonb)
    ) order by e.actif desc, e.ordre, e.nom)
    from public.emballages e where e.etablissement_id = p_etablissement_id
  ), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Fonctions : bouteilles en réserve
-- ---------------------------------------------------------------------------
-- p : { nom_client?, telephone?, contact_id?, libelle?, article_id?, unite?, quantite_initiale?, reste, vente_id?, photo?,
--       expire_le?, note? } ; renvoie { id, numero }.
create function public.mettre_bouteille_en_reserve(p_etablissement_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact public.contacts%rowtype;
  v_article public.articles%rowtype;
  v_nom text := nullif(btrim(coalesce(p ->> 'nom_client', '')), '');
  v_tel text := nullif(btrim(coalesce(p ->> 'telephone', '')), '');
  v_libelle text := nullif(btrim(coalesce(p ->> 'libelle', '')), '');
  v_unite text := coalesce(nullif(p ->> 'unite', ''), 'bouteille');
  v_reste numeric := nullif(p ->> 'reste', '')::numeric;
  v_initiale numeric := nullif(p ->> 'quantite_initiale', '')::numeric;
  v_vente uuid := nullif(p ->> 'vente_id', '')::uuid;
  v_expire date := nullif(p ->> 'expire_le', '')::date;
  v_photo text := nullif(p ->> 'photo', '');
  v_id uuid;
  v_numero text;
begin
  perform public.exiger_permission(p_etablissement_id, 'caisse.reserve');
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'Réserve invalide';
  end if;
  if nullif(p ->> 'contact_id', '') is not null then
    select * into v_contact from public.contacts where id = (p ->> 'contact_id')::uuid and etablissement_id = p_etablissement_id;
    if v_contact.id is null then
      raise exception 'Contact inconnu dans cet établissement';
    end if;
    v_nom := coalesce(v_nom, v_contact.nom);
    v_tel := coalesce(v_tel, v_contact.telephone);
  end if;
  if v_nom is null or length(v_nom) > 120 then
    raise exception 'Le nom du client est obligatoire';
  end if;
  if length(coalesce(v_tel, '')) > 40 then
    raise exception 'Téléphone trop long';
  end if;
  if nullif(p ->> 'article_id', '') is not null then
    select * into v_article from public.articles where id = (p ->> 'article_id')::uuid and etablissement_id = p_etablissement_id;
    if v_article.id is null then
      raise exception 'Article inconnu dans cet établissement';
    end if;
    v_libelle := coalesce(v_libelle, v_article.nom);
  end if;
  if v_libelle is null or length(v_libelle) > 120 then
    raise exception 'Indiquez la bouteille (ex. « Whisky 70 cl »)';
  end if;
  if v_unite not in ('bouteille', 'verre', 'cl') then
    raise exception 'Unité inconnue : bouteille, verre ou cl';
  end if;
  v_initiale := coalesce(v_initiale, case when v_unite = 'bouteille' then 1 else v_reste end);
  if v_reste is null or v_reste = 'NaN'::numeric or v_reste <= 0 or v_reste > 100000 then
    raise exception 'Indiquez ce qui reste dans la bouteille (plus que 0)';
  end if;
  if v_initiale is null or v_initiale = 'NaN'::numeric or v_initiale < v_reste or v_initiale > 100000 then
    raise exception 'Ce qui reste ne peut pas dépasser la bouteille entière';
  end if;
  if v_vente is not null and not exists (select 1 from public.ventes where id = v_vente and etablissement_id = p_etablissement_id) then
    raise exception 'Vente introuvable dans cet établissement';
  end if;
  if v_expire is not null and v_expire < public.date_locale(p_etablissement_id) then
    raise exception 'La date limite est déjà passée';
  end if;
  if v_photo is not null and (length(v_photo) > 400000 or v_photo !~ '^data:image/') then
    raise exception 'Photo invalide ou trop lourde';
  end if;
  if length(coalesce(p ->> 'note', '')) > 300 then
    raise exception 'Note trop longue (300 caractères)';
  end if;
  v_numero := public.prochain_numero(p_etablissement_id, 'reserve_bouteille', 'RB-');
  insert into public.reserves_bouteilles (etablissement_id, numero, contact_id, nom_client, telephone, article_id, libelle, unite,
    quantite_initiale, reste, vente_id, photo, expire_le, note, cree_par)
  values (p_etablissement_id, v_numero, v_contact.id, v_nom, v_tel, v_article.id, v_libelle, v_unite,
    v_initiale, v_reste, v_vente, v_photo, v_expire, nullif(btrim(p ->> 'note'), ''), auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'numero', v_numero);
end
$$;

-- Sert depuis la réserve : diminue le reste, sans nouvelle vente ; la bouteille vide passe « terminée ».
create function public.servir_depuis_reserve(p_reserve_id uuid, p_quantite numeric, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reserves_bouteilles%rowtype;
  v_reste numeric;
begin
  select * into r from public.reserves_bouteilles where id = p_reserve_id for update;
  if r.id is null then
    raise exception 'Bouteille en réserve introuvable';
  end if;
  perform public.exiger_permission(r.etablissement_id, 'caisse.reserve');
  if r.statut <> 'en_cours' then
    raise exception 'Cette bouteille est % : plus rien à servir', case r.statut when 'terminee' then 'terminée' else 'annulée' end;
  end if;
  if r.expire_le is not null and r.expire_le < public.date_locale(r.etablissement_id) then
    raise exception 'Cette réserve a expiré le % : voyez avec le responsable', to_char(r.expire_le, 'DD/MM/YYYY');
  end if;
  if p_quantite is null or p_quantite = 'NaN'::numeric or p_quantite <= 0 then
    raise exception 'Indiquez ce que vous servez (plus que 0)';
  end if;
  if p_quantite > r.reste then
    -- Nombres sans zéros inutiles : « 0,5 » et non « 0.500 ».
    raise exception 'Il ne reste que % : impossible de servir %',
      replace(rtrim(rtrim(r.reste::text, '0'), '.'), '.', ','), replace(rtrim(rtrim(round(p_quantite, 3)::text, '0'), '.'), '.', ',');
  end if;
  if length(coalesce(p_note, '')) > 300 then
    raise exception 'Note trop longue (300 caractères)';
  end if;
  insert into public.reserves_services (etablissement_id, reserve_id, quantite, note, servi_par)
  values (r.etablissement_id, r.id, p_quantite, nullif(btrim(p_note), ''), auth.uid());
  v_reste := r.reste - p_quantite;
  update public.reserves_bouteilles set reste = v_reste, statut = case when v_reste = 0 then 'terminee' else 'en_cours' end where id = r.id;
  return jsonb_build_object('reste', v_reste, 'terminee', v_reste = 0);
end
$$;

-- Service saisi par erreur : annulé avec motif, le reste revient dans la bouteille.
create function public.annuler_service_reserve(p_service_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.reserves_services%rowtype;
  r public.reserves_bouteilles%rowtype;
begin
  select * into s from public.reserves_services where id = p_service_id for update;
  if s.id is null then
    raise exception 'Service introuvable';
  end if;
  perform public.exiger_permission(s.etablissement_id, 'caisse.reserve_annuler');
  if s.annule_le is not null then
    raise exception 'Ce service est déjà annulé';
  end if;
  if coalesce(btrim(p_motif), '') = '' or length(btrim(p_motif)) > 300 then
    raise exception 'Le motif d''annulation est obligatoire';
  end if;
  select * into r from public.reserves_bouteilles where id = s.reserve_id for update;
  if r.statut = 'annulee' then
    raise exception 'La réserve est annulée : elle ne change plus';
  end if;
  update public.reserves_services set annule_le = now(), annule_par = auth.uid(), motif_annulation = btrim(p_motif) where id = s.id;
  update public.reserves_bouteilles set reste = least(quantite_initiale, reste + s.quantite), statut = 'en_cours' where id = r.id;
end
$$;

-- Réserve annulée (erreur, bouteille cassée, réserve expirée reprise) : le motif reste, l'historique aussi.
create function public.annuler_reserve_bouteille(p_reserve_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reserves_bouteilles%rowtype;
begin
  select * into r from public.reserves_bouteilles where id = p_reserve_id for update;
  if r.id is null then
    raise exception 'Bouteille en réserve introuvable';
  end if;
  perform public.exiger_permission(r.etablissement_id, 'caisse.reserve_annuler');
  if r.statut = 'annulee' then
    raise exception 'Cette réserve est déjà annulée';
  end if;
  if coalesce(btrim(p_motif), '') = '' or length(btrim(p_motif)) > 300 then
    raise exception 'Le motif d''annulation est obligatoire';
  end if;
  update public.reserves_bouteilles set statut = 'annulee', annulee_le = now(), annulee_par = auth.uid(), motif_annulation = btrim(p_motif)
  where id = r.id;
end
$$;

-- ---------------------------------------------------------------------------
-- 7. Tables VIP : minimum de consommation
-- ---------------------------------------------------------------------------
alter table public.rest_tables add column minimum_consommation numeric(14, 2)
  check (minimum_consommation is null or minimum_consommation between 1 and 9999999);
alter table public.rest_reservations add column minimum_consommation numeric(14, 2)
  check (minimum_consommation is null or minimum_consommation between 1 and 9999999);
alter table public.rest_commandes add column minimum_consommation numeric(14, 2)
  check (minimum_consommation is null or minimum_consommation between 1 and 9999999);
alter table public.rest_commandes add column minimum_leve_le timestamptz;
alter table public.rest_commandes add column minimum_leve_par uuid references auth.users(id) on delete restrict;
alter table public.rest_commandes add column minimum_motif text check (minimum_motif is null or length(minimum_motif) <= 300);
alter table public.rest_commandes add constraint rest_commandes_minimum_leve check ((minimum_leve_le is null) = (minimum_motif is null));

-- À l'ouverture, la commande reprend le minimum de la réservation arrivée sur cette table (prioritaire), sinon celui
-- de la table. Les fonctions d'ouverture existantes ne changent pas.
create function public.reprendre_minimum_commande()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.minimum_consommation is null and new.table_id is not null then
    new.minimum_consommation := coalesce(
      (select r.minimum_consommation from public.rest_reservations r
       where r.table_id = new.table_id and r.statut = 'arrivee' and r.minimum_consommation is not null
         and r.debut > now() - interval '1 day'
       order by r.debut desc limit 1),
      (select t.minimum_consommation from public.rest_tables t where t.id = new.table_id));
  end if;
  return new;
end
$$;
create trigger rest_commandes_minimum before insert on public.rest_commandes
  for each row execute function public.reprendre_minimum_commande();

-- Ce que la commande a consommé : additions déjà encaissées (montant réel avant remise globale) + plats non encaissés
-- au prix actuel (c'est ce prix que la caisse encaissera).
create function public.consommation_commande(p_commande_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select sum(v.sous_total) from public.ventes v
                   where v.statut <> 'annulee' and v.id in (select l.vente_id from public.rest_lignes l
                     where l.commande_id = p_commande_id and l.vente_id is not null and l.statut <> 'annulee')), 0)
       + coalesce((select sum(round(a.prix_vente * l.quantite, 2)) from public.rest_lignes l join public.articles a on a.id = l.article_id
                   where l.commande_id = p_commande_id and l.vente_id is null and l.statut <> 'annulee'), 0)
$$;

-- La base refuse de clore (dernière addition ou « Libérer la table ») une commande sous son minimum non levé.
-- L'erreur annule toute l'opération, vente comprise : rien n'est encaissé à moitié.
create function public.verifier_minimum_commande()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_consomme numeric;
begin
  if old.statut = 'ouverte' and new.statut = 'encaissee' and new.minimum_consommation is not null and new.minimum_leve_le is null then
    v_consomme := public.consommation_commande(new.id);
    if v_consomme < new.minimum_consommation then
      raise exception 'Minimum de consommation non atteint : encore % à consommer. Ajoutez le complément minimum ou demandez à un responsable de lever le minimum',
        replace(to_char(ceil(new.minimum_consommation - v_consomme), 'FM999,999,990'), ',', ' ');
    end if;
  end if;
  return new;
end
$$;
create trigger rest_commandes_verifier_minimum before update on public.rest_commandes
  for each row execute function public.verifier_minimum_commande();

-- Minimum d'une table (gérant) ; null = aucun minimum.
create function public.regler_minimum_table(p_table_id uuid, p_montant numeric)
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
  perform public.exiger_permission(t.etablissement_id, 'restaurant_salle.minimum');
  perform public.exiger_acces_hub(t.hub_id);
  if p_montant is not null and (p_montant = 'NaN'::numeric or p_montant < 1 or p_montant > 9999999) then
    raise exception 'Minimum invalide (de 1 à 9 999 999), ou vide pour aucun minimum';
  end if;
  update public.rest_tables set minimum_consommation = round(p_montant, 2) where id = t.id;
end
$$;

-- Minimum d'une réservation : noté par la personne qui réserve, tant que le client n'est pas arrivé.
create function public.regler_minimum_reservation(p_reservation_id uuid, p_montant numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rest_reservations%rowtype;
begin
  select * into r from public.rest_reservations where id = p_reservation_id for update;
  if r.id is null then
    raise exception 'Réservation introuvable';
  end if;
  perform public.exiger_permission(r.etablissement_id, 'restaurant_salle.servir');
  perform public.exiger_acces_hub(r.hub_id);
  if r.statut <> 'confirmee' then
    raise exception 'Réservation déjà traitée : réglez le minimum sur la commande de la table';
  end if;
  if p_montant is not null and (p_montant = 'NaN'::numeric or p_montant < 1 or p_montant > 9999999) then
    raise exception 'Minimum invalide (de 1 à 9 999 999), ou vide pour aucun minimum';
  end if;
  update public.rest_reservations set minimum_consommation = round(p_montant, 2) where id = r.id;
end
$$;

-- Changer le minimum d'une commande ouverte (responsable, motif gardé dans le journal d'audit par le trigger).
create function public.regler_minimum_commande(p_commande_id uuid, p_montant numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.rest_commandes%rowtype;
begin
  c := public.commande_restaurant_ouverte(p_commande_id, 'restaurant_salle.minimum');
  if p_montant is not null and (p_montant = 'NaN'::numeric or p_montant < 1 or p_montant > 9999999) then
    raise exception 'Minimum invalide (de 1 à 9 999 999), ou vide pour aucun minimum';
  end if;
  update public.rest_commandes set minimum_consommation = round(p_montant, 2) where id = c.id;
end
$$;

-- Lever le minimum (geste commercial) : responsable seulement, motif obligatoire, nom et heure gardés.
create function public.lever_minimum_commande(p_commande_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.rest_commandes%rowtype;
begin
  c := public.commande_restaurant_ouverte(p_commande_id, 'restaurant_salle.minimum');
  if c.minimum_consommation is null then
    raise exception 'Cette commande n''a pas de minimum';
  end if;
  if c.minimum_leve_le is not null then
    raise exception 'Le minimum est déjà levé';
  end if;
  if coalesce(btrim(p_motif), '') = '' or length(btrim(p_motif)) > 300 then
    raise exception 'Le motif est obligatoire pour lever le minimum';
  end if;
  update public.rest_commandes set minimum_leve_le = now(), minimum_leve_par = auth.uid(), minimum_motif = btrim(p_motif) where id = c.id;
end
$$;

-- Article technique « Complément minimum » de l'établissement : prix 1 (une unité de monnaie), sans stock, absent du
-- menu QR, indisponible à la commande ordinaire. La quantité de la ligne = le montant du complément.
create function public.article_complement_minimum(p_etablissement_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.articles where etablissement_id = p_etablissement_id and reference = 'COMPLEMENT-MINIMUM';
  if v_id is null then
    insert into public.articles (etablissement_id, reference, nom, description, prix_vente, unite, suivi_stock, disponible, visible_menu)
    values (p_etablissement_id, 'COMPLEMENT-MINIMUM', 'Complément minimum de consommation',
      'Ligne de montant ajoutée en salle quand une table VIP n''atteint pas son minimum (quantité = montant).', 1,
      coalesce((select devise from public.etablissements where id = p_etablissement_id), 'montant'), false, false, false)
    returning id into v_id;
  elsif not (select actif from public.articles where id = v_id) then
    update public.articles set actif = true where id = v_id;
  end if;
  return v_id;
end
$$;

-- Ajoute la ligne « Complément minimum » (montant manquant), servie d'office ; elle s'encaisse avec l'addition.
create function public.ajouter_complement_minimum(p_commande_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.rest_commandes%rowtype;
  v_reste numeric;
  v_article uuid;
  v_ligne uuid;
begin
  c := public.commande_restaurant_ouverte(p_commande_id, 'restaurant_salle.encaisser');
  if c.minimum_consommation is null then
    raise exception 'Cette commande n''a pas de minimum';
  end if;
  if c.minimum_leve_le is not null then
    raise exception 'Le minimum a été levé : aucun complément à ajouter';
  end if;
  v_reste := ceil(c.minimum_consommation - public.consommation_commande(c.id));
  if v_reste <= 0 then
    raise exception 'Le minimum est déjà atteint';
  end if;
  v_article := public.article_complement_minimum(c.etablissement_id);
  insert into public.rest_lignes (etablissement_id, commande_id, article_id, libelle, quantite, poste, statut, ajoutee_par, envoyee_le, servie_le)
  values (c.etablissement_id, c.id, v_article, 'Complément minimum de consommation', v_reste, 'aucun', 'servie', auth.uid(), now(), now())
  returning id into v_ligne;
  return jsonb_build_object('ligne_id', v_ligne, 'montant', v_reste);
end
$$;

-- ---------------------------------------------------------------------------
-- 8. Droits d'exécution
-- ---------------------------------------------------------------------------
do $$
declare signature text;
begin
  foreach signature in array array[
    'public.enregistrer_emballage(uuid, jsonb)',
    'public.noter_mouvement_emballage(uuid, jsonb)',
    'public.annuler_mouvement_emballage(uuid, text)',
    'public.situation_emballages(uuid)',
    'public.mettre_bouteille_en_reserve(uuid, jsonb)',
    'public.servir_depuis_reserve(uuid, numeric, text)',
    'public.annuler_service_reserve(uuid, text)',
    'public.annuler_reserve_bouteille(uuid, text)',
    'public.regler_minimum_table(uuid, numeric)',
    'public.regler_minimum_reservation(uuid, numeric)',
    'public.regler_minimum_commande(uuid, numeric)',
    'public.lever_minimum_commande(uuid, text)',
    'public.ajouter_complement_minimum(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
  -- Outils internes : appelés seulement par les fonctions et les triggers ci-dessus.
  foreach signature in array array[
    'public.reprendre_minimum_commande()',
    'public.verifier_minimum_commande()',
    'public.consommation_commande(uuid)',
    'public.article_complement_minimum(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', signature);
  end loop;
end
$$;

notify pgrst, 'reload schema';
