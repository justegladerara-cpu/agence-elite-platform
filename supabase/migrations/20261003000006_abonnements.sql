-- Abonnements (2026-10-03) : nouveau module « abonnements » (contrats récurrents des clients de l'établissement :
-- salle de sport, maintenance, location, cours, forfaits…).
-- Formules (prix et périodicité), abonnements par client (prix propre possible), facturation des périodes dues par le
-- module Facturation (une facture par période, jamais deux pour la même période), suspension, reprise, résiliation avec
-- motif. Le paiement se fait sur la facture (paiements communs). Rien ne se supprime.

-- ---------------------------------------------------------------------------
-- 1. Catalogue et droits
-- ---------------------------------------------------------------------------
insert into public.modules (id, nom, description, nature, statut, categorie, icone, ordre, version, documentation) values
  ('abonnements', 'Abonnements', 'Formules récurrentes, abonnés, factures périodiques sans doublon, suspensions et résiliations.',
   'transversal', 'actif', 'facturation', 'repeter', 275, '1.0', 'docs/ABONNEMENTS.md')
on conflict (id) do nothing;
insert into public.module_dependances (module_id, depend_de) values ('abonnements', 'facturation'), ('abonnements', 'contacts')
on conflict do nothing;
insert into public.solution_modules (solution_id, module_id, par_defaut) values
  ('services', 'abonnements', false), ('commerce', 'abonnements', false), ('restaurant', 'abonnements', false),
  ('hotel', 'abonnements', false), ('ecommerce', 'abonnements', false)
on conflict (solution_id, module_id) do nothing;

insert into public.permissions (id, module_id, description) values
  ('abonnements.lire', 'abonnements', 'Voir les formules, abonnés et périodes facturées'),
  ('abonnements.gerer', 'abonnements', 'Créer les formules, abonner, suspendre, résilier, facturer les périodes')
on conflict (id) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['gerant', 'responsable', 'comptable']) r
cross join unnest(array['abonnements.lire', 'abonnements.gerer']) p
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id) values
  ('commercial', 'abonnements.lire'), ('responsable_hub', 'abonnements.lire'), ('lecteur', 'abonnements.lire')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
