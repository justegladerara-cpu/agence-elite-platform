-- Réception intelligente (2026-10-12, demande de Juste : « réception intelligente, mémorisation des conditionnements et
-- des prix »). « J'ai reçu de la marchandise » reste une seule page, mais :
--   - la plateforme retient, par article et par fournisseur, le conditionnement reçu (casier de 24, carton de 12…) et
--     son dernier prix d'achat : la prochaine fois, tout est déjà proposé ;
--   - le prix payé (par conditionnement ou à l'unité) donne le coût unitaire, qui met à jour le coût d'achat de
--     l'article ; hausse de prix, marge faible et vente à perte sont signalées, avec un prix de vente conseillé ;
--   - chaque livraison devient un bon de réception (BR-) consultable ;
--   - avec un fournisseur et le module Achats, la livraison crée aussi la commande reçue (BC-, RE-) : elle apparaît dans
--     « À qui je dois ? » et peut être payée tout de suite, en tout ou en partie.
-- Rien ne change pour saisir_stock (fichier de stock, comptage) ni pour la caisse : le stock reste compté en unités.

-- ---------------------------------------------------------------------------
-- 1. Conditionnements retenus
-- ---------------------------------------------------------------------------
create table public.conditionnements_articles (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  article_id uuid not null references public.articles(id) on delete restrict,
  fournisseur_id uuid references public.contacts(id) on delete restrict,
  nom text not null check (length(btrim(nom)) between 1 and 30),
  unites integer not null check (unites between 1 and 10000),
  dernier_prix numeric(14, 2) check (dernier_prix >= 0),
  derniere_quantite numeric(14, 3) check (derniere_quantite >= 0),
  utilisations integer not null default 0 check (utilisations >= 0),
  utilise_le timestamptz not null default now(),
  cree_le timestamptz not null default now()
);
create unique index conditionnements_articles_unique on public.conditionnements_articles
  (article_id, coalesce(fournisseur_id, '00000000-0000-0000-0000-000000000000'::uuid), unites);
create index conditionnements_articles_etablissement_idx on public.conditionnements_articles(etablissement_id, utilise_le desc);

alter table public.conditionnements_articles enable row level security;
create policy lecture on public.conditionnements_articles for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'stock.lire') or public.lecture_autorisee(etablissement_id, 'articles.lire'));
create trigger conditionnements_articles_verrou_etablissement before update on public.conditionnements_articles
  for each row execute function public.verrouiller_etablissement_id();

-- ---------------------------------------------------------------------------
-- 2. Bons de réception (immuables)
-- ---------------------------------------------------------------------------
create table public.receptions_marchandise (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  hub_id uuid not null,
  numero text not null,
  fournisseur_id uuid references public.contacts(id) on delete restrict,
  reference text check (reference is null or length(reference) <= 60),
  notes text check (notes is null or length(notes) <= 200),
  articles integer not null check (articles > 0),
  quantite_totale numeric(14, 3) not null check (quantite_totale > 0),
  montant numeric(14, 2) not null default 0 check (montant >= 0),
  montant_paye numeric(14, 2) not null default 0 check (montant_paye >= 0),
  mode_paiement text check (mode_paiement is null or mode_paiement in ('especes', 'mobile_money', 'carte', 'virement', 'cheque')),
  commande_achat_id uuid references public.commandes_achat(id) on delete restrict,
  alertes jsonb not null default '[]'::jsonb check (jsonb_typeof(alertes) = 'array'),
  recue_par uuid not null references auth.users(id) on delete restrict,
  recue_le timestamptz not null default now(),
  unique (etablissement_id, numero),
  foreign key (hub_id, etablissement_id) references public.hubs(id, etablissement_id) on delete restrict
);
create index receptions_marchandise_etablissement_idx on public.receptions_marchandise(etablissement_id, recue_le desc);
create index receptions_marchandise_fournisseur_idx on public.receptions_marchandise(fournisseur_id, recue_le desc) where fournisseur_id is not null;

