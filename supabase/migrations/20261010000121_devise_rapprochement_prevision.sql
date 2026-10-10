-- Lot E2 (2026-10-10), suite de la demande des 150 fonctions :
-- 1. Taux de change (ligne 97) : historique des taux saisis par l'établissement (1 unité de la devise = X dans la devise
--    de l'établissement), avec date et source. Rien ne se modifie : une correction est une nouvelle saisie.
-- 2. Devise conservée par document (ligne 19) : un devis ou une facture en préparation peut être présenté dans la
--    devise du client ; le taux retenu (date, source) est figé sur le document, recopié sur la facture née du devis,
--    la nouvelle version et l'avoir. La comptabilité, les ventes et les rapports restent dans la devise de
--    l'établissement : le montant dans la devise du client est une contre-valeur affichée, jamais une autre vérité.
-- 3. Rapprochement banque / Mobile Money (ligne 92) : import d'un relevé (CSV lu dans le navigateur, sans connexion
--    bancaire), lignes déjà importées ignorées, propositions de rapprochement (même montant, dates proches, référence
--    retrouvée) avec les paiements reçus, les paiements fournisseurs et les dépenses ; rapprocher, ignorer, défaire.
-- 4. Prévision de trésorerie par scénario (ligne 98) : semaine par semaine, encaissements attendus (factures et
--    échéanciers, abonnements) et décaissements (achats à payer, dépenses courantes), selon trois scénarios réglables
--    (prudent, central, optimiste). Lecture seule.
-- Aucune ligne existante n'est modifiée : les nouvelles colonnes restent vides tant qu'on ne s'en sert pas.

-- ---------------------------------------------------------------------------
-- 1. Droits
-- ---------------------------------------------------------------------------
insert into public.permissions (id, module_id, description) values
  ('paiements.rapprocher', 'paiements', 'Importer les relevés de banque ou de Mobile Money et rapprocher les paiements')
on conflict (id) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, 'paiements.rapprocher' from unnest(array['gerant', 'responsable', 'comptable']) r
where exists (select 1 from public.roles where id = r)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Taux de change et devise des documents
-- ---------------------------------------------------------------------------
create table public.taux_change (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  devise text not null check (devise ~ '^[A-Z]{3}$'),
  jour date not null,
  taux numeric(20, 8) not null check (taux > 0 and taux < 1000000000),
  source text check (source is null or length(source) <= 120),
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now()
);
create index taux_change_etab_idx on public.taux_change(etablissement_id, devise, jour desc, cree_le desc);

alter table public.documents_vente add column devise_document text check (devise_document is null or devise_document ~ '^[A-Z]{3}$');
alter table public.documents_vente add column taux_change_id uuid references public.taux_change(id) on delete restrict;
alter table public.documents_vente add column taux_document numeric(20, 8) check (taux_document is null or taux_document > 0);
alter table public.documents_vente add constraint documents_vente_devise_complete
  check ((devise_document is null) = (taux_document is null) and (devise_document is null) = (taux_change_id is null));

-- Facture née d'un devis, nouvelle version, avoir : la devise et le taux du document d'origine sont repris.
create function public.heriter_devise_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.documents_vente%rowtype;
begin
  if new.devise_document is null and coalesce(new.origine_id, new.version_de) is not null then
    select * into o from public.documents_vente where id = coalesce(new.origine_id, new.version_de);
    if o.devise_document is not null and o.etablissement_id = new.etablissement_id then
      new.devise_document := o.devise_document;
      new.taux_change_id := o.taux_change_id;
      new.taux_document := o.taux_document;
    end if;
  end if;
  return new;
end
$$;
create trigger documents_vente_heritage_devise before insert on public.documents_vente
for each row execute function public.heriter_devise_document();

alter table public.taux_change enable row level security;
create policy lecture on public.taux_change for select to authenticated using (public.lecture_autorisee(etablissement_id, 'facturation.lire'));
revoke insert, update, delete on public.taux_change from anon, authenticated;
create trigger taux_change_definitif before update on public.taux_change for each row execute function public.refuser_modification();
create trigger taux_change_sans_suppression before delete on public.taux_change for each row execute function public.refuser_suppression();
create trigger taux_change_audit after insert on public.taux_change for each row execute function public.journaliser_modification();