create table public.abo_formules (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  nom text not null check (btrim(nom) <> '' and length(nom) <= 120),
  description text check (description is null or length(description) <= 1000),
  article_id uuid references public.articles(id) on delete restrict,
  montant numeric(14, 2) not null check (montant > 0),
  periodicite text not null check (periodicite in ('mensuel', 'trimestriel', 'semestriel', 'annuel')),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
create unique index abo_formules_nom_unique on public.abo_formules(etablissement_id, lower(nom));

create table public.abonnements (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  numero text not null,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  formule_id uuid not null references public.abo_formules(id) on delete restrict,
  prix numeric(14, 2) not null check (prix > 0),
  debut date not null,
  prochaine_echeance date not null,
  fin date,
  statut text not null default 'actif' check (statut in ('actif', 'suspendu', 'resilie')),
  motif text,
  note text check (note is null or length(note) <= 1000),
  cree_par uuid references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (etablissement_id, numero),
  check (prochaine_echeance >= debut),
  check (fin is null or fin >= debut),
  check (statut = 'actif' or btrim(coalesce(motif, '')) <> '')
);
create index abonnements_etablissement_idx on public.abonnements(etablissement_id, statut, prochaine_echeance);

create table public.abonnement_periodes (
  id uuid primary key default gen_random_uuid(),
  abonnement_id uuid not null references public.abonnements(id) on delete restrict,
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  periode_debut date not null,
  periode_fin date not null,
  montant numeric(14, 2) not null,
  document_id uuid not null unique references public.documents_vente(id) on delete restrict,
  cree_le timestamptz not null default now(),
  unique (abonnement_id, periode_debut),
  check (periode_fin >= periode_debut)
);

do $$
declare
  nom_table text;
begin
  foreach nom_table in array array['abo_formules', 'abonnements'] loop
    execute format('create trigger %I_modifie_le before update on public.%I for each row execute function public.fixer_modifie_le()', nom_table, nom_table);
  end loop;
  foreach nom_table in array array['abo_formules', 'abonnements', 'abonnement_periodes'] loop
    execute format('create trigger %I_sans_suppression before delete on public.%I for each row execute function public.refuser_suppression()', nom_table, nom_table);
    execute format('create trigger %I_verrou_etablissement before update on public.%I for each row execute function public.verrouiller_etablissement_id()', nom_table, nom_table);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.journaliser_modification()', nom_table, nom_table);
    execute format('alter table public.%I enable row level security', nom_table);
    execute format('create policy lecture on public.%I for select to authenticated using (public.lecture_autorisee(etablissement_id, ''abonnements.lire''))', nom_table);
  end loop;
end
$$;
create trigger abonnement_periodes_definitives before update on public.abonnement_periodes for each row execute function public.refuser_modification();

-- ---------------------------------------------------------------------------
-- 3. Fonctions
-- ---------------------------------------------------------------------------
create function public.pas_abonnement(p_periodicite text)
returns interval
language sql
immutable
set search_path = ''
as $$
  select case p_periodicite when 'trimestriel' then interval '3 months' when 'semestriel' then interval '6 months'
    when 'annuel' then interval '1 year' else interval '1 month' end
$$;

-- p : { id?, nom, description?, article_id?, montant, periodicite, actif? }
create function public.enregistrer_formule_abonnement(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p ->> 'id', '')::uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'abonnements.gerer');
  if coalesce(btrim(p ->> 'nom'), '') = '' then
    raise exception 'Le nom de la formule est obligatoire';
  end if;
  if exists (select 1 from public.abo_formules where etablissement_id = p_etablissement_id and lower(nom) = lower(btrim(p ->> 'nom')) and id is distinct from resultat) then
    raise exception 'La formule « % » existe déjà', btrim(p ->> 'nom');
  end if;
  if nullif(p ->> 'article_id', '') is not null
     and not exists (select 1 from public.articles where id = (p ->> 'article_id')::uuid and etablissement_id = p_etablissement_id) then
    raise exception 'Article introuvable';
  end if;
  if coalesce(nullif(p ->> 'montant', '')::numeric, 0) <= 0 then
    raise exception 'Le prix doit être positif';
  end if;
  if coalesce(p ->> 'periodicite', '') not in ('mensuel', 'trimestriel', 'semestriel', 'annuel') then
    raise exception 'Périodicité inconnue';
  end if;
  if resultat is null then
    insert into public.abo_formules (etablissement_id, nom, description, article_id, montant, periodicite)
    values (p_etablissement_id, btrim(p ->> 'nom'), nullif(btrim(p ->> 'description'), ''), nullif(p ->> 'article_id', '')::uuid,
      (p ->> 'montant')::numeric, p ->> 'periodicite')
    returning id into resultat;
  else
    update public.abo_formules set nom = btrim(p ->> 'nom'), description = nullif(btrim(p ->> 'description'), ''),
      article_id = nullif(p ->> 'article_id', '')::uuid, montant = (p ->> 'montant')::numeric, periodicite = p ->> 'periodicite',
      actif = coalesce((p ->> 'actif')::boolean, true)
    where id = resultat and etablissement_id = p_etablissement_id;
    if not found then
      raise exception 'Formule introuvable';
    end if;
  end if;
  return resultat;
end
$$;

