-- E-commerce (2026-10-03) : le module « ecommerce_boutique », jusqu'ici « Prévu », devient réel.
-- Boutique publique par adresse (#/boutique/<adresse>) : catalogue publié depuis les articles communs (variantes =
-- articles regroupés), panier, commande sans compte (nom, téléphone, livraison ou retrait), code promo, suivi par lien.
-- Côté établissement : la commande est confirmée (contrôle du stock du Hub de la boutique, vente d'origine « boutique »,
-- sortie de stock, contact créé), préparée, expédiée, livrée ; paiement par les paiements communs ; annulation ou
-- retour avec motif (stock remis, vente annulée). E-commerce → Commande → Paiement → Stock. Rien ne se supprime.
-- Le public n'accède qu'à des fonctions dédiées (jamais aux tables) et ne voit que ce qui est publié.

-- ---------------------------------------------------------------------------
-- 1. Catalogue et droits
-- ---------------------------------------------------------------------------
update public.modules set
  description = 'Boutique en ligne publique, variantes, panier, commandes, livraison ou retrait, codes promo, retours ; stock et ventes communs.',
  documentation = 'docs/ECOMMERCE.md'
where id = 'ecommerce_boutique';

insert into public.permissions (id, module_id, description) values
  ('ecommerce_boutique.lire', 'ecommerce_boutique', 'Voir la boutique et les commandes en ligne'),
  ('ecommerce_boutique.traiter', 'ecommerce_boutique', 'Confirmer, préparer, expédier, livrer les commandes'),
  ('ecommerce_boutique.annuler', 'ecommerce_boutique', 'Annuler une commande ou enregistrer un retour (motif)'),
  ('ecommerce_boutique.gerer', 'ecommerce_boutique', 'Configurer la boutique, publier les produits, gérer les codes promo')
on conflict (id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['gerant', 'responsable']) r
cross join unnest(array['ecommerce_boutique.lire', 'ecommerce_boutique.traiter', 'ecommerce_boutique.annuler', 'ecommerce_boutique.gerer']) p
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id) values
  ('responsable_hub', 'ecommerce_boutique.lire'), ('responsable_hub', 'ecommerce_boutique.traiter'), ('responsable_hub', 'ecommerce_boutique.annuler'),
  ('gestionnaire_depot', 'ecommerce_boutique.lire'), ('gestionnaire_depot', 'ecommerce_boutique.traiter'),
  ('employe', 'ecommerce_boutique.lire'), ('employe', 'ecommerce_boutique.traiter'),
  ('commercial', 'ecommerce_boutique.lire'), ('comptable', 'ecommerce_boutique.lire'), ('lecteur', 'ecommerce_boutique.lire')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