-- Saisir un taux (devise ISO à 3 lettres, différente de celle de l'établissement).
create function public.enregistrer_taux_change(p_etablissement_id uuid, p_devise text, p_jour date, p_taux numeric, p_source text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_devise text := upper(btrim(coalesce(p_devise, '')));
  resultat uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'facturation.gerer');
  if v_devise !~ '^[A-Z]{3}$' then
    raise exception 'Devise invalide : code à 3 lettres (ex. EUR, USD)';
  end if;
  if v_devise = (select devise from public.etablissements where id = p_etablissement_id) then
    raise exception 'C''est déjà la devise de l''établissement';
  end if;
  if p_jour is null or p_jour > public.date_locale(p_etablissement_id) + 1 then
    raise exception 'Date du taux invalide (pas dans le futur)';
  end if;
  if p_taux is null or p_taux = 'NaN'::numeric or p_taux <= 0 or p_taux >= 1000000000 then
    raise exception 'Taux invalide';
  end if;
  if length(coalesce(p_source, '')) > 120 then
    raise exception 'Source trop longue (120 caractères au plus)';
  end if;
  insert into public.taux_change (etablissement_id, devise, jour, taux, source, cree_par)
  values (p_etablissement_id, v_devise, p_jour, round(p_taux, 8), nullif(btrim(p_source), ''), auth.uid())
  returning id into resultat;
  return resultat;
end
$$;

-- Présenter un document en préparation dans une devise (le taux le plus récent à la date du document, ou celui choisi),
-- ou revenir à la seule devise de l'établissement (p_devise vide).
create function public.definir_devise_document(p_document_id uuid, p_devise text default null, p_taux_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.documents_vente%rowtype;
  t public.taux_change%rowtype;
  v_devise text := nullif(upper(btrim(coalesce(p_devise, ''))), '');
begin
  select * into d from public.documents_vente where id = p_document_id for update;
  if d.id is null then
    raise exception 'Document introuvable';
  end if;
  perform public.exiger_permission(d.etablissement_id, 'facturation.gerer');
  if not (d.statut = 'brouillon' or (d.type = 'devis' and d.statut = 'envoye')) then
    raise exception 'La devise se choisit avant l''émission (brouillon ou devis envoyé)';
  end if;
  if v_devise is null then
    update public.documents_vente set devise_document = null, taux_change_id = null, taux_document = null where id = d.id;
    return;
  end if;
  if p_taux_id is not null then
    select * into t from public.taux_change where id = p_taux_id and etablissement_id = d.etablissement_id and devise = v_devise;
  else
    select * into t from public.taux_change
    where etablissement_id = d.etablissement_id and devise = v_devise and jour <= d.date_document
    order by jour desc, cree_le desc limit 1;
  end if;
  if t.id is null then
    raise exception 'Aucun taux % saisi à la date du document : saisissez-le d''abord', v_devise;
  end if;
  update public.documents_vente set devise_document = t.devise, taux_change_id = t.id, taux_document = t.taux where id = d.id;
end
$$;

-- Espace client : comme au lot P2, avec la devise et le taux du document.
create or replace function public.portail_ouvrir(p_jeton text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.portail_acces%rowtype := public.portail_acces_valide(p_jeton);
  k public.contacts%rowtype;
  v_facturation boolean := public.module_actif(a.etablissement_id, 'facturation');
  v_projets boolean := public.module_actif(a.etablissement_id, 'projets');
  v_precedente timestamptz := a.derniere_ouverture;
begin
  select * into k from public.contacts where id = a.contact_id;
  if a.derniere_ouverture is null or a.derniere_ouverture < now() - interval '1 hour' then
    perform public.portail_tracer(a, 'ouverture');
  end if;
  update public.portail_acces set ouvertures = ouvertures + 1, derniere_ouverture = now() where id = a.id;
  return jsonb_build_object(
    'emetteur', (select jsonb_build_object(
        'nom', coalesce(nullif(i.nom_commercial, ''), e.nom), 'logo_url', i.logo_url, 'couleur', i.couleur_principale,
        'telephone', i.telephone, 'email', i.email, 'adresse', i.adresse, 'devise', e.devise)
      from public.etablissements e left join public.etablissement_identite i on i.etablissement_id = e.id where e.id = a.etablissement_id),
    'message_accueil', nullif(public.parametre_module(a.etablissement_id, 'portail_client', 'message_accueil') #>> '{}', ''),
    'depot_fichiers', coalesce((public.parametre_module(a.etablissement_id, 'portail_client', 'depot_fichiers') #>> '{}')::boolean, true),
    'contact', jsonb_build_object('nom', k.nom, 'societe', k.societe),
    'expire_le', a.expire_le,
    'precedente_ouverture', v_precedente,
    'fuseau', (select e.fuseau from public.etablissements e where e.id = a.etablissement_id),
    'agenda', public.module_actif(a.etablissement_id, 'agenda'),
    'aide', public.module_actif(a.etablissement_id, 'support_tickets')
            and exists (select 1 from public.support_bibliotheque b where b.etablissement_id = a.etablissement_id and b.genre = 'article' and b.actif and b.public),
    'documents', case when v_facturation then (
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', d.id, 'type', d.type, 'numero', d.numero, 'statut', d.statut, 'date_document', d.date_document, 'echeance', d.echeance,
          'objet', d.objet, 'notes', d.notes, 'conditions', d.conditions, 'version', d.version,
          'total_ht', d.total_ht, 'total_tva', d.total_tva, 'total_ttc', d.total_ttc,
          'devise_document', d.devise_document, 'taux_document', d.taux_document,
          'taux_jour', (select t.jour from public.taux_change t where t.id = d.taux_change_id),
          'reste', case when d.type = 'facture' and v.statut = 'validee' then v.total - v.montant_paye end,
          'vu_le', (select min(x.cree_le) from public.portail_evenements x where x.contact_id = a.contact_id and x.type = 'document_vu' and x.objet_id = d.id),
          'reponse', (select jsonb_build_object('type', x.type, 'nom', x.nom_signataire, 'le', x.cree_le) from public.portail_evenements x
                      where x.contact_id = a.contact_id and x.objet_id = d.id and x.type in ('devis_accepte', 'devis_refuse', 'devis_modification')
                      order by x.cree_le desc limit 1),
          'lignes', (select coalesce(jsonb_agg(jsonb_build_object('libelle', l.libelle, 'description', l.description, 'quantite', l.quantite,
                       'unite', l.unite, 'prix_unitaire', l.prix_unitaire, 'remise', l.remise, 'taux_tva', l.taux_tva, 'total_ttc', l.total_ttc,
                       'optionnelle', l.optionnelle, 'retenue', l.retenue) order by l.ordre), '[]'::jsonb)
                     from public.lignes_document_vente l where l.document_id = d.id),
          'pieces', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nom', p.nom, 'taille', p.taille) order by p.ajoute_le), '[]'::jsonb)
                     from public.pieces_jointes p where p.objet_type = 'document_vente' and p.objet_id = d.id and p.statut = 'active' and not p.confidentiel)
        ) order by d.date_document desc, d.numero desc), '[]'::jsonb)
      from (select * from public.documents_vente x
            where x.etablissement_id = a.etablissement_id and x.contact_id = a.contact_id
              and ((x.type = 'devis' and x.statut in ('envoye', 'accepte', 'refuse', 'converti')) or (x.type in ('facture', 'avoir') and x.statut = 'emise'))
            order by x.date_document desc limit 100) d
      left join public.ventes v on v.id = d.vente_id) end,
    'projets', case when v_projets then (
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', p.id, 'numero', p.numero, 'nom', p.nom, 'statut', p.statut, 'date_debut', p.date_debut, 'date_fin_prevue', p.date_fin_prevue,
          'avancement', (select case when count(*) filter (where t.statut <> 'annulee') = 0 then 0
                                     else round(count(*) filter (where t.statut = 'terminee') * 100.0 / count(*) filter (where t.statut <> 'annulee')) end
                         from public.projet_taches t where t.projet_id = p.id),
          'taches', (select coalesce(jsonb_agg(jsonb_build_object('titre', t.titre, 'statut', t.statut, 'echeance', t.echeance)
                       order by t.statut = 'terminee', t.echeance nulls last, t.ordre), '[]'::jsonb)
                     from public.projet_taches t where t.projet_id = p.id and t.statut <> 'annulee'),
          'livrables', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'titre', l.titre, 'description', l.description, 'statut', l.statut,
                          'version', l.version,
                          'note', (select lv.note from public.projet_livrable_versions lv where lv.livrable_id = l.id and lv.version = l.version))
                        order by l.cree_le), '[]'::jsonb)
                        from public.projet_livrables l where l.projet_id = p.id and l.statut in ('soumis', 'valide', 'a_corriger'))
        ) order by p.statut = 'termine', p.cree_le desc), '[]'::jsonb)
      from public.projets p
      where p.etablissement_id = a.etablissement_id and p.contact_id = a.contact_id and p.partage_client and p.statut <> 'annule') end,
    'messages', (select coalesce(jsonb_agg(jsonb_build_object('auteur', m.auteur, 'texte', m.texte, 'cree_le', m.cree_le,
                   'objet_type', m.objet_type, 'objet_id', m.objet_id) order by m.cree_le), '[]'::jsonb)
                 from (select * from public.portail_messages x where x.contact_id = a.contact_id order by x.cree_le desc limit 100) m),
    'depots', (select coalesce(jsonb_agg(jsonb_build_object('nom', d.nom, 'taille', d.taille, 'cree_le', d.cree_le, 'statut', d.statut)
                 order by d.cree_le desc), '[]'::jsonb)
               from (select * from public.portail_depots x where x.contact_id = a.contact_id order by x.cree_le desc limit 50) d)
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Rapprochement des relevés
-- ---------------------------------------------------------------------------
-- montant > 0 : argent reçu ; montant < 0 : argent sorti. empreinte : compte, date, montant, libellé, référence et
-- rang parmi les lignes identiques du même fichier (réimporter le même relevé n'ajoute rien).
create table public.releve_lignes (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  compte text not null check (length(btrim(compte)) between 1 and 60),
  jour date not null,
  libelle text not null check (length(btrim(libelle)) between 1 and 300),
  reference text check (reference is null or length(reference) <= 120),
  montant numeric(14, 2) not null check (montant <> 0),
  empreinte text not null check (empreinte ~ '^[0-9a-f]{32}$'),
  statut text not null default 'a_rapprocher' check (statut in ('a_rapprocher', 'rapproche', 'ignore')),
  objet_type text check (objet_type in ('paiement', 'paiement_fournisseur', 'depense')),
  objet_id uuid,
  note text check (note is null or length(note) <= 300),
  traite_par uuid references auth.users(id) on delete restrict,
  traite_le timestamptz,
  importe_par uuid not null references auth.users(id) on delete restrict,
  importe_le timestamptz not null default now(),
  unique (etablissement_id, empreinte),
  check ((statut = 'rapproche') = (objet_id is not null)),
  check ((objet_type is null) = (objet_id is null)),
  check ((statut = 'a_rapprocher') = (traite_le is null)),
  check (statut <> 'ignore' or btrim(coalesce(note, '')) <> '')
);
create index releve_lignes_etab_idx on public.releve_lignes(etablissement_id, statut, jour desc);
create unique index releve_lignes_objet_unique on public.releve_lignes(objet_type, objet_id) where statut = 'rapproche';
alter table public.releve_lignes enable row level security;
create policy lecture on public.releve_lignes for select to authenticated using (public.lecture_autorisee(etablissement_id, 'paiements.rapprocher'));
revoke insert, update, delete on public.releve_lignes from anon, authenticated;
create trigger releve_lignes_etab before update on public.releve_lignes for each row execute function public.verrouiller_etablissement_id();
create trigger releve_lignes_sans_suppression before delete on public.releve_lignes for each row execute function public.refuser_suppression();
create trigger releve_lignes_audit after insert or update on public.releve_lignes for each row execute function public.journaliser_modification();

-- Importer les lignes d'un relevé. p_lignes : [{ jour, libelle, reference?, montant }] (2000 au plus).
create function public.importer_releve(p_etablissement_id uuid, p_compte text, p_lignes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_compte text := btrim(coalesce(p_compte, ''));
  l jsonb;
  v_rang integer := 0;
  v_jour date;
  v_montant numeric;
  v_libelle text;
  v_reference text;
  v_cle text;
  v_vus jsonb := '{}'::jsonb;
  v_occurrence integer;
  v_importees integer := 0;
  v_deja integer := 0;
  v_jour_max date := public.date_locale(p_etablissement_id) + 1;
begin
  perform public.exiger_permission(p_etablissement_id, 'paiements.rapprocher');
  if length(v_compte) not between 1 and 60 then
    raise exception 'Nommez le compte (ex. Banque principale, Mobile Money)';
  end if;
  if jsonb_typeof(p_lignes) is distinct from 'array' or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Le relevé ne contient aucune ligne';
  end if;
  if jsonb_array_length(p_lignes) > 2000 then
    raise exception 'Pas plus de 2000 lignes par import : découpez le relevé';
  end if;
  for l in select * from jsonb_array_elements(p_lignes) loop
    v_rang := v_rang + 1;
    begin
      v_jour := (l ->> 'jour')::date;
      v_montant := round((l ->> 'montant')::numeric, 2);
    exception when others then
      raise exception 'Ligne % : date ou montant illisible', v_rang;
    end;
    v_libelle := left(btrim(coalesce(l ->> 'libelle', '')), 300);
    v_reference := left(nullif(btrim(coalesce(l ->> 'reference', '')), ''), 120);
    if v_jour is null or v_jour > v_jour_max or v_jour < date '2000-01-01' then
      raise exception 'Ligne % : date invalide', v_rang;
    end if;
    if v_montant is null or v_montant = 'NaN'::numeric or v_montant = 0 or abs(v_montant) >= 1000000000000 then
      raise exception 'Ligne % : montant invalide', v_rang;
    end if;
    if v_libelle = '' then
      v_libelle := coalesce(v_reference, 'Sans libellé');
    end if;
    v_cle := concat_ws('|', lower(v_compte), v_jour, v_montant, lower(v_libelle), lower(coalesce(v_reference, '')));
    v_occurrence := coalesce((v_vus ->> v_cle)::integer, 0) + 1;
    v_vus := v_vus || jsonb_build_object(v_cle, v_occurrence);
    insert into public.releve_lignes (etablissement_id, compte, jour, libelle, reference, montant, empreinte, importe_par)
    values (p_etablissement_id, v_compte, v_jour, v_libelle, v_reference, v_montant, md5(v_cle || '|' || v_occurrence), auth.uid())
    on conflict (etablissement_id, empreinte) do nothing;
    if found then
      v_importees := v_importees + 1;
    else
      v_deja := v_deja + 1;
    end if;
  end loop;
  return jsonb_build_object('importees', v_importees, 'deja_importees', v_deja);
end
$$;

-- Mouvements de la plateforme qu'une ligne peut rapprocher (interne) : montant égal, non espèces, valide, pas déjà
-- rapproché, à 10 jours au plus de la ligne. Score : 100 si la référence ou le numéro est retrouvé, moins l'écart en jours.
create function public.candidats_rapprochement(p_ligne public.releve_lignes)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(c order by (c ->> 'score')::integer desc, c ->> 'jour') filter (where c is not null), '[]'::jsonb)
  from (
    select x.c from (
      select jsonb_build_object('objet_type', m.objet_type, 'objet_id', m.objet_id, 'jour', m.jour, 'montant', m.montant, 'mode', m.mode,
               'reference', m.reference, 'libelle', m.libelle,
               'score', case when cles.trouve then 100 else 0 end + 20 - abs(m.jour - p_ligne.jour)) c,
             case when cles.trouve then 100 else 0 end + 20 - abs(m.jour - p_ligne.jour) s
      from (
        select 'paiement' objet_type, p.id objet_id, public.date_locale(p.etablissement_id, p.cree_le) jour, p.montant, p.mode, p.reference,
               concat_ws(' · ', v.numero, (select d.numero from public.documents_vente d where d.vente_id = v.id),
                         (select coalesce(nullif(k.societe, ''), k.nom) from public.contacts k where k.id = v.contact_id)) libelle,
               array_remove(array[p.reference, v.numero, (select d.numero from public.documents_vente d where d.vente_id = v.id)], null) cles
        from public.paiements p join public.ventes v on v.id = p.vente_id
        where p_ligne.montant > 0 and p.etablissement_id = p_ligne.etablissement_id and p.statut = 'valide' and p.mode <> 'especes'
          and p.montant = p_ligne.montant and v.statut = 'validee'
        union all
        select 'paiement_fournisseur', f.id, f.date_paiement, f.montant, f.mode, f.reference,
               concat_ws(' · ', c.numero, (select coalesce(nullif(k.societe, ''), k.nom) from public.contacts k where k.id = c.fournisseur_id)),
               array_remove(array[f.reference, c.numero, c.reference_fournisseur], null)
        from public.paiements_fournisseur f join public.commandes_achat c on c.id = f.commande_id
        where p_ligne.montant < 0 and f.etablissement_id = p_ligne.etablissement_id and f.statut = 'valide' and f.mode <> 'especes'
          and f.montant = -p_ligne.montant
        union all
        select 'depense', d.id, d.date_depense, d.montant, d.mode, null, concat_ws(' · ', d.categorie, d.libelle), array[]::text[]
        from public.depenses d
        where p_ligne.montant < 0 and d.etablissement_id = p_ligne.etablissement_id and d.statut = 'valide' and d.mode <> 'especes'
          and d.montant = -p_ligne.montant
      ) m
      cross join lateral (select exists (select 1 from unnest(m.cles) k where length(k) >= 3
          and position(lower(k) in lower(p_ligne.libelle || ' ' || coalesce(p_ligne.reference, ''))) > 0) trouve) cles
      where abs(m.jour - p_ligne.jour) <= 10
        and not exists (select 1 from public.releve_lignes r where r.objet_type = m.objet_type and r.objet_id = m.objet_id and r.statut = 'rapproche')
      order by s desc
      limit 5
    ) x
  ) t
$$;

-- Lignes à rapprocher avec leurs propositions, et paiements reçus hors espèces des 60 derniers jours sans ligne de relevé.
create function public.rapprochement(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_jour date := public.date_locale(p_etablissement_id);
begin
  if not public.lecture_autorisee(p_etablissement_id, 'paiements.rapprocher') then
    raise exception 'Permission refusée : paiements.rapprocher' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'a_rapprocher', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'compte', r.compte, 'jour', r.jour, 'libelle', r.libelle,
        'reference', r.reference, 'montant', r.montant, 'candidats', public.candidats_rapprochement(r)) order by r.jour desc, r.importe_le), '[]'::jsonb)
      from (select * from public.releve_lignes x where x.etablissement_id = p_etablissement_id and x.statut = 'a_rapprocher'
            order by x.jour desc limit 300) r),
    'comptes', (select coalesce(jsonb_agg(jsonb_build_object('compte', c.compte, 'lignes', c.lignes, 'a_rapprocher', c.a_rapprocher,
        'solde_mouvements', c.solde, 'dernier_jour', c.dernier) order by c.compte), '[]'::jsonb)
      from (select compte, count(*) lignes, count(*) filter (where statut = 'a_rapprocher') a_rapprocher, sum(montant) solde, max(jour) dernier
            from public.releve_lignes where etablissement_id = p_etablissement_id group by compte) c),
    'paiements_sans_releve', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'jour', public.date_locale(p_etablissement_id, p.cree_le),
        'montant', p.montant, 'mode', p.mode, 'reference', p.reference, 'vente', v.numero) order by p.cree_le desc), '[]'::jsonb)
      from (select * from public.paiements y where y.etablissement_id = p_etablissement_id and y.statut = 'valide' and y.mode <> 'especes'
              and y.cree_le > now() - interval '60 days'
              and not exists (select 1 from public.releve_lignes r where r.objet_type = 'paiement' and r.objet_id = y.id and r.statut = 'rapproche')
            order by y.cree_le desc limit 200) p
      join public.ventes v on v.id = p.vente_id),
    'derniers', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'compte', r.compte, 'jour', r.jour, 'libelle', r.libelle, 'montant', r.montant,
        'statut', r.statut, 'objet_type', r.objet_type, 'note', r.note, 'traite_le', r.traite_le) order by r.traite_le desc), '[]'::jsonb)
      from (select * from public.releve_lignes x where x.etablissement_id = p_etablissement_id and x.statut <> 'a_rapprocher'
            order by x.traite_le desc limit 100) r));
