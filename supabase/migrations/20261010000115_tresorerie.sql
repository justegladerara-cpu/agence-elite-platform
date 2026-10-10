-- Trésorerie (lot E, 2026-10-10). Rien ne change pour un établissement qui n'utilise pas ces outils.
--  * Relevé de compte d'un client : ventes et factures, encaissements, retours et remboursements, solde d'ouverture.
--  * Trop-perçus : un client paie plus que le reste dû (hors espèces) ; l'excédent devient un crédit client,
--    utilisable sur une autre de ses factures ou marqué remboursé.
--  * Facture contestée : la contestation est tracée (motif, date, issue) ; la facture reste due tant qu'elle n'est pas annulée.
--  * Validation des dépenses : au-dessus d'un seuil (réglage, 0 = désactivé), une dépense hors caisse est d'abord
--    une demande ; elle devient une vraie dépense seulement quand une personne habilitée la valide.
-- Les tables existantes (ventes, paiements, dépenses) ne changent pas de forme : rapports, clôtures et comptabilité
-- continuent de lire les mêmes lignes.

-- ---------------------------------------------------------------------------
-- 1. Catalogue, droits et réglages
-- ---------------------------------------------------------------------------
insert into public.permissions (id, module_id, description) values
  ('depenses.valider', 'depenses', 'Valider ou refuser les demandes de dépense au-dessus du seuil')
on conflict (id) do nothing;
insert into public.role_permissions (role_id, permission_id) values
  ('gerant', 'depenses.valider'), ('responsable', 'depenses.valider')
on conflict do nothing;

update public.modules set parametres_schema = '[
  {"cle": "seuil_validation", "libelle": "Dépense hors caisse à faire valider à partir de (0 = jamais)", "type": "nombre", "defaut": 0}
]'::jsonb where id = 'depenses';

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
create table public.contestations_facture (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  hub_id uuid not null references public.hubs(id) on delete restrict,
  document_id uuid not null references public.documents_vente(id) on delete restrict,
  motif text not null check (btrim(motif) <> '' and length(motif) <= 1000),
  ouverte_par uuid not null references auth.users(id) on delete restrict,
  ouverte_le timestamptz not null default now(),
  issue text check (issue is null or length(issue) <= 1000),
  close_par uuid references auth.users(id) on delete restrict,
  close_le timestamptz,
  modifie_le timestamptz not null default now(),
  check ((close_le is null) = (issue is null) and (close_le is null) = (close_par is null))
);
create unique index contestations_facture_ouverte_unique on public.contestations_facture(document_id) where close_le is null;
create index contestations_facture_etablissement_idx on public.contestations_facture(etablissement_id, close_le);

create table public.credits_client (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  hub_id uuid not null references public.hubs(id) on delete restrict,
  numero text not null,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  document_id uuid references public.documents_vente(id) on delete restrict,
  montant numeric(14, 2) not null check (montant > 0),
  montant_utilise numeric(14, 2) not null default 0 check (montant_utilise >= 0),
  montant_rembourse numeric(14, 2) not null default 0 check (montant_rembourse >= 0),
  mode text not null check (mode in ('mobile_money', 'carte', 'virement', 'cheque')),
  reference text check (reference is null or length(reference) <= 120),
  statut text not null default 'disponible' check (statut in ('disponible', 'utilise', 'rembourse')),
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (etablissement_id, numero),
  check (montant_utilise + montant_rembourse <= montant),
  check ((statut = 'disponible') = (montant_utilise + montant_rembourse < montant))
);
create index credits_client_contact_idx on public.credits_client(contact_id, statut);

create table public.credits_client_usages (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  hub_id uuid not null references public.hubs(id) on delete restrict,
  credit_id uuid not null references public.credits_client(id) on delete restrict,
  nature text not null check (nature in ('facture', 'remboursement')),
  document_id uuid references public.documents_vente(id) on delete restrict,
  paiement_id uuid references public.paiements(id) on delete restrict,
  montant numeric(14, 2) not null check (montant > 0),
  mode text check (mode is null or mode in ('especes', 'mobile_money', 'carte', 'virement', 'cheque')),
  note text check (note is null or length(note) <= 500),
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  check ((nature = 'facture') = (document_id is not null and paiement_id is not null))
);
create index credits_client_usages_credit_idx on public.credits_client_usages(credit_id);

