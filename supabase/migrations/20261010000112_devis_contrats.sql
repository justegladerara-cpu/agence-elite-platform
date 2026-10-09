-- Devis et contrats (lot B, 2026-10-09). Tout est désactivé par défaut : rien ne change pour un établissement qui ne
-- règle rien.
--  * Devis : lignes en option (hors total tant que le client ne les retient pas), versions (DE-00012-V2…) avec
--    l'ancienne version annulée, validité qui peut bloquer l'accord d'un devis expiré (réglage), remises au-delà d'un
--    seuil à faire valider par un responsable (réglage), échéancier informatif copié sur la facture.
--  * Nouveau module « Contrats » (Bêta) : contrats clients et fournisseurs, depuis un devis ou à la main, avenants
--    définitifs, registre des engagements (montant annualisé, fin, date limite de préavis), tableau de bord.
-- Pas de facture d'acompte : un acompte se note comme première échéance et se paie sur la facture émise.

-- ---------------------------------------------------------------------------
-- 1. Facturation : réglages et droits
-- ---------------------------------------------------------------------------
update public.modules set parametres_schema = '[
  {"cle": "delai_paiement_jours", "libelle": "Délai de paiement des factures (jours)", "type": "nombre", "defaut": 30},
  {"cle": "validite_devis_jours", "libelle": "Validité des devis (jours)", "type": "nombre", "defaut": 30},
  {"cle": "tva_par_defaut", "libelle": "Taux de TVA proposé sur les lignes (%, 0 si non assujetti)", "type": "nombre", "defaut": 0},
  {"cle": "conditions_paiement", "libelle": "Conditions de paiement imprimées", "type": "texte", "defaut": ""},
  {"cle": "mentions_factures", "libelle": "Mentions en bas des devis et factures", "type": "texte", "defaut": ""},
  {"cle": "bloquer_devis_expires", "libelle": "Refuser l''accord ou la facturation d''un devis dont la validité est dépassée", "type": "booleen", "defaut": false},
  {"cle": "remise_max_sans_validation", "libelle": "Remise maximale sans validation d''un responsable (%, 0 = pas de contrôle)", "type": "nombre", "defaut": 0}
]'::jsonb where id = 'facturation';

insert into public.permissions (id, module_id, description) values
  ('facturation.valider_remises', 'facturation', 'Valider une remise au-delà du seuil réglé')
on conflict (id) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, 'facturation.valider_remises' from unnest(array['gerant', 'responsable']) r
where exists (select 1 from public.roles where id = r)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Colonnes et échéancier
-- ---------------------------------------------------------------------------
alter table public.lignes_document_vente add column optionnelle boolean not null default false;
alter table public.lignes_document_vente add column retenue boolean not null default false;
alter table public.lignes_document_vente add constraint lignes_document_option_valide check (optionnelle or not retenue);

alter table public.documents_vente add column version smallint not null default 1 check (version between 1 and 99);
alter table public.documents_vente add column version_de uuid references public.documents_vente(id) on delete restrict;
alter table public.documents_vente add column remise_validee_pct numeric(5, 2) check (remise_validee_pct is null or remise_validee_pct between 0 and 100);
alter table public.documents_vente add column remise_validee_par uuid references auth.users(id) on delete restrict;
alter table public.documents_vente add column remise_validee_le timestamptz;
create index documents_vente_version_idx on public.documents_vente(version_de) where version_de is not null;

create table public.echeances_document (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  document_id uuid not null,
  ordre smallint not null check (ordre between 1 and 24),
  date_echeance date not null,
  montant numeric(14, 2) not null check (montant > 0),
  libelle text check (libelle is null or length(libelle) <= 80),
  cree_le timestamptz not null default now(),
  unique (document_id, ordre),
  foreign key (document_id, etablissement_id) references public.documents_vente(id, etablissement_id) on delete restrict
);
create index echeances_document_etab_idx on public.echeances_document(etablissement_id, date_echeance);
alter table public.echeances_document enable row level security;
create policy lecture on public.echeances_document for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'facturation.lire'));
revoke insert, update, delete on public.echeances_document from anon, authenticated;
create trigger echeances_document_etab before update on public.echeances_document for each row execute function public.verrouiller_etablissement_id();
create trigger echeances_document_audit after insert or update or delete on public.echeances_document for each row execute function public.journaliser_modification();

