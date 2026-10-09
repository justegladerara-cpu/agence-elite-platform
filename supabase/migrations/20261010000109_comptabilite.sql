-- Comptabilité (module M01, Bêta) : plan de comptes réglable, journaux, écritures équilibrées, écritures générées
-- depuis les encaissements et décaissements déjà enregistrés (ventes, remboursements, dépenses, paiements fournisseurs,
-- location, scolarité), extourne, balance et grand livre. Aucun plan comptable national imposé : un modèle simple est
-- proposé, chaque compte se renomme ou se renumérote, et chaque établissement choisit ses comptes d'affectation.
-- Comptabilité de trésorerie : une écriture naît d'un argent reçu ou payé, pas d'une facture émise.
-- Rien ne se modifie ni ne se supprime : une erreur se corrige par une extourne. Proposé, jamais activé d'office.

-- ---------------------------------------------------------------------------
-- 1. Catalogue et droits
-- ---------------------------------------------------------------------------
insert into public.modules (id, nom, description, nature, statut, categorie, icone, ordre, version, documentation) values
  ('comptabilite', 'Comptabilité', 'Plan de comptes réglable, journaux, écritures générées depuis les encaissements et dépenses, balance, grand livre, export.',
   'transversal', 'beta', 'comptabilite', 'activite', 650, '0.1', 'docs/COMPTABILITE.md')
on conflict (id) do nothing;
update public.modules set parametres_schema = '[
  {"cle": "debut_comptabilite", "libelle": "Date de début (AAAA-MM-JJ) : les opérations plus anciennes ne sont pas reprises", "type": "texte", "defaut": ""}
]'::jsonb where id = 'comptabilite';
insert into public.module_dependances (module_id, depend_de) values ('comptabilite', 'etablissement')
on conflict do nothing;
insert into public.solution_modules (solution_id, module_id, par_defaut)
select s.id, 'comptabilite', false from public.solutions s
on conflict (solution_id, module_id) do nothing;

insert into public.permissions (id, module_id, description) values
  ('comptabilite.lire', 'comptabilite', 'Voir le plan de comptes, les écritures, la balance et le grand livre'),
  ('comptabilite.saisir', 'comptabilite', 'Générer, saisir et extourner des écritures'),
  ('comptabilite.gerer', 'comptabilite', 'Régler le plan de comptes, les journaux et les comptes d''affectation')
on conflict (id) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['gerant', 'comptable']) r
cross join unnest(array['comptabilite.lire', 'comptabilite.saisir', 'comptabilite.gerer']) p
where exists (select 1 from public.roles where id = r)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
create table public.compta_comptes (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  numero text not null check (numero ~ '^[0-9A-Za-z.\-]{1,20}$'),
  libelle text not null check (btrim(libelle) <> '' and length(libelle) <= 120),
  nature text not null check (nature in ('actif', 'passif', 'charge', 'produit')),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  unique (etablissement_id, numero),
  unique (id, etablissement_id)
);

create table public.compta_journaux (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  code text not null check (code ~ '^[0-9A-Za-z]{1,8}$'),
  libelle text not null check (btrim(libelle) <> '' and length(libelle) <= 80),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  unique (etablissement_id, code),
  unique (id, etablissement_id)
);

-- Compte utilisé pour chaque type d'opération générée.
create table public.compta_affectations (
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  cle text not null check (cle in ('tresorerie_especes', 'tresorerie_mobile_money', 'tresorerie_carte', 'tresorerie_virement',
    'tresorerie_cheque', 'ventes', 'prestations', 'retours_ventes', 'charges', 'achats', 'journal_ventes', 'journal_achats', 'journal_divers')),
  compte_id uuid,
  journal_id uuid,
  modifie_le timestamptz not null default now(),
  primary key (etablissement_id, cle),
  foreign key (compte_id, etablissement_id) references public.compta_comptes(id, etablissement_id) on delete restrict,
  foreign key (journal_id, etablissement_id) references public.compta_journaux(id, etablissement_id) on delete restrict,
  check ((cle like 'journal\_%') = (journal_id is not null and compte_id is null)
         and (cle not like 'journal\_%') = (compte_id is not null and journal_id is null))
);