end
$$;

-- Rapprocher une ligne d'un mouvement (paiement reçu, paiement fournisseur ou dépense) de même montant.
create function public.rapprocher_ligne_releve(p_ligne_id uuid, p_objet_type text, p_objet_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.releve_lignes%rowtype;
  v_montant numeric;
begin
  select * into r from public.releve_lignes where id = p_ligne_id for update;
  if r.id is null then
    raise exception 'Ligne de relevé introuvable';
  end if;
  perform public.exiger_permission(r.etablissement_id, 'paiements.rapprocher');
  if r.statut <> 'a_rapprocher' then
    raise exception 'Cette ligne est déjà traitée : défaites d''abord le rapprochement';
  end if;
  v_montant := case p_objet_type
    when 'paiement' then (select p.montant from public.paiements p where p.id = p_objet_id and p.etablissement_id = r.etablissement_id and p.statut = 'valide')
    when 'paiement_fournisseur' then (select -f.montant from public.paiements_fournisseur f where f.id = p_objet_id and f.etablissement_id = r.etablissement_id and f.statut = 'valide')
    when 'depense' then (select -d.montant from public.depenses d where d.id = p_objet_id and d.etablissement_id = r.etablissement_id and d.statut = 'valide')
  end;
  if v_montant is null then
    raise exception 'Mouvement introuvable ou annulé';
  end if;
  if v_montant <> r.montant then
    raise exception 'Les montants diffèrent : % sur le relevé, % dans la plateforme', r.montant, v_montant;
  end if;
  if exists (select 1 from public.releve_lignes x where x.objet_type = p_objet_type and x.objet_id = p_objet_id and x.statut = 'rapproche') then
    raise exception 'Ce mouvement est déjà rapproché d''une autre ligne';
  end if;
  update public.releve_lignes set statut = 'rapproche', objet_type = p_objet_type, objet_id = p_objet_id, traite_par = auth.uid(), traite_le = now()
  where id = r.id;
end
$$;

-- Écarter une ligne (frais bancaires, virement interne…) avec une note, ou remettre une ligne traitée à rapprocher.
create function public.traiter_ligne_releve(p_ligne_id uuid, p_action text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.releve_lignes%rowtype;
begin
  select * into r from public.releve_lignes where id = p_ligne_id for update;
  if r.id is null then
    raise exception 'Ligne de relevé introuvable';
  end if;
  perform public.exiger_permission(r.etablissement_id, 'paiements.rapprocher');
  if p_action = 'ignorer' then
    if r.statut <> 'a_rapprocher' then
      raise exception 'Cette ligne est déjà traitée';
    end if;
    if coalesce(btrim(p_note), '') = '' then
      raise exception 'Dites pourquoi la ligne est écartée (ex. frais bancaires)';
    end if;
    update public.releve_lignes set statut = 'ignore', note = left(btrim(p_note), 300), traite_par = auth.uid(), traite_le = now() where id = r.id;
  elsif p_action = 'defaire' then
    if r.statut = 'a_rapprocher' then
      raise exception 'Cette ligne n''est pas traitée';
    end if;
    update public.releve_lignes set statut = 'a_rapprocher', objet_type = null, objet_id = null, note = null, traite_par = null, traite_le = null
    where id = r.id;
  else
    raise exception 'Action inconnue';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Prévision de trésorerie par scénario
-- ---------------------------------------------------------------------------
-- Hypothèses par scénario : recouvrement (% des sommes attendues encaissées), retard (jours ajoutés aux échéances),
-- charges (% des dépenses courantes, moyenne des 90 derniers jours). p_hypotheses peut remplacer chacune.
create function public.prevision_tresorerie(p_etablissement_id uuid, p_solde_depart numeric default 0, p_semaines integer default 12,
  p_hypotheses jsonb default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_jour date := public.date_locale(p_etablissement_id);
  v_semaines integer := least(52, greatest(1, coalesce(p_semaines, 12)));
  v_fin date;
  v_depenses_mois numeric := 0;
  v_defauts jsonb := '{"prudent": {"recouvrement": 70, "retard": 30, "charges": 110},
                       "central": {"recouvrement": 90, "retard": 10, "charges": 100},
                       "optimiste": {"recouvrement": 100, "retard": 0, "charges": 95}}'::jsonb;
  v_scenarios jsonb := '{}'::jsonb;
  v_nom text;
  h jsonb;
  v_rec numeric;
  v_retard integer;
  v_charges numeric;
  v_resultat jsonb;
  v_sources jsonb;
  v_flux jsonb;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'rapports.pilotage') then
    raise exception 'Permission refusée : rapports.pilotage' using errcode = '42501';
  end if;
  if p_solde_depart is null or p_solde_depart = 'NaN'::numeric or abs(p_solde_depart) >= 1000000000000 then
    raise exception 'Solde de départ invalide';
  end if;
  v_fin := v_jour + v_semaines * 7 - 1;
  if public.module_actif(p_etablissement_id, 'depenses') then
    select coalesce(sum(montant), 0) / 3 into v_depenses_mois from public.depenses
    where etablissement_id = p_etablissement_id and statut = 'valide' and date_depense > v_jour - 90 and date_depense <= v_jour;
  end if;

  -- Flux attendus avant hypothèses : (jour, montant, sens, nature). Une date passée compte pour aujourd'hui.
  select coalesce(jsonb_agg(jsonb_build_object('jour', x.jour, 'montant', x.montant, 'sens', x.sens, 'nature', x.nature)), '[]'::jsonb)
  into v_flux
  from (
    -- Factures émises non soldées : par échéance de l'échéancier (la part déjà payée couvre les premières), sinon à l'échéance.
    select greatest(e.date_echeance, v_jour) jour, least(e.montant, greatest(0, e.cumul - v.montant_paye)) montant, 'entree' sens, 'factures' nature
    from public.documents_vente d join public.ventes v on v.id = d.vente_id
    join lateral (select y.date_echeance, y.montant, sum(y.montant) over (order by y.ordre) cumul
                  from public.echeances_document y where y.document_id = d.id) e on true
    where public.module_actif(p_etablissement_id, 'facturation')
      and d.etablissement_id = p_etablissement_id and d.type = 'facture' and d.statut = 'emise' and v.statut = 'validee' and v.total > v.montant_paye
    union all
    select greatest(coalesce(d.echeance, d.date_document + 30), v_jour), v.total - v.montant_paye, 'entree', 'factures'
    from public.documents_vente d join public.ventes v on v.id = d.vente_id
    where public.module_actif(p_etablissement_id, 'facturation')
      and d.etablissement_id = p_etablissement_id and d.type = 'facture' and d.statut = 'emise' and v.statut = 'validee' and v.total > v.montant_paye
      and not exists (select 1 from public.echeances_document y where y.document_id = d.id)
    union all
    -- Abonnements actifs : chaque échéance à venir, selon la périodicité de la formule.
    select greatest(a.jour, v_jour), a.prix, 'entree', 'abonnements'
    from (select (ab.prochaine_echeance + make_interval(months => n * case f.periodicite when 'mensuel' then 1 when 'trimestriel' then 3
                   when 'semestriel' then 6 else 12 end))::date jour, ab.prix, ab.fin
          from public.abonnements ab join public.abo_formules f on f.id = ab.formule_id
          cross join generate_series(0, 52) n
          where public.module_actif(p_etablissement_id, 'abonnements') and ab.etablissement_id = p_etablissement_id and ab.statut = 'actif') a
    where a.jour <= least(v_fin, coalesce(a.fin, v_fin))
    union all
    -- Achats envoyés ou reçus, reste à payer à l'échéance (sinon à la livraison prévue, sinon 30 jours après la commande).
    select greatest(coalesce(c.echeance, c.livraison_prevue, c.date_commande + 30), v_jour), c.total - c.montant_paye, 'sortie', 'achats'
    from public.commandes_achat c
    where public.module_actif(p_etablissement_id, 'achats')
      and c.etablissement_id = p_etablissement_id and c.statut in ('envoyee', 'partielle', 'recue') and c.total > c.montant_paye
  ) x
  where x.montant > 0;

  v_sources := jsonb_build_object(
    'factures', (select coalesce(sum(f.montant), 0) from jsonb_to_recordset(v_flux) f(jour date, montant numeric, nature text) where f.nature = 'factures'),
    'factures_echues', (select coalesce(sum(f.montant), 0) from jsonb_to_recordset(v_flux) f(jour date, montant numeric, nature text)
                        where f.nature = 'factures' and f.jour = v_jour),
    'abonnements', (select coalesce(sum(f.montant), 0) from jsonb_to_recordset(v_flux) f(montant numeric, nature text) where f.nature = 'abonnements'),
    'achats', (select coalesce(sum(f.montant), 0) from jsonb_to_recordset(v_flux) f(montant numeric, nature text) where f.nature = 'achats'),
    'depenses_mois', round(v_depenses_mois, 2));

  foreach v_nom in array array['prudent', 'central', 'optimiste'] loop
    h := v_defauts -> v_nom;
    if jsonb_typeof(p_hypotheses -> v_nom) = 'object' then
      h := h || jsonb_strip_nulls(p_hypotheses -> v_nom);
    end if;
    begin
      v_rec := least(100, greatest(0, (h ->> 'recouvrement')::numeric));
      v_retard := least(180, greatest(0, (h ->> 'retard')::numeric))::integer;
      v_charges := least(200, greatest(0, (h ->> 'charges')::numeric));
    exception when others then
      raise exception 'Hypothèse invalide pour le scénario %', v_nom;
    end;
    with semaines as (
      select k, v_jour + k * 7 debut from generate_series(0, v_semaines - 1) k
    ), flux as (
      select ((least(f.jour + case when f.sens = 'entree' then v_retard else 0 end, v_fin + 1) - v_jour) / 7) k,
             case when f.sens = 'entree' then f.montant * v_rec / 100 else 0 end entree,
             case when f.sens = 'sortie' then f.montant else 0 end sortie
      from jsonb_to_recordset(v_flux) f(jour date, montant numeric, sens text)
    ), par_semaine as (
      select s.k, s.debut,
             round(coalesce(sum(x.entree), 0), 2) encaissements,
             round(coalesce(sum(x.sortie), 0) + v_depenses_mois * 12 / 52 * v_charges / 100, 2) decaissements
      from semaines s left join flux x on x.k = s.k
      group by s.k, s.debut
    ), cumul as (
      select k, debut, encaissements, decaissements,
             round(p_solde_depart + sum(encaissements - decaissements) over (order by k), 2) solde
      from par_semaine
    )
    select jsonb_build_object(
      'hypotheses', jsonb_build_object('recouvrement', v_rec, 'retard', v_retard, 'charges', v_charges),
      'semaines', jsonb_agg(jsonb_build_object('debut', debut, 'encaissements', encaissements, 'decaissements', decaissements, 'solde', solde) order by k),
      'solde_final', (array_agg(solde order by k desc))[1],
      'minimum', min(solde),
      'premiere_semaine_negative', min(debut) filter (where solde < 0))
    into v_resultat from cumul;
    v_scenarios := v_scenarios || jsonb_build_object(v_nom, v_resultat);
  end loop;
  return jsonb_build_object('debut', v_jour, 'fin', v_fin, 'solde_depart', p_solde_depart, 'sources', v_sources, 'scenarios', v_scenarios,
    'devise', (select devise from public.etablissements where id = p_etablissement_id));
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Droits d'exécution
-- ---------------------------------------------------------------------------
revoke execute on function public.heriter_devise_document() from public, anon, authenticated;
revoke execute on function public.candidats_rapprochement(public.releve_lignes) from public, anon, authenticated;
do $$
declare
  f text;
begin
  foreach f in array array['enregistrer_taux_change(uuid, text, date, numeric, text)', 'definir_devise_document(uuid, text, uuid)',
                            'importer_releve(uuid, text, jsonb)', 'rapprochement(uuid)', 'rapprocher_ligne_releve(uuid, text, uuid)',
                            'traiter_ligne_releve(uuid, text, text)', 'prevision_tresorerie(uuid, numeric, integer, jsonb)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end
$$;

notify pgrst, 'reload schema';
