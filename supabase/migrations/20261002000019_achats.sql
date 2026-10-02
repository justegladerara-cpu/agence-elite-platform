-- Achats et fournisseurs (2026-10-02) : le module « achats », jusqu'ici « Prévu », devient réel.
-- Fournisseurs = contacts (type fournisseur ou les deux). Demande d'achat → commande (BC-) → réceptions (RE-)
-- qui alimentent le stock du Hub de destination au coût d'achat → paiements fournisseur.
-- Les paiements fournisseur ne sont pas des dépenses : la marchandise devient du stock, son coût passe en
-- charge à la vente (marge brute). Rien ne se supprime ; une réception est définitive (erreur = ajustement de stock).

-- ---------------------------------------------------------------------------
-- 1. Catalogue
-- ---------------------------------------------------------------------------
update public.modules set
  description = 'Demandes d''achat, commandes fournisseurs, réceptions qui alimentent le stock, paiements fournisseurs.',
  documentation = 'docs/ACHATS.md',
  parametres_schema = '[
    {"cle": "maj_cout_achat", "libelle": "Mettre à jour le coût d''achat des articles à chaque réception", "type": "booleen", "defaut": true},
    {"cle": "delai_paiement_jours", "libelle": "Délai de paiement fournisseur par défaut (jours)", "type": "nombre", "defaut": 30}
  ]'::jsonb
where id = 'achats';

insert into public.permissions (id, module_id, description) values
  ('achats.lire', 'achats', 'Voir les demandes, commandes, réceptions et dettes fournisseurs'),
  ('achats.demander', 'achats', 'Faire une demande d''achat'),
  ('achats.gerer', 'achats', 'Approuver, commander, payer les fournisseurs, annuler une commande'),
  ('achats.recevoir', 'achats', 'Réceptionner la marchandise dans un Hub')
on conflict (id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['gerant', 'responsable']) r
cross join unnest(array['achats.lire', 'achats.demander', 'achats.gerer', 'achats.recevoir']) p
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id) values
  ('gestionnaire_depot', 'achats.lire'), ('gestionnaire_depot', 'achats.demander'), ('gestionnaire_depot', 'achats.recevoir'),
  ('responsable_hub', 'achats.lire'), ('responsable_hub', 'achats.demander'), ('responsable_hub', 'achats.recevoir'),
  ('comptable', 'achats.lire'), ('comptable', 'achats.gerer'),
  ('lecteur', 'achats.lire')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
create table public.commandes_achat (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  numero text not null,
  hub_id uuid not null,
  fournisseur_id uuid references public.contacts(id) on delete restrict,
  statut text not null default 'brouillon'
    check (statut in ('demande', 'brouillon', 'envoyee', 'partielle', 'recue', 'annulee')),
  date_commande date not null default current_date,
  livraison_prevue date,
  echeance date,
  reference_fournisseur text check (reference_fournisseur is null or length(reference_fournisseur) <= 60),
  notes text check (notes is null or length(notes) <= 2000),
  total numeric(14, 2) not null default 0 check (total >= 0),
  montant_recu numeric(14, 2) not null default 0 check (montant_recu >= 0),
  montant_paye numeric(14, 2) not null default 0 check (montant_paye >= 0),
  demande_par uuid references auth.users(id) on delete restrict,
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  envoyee_le timestamptz,
  annulee_le timestamptz,
  annulee_par uuid references auth.users(id) on delete restrict,
  motif_annulation text,
  unique (etablissement_id, numero),
  unique (id, etablissement_id),
  check (statut in ('demande', 'annulee') or fournisseur_id is not null),
  check (statut <> 'annulee' or (annulee_le is not null and annulee_par is not null and btrim(coalesce(motif_annulation, '')) <> '')),
  foreign key (hub_id, etablissement_id) references public.hubs(id, etablissement_id) on delete restrict
);
create index commandes_achat_etablissement_idx on public.commandes_achat(etablissement_id, date_commande desc);
create index commandes_achat_fournisseur_idx on public.commandes_achat(fournisseur_id);