create table public.lignes_reception_marchandise (
  id bigint generated always as identity primary key,
  reception_id uuid not null references public.receptions_marchandise(id) on delete restrict,
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  article_id uuid not null references public.articles(id) on delete restrict,
  nom text not null,
  conditionnement text,
  par_conditionnement integer check (par_conditionnement is null or par_conditionnement between 1 and 10000),
  conditionnements numeric(14, 3) check (conditionnements is null or conditionnements >= 0),
  unites numeric(14, 3) check (unites is null or unites >= 0),
  quantite numeric(14, 3) not null check (quantite > 0),
  prix_conditionnement numeric(14, 2) check (prix_conditionnement is null or prix_conditionnement >= 0),
  cout_unitaire numeric(14, 2) check (cout_unitaire is null or cout_unitaire >= 0),
  ancien_cout numeric(14, 2),
  total numeric(14, 2) not null default 0 check (total >= 0),
  prix_vente numeric(14, 2),
  ancien_prix_vente numeric(14, 2)
);
create index lignes_reception_marchandise_reception_idx on public.lignes_reception_marchandise(reception_id);
create index lignes_reception_marchandise_article_idx on public.lignes_reception_marchandise(article_id);

alter table public.receptions_marchandise enable row level security;
alter table public.lignes_reception_marchandise enable row level security;
create policy lecture on public.receptions_marchandise for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'stock.lire') and public.lecture_hub(etablissement_id, hub_id));
create policy lecture on public.lignes_reception_marchandise for select to authenticated
  using (exists (select 1 from public.receptions_marchandise r where r.id = reception_id));

create trigger receptions_marchandise_immuables before update on public.receptions_marchandise
  for each row execute function public.refuser_modification();
create trigger receptions_marchandise_sans_suppression before delete on public.receptions_marchandise
  for each row execute function public.refuser_suppression();
create trigger receptions_marchandise_audit after insert on public.receptions_marchandise
  for each row execute function public.journaliser_modification();
create trigger lignes_reception_marchandise_immuables before update on public.lignes_reception_marchandise
  for each row execute function public.refuser_modification();
create trigger lignes_reception_marchandise_sans_suppression before delete on public.lignes_reception_marchandise
  for each row execute function public.refuser_suppression();

alter table public.mouvements_stock add column if not exists reception_marchandise_id uuid references public.receptions_marchandise(id) on delete restrict;
create index if not exists mouvements_stock_reception_marchandise_idx on public.mouvements_stock(reception_marchandise_id)
  where reception_marchandise_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Prix de vente conseillé : garde la marge d'avant, arrondi au-dessus (5 sous 1 000, 25 sous 10 000, 50 au-delà).
