-- Lot 2 : tables de la Solution Commerce.
-- Règles : toute ligne porte etablissement_id ; aucune écriture directe pour `authenticated`
-- (lecture seule par RLS) ; toutes les écritures passent par les fonctions de
-- 20261002000004_commerce_fonctions.sql, qui vérifient permissions, modules et statut.

-- Articles -----------------------------------------------------------------
create table public.categories_articles (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  nom text not null check (btrim(nom) <> ''),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  unique (etablissement_id, nom)
);
create index categories_articles_etablissement_id_idx on public.categories_articles(etablissement_id);

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  reference text,
  code_barres text,
  nom text not null check (btrim(nom) <> ''),
  description text,
  categorie_id uuid references public.categories_articles(id) on delete restrict,
  prix_vente numeric(14, 2) not null check (prix_vente >= 0),
  cout_achat numeric(14, 2) check (cout_achat >= 0),
  unite text not null default 'unité',
  suivi_stock boolean not null default true,
  stock_minimum numeric(14, 3) not null default 0 check (stock_minimum >= 0),
  photo text check (photo is null or length(photo) <= 400000),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
create unique index articles_reference_unique on public.articles(etablissement_id, reference) where reference is not null;
create unique index articles_code_barres_unique on public.articles(etablissement_id, code_barres) where code_barres is not null;
create index articles_etablissement_id_idx on public.articles(etablissement_id);
create index articles_categorie_id_idx on public.articles(categorie_id);
create trigger articles_modifie_le before update on public.articles
for each row execute function public.fixer_modifie_le();