create table public.lignes_commande_achat (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null,
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  ordre integer not null default 0,
  article_id uuid not null references public.articles(id) on delete restrict,
  libelle text not null,
  quantite numeric(14, 3) not null check (quantite > 0),
  quantite_recue numeric(14, 3) not null default 0 check (quantite_recue >= 0),
  cout_unitaire numeric(14, 2) not null check (cout_unitaire >= 0),
  total numeric(14, 2) not null check (total >= 0),
  foreign key (commande_id, etablissement_id) references public.commandes_achat(id, etablissement_id) on delete restrict
);
create index lignes_commande_achat_commande_idx on public.lignes_commande_achat(commande_id, ordre);
create index lignes_commande_achat_article_idx on public.lignes_commande_achat(article_id);

create table public.receptions_achat (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  numero text not null,
  commande_id uuid not null,
  hub_id uuid not null,
  bon_livraison text check (bon_livraison is null or length(bon_livraison) <= 60),
  notes text check (notes is null or length(notes) <= 1000),
  montant numeric(14, 2) not null check (montant >= 0),
  recue_par uuid not null references auth.users(id) on delete restrict,
  recue_le timestamptz not null default now(),
  unique (etablissement_id, numero),
  unique (id, etablissement_id),
  foreign key (commande_id, etablissement_id) references public.commandes_achat(id, etablissement_id) on delete restrict,
  foreign key (hub_id, etablissement_id) references public.hubs(id, etablissement_id) on delete restrict
);
create index receptions_achat_commande_idx on public.receptions_achat(commande_id);

create table public.lignes_reception_achat (
  id uuid primary key default gen_random_uuid(),
  reception_id uuid not null,
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  ligne_commande_id uuid not null references public.lignes_commande_achat(id) on delete restrict,
  article_id uuid not null references public.articles(id) on delete restrict,
  quantite numeric(14, 3) not null check (quantite > 0),
  cout_unitaire numeric(14, 2) not null check (cout_unitaire >= 0),
  foreign key (reception_id, etablissement_id) references public.receptions_achat(id, etablissement_id) on delete restrict
);
create index lignes_reception_achat_reception_idx on public.lignes_reception_achat(reception_id);

create table public.paiements_fournisseur (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  commande_id uuid not null,
  mode text not null check (mode in ('especes', 'mobile_money', 'carte', 'virement', 'cheque')),
  montant numeric(14, 2) not null check (montant > 0),
  reference text check (reference is null or length(reference) <= 80),
  date_paiement date not null default current_date,
  statut text not null default 'valide' check (statut in ('valide', 'annule')),
  paye_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  annule_le timestamptz,
  annule_par uuid references auth.users(id) on delete restrict,
  motif_annulation text,
  check (statut = 'valide' or (annule_le is not null and annule_par is not null and btrim(coalesce(motif_annulation, '')) <> '')),
  foreign key (commande_id, etablissement_id) references public.commandes_achat(id, etablissement_id) on delete restrict
);
create index paiements_fournisseur_commande_idx on public.paiements_fournisseur(commande_id);

alter table public.mouvements_stock add column if not exists reception_id uuid references public.receptions_achat(id) on delete restrict;
create index if not exists mouvements_stock_reception_id_idx on public.mouvements_stock(reception_id) where reception_id is not null;

-- Lignes de commande : modifiables tant que la commande n'est ni envoyée ni annulée (sauf la quantité reçue).
create function public.proteger_ligne_commande_achat()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_statut text;
begin
  select statut into v_statut from public.commandes_achat where id = coalesce(old.commande_id, new.commande_id);
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'quantite_recue') = (to_jsonb(old) - 'quantite_recue') then
    return new;
  end if;
  if v_statut not in ('demande', 'brouillon') then
    raise exception 'Les lignes d''une commande envoyée ne se modifient plus';
  end if;
  return coalesce(new, old);
end
$$;
create trigger lignes_commande_achat_protection before update or delete on public.lignes_commande_achat
for each row execute function public.proteger_ligne_commande_achat();

do $$
declare
  nom_table text;