create table public.boutiques (
  etablissement_id uuid primary key references public.etablissements(id) on delete restrict,
  adresse text not null unique check (adresse ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  publiee boolean not null default false,
  hub_id uuid not null,
  titre text not null check (btrim(titre) <> '' and length(titre) <= 120),
  presentation text check (presentation is null or length(presentation) <= 2000),
  telephone text check (telephone is null or length(telephone) <= 40),
  whatsapp text check (whatsapp is null or length(whatsapp) <= 40),
  livraison boolean not null default true,
  frais_livraison numeric(14, 2) not null default 0 check (frais_livraison >= 0),
  zone_livraison text check (zone_livraison is null or length(zone_livraison) <= 300),
  retrait boolean not null default true,
  adresse_retrait text check (adresse_retrait is null or length(adresse_retrait) <= 300),
  minimum_commande numeric(14, 2) not null default 0 check (minimum_commande >= 0),
  paiement_instructions text check (paiement_instructions is null or length(paiement_instructions) <= 1000),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  check (livraison or retrait),
  foreign key (hub_id, etablissement_id) references public.hubs(id, etablissement_id) on delete restrict
);

create table public.boutique_articles (
  article_id uuid primary key references public.articles(id) on delete restrict,
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  publie boolean not null default true,
  groupe text check (groupe is null or (btrim(groupe) <> '' and length(groupe) <= 120)),
  variante text check (variante is null or (btrim(variante) <> '' and length(variante) <= 60)),
  description text check (description is null or length(description) <= 2000),
  ordre integer not null default 0,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  check ((groupe is null) = (variante is null))
);
create index boutique_articles_etablissement_idx on public.boutique_articles(etablissement_id) where publie;

create table public.boutique_coupons (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  code text not null check (code ~ '^[A-Z0-9-]{3,20}$'),
  type text not null check (type in ('pourcentage', 'montant')),
  valeur numeric(14, 2) not null check (valeur > 0),
  minimum numeric(14, 2) not null default 0 check (minimum >= 0),
  debut date,
  fin date,
  utilisations_max integer check (utilisations_max is null or utilisations_max > 0),
  utilisations integer not null default 0 check (utilisations >= 0),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (etablissement_id, code),
  check (type <> 'pourcentage' or valeur <= 100),
  check (fin is null or debut is null or fin >= debut)
);

create table public.boutique_commandes (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  hub_id uuid not null,
  numero text not null,
  suivi uuid not null default gen_random_uuid() unique,
  nom_client text not null check (btrim(nom_client) <> '' and length(nom_client) <= 120),
  telephone text not null check (length(regexp_replace(telephone, '[^0-9]', '', 'g')) between 6 and 20),
  email text check (email is null or (length(email) <= 160 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  mode_livraison text not null check (mode_livraison in ('livraison', 'retrait')),
  adresse_livraison text check (adresse_livraison is null or length(adresse_livraison) <= 500),
  note text check (note is null or length(note) <= 1000),
  coupon_id uuid references public.boutique_coupons(id) on delete restrict,
  sous_total numeric(14, 2) not null check (sous_total >= 0),
  remise numeric(14, 2) not null default 0 check (remise >= 0),
  frais_livraison numeric(14, 2) not null default 0 check (frais_livraison >= 0),
  total numeric(14, 2) not null check (total >= 0),
  statut text not null default 'nouvelle'
    check (statut in ('nouvelle', 'confirmee', 'preparee', 'expediee', 'livree', 'annulee', 'retournee')),
  contact_id uuid references public.contacts(id) on delete restrict,
  vente_id uuid references public.ventes(id) on delete restrict,
  motif text,
  traitee_par uuid references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  confirmee_le timestamptz,
  expediee_le timestamptz,
  livree_le timestamptz,
  cloturee_le timestamptz,
  modifie_le timestamptz not null default now(),
  unique (etablissement_id, numero),
  check (total = sous_total - remise + frais_livraison),
  check (mode_livraison <> 'livraison' or btrim(coalesce(adresse_livraison, '')) <> ''),
  check (statut in ('nouvelle', 'annulee') or vente_id is not null),
  check (statut not in ('annulee', 'retournee') or btrim(coalesce(motif, '')) <> ''),
  foreign key (hub_id, etablissement_id) references public.hubs(id, etablissement_id) on delete restrict
);
create index boutique_commandes_etablissement_idx on public.boutique_commandes(etablissement_id, statut, cree_le desc);
create index boutique_commandes_telephone_idx on public.boutique_commandes(etablissement_id, telephone, cree_le);

create table public.boutique_lignes (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null references public.boutique_commandes(id) on delete restrict,
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  article_id uuid not null references public.articles(id) on delete restrict,
  libelle text not null,
  quantite numeric(10, 3) not null check (quantite > 0),
  prix_unitaire numeric(14, 2) not null check (prix_unitaire >= 0),
  total numeric(14, 2) not null check (total >= 0)
);
create index boutique_lignes_commande_idx on public.boutique_lignes(commande_id);

do $$
declare
  nom_table text;
begin
  foreach nom_table in array array['boutiques', 'boutique_articles', 'boutique_coupons', 'boutique_commandes'] loop
    execute format('create trigger %I_modifie_le before update on public.%I for each row execute function public.fixer_modifie_le()', nom_table, nom_table);
  end loop;
  foreach nom_table in array array['boutiques', 'boutique_articles', 'boutique_coupons', 'boutique_commandes', 'boutique_lignes'] loop
    execute format('create trigger %I_sans_suppression before delete on public.%I for each row execute function public.refuser_suppression()', nom_table, nom_table);
    execute format('create trigger %I_verrou_etablissement before update on public.%I for each row execute function public.verrouiller_etablissement_id()', nom_table, nom_table);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.journaliser_modification()', nom_table, nom_table);
    execute format('alter table public.%I enable row level security', nom_table);
    execute format('create policy lecture on public.%I for select to authenticated using (public.lecture_autorisee(etablissement_id, ''ecommerce_boutique.lire''))', nom_table);
  end loop;
end
$$;
create trigger boutique_lignes_definitives before update on public.boutique_lignes
for each row execute function public.refuser_modification();

-- ---------------------------------------------------------------------------
-- 3. Fonctions de l'établissement
-- ---------------------------------------------------------------------------
-- p : { adresse, publiee?, hub_id?, titre, presentation?, telephone?, whatsapp?, livraison?, frais_livraison?, zone_livraison?,
--       retrait?, adresse_retrait?, minimum_commande?, paiement_instructions? }
create function public.enregistrer_boutique(p_etablissement_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hub public.hubs%rowtype;
  v_adresse text := lower(btrim(coalesce(p ->> 'adresse', '')));
begin
  perform public.exiger_permission(p_etablissement_id, 'ecommerce_boutique.gerer');
  if v_adresse !~ '^[a-z0-9][a-z0-9-]{2,39}$' then
    raise exception 'Adresse de boutique invalide : 3 à 40 lettres minuscules, chiffres ou tirets';
  end if;
  if exists (select 1 from public.boutiques where adresse = v_adresse and etablissement_id <> p_etablissement_id) then
    raise exception 'L''adresse « % » est déjà prise', v_adresse;
  end if;
  select * into v_hub from public.hubs
  where etablissement_id = p_etablissement_id
    and id = coalesce(nullif(p ->> 'hub_id', '')::uuid, (select b.hub_id from public.boutiques b where b.etablissement_id = p_etablissement_id),
                      (select h.id from public.hubs h where h.etablissement_id = p_etablissement_id and h.principal));
  if v_hub.id is null or not v_hub.actif or not v_hub.capacite_vente then
    raise exception 'Choisissez un Hub actif qui vend (le stock de la boutique en sort)';
  end if;
  if coalesce(btrim(p ->> 'titre'), '') = '' then
    raise exception 'Le nom affiché de la boutique est obligatoire';
  end if;
  if not coalesce((p ->> 'livraison')::boolean, true) and not coalesce((p ->> 'retrait')::boolean, true) then
    raise exception 'Proposez au moins la livraison ou le retrait';
  end if;
  insert into public.boutiques (etablissement_id, adresse, publiee, hub_id, titre, presentation, telephone, whatsapp, livraison, frais_livraison,
    zone_livraison, retrait, adresse_retrait, minimum_commande, paiement_instructions)
  values (p_etablissement_id, v_adresse, coalesce((p ->> 'publiee')::boolean, false), v_hub.id, btrim(p ->> 'titre'),
    nullif(btrim(p ->> 'presentation'), ''), nullif(btrim(p ->> 'telephone'), ''), nullif(btrim(p ->> 'whatsapp'), ''),
    coalesce((p ->> 'livraison')::boolean, true), coalesce(nullif(p ->> 'frais_livraison', '')::numeric, 0),
    nullif(btrim(p ->> 'zone_livraison'), ''), coalesce((p ->> 'retrait')::boolean, true), nullif(btrim(p ->> 'adresse_retrait'), ''),
    coalesce(nullif(p ->> 'minimum_commande', '')::numeric, 0), nullif(btrim(p ->> 'paiement_instructions'), ''))
  on conflict (etablissement_id) do update set adresse = excluded.adresse, publiee = excluded.publiee, hub_id = excluded.hub_id,
    titre = excluded.titre, presentation = excluded.presentation, telephone = excluded.telephone, whatsapp = excluded.whatsapp,
    livraison = excluded.livraison, frais_livraison = excluded.frais_livraison, zone_livraison = excluded.zone_livraison,
    retrait = excluded.retrait, adresse_retrait = excluded.adresse_retrait, minimum_commande = excluded.minimum_commande,
    paiement_instructions = excluded.paiement_instructions;
end
$$;

-- Publication d'un article : p { publie?, groupe?, variante?, description?, ordre? } (groupe + variante = variantes d'un produit).
create function public.publier_article_boutique(p_article_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.articles%rowtype;
begin
  select * into a from public.articles where id = p_article_id;
  if a.id is null then
    raise exception 'Article introuvable';
  end if;
  perform public.exiger_permission(a.etablissement_id, 'ecommerce_boutique.gerer');
  if (nullif(btrim(p ->> 'groupe'), '') is null) <> (nullif(btrim(p ->> 'variante'), '') is null) then
    raise exception 'Une variante a un produit (groupe) et un nom de variante (taille, couleur…)';
  end if;
  insert into public.boutique_articles (article_id, etablissement_id, publie, groupe, variante, description, ordre)
  values (a.id, a.etablissement_id, coalesce((p ->> 'publie')::boolean, true), nullif(btrim(p ->> 'groupe'), ''), nullif(btrim(p ->> 'variante'), ''),
    nullif(btrim(p ->> 'description'), ''), coalesce(nullif(p ->> 'ordre', '')::integer, 0))
  on conflict (article_id) do update set publie = excluded.publie, groupe = excluded.groupe, variante = excluded.variante,
    description = excluded.description, ordre = excluded.ordre;
end
$$;

-- p : { id?, code, type, valeur, minimum?, debut?, fin?, utilisations_max?, actif? }
create function public.enregistrer_coupon_boutique(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p ->> 'id', '')::uuid;
  v_code text := upper(btrim(coalesce(p ->> 'code', '')));
begin
  perform public.exiger_permission(p_etablissement_id, 'ecommerce_boutique.gerer');
  if v_code !~ '^[A-Z0-9-]{3,20}$' then
    raise exception 'Code promo invalide : 3 à 20 lettres, chiffres ou tirets';
  end if;
  if exists (select 1 from public.boutique_coupons where etablissement_id = p_etablissement_id and code = v_code and id is distinct from resultat) then
    raise exception 'Le code % existe déjà', v_code;
  end if;
  if resultat is null then
    insert into public.boutique_coupons (etablissement_id, code, type, valeur, minimum, debut, fin, utilisations_max, actif)
    values (p_etablissement_id, v_code, p ->> 'type', nullif(p ->> 'valeur', '')::numeric, coalesce(nullif(p ->> 'minimum', '')::numeric, 0),
      nullif(p ->> 'debut', '')::date, nullif(p ->> 'fin', '')::date, nullif(p ->> 'utilisations_max', '')::integer, coalesce((p ->> 'actif')::boolean, true))
    returning id into resultat;
  else
    update public.boutique_coupons set code = v_code, type = p ->> 'type', valeur = nullif(p ->> 'valeur', '')::numeric,
      minimum = coalesce(nullif(p ->> 'minimum', '')::numeric, 0), debut = nullif(p ->> 'debut', '')::date, fin = nullif(p ->> 'fin', '')::date,
      utilisations_max = nullif(p ->> 'utilisations_max', '')::integer, actif = coalesce((p ->> 'actif')::boolean, true)
    where id = resultat and etablissement_id = p_etablissement_id;
    if not found then
      raise exception 'Code promo introuvable';
    end if;
  end if;
  return resultat;
end
$$;

-- Remise d'un code promo pour un sous-total (0 si absent). Lève une erreur explicite si le code n'est pas valable.
create function public.remise_coupon_boutique(p_etablissement_id uuid, p_code text, p_sous_total numeric, p_verrou boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.boutique_coupons%rowtype;
  jour date := public.date_locale(p_etablissement_id);
begin
  if coalesce(btrim(p_code), '') = '' then
    return jsonb_build_object('coupon_id', null, 'remise', 0);
  end if;
  if p_verrou then
    select * into c from public.boutique_coupons where etablissement_id = p_etablissement_id and code = upper(btrim(p_code)) for update;
  else
    select * into c from public.boutique_coupons where etablissement_id = p_etablissement_id and code = upper(btrim(p_code));
  end if;
  if c.id is null or not c.actif or (c.debut is not null and jour < c.debut) or (c.fin is not null and jour > c.fin)
     or (c.utilisations_max is not null and c.utilisations >= c.utilisations_max) then
    raise exception 'Code promo inconnu ou expiré';
  end if;
  if p_sous_total < c.minimum then
    raise exception 'Ce code demande un panier d''au moins %', c.minimum;
  end if;
  return jsonb_build_object('coupon_id', c.id, 'code', c.code,
    'remise', least(p_sous_total, case when c.type = 'pourcentage' then round(p_sous_total * c.valeur / 100) else c.valeur end));
end
$$;

-- Confirmation : stock contrôlé dans le Hub de la boutique, contact créé (ou retrouvé par téléphone), vente « boutique »,
-- sortie de stock. Les prix restent ceux de la commande (ceux affichés au client).
create function public.confirmer_commande_boutique(p_commande_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.boutique_commandes%rowtype;
  hub public.hubs%rowtype;
  besoin record;
  l record;
  a public.articles%rowtype;
  stock_negatif boolean;
  disponible numeric;
  v_contact uuid;
  v_vente uuid;
  v_numero text;
begin
  select * into c from public.boutique_commandes where id = p_commande_id for update;
  if c.id is null then
    raise exception 'Commande introuvable';
  end if;
  perform public.exiger_permission(c.etablissement_id, 'ecommerce_boutique.traiter');
  perform public.exiger_acces_hub(c.hub_id);
  if c.statut <> 'nouvelle' then
    raise exception 'Cette commande est déjà traitée';
  end if;
  select * into hub from public.hubs where id = c.hub_id;
  select coalesce((data ->> 'stock_negatif')::boolean, false) into stock_negatif
  from public.etablissement_parametres where etablissement_id = c.etablissement_id and module_id = 'caisse';
  stock_negatif := coalesce(stock_negatif, false);
  for besoin in select article_id, sum(quantite) quantite from public.boutique_lignes where commande_id = c.id group by 1 order by 1 loop
    select * into a from public.articles where id = besoin.article_id for update;
    if a.suivi_stock and not stock_negatif then
      disponible := public.stock_hub(hub.id, a.id);
      if disponible < besoin.quantite then
        raise exception 'Stock insuffisant pour « % » dans % (disponible : %)', a.nom, hub.nom, disponible;
      end if;
    end if;
  end loop;
  select id into v_contact from public.contacts
  where etablissement_id = c.etablissement_id and type <> 'fournisseur'
    and regexp_replace(coalesce(telephone, ''), '[^0-9]', '', 'g') = regexp_replace(c.telephone, '[^0-9]', '', 'g')
  order by cree_le limit 1;
  if v_contact is null then
    insert into public.contacts (etablissement_id, type, nom, telephone, email, adresse)
    values (c.etablissement_id, 'client', c.nom_client, c.telephone, c.email, c.adresse_livraison)
    returning id into v_contact;
  end if;
  v_numero := public.prochain_numero(c.etablissement_id, 'vente', 'V-');
  insert into public.ventes (etablissement_id, hub_id, numero, contact_id, sous_total, remise, total, montant_paye, statut_paiement, note, vendeur, origine)
  values (c.etablissement_id, hub.id, v_numero, v_contact, c.sous_total + c.frais_livraison, c.remise, c.total, 0,
    case when c.total = 0 then 'payee' else 'impayee' end, 'Boutique en ligne ' || c.numero, auth.uid(), 'boutique')
  returning id into v_vente;
  for l in select * from public.boutique_lignes where commande_id = c.id order by libelle loop
    select * into a from public.articles where id = l.article_id;
    insert into public.lignes_vente (vente_id, etablissement_id, article_id, libelle, quantite, prix_unitaire, remise, total, cout_unitaire)
    values (v_vente, c.etablissement_id, a.id, l.libelle, l.quantite, l.prix_unitaire, 0, l.total, a.cout_achat);
    if a.suivi_stock then
      insert into public.mouvements_stock (etablissement_id, hub_id, article_id, type, quantite, cout_unitaire, motif, vente_id, acteur)
      values (c.etablissement_id, hub.id, a.id, 'sortie_vente', -l.quantite, a.cout_achat, 'Boutique en ligne ' || c.numero, v_vente, auth.uid());
    end if;
  end loop;
  if c.frais_livraison > 0 then
    insert into public.lignes_vente (vente_id, etablissement_id, article_id, libelle, quantite, prix_unitaire, remise, total, cout_unitaire)
    values (v_vente, c.etablissement_id, null, 'Livraison', 1, c.frais_livraison, 0, c.frais_livraison, null);
  end if;
  update public.boutique_commandes set statut = 'confirmee', confirmee_le = now(), contact_id = v_contact, vente_id = v_vente, traitee_par = auth.uid()
  where id = c.id;
  return v_vente;
end
$$;

-- Préparée → expédiée (livraison) → livrée ; le retrait passe de « préparée » à « livrée ».
create function public.avancer_commande_boutique(p_commande_id uuid, p_statut text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.boutique_commandes%rowtype;
begin
  select * into c from public.boutique_commandes where id = p_commande_id for update;
  if c.id is null then
    raise exception 'Commande introuvable';
  end if;
  perform public.exiger_permission(c.etablissement_id, 'ecommerce_boutique.traiter');
  perform public.exiger_acces_hub(c.hub_id);
  if p_statut = 'preparee' and c.statut = 'confirmee' then
    update public.boutique_commandes set statut = 'preparee' where id = c.id;
  elsif p_statut = 'expediee' and c.statut = 'preparee' and c.mode_livraison = 'livraison' then
    update public.boutique_commandes set statut = 'expediee', expediee_le = now() where id = c.id;
  elsif p_statut = 'livree' and (c.statut = 'expediee' or (c.statut = 'preparee' and c.mode_livraison = 'retrait')) then
    update public.boutique_commandes set statut = 'livree', livree_le = now(), cloturee_le = now() where id = c.id;
  else
    raise exception 'Passage impossible de « % » à « % »', c.statut, p_statut;
  end if;
end
$$;

-- Annulation (avant livraison) ou retour (après livraison) : motif, stock remis dans le Hub, vente et paiements annulés.
-- Un paiement rattaché à une caisse clôturée bloque (le remboursement se fait alors hors plateforme puis par dépense).
create function public.annuler_commande_boutique(p_commande_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.boutique_commandes%rowtype;
  v public.ventes%rowtype;
begin
  select * into c from public.boutique_commandes where id = p_commande_id for update;
  if c.id is null then
    raise exception 'Commande introuvable';
  end if;
  perform public.exiger_permission(c.etablissement_id, 'ecommerce_boutique.annuler');
  perform public.exiger_acces_hub(c.hub_id);
  if c.statut in ('annulee', 'retournee') then
    raise exception 'Cette commande est déjà close';
  end if;
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Le motif est obligatoire';
  end if;
  if c.vente_id is not null then
    select * into v from public.ventes where id = c.vente_id for update;
    if exists (
      select 1 from public.paiements p join public.sessions_caisse s on s.id = p.session_caisse_id
      where p.vente_id = v.id and p.statut = 'valide' and s.statut <> 'ouverte'
    ) then
      raise exception 'Un paiement de cette commande est dans une caisse clôturée : remboursez par une dépense puis annulez le paiement';
    end if;
    insert into public.mouvements_stock (etablissement_id, hub_id, article_id, type, quantite, cout_unitaire, motif, vente_id, acteur)
    select v.etablissement_id, m.hub_id, m.article_id, 'retour_annulation', -m.quantite, m.cout_unitaire,
      case when c.statut = 'livree' then 'Retour ' else 'Annulation ' end || c.numero, v.id, auth.uid()
    from public.mouvements_stock m where m.vente_id = v.id and m.type = 'sortie_vente';
    update public.paiements set statut = 'annule', annule_le = now(), annule_par = auth.uid(),
      motif_annulation = 'Commande en ligne ' || c.numero || ' : ' || btrim(p_motif)
    where vente_id = v.id and statut = 'valide';
    update public.ventes set statut = 'annulee', annulee_le = now(), annulee_par = auth.uid(), motif_annulation = btrim(p_motif),
      montant_paye = 0, statut_paiement = 'impayee'
    where id = v.id;
  end if;
  if c.coupon_id is not null then
    update public.boutique_coupons set utilisations = greatest(utilisations - 1, 0) where id = c.coupon_id;
  end if;
  update public.boutique_commandes set statut = case when c.statut = 'livree' then 'retournee' else 'annulee' end,
    motif = btrim(p_motif), cloturee_le = now(), traitee_par = auth.uid()
  where id = c.id;
end
$$;

create function public.tableau_de_bord_boutique(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  jour date := public.date_locale(p_etablissement_id);
begin
  if not public.lecture_autorisee(p_etablissement_id, 'ecommerce_boutique.lire') then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'publiee', coalesce((select publiee from public.boutiques where etablissement_id = p_etablissement_id), false),
    'adresse', (select adresse from public.boutiques where etablissement_id = p_etablissement_id),
    'nouvelles', (select count(*) from public.boutique_commandes where etablissement_id = p_etablissement_id and statut = 'nouvelle'),
    'a_preparer', (select count(*) from public.boutique_commandes where etablissement_id = p_etablissement_id and statut = 'confirmee'),
    'a_livrer', (select count(*) from public.boutique_commandes where etablissement_id = p_etablissement_id and statut in ('preparee', 'expediee')),
    'chiffre_mois', (select coalesce(sum(total), 0) from public.boutique_commandes where etablissement_id = p_etablissement_id
      and statut in ('confirmee', 'preparee', 'expediee', 'livree') and date_trunc('month', confirmee_le) = date_trunc('month', jour::timestamp)),
    'commandes_mois', (select count(*) from public.boutique_commandes where etablissement_id = p_etablissement_id
      and date_trunc('month', cree_le) = date_trunc('month', jour::timestamp)),
    'retours_mois', (select count(*) from public.boutique_commandes where etablissement_id = p_etablissement_id and statut = 'retournee'
      and date_trunc('month', cloturee_le) = date_trunc('month', jour::timestamp)),
    'produits_publies', (select count(*) from public.boutique_articles b join public.articles a on a.id = b.article_id
      where b.etablissement_id = p_etablissement_id and b.publie and a.actif)
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Fonctions publiques (visiteur anonyme) : seulement ce qui est publié, jamais les tables
-- ---------------------------------------------------------------------------
-- Boutique publiée, établissement et module actifs, licence couvrant le module.
create function public.boutique_ouverte(p_adresse text)
returns public.boutiques
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b public.boutiques%rowtype;
begin
  select * into b from public.boutiques where adresse = lower(btrim(coalesce(p_adresse, ''))) and publiee;
  if b.etablissement_id is null or not public.module_actif(b.etablissement_id, 'ecommerce_boutique') then
    raise exception 'Boutique introuvable ou fermée';
  end if;
  return b;
end
$$;

create function public.boutique_publique(p_adresse text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b public.boutiques%rowtype;
begin
  b := public.boutique_ouverte(p_adresse);
  return jsonb_build_object(
    'adresse', b.adresse, 'titre', b.titre, 'presentation', b.presentation, 'telephone', b.telephone, 'whatsapp', b.whatsapp,
    'livraison', b.livraison, 'frais_livraison', b.frais_livraison, 'zone_livraison', b.zone_livraison,
    'retrait', b.retrait, 'adresse_retrait', b.adresse_retrait, 'minimum_commande', b.minimum_commande,
    'paiement_instructions', b.paiement_instructions,
    'devise', coalesce((select e.devise from public.etablissements e where e.id = b.etablissement_id), 'XAF'),
    'logo', (select i.logo_url from public.etablissement_identite i where i.etablissement_id = b.etablissement_id),
    'couleur', (select i.couleur_principale from public.etablissement_identite i where i.etablissement_id = b.etablissement_id),
    'produits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'article_id', a.id, 'nom', a.nom, 'prix', a.prix_vente, 'photo', a.photo, 'unite', a.unite,
        'description', coalesce(ba.description, a.description), 'groupe', ba.groupe, 'variante', ba.variante,
        'categorie', (select c.nom from public.categories_articles c where c.id = a.categorie_id),
        'disponible', not a.suivi_stock or public.stock_hub(b.hub_id, a.id) > 0
      ) order by ba.ordre, coalesce(ba.groupe, a.nom), ba.variante)
      from public.boutique_articles ba join public.articles a on a.id = ba.article_id
      where ba.etablissement_id = b.etablissement_id and ba.publie and a.actif), '[]'::jsonb)
  );
end
$$;

create function public.verifier_coupon_boutique(p_adresse text, p_code text, p_sous_total numeric)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b public.boutiques%rowtype;
begin
  b := public.boutique_ouverte(p_adresse);
  if p_sous_total is null or p_sous_total = 'NaN'::numeric or p_sous_total < 0 then
    raise exception 'Panier invalide';
  end if;
  return public.remise_coupon_boutique(b.etablissement_id, p_code, p_sous_total) - 'coupon_id';
end
$$;

-- Commande d'un visiteur. p : { nom_client, telephone, email?, mode_livraison, adresse_livraison?, note?, code_promo?,
-- lignes: [{ article_id, quantite }] }. Prix et remise recalculés ici ; limites anti-abus par téléphone et par boutique.
create function public.commander_boutique(p_adresse text, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.boutiques%rowtype;
  ligne jsonb;
  a public.articles%rowtype;
  quantite numeric;
  sous_total numeric := 0;
  v_remise jsonb;
  v_frais numeric := 0;
  v_mode text := p ->> 'mode_livraison';
  v_tel text := btrim(coalesce(p ->> 'telephone', ''));
  resultat public.boutique_commandes%rowtype;
begin
  b := public.boutique_ouverte(p_adresse);
  if coalesce(btrim(p ->> 'nom_client'), '') = '' or length(p ->> 'nom_client') > 120 then
    raise exception 'Indiquez votre nom';
  end if;
  if length(regexp_replace(v_tel, '[^0-9]', '', 'g')) not between 6 and 20 then
    raise exception 'Indiquez un numéro de téléphone valide';
  end if;
  if v_mode is null or v_mode not in ('livraison', 'retrait') or (v_mode = 'livraison' and not b.livraison) or (v_mode = 'retrait' and not b.retrait) then
    raise exception 'Mode de remise non proposé par cette boutique';
  end if;
  if v_mode = 'livraison' and coalesce(btrim(p ->> 'adresse_livraison'), '') = '' then
    raise exception 'Indiquez l''adresse de livraison';
  end if;
  -- Anti-abus : 5 commandes en attente par téléphone et par jour, 60 commandes nouvelles par heure et par boutique.
  if (select count(*) from public.boutique_commandes where etablissement_id = b.etablissement_id and statut = 'nouvelle'
      and regexp_replace(telephone, '[^0-9]', '', 'g') = regexp_replace(v_tel, '[^0-9]', '', 'g') and cree_le > now() - interval '1 day') >= 5 then
    raise exception 'Trop de commandes en attente pour ce numéro : la boutique va vous rappeler';
  end if;
  if (select count(*) from public.boutique_commandes where etablissement_id = b.etablissement_id and cree_le > now() - interval '1 hour') >= 60 then
    raise exception 'La boutique reçoit beaucoup de commandes : réessayez dans quelques minutes';
  end if;
  if jsonb_typeof(p -> 'lignes') is distinct from 'array' or jsonb_array_length(p -> 'lignes') = 0 then
    raise exception 'Votre panier est vide';
  end if;
  if jsonb_array_length(p -> 'lignes') > 50 then
    raise exception 'Panier trop grand (50 produits au plus)';
  end if;
  for ligne in select * from jsonb_array_elements(p -> 'lignes') loop
    quantite := nullif(ligne ->> 'quantite', '')::numeric;
    if quantite is null or quantite = 'NaN'::numeric or quantite <= 0 or quantite > 100 or quantite <> trunc(quantite) then
      raise exception 'Quantité invalide';
    end if;
    select a2.* into a from public.articles a2 join public.boutique_articles ba on ba.article_id = a2.id
    where a2.id = nullif(ligne ->> 'article_id', '')::uuid and ba.etablissement_id = b.etablissement_id and ba.publie and a2.actif;
    if a.id is null then
      raise exception 'Un produit du panier n''est plus disponible';
    end if;
    if a.suivi_stock and public.stock_hub(b.hub_id, a.id) < quantite then
      raise exception 'Stock insuffisant pour « % »', a.nom;
    end if;
    sous_total := sous_total + round(a.prix_vente * quantite, 2);
  end loop;
  if sous_total < b.minimum_commande then
    raise exception 'Commande minimum : %', b.minimum_commande;
  end if;
  v_remise := public.remise_coupon_boutique(b.etablissement_id, p ->> 'code_promo', sous_total, true);
  if v_mode = 'livraison' then
    v_frais := b.frais_livraison;
  end if;
  insert into public.boutique_commandes (etablissement_id, hub_id, numero, nom_client, telephone, email, mode_livraison, adresse_livraison,
    note, coupon_id, sous_total, remise, frais_livraison, total)
  values (b.etablissement_id, b.hub_id, public.prochain_numero(b.etablissement_id, 'commande_boutique', 'CW-'), btrim(p ->> 'nom_client'), v_tel,
    nullif(lower(btrim(p ->> 'email')), ''), v_mode, case when v_mode = 'livraison' then btrim(p ->> 'adresse_livraison') end,
    nullif(left(btrim(coalesce(p ->> 'note', '')), 1000), ''), nullif(v_remise ->> 'coupon_id', '')::uuid, sous_total,
    (v_remise ->> 'remise')::numeric, v_frais, sous_total - (v_remise ->> 'remise')::numeric + v_frais)
  returning * into resultat;
  insert into public.boutique_lignes (commande_id, etablissement_id, article_id, libelle, quantite, prix_unitaire, total)
  select resultat.id, b.etablissement_id, a2.id,
    a2.nom || coalesce(' · ' || ba.variante, ''), (l ->> 'quantite')::numeric, a2.prix_vente, round(a2.prix_vente * (l ->> 'quantite')::numeric, 2)
  from jsonb_array_elements(p -> 'lignes') l
  join public.articles a2 on a2.id = (l ->> 'article_id')::uuid
  join public.boutique_articles ba on ba.article_id = a2.id;
  if resultat.coupon_id is not null then
    update public.boutique_coupons set utilisations = utilisations + 1 where id = resultat.coupon_id;
  end if;
  perform public.notifier_permission(b.etablissement_id, 'ecommerce_boutique.traiter', 'boutique.commande',
    'Nouvelle commande en ligne ' || resultat.numero, resultat.nom_client || ' · ' || resultat.total, 'boutique/' || resultat.id);
  return jsonb_build_object('numero', resultat.numero, 'suivi', resultat.suivi, 'total', resultat.total);
end
$$;

-- Suivi par le lien reçu (identifiant aléatoire) : statut et contenu, sans aucune autre donnée de l'établissement.
create function public.suivi_commande_boutique(p_suivi uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.boutique_commandes%rowtype;
begin
  select * into c from public.boutique_commandes where suivi = p_suivi;
  if c.id is null then
    raise exception 'Commande introuvable';
  end if;
  return jsonb_build_object('numero', c.numero, 'statut', c.statut, 'total', c.total, 'mode_livraison', c.mode_livraison,
    'cree_le', c.cree_le, 'boutique', (select titre from public.boutiques where etablissement_id = c.etablissement_id),
    'lignes', (select jsonb_agg(jsonb_build_object('libelle', l.libelle, 'quantite', l.quantite, 'total', l.total) order by l.libelle)
      from public.boutique_lignes l where l.commande_id = c.id));
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Disponibilité, solution « E-commerce », droits d'exécution
-- ---------------------------------------------------------------------------
alter table public.ventes drop constraint if exists ventes_origine_check;
alter table public.ventes add constraint ventes_origine_check
  check (origine in ('caisse', 'facture', 'boutique', 'restaurant', 'hotel', 'abonnement'));

update public.modules set statut = 'actif', version = '1.0' where id = 'ecommerce_boutique';
insert into public.solution_modules (solution_id, module_id, par_defaut) values
  ('ecommerce', 'recus', false), ('ecommerce', 'caisse', false), ('ecommerce', 'cloture', false), ('ecommerce', 'depenses', false),
  ('ecommerce', 'facturation', false), ('ecommerce', 'achats', false), ('ecommerce', 'crm_pipeline', false), ('ecommerce', 'documents', false),
  ('restaurant', 'ecommerce_boutique', false)
on conflict (solution_id, module_id) do nothing;
update public.solution_modules set par_defaut = true where solution_id = 'ecommerce'
  and module_id in ('etablissement', 'membres', 'tableau_de_bord', 'articles', 'stock', 'ventes', 'paiements', 'contacts', 'ecommerce_boutique');
update public.solutions set statut = 'active',
  description = 'Vente en ligne : boutique publique, variantes, commandes, livraison ou retrait, codes promo, retours ; stock et paiements communs.'
where id = 'ecommerce' and statut in ('future', 'en_preparation');
insert into public.offres (id, solution_id, nom, description, modules, offre_essai, actif, ordre) values
  ('ecommerce-complet', 'ecommerce', 'E-commerce Complet',
   'Boutique en ligne, commandes, livraison, codes promo, retours, articles, stock, ventes, paiements, contacts, caisse et reçus.',
   array['articles', 'stock', 'ventes', 'paiements', 'contacts', 'ecommerce_boutique', 'caisse', 'recus', 'cloture'], true, true, 40)
on conflict (id) do nothing;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.enregistrer_boutique(uuid, jsonb)',
    'public.publier_article_boutique(uuid, jsonb)',
    'public.enregistrer_coupon_boutique(uuid, jsonb)',
    'public.confirmer_commande_boutique(uuid)',
    'public.avancer_commande_boutique(uuid, text)',
    'public.annuler_commande_boutique(uuid, text)',
    'public.tableau_de_bord_boutique(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
  -- Fonctions publiques : le visiteur (anon) comme l'utilisateur connecté.
  foreach signature in array array[
    'public.boutique_publique(text)',
    'public.verifier_coupon_boutique(text, text, numeric)',
    'public.commander_boutique(text, jsonb)',
    'public.suivi_commande_boutique(uuid)'
  ] loop
    execute format('revoke execute on function %s from public', signature);
    execute format('grant execute on function %s to anon, authenticated', signature);
  end loop;
  foreach signature in array array['public.boutique_ouverte(text)', 'public.remise_coupon_boutique(uuid, text, numeric, boolean)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', signature);
  end loop;
end
$$;