-- p : { contact_id, formule_id, prix?, debut?, note? }. La première période est due au début.
create function public.souscrire_abonnement(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.abo_formules%rowtype;
  v_debut date := coalesce(nullif(p ->> 'debut', '')::date, public.date_locale(p_etablissement_id));
  resultat uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'abonnements.gerer');
  select * into f from public.abo_formules where id = nullif(p ->> 'formule_id', '')::uuid and etablissement_id = p_etablissement_id;
  if f.id is null or not f.actif then
    raise exception 'Formule introuvable ou arrêtée';
  end if;
  if not exists (select 1 from public.contacts where id = nullif(p ->> 'contact_id', '')::uuid and etablissement_id = p_etablissement_id
                   and actif and type <> 'fournisseur') then
    raise exception 'Client introuvable';
  end if;
  if v_debut < public.date_locale(p_etablissement_id) - 365 then
    raise exception 'Début trop ancien (un an au plus)';
  end if;
  if coalesce(nullif(p ->> 'prix', '')::numeric, f.montant) <= 0 then
    raise exception 'Le prix doit être positif';
  end if;
  insert into public.abonnements (etablissement_id, numero, contact_id, formule_id, prix, debut, prochaine_echeance, note, cree_par)
  values (p_etablissement_id, public.prochain_numero(p_etablissement_id, 'abonnement', 'AB-'), (p ->> 'contact_id')::uuid, f.id,
    coalesce(nullif(p ->> 'prix', '')::numeric, f.montant), v_debut, v_debut, nullif(btrim(p ->> 'note'), ''), auth.uid())
  returning id into resultat;
  return resultat;
end
$$;