-- ---------------------------------------------------------------------------
-- 3. Calculs et contrôles
-- ---------------------------------------------------------------------------
-- Totaux : une ligne en option ne compte que si le client la retient.
create or replace function public.recalculer_document_vente(p_document_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.documents_vente d set
    total_ht = t.ht, total_tva = t.tva, total_ttc = t.ht + t.tva
  from (select coalesce(sum(total_ht), 0) ht, coalesce(sum(total_tva), 0) tva
        from public.lignes_document_vente where document_id = p_document_id and (not optionnelle or retenue)) t
  where d.id = p_document_id
$$;

-- Remise globale du document en % du montant avant remise (lignes comptées seulement).
create function public.taux_remise_document(p_document_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case when coalesce(sum(round(quantite * prix_unitaire, 2)), 0) > 0
              then round(100 * sum(remise) / sum(round(quantite * prix_unitaire, 2)), 2) else 0 end
  from public.lignes_document_vente where document_id = p_document_id and (not optionnelle or retenue)
$$;

-- Au changement de statut : validité du devis (si réglé) et remise au-delà du seuil (si réglé).
create function public.controler_document_vente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  seuil numeric;
  taux numeric;
begin
  if new.statut is not distinct from old.statut then
    return new;
  end if;
  if new.type = 'devis' and new.statut in ('accepte', 'converti') and old.statut in ('brouillon', 'envoye')
     and old.echeance is not null and old.echeance < public.date_locale(new.etablissement_id)
     and coalesce((public.parametre_module(new.etablissement_id, 'facturation', 'bloquer_devis_expires') #>> '{}')::boolean, false) then
    raise exception 'Devis expiré le % : prolongez sa validité ou faites une nouvelle version', to_char(old.echeance, 'DD/MM/YYYY');
  end if;
  if new.statut in ('envoye', 'accepte', 'converti', 'emise') then
    seuil := coalesce((public.parametre_module(new.etablissement_id, 'facturation', 'remise_max_sans_validation') #>> '{}')::numeric, 0);
    if seuil > 0 then
      taux := public.taux_remise_document(new.id);
      if taux > seuil and taux > coalesce(new.remise_validee_pct, -1) then
        raise exception 'Remise de % %% au-delà du seuil de % %% : un responsable doit la valider', taux, seuil;
      end if;
    end if;
  end if;
  return new;
end
$$;
create trigger documents_vente_controle before update on public.documents_vente
for each row execute function public.controler_document_vente();

-- Une facture née d'un devis garde la remise validée sur le devis.
create function public.heriter_validation_remise()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.documents_vente%rowtype;
begin
  if new.origine_id is not null and new.type = 'facture' and new.remise_validee_pct is null then
    select * into o from public.documents_vente where id = new.origine_id;
    if o.type = 'devis' then
      new.remise_validee_pct := o.remise_validee_pct;
      new.remise_validee_par := o.remise_validee_par;
      new.remise_validee_le := o.remise_validee_le;
    end if;
  end if;
  return new;
end
$$;
create trigger documents_vente_heritage before insert on public.documents_vente
for each row execute function public.heriter_validation_remise();

-- ---------------------------------------------------------------------------
-- 4. Devis et factures : enregistrement (lignes en option), conversion, duplication
-- ---------------------------------------------------------------------------
-- p_document : comme avant ; chaque ligne accepte en plus optionnelle (devis seulement) et retenue.
create or replace function public.enregistrer_document_vente(p_etablissement_id uuid, p_document jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p_document ->> 'id', '')::uuid;
  existant public.documents_vente%rowtype;
  v_type text := coalesce(nullif(p_document ->> 'type', ''), 'facture');
  v_contact uuid := nullif(p_document ->> 'contact_id', '')::uuid;
  v_hub uuid;
  v_date date := coalesce(nullif(p_document ->> 'date_document', '')::date, public.date_locale(p_etablissement_id));
  v_echeance date := nullif(p_document ->> 'echeance', '')::date;
  v_lignes jsonb := coalesce(p_document -> 'lignes', '[]'::jsonb);
  l jsonb;
  v_article public.articles%rowtype;
  v_quantite numeric;
  v_prix numeric;
  v_remise numeric;
  v_taux numeric;
  v_ht numeric;
  v_tva numeric;
  v_rang integer := 0;
  v_option boolean;
  delai integer;
begin
  perform public.exiger_permission(p_etablissement_id, 'facturation.gerer');
  if v_type not in ('devis', 'facture') then
    raise exception 'Type de document invalide';
  end if;
  if not exists (select 1 from public.contacts where id = v_contact and etablissement_id = p_etablissement_id and type <> 'fournisseur') then
    raise exception 'Choisissez un client de cet établissement';
  end if;
  if jsonb_typeof(v_lignes) <> 'array' or jsonb_array_length(v_lignes) = 0 then
    raise exception 'Ajoutez au moins une ligne';
  end if;
  if jsonb_array_length(v_lignes) > 200 then
    raise exception 'Pas plus de 200 lignes par document';
  end if;
  if resultat is not null then
    select * into existant from public.documents_vente where id = resultat and etablissement_id = p_etablissement_id for update;
    if existant.id is null then
      raise exception 'Document introuvable dans cet établissement';
    end if;
    perform public.exiger_acces_hub(existant.hub_id);
    if not (existant.statut = 'brouillon' or (existant.type = 'devis' and existant.statut = 'envoye')) then
      raise exception 'Ce document n''est plus modifiable';
    end if;
    v_type := existant.type;
  end if;
  v_hub := public.hub_document(p_etablissement_id, coalesce(nullif(p_document ->> 'hub_id', '')::uuid, existant.hub_id));
  if v_echeance is null then
    delai := coalesce((public.parametre_module(p_etablissement_id, 'facturation',
      case v_type when 'devis' then 'validite_devis_jours' else 'delai_paiement_jours' end) #>> '{}')::integer, 30);
    v_echeance := v_date + delai;
  end if;
  if v_echeance < v_date then
    raise exception 'L''échéance ne peut pas précéder la date du document';
  end if;

  if resultat is null then
    insert into public.documents_vente (etablissement_id, hub_id, type, numero, contact_id, date_document, echeance, objet, notes, conditions, cree_par)
    values (p_etablissement_id, v_hub, v_type,
            case when v_type = 'devis' then public.prochain_numero(p_etablissement_id, 'devis', 'DE-') end,
            v_contact, v_date, v_echeance, nullif(btrim(p_document ->> 'objet'), ''), nullif(btrim(p_document ->> 'notes'), ''),
            nullif(btrim(p_document ->> 'conditions'), ''), auth.uid())
    returning id into resultat;
  else
    update public.documents_vente set
      hub_id = v_hub, contact_id = v_contact, date_document = v_date, echeance = v_echeance,
      objet = nullif(btrim(p_document ->> 'objet'), ''), notes = nullif(btrim(p_document ->> 'notes'), ''),
      conditions = nullif(btrim(p_document ->> 'conditions'), '')
    where id = resultat;
    delete from public.lignes_document_vente where document_id = resultat;
  end if;

  for l in select * from jsonb_array_elements(v_lignes) loop
    v_rang := v_rang + 1;
    if jsonb_typeof(l) <> 'object' then
      raise exception 'Ligne % invalide', v_rang;
    end if;
    v_option := coalesce((l ->> 'optionnelle')::boolean, false);
    if v_option and v_type <> 'devis' then
      raise exception 'Une ligne en option n''existe que sur un devis (ligne %)', v_rang;
    end if;
    v_article := null;
    if nullif(l ->> 'article_id', '') is not null then
      select * into v_article from public.articles where id = (l ->> 'article_id')::uuid and etablissement_id = p_etablissement_id;
      if v_article.id is null then
        raise exception 'Article inconnu dans cet établissement (ligne %)', v_rang;
      end if;
    end if;
    v_quantite := nullif(l ->> 'quantite', '')::numeric;
    v_prix := round(coalesce(nullif(l ->> 'prix_unitaire', '')::numeric, v_article.prix_vente), 2);
    v_remise := round(coalesce(nullif(l ->> 'remise', '')::numeric, 0), 2);
    v_taux := coalesce(nullif(l ->> 'taux_tva', '')::numeric,
                       (public.parametre_module(p_etablissement_id, 'facturation', 'tva_par_defaut') #>> '{}')::numeric, 0);
    if v_quantite is null or v_quantite = 'NaN'::numeric or v_quantite <= 0 then
      raise exception 'Quantité invalide (ligne %)', v_rang;
    end if;
    if v_prix is null or v_prix = 'NaN'::numeric or v_prix < 0 then
      raise exception 'Prix invalide (ligne %)', v_rang;
    end if;
    if v_remise = 'NaN'::numeric or v_remise < 0 or v_remise > round(v_quantite * v_prix, 2) then
      raise exception 'Remise invalide (ligne %)', v_rang;
    end if;
    if v_taux = 'NaN'::numeric or v_taux < 0 or v_taux > 100 then
      raise exception 'Taux de TVA invalide (ligne %)', v_rang;
    end if;
    v_ht := round(v_quantite * v_prix, 2) - v_remise;
    v_tva := round(v_ht * v_taux / 100, 2);
    insert into public.lignes_document_vente (document_id, etablissement_id, ordre, article_id, libelle, description, quantite, unite,
      prix_unitaire, remise, taux_tva, total_ht, total_tva, total_ttc, optionnelle, retenue)
    values (resultat, p_etablissement_id, v_rang, v_article.id,
            coalesce(nullif(btrim(l ->> 'libelle'), ''), v_article.nom),
            nullif(btrim(l ->> 'description'), ''), v_quantite, coalesce(nullif(btrim(l ->> 'unite'), ''), v_article.unite),
            v_prix, v_remise, v_taux, v_ht, v_tva, v_ht + v_tva,
            v_option, v_option and coalesce((l ->> 'retenue')::boolean, false));
  end loop;
  perform public.recalculer_document_vente(resultat);
  return resultat;
end
$$;

-- Le client retient (ou non) une ligne en option ; le total suit.
create function public.retenir_option_devis(p_ligne_id uuid, p_retenue boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lignes_document_vente%rowtype;
  doc public.documents_vente%rowtype;
begin
  select * into l from public.lignes_document_vente where id = p_ligne_id;
  select * into doc from public.documents_vente where id = l.document_id for update;
  if l.id is null or doc.type <> 'devis' then
    raise exception 'Ligne introuvable';
  end if;
  perform public.exiger_permission(doc.etablissement_id, 'facturation.gerer');
  perform public.exiger_acces_hub(doc.hub_id);
  if not l.optionnelle then
    raise exception 'Cette ligne n''est pas en option';
  end if;
  if doc.statut not in ('brouillon', 'envoye') then
    raise exception 'Les options se choisissent avant l''accord du client';
  end if;
  update public.lignes_document_vente set retenue = coalesce(p_retenue, false) where id = l.id;
  perform public.recalculer_document_vente(doc.id);
end
$$;

-- Conversion : seules les lignes comptées passent sur la facture ; l'échéancier suit si le total n'a pas changé.
create or replace function public.convertir_devis(p_document_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.documents_vente%rowtype;
  resultat uuid;
  delai integer;
  v_total numeric;
begin
  select * into doc from public.documents_vente where id = p_document_id for update;
  if doc.id is null or doc.type <> 'devis' then
    raise exception 'Devis introuvable';
  end if;
  perform public.exiger_permission(doc.etablissement_id, 'facturation.gerer');
  perform public.exiger_acces_hub(doc.hub_id);
  if doc.statut not in ('envoye', 'accepte', 'brouillon') then
    raise exception 'Ce devis ne peut plus être facturé (%)', doc.statut;
  end if;
  delai := coalesce((public.parametre_module(doc.etablissement_id, 'facturation', 'delai_paiement_jours') #>> '{}')::integer, 30);
  insert into public.documents_vente (etablissement_id, hub_id, type, contact_id, date_document, echeance, objet, notes, conditions, origine_id, cree_par)
  values (doc.etablissement_id, doc.hub_id, 'facture', doc.contact_id, public.date_locale(doc.etablissement_id),
          public.date_locale(doc.etablissement_id) + delai, doc.objet, doc.notes, doc.conditions, doc.id, auth.uid())
  returning id into resultat;
  insert into public.lignes_document_vente (document_id, etablissement_id, ordre, article_id, libelle, description, quantite, unite,
    prix_unitaire, remise, taux_tva, total_ht, total_tva, total_ttc)
  select resultat, etablissement_id, row_number() over (order by ordre), article_id, libelle, description, quantite, unite, prix_unitaire,
         remise, taux_tva, total_ht, total_tva, total_ttc
  from public.lignes_document_vente where document_id = doc.id and (not optionnelle or retenue);
  perform public.recalculer_document_vente(resultat);
  select total_ttc into v_total from public.documents_vente where id = resultat;
  if v_total = (select coalesce(sum(montant), 0) from public.echeances_document where document_id = doc.id) then
    insert into public.echeances_document (etablissement_id, document_id, ordre, date_echeance, montant, libelle)
    select etablissement_id, resultat, ordre, date_echeance, montant, libelle from public.echeances_document where document_id = doc.id;
  end if;
  update public.documents_vente set statut = 'converti' where id = doc.id;
  perform public.crm_synchroniser_devis(doc.id, 'gagnee');
  return resultat;
end
$$;

-- Copie en nouveau brouillon : garde les options.
create or replace function public.dupliquer_document_vente(p_document_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.documents_vente%rowtype;
  resultat uuid;
begin
  select * into doc from public.documents_vente where id = p_document_id;
  if doc.id is null or doc.type = 'avoir' then
    raise exception 'Document introuvable';
  end if;
  perform public.exiger_permission(doc.etablissement_id, 'facturation.gerer');
  resultat := public.enregistrer_document_vente(doc.etablissement_id, jsonb_build_object(
    'type', doc.type, 'contact_id', doc.contact_id, 'hub_id', doc.hub_id, 'objet', doc.objet, 'notes', doc.notes, 'conditions', doc.conditions,
    'lignes', (select jsonb_agg(jsonb_build_object('article_id', article_id, 'libelle', libelle, 'description', description, 'quantite', quantite,
                 'unite', unite, 'prix_unitaire', prix_unitaire, 'remise', remise, 'taux_tva', taux_tva,
                 'optionnelle', optionnelle, 'retenue', retenue) order by ordre)
               from public.lignes_document_vente where document_id = doc.id)));
  return resultat;
end
$$;

-- Nouvelle version d'un devis : brouillon numéroté DE-…-V2, l'ancienne version encore ouverte est annulée et
-- l'opportunité CRM ouverte suit la nouvelle version.
create function public.nouvelle_version_devis(p_document_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.documents_vente%rowtype;
  racine public.documents_vente%rowtype;
  v_version smallint;
  v_date date;
  resultat uuid;
begin
  select * into doc from public.documents_vente where id = p_document_id for update;
  if doc.id is null or doc.type <> 'devis' then
    raise exception 'Devis introuvable';
  end if;
  perform public.exiger_permission(doc.etablissement_id, 'facturation.gerer');
  perform public.exiger_acces_hub(doc.hub_id);
  if doc.statut not in ('brouillon', 'envoye', 'accepte', 'refuse') then
    raise exception 'Ce devis est clos (%) : dupliquez-le plutôt', doc.statut;
  end if;
  select * into racine from public.documents_vente where id = coalesce(doc.version_de, doc.id);
  select max(version) into v_version from public.documents_vente where id = racine.id or version_de = racine.id;
  if doc.version <> v_version then
    raise exception 'Une version plus récente existe déjà (V%)', v_version;
  end if;
  if v_version >= 99 then
    raise exception 'Trop de versions pour ce devis';
  end if;
  v_version := v_version + 1;
  v_date := public.date_locale(doc.etablissement_id);
  insert into public.documents_vente (etablissement_id, hub_id, type, numero, contact_id, date_document, echeance, objet, notes, conditions,
    cree_par, version, version_de)
  values (doc.etablissement_id, doc.hub_id, 'devis', racine.numero || '-V' || v_version, doc.contact_id, v_date,
          v_date + coalesce((public.parametre_module(doc.etablissement_id, 'facturation', 'validite_devis_jours') #>> '{}')::integer, 30),
          doc.objet, doc.notes, doc.conditions, auth.uid(), v_version, racine.id)
  returning id into resultat;
  insert into public.lignes_document_vente (document_id, etablissement_id, ordre, article_id, libelle, description, quantite, unite,
    prix_unitaire, remise, taux_tva, total_ht, total_tva, total_ttc, optionnelle, retenue)
  select resultat, etablissement_id, ordre, article_id, libelle, description, quantite, unite, prix_unitaire, remise, taux_tva,
         total_ht, total_tva, total_ttc, optionnelle, retenue
  from public.lignes_document_vente where document_id = doc.id;
  perform public.recalculer_document_vente(resultat);
  if doc.statut in ('brouillon', 'envoye', 'accepte') then
    update public.documents_vente set statut = 'annule', annule_le = now(), annule_par = auth.uid(),
      motif_annulation = 'Remplacé par la version ' || v_version
    where id = doc.id;
  end if;
  update public.crm_opportunites set document_vente_id = resultat
  where document_vente_id = doc.id and etablissement_id = doc.etablissement_id and statut = 'ouverte';
  return resultat;
end
$$;

-- Validation de la remise actuelle par un responsable (le taux validé est retenu : une remise plus forte redemande
-- une validation).
create function public.valider_remise_document(p_document_id uuid)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.documents_vente%rowtype;
  taux numeric;
begin
  select * into doc from public.documents_vente where id = p_document_id for update;
  if doc.id is null or doc.type = 'avoir' then
    raise exception 'Document introuvable';
  end if;
  perform public.exiger_permission(doc.etablissement_id, 'facturation.valider_remises');
  perform public.exiger_acces_hub(doc.hub_id);
  if doc.statut not in ('brouillon', 'envoye', 'accepte') then
    raise exception 'Ce document n''attend plus de validation';
  end if;
  taux := public.taux_remise_document(doc.id);
  update public.documents_vente set remise_validee_pct = taux, remise_validee_par = auth.uid(), remise_validee_le = now() where id = doc.id;
  return taux;
end
$$;

-- Échéancier : p_echeances = [{ date_echeance, montant, libelle? }] ; la somme égale le total ; [] efface.
create function public.definir_echeancier(p_document_id uuid, p_echeances jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.documents_vente%rowtype;
  e jsonb;
  n integer := 0;
  v_somme numeric := 0;
  v_montant numeric;
  v_date date;
  v_precedente date;
begin
  select * into doc from public.documents_vente where id = p_document_id for update;
  if doc.id is null or doc.type = 'avoir' then
    raise exception 'Document introuvable';
  end if;
  perform public.exiger_permission(doc.etablissement_id, 'facturation.gerer');
  perform public.exiger_acces_hub(doc.hub_id);
  if not ((doc.type = 'devis' and doc.statut in ('brouillon', 'envoye', 'accepte'))
       or (doc.type = 'facture' and doc.statut in ('brouillon', 'emise'))) then
    raise exception 'Ce document ne reçoit plus d''échéancier';
  end if;
  if p_echeances is null or jsonb_typeof(p_echeances) <> 'array' then
    raise exception 'Échéancier invalide';
  end if;
  if jsonb_array_length(p_echeances) > 24 then
    raise exception 'Pas plus de 24 échéances';
  end if;
  delete from public.echeances_document where document_id = doc.id;
  for e in select * from jsonb_array_elements(p_echeances) loop
    n := n + 1;
    v_montant := nullif(e ->> 'montant', '')::numeric;
    v_date := nullif(e ->> 'date_echeance', '')::date;
    if v_montant is null or v_montant = 'NaN'::numeric or v_montant <= 0 or v_montant <> round(v_montant, 2) then
      raise exception 'Montant invalide (échéance %)', n;
    end if;
    if v_date is null or v_date < doc.date_document then
      raise exception 'Date invalide (échéance %) : pas avant la date du document', n;
    end if;
    if v_precedente is not null and v_date < v_precedente then
      raise exception 'Les échéances doivent être dans l''ordre des dates';
    end if;
    v_precedente := v_date;
    v_somme := v_somme + v_montant;
    insert into public.echeances_document (etablissement_id, document_id, ordre, date_echeance, montant, libelle)
    values (doc.etablissement_id, doc.id, n, v_date, v_montant, left(nullif(btrim(e ->> 'libelle'), ''), 80));
  end loop;
  if n > 0 and v_somme <> doc.total_ttc then
    raise exception 'Le total des échéances (%) doit égaler le total du document (%)', v_somme, doc.total_ttc;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Module « Contrats » (Bêta)
-- ---------------------------------------------------------------------------
insert into public.modules (id, nom, description, nature, statut, categorie, icone, ordre, version, documentation) values
  ('contrats', 'Contrats', 'Contrats clients et fournisseurs, avenants, registre des engagements et échéances de préavis.',
   'transversal', 'beta', 'facturation', 'document', 52, '0.1', 'docs/CONTRATS.md')
on conflict (id) do nothing;
update public.modules set parametres_schema = '[
  {"cle": "alerte_jours", "libelle": "Prévenir avant la fin d''un contrat ou la date limite de préavis (jours)", "type": "nombre", "defaut": 60}
]'::jsonb where id = 'contrats';
insert into public.module_dependances (module_id, depend_de) values ('contrats', 'contacts')
on conflict do nothing;
insert into public.solution_modules (solution_id, module_id, par_defaut)
select s.id, 'contrats', false from public.solutions s
on conflict (solution_id, module_id) do nothing;

insert into public.permissions (id, module_id, description) values
  ('contrats.lire', 'contrats', 'Voir les contrats, avenants et le registre des engagements'),
  ('contrats.gerer', 'contrats', 'Créer les contrats, les activer, suspendre, terminer, résilier, ajouter un avenant')
on conflict (id) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['gerant', 'responsable', 'commercial']) r
cross join unnest(array['contrats.lire', 'contrats.gerer']) p
where exists (select 1 from public.roles where id = r)
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, 'contrats.lire' from unnest(array['lecteur', 'comptable']) r
where exists (select 1 from public.roles where id = r)
on conflict do nothing;

create table public.contrats (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  numero text not null,
  sens text not null default 'client' check (sens in ('client', 'fournisseur')),
  contact_id uuid not null references public.contacts(id) on delete restrict,
  document_vente_id uuid references public.documents_vente(id) on delete restrict,
  objet text not null check (btrim(objet) <> '' and length(objet) <= 200),
  debut date not null,
  fin date,
  montant numeric(14, 2) not null default 0 check (montant >= 0),
  periodicite text not null default 'unique' check (periodicite in ('unique', 'mensuelle', 'trimestrielle', 'annuelle')),
  reconduction_tacite boolean not null default false,
  preavis_jours integer not null default 0 check (preavis_jours between 0 and 365),
  conditions text check (conditions is null or length(conditions) <= 4000),
  responsable_id uuid references auth.users(id) on delete restrict,
  statut text not null default 'brouillon' check (statut in ('brouillon', 'actif', 'suspendu', 'termine', 'resilie', 'annule')),
  signe_le date,
  motif text check (motif is null or length(motif) <= 300),
  version integer not null default 1,
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (etablissement_id, numero),
  unique (id, etablissement_id),
  check (fin is null or fin >= debut),
  check (statut in ('brouillon', 'annule') or signe_le is not null),
  check (statut not in ('suspendu', 'resilie', 'annule') or btrim(coalesce(motif, '')) <> '')
);
create index contrats_etab_idx on public.contrats(etablissement_id, statut, fin);
create index contrats_contact_idx on public.contrats(contact_id);
create index contrats_document_idx on public.contrats(document_vente_id) where document_vente_id is not null;

create table public.contrat_avenants (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  contrat_id uuid not null,
  numero integer not null,
  date_effet date not null,
  objet text not null check (btrim(objet) <> '' and length(objet) <= 200),
  description text check (description is null or length(description) <= 4000),
  montant_avant numeric(14, 2) not null,
  montant_apres numeric(14, 2) not null,
  fin_avant date,
  fin_apres date,
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  unique (contrat_id, numero),
  foreign key (contrat_id, etablissement_id) references public.contrats(id, etablissement_id) on delete restrict
);

alter table public.contrats enable row level security;
alter table public.contrat_avenants enable row level security;
create policy lecture on public.contrats for select to authenticated using (public.lecture_autorisee(etablissement_id, 'contrats.lire'));
create policy lecture on public.contrat_avenants for select to authenticated using (public.lecture_autorisee(etablissement_id, 'contrats.lire'));
revoke insert, update, delete on public.contrats, public.contrat_avenants from anon, authenticated;

insert into public.types_pieces_jointes (objet_type, table_nom, module_id, permission_lire, permission_ecrire, libelle)
values ('contrat', 'contrats', 'contrats', 'contrats.lire', 'contrats.gerer', 'Contrat')
on conflict (objet_type) do nothing;

create trigger contrats_etab before update on public.contrats for each row execute function public.verrouiller_etablissement_id();
create trigger contrats_modifie_le before update on public.contrats for each row execute function public.fixer_modifie_le();
create trigger contrats_sans_suppression before delete on public.contrats for each row execute function public.refuser_suppression();
create trigger contrats_audit after insert or update or delete on public.contrats for each row execute function public.journaliser_modification();
create trigger contrat_avenants_definitifs before update on public.contrat_avenants for each row execute function public.refuser_modification();
create trigger contrat_avenants_sans_suppression before delete on public.contrat_avenants for each row execute function public.refuser_suppression();
create trigger contrat_avenants_audit after insert on public.contrat_avenants for each row execute function public.journaliser_modification();

-- Montant d'un contrat ramené à l'année (un contrat « unique » compte pour son montant).
create function public.montant_annuel_contrat(p_montant numeric, p_periodicite text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select p_montant * case p_periodicite when 'mensuelle' then 12 when 'trimestrielle' then 4 else 1 end
$$;

-- Création ou modification d'un contrat en brouillon. Un contrat signé ne change que par avenant.
create function public.enregistrer_contrat(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p ->> 'id', '')::uuid;
  existant public.contrats%rowtype;
  v_sens text := coalesce(nullif(p ->> 'sens', ''), 'client');
  v_contact uuid := nullif(p ->> 'contact_id', '')::uuid;
  v_doc uuid := nullif(p ->> 'document_vente_id', '')::uuid;
  v_resp uuid := nullif(p ->> 'responsable_id', '')::uuid;
  v_debut date := coalesce(nullif(p ->> 'debut', '')::date, public.date_locale(p_etablissement_id));
  v_fin date := nullif(p ->> 'fin', '')::date;
  v_montant numeric := coalesce(nullif(p ->> 'montant', '')::numeric, 0);
  v_periodicite text := coalesce(nullif(p ->> 'periodicite', ''), 'unique');
  v_preavis integer := coalesce(nullif(p ->> 'preavis_jours', '')::integer, 0);
begin
  perform public.exiger_permission(p_etablissement_id, 'contrats.gerer');
  if v_sens not in ('client', 'fournisseur') then
    raise exception 'Sens du contrat invalide';
  end if;
  if not exists (select 1 from public.contacts where id = v_contact and etablissement_id = p_etablissement_id
                 and (type = 'les_deux' or (v_sens = 'fournisseur') = (type = 'fournisseur'))) then
    raise exception 'Choisissez un % de cet établissement', case v_sens when 'client' then 'client' else 'fournisseur' end;
  end if;
  if v_doc is not null and not exists (select 1 from public.documents_vente where id = v_doc and etablissement_id = p_etablissement_id and type = 'devis') then
    raise exception 'Devis inconnu dans cet établissement';
  end if;
  if v_resp is not null and not exists (select 1 from public.etablissement_membres where etablissement_id = p_etablissement_id and user_id = v_resp and actif) then
    raise exception 'Le responsable doit être membre de l''établissement';
  end if;
  if coalesce(btrim(p ->> 'objet'), '') = '' then
    raise exception 'L''objet du contrat est obligatoire';
  end if;
  if v_montant = 'NaN'::numeric or v_montant < 0 or v_montant <> round(v_montant, 2) then
    raise exception 'Montant invalide';
  end if;
  if v_periodicite not in ('unique', 'mensuelle', 'trimestrielle', 'annuelle') then
    raise exception 'Périodicité invalide';
  end if;
  if v_preavis < 0 or v_preavis > 365 then
    raise exception 'Le préavis va de 0 à 365 jours';
  end if;
  if v_fin is not null and v_fin < v_debut then
    raise exception 'La fin ne peut pas précéder le début';
  end if;
  if resultat is null then
    insert into public.contrats (etablissement_id, numero, sens, contact_id, document_vente_id, objet, debut, fin, montant, periodicite,
      reconduction_tacite, preavis_jours, conditions, responsable_id, cree_par)
    values (p_etablissement_id, public.prochain_numero(p_etablissement_id, 'contrat', 'CT-'), v_sens, v_contact, v_doc,
            btrim(p ->> 'objet'), v_debut, v_fin, v_montant, v_periodicite, coalesce((p ->> 'reconduction_tacite')::boolean, false),
            v_preavis, nullif(btrim(p ->> 'conditions'), ''), v_resp, auth.uid())
    returning id into resultat;
  else
    select * into existant from public.contrats where id = resultat and etablissement_id = p_etablissement_id for update;
    if existant.id is null then
      raise exception 'Contrat introuvable dans cet établissement';
    end if;
    if existant.statut <> 'brouillon' then
      raise exception 'Un contrat signé ne se modifie que par avenant';
    end if;
    update public.contrats set sens = v_sens, contact_id = v_contact, document_vente_id = v_doc, objet = btrim(p ->> 'objet'),
      debut = v_debut, fin = v_fin, montant = v_montant, periodicite = v_periodicite,
      reconduction_tacite = coalesce((p ->> 'reconduction_tacite')::boolean, false), preavis_jours = v_preavis,
      conditions = nullif(btrim(p ->> 'conditions'), ''), responsable_id = v_resp
    where id = resultat;
  end if;
  return resultat;
end
$$;

-- Contrat en brouillon depuis un devis accepté ou facturé (client, objet, montant, conditions repris).
create function public.contrat_depuis_devis(p_document_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.documents_vente%rowtype;
begin
  select * into doc from public.documents_vente where id = p_document_id;
  if doc.id is null or doc.type <> 'devis' or not public.lecture_autorisee(doc.etablissement_id, 'facturation.lire')
     or not public.lecture_hub(doc.etablissement_id, doc.hub_id) then
    raise exception 'Devis introuvable';
  end if;
  perform public.exiger_permission(doc.etablissement_id, 'contrats.gerer');
  if doc.statut not in ('accepte', 'converti') then
    raise exception 'Seul un devis accepté ou facturé devient un contrat';
  end if;
  if exists (select 1 from public.contrats where document_vente_id = doc.id and statut <> 'annule') then
    raise exception 'Un contrat existe déjà pour ce devis';
  end if;
  return public.enregistrer_contrat(doc.etablissement_id, jsonb_build_object(
    'sens', 'client', 'contact_id', doc.contact_id, 'document_vente_id', doc.id,
    'objet', left(coalesce(doc.objet, 'Selon devis ' || doc.numero), 200), 'montant', doc.total_ttc,
    'debut', public.date_locale(doc.etablissement_id), 'conditions', doc.conditions, 'responsable_id', auth.uid()));
end
$$;

-- Cycle : brouillon → actif (signé le) | annulé ; actif ⇄ suspendu ; actif ou suspendu → terminé | résilié.
create function public.changer_statut_contrat(p_contrat_id uuid, p_statut text, p_motif text default null, p_signe_le date default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.contrats%rowtype;
begin
  select * into k from public.contrats where id = p_contrat_id for update;
  if k.id is null then
    raise exception 'Contrat introuvable';
  end if;
  perform public.exiger_permission(k.etablissement_id, 'contrats.gerer');
  if not ((k.statut = 'brouillon' and p_statut in ('actif', 'annule'))
       or (k.statut = 'actif' and p_statut in ('suspendu', 'termine', 'resilie'))
       or (k.statut = 'suspendu' and p_statut in ('actif', 'termine', 'resilie'))) then
    raise exception 'Passage impossible de « % » à « % »', k.statut, p_statut;
  end if;
  if p_statut in ('suspendu', 'resilie', 'annule') and coalesce(btrim(p_motif), '') = '' then
    raise exception 'Le motif est obligatoire';
  end if;
  update public.contrats set
    statut = p_statut,
    signe_le = case when k.statut = 'brouillon' and p_statut = 'actif' then coalesce(p_signe_le, public.date_locale(k.etablissement_id)) else signe_le end,
    motif = case when p_statut in ('suspendu', 'resilie', 'annule', 'termine') then coalesce(left(nullif(btrim(p_motif), ''), 300), motif) else motif end
  where id = k.id;
end
$$;

-- Avenant définitif : objet, date d'effet, nouveau montant et/ou nouvelle fin ; le contrat est mis à jour.
create function public.ajouter_avenant(p_contrat_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.contrats%rowtype;
  v_montant numeric := nullif(p ->> 'montant', '')::numeric;
  v_fin date := nullif(p ->> 'fin', '')::date;
  v_effet date := nullif(p ->> 'date_effet', '')::date;
  v_numero integer;
  resultat uuid;
begin
  select * into k from public.contrats where id = p_contrat_id for update;
  if k.id is null then
    raise exception 'Contrat introuvable';
  end if;
  perform public.exiger_permission(k.etablissement_id, 'contrats.gerer');
  if k.statut not in ('actif', 'suspendu') then
    raise exception 'Un avenant ne s''ajoute qu''à un contrat en cours';
  end if;
  if coalesce(btrim(p ->> 'objet'), '') = '' then
    raise exception 'L''objet de l''avenant est obligatoire';
  end if;
  if v_effet is null or v_effet < k.debut then
    raise exception 'La date d''effet est obligatoire et ne précède pas le début du contrat';
  end if;
  if v_montant is not null and (v_montant = 'NaN'::numeric or v_montant < 0 or v_montant <> round(v_montant, 2)) then
    raise exception 'Montant invalide';
  end if;
  if v_fin is not null and v_fin < k.debut then
    raise exception 'La fin ne peut pas précéder le début du contrat';
  end if;
  select coalesce(max(numero), 0) + 1 into v_numero from public.contrat_avenants where contrat_id = k.id;
  insert into public.contrat_avenants (etablissement_id, contrat_id, numero, date_effet, objet, description, montant_avant, montant_apres,
    fin_avant, fin_apres, cree_par)
  values (k.etablissement_id, k.id, v_numero, v_effet, left(btrim(p ->> 'objet'), 200), nullif(btrim(p ->> 'description'), ''),
          k.montant, coalesce(v_montant, k.montant), k.fin, coalesce(v_fin, k.fin), auth.uid())
  returning id into resultat;
  update public.contrats set montant = coalesce(v_montant, montant), fin = coalesce(v_fin, fin), version = v_numero + 1 where id = k.id;
  return resultat;
end
$$;

-- Délai d'alerte réglé (le tableau de bord s'exécute avec les droits de l'appelant).
create function public.contrats_alerte_jours(p_etablissement_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.lecture_autorisee(p_etablissement_id, 'contrats.lire')
              then coalesce((public.parametre_module(p_etablissement_id, 'contrats', 'alerte_jours') #>> '{}')::integer, 60) end
$$;

-- Tableau de bord du domaine « contrats ».
create function public.cockpit_contrats(p_etablissement_id uuid, p_du date, p_au date, p_filtres jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  c public.cockpit_ctx;
  alerte integer;
  v_actifs bigint; v_clients numeric; v_fournisseurs numeric; v_fin bigint; v_preavis bigint; v_brouillons bigint; v_suspendus bigint;
  v_avenants bigint; v_signes bigint; v_signes_p bigint;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'contrats.lire') then
    raise exception 'Permission refusée : contrats.lire' using errcode = '42501';
  end if;
  c := public.cockpit_preparer(p_etablissement_id, p_du, p_au, p_filtres);
  alerte := coalesce(public.contrats_alerte_jours(p_etablissement_id), 60);
  select count(*) filter (where k.statut = 'actif'),
         coalesce(sum(public.montant_annuel_contrat(k.montant, k.periodicite)) filter (where k.statut = 'actif' and k.sens = 'client'), 0),
         coalesce(sum(public.montant_annuel_contrat(k.montant, k.periodicite)) filter (where k.statut = 'actif' and k.sens = 'fournisseur'), 0),
         count(*) filter (where k.statut in ('actif', 'suspendu') and k.fin between c.auj and c.auj + alerte),
         count(*) filter (where k.statut in ('actif', 'suspendu') and k.reconduction_tacite and k.fin is not null
                          and k.fin - k.preavis_jours between c.auj and c.auj + alerte),
         count(*) filter (where k.statut = 'brouillon'),
         count(*) filter (where k.statut = 'suspendu'),
         count(*) filter (where k.signe_le between c.du and c.au),
         count(*) filter (where k.signe_le between c.pdu and c.pau)
  into v_actifs, v_clients, v_fournisseurs, v_fin, v_preavis, v_brouillons, v_suspendus, v_signes, v_signes_p
  from public.contrats k where k.etablissement_id = p_etablissement_id;
  select count(*) into v_avenants from public.contrat_avenants a
  where a.etablissement_id = p_etablissement_id and (a.cree_le at time zone c.tz)::date between c.du and c.au;
  return jsonb_build_object(
    'domaine', 'contrats',
    'periode', jsonb_build_object('du', c.du, 'au', c.au, 'du_precedent', c.pdu, 'au_precedent', c.pau, 'comparable', v_signes_p > 0),
    'kpis', public.cockpit_liste(array[
      public.cockpit_kpi('actifs', 'Contrats en cours', v_actifs, 'nombre', 'contrats?statut=actif', null, null, null, true),
      public.cockpit_kpi('engagement_clients', 'Engagements clients (par an)', v_clients, 'montant', 'contrats?vue=registre', null, 'Montant annualisé des contrats en cours', null, true),
      public.cockpit_kpi('engagement_fournisseurs', 'Engagements fournisseurs (par an)', v_fournisseurs, 'montant', 'contrats?vue=registre', null, 'Montant annualisé des contrats en cours'),
      public.cockpit_kpi('signes', 'Contrats signés', v_signes, 'nombre', 'contrats', case when v_signes_p > 0 then v_signes_p end),
      public.cockpit_kpi('avenants', 'Avenants', v_avenants, 'nombre', 'contrats', null, 'Sur la période')
    ]),
    'attention', public.cockpit_liste(array[
      public.cockpit_alerte('preavis', 'alerte', 'Date limite de préavis proche', format('Reconduction tacite, dans les %s jours', alerte), v_preavis, 'contrats?vue=registre&filtre=preavis'),
      public.cockpit_alerte('fin', 'alerte', 'Contrats arrivant à leur fin', format('Dans les %s jours', alerte), v_fin, 'contrats?vue=registre&filtre=fin'),
      public.cockpit_alerte('suspendus', 'info', 'Contrats suspendus', null, v_suspendus, 'contrats?statut=suspendu'),
      public.cockpit_alerte('brouillons', 'info', 'Contrats à faire signer', 'En brouillon', v_brouillons, 'contrats?statut=brouillon')
    ]),
    'graphiques', '[]'::jsonb,
    'listes', '[]'::jsonb,
    'activite', '[]'::jsonb
  );
end
$$;

create or replace function public.cockpit_domaines(p_etablissement_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'titre', d.titre) order by d.ordre), '[]'::jsonb)
  from (values
    (1, 'commerce', 'Commerce', public.lecture_autorisee(p_etablissement_id, 'ventes.lire') and public.module_actif(p_etablissement_id, 'caisse')
        and ((select e.solution_id from public.etablissements e where e.id = p_etablissement_id) = 'commerce'
             or exists (select 1 from public.ventes v where v.etablissement_id = p_etablissement_id and v.origine = 'caisse'))),
    (2, 'restaurant', 'Restaurant', public.lecture_autorisee(p_etablissement_id, 'restaurant_salle.lire')),
    (3, 'hotel', 'Hôtel', public.lecture_autorisee(p_etablissement_id, 'hotel_reservations.lire')),
    (4, 'scolaire', 'Scolaire', public.lecture_autorisee(p_etablissement_id, 'scolaire.lire')),
    (5, 'boutique', 'E-commerce', public.lecture_autorisee(p_etablissement_id, 'ecommerce_boutique.lire')),
    (6, 'livraisons', 'Livraisons', public.lecture_autorisee(p_etablissement_id, 'livraisons.lire')),
    (7, 'location', 'Location', public.lecture_autorisee(p_etablissement_id, 'location.lire')),
    (8, 'facturation', 'Facturation', public.lecture_autorisee(p_etablissement_id, 'facturation.lire')),
    (9, 'contrats', 'Contrats', public.lecture_autorisee(p_etablissement_id, 'contrats.lire')),
    (10, 'tresorerie', 'Trésorerie', public.lecture_autorisee(p_etablissement_id, 'depenses.lire') and public.lecture_autorisee(p_etablissement_id, 'paiements.lire')),
    (11, 'comptabilite', 'Comptabilité', public.lecture_autorisee(p_etablissement_id, 'comptabilite.lire')),
    (12, 'crm', 'CRM', public.lecture_autorisee(p_etablissement_id, 'crm_pipeline.lire')),
    (13, 'marketing', 'Marketing', public.lecture_autorisee(p_etablissement_id, 'marketing.lire')),
    (14, 'achats', 'Achats', public.lecture_autorisee(p_etablissement_id, 'achats.lire')),
    (15, 'production', 'Production', public.lecture_autorisee(p_etablissement_id, 'production.lire')),
    (16, 'rh', 'RH', public.lecture_autorisee(p_etablissement_id, 'rh_employes.lire')),
    (17, 'projets', 'Projets', public.lecture_autorisee(p_etablissement_id, 'projets.lire')),
    (18, 'agenda', 'Agenda', public.lecture_autorisee(p_etablissement_id, 'agenda.lire')),
    (19, 'support', 'Support', public.lecture_autorisee(p_etablissement_id, 'support_tickets.lire')),
    (20, 'abonnements', 'Abonnements', public.lecture_autorisee(p_etablissement_id, 'abonnements.lire')),
    (21, 'fidelite', 'Fidélité', public.lecture_autorisee(p_etablissement_id, 'fidelite.lire')),
    (22, 'siteweb', 'Site web', public.lecture_autorisee(p_etablissement_id, 'site_web.lire'))
  ) as d(ordre, id, titre, visible)
  where d.visible
$$;

-- ---------------------------------------------------------------------------
-- 6. Droits d'exécution
-- ---------------------------------------------------------------------------
do $$
declare signature text;
begin
  foreach signature in array array[
    'public.enregistrer_document_vente(uuid, jsonb)', 'public.retenir_option_devis(uuid, boolean)', 'public.convertir_devis(uuid)',
    'public.dupliquer_document_vente(uuid)', 'public.nouvelle_version_devis(uuid)', 'public.valider_remise_document(uuid)',
    'public.definir_echeancier(uuid, jsonb)', 'public.enregistrer_contrat(uuid, jsonb)', 'public.contrat_depuis_devis(uuid)',
    'public.changer_statut_contrat(uuid, text, text, date)', 'public.ajouter_avenant(uuid, jsonb)',
    'public.cockpit_contrats(uuid, date, date, jsonb)', 'public.contrats_alerte_jours(uuid)', 'public.cockpit_domaines(uuid)', 'public.montant_annuel_contrat(numeric, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
  foreach signature in array array[
    'public.recalculer_document_vente(uuid)', 'public.taux_remise_document(uuid)',
    'public.controler_document_vente()', 'public.heriter_validation_remise()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', signature);
  end loop;
end
$$;

notify pgrst, 'reload schema';