create table public.demandes_depense (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  hub_id uuid references public.hubs(id) on delete restrict,
  date_depense date not null,
  categorie text not null default 'Divers',
  libelle text not null check (btrim(libelle) <> '' and length(libelle) <= 300),
  montant numeric(14, 2) not null check (montant > 0),
  mode text not null check (mode in ('mobile_money', 'carte', 'virement', 'cheque', 'especes')),
  fournisseur_id uuid references public.contacts(id) on delete restrict,
  justificatif text check (justificatif is null or length(justificatif) <= 400000),
  statut text not null default 'a_valider' check (statut in ('a_valider', 'validee', 'refusee')),
  demande_par uuid not null references auth.users(id) on delete restrict,
  demande_le timestamptz not null default now(),
  decide_par uuid references auth.users(id) on delete restrict,
  decide_le timestamptz,
  motif_refus text check (motif_refus is null or length(motif_refus) <= 500),
  depense_id uuid unique references public.depenses(id) on delete restrict,
  modifie_le timestamptz not null default now(),
  check ((statut = 'a_valider') = (decide_le is null)),
  check (statut <> 'validee' or depense_id is not null),
  check (statut <> 'refusee' or btrim(coalesce(motif_refus, '')) <> '')
);
create index demandes_depense_etablissement_idx on public.demandes_depense(etablissement_id, statut);

do $$
declare
  nom_table text;
begin
  foreach nom_table in array array['contestations_facture', 'credits_client', 'demandes_depense'] loop
    execute format('create trigger %I_modifie_le before update on public.%I for each row execute function public.fixer_modifie_le()', nom_table, nom_table);
  end loop;
  foreach nom_table in array array['contestations_facture', 'credits_client', 'credits_client_usages', 'demandes_depense'] loop
    execute format('create trigger %I_sans_suppression before delete on public.%I for each row execute function public.refuser_suppression()', nom_table, nom_table);
    execute format('create trigger %I_verrou_etablissement before update on public.%I for each row execute function public.verrouiller_etablissement_id()', nom_table, nom_table);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.journaliser_modification()', nom_table, nom_table);
    execute format('alter table public.%I enable row level security', nom_table);
  end loop;
end
$$;
create trigger credits_client_usages_immuable before update on public.credits_client_usages
for each row execute function public.refuser_modification();
create policy lecture on public.contestations_facture for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'facturation.lire') and public.lecture_hub(etablissement_id, hub_id));
create policy lecture on public.credits_client for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'facturation.lire') and public.lecture_hub(etablissement_id, hub_id));
create policy lecture on public.credits_client_usages for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'facturation.lire') and public.lecture_hub(etablissement_id, hub_id));
create policy lecture on public.demandes_depense for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'depenses.lire') and public.lecture_hub(etablissement_id, hub_id));