-- ---------------------------------------------------------------------------
create function public.arrondi_prix_conseille(p_prix numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_prix is null then null
    when p_prix < 1000 then ceil(p_prix / 5) * 5
    when p_prix < 10000 then ceil(p_prix / 25) * 25
    else ceil(p_prix / 50) * 50
  end
$$;

-- ---------------------------------------------------------------------------
-- 4. J'ai reçu de la marchandise
-- ---------------------------------------------------------------------------
-- p_lignes : [{ article_id, conditionnements?, par_conditionnement?, nom_conditionnement?, unites?,
--               prix_conditionnement?, prix_unitaire?, prix_vente? }]
--   quantité = conditionnements × par_conditionnement + unités ; coût unitaire = prix du conditionnement ÷ unités, ou
--   prix à l'unité. Un prix absent laisse le coût d'achat de l'article tel quel.
-- p_paye : montant payé tout de suite au fournisseur (module Achats, droit achats.gerer).
create function public.recevoir_marchandise(
  p_hub_id uuid,
  p_lignes jsonb,
  p_fournisseur_id uuid default null,
  p_reference text default null,
  p_notes text default null,
  p_paye numeric default null,
  p_mode_paiement text default null,
  p_simulation boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  hub public.hubs%rowtype;
  fournisseur public.contacts%rowtype;
  l jsonb;
  numero integer := 0;
  article public.articles%rowtype;
  v_cond numeric;
  v_unites numeric;
  v_par integer;
  v_nom_cond text;
  v_prix_cond numeric;
  v_prix_unite numeric;
  v_prix_vente numeric;
  v_quantite numeric;
  v_cout numeric;
  v_total numeric;
  v_pv_final numeric;
  v_conseil numeric;
  v_vus uuid[] := '{}';
  v_calcul jsonb := '[]'::jsonb;
  v_alertes jsonb := '[]'::jsonb;
  v_montant numeric := 0;
  v_quantite_totale numeric := 0;
  v_maj_cout boolean;
  v_chaine boolean := false;
  v_paye numeric := coalesce(p_paye, 0);
  v_reception uuid;
  v_numero text;
  v_commande uuid;
  v_numero_commande text;
  v_reception_achat uuid;
  v_numero_ra text;
  v_ligne_commande uuid;
  v_peut_articles boolean;
  c jsonb;
  rang integer := 0;
begin
  select * into hub from public.hubs where id = p_hub_id;
  if hub.id is null then
    raise exception 'Hub introuvable';
  end if;
  perform public.exiger_permission(hub.etablissement_id, 'stock.ajuster');
  perform public.exiger_acces_hub(hub.id);
  if not hub.actif or not hub.capacite_stock then
    raise exception 'Ce Hub ne gère pas de stock';
  end if;
  if p_lignes is null or jsonb_typeof(p_lignes) is distinct from 'array' or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Indiquez au moins une quantité reçue';
  end if;
  if jsonb_array_length(p_lignes) > 1000 then
    raise exception 'Pas plus de 1 000 articles par livraison';
  end if;
  if length(btrim(coalesce(p_reference, ''))) > 60 then
    raise exception 'Numéro du bon trop long (60 caractères au plus)';
  end if;
  if length(btrim(coalesce(p_notes, ''))) > 200 then
    raise exception 'Note trop longue (200 caractères au plus)';
  end if;
  if p_fournisseur_id is not null then
    select * into fournisseur from public.contacts
    where id = p_fournisseur_id and etablissement_id = hub.etablissement_id and actif and type in ('fournisseur', 'les_deux');
    if fournisseur.id is null then
      raise exception 'Choisissez un fournisseur actif de cet établissement';
    end if;
  end if;
  if v_paye = 'NaN'::numeric or v_paye < 0 or v_paye <> round(v_paye, 2) then
    raise exception 'Montant payé invalide';
  end if;
  v_maj_cout := coalesce((public.parametre_module(hub.etablissement_id, 'achats', 'maj_cout_achat', 'true'::jsonb) #>> '{}')::boolean, true);
  v_peut_articles := public.a_permission(hub.etablissement_id, 'articles.gerer');

  -- 1re passe : tout lire, tout vérifier, tout calculer (rien n'est écrit si une ligne est fausse).
  for l in select value from jsonb_array_elements(p_lignes) loop
    numero := numero + 1;
    begin
      if jsonb_typeof(l) <> 'object' then
        raise exception 'ligne invalide';
      end if;
      select * into article from public.articles
      where id = nullif(l ->> 'article_id', '')::uuid and etablissement_id = hub.etablissement_id;
      if article.id is null then
        raise exception 'article inconnu dans cet établissement';
      end if;
      if not article.actif then
        raise exception 'l''article « % » est archivé', article.nom;
      end if;
      if article.id = any(v_vus) then
        raise exception '« % » apparaît deux fois', article.nom;
      end if;
      v_vus := v_vus || article.id;
      begin
        v_cond := round(replace(nullif(btrim(coalesce(l ->> 'conditionnements', '')), ''), ',', '.')::numeric, 3);
        v_unites := round(replace(nullif(btrim(coalesce(l ->> 'unites', '')), ''), ',', '.')::numeric, 3);
        v_par := replace(nullif(btrim(coalesce(l ->> 'par_conditionnement', '')), ''), ',', '.')::numeric::integer;
        v_prix_cond := round(replace(nullif(btrim(coalesce(l ->> 'prix_conditionnement', '')), ''), ',', '.')::numeric, 2);
        v_prix_unite := round(replace(nullif(btrim(coalesce(l ->> 'prix_unitaire', '')), ''), ',', '.')::numeric, 2);
        v_prix_vente := round(replace(nullif(btrim(coalesce(l ->> 'prix_vente', '')), ''), ',', '.')::numeric, 2);
      exception when others then
        raise exception 'nombre illisible pour « % »', article.nom;
      end;
      if v_cond = 'NaN'::numeric or v_unites = 'NaN'::numeric or v_prix_cond = 'NaN'::numeric
         or v_prix_unite = 'NaN'::numeric or v_prix_vente = 'NaN'::numeric
         or coalesce(v_cond, 0) < 0 or coalesce(v_unites, 0) < 0 or coalesce(v_prix_cond, 0) < 0
         or coalesce(v_prix_unite, 0) < 0 or coalesce(v_prix_vente, 0) < 0
         or coalesce(v_cond, 0) >= 1000000 or coalesce(v_unites, 0) >= 1000000000
         or coalesce(v_prix_cond, 0) >= 1000000000000 or coalesce(v_prix_unite, 0) >= 1000000000000
         or coalesce(v_prix_vente, 0) >= 1000000000000 then
        raise exception 'nombre invalide pour « % »', article.nom;
      end if;
      v_par := coalesce(v_par, article.unites_par_lot);
      if v_par is not null and (v_par < 1 or v_par > 10000) then
        raise exception 'un conditionnement contient de 1 à 10 000 unités';
      end if;
      if (v_cond is not null or v_prix_cond is not null) and v_par is null then
        raise exception 'indiquez combien d''unités contient un conditionnement de « % »', article.nom;
      end if;
      v_quantite := coalesce(v_cond, 0) * coalesce(v_par, 0) + coalesce(v_unites, 0);
      if v_quantite <= 0 then
        raise exception 'la quantité reçue de « % » doit être supérieure à 0', article.nom;
      end if;
      v_nom_cond := nullif(btrim(coalesce(l ->> 'nom_conditionnement', '')), '');
      if length(coalesce(v_nom_cond, '')) > 30 then
        raise exception 'nom du conditionnement trop long (30 caractères au plus)';
      end if;
      if v_par is not null then
        v_nom_cond := coalesce(v_nom_cond, case when v_par = 1 then 'unité' else coalesce(article.nom_lot, 'casier') end);
      end if;
      v_cout := case
        when v_prix_cond is not null then round(v_prix_cond / v_par, 2)
        when v_prix_unite is not null then v_prix_unite
      end;
      v_total := case
        when v_prix_cond is not null then round(coalesce(v_cond, 0) * v_prix_cond + coalesce(v_unites, 0) * v_prix_cond / v_par, 2)
        when v_cout is not null then round(v_quantite * v_cout, 2)
        else 0
      end;
      if v_prix_vente is not null and v_prix_vente <> article.prix_vente and not v_peut_articles then
        raise exception 'il faut le droit de gérer les articles pour changer le prix de vente de « % »', article.nom;
      end if;
      v_pv_final := coalesce(v_prix_vente, article.prix_vente);
      -- Alertes : hausse ou baisse du prix d'achat (5 % et plus), marge faible (moins de 10 %), vente à perte.
      v_conseil := null;
      if v_cout is not null and article.cout_achat > 0 and v_cout >= article.cout_achat * 1.05 then
        if article.prix_vente > 0 then
          v_conseil := public.arrondi_prix_conseille(article.prix_vente * v_cout / article.cout_achat);
        end if;
        v_alertes := v_alertes || jsonb_build_array(jsonb_build_object('type', 'hausse', 'article_id', article.id, 'nom', article.nom,
          'ancien_cout', article.cout_achat, 'nouveau_cout', v_cout,
          'pourcentage', round((v_cout - article.cout_achat) * 100 / article.cout_achat, 1), 'prix_conseille', v_conseil));
      elsif v_cout is not null and article.cout_achat > 0 and v_cout <= article.cout_achat * 0.95 then
        v_alertes := v_alertes || jsonb_build_array(jsonb_build_object('type', 'baisse', 'article_id', article.id, 'nom', article.nom,
          'ancien_cout', article.cout_achat, 'nouveau_cout', v_cout,
          'pourcentage', round((v_cout - article.cout_achat) * 100 / article.cout_achat, 1)));
      end if;
      if v_cout is not null and v_pv_final <= v_cout then
        v_alertes := v_alertes || jsonb_build_array(jsonb_build_object('type', 'vente_a_perte', 'article_id', article.id, 'nom', article.nom,
          'cout', v_cout, 'prix_vente', v_pv_final,
          'prix_conseille', coalesce(v_conseil, public.arrondi_prix_conseille(v_cout * 1.25))));
      elsif v_cout is not null and v_pv_final > 0 and (v_pv_final - v_cout) / v_pv_final < 0.10 then
        v_alertes := v_alertes || jsonb_build_array(jsonb_build_object('type', 'marge_faible', 'article_id', article.id, 'nom', article.nom,
          'cout', v_cout, 'prix_vente', v_pv_final, 'marge', round((v_pv_final - v_cout) * 100 / v_pv_final, 1),
          'prix_conseille', coalesce(v_conseil, public.arrondi_prix_conseille(v_cout * 1.25))));
      end if;
      v_calcul := v_calcul || jsonb_build_array(jsonb_build_object(
        'ligne', numero, 'article_id', article.id, 'nom', article.nom, 'conditionnement', v_nom_cond, 'par_conditionnement', v_par,
        'conditionnements', v_cond, 'unites', v_unites, 'quantite', v_quantite, 'prix_conditionnement', v_prix_cond,
        'cout_unitaire', v_cout, 'ancien_cout', article.cout_achat, 'total', v_total,
        'prix_vente', case when v_prix_vente is not null and v_prix_vente <> article.prix_vente then v_prix_vente end,
        'ancien_prix_vente', article.prix_vente, 'actuel', public.stock_hub(hub.id, article.id),
        'apres', public.stock_hub(hub.id, article.id) + v_quantite, 'suivi_stock', article.suivi_stock,
        'unites_par_lot', article.unites_par_lot));
      v_montant := v_montant + v_total;
      v_quantite_totale := v_quantite_totale + v_quantite;
    exception when others then
      raise exception 'Ligne % : %', numero, sqlerrm;
    end;
  end loop;

  if v_paye > v_montant then
    raise exception 'Le montant payé (%) dépasse le montant de la livraison (%)', v_paye, v_montant;
  end if;
  if v_paye > 0 and (p_mode_paiement is null or p_mode_paiement not in ('especes', 'mobile_money', 'carte', 'virement', 'cheque')) then
    raise exception 'Choisissez comment le fournisseur a été payé';
  end if;
  -- Avec un fournisseur, un montant et le module Achats : la livraison devient aussi une commande reçue (dette fournisseur).
  v_chaine := fournisseur.id is not null and v_montant > 0 and public.a_permission(hub.etablissement_id, 'achats.recevoir');
  if v_paye > 0 and not v_chaine then
    raise exception 'Le paiement au fournisseur demande un fournisseur, des prix et le module Achats';
  end if;
  if v_paye > 0 then
    perform public.exiger_permission(hub.etablissement_id, 'achats.gerer');
  end if;

  if p_simulation then
    return jsonb_build_object('simulation', true, 'articles', numero, 'quantite_totale', v_quantite_totale, 'montant', v_montant,
      'dette_fournisseur', v_chaine, 'alertes', v_alertes, 'details', v_calcul);
  end if;

  -- 2e passe : écritures.
  v_numero := public.prochain_numero(hub.etablissement_id, 'reception_marchandise', 'BR-');
  if v_chaine then
    v_numero_commande := public.prochain_numero(hub.etablissement_id, 'commande_achat', 'BC-');
    insert into public.commandes_achat (etablissement_id, numero, hub_id, fournisseur_id, statut, date_commande, echeance,
      reference_fournisseur, notes, cree_par, envoyee_le)
    values (hub.etablissement_id, v_numero_commande, hub.id, fournisseur.id, 'recue', public.date_locale(hub.etablissement_id),
      public.date_locale(hub.etablissement_id)
        + coalesce((public.parametre_module(hub.etablissement_id, 'achats', 'delai_paiement_jours') #>> '{}')::integer, 30),
      nullif(btrim(p_reference), ''), 'Livraison ' || v_numero || ' (J''ai reçu de la marchandise)', auth.uid(), now())
    returning id into v_commande;
    v_numero_ra := public.prochain_numero(hub.etablissement_id, 'reception_achat', 'RE-');
    insert into public.receptions_achat (etablissement_id, numero, commande_id, hub_id, bon_livraison, notes, montant, recue_par)
    values (hub.etablissement_id, v_numero_ra, v_commande, hub.id, nullif(btrim(p_reference), ''), nullif(btrim(p_notes), ''),
      v_montant, auth.uid())
    returning id into v_reception_achat;
  end if;
  insert into public.receptions_marchandise (etablissement_id, hub_id, numero, fournisseur_id, reference, notes, articles,
    quantite_totale, montant, montant_paye, mode_paiement, commande_achat_id, alertes, recue_par)
  values (hub.etablissement_id, hub.id, v_numero, fournisseur.id, nullif(btrim(p_reference), ''), nullif(btrim(p_notes), ''),
    numero, v_quantite_totale, v_montant, v_paye, case when v_paye > 0 then p_mode_paiement end, v_commande, v_alertes, auth.uid())
  returning id into v_reception;

  for c in select value from jsonb_array_elements(v_calcul) loop
    rang := rang + 1;
    select * into article from public.articles where id = (c ->> 'article_id')::uuid for update;
    v_cout := (c ->> 'cout_unitaire')::numeric;
    v_quantite := (c ->> 'quantite')::numeric;
    v_par := (c ->> 'par_conditionnement')::integer;
    insert into public.lignes_reception_marchandise (reception_id, etablissement_id, article_id, nom, conditionnement,
      par_conditionnement, conditionnements, unites, quantite, prix_conditionnement, cout_unitaire, ancien_cout, total,
      prix_vente, ancien_prix_vente)
    values (v_reception, hub.etablissement_id, article.id, article.nom, c ->> 'conditionnement', v_par,
      (c ->> 'conditionnements')::numeric, (c ->> 'unites')::numeric, v_quantite, (c ->> 'prix_conditionnement')::numeric, v_cout,
      article.cout_achat, (c ->> 'total')::numeric, (c ->> 'prix_vente')::numeric, article.prix_vente);
    v_ligne_commande := null;
    if v_chaine then
      insert into public.lignes_commande_achat (commande_id, etablissement_id, ordre, article_id, libelle, quantite, quantite_recue,
        cout_unitaire, total)
      values (v_commande, hub.etablissement_id, rang, article.id, article.nom, v_quantite, v_quantite,
        coalesce(v_cout, article.cout_achat, 0), (c ->> 'total')::numeric)
      returning id into v_ligne_commande;
      insert into public.lignes_reception_achat (reception_id, etablissement_id, ligne_commande_id, article_id, quantite, cout_unitaire)
      values (v_reception_achat, hub.etablissement_id, v_ligne_commande, article.id, v_quantite, coalesce(v_cout, article.cout_achat, 0));
    end if;
    insert into public.mouvements_stock (etablissement_id, hub_id, article_id, type, quantite, cout_unitaire, motif, reception_id,
      reception_marchandise_id, acteur)
    values (hub.etablissement_id, hub.id, article.id, 'entree', v_quantite, coalesce(v_cout, article.cout_achat),
      'Réception ' || v_numero || coalesce(' · ' || fournisseur.nom, ''), v_reception_achat, v_reception, auth.uid());
    update public.articles set
      suivi_stock = true,
      cout_achat = case when v_cout is not null and v_maj_cout then v_cout else cout_achat end,
      prix_vente = coalesce((c ->> 'prix_vente')::numeric, prix_vente),
      -- Premier casier connu pour un article qui n'en avait pas : retenu pour afficher le stock en casiers.
      unites_par_lot = case when unites_par_lot is null and v_par >= 2 and v_peut_articles then v_par else unites_par_lot end,
      nom_lot = case when unites_par_lot is null and v_par >= 2 and v_peut_articles then c ->> 'conditionnement' else nom_lot end
    where id = article.id;
    -- Mémoire : conditionnement par article et par fournisseur (ou sans fournisseur), avec son dernier prix.
    if v_par is not null or (fournisseur.id is not null and v_cout is not null) then
      insert into public.conditionnements_articles as ca (etablissement_id, article_id, fournisseur_id, nom, unites, dernier_prix,
        derniere_quantite, utilisations, utilise_le)
      values (hub.etablissement_id, article.id, fournisseur.id, coalesce(c ->> 'conditionnement', 'unité'), coalesce(v_par, 1),
        case when v_par is null then v_cout else (c ->> 'prix_conditionnement')::numeric end,
        case when v_par is null then v_quantite else coalesce((c ->> 'conditionnements')::numeric, 0) end, 1, now())
      on conflict (article_id, coalesce(fournisseur_id, '00000000-0000-0000-0000-000000000000'::uuid), unites) do update set
        nom = excluded.nom,
        dernier_prix = coalesce(excluded.dernier_prix, ca.dernier_prix),
        derniere_quantite = excluded.derniere_quantite,
        utilisations = ca.utilisations + 1,
        utilise_le = now();
    end if;
  end loop;

  if v_chaine then
    if v_paye > 0 then
      insert into public.paiements_fournisseur (etablissement_id, commande_id, mode, montant, reference, date_paiement, paye_par)
      values (hub.etablissement_id, v_commande, p_mode_paiement, v_paye, nullif(btrim(p_reference), ''),
        public.date_locale(hub.etablissement_id), auth.uid());
    end if;
    perform public.recalculer_commande_achat(v_commande);
  end if;

  return jsonb_build_object('simulation', false, 'id', v_reception, 'numero', v_numero, 'articles', numero,
    'quantite_totale', v_quantite_totale, 'montant', v_montant, 'paye', v_paye, 'reste_a_payer', case when v_chaine then v_montant - v_paye else 0 end,
    'commande_achat_id', v_commande, 'commande_numero', v_numero_commande, 'alertes', v_alertes, 'details', v_calcul);
end
$$;

-- Oublier un conditionnement retenu (erreur de saisie, conditionnement qui n'existe plus).
create function public.oublier_conditionnement(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_etab uuid;
begin
  select etablissement_id into v_etab from public.conditionnements_articles where id = p_id;
  if v_etab is null then
    raise exception 'Conditionnement introuvable';
  end if;
  perform public.exiger_permission(v_etab, 'stock.ajuster');
  delete from public.conditionnements_articles where id = p_id;
end
$$;

revoke execute on function public.recevoir_marchandise(uuid, jsonb, uuid, text, text, numeric, text, boolean) from public, anon;
grant execute on function public.recevoir_marchandise(uuid, jsonb, uuid, text, text, numeric, text, boolean) to authenticated;
revoke execute on function public.oublier_conditionnement(uuid) from public, anon;
grant execute on function public.oublier_conditionnement(uuid) to authenticated;
revoke execute on function public.arrondi_prix_conseille(numeric) from public, anon;
grant execute on function public.arrondi_prix_conseille(numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Elite Simple pour tout l'établissement (chacun peut encore changer sur son appareil)
-- ---------------------------------------------------------------------------
update public.modules set parametres_schema = coalesce(parametres_schema, '[]'::jsonb) || '[
  {"cle": "elite_simple", "libelle": "Elite Simple pour toute l''équipe : menu réduit à l''essentiel (chacun peut changer sur son appareil)", "type": "booleen", "defaut": false}
]'::jsonb
where id = 'tableau_de_bord' and not coalesce(parametres_schema, '[]'::jsonb) @> '[{"cle": "elite_simple"}]'::jsonb;

notify pgrst, 'reload schema';