create table public.compta_ecritures (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  journal_id uuid not null,
  numero text not null,
  date_ecriture date not null,
  libelle text not null check (btrim(libelle) <> '' and length(libelle) <= 300),
  source_type text not null check (source_type in ('manuelle', 'extourne', 'paiement_vente', 'annulation_paiement_vente',
    'remboursement_vente', 'depense', 'annulation_depense', 'paiement_fournisseur', 'annulation_paiement_fournisseur',
    'paiement_location', 'paiement_scolarite')),
  source_id uuid,
  total numeric(14, 2) not null check (total > 0),
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  unique (etablissement_id, numero),
  unique (id, etablissement_id),
  foreign key (journal_id, etablissement_id) references public.compta_journaux(id, etablissement_id) on delete restrict,
  check ((source_type = 'manuelle') = (source_id is null))
);
-- Une opération source ne produit qu'une écriture de chaque type (génération rejouable sans doublon).
create unique index compta_ecritures_source_unique on public.compta_ecritures(etablissement_id, source_type, source_id) where source_id is not null;
create index compta_ecritures_date_idx on public.compta_ecritures(etablissement_id, date_ecriture desc);

create table public.compta_lignes (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  ecriture_id uuid not null,
  compte_id uuid not null,
  libelle text check (libelle is null or length(libelle) <= 200),
  debit numeric(14, 2) not null default 0 check (debit >= 0),
  credit numeric(14, 2) not null default 0 check (credit >= 0),
  foreign key (ecriture_id, etablissement_id) references public.compta_ecritures(id, etablissement_id) on delete restrict,
  foreign key (compte_id, etablissement_id) references public.compta_comptes(id, etablissement_id) on delete restrict,
  check ((debit > 0) <> (credit > 0))
);
create index compta_lignes_ecriture_idx on public.compta_lignes(ecriture_id);
create index compta_lignes_compte_idx on public.compta_lignes(compte_id);

alter table public.compta_comptes enable row level security;
alter table public.compta_journaux enable row level security;
alter table public.compta_affectations enable row level security;
alter table public.compta_ecritures enable row level security;
alter table public.compta_lignes enable row level security;
create policy lecture on public.compta_comptes for select to authenticated using (public.lecture_autorisee(etablissement_id, 'comptabilite.lire'));
create policy lecture on public.compta_journaux for select to authenticated using (public.lecture_autorisee(etablissement_id, 'comptabilite.lire'));
create policy lecture on public.compta_affectations for select to authenticated using (public.lecture_autorisee(etablissement_id, 'comptabilite.lire'));
create policy lecture on public.compta_ecritures for select to authenticated using (public.lecture_autorisee(etablissement_id, 'comptabilite.lire'));
create policy lecture on public.compta_lignes for select to authenticated using (public.lecture_autorisee(etablissement_id, 'comptabilite.lire'));
revoke insert, update, delete on public.compta_comptes, public.compta_journaux, public.compta_affectations,
  public.compta_ecritures, public.compta_lignes from anon, authenticated;

create trigger compta_comptes_etab before update on public.compta_comptes for each row execute function public.verrouiller_etablissement_id();
create trigger compta_comptes_sans_suppression before delete on public.compta_comptes for each row execute function public.refuser_suppression();
create trigger compta_comptes_audit after insert or update or delete on public.compta_comptes for each row execute function public.journaliser_modification();
create trigger compta_journaux_etab before update on public.compta_journaux for each row execute function public.verrouiller_etablissement_id();
create trigger compta_journaux_sans_suppression before delete on public.compta_journaux for each row execute function public.refuser_suppression();
create trigger compta_journaux_audit after insert or update or delete on public.compta_journaux for each row execute function public.journaliser_modification();
create trigger compta_affectations_etab before update on public.compta_affectations for each row execute function public.verrouiller_etablissement_id();
create trigger compta_affectations_sans_suppression before delete on public.compta_affectations for each row execute function public.refuser_suppression();
create trigger compta_affectations_audit after insert or update or delete on public.compta_affectations for each row execute function public.journaliser_modification();
create trigger compta_ecritures_definitives before update on public.compta_ecritures for each row execute function public.refuser_modification();
create trigger compta_ecritures_sans_suppression before delete on public.compta_ecritures for each row execute function public.refuser_suppression();
create trigger compta_ecritures_audit after insert or update or delete on public.compta_ecritures for each row execute function public.journaliser_modification();
create trigger compta_lignes_definitives before update on public.compta_lignes for each row execute function public.refuser_modification();
create trigger compta_lignes_sans_suppression before delete on public.compta_lignes for each row execute function public.refuser_suppression();