-- ---------------------------------------------------------------------------
-- 3. Facture contestée
-- ---------------------------------------------------------------------------
create function public.contester_facture(p_document_id uuid, p_motif text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.documents_vente%rowtype;
  resultat uuid;
begin
  select * into doc from public.documents_vente where id = p_document_id for update;
  if doc.id is null then
    raise exception 'Facture introuvable';
  end if;
  perform public.exiger_permission(doc.etablissement_id, 'facturation.gerer');
  perform public.exiger_acces_hub(doc.hub_id);
  if doc.type <> 'facture' or doc.statut <> 'emise' then
    raise exception 'Seule une facture émise peut être contestée';
  end if;
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Indiquez ce que le client conteste';
  end if;
  if exists (select 1 from public.contestations_facture where document_id = doc.id and close_le is null) then
    raise exception 'Une contestation est déjà ouverte sur cette facture';
  end if;
  insert into public.contestations_facture (etablissement_id, hub_id, document_id, motif, ouverte_par)
  values (doc.etablissement_id, doc.hub_id, doc.id, btrim(p_motif), auth.uid())
  returning id into resultat;
  perform public.notifier_permission(doc.etablissement_id, 'facturation.annuler', 'facturation.contestation', 'Facture contestée',
    coalesce(doc.numero, '') || ' · ' || left(btrim(p_motif), 120), 'factures/' || doc.id);
  return resultat;
end
$$;

-- Clôt la contestation avec son issue (ex. « Client d'accord après explication », « Avoir émis »).
create function public.clore_contestation_facture(p_contestation_id uuid, p_issue text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.contestations_facture%rowtype;
begin
  select * into c from public.contestations_facture where id = p_contestation_id for update;
  if c.id is null then
    raise exception 'Contestation introuvable';
  end if;
  perform public.exiger_permission(c.etablissement_id, 'facturation.gerer');
  perform public.exiger_acces_hub(c.hub_id);
  if c.close_le is not null then
    raise exception 'Cette contestation est déjà close';
  end if;
  if coalesce(btrim(p_issue), '') = '' then
    raise exception 'Indiquez comment la contestation s''est terminée';
  end if;
  update public.contestations_facture set issue = btrim(p_issue), close_par = auth.uid(), close_le = now() where id = c.id;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Trop-perçus et crédits client
-- ---------------------------------------------------------------------------
-- Le client a versé p_montant_recu (supérieur au reste dû) par virement, Mobile Money, carte ou chèque :
-- la facture est soldée et l'excédent devient un crédit client. Les espèces se rendent en monnaie, pas en crédit.
create function public.encaisser_avec_trop_percu(p_document_id uuid, p_montant_recu numeric, p_mode text, p_reference text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.documents_vente%rowtype;
  v public.ventes%rowtype;
  reste numeric;
  resultat uuid;
begin
  select * into doc from public.documents_vente where id = p_document_id for update;
  if doc.id is null or doc.type <> 'facture' or doc.statut <> 'emise' then
    raise exception 'Seule une facture émise s''encaisse';
  end if;
  perform public.exiger_permission(doc.etablissement_id, 'facturation.gerer');
  perform public.exiger_acces_hub(doc.hub_id);
  if p_mode is null or p_mode not in ('mobile_money', 'carte', 'virement', 'cheque') then
    raise exception 'Un trop-perçu se constate sur un virement, un paiement Mobile Money, une carte ou un chèque (les espèces se rendent)';
  end if;
  select * into v from public.ventes where id = doc.vente_id for update;
  reste := v.total - v.montant_paye;
  if p_montant_recu is null or p_montant_recu = 'NaN'::numeric or p_montant_recu <> round(p_montant_recu, 2) or p_montant_recu <= reste then
    raise exception 'Le montant reçu doit dépasser le reste dû (%) : sinon, encaissez normalement', reste;
  end if;
  if reste > 0 then
    perform public.encaisser_facture(doc.id, reste, p_mode, p_reference, null);
  end if;
  insert into public.credits_client (etablissement_id, hub_id, numero, contact_id, document_id, montant, mode, reference, cree_par)
  values (doc.etablissement_id, doc.hub_id, public.prochain_numero(doc.etablissement_id, 'credit_client', 'CR-'), doc.contact_id, doc.id,
    p_montant_recu - reste, p_mode, nullif(btrim(p_reference), ''), auth.uid())
  returning id into resultat;
  return resultat;
end
$$;

-- Utilise tout ou partie d'un crédit pour régler une autre facture émise du même client.
create function public.utiliser_credit_client(p_credit_id uuid, p_document_id uuid, p_montant numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.credits_client%rowtype;
  doc public.documents_vente%rowtype;
  v_paiement uuid;
begin
  select * into k from public.credits_client where id = p_credit_id for update;
  if k.id is null then
    raise exception 'Crédit introuvable';
  end if;
  perform public.exiger_permission(k.etablissement_id, 'facturation.gerer');
  perform public.exiger_acces_hub(k.hub_id);
  select * into doc from public.documents_vente where id = p_document_id;
  if doc.id is null or doc.etablissement_id <> k.etablissement_id or doc.contact_id <> k.contact_id then
    raise exception 'Choisissez une facture du même client';
  end if;
  if k.statut <> 'disponible' then
    raise exception 'Ce crédit est déjà entièrement utilisé ou remboursé';
  end if;
  if p_montant is null or p_montant = 'NaN'::numeric or p_montant <= 0 or p_montant <> round(p_montant, 2)
     or p_montant > k.montant - k.montant_utilise - k.montant_rembourse then
    raise exception 'Le montant dépasse le crédit disponible (%)', k.montant - k.montant_utilise - k.montant_rembourse;
  end if;
  v_paiement := public.encaisser_facture(doc.id, p_montant, k.mode, 'Crédit client ' || k.numero, null);
  insert into public.credits_client_usages (etablissement_id, hub_id, credit_id, nature, document_id, paiement_id, montant, cree_par)
  values (k.etablissement_id, doc.hub_id, k.id, 'facture', doc.id, v_paiement, p_montant, auth.uid());
  update public.credits_client set montant_utilise = montant_utilise + p_montant,
    statut = case when montant_utilise + p_montant + montant_rembourse >= montant then 'utilise' else 'disponible' end
  where id = k.id;
  return v_paiement;
end
$$;

-- Le reste du crédit a été rendu au client (hors plateforme) : on le note, avec le mode et une note.
create function public.rembourser_credit_client(p_credit_id uuid, p_mode text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.credits_client%rowtype;
  v_reste numeric;
begin
  select * into k from public.credits_client where id = p_credit_id for update;
  if k.id is null then
    raise exception 'Crédit introuvable';
  end if;
  perform public.exiger_permission(k.etablissement_id, 'facturation.annuler');
  perform public.exiger_acces_hub(k.hub_id);
  if k.statut <> 'disponible' then
    raise exception 'Ce crédit est déjà entièrement utilisé ou remboursé';
  end if;
  if p_mode is null or p_mode not in ('especes', 'mobile_money', 'carte', 'virement', 'cheque') then
    raise exception 'Mode de remboursement inconnu';
  end if;
  v_reste := k.montant - k.montant_utilise - k.montant_rembourse;
  insert into public.credits_client_usages (etablissement_id, hub_id, credit_id, nature, montant, mode, note, cree_par)
  values (k.etablissement_id, k.hub_id, k.id, 'remboursement', v_reste, p_mode, nullif(btrim(p_note), ''), auth.uid());
  update public.credits_client set montant_rembourse = montant_rembourse + v_reste, statut = 'rembourse' where id = k.id;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Relevé de compte client
-- ---------------------------------------------------------------------------
-- Débit : ventes et factures validées, remboursements rendus. Crédit : encaissements valides, retours.
-- Solde d'ouverture : mouvements avant p_du. Dates dans le fuseau de l'établissement.
create function public.releve_client(p_etablissement_id uuid, p_contact_id uuid, p_du date, p_au date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tz text := coalesce((select fuseau from public.etablissements where id = p_etablissement_id), 'UTC');
  k public.contacts%rowtype;
begin
  if not (public.lecture_autorisee(p_etablissement_id, 'facturation.lire') or public.lecture_autorisee(p_etablissement_id, 'ventes.lire')) then
    raise exception 'Permission refusée : facturation.lire' using errcode = '42501';
  end if;
  select * into k from public.contacts where id = p_contact_id and etablissement_id = p_etablissement_id;
  if k.id is null then
    raise exception 'Contact introuvable dans cet établissement';
  end if;
  if p_du is null or p_au is null or p_du > p_au then
    raise exception 'Période invalide';
  end if;
  return (
    with v as (select * from public.ventes where etablissement_id = p_etablissement_id and contact_id = k.id and statut = 'validee'
               and public.lecture_hub(p_etablissement_id, hub_id)),
    m as (
      select (v.cree_le at time zone tz)::date jour, v.cree_le quand,
        case when d.numero is not null then 'Facture ' || d.numero else 'Vente ' || v.numero end libelle, v.total debit, 0::numeric credit
      from v left join public.documents_vente d on d.vente_id = v.id and d.type = 'facture'
      union all
      select (p.cree_le at time zone tz)::date, p.cree_le, 'Encaissement ' || v.numero || coalesce(' · ' || p.reference, ''), 0, p.montant
      from public.paiements p join v on v.id = p.vente_id where p.statut = 'valide'
      union all
      select (r.cree_le at time zone tz)::date, r.cree_le, 'Retour ' || r.numero || ' sur ' || v.numero, 0, r.montant
      from public.retours_vente r join v on v.id = r.vente_id
      union all
      select (b.cree_le at time zone tz)::date, b.cree_le, 'Remboursement du retour ' || r.numero, b.montant, 0
      from public.remboursements_vente b join public.retours_vente r on r.id = b.retour_id join v on v.id = r.vente_id
      where b.mode <> 'avoir'
    ),
    ouverture as (select coalesce(sum(debit - credit), 0) s from m where jour < p_du),
    periode as (select * from m where jour between p_du and p_au)
    select jsonb_build_object(
      'contact', jsonb_build_object('id', k.id, 'nom', k.nom, 'societe', k.societe, 'telephone', k.telephone, 'email', k.email, 'adresse', k.adresse),
      'du', p_du, 'au', p_au,
      'solde_ouverture', (select s from ouverture),
      'total_debit', coalesce((select sum(debit) from periode), 0),
      'total_credit', coalesce((select sum(credit) from periode), 0),
      'solde_cloture', (select s from ouverture) + coalesce((select sum(debit - credit) from periode), 0),
      'credits_disponibles', coalesce((select sum(montant - montant_utilise - montant_rembourse) from public.credits_client
                                       where contact_id = k.id and statut = 'disponible' and public.lecture_hub(p_etablissement_id, hub_id)), 0),
      'lignes', coalesce((select jsonb_agg(jsonb_build_object('date', jour, 'libelle', libelle, 'debit', debit, 'credit', credit) order by quand, debit desc)
                          from periode), '[]'::jsonb)
    )
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Validation des dépenses
-- ---------------------------------------------------------------------------
create function public.seuil_validation_depense(p_etablissement_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$ select coalesce((public.parametre_module(p_etablissement_id, 'depenses', 'seuil_validation') #>> '{}')::numeric, 0) $$;

-- Même enregistrement qu'avant ; seule nouveauté : au-dessus du seuil, une dépense hors caisse demandée par
-- quelqu'un qui ne peut pas valider est refusée ici (l'écran passe alors par demander_depense).
create or replace function public.enregistrer_depense(p_etablissement_id uuid, p_depense jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid;
  fournisseur uuid := nullif(p_depense ->> 'fournisseur_id', '')::uuid;
  session public.sessions_caisse%rowtype;
  hub uuid := nullif(p_depense ->> 'hub_id', '')::uuid;
  seuil numeric := public.seuil_validation_depense(p_etablissement_id);
begin
  perform public.exiger_permission(p_etablissement_id, 'depenses.gerer');
  if fournisseur is not null and not exists (
    select 1 from public.contacts where id = fournisseur and etablissement_id = p_etablissement_id
  ) then
    raise exception 'Fournisseur inconnu dans cet établissement';
  end if;
  if nullif(p_depense ->> 'session_caisse_id', '') is not null then
    select * into session from public.sessions_caisse
    where id = (p_depense ->> 'session_caisse_id')::uuid and etablissement_id = p_etablissement_id and statut = 'ouverte';
    if session.id is null then
      raise exception 'Caisse introuvable ou clôturée';
    end if;
    hub := session.hub_id;
  end if;
  if session.id is null and seuil > 0 and (p_depense ->> 'montant')::numeric >= seuil
     and not public.a_permission(p_etablissement_id, 'depenses.valider') then
    raise exception 'Cette dépense atteint le seuil de validation (%) : envoyez-la en validation', seuil;
  end if;
  if hub is not null then
    if not exists (select 1 from public.hubs where id = hub and etablissement_id = p_etablissement_id) then
      raise exception 'Hub inconnu dans cet établissement';
    end if;
    perform public.exiger_acces_hub(hub);
  end if;
  insert into public.depenses(
    etablissement_id, hub_id, date_depense, categorie, libelle, montant, mode, fournisseur_id, session_caisse_id, justificatif, cree_par
  ) values (
    p_etablissement_id,
    hub,
    coalesce(nullif(p_depense ->> 'date_depense', '')::date, current_date),
    coalesce(nullif(btrim(p_depense ->> 'categorie'), ''), 'Divers'),
    btrim(p_depense ->> 'libelle'),
    (p_depense ->> 'montant')::numeric,
    coalesce(nullif(p_depense ->> 'mode', ''), 'especes'),
    fournisseur,
    session.id,
    nullif(p_depense ->> 'justificatif', ''),
    auth.uid()
  )
  returning id into resultat;
  return resultat;
end
$$;

-- Demande de dépense (hors caisse). p : mêmes clés que enregistrer_depense, sans session de caisse.
create function public.demander_depense(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid;
  v_fournisseur uuid := nullif(p ->> 'fournisseur_id', '')::uuid;
  v_hub uuid := nullif(p ->> 'hub_id', '')::uuid;
  v_montant numeric := nullif(p ->> 'montant', '')::numeric;
begin
  perform public.exiger_permission(p_etablissement_id, 'depenses.gerer');
  if v_montant is null or v_montant = 'NaN'::numeric or v_montant <= 0 or v_montant <> round(v_montant, 2) then
    raise exception 'Montant invalide';
  end if;
  if coalesce(btrim(p ->> 'libelle'), '') = '' then
    raise exception 'Indiquez l''objet de la dépense';
  end if;
  if v_fournisseur is not null and not exists (select 1 from public.contacts where id = v_fournisseur and etablissement_id = p_etablissement_id) then
    raise exception 'Fournisseur inconnu dans cet établissement';
  end if;
  if v_hub is not null then
    if not exists (select 1 from public.hubs where id = v_hub and etablissement_id = p_etablissement_id) then
      raise exception 'Hub inconnu dans cet établissement';
    end if;
    perform public.exiger_acces_hub(v_hub);
  end if;
  insert into public.demandes_depense (etablissement_id, hub_id, date_depense, categorie, libelle, montant, mode, fournisseur_id, justificatif, demande_par)
  values (p_etablissement_id, v_hub, coalesce(nullif(p ->> 'date_depense', '')::date, public.date_locale(p_etablissement_id)),
    coalesce(nullif(btrim(p ->> 'categorie'), ''), 'Divers'), btrim(p ->> 'libelle'), v_montant,
    coalesce(nullif(p ->> 'mode', ''), 'virement'), v_fournisseur, nullif(p ->> 'justificatif', ''), auth.uid())
  returning id into resultat;
  perform public.notifier_permission(p_etablissement_id, 'depenses.valider', 'depenses.a_valider', 'Dépense à valider',
    btrim(p ->> 'libelle'), 'depenses');
  return resultat;
end
$$;

-- Valide (crée la vraie dépense, à la date demandée) ou refuse (motif) une demande. On ne valide pas sa propre demande.
create function public.decider_demande_depense(p_demande_id uuid, p_valider boolean, p_motif text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  dd public.demandes_depense%rowtype;
  v_depense uuid;
begin
  select * into dd from public.demandes_depense where id = p_demande_id for update;
  if dd.id is null then
    raise exception 'Demande introuvable';
  end if;
  perform public.exiger_permission(dd.etablissement_id, 'depenses.valider');
  if dd.hub_id is not null then
    perform public.exiger_acces_hub(dd.hub_id);
  end if;
  if dd.statut <> 'a_valider' then
    raise exception 'Cette demande a déjà été traitée';
  end if;
  if dd.demande_par = auth.uid() then
    raise exception 'Une autre personne habilitée doit valider votre propre demande';
  end if;
  if p_valider then
    v_depense := public.enregistrer_depense(dd.etablissement_id, jsonb_build_object(
      'hub_id', dd.hub_id, 'date_depense', dd.date_depense, 'categorie', dd.categorie, 'libelle', dd.libelle,
      'montant', dd.montant, 'mode', dd.mode, 'fournisseur_id', dd.fournisseur_id, 'justificatif', dd.justificatif));
    update public.demandes_depense set statut = 'validee', decide_par = auth.uid(), decide_le = now(), depense_id = v_depense where id = dd.id;
  else
    if coalesce(btrim(p_motif), '') = '' then
      raise exception 'Indiquez pourquoi la dépense est refusée';
    end if;
    update public.demandes_depense set statut = 'refusee', decide_par = auth.uid(), decide_le = now(), motif_refus = btrim(p_motif) where id = dd.id;
  end if;
  perform public.notifier(dd.demande_par, dd.etablissement_id, 'depenses.decision',
    case when p_valider then 'Dépense validée' else 'Dépense refusée' end, dd.libelle, 'depenses');
  return v_depense;
end
$$;

-- Réglages utiles à l'écran Dépenses.
create function public.reglages_depenses(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.lecture_autorisee(p_etablissement_id, 'depenses.lire') then
    raise exception 'Permission refusée : depenses.lire' using errcode = '42501';
  end if;
  return jsonb_build_object('seuil_validation', public.seuil_validation_depense(p_etablissement_id),
    'peut_valider', public.a_permission(p_etablissement_id, 'depenses.valider'));
end
$$;

-- ---------------------------------------------------------------------------
-- 7. Droits d'exécution
-- ---------------------------------------------------------------------------
do $$
declare signature text;
begin
  foreach signature in array array[
    'public.contester_facture(uuid, text)', 'public.clore_contestation_facture(uuid, text)',
    'public.encaisser_avec_trop_percu(uuid, numeric, text, text)', 'public.utiliser_credit_client(uuid, uuid, numeric)',
    'public.rembourser_credit_client(uuid, text, text)', 'public.releve_client(uuid, uuid, date, date)',
    'public.enregistrer_depense(uuid, jsonb)', 'public.demander_depense(uuid, jsonb)',
    'public.decider_demande_depense(uuid, boolean, text)', 'public.reglages_depenses(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
  revoke execute on function public.seuil_validation_depense(uuid) from public, anon, authenticated;
end
$$;

notify pgrst, 'reload schema';