-- Contacts (acheteurs et fournisseurs d'un établissement, jamais des « clients ») ---
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  type text not null default 'client' check (type in ('client', 'fournisseur', 'les_deux')),
  nom text not null check (btrim(nom) <> ''),
  telephone text,
  email text,
  adresse text,
  notes text,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
create index contacts_etablissement_id_idx on public.contacts(etablissement_id);
create trigger contacts_modifie_le before update on public.contacts
for each row execute function public.fixer_modifie_le();

-- Caisse -------------------------------------------------------------------
create table public.sessions_caisse (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  point_de_vente_id uuid not null references public.points_de_vente(id) on delete restrict,
  statut text not null default 'ouverte' check (statut in ('ouverte', 'cloturee')),
  fond_initial numeric(14, 2) not null default 0 check (fond_initial >= 0),
  ouverte_par uuid not null references auth.users(id) on delete restrict,
  ouverte_le timestamptz not null default now(),
  cloturee_le timestamptz
);
create unique index sessions_caisse_une_ouverte on public.sessions_caisse(point_de_vente_id) where statut = 'ouverte';
create index sessions_caisse_etablissement_id_idx on public.sessions_caisse(etablissement_id);

-- Ventes -------------------------------------------------------------------
create table public.ventes (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  numero text not null,
  session_caisse_id uuid references public.sessions_caisse(id) on delete restrict,
  point_de_vente_id uuid references public.points_de_vente(id) on delete restrict,
  contact_id uuid references public.contacts(id) on delete restrict,
  statut text not null default 'validee' check (statut in ('validee', 'annulee')),
  sous_total numeric(14, 2) not null check (sous_total >= 0),
  remise numeric(14, 2) not null default 0 check (remise >= 0),
  total numeric(14, 2) not null check (total >= 0),
  montant_paye numeric(14, 2) not null default 0 check (montant_paye >= 0),
  statut_paiement text not null check (statut_paiement in ('payee', 'partielle', 'impayee')),
  note text,
  vendeur uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  annulee_le timestamptz,
  annulee_par uuid references auth.users(id) on delete restrict,
  motif_annulation text,
  unique (etablissement_id, numero),
  check (total = sous_total - remise),
  check (montant_paye <= total),
  check (statut = 'validee' or (annulee_le is not null and annulee_par is not null and btrim(coalesce(motif_annulation, '')) <> ''))
);
create index ventes_etablissement_cree_le_idx on public.ventes(etablissement_id, cree_le desc);
create index ventes_session_caisse_id_idx on public.ventes(session_caisse_id);
create index ventes_contact_id_idx on public.ventes(contact_id);

create table public.lignes_vente (
  id uuid primary key default gen_random_uuid(),
  vente_id uuid not null references public.ventes(id) on delete restrict,
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  article_id uuid not null references public.articles(id) on delete restrict,
  libelle text not null,
  quantite numeric(14, 3) not null check (quantite > 0),
  prix_unitaire numeric(14, 2) not null check (prix_unitaire >= 0),
  remise numeric(14, 2) not null default 0 check (remise >= 0),
  total numeric(14, 2) not null check (total >= 0),
  cout_unitaire numeric(14, 2)
);
create index lignes_vente_vente_id_idx on public.lignes_vente(vente_id);
create index lignes_vente_article_id_idx on public.lignes_vente(article_id);
create index lignes_vente_etablissement_id_idx on public.lignes_vente(etablissement_id);

-- Paiements ----------------------------------------------------------------
create table public.paiements (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  vente_id uuid not null references public.ventes(id) on delete restrict,
  session_caisse_id uuid references public.sessions_caisse(id) on delete restrict,
  mode text not null check (mode in ('especes', 'mobile_money', 'carte', 'virement', 'cheque')),
  montant numeric(14, 2) not null check (montant > 0),
  reference text,
  statut text not null default 'valide' check (statut in ('valide', 'annule')),
  encaisse_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  annule_le timestamptz,
  annule_par uuid references auth.users(id) on delete restrict,
  motif_annulation text,
  check (statut = 'valide' or (annule_le is not null and annule_par is not null and btrim(coalesce(motif_annulation, '')) <> ''))
);
create index paiements_vente_id_idx on public.paiements(vente_id);
create index paiements_session_caisse_id_idx on public.paiements(session_caisse_id);
create index paiements_etablissement_cree_le_idx on public.paiements(etablissement_id, cree_le desc);

-- Stock : la quantité est toujours la somme des mouvements ---------------------
create table public.mouvements_stock (
  id bigint generated always as identity primary key,
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  article_id uuid not null references public.articles(id) on delete restrict,
  type text not null check (type in ('entree', 'sortie_vente', 'retour_annulation', 'ajustement', 'inventaire')),
  quantite numeric(14, 3) not null check (quantite <> 0),
  cout_unitaire numeric(14, 2) check (cout_unitaire >= 0),
  motif text,
  vente_id uuid references public.ventes(id) on delete restrict,
  acteur uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now()
);
create index mouvements_stock_article_id_idx on public.mouvements_stock(article_id);
create index mouvements_stock_etablissement_cree_le_idx on public.mouvements_stock(etablissement_id, cree_le desc);
create index mouvements_stock_vente_id_idx on public.mouvements_stock(vente_id);

-- Dépenses -----------------------------------------------------------------
create table public.depenses (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  date_depense date not null default current_date,
  categorie text not null default 'Divers',
  libelle text not null check (btrim(libelle) <> ''),
  montant numeric(14, 2) not null check (montant > 0),
  mode text not null check (mode in ('especes', 'mobile_money', 'carte', 'virement', 'cheque')),
  fournisseur_id uuid references public.contacts(id) on delete restrict,
  session_caisse_id uuid references public.sessions_caisse(id) on delete restrict,
  justificatif text check (justificatif is null or length(justificatif) <= 400000),
  statut text not null default 'valide' check (statut in ('valide', 'annulee')),
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  annulee_le timestamptz,
  annulee_par uuid references auth.users(id) on delete restrict,
  motif_annulation text,
  check (statut = 'valide' or (annulee_le is not null and annulee_par is not null and btrim(coalesce(motif_annulation, '')) <> ''))
);
create index depenses_etablissement_date_idx on public.depenses(etablissement_id, date_depense desc);
create index depenses_session_caisse_id_idx on public.depenses(session_caisse_id);
create index depenses_fournisseur_id_idx on public.depenses(fournisseur_id);

-- Clôtures (tickets Z), immuables --------------------------------------------
create table public.clotures (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  numero text not null,
  session_caisse_id uuid not null unique references public.sessions_caisse(id) on delete restrict,
  point_de_vente_id uuid not null references public.points_de_vente(id) on delete restrict,
  ouverte_le timestamptz not null,
  cloturee_le timestamptz not null default now(),
  cloturee_par uuid not null references auth.users(id) on delete restrict,
  fond_initial numeric(14, 2) not null,
  nombre_ventes integer not null,
  total_ventes numeric(14, 2) not null,
  nombre_annulations integer not null,
  total_annulations numeric(14, 2) not null,
  total_remises numeric(14, 2) not null,
  encaissements jsonb not null,
  depenses_especes numeric(14, 2) not null,
  credit_accorde numeric(14, 2) not null,
  especes_attendues numeric(14, 2) not null,
  especes_comptees numeric(14, 2) not null check (especes_comptees >= 0),
  ecart numeric(14, 2) not null,
  articles_vendus jsonb not null,
  commentaire text,
  unique (etablissement_id, numero)
);
create index clotures_etablissement_id_idx on public.clotures(etablissement_id, cloturee_le desc);

-- Immuabilité ----------------------------------------------------------------
create function public.refuser_suppression()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Suppression interdite : utilisez l''archivage ou l''annulation';
end
$$;

create function public.refuser_modification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Cette ligne est définitive et ne peut pas être modifiée';
end
$$;

-- Une vente validée ne change que par annulation ou par l'évolution de ses paiements.
create function public.proteger_vente()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.statut = 'annulee' then
    raise exception 'Une vente annulée est définitive';
  end if;
  if (new.id, new.etablissement_id, new.numero, new.session_caisse_id, new.point_de_vente_id, new.contact_id,
      new.sous_total, new.remise, new.total, new.note, new.vendeur, new.cree_le)
     is distinct from
     (old.id, old.etablissement_id, old.numero, old.session_caisse_id, old.point_de_vente_id, old.contact_id,
      old.sous_total, old.remise, old.total, old.note, old.vendeur, old.cree_le) then
    raise exception 'Une vente validée ne peut pas être modifiée ; annulez-la avec un motif';
  end if;
  return new;
end
$$;
create trigger ventes_protection before update on public.ventes
for each row execute function public.proteger_vente();

create function public.proteger_annulable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  avant jsonb := to_jsonb(old) - array['statut', 'annule_le', 'annule_par', 'annulee_le', 'annulee_par', 'motif_annulation'];
  apres jsonb := to_jsonb(new) - array['statut', 'annule_le', 'annule_par', 'annulee_le', 'annulee_par', 'motif_annulation'];
begin
  if old.statut <> 'valide' then
    raise exception 'Une ligne annulée est définitive';
  end if;
  if avant is distinct from apres then
    raise exception 'Seule l''annulation avec motif est possible';
  end if;
  return new;
end
$$;
create trigger paiements_protection before update on public.paiements
for each row execute function public.proteger_annulable();
create trigger depenses_protection before update on public.depenses
for each row execute function public.proteger_annulable();

create trigger lignes_vente_immuables before update on public.lignes_vente
for each row execute function public.refuser_modification();
create trigger mouvements_stock_immuables before update on public.mouvements_stock
for each row execute function public.refuser_modification();
create trigger clotures_immuables before update on public.clotures
for each row execute function public.refuser_modification();

do $$
declare
  nom_table text;
begin
  foreach nom_table in array array[
    'categories_articles', 'articles', 'contacts', 'sessions_caisse', 'ventes', 'lignes_vente',
    'paiements', 'mouvements_stock', 'depenses', 'clotures'
  ] loop
    execute format(
      'create trigger %I_sans_suppression before delete on public.%I for each row execute function public.refuser_suppression()',
      nom_table, nom_table
    );
    execute format(
      'create trigger %I_verrou_etablissement before update on public.%I for each row execute function public.verrouiller_etablissement_id()',
      nom_table, nom_table
    );
    execute format('alter table public.%I enable row level security', nom_table);
  end loop;
end
$$;

-- Journal d'audit sur les écritures sensibles.
do $$
declare
  nom_table text;
begin
  foreach nom_table in array array[
    'categories_articles', 'articles', 'contacts', 'sessions_caisse', 'ventes', 'paiements', 'depenses', 'clotures'
  ] loop
    execute format(
      'create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.journaliser_modification()',
      nom_table, nom_table
    );
  end loop;
end
$$;

-- Lecture : permission (ou dirigeant du client, ou session support), module actif. -----
create function public.lecture_autorisee(p_etablissement_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.a_permission(p_etablissement_id, p_permission)
    or (
      public.module_actif(p_etablissement_id, split_part(p_permission, '.', 1))
      and (
        public.est_dirigeant((select e.client_id from public.etablissements e where e.id = p_etablissement_id))
        or public.session_support_active(p_etablissement_id)
      )
    )
$$;

create policy lecture on public.categories_articles for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'articles.lire') or public.a_permission(etablissement_id, 'caisse.utiliser'));
create policy lecture on public.articles for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'articles.lire') or public.a_permission(etablissement_id, 'caisse.utiliser'));
create policy lecture on public.contacts for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'contacts.lire') or public.a_permission(etablissement_id, 'caisse.utiliser'));
create policy lecture on public.sessions_caisse for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'cloture.lire') or public.a_permission(etablissement_id, 'caisse.utiliser'));
create policy lecture on public.ventes for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'ventes.lire'));
create policy lecture on public.lignes_vente for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'ventes.lire'));
create policy lecture on public.paiements for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'paiements.lire'));
create policy lecture on public.mouvements_stock for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'stock.lire'));
create policy lecture on public.depenses for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'depenses.lire'));
create policy lecture on public.clotures for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'cloture.lire'));

-- Vue du stock : la RLS des tables sous-jacentes s'applique (security_invoker).
create view public.stock_articles with (security_invoker = true) as
select
  a.id as article_id,
  a.etablissement_id,
  a.nom,
  a.reference,
  a.unite,
  a.suivi_stock,
  a.stock_minimum,
  a.actif,
  coalesce((select sum(m.quantite) from public.mouvements_stock m where m.article_id = a.id), 0)::numeric(14, 3) as quantite
from public.articles a;