begin
  foreach nom_table in array array['commandes_achat'] loop
    execute format('create trigger %I_modifie_le before update on public.%I for each row execute function public.fixer_modifie_le()', nom_table, nom_table);
  end loop;
  foreach nom_table in array array['commandes_achat', 'receptions_achat', 'lignes_reception_achat', 'paiements_fournisseur'] loop
    execute format('create trigger %I_sans_suppression before delete on public.%I for each row execute function public.refuser_suppression()', nom_table, nom_table);
  end loop;
  foreach nom_table in array array['commandes_achat', 'lignes_commande_achat', 'receptions_achat', 'lignes_reception_achat', 'paiements_fournisseur'] loop
    execute format('create trigger %I_verrou_etablissement before update on public.%I for each row execute function public.verrouiller_etablissement_id()', nom_table, nom_table);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.journaliser_modification()', nom_table, nom_table);
    execute format('alter table public.%I enable row level security', nom_table);
  end loop;
end
$$;
create trigger receptions_achat_immuables before update on public.receptions_achat
for each row execute function public.refuser_modification();
create trigger lignes_reception_achat_immuables before update on public.lignes_reception_achat
for each row execute function public.refuser_modification();
create trigger paiements_fournisseur_protection before update on public.paiements_fournisseur
for each row execute function public.proteger_annulable();

create policy lecture on public.commandes_achat for select to authenticated
using ((public.lecture_autorisee(etablissement_id, 'achats.lire') and public.lecture_hub(etablissement_id, hub_id))
  or (demande_par = auth.uid() and public.a_permission(etablissement_id, 'achats.demander')));
create policy lecture on public.lignes_commande_achat for select to authenticated
using (exists (select 1 from public.commandes_achat c where c.id = commande_id));
create policy lecture on public.receptions_achat for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'achats.lire') and public.lecture_hub(etablissement_id, hub_id));
create policy lecture on public.lignes_reception_achat for select to authenticated
using (exists (select 1 from public.receptions_achat r where r.id = reception_id));
create policy lecture on public.paiements_fournisseur for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'achats.lire')
  and exists (select 1 from public.commandes_achat c where c.id = commande_id));