-- ---------------------------------------------------------------------------
-- 3. Fonctions
-- ---------------------------------------------------------------------------
-- Crée le modèle simple (comptes, journaux, affectations) sans écraser ce qui existe déjà.
create function public.initialiser_comptabilite(p_etablissement_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comptes integer; v_journaux integer;
begin
  perform public.exiger_permission(p_etablissement_id, 'comptabilite.gerer');
  insert into public.compta_comptes (etablissement_id, numero, libelle, nature)
  select p_etablissement_id, m.numero, m.libelle, m.nature from (values
    ('1000', 'Capitaux propres', 'passif'),
    ('4010', 'Fournisseurs', 'passif'),
    ('4110', 'Clients', 'actif'),
    ('5100', 'Banque', 'actif'),
    ('5300', 'Caisse espèces', 'actif'),
    ('5400', 'Mobile money', 'actif'),
    ('5800', 'Paiements par carte à recevoir', 'actif'),
    ('6000', 'Achats et approvisionnements', 'charge'),
    ('6200', 'Charges diverses', 'charge'),
    ('7000', 'Ventes', 'produit'),
    ('7060', 'Prestations de services', 'produit'),
    ('7090', 'Retours et remboursements sur ventes', 'produit')
  ) as m(numero, libelle, nature)
  on conflict (etablissement_id, numero) do nothing;
  get diagnostics v_comptes = row_count;
  insert into public.compta_journaux (etablissement_id, code, libelle) values
    (p_etablissement_id, 'VT', 'Ventes et encaissements'),
    (p_etablissement_id, 'AC', 'Achats et dépenses'),
    (p_etablissement_id, 'OD', 'Opérations diverses')
  on conflict (etablissement_id, code) do nothing;
  get diagnostics v_journaux = row_count;
  insert into public.compta_affectations (etablissement_id, cle, compte_id)
  select p_etablissement_id, a.cle, c.id from (values
    ('tresorerie_especes', '5300'), ('tresorerie_mobile_money', '5400'), ('tresorerie_carte', '5800'),
    ('tresorerie_virement', '5100'), ('tresorerie_cheque', '5100'), ('ventes', '7000'), ('prestations', '7060'),
    ('retours_ventes', '7090'), ('charges', '6200'), ('achats', '6000')
  ) as a(cle, numero)
  join public.compta_comptes c on c.etablissement_id = p_etablissement_id and c.numero = a.numero
  on conflict (etablissement_id, cle) do nothing;
  insert into public.compta_affectations (etablissement_id, cle, journal_id)
  select p_etablissement_id, a.cle, j.id from (values ('journal_ventes', 'VT'), ('journal_achats', 'AC'), ('journal_divers', 'OD')) as a(cle, code)
  join public.compta_journaux j on j.etablissement_id = p_etablissement_id and j.code = a.code
  on conflict (etablissement_id, cle) do nothing;
  return jsonb_build_object('comptes', v_comptes, 'journaux', v_journaux);
end
$$;

-- Compte : p = { id?, numero, libelle, nature, actif? }
create function public.enregistrer_compte_comptable(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'comptabilite.gerer');
  if coalesce(btrim(p ->> 'numero'), '') !~ '^[0-9A-Za-z.\-]{1,20}$' then
    raise exception 'Numéro de compte invalide (chiffres, lettres, point ou tiret, 20 caractères au plus)';
  end if;
  if coalesce(btrim(p ->> 'libelle'), '') = '' then raise exception 'Le libellé est obligatoire'; end if;
  if coalesce(p ->> 'nature', '') not in ('actif', 'passif', 'charge', 'produit') then raise exception 'Nature inconnue'; end if;
  if v_id is null then
    insert into public.compta_comptes (etablissement_id, numero, libelle, nature, actif)
    values (p_etablissement_id, btrim(p ->> 'numero'), left(btrim(p ->> 'libelle'), 120), p ->> 'nature', coalesce((p ->> 'actif')::boolean, true))
    returning id into v_id;
  else
    if coalesce((p ->> 'actif')::boolean, true) = false
       and exists (select 1 from public.compta_affectations a where a.compte_id = v_id) then
      raise exception 'Ce compte sert aux écritures automatiques : choisissez d''abord un autre compte d''affectation';
    end if;
    update public.compta_comptes set numero = btrim(p ->> 'numero'), libelle = left(btrim(p ->> 'libelle'), 120),
      nature = p ->> 'nature', actif = coalesce((p ->> 'actif')::boolean, true)
    where id = v_id and etablissement_id = p_etablissement_id;
    if not found then raise exception 'Compte introuvable'; end if;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'Ce numéro de compte existe déjà';
end
$$;

-- Journal : p = { id?, code, libelle, actif? }
create function public.enregistrer_journal_comptable(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'comptabilite.gerer');
  if coalesce(btrim(p ->> 'code'), '') !~ '^[0-9A-Za-z]{1,8}$' then raise exception 'Code de journal invalide (8 lettres ou chiffres au plus)'; end if;
  if coalesce(btrim(p ->> 'libelle'), '') = '' then raise exception 'Le libellé est obligatoire'; end if;
  if v_id is null then
    insert into public.compta_journaux (etablissement_id, code, libelle, actif)
    values (p_etablissement_id, upper(btrim(p ->> 'code')), left(btrim(p ->> 'libelle'), 80), coalesce((p ->> 'actif')::boolean, true))
    returning id into v_id;
  else
    if coalesce((p ->> 'actif')::boolean, true) = false
       and exists (select 1 from public.compta_affectations a where a.journal_id = v_id) then
      raise exception 'Ce journal sert aux écritures automatiques : choisissez d''abord un autre journal d''affectation';
    end if;
    update public.compta_journaux set code = upper(btrim(p ->> 'code')), libelle = left(btrim(p ->> 'libelle'), 80),
      actif = coalesce((p ->> 'actif')::boolean, true)
    where id = v_id and etablissement_id = p_etablissement_id;
    if not found then raise exception 'Journal introuvable'; end if;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'Ce code de journal existe déjà';
end
$$;

create function public.definir_affectation_comptable(p_etablissement_id uuid, p_cle text, p_cible_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exiger_permission(p_etablissement_id, 'comptabilite.gerer');
  if p_cle like 'journal\_%' then
    if not exists (select 1 from public.compta_journaux where id = p_cible_id and etablissement_id = p_etablissement_id and actif) then
      raise exception 'Journal introuvable ou inactif';
    end if;
    insert into public.compta_affectations (etablissement_id, cle, journal_id) values (p_etablissement_id, p_cle, p_cible_id)
    on conflict (etablissement_id, cle) do update set journal_id = excluded.journal_id, modifie_le = now();
  else
    if not exists (select 1 from public.compta_comptes where id = p_cible_id and etablissement_id = p_etablissement_id and actif) then
      raise exception 'Compte introuvable ou inactif';
    end if;
    insert into public.compta_affectations (etablissement_id, cle, compte_id) values (p_etablissement_id, p_cle, p_cible_id)
    on conflict (etablissement_id, cle) do update set compte_id = excluded.compte_id, modifie_le = now();
  end if;
exception when check_violation then
  raise exception 'Affectation inconnue';
end
$$;

-- Interne : crée une écriture équilibrée. p_lignes = [{ compte_id, debit?, credit?, libelle? }].
-- Renvoie null si l'opération source a déjà son écriture (rejouable).
create function public.compta_ecrire(p_etablissement_id uuid, p_journal_id uuid, p_date date, p_libelle text,
  p_source_type text, p_source_id uuid, p_lignes jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid; v_debit numeric := 0; v_credit numeric := 0; v_nb integer := 0; v_l jsonb; v_d numeric; v_c numeric;
begin
  if p_source_id is not null and exists (select 1 from public.compta_ecritures
      where etablissement_id = p_etablissement_id and source_type = p_source_type and source_id = p_source_id) then
    return null;
  end if;
  if not exists (select 1 from public.compta_journaux where id = p_journal_id and etablissement_id = p_etablissement_id and actif) then
    raise exception 'Journal introuvable ou inactif';
  end if;
  if p_date is null then raise exception 'La date est obligatoire'; end if;
  if jsonb_typeof(p_lignes) <> 'array' then raise exception 'Lignes invalides'; end if;
  for v_l in select * from jsonb_array_elements(p_lignes) loop
    v_d := round(coalesce(nullif(v_l ->> 'debit', '')::numeric, 0), 2);
    v_c := round(coalesce(nullif(v_l ->> 'credit', '')::numeric, 0), 2);
    if v_d < 0 or v_c < 0 or v_d = 'NaN'::numeric or v_c = 'NaN'::numeric or (v_d > 0) = (v_c > 0) then
      raise exception 'Chaque ligne a soit un débit, soit un crédit, positif';
    end if;
    if not exists (select 1 from public.compta_comptes where id = nullif(v_l ->> 'compte_id', '')::uuid
                   and etablissement_id = p_etablissement_id and actif) then
      raise exception 'Compte introuvable ou inactif';
    end if;
    v_debit := v_debit + v_d; v_credit := v_credit + v_c; v_nb := v_nb + 1;
  end loop;
  if v_nb < 2 then raise exception 'Une écriture a au moins deux lignes'; end if;
  if v_debit <> v_credit then raise exception 'Écriture déséquilibrée : débit % ≠ crédit %', v_debit, v_credit; end if;
  insert into public.compta_ecritures (etablissement_id, journal_id, numero, date_ecriture, libelle, source_type, source_id, total, cree_par)
  values (p_etablissement_id, p_journal_id, public.prochain_numero(p_etablissement_id, 'ecriture_comptable', 'EC-'), p_date,
          left(btrim(p_libelle), 300), p_source_type, p_source_id, v_debit, auth.uid())
  returning id into v_id;
  insert into public.compta_lignes (etablissement_id, ecriture_id, compte_id, libelle, debit, credit)
  select p_etablissement_id, v_id, (l ->> 'compte_id')::uuid, nullif(left(btrim(l ->> 'libelle'), 200), ''),
         round(coalesce(nullif(l ->> 'debit', '')::numeric, 0), 2), round(coalesce(nullif(l ->> 'credit', '')::numeric, 0), 2)
  from jsonb_array_elements(p_lignes) l;
  return v_id;
end
$$;

-- Saisie manuelle : p = { journal_id, date, libelle, lignes: [...] }
create function public.enregistrer_ecriture(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exiger_permission(p_etablissement_id, 'comptabilite.saisir');
  if coalesce(btrim(p ->> 'libelle'), '') = '' then raise exception 'Le libellé est obligatoire'; end if;
  return public.compta_ecrire(p_etablissement_id, nullif(p ->> 'journal_id', '')::uuid, nullif(p ->> 'date', '')::date,
    p ->> 'libelle', 'manuelle', null, coalesce(p -> 'lignes', '[]'::jsonb));
end
$$;

-- Extourne : écriture inverse datée du jour choisi, une seule par écriture.
create function public.extourner_ecriture(p_ecriture_id uuid, p_motif text, p_date date default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.compta_ecritures%rowtype; v_id uuid;
begin
  select * into e from public.compta_ecritures where id = p_ecriture_id;
  if e.id is null then raise exception 'Écriture introuvable'; end if;
  perform public.exiger_permission(e.etablissement_id, 'comptabilite.saisir');
  if coalesce(btrim(p_motif), '') = '' then raise exception 'Le motif est obligatoire'; end if;
  if e.source_type = 'extourne' then raise exception 'Une extourne ne s''extourne pas : saisissez une nouvelle écriture'; end if;
  perform 1 from public.compta_ecritures where id = e.id for update;
  v_id := public.compta_ecrire(e.etablissement_id, e.journal_id, coalesce(p_date, e.date_ecriture),
    format('Extourne %s : %s', e.numero, left(btrim(p_motif), 200)), 'extourne', e.id,
    (select jsonb_agg(jsonb_build_object('compte_id', l.compte_id, 'debit', l.credit, 'credit', l.debit, 'libelle', l.libelle))
     from public.compta_lignes l where l.ecriture_id = e.id));
  if v_id is null then raise exception 'Cette écriture est déjà extournée'; end if;
  return v_id;
end
$$;

-- Interne : lit la date de début et les affectations ; lève une erreur si la comptabilité n'est pas prête.
create function public.compta_affectation(p_etablissement_id uuid, p_cle text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(a.compte_id, a.journal_id) from public.compta_affectations a where a.etablissement_id = p_etablissement_id and a.cle = p_cle
$$;

create function public.compta_debut(p_etablissement_id uuid)
returns date
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v text;
begin
  select nullif(btrim(ep.data ->> 'debut_comptabilite'), '') into v from public.etablissement_parametres ep
  where ep.etablissement_id = p_etablissement_id and ep.module_id = 'comptabilite';
  if v is null or v !~ '^\d{4}-\d{2}-\d{2}$' then return date '1900-01-01'; end if;
  return v::date;
exception when others then
  return date '1900-01-01';
end
$$;

-- Opérations déjà enregistrées ailleurs dans la plateforme et pas encore passées en comptabilité.
create function public.compta_operations_en_attente(p_etablissement_id uuid, p_au date default null)
returns table (source_type text, source_id uuid, date_operation date, montant numeric, mode text, libelle text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text; v_debut date; v_au date;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'comptabilite.lire') then
    raise exception 'Permission refusée : comptabilite.lire' using errcode = '42501';
  end if;
  select coalesce(nullif(e.fuseau, ''), 'UTC') into v_tz from public.etablissements e where e.id = p_etablissement_id;
  v_debut := public.compta_debut(p_etablissement_id);
  v_au := coalesce(p_au, (now() at time zone v_tz)::date);
  return query
  select o.source_type, o.source_id, o.date_operation, o.montant, o.mode, o.libelle from (
    select 'paiement_vente'::text as source_type, p.id as source_id, (p.cree_le at time zone v_tz)::date as date_operation, p.montant, p.mode,
           coalesce('Encaissement vente ' || v.numero, 'Encaissement vente') as libelle
    from public.paiements p left join public.ventes v on v.id = p.vente_id where p.etablissement_id = p_etablissement_id
    union all
    select 'annulation_paiement_vente', p.id, (p.annule_le at time zone v_tz)::date, p.montant, p.mode,
           coalesce('Annulation encaissement vente ' || v.numero, 'Annulation encaissement vente')
    from public.paiements p left join public.ventes v on v.id = p.vente_id where p.etablissement_id = p_etablissement_id and p.statut = 'annule'
    union all
    select 'remboursement_vente', r.id, (r.cree_le at time zone v_tz)::date, r.montant, r.mode, 'Remboursement client'
    from public.remboursements_vente r where r.etablissement_id = p_etablissement_id and r.mode <> 'avoir'
    union all
    select 'depense', d.id, d.date_depense, d.montant, d.mode, 'Dépense : ' || d.libelle
    from public.depenses d where d.etablissement_id = p_etablissement_id
    union all
    select 'annulation_depense', d.id, (d.annulee_le at time zone v_tz)::date, d.montant, d.mode, 'Annulation dépense : ' || d.libelle
    from public.depenses d where d.etablissement_id = p_etablissement_id and d.statut = 'annulee'
    union all
    select 'paiement_fournisseur', f.id, f.date_paiement, f.montant, f.mode, 'Paiement fournisseur'
    from public.paiements_fournisseur f where f.etablissement_id = p_etablissement_id
    union all
    select 'annulation_paiement_fournisseur', f.id, (f.annule_le at time zone v_tz)::date, f.montant, f.mode, 'Annulation paiement fournisseur'
    from public.paiements_fournisseur f where f.etablissement_id = p_etablissement_id and f.statut = 'annule'
    union all
    select 'paiement_location', l.id, (l.cree_le at time zone v_tz)::date, l.montant, l.mode, 'Encaissement location'
    from public.loc_paiements l where l.etablissement_id = p_etablissement_id
    union all
    select 'paiement_scolarite', s.id, (s.cree_le at time zone v_tz)::date, s.montant, s.mode, 'Frais de scolarité ' || s.numero
    from public.sco_paiements s where s.etablissement_id = p_etablissement_id
  ) o
  where o.date_operation between v_debut and v_au
    and not exists (select 1 from public.compta_ecritures c where c.etablissement_id = p_etablissement_id
                    and c.source_type = o.source_type and c.source_id = o.source_id)
  order by o.date_operation, o.source_type;
end
$$;

-- Génère les écritures manquantes jusqu'à p_au (aujourd'hui par défaut). Rejouable : rien n'est créé deux fois.
create function public.generer_ecritures(p_etablissement_id uuid, p_au date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record; v_tres uuid; v_contre uuid; v_journal uuid; v_lignes jsonb; v_nb integer := 0;
begin
  perform public.exiger_permission(p_etablissement_id, 'comptabilite.saisir');
  perform pg_advisory_xact_lock(hashtext('compta:' || p_etablissement_id::text));
  if public.compta_affectation(p_etablissement_id, 'journal_ventes') is null then
    raise exception 'Préparez d''abord le plan comptable (bouton « Préparer le plan comptable »)';
  end if;
  for o in select * from public.compta_operations_en_attente(p_etablissement_id, p_au) loop
    v_tres := public.compta_affectation(p_etablissement_id, 'tresorerie_' || o.mode);
    v_contre := public.compta_affectation(p_etablissement_id, case
      when o.source_type in ('paiement_vente', 'annulation_paiement_vente') then 'ventes'
      when o.source_type = 'remboursement_vente' then 'retours_ventes'
      when o.source_type in ('depense', 'annulation_depense') then 'charges'
      when o.source_type in ('paiement_fournisseur', 'annulation_paiement_fournisseur') then 'achats'
      else 'prestations' end);
    v_journal := public.compta_affectation(p_etablissement_id, case
      when o.source_type in ('depense', 'annulation_depense', 'paiement_fournisseur', 'annulation_paiement_fournisseur') then 'journal_achats'
      else 'journal_ventes' end);
    if v_tres is null or v_contre is null or v_journal is null then
      raise exception 'Compte d''affectation manquant pour « % » (%)', o.libelle, o.mode;
    end if;
    -- Argent reçu : débit trésorerie. Argent payé ou annulation d'un encaissement : crédit trésorerie.
    if o.source_type in ('paiement_vente', 'paiement_location', 'paiement_scolarite', 'annulation_depense', 'annulation_paiement_fournisseur') then
      v_lignes := jsonb_build_array(jsonb_build_object('compte_id', v_tres, 'debit', o.montant),
                                    jsonb_build_object('compte_id', v_contre, 'credit', o.montant));
    else
      v_lignes := jsonb_build_array(jsonb_build_object('compte_id', v_contre, 'debit', o.montant),
                                    jsonb_build_object('compte_id', v_tres, 'credit', o.montant));
    end if;
    if public.compta_ecrire(p_etablissement_id, v_journal, o.date_operation, o.libelle, o.source_type, o.source_id, v_lignes) is not null then
      v_nb := v_nb + 1;
    end if;
  end loop;
  return jsonb_build_object('ecritures', v_nb);
end
$$;

-- Balance : par compte, totaux débit et crédit sur la période et solde (débit - crédit). Lecture soumise aux droits.
create function public.compta_balance(p_etablissement_id uuid, p_du date, p_au date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('compte_id', b.id, 'numero', b.numero, 'libelle', b.libelle, 'nature', b.nature,
    'debit', b.debit, 'credit', b.credit, 'solde', b.debit - b.credit) order by b.numero), '[]'::jsonb)
  from (
    select c.id, c.numero, c.libelle, c.nature, sum(l.debit) as debit, sum(l.credit) as credit
    from public.compta_comptes c
    join public.compta_lignes l on l.compte_id = c.id
    join public.compta_ecritures e on e.id = l.ecriture_id and e.date_ecriture between p_du and p_au
    where c.etablissement_id = p_etablissement_id
    group by c.id, c.numero, c.libelle, c.nature
  ) b
$$;

-- Aperçu des opérations à passer en comptabilité (pour l'écran) : nombre, montant et 50 premières.
create function public.compta_apercu_attente(p_etablissement_id uuid, p_au date default null)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('nombre', count(*), 'montant', coalesce(sum(o.montant), 0),
    'operations', coalesce((jsonb_agg(to_jsonb(o) order by o.date_operation) filter (where o.rang <= 50)), '[]'::jsonb))
  from (select a.*, row_number() over (order by a.date_operation) as rang
        from public.compta_operations_en_attente(p_etablissement_id, p_au) a) o
$$;

-- ---------------------------------------------------------------------------
-- 4. Tableau de bord
-- ---------------------------------------------------------------------------
create function public.cockpit_comptabilite(p_etablissement_id uuid, p_du date, p_au date, p_filtres jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  c public.cockpit_ctx;
  v_produits numeric; v_charges numeric; v_produits_p numeric; v_charges_p numeric; v_nb_p bigint; v_premier date; v_comp boolean;
  v_tresorerie numeric; v_attente bigint; v_pret boolean;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'comptabilite.lire') then
    raise exception 'Permission refusée : comptabilite.lire' using errcode = '42501';
  end if;
  c := public.cockpit_preparer(p_etablissement_id, p_du, p_au, p_filtres);
  v_pret := exists (select 1 from public.compta_affectations a where a.etablissement_id = p_etablissement_id and a.cle = 'journal_ventes');
  select coalesce(sum(l.credit - l.debit) filter (where k.nature = 'produit' and e.date_ecriture between c.du and c.au), 0),
         coalesce(sum(l.debit - l.credit) filter (where k.nature = 'charge' and e.date_ecriture between c.du and c.au), 0),
         coalesce(sum(l.credit - l.debit) filter (where k.nature = 'produit' and e.date_ecriture between c.pdu and c.pau), 0),
         coalesce(sum(l.debit - l.credit) filter (where k.nature = 'charge' and e.date_ecriture between c.pdu and c.pau), 0),
         count(distinct e.id) filter (where e.date_ecriture between c.pdu and c.pau), min(e.date_ecriture)
  into v_produits, v_charges, v_produits_p, v_charges_p, v_nb_p, v_premier
  from public.compta_lignes l
  join public.compta_ecritures e on e.id = l.ecriture_id
  join public.compta_comptes k on k.id = l.compte_id
  where l.etablissement_id = p_etablissement_id;
  v_comp := public.cockpit_comparable(v_nb_p, v_premier, c.pdu);
  select coalesce(sum(l.debit - l.credit), 0) into v_tresorerie
  from public.compta_lignes l join public.compta_ecritures e on e.id = l.ecriture_id
  where l.etablissement_id = p_etablissement_id and e.date_ecriture <= c.au
    and l.compte_id in (select a.compte_id from public.compta_affectations a where a.etablissement_id = p_etablissement_id and a.cle like 'tresorerie\_%');
  v_attente := case when v_pret then (select count(*) from public.compta_operations_en_attente(p_etablissement_id, c.au)) else 0 end;
  return jsonb_build_object(
    'domaine', 'comptabilite',
    'periode', jsonb_build_object('du', c.du, 'au', c.au, 'du_precedent', c.pdu, 'au_precedent', c.pau, 'comparable', v_comp),
    'kpis', public.cockpit_liste(array[
      public.cockpit_kpi('produits', 'Produits comptabilisés', v_produits, 'montant', 'comptabilite?vue=balance', case when v_comp then v_produits_p end, null, null, true),
      public.cockpit_kpi('charges', 'Charges comptabilisées', v_charges, 'montant', 'comptabilite?vue=balance', case when v_comp then v_charges_p end, null, null, true),
      public.cockpit_kpi('resultat', 'Résultat de la période', v_produits - v_charges, 'montant', 'comptabilite?vue=balance',
        case when v_comp then v_produits_p - v_charges_p end, 'Produits moins charges', case when v_produits - v_charges < 0 then 'attention' end),
      public.cockpit_kpi('tresorerie', 'Trésorerie comptable', v_tresorerie, 'montant', 'comptabilite?vue=grand_livre', null, 'Solde des comptes de trésorerie')
    ]),
    'attention', public.cockpit_liste(array[
      public.cockpit_alerte('plan', 'alerte', 'Plan comptable pas encore préparé', 'Préparez le plan puis générez les écritures',
        case when v_pret then 0 else 1 end, 'comptabilite?vue=plan'),
      public.cockpit_alerte('attente', 'info', 'Opérations pas encore en comptabilité', 'Encaissements et dépenses à générer',
        v_attente, 'comptabilite')
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
    (9, 'tresorerie', 'Trésorerie', public.lecture_autorisee(p_etablissement_id, 'depenses.lire') and public.lecture_autorisee(p_etablissement_id, 'paiements.lire')),
    (10, 'comptabilite', 'Comptabilité', public.lecture_autorisee(p_etablissement_id, 'comptabilite.lire')),
    (11, 'crm', 'CRM', public.lecture_autorisee(p_etablissement_id, 'crm_pipeline.lire')),
    (12, 'achats', 'Achats', public.lecture_autorisee(p_etablissement_id, 'achats.lire')),
    (13, 'production', 'Production', public.lecture_autorisee(p_etablissement_id, 'production.lire')),
    (14, 'rh', 'RH', public.lecture_autorisee(p_etablissement_id, 'rh_employes.lire')),
    (15, 'projets', 'Projets', public.lecture_autorisee(p_etablissement_id, 'projets.lire')),
    (16, 'agenda', 'Agenda', public.lecture_autorisee(p_etablissement_id, 'agenda.lire')),
    (17, 'support', 'Support', public.lecture_autorisee(p_etablissement_id, 'support_tickets.lire')),
    (18, 'abonnements', 'Abonnements', public.lecture_autorisee(p_etablissement_id, 'abonnements.lire')),
    (19, 'fidelite', 'Fidélité', public.lecture_autorisee(p_etablissement_id, 'fidelite.lire')),
    (20, 'siteweb', 'Site web', public.lecture_autorisee(p_etablissement_id, 'site_web.lire'))
  ) as d(ordre, id, titre, visible)
  where d.visible
$$;

revoke all on function public.compta_ecrire(uuid, uuid, date, text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.compta_affectation(uuid, text) from public, anon, authenticated;
revoke all on function public.compta_debut(uuid) from public, anon, authenticated;
revoke all on function public.initialiser_comptabilite(uuid) from public, anon;
revoke all on function public.enregistrer_compte_comptable(uuid, jsonb) from public, anon;
revoke all on function public.enregistrer_journal_comptable(uuid, jsonb) from public, anon;
revoke all on function public.definir_affectation_comptable(uuid, text, uuid) from public, anon;
revoke all on function public.enregistrer_ecriture(uuid, jsonb) from public, anon;
revoke all on function public.extourner_ecriture(uuid, text, date) from public, anon;
revoke all on function public.compta_operations_en_attente(uuid, date) from public, anon;
revoke all on function public.generer_ecritures(uuid, date) from public, anon;
revoke all on function public.compta_balance(uuid, date, date) from public, anon;
revoke all on function public.compta_apercu_attente(uuid, date) from public, anon;
revoke all on function public.cockpit_comptabilite(uuid, date, date, jsonb) from public, anon;
grant execute on function public.initialiser_comptabilite(uuid) to authenticated;
grant execute on function public.enregistrer_compte_comptable(uuid, jsonb) to authenticated;
grant execute on function public.enregistrer_journal_comptable(uuid, jsonb) to authenticated;
grant execute on function public.definir_affectation_comptable(uuid, text, uuid) to authenticated;
grant execute on function public.enregistrer_ecriture(uuid, jsonb) to authenticated;
grant execute on function public.extourner_ecriture(uuid, text, date) to authenticated;
grant execute on function public.compta_operations_en_attente(uuid, date) to authenticated;
grant execute on function public.generer_ecritures(uuid, date) to authenticated;
grant execute on function public.compta_balance(uuid, date, date) to authenticated;
grant execute on function public.compta_apercu_attente(uuid, date) to authenticated;
grant execute on function public.cockpit_comptabilite(uuid, date, date, jsonb) to authenticated;

notify pgrst, 'reload schema';