-- Suspendre (motif), reprendre, résilier (motif, fin = dernière période facturée ou date donnée).
create function public.changer_statut_abonnement(p_id uuid, p_statut text, p_motif text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.abonnements%rowtype;
  jour date;
begin
  select * into a from public.abonnements where id = p_id for update;
  if a.id is null then
    raise exception 'Abonnement introuvable';
  end if;
  perform public.exiger_permission(a.etablissement_id, 'abonnements.gerer');
  jour := public.date_locale(a.etablissement_id);
  if a.statut = 'resilie' then
    raise exception 'Abonnement résilié : souscrivez un nouvel abonnement';
  end if;
  if p_statut not in ('actif', 'suspendu', 'resilie') or p_statut = a.statut then
    raise exception 'Changement impossible';
  end if;
  if p_statut in ('suspendu', 'resilie') and coalesce(btrim(p_motif), '') = '' then
    raise exception 'Le motif est obligatoire';
  end if;
  if p_statut = 'actif' then
    -- À la reprise, les périodes de suspension ne sont pas facturées : la prochaine échéance repart d'aujourd'hui au plus tôt.
    update public.abonnements set statut = 'actif', motif = null, prochaine_echeance = greatest(prochaine_echeance, jour) where id = a.id;
  else
    update public.abonnements set statut = p_statut, motif = btrim(p_motif),
      fin = case when p_statut = 'resilie' then greatest(a.debut, a.prochaine_echeance - 1) else fin end
    where id = a.id;
  end if;
end
$$;

-- Facture les périodes dues jusqu'à p_jusqu_au (12 périodes au plus par abonnement et par appel) ; une facture par
-- période, émise si p_emettre. Retourne { factures, montant }. Rejouable sans doublon (unicité par période).
create function public.facturer_abonnements(p_etablissement_id uuid, p_jusqu_au date default null, p_emettre boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
  v_jusqu date := coalesce(p_jusqu_au, public.date_locale(p_etablissement_id));
  v_debut date;
  v_fin date;
  v_doc uuid;
  n integer;
  total integer := 0;
  montant numeric := 0;
  delai integer := coalesce(nullif(public.parametre_module(p_etablissement_id, 'facturation', 'delai_paiement_jours') #>> '{}', '')::numeric::integer, 30);
begin
  perform public.exiger_permission(p_etablissement_id, 'abonnements.gerer');
  perform public.exiger_permission(p_etablissement_id, 'facturation.gerer');
  if v_jusqu > public.date_locale(p_etablissement_id) + 31 then
    raise exception 'On facture au plus un mois à l''avance';
  end if;
  for a in
    select ab.*, f.nom formule_nom, f.periodicite, f.article_id from public.abonnements ab join public.abo_formules f on f.id = ab.formule_id
    where ab.etablissement_id = p_etablissement_id and ab.statut = 'actif' and ab.prochaine_echeance <= v_jusqu
    order by ab.numero
    for update of ab
  loop
    v_debut := a.prochaine_echeance;
    n := 0;
    while v_debut <= v_jusqu and n < 12 and (a.fin is null or v_debut <= a.fin) loop
      v_fin := (v_debut + public.pas_abonnement(a.periodicite))::date - 1;
      v_doc := public.enregistrer_document_vente(p_etablissement_id, jsonb_build_object(
        'type', 'facture', 'contact_id', a.contact_id, 'echeance', greatest(v_debut + delai, public.date_locale(p_etablissement_id)),
        'objet', 'Abonnement ' || a.numero || ' · ' || a.formule_nom || ' du ' || to_char(v_debut, 'DD/MM/YYYY') || ' au ' || to_char(v_fin, 'DD/MM/YYYY'),
        'lignes', jsonb_build_array(jsonb_build_object('article_id', a.article_id, 'libelle',
          a.formule_nom || ' (' || to_char(v_debut, 'DD/MM/YYYY') || ' - ' || to_char(v_fin, 'DD/MM/YYYY') || ')', 'quantite', 1, 'prix_unitaire', a.prix))));
      insert into public.abonnement_periodes (abonnement_id, etablissement_id, periode_debut, periode_fin, montant, document_id)
      values (a.id, p_etablissement_id, v_debut, v_fin, a.prix, v_doc);
      if p_emettre then
        perform public.emettre_facture(v_doc);
      end if;
      total := total + 1;
      montant := montant + a.prix;
      n := n + 1;
      v_debut := v_fin + 1;
    end loop;
    update public.abonnements set prochaine_echeance = v_debut where id = a.id;
  end loop;
  return jsonb_build_object('factures', total, 'montant', montant);
end
$$;

create function public.tableau_de_bord_abonnements(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  jour date := public.date_locale(p_etablissement_id);
begin
  if not public.lecture_autorisee(p_etablissement_id, 'abonnements.lire') then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'actifs', (select count(*) from public.abonnements where etablissement_id = p_etablissement_id and statut = 'actif'),
    'suspendus', (select count(*) from public.abonnements where etablissement_id = p_etablissement_id and statut = 'suspendu'),
    'revenu_mensuel', (select coalesce(sum(a.prix / case f.periodicite when 'trimestriel' then 3 when 'semestriel' then 6 when 'annuel' then 12 else 1 end), 0)
      from public.abonnements a join public.abo_formules f on f.id = a.formule_id
      where a.etablissement_id = p_etablissement_id and a.statut = 'actif'),
    'a_facturer', (select count(*) from public.abonnements where etablissement_id = p_etablissement_id and statut = 'actif'
      and prochaine_echeance <= jour and (fin is null or prochaine_echeance <= fin)),
    'impayes', (select count(*) from public.abonnement_periodes p join public.documents_vente d on d.id = p.document_id
      join public.ventes v on v.id = d.vente_id
      where p.etablissement_id = p_etablissement_id and d.statut = 'emise' and v.statut = 'validee' and v.total > v.montant_paye),
    'resilies_mois', (select count(*) from public.abonnements where etablissement_id = p_etablissement_id and statut = 'resilie'
      and date_trunc('month', modifie_le) = date_trunc('month', jour::timestamp))
  );
end
$$;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.enregistrer_formule_abonnement(uuid, jsonb)', 'public.souscrire_abonnement(uuid, jsonb)',
    'public.changer_statut_abonnement(uuid, text, text)', 'public.facturer_abonnements(uuid, date, boolean)',
    'public.tableau_de_bord_abonnements(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
  execute 'revoke execute on function public.pas_abonnement(text) from public, anon, authenticated';
end
$$;