insert into public.types_pieces_jointes (objet_type, table_nom, module_id, permission_lire, permission_ecrire, libelle)
values ('commande_achat', 'commandes_achat', 'achats', 'achats.lire', 'achats.gerer', 'Commande fournisseur')
on conflict (objet_type) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Fonctions
-- ---------------------------------------------------------------------------
-- Recalcule total, reçu, payé et statut de réception d'une commande.
create function public.recalculer_commande_achat(p_commande_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total numeric;
  v_recu numeric;
  v_paye numeric;
  v_tout_recu boolean;
  v_rien_recu boolean;
begin
  select coalesce(sum(total), 0), bool_and(quantite_recue >= quantite), bool_and(quantite_recue = 0)
  into v_total, v_tout_recu, v_rien_recu
  from public.lignes_commande_achat where commande_id = p_commande_id;
  -- Reçu = valeur réelle des réceptions (au coût facturé à la livraison, qui peut différer du prix commandé).
  select coalesce(sum(montant), 0) into v_recu from public.receptions_achat where commande_id = p_commande_id;
  select coalesce(sum(montant), 0) into v_paye from public.paiements_fournisseur where commande_id = p_commande_id and statut = 'valide';
  update public.commandes_achat set
    total = v_total, montant_recu = v_recu, montant_paye = v_paye,
    statut = case when statut in ('envoyee', 'partielle', 'recue') then
                    case when v_tout_recu then 'recue' when not v_rien_recu then 'partielle' else 'envoyee' end
                  else statut end
  where id = p_commande_id;
end
$$;

-- Crée ou modifie une demande (achats.demander) ou une commande brouillon (achats.gerer).
-- p : { id?, demande?: bool, fournisseur_id?, hub_id?, date_commande?, livraison_prevue?, echeance?, reference_fournisseur?, notes?,
--       lignes: [{ article_id, quantite, cout_unitaire? }] }
create function public.enregistrer_commande_achat(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p ->> 'id', '')::uuid;
  existant public.commandes_achat%rowtype;
  v_demande boolean := coalesce((p ->> 'demande')::boolean, false);
  v_fournisseur uuid := nullif(p ->> 'fournisseur_id', '')::uuid;
  v_hub uuid;
  v_lignes jsonb := coalesce(p -> 'lignes', '[]'::jsonb);
  l jsonb;
  v_article public.articles%rowtype;
  v_quantite numeric;
  v_cout numeric;
  v_rang integer := 0;
begin
  if resultat is not null then
    select * into existant from public.commandes_achat where id = resultat and etablissement_id = p_etablissement_id for update;
    if existant.id is null then
      raise exception 'Commande introuvable dans cet établissement';
    end if;
    v_demande := existant.statut = 'demande';
    if existant.statut not in ('demande', 'brouillon') then
      raise exception 'Cette commande n''est plus modifiable';
    end if;
    perform public.exiger_acces_hub(existant.hub_id);
  end if;
  if v_demande then
    if existant.id is not null and existant.demande_par is distinct from auth.uid() then
      perform public.exiger_permission(p_etablissement_id, 'achats.gerer');
    else
      perform public.exiger_permission(p_etablissement_id, 'achats.demander');
    end if;
  else
    perform public.exiger_permission(p_etablissement_id, 'achats.gerer');
  end if;
  if v_fournisseur is not null and not exists (
    select 1 from public.contacts where id = v_fournisseur and etablissement_id = p_etablissement_id and type in ('fournisseur', 'les_deux') and actif
  ) then
    raise exception 'Choisissez un fournisseur actif de cet établissement';
  end if;
  if not v_demande and v_fournisseur is null then
    raise exception 'Choisissez le fournisseur';
  end if;
  if jsonb_typeof(v_lignes) <> 'array' or jsonb_array_length(v_lignes) = 0 then
    raise exception 'Ajoutez au moins un article';
  end if;
  if jsonb_array_length(v_lignes) > 300 then
    raise exception 'Pas plus de 300 lignes par commande';
  end if;
  v_hub := coalesce(nullif(p ->> 'hub_id', '')::uuid, existant.hub_id);
  if v_hub is null then
    select h.id into v_hub from public.hubs h
    where h.etablissement_id = p_etablissement_id and h.actif and h.capacite_stock and public.acces_hub(h.id)
    order by h.type = 'depot' desc, h.principal desc, h.cree_le limit 1;
  end if;
  if v_hub is null or not exists (select 1 from public.hubs where id = v_hub and etablissement_id = p_etablissement_id and actif and capacite_stock) then
    raise exception 'Choisissez un Hub qui gère du stock';
  end if;
  perform public.exiger_acces_hub(v_hub);

  if resultat is null then
    insert into public.commandes_achat (etablissement_id, numero, hub_id, fournisseur_id, statut, date_commande, livraison_prevue, echeance,
      reference_fournisseur, notes, demande_par, cree_par)
    values (p_etablissement_id,
            public.prochain_numero(p_etablissement_id, case when v_demande then 'demande_achat' else 'commande_achat' end, case when v_demande then 'DA-' else 'BC-' end),
            v_hub, v_fournisseur, case when v_demande then 'demande' else 'brouillon' end,
            coalesce(nullif(p ->> 'date_commande', '')::date, public.date_locale(p_etablissement_id)),
            nullif(p ->> 'livraison_prevue', '')::date, nullif(p ->> 'echeance', '')::date,
            nullif(btrim(p ->> 'reference_fournisseur'), ''), nullif(btrim(p ->> 'notes'), ''),
            case when v_demande then auth.uid() end, auth.uid())
    returning id into resultat;
  else
    update public.commandes_achat set
      hub_id = v_hub, fournisseur_id = v_fournisseur,
      date_commande = coalesce(nullif(p ->> 'date_commande', '')::date, date_commande),
      livraison_prevue = nullif(p ->> 'livraison_prevue', '')::date, echeance = nullif(p ->> 'echeance', '')::date,
      reference_fournisseur = nullif(btrim(p ->> 'reference_fournisseur'), ''), notes = nullif(btrim(p ->> 'notes'), '')
    where id = resultat;
    delete from public.lignes_commande_achat where commande_id = resultat;
  end if;

  for l in select * from jsonb_array_elements(v_lignes) loop
    v_rang := v_rang + 1;
    if jsonb_typeof(l) <> 'object' then
      raise exception 'Ligne % invalide', v_rang;
    end if;
    select * into v_article from public.articles
    where id = nullif(l ->> 'article_id', '')::uuid and etablissement_id = p_etablissement_id;
    if v_article.id is null then
      raise exception 'Article inconnu dans cet établissement (ligne %)', v_rang;
    end if;
    if not v_article.suivi_stock then
      raise exception '« % » n''est pas suivi en stock : il ne s''achète pas ici (passez une dépense)', v_article.nom;
    end if;
    v_quantite := nullif(l ->> 'quantite', '')::numeric;
    v_cout := round(coalesce(nullif(l ->> 'cout_unitaire', '')::numeric, v_article.cout_achat, 0), 2);
    if v_quantite is null or v_quantite = 'NaN'::numeric or v_quantite <= 0 then
      raise exception 'Quantité invalide (ligne %)', v_rang;
    end if;
    if v_cout = 'NaN'::numeric or v_cout < 0 then
      raise exception 'Coût invalide (ligne %)', v_rang;
    end if;
    insert into public.lignes_commande_achat (commande_id, etablissement_id, ordre, article_id, libelle, quantite, cout_unitaire, total)
    values (resultat, p_etablissement_id, v_rang, v_article.id, v_article.nom, v_quantite, v_cout, round(v_quantite * v_cout, 2));
  end loop;
  perform public.recalculer_commande_achat(resultat);
  return resultat;
end
$$;

-- Demande approuvée (devient une commande brouillon, fournisseur requis) ; brouillon envoyé au fournisseur.
create function public.changer_statut_commande_achat(p_commande_id uuid, p_statut text, p_fournisseur_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cmd public.commandes_achat%rowtype;
  v_numero text;
begin
  select * into cmd from public.commandes_achat where id = p_commande_id for update;
  if cmd.id is null then
    raise exception 'Commande introuvable';
  end if;
  perform public.exiger_permission(cmd.etablissement_id, 'achats.gerer');
  perform public.exiger_acces_hub(cmd.hub_id);
  if cmd.statut = 'demande' and p_statut = 'brouillon' then
    if coalesce(p_fournisseur_id, cmd.fournisseur_id) is null or not exists (
      select 1 from public.contacts where id = coalesce(p_fournisseur_id, cmd.fournisseur_id) and etablissement_id = cmd.etablissement_id
        and type in ('fournisseur', 'les_deux') and actif) then
      raise exception 'Choisissez le fournisseur pour approuver la demande';
    end if;
    v_numero := public.prochain_numero(cmd.etablissement_id, 'commande_achat', 'BC-');
    update public.commandes_achat set statut = 'brouillon', fournisseur_id = coalesce(p_fournisseur_id, fournisseur_id),
      notes = concat_ws(E'\n', notes, 'Demande ' || numero || ' approuvée.'), numero = v_numero
    where id = cmd.id;
    if cmd.demande_par is not null and cmd.demande_par <> auth.uid() then
      perform public.notifier(cmd.demande_par, cmd.etablissement_id, 'achats.demande_approuvee', 'Demande d''achat approuvée',
        'Votre demande ' || cmd.numero || ' devient la commande ' || v_numero, 'achats/' || cmd.id);
    end if;
  elsif cmd.statut = 'brouillon' and p_statut = 'envoyee' then
    update public.commandes_achat set statut = 'envoyee', envoyee_le = now(),
      echeance = coalesce(echeance, date_commande + coalesce((public.parametre_module(cmd.etablissement_id, 'achats', 'delai_paiement_jours') #>> '{}')::integer, 30))
    where id = cmd.id;
  elsif cmd.statut = 'envoyee' and p_statut = 'brouillon' and cmd.montant_recu = 0 then
    update public.commandes_achat set statut = 'brouillon', envoyee_le = null where id = cmd.id;
  else
    raise exception 'Passage impossible de « % » à « % »', cmd.statut, p_statut;
  end if;
end
$$;

-- Réception (partielle ou totale) dans le Hub de la commande : entrées de stock au coût de la ligne.
-- p_lignes : [{ ligne_id, quantite, cout_unitaire? }]
create function public.receptionner_commande_achat(p_commande_id uuid, p_lignes jsonb, p_bon_livraison text default null, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cmd public.commandes_achat%rowtype;
  hub public.hubs%rowtype;
  l jsonb;
  ligne public.lignes_commande_achat%rowtype;
  v_quantite numeric;
  v_cout numeric;
  v_reception uuid;
  v_numero text;
  v_montant numeric := 0;
  v_nb integer := 0;
  maj_cout boolean;
begin
  select * into cmd from public.commandes_achat where id = p_commande_id for update;
  if cmd.id is null then
    raise exception 'Commande introuvable';
  end if;
  perform public.exiger_permission(cmd.etablissement_id, 'achats.recevoir');
  perform public.exiger_permission(cmd.etablissement_id, 'stock.lire');
  perform public.exiger_acces_hub(cmd.hub_id);
  if cmd.statut not in ('envoyee', 'partielle') then
    raise exception 'Seule une commande envoyée se réceptionne';
  end if;
  select * into hub from public.hubs where id = cmd.hub_id;
  if not hub.actif or not hub.capacite_stock then
    raise exception 'Le Hub « % » ne gère pas de stock', hub.nom;
  end if;
  if jsonb_typeof(p_lignes) is distinct from 'array' or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Indiquez les quantités reçues';
  end if;
  maj_cout := coalesce((public.parametre_module(cmd.etablissement_id, 'achats', 'maj_cout_achat') #>> '{}')::boolean, true);
  if (select count(*) from jsonb_array_elements(p_lignes) e where nullif(e ->> 'quantite', '') is not null)
     <> (select count(distinct e ->> 'ligne_id') from jsonb_array_elements(p_lignes) e where nullif(e ->> 'quantite', '') is not null) then
    raise exception 'Une même ligne apparaît deux fois';
  end if;
  -- 1re passe : tout valider et calculer le montant, pour insérer la réception (immuable) déjà complète.
  for l in select * from jsonb_array_elements(p_lignes) loop
    v_quantite := nullif(l ->> 'quantite', '')::numeric;
    continue when v_quantite is null or v_quantite = 0;
    select * into ligne from public.lignes_commande_achat
    where id = nullif(l ->> 'ligne_id', '')::uuid and commande_id = cmd.id for update;
    if ligne.id is null then
      raise exception 'Ligne de commande inconnue';
    end if;
    if v_quantite = 'NaN'::numeric or v_quantite < 0 then
      raise exception 'Quantité reçue invalide pour « % »', ligne.libelle;
    end if;
    if ligne.quantite_recue + v_quantite > ligne.quantite then
      raise exception 'Trop reçu pour « % » : % commandé(s), % déjà reçu(s)', ligne.libelle, ligne.quantite, ligne.quantite_recue;
    end if;
    v_cout := round(coalesce(nullif(l ->> 'cout_unitaire', '')::numeric, ligne.cout_unitaire), 2);
    if v_cout = 'NaN'::numeric or v_cout < 0 then
      raise exception 'Coût invalide pour « % »', ligne.libelle;
    end if;
    v_montant := v_montant + round(v_quantite * v_cout, 2);
    v_nb := v_nb + 1;
  end loop;
  if v_nb = 0 then
    raise exception 'Aucune quantité reçue';
  end if;
  v_numero := public.prochain_numero(cmd.etablissement_id, 'reception_achat', 'RE-');
  insert into public.receptions_achat (etablissement_id, numero, commande_id, hub_id, bon_livraison, notes, montant, recue_par)
  values (cmd.etablissement_id, v_numero, cmd.id, cmd.hub_id, nullif(btrim(p_bon_livraison), ''), nullif(btrim(p_notes), ''), v_montant, auth.uid())
  returning id into v_reception;
  -- 2e passe : écritures (lignes déjà verrouillées et validées).
  for l in select * from jsonb_array_elements(p_lignes) loop
    v_quantite := nullif(l ->> 'quantite', '')::numeric;
    continue when v_quantite is null or v_quantite = 0;
    select * into ligne from public.lignes_commande_achat where id = (l ->> 'ligne_id')::uuid;
    v_cout := round(coalesce(nullif(l ->> 'cout_unitaire', '')::numeric, ligne.cout_unitaire), 2);
    insert into public.lignes_reception_achat (reception_id, etablissement_id, ligne_commande_id, article_id, quantite, cout_unitaire)
    values (v_reception, cmd.etablissement_id, ligne.id, ligne.article_id, v_quantite, v_cout);
    update public.lignes_commande_achat set quantite_recue = quantite_recue + v_quantite where id = ligne.id;
    insert into public.mouvements_stock (etablissement_id, hub_id, article_id, type, quantite, cout_unitaire, motif, reception_id, acteur)
    values (cmd.etablissement_id, cmd.hub_id, ligne.article_id, 'entree', v_quantite, v_cout, 'Réception ' || v_numero || ' (' || cmd.numero || ')',
            v_reception, auth.uid());
    if maj_cout then
      update public.articles set cout_achat = v_cout where id = ligne.article_id;
    end if;
  end loop;
  perform public.recalculer_commande_achat(cmd.id);
  perform public.notifier_permission(cmd.etablissement_id, 'achats.gerer', 'achats.reception', 'Marchandise reçue',
    v_numero || ' pour ' || cmd.numero || ' dans ' || hub.nom, 'achats/' || cmd.id);
  return v_reception;
end
$$;

create function public.payer_fournisseur(p_commande_id uuid, p_montant numeric, p_mode text, p_reference text default null, p_date date default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cmd public.commandes_achat%rowtype;
  resultat uuid;
begin
  select * into cmd from public.commandes_achat where id = p_commande_id for update;
  if cmd.id is null then
    raise exception 'Commande introuvable';
  end if;
  perform public.exiger_permission(cmd.etablissement_id, 'achats.gerer');
  perform public.exiger_acces_hub(cmd.hub_id);
  if cmd.statut not in ('envoyee', 'partielle', 'recue') then
    raise exception 'Seule une commande envoyée se paie';
  end if;
  if p_mode is null or p_mode not in ('especes', 'mobile_money', 'carte', 'virement', 'cheque') then
    raise exception 'Mode de paiement inconnu : %', p_mode;
  end if;
  if p_montant is null or p_montant = 'NaN'::numeric or p_montant <= 0 or p_montant <> round(p_montant, 2)
     or cmd.montant_paye + p_montant > greatest(cmd.total, cmd.montant_recu) then
    raise exception 'Le montant doit être positif et ne pas dépasser le reste à payer (%)', greatest(cmd.total, cmd.montant_recu) - cmd.montant_paye;
  end if;
  insert into public.paiements_fournisseur (etablissement_id, commande_id, mode, montant, reference, date_paiement, paye_par)
  values (cmd.etablissement_id, cmd.id, p_mode, p_montant, nullif(btrim(p_reference), ''),
          coalesce(p_date, public.date_locale(cmd.etablissement_id)), auth.uid())
  returning id into resultat;
  perform public.recalculer_commande_achat(cmd.id);
  return resultat;
end
$$;

create function public.annuler_paiement_fournisseur(p_paiement_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pf public.paiements_fournisseur%rowtype;
begin
  select * into pf from public.paiements_fournisseur where id = p_paiement_id for update;
  if pf.id is null then
    raise exception 'Paiement introuvable';
  end if;
  perform public.exiger_permission(pf.etablissement_id, 'achats.gerer');
  if pf.statut <> 'valide' then
    raise exception 'Ce paiement est déjà annulé';
  end if;
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Le motif d''annulation est obligatoire';
  end if;
  update public.paiements_fournisseur set statut = 'annule', annule_le = now(), annule_par = auth.uid(), motif_annulation = btrim(p_motif)
  where id = pf.id;
  perform public.recalculer_commande_achat(pf.commande_id);
end
$$;

-- Annulation : demande, brouillon, ou commande envoyée sans réception ni paiement.
create function public.annuler_commande_achat(p_commande_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cmd public.commandes_achat%rowtype;
begin
  select * into cmd from public.commandes_achat where id = p_commande_id for update;
  if cmd.id is null then
    raise exception 'Commande introuvable';
  end if;
  if cmd.statut = 'demande' and cmd.demande_par = auth.uid() then
    perform public.exiger_permission(cmd.etablissement_id, 'achats.demander');
  else
    perform public.exiger_permission(cmd.etablissement_id, 'achats.gerer');
  end if;
  perform public.exiger_acces_hub(cmd.hub_id);
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Le motif d''annulation est obligatoire';
  end if;
  if cmd.statut not in ('demande', 'brouillon', 'envoyee') or cmd.montant_recu > 0 or cmd.montant_paye > 0 then
    raise exception 'Commande déjà reçue ou payée : elle ne s''annule plus (régularisez par un ajustement de stock)';
  end if;
  update public.commandes_achat set statut = 'annulee', annulee_le = now(), annulee_par = auth.uid(), motif_annulation = btrim(p_motif)
  where id = cmd.id;
  if cmd.statut = 'demande' and cmd.demande_par is not null and cmd.demande_par <> auth.uid() then
    perform public.notifier(cmd.demande_par, cmd.etablissement_id, 'achats.demande_refusee', 'Demande d''achat refusée',
      cmd.numero || ' : ' || btrim(p_motif), 'achats/' || cmd.id);
  end if;
end
$$;

-- Suggestions de réapprovisionnement : articles sous leur stock minimum dans les Hubs autorisés.
create function public.suggestions_achat(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.lecture_autorisee(p_etablissement_id, 'achats.lire') then
    raise exception 'Permission refusée : achats.lire' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(x order by x ->> 'hub', x ->> 'nom')
    from (
      select jsonb_build_object('article_id', a.id, 'nom', a.nom, 'reference', a.reference, 'hub_id', h.id, 'hub', h.nom,
        'stock', public.stock_hub(h.id, a.id), 'minimum', a.stock_minimum, 'cout', a.cout_achat,
        'en_commande', coalesce((select sum(l.quantite - l.quantite_recue) from public.lignes_commande_achat l
                                  join public.commandes_achat c on c.id = l.commande_id
                                  where l.article_id = a.id and c.hub_id = h.id and c.statut in ('brouillon', 'envoyee', 'partielle')), 0)) x
      from public.articles a
      join public.hubs h on h.etablissement_id = a.etablissement_id and h.actif and h.capacite_stock
      where a.etablissement_id = p_etablissement_id and a.actif and a.suivi_stock and a.stock_minimum > 0
        and public.lecture_hub(p_etablissement_id, h.id)
        and public.stock_hub(h.id, a.id) < a.stock_minimum
    ) t
  ), '[]'::jsonb);
end
$$;

create function public.tableau_de_bord_achats(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  aujourdhui date := public.date_locale(p_etablissement_id);
begin
  if not public.lecture_autorisee(p_etablissement_id, 'achats.lire') then
    raise exception 'Permission refusée : achats.lire' using errcode = '42501';
  end if;
  return (
    with c as (
      select * from public.commandes_achat
      where etablissement_id = p_etablissement_id and statut <> 'annulee' and public.lecture_hub(etablissement_id, hub_id)
    )
    select jsonb_build_object(
      'demandes', (select count(*) from c where statut = 'demande'),
      'a_recevoir', (select count(*) from c where statut in ('envoyee', 'partielle')),
      'du_fournisseurs', coalesce((select sum(montant_recu - montant_paye) from c where montant_recu > montant_paye), 0),
      'du_en_retard', coalesce((select sum(montant_recu - montant_paye) from c where montant_recu > montant_paye and echeance < aujourdhui), 0),
      'achats_mois', coalesce((select sum(r.montant) from public.receptions_achat r
                                where r.etablissement_id = p_etablissement_id and public.lecture_hub(r.etablissement_id, r.hub_id)
                                  and (r.recue_le at time zone coalesce((select fuseau from public.etablissements where id = p_etablissement_id), 'UTC'))::date
                                      >= date_trunc('month', aujourdhui)::date), 0),
      'en_retard_livraison', (select count(*) from c where statut in ('envoyee', 'partielle') and livraison_prevue < aujourdhui),
      'sous_minimum', jsonb_array_length(public.suggestions_achat(p_etablissement_id))
    )
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Disponibilité et droits d'exécution
-- ---------------------------------------------------------------------------
update public.modules set statut = 'actif', version = '1.0' where id = 'achats';
insert into public.solution_modules (solution_id, module_id, par_defaut) values ('ecommerce', 'achats', false)
on conflict (solution_id, module_id) do nothing;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.enregistrer_commande_achat(uuid, jsonb)',
    'public.changer_statut_commande_achat(uuid, text, uuid)',
    'public.receptionner_commande_achat(uuid, jsonb, text, text)',
    'public.payer_fournisseur(uuid, numeric, text, text, date)',
    'public.annuler_paiement_fournisseur(uuid, text)',
    'public.annuler_commande_achat(uuid, text)',
    'public.suggestions_achat(uuid)',
    'public.tableau_de_bord_achats(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
  foreach signature in array array['public.recalculer_commande_achat(uuid)', 'public.proteger_ligne_commande_achat()'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', signature);
  end loop;
end
$$;
