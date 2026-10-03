-- Hôtel (2026-10-03) : les modules « hotel_chambres » et « hotel_reservations », jusqu'ici « Prévus », deviennent réels.
-- Chambres : types (capacité, tarif de la nuit), chambres numérotées, état d'entretien (propre, sale, en nettoyage,
-- hors service). Réservations : client (contact ou simple nom), dates, type, chambre, tarif, contrôle de disponibilité
-- (jamais de surréservation), arrivée (check-in), prestations du séjour, départ (check-out) qui émet la facture
-- (module Facturation) : Hôtel → Réservation → Services → Facturation → Paiement. Rien ne se supprime.

-- ---------------------------------------------------------------------------
-- 1. Catalogue et droits
-- ---------------------------------------------------------------------------
update public.modules set
  description = 'Types de chambres, tarifs, chambres, état d''entretien (housekeeping).',
  documentation = 'docs/HOTEL.md'
where id = 'hotel_chambres';
update public.modules set
  description = 'Disponibilités, planning, réservations, arrivées, prestations, départs facturés.',
  documentation = 'docs/HOTEL.md',
  parametres_schema = '[
    {"cle": "heure_depart", "libelle": "Heure limite de départ (affichage)", "type": "texte", "defaut": "12:00"},
    {"cle": "menage_au_depart", "libelle": "Marquer la chambre « à nettoyer » au départ", "type": "booleen", "defaut": true}
  ]'::jsonb
where id = 'hotel_reservations';
insert into public.module_dependances (module_id, depend_de) values ('hotel_reservations', 'facturation')
on conflict do nothing;

insert into public.permissions (id, module_id, description) values
  ('hotel_chambres.lire', 'hotel_chambres', 'Voir les chambres et leur état'),
  ('hotel_chambres.gerer', 'hotel_chambres', 'Gérer les types de chambres, tarifs et chambres'),
  ('hotel_chambres.menage', 'hotel_chambres', 'Mettre à jour l''état d''entretien des chambres'),
  ('hotel_reservations.lire', 'hotel_reservations', 'Voir les réservations, le planning et les séjours'),
  ('hotel_reservations.gerer', 'hotel_reservations', 'Créer, modifier, annuler les réservations'),
  ('hotel_reservations.sejour', 'hotel_reservations', 'Arrivées, prestations du séjour, départs facturés')
on conflict (id) do nothing;

insert into public.roles (id, nom, description, ordre, modules_requis) values
  ('receptionniste', 'Réceptionniste', 'Réservations, arrivées, départs, factures du séjour', 52, '{hotel_reservations}'),
  ('agent_entretien', 'Agent d''entretien', 'État des chambres (housekeeping)', 59, '{hotel_chambres}')
on conflict (id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['gerant', 'responsable']) r
cross join unnest(array['hotel_chambres.lire', 'hotel_chambres.gerer', 'hotel_chambres.menage',
  'hotel_reservations.lire', 'hotel_reservations.gerer', 'hotel_reservations.sejour']) p
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id) values
  ('responsable_hub', 'hotel_chambres.lire'), ('responsable_hub', 'hotel_chambres.menage'),
  ('responsable_hub', 'hotel_reservations.lire'), ('responsable_hub', 'hotel_reservations.gerer'), ('responsable_hub', 'hotel_reservations.sejour'),
  ('receptionniste', 'etablissement.lire'), ('receptionniste', 'hotel_chambres.lire'), ('receptionniste', 'hotel_chambres.menage'),
  ('receptionniste', 'hotel_reservations.lire'), ('receptionniste', 'hotel_reservations.gerer'), ('receptionniste', 'hotel_reservations.sejour'),
  ('receptionniste', 'contacts.lire'), ('receptionniste', 'contacts.gerer'), ('receptionniste', 'articles.lire'),
  ('receptionniste', 'facturation.lire'), ('receptionniste', 'facturation.gerer'), ('receptionniste', 'ventes.lire'),
  ('receptionniste', 'paiements.lire'), ('receptionniste', 'caisse.utiliser'), ('receptionniste', 'recus.lire'),
  ('agent_entretien', 'etablissement.lire'), ('agent_entretien', 'hotel_chambres.lire'), ('agent_entretien', 'hotel_chambres.menage'),
  ('employe', 'hotel_chambres.lire'), ('employe', 'hotel_reservations.lire'),
  ('comptable', 'hotel_chambres.lire'), ('comptable', 'hotel_reservations.lire'),
  ('lecteur', 'hotel_chambres.lire'), ('lecteur', 'hotel_reservations.lire')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
create table public.hotel_types_chambre (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  nom text not null check (btrim(nom) <> '' and length(nom) <= 80),
  description text check (description is null or length(description) <= 1000),
  capacite integer not null default 2 check (capacite between 1 and 20),
  tarif_nuit numeric(14, 2) not null check (tarif_nuit >= 0),
  ordre integer not null default 0,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (etablissement_id, nom),
  unique (id, etablissement_id)
);

create table public.hotel_chambres (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  type_id uuid not null,
  numero text not null check (btrim(numero) <> '' and length(numero) <= 20),
  etage text check (etage is null or length(etage) <= 20),
  menage text not null default 'propre' check (menage in ('propre', 'sale', 'en_nettoyage', 'hors_service')),
  note text check (note is null or length(note) <= 300),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (etablissement_id, numero),
  unique (id, etablissement_id),
  foreign key (type_id, etablissement_id) references public.hotel_types_chambre(id, etablissement_id) on delete restrict
);
create index hotel_chambres_type_idx on public.hotel_chambres(type_id);

create table public.hotel_reservations (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  numero text not null,
  contact_id uuid references public.contacts(id) on delete restrict,
  nom_client text not null check (btrim(nom_client) <> '' and length(nom_client) <= 160),
  telephone text check (telephone is null or length(telephone) <= 40),
  type_id uuid not null,
  chambre_id uuid,
  arrivee date not null,
  depart date not null,
  adultes integer not null default 1 check (adultes between 1 and 20),
  enfants integer not null default 0 check (enfants between 0 and 20),
  tarif_nuit numeric(14, 2) not null check (tarif_nuit >= 0),
  source text not null default 'direct' check (source in ('direct', 'telephone', 'whatsapp', 'site_web', 'agence', 'plateforme', 'autre')),
  statut text not null default 'confirmee' check (statut in ('confirmee', 'en_cours', 'terminee', 'annulee', 'no_show')),
  note text check (note is null or length(note) <= 1000),
  check_in_le timestamptz,
  check_out_le timestamptz,
  document_vente_id uuid references public.documents_vente(id) on delete restrict,
  motif_annulation text,
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (etablissement_id, numero),
  unique (id, etablissement_id),
  check (depart > arrivee),
  check (depart - arrivee <= 365),
  check (statut not in ('en_cours', 'terminee') or (chambre_id is not null and check_in_le is not null)),
  check (statut <> 'terminee' or check_out_le is not null),
  check (statut not in ('annulee', 'no_show') or btrim(coalesce(motif_annulation, '')) <> ''),
  foreign key (type_id, etablissement_id) references public.hotel_types_chambre(id, etablissement_id) on delete restrict,
  foreign key (chambre_id, etablissement_id) references public.hotel_chambres(id, etablissement_id) on delete restrict
);
create index hotel_reservations_dates_idx on public.hotel_reservations(etablissement_id, arrivee, depart) where statut in ('confirmee', 'en_cours');
create index hotel_reservations_chambre_idx on public.hotel_reservations(chambre_id) where statut in ('confirmee', 'en_cours');
-- Une chambre n'accueille qu'un séjour en cours.
create unique index hotel_reservations_chambre_occupee on public.hotel_reservations(chambre_id) where statut = 'en_cours';

create table public.hotel_prestations (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  reservation_id uuid not null,
  article_id uuid references public.articles(id) on delete restrict,
  libelle text not null check (btrim(libelle) <> '' and length(libelle) <= 200),
  quantite numeric(10, 3) not null check (quantite > 0),
  prix_unitaire numeric(14, 2) not null check (prix_unitaire >= 0),
  date_prestation date not null,
  statut text not null default 'valide' check (statut in ('valide', 'annulee')),
  motif_annulation text,
  saisi_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  annule_le timestamptz,
  annule_par uuid references auth.users(id) on delete restrict,
  check (statut = 'valide' or (annule_le is not null and btrim(coalesce(motif_annulation, '')) <> '')),
  foreign key (reservation_id, etablissement_id) references public.hotel_reservations(id, etablissement_id) on delete restrict
);
create index hotel_prestations_reservation_idx on public.hotel_prestations(reservation_id);

do $$
declare
  nom_table text;
begin
  foreach nom_table in array array['hotel_types_chambre', 'hotel_chambres', 'hotel_reservations'] loop
    execute format('create trigger %I_modifie_le before update on public.%I for each row execute function public.fixer_modifie_le()', nom_table, nom_table);
  end loop;
  foreach nom_table in array array['hotel_types_chambre', 'hotel_chambres', 'hotel_reservations', 'hotel_prestations'] loop
    execute format('create trigger %I_sans_suppression before delete on public.%I for each row execute function public.refuser_suppression()', nom_table, nom_table);
    execute format('create trigger %I_verrou_etablissement before update on public.%I for each row execute function public.verrouiller_etablissement_id()', nom_table, nom_table);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.journaliser_modification()', nom_table, nom_table);
    execute format('alter table public.%I enable row level security', nom_table);
  end loop;
end
$$;
create policy lecture on public.hotel_types_chambre for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'hotel_chambres.lire') or public.lecture_autorisee(etablissement_id, 'hotel_reservations.lire'));
create policy lecture on public.hotel_chambres for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'hotel_chambres.lire') or public.lecture_autorisee(etablissement_id, 'hotel_reservations.lire'));
create policy lecture on public.hotel_reservations for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'hotel_reservations.lire'));
create policy lecture on public.hotel_prestations for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'hotel_reservations.lire'));

-- Une prestation saisie ne change plus (seule l'annulation, avec motif, est possible).
create function public.proteger_prestation_hotel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - array['statut', 'annule_le', 'annule_par', 'motif_annulation'])
     <> (to_jsonb(old) - array['statut', 'annule_le', 'annule_par', 'motif_annulation']) or old.statut = 'annulee' then
    raise exception 'Une prestation saisie ne se modifie pas : annulez-la avec un motif et ressaisissez-la';
  end if;
  return new;
end
$$;
create trigger hotel_prestations_protection before update on public.hotel_prestations
for each row execute function public.proteger_prestation_hotel();

insert into public.types_pieces_jointes (objet_type, table_nom, module_id, permission_lire, permission_ecrire, libelle)
values ('hotel_reservation', 'hotel_reservations', 'hotel_reservations', 'hotel_reservations.lire', 'hotel_reservations.gerer', 'Réservation')
on conflict (objet_type) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Fonctions
-- ---------------------------------------------------------------------------
-- p : { id?, nom, description?, capacite?, tarif_nuit, ordre?, actif? }
create function public.enregistrer_type_chambre(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p ->> 'id', '')::uuid;
  v_tarif numeric := nullif(p ->> 'tarif_nuit', '')::numeric;
begin
  perform public.exiger_permission(p_etablissement_id, 'hotel_chambres.gerer');
  if coalesce(btrim(p ->> 'nom'), '') = '' then
    raise exception 'Le nom du type de chambre est obligatoire';
  end if;
  if v_tarif is null or v_tarif = 'NaN'::numeric or v_tarif < 0 then
    raise exception 'Indiquez le tarif de la nuit';
  end if;
  if exists (select 1 from public.hotel_types_chambre where etablissement_id = p_etablissement_id and lower(nom) = lower(btrim(p ->> 'nom'))
             and id is distinct from resultat) then
    raise exception 'Le type « % » existe déjà', btrim(p ->> 'nom');
  end if;
  if resultat is null then
    insert into public.hotel_types_chambre (etablissement_id, nom, description, capacite, tarif_nuit, ordre, actif)
    values (p_etablissement_id, btrim(p ->> 'nom'), nullif(btrim(p ->> 'description'), ''), coalesce(nullif(p ->> 'capacite', '')::integer, 2),
      round(v_tarif, 2), coalesce(nullif(p ->> 'ordre', '')::integer, 0), coalesce((p ->> 'actif')::boolean, true))
    returning id into resultat;
  else
    update public.hotel_types_chambre set nom = btrim(p ->> 'nom'), description = nullif(btrim(p ->> 'description'), ''),
      capacite = coalesce(nullif(p ->> 'capacite', '')::integer, capacite), tarif_nuit = round(v_tarif, 2),
      ordre = coalesce(nullif(p ->> 'ordre', '')::integer, ordre), actif = coalesce((p ->> 'actif')::boolean, true)
    where id = resultat and etablissement_id = p_etablissement_id;
    if not found then
      raise exception 'Type de chambre introuvable dans cet établissement';
    end if;
  end if;
  return resultat;
end
$$;

-- p : { id?, type_id, numero, etage?, note?, actif? }
create function public.enregistrer_chambre(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p ->> 'id', '')::uuid;
  v_type uuid := nullif(p ->> 'type_id', '')::uuid;
  existant public.hotel_chambres%rowtype;
begin
  perform public.exiger_permission(p_etablissement_id, 'hotel_chambres.gerer');
  if not exists (select 1 from public.hotel_types_chambre where id = v_type and etablissement_id = p_etablissement_id) then
    raise exception 'Choisissez le type de la chambre';
  end if;
  if coalesce(btrim(p ->> 'numero'), '') = '' then
    raise exception 'Le numéro de chambre est obligatoire';
  end if;
  if exists (select 1 from public.hotel_chambres where etablissement_id = p_etablissement_id and lower(numero) = lower(btrim(p ->> 'numero'))
             and id is distinct from resultat) then
    raise exception 'La chambre % existe déjà', btrim(p ->> 'numero');
  end if;
  if resultat is null then
    insert into public.hotel_chambres (etablissement_id, type_id, numero, etage, note, actif)
    values (p_etablissement_id, v_type, btrim(p ->> 'numero'), nullif(btrim(p ->> 'etage'), ''), nullif(btrim(p ->> 'note'), ''),
      coalesce((p ->> 'actif')::boolean, true))
    returning id into resultat;
  else
    select * into existant from public.hotel_chambres where id = resultat and etablissement_id = p_etablissement_id for update;
    if existant.id is null then
      raise exception 'Chambre introuvable dans cet établissement';
    end if;
    if (v_type <> existant.type_id or not coalesce((p ->> 'actif')::boolean, true)) and exists (
      select 1 from public.hotel_reservations where chambre_id = resultat and statut in ('confirmee', 'en_cours')
    ) then
      raise exception 'Cette chambre a des réservations à venir ou un séjour en cours : réaffectez-les d''abord';
    end if;
    update public.hotel_chambres set type_id = v_type, numero = btrim(p ->> 'numero'), etage = nullif(btrim(p ->> 'etage'), ''),
      note = nullif(btrim(p ->> 'note'), ''), actif = coalesce((p ->> 'actif')::boolean, true)
    where id = resultat;
  end if;
  return resultat;
end
$$;

-- Housekeeping : propre, sale, en nettoyage, hors service.
create function public.changer_menage_chambre(p_chambre_id uuid, p_menage text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ch public.hotel_chambres%rowtype;
begin
  select * into ch from public.hotel_chambres where id = p_chambre_id for update;
  if ch.id is null then
    raise exception 'Chambre introuvable';
  end if;
  perform public.exiger_permission(ch.etablissement_id, 'hotel_chambres.menage');
  if p_menage is null or p_menage not in ('propre', 'sale', 'en_nettoyage', 'hors_service') then
    raise exception 'État inconnu : %', p_menage;
  end if;
  if p_menage = 'hors_service' and coalesce(btrim(p_note), '') = '' then
    raise exception 'Indiquez pourquoi la chambre est hors service';
  end if;
  update public.hotel_chambres set menage = p_menage, note = coalesce(nullif(btrim(p_note), ''), case when p_menage = 'hors_service' then note end)
  where id = ch.id;
end
$$;

-- Disponibilité : jamais deux séjours sur la même chambre, jamais plus de réservations d'un type que de chambres.
create function public.verifier_disponibilite_hotel(p_etablissement_id uuid, p_type_id uuid, p_chambre_id uuid,
  p_arrivee date, p_depart date, p_exclure uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chambres integer;
  nuit date;
  v_pris integer;
  v_num text;
begin
  -- Verrou du type : deux réceptions ne réservent pas la dernière chambre en même temps.
  perform 1 from public.hotel_types_chambre where id = p_type_id for update;
  if p_chambre_id is not null then
    select numero into v_num from public.hotel_chambres where id = p_chambre_id;
    if exists (
      select 1 from public.hotel_reservations r
      where r.chambre_id = p_chambre_id and r.statut in ('confirmee', 'en_cours') and r.id is distinct from p_exclure
        and r.arrivee < p_depart and r.depart > p_arrivee
    ) then
      raise exception 'La chambre % est déjà réservée sur ces dates', v_num;
    end if;
  end if;
  select count(*) into v_chambres from public.hotel_chambres
  where type_id = p_type_id and actif and menage <> 'hors_service';
  for nuit in select generate_series(p_arrivee, p_depart - 1, interval '1 day')::date loop
    select count(*) into v_pris from public.hotel_reservations r
    where r.etablissement_id = p_etablissement_id and r.type_id = p_type_id and r.statut in ('confirmee', 'en_cours')
      and r.id is distinct from p_exclure and r.arrivee <= nuit and r.depart > nuit;
    if v_pris >= v_chambres then
      raise exception 'Complet pour ce type de chambre la nuit du %', to_char(nuit, 'DD/MM/YYYY');
    end if;
  end loop;
end
$$;

-- p : { id?, contact_id?, nom_client?, telephone?, type_id, chambre_id?, arrivee, depart, adultes?, enfants?, tarif_nuit?, source?, note? }
create function public.enregistrer_reservation_hotel(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p ->> 'id', '')::uuid;
  existant public.hotel_reservations%rowtype;
  v_type public.hotel_types_chambre%rowtype;
  v_contact public.contacts%rowtype;
  v_chambre uuid := nullif(p ->> 'chambre_id', '')::uuid;
  v_arrivee date := nullif(p ->> 'arrivee', '')::date;
  v_depart date := nullif(p ->> 'depart', '')::date;
  v_tarif numeric := nullif(p ->> 'tarif_nuit', '')::numeric;
  v_nom text;
  v_adultes integer := coalesce(nullif(p ->> 'adultes', '')::integer, 1);
  v_enfants integer := coalesce(nullif(p ->> 'enfants', '')::integer, 0);
begin
  perform public.exiger_permission(p_etablissement_id, 'hotel_reservations.gerer');
  if resultat is not null then
    select * into existant from public.hotel_reservations where id = resultat and etablissement_id = p_etablissement_id for update;
    if existant.id is null then
      raise exception 'Réservation introuvable dans cet établissement';
    end if;
    if existant.statut <> 'confirmee' then
      raise exception 'Seule une réservation pas encore arrivée se modifie (séjour en cours : prolonger au départ)';
    end if;
  end if;
  select * into v_type from public.hotel_types_chambre where id = nullif(p ->> 'type_id', '')::uuid and etablissement_id = p_etablissement_id;
  if v_type.id is null or not v_type.actif then
    raise exception 'Choisissez un type de chambre';
  end if;
  if v_arrivee is null or v_depart is null or v_depart <= v_arrivee then
    raise exception 'Le départ doit être après l''arrivée';
  end if;
  if v_depart - v_arrivee > 365 then
    raise exception 'Séjour trop long (365 nuits au plus)';
  end if;
  if resultat is null and v_arrivee < public.date_locale(p_etablissement_id) then
    raise exception 'L''arrivée ne peut pas être dans le passé';
  end if;
  if v_adultes + v_enfants > v_type.capacite then
    raise exception 'Capacité dépassée : % personne(s) au plus en « % »', v_type.capacite, v_type.nom;
  end if;
  if nullif(p ->> 'contact_id', '') is not null then
    select * into v_contact from public.contacts where id = (p ->> 'contact_id')::uuid and etablissement_id = p_etablissement_id and type <> 'fournisseur';
    if v_contact.id is null then
      raise exception 'Client inconnu dans cet établissement';
    end if;
  end if;
  v_nom := coalesce(nullif(btrim(p ->> 'nom_client'), ''), nullif(btrim(coalesce(v_contact.societe, v_contact.nom)), ''));
  if v_nom is null then
    raise exception 'Indiquez le nom du client';
  end if;
  if v_chambre is not null and not exists (
    select 1 from public.hotel_chambres where id = v_chambre and etablissement_id = p_etablissement_id and type_id = v_type.id and actif
  ) then
    raise exception 'La chambre choisie n''est pas de ce type';
  end if;
  if v_tarif is not null and (v_tarif = 'NaN'::numeric or v_tarif < 0) then
    raise exception 'Tarif invalide';
  end if;
  perform public.verifier_disponibilite_hotel(p_etablissement_id, v_type.id, v_chambre, v_arrivee, v_depart, resultat);
  if resultat is null then
    insert into public.hotel_reservations (etablissement_id, numero, contact_id, nom_client, telephone, type_id, chambre_id, arrivee, depart,
      adultes, enfants, tarif_nuit, source, note, cree_par)
    values (p_etablissement_id, public.prochain_numero(p_etablissement_id, 'reservation_hotel', 'RS-'), v_contact.id, v_nom,
      coalesce(nullif(btrim(p ->> 'telephone'), ''), v_contact.telephone), v_type.id, v_chambre, v_arrivee, v_depart, v_adultes, v_enfants,
      round(coalesce(v_tarif, v_type.tarif_nuit), 2), coalesce(nullif(p ->> 'source', ''), 'direct'), nullif(btrim(p ->> 'note'), ''), auth.uid())
    returning id into resultat;
  else
    update public.hotel_reservations set contact_id = v_contact.id, nom_client = v_nom,
      telephone = coalesce(nullif(btrim(p ->> 'telephone'), ''), v_contact.telephone), type_id = v_type.id, chambre_id = v_chambre,
      arrivee = v_arrivee, depart = v_depart, adultes = v_adultes, enfants = v_enfants,
      tarif_nuit = round(coalesce(v_tarif, existant.tarif_nuit), 2), source = coalesce(nullif(p ->> 'source', ''), existant.source),
      note = nullif(btrim(p ->> 'note'), '')
    where id = resultat;
  end if;
  return resultat;
end
$$;

-- Annulation (motif) ou absence (no-show) d'une réservation pas encore arrivée.
create function public.annuler_reservation_hotel(p_reservation_id uuid, p_motif text, p_no_show boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.hotel_reservations%rowtype;
begin
  select * into r from public.hotel_reservations where id = p_reservation_id for update;
  if r.id is null then
    raise exception 'Réservation introuvable';
  end if;
  perform public.exiger_permission(r.etablissement_id, 'hotel_reservations.gerer');
  if r.statut <> 'confirmee' then
    raise exception 'Seule une réservation pas encore arrivée s''annule';
  end if;
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Le motif est obligatoire';
  end if;
  if coalesce(p_no_show, false) and r.arrivee > public.date_locale(r.etablissement_id) then
    raise exception 'Absence constatée seulement à partir du jour d''arrivée';
  end if;
  update public.hotel_reservations set statut = case when coalesce(p_no_show, false) then 'no_show' else 'annulee' end,
    motif_annulation = btrim(p_motif)
  where id = r.id;
end
$$;

-- Arrivée : chambre attribuée (celle de la réservation ou une autre du même type), prête, jour d'arrivée atteint.
create function public.check_in_hotel(p_reservation_id uuid, p_chambre_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.hotel_reservations%rowtype;
  ch public.hotel_chambres%rowtype;
  aujourdhui date;
begin
  select * into r from public.hotel_reservations where id = p_reservation_id for update;
  if r.id is null then
    raise exception 'Réservation introuvable';
  end if;
  perform public.exiger_permission(r.etablissement_id, 'hotel_reservations.sejour');
  if r.statut <> 'confirmee' then
    raise exception 'Cette réservation n''attend pas d''arrivée';
  end if;
  aujourdhui := public.date_locale(r.etablissement_id);
  if r.arrivee > aujourdhui then
    raise exception 'Arrivée prévue le % : modifiez d''abord la date', to_char(r.arrivee, 'DD/MM/YYYY');
  end if;
  if r.depart <= aujourdhui then
    raise exception 'La date de départ est passée : modifiez la réservation';
  end if;
  select * into ch from public.hotel_chambres
  where id = coalesce(p_chambre_id, r.chambre_id) and etablissement_id = r.etablissement_id for update;
  if ch.id is null then
    raise exception 'Choisissez la chambre';
  end if;
  if ch.type_id <> r.type_id or not ch.actif then
    raise exception 'La chambre % n''est pas du type réservé', ch.numero;
  end if;
  if ch.menage <> 'propre' then
    raise exception 'La chambre % n''est pas prête (%)', ch.numero, replace(ch.menage, '_', ' ');
  end if;
  if exists (select 1 from public.hotel_reservations where chambre_id = ch.id and statut = 'en_cours') then
    raise exception 'La chambre % est occupée', ch.numero;
  end if;
  -- La nuit d'aujourd'hui commence : la réservation s'aligne sur la date réelle d'arrivée.
  perform public.verifier_disponibilite_hotel(r.etablissement_id, r.type_id, ch.id, aujourdhui, r.depart, r.id);
  update public.hotel_reservations set chambre_id = ch.id, statut = 'en_cours', check_in_le = now(), arrivee = aujourdhui where id = r.id;
end
$$;

-- Prestation du séjour (restaurant, minibar, blanchisserie, transfert…). p : { article_id?, libelle?, quantite, prix_unitaire?, date_prestation? }
create function public.ajouter_prestation_hotel(p_reservation_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.hotel_reservations%rowtype;
  v_article public.articles%rowtype;
  v_quantite numeric := nullif(p ->> 'quantite', '')::numeric;
  v_prix numeric := nullif(p ->> 'prix_unitaire', '')::numeric;
  resultat uuid;
begin
  select * into r from public.hotel_reservations where id = p_reservation_id for update;
  if r.id is null then
    raise exception 'Réservation introuvable';
  end if;
  perform public.exiger_permission(r.etablissement_id, 'hotel_reservations.sejour');
  if r.statut <> 'en_cours' then
    raise exception 'Une prestation s''ajoute pendant le séjour';
  end if;
  if nullif(p ->> 'article_id', '') is not null then
    select * into v_article from public.articles where id = (p ->> 'article_id')::uuid and etablissement_id = r.etablissement_id;
    if v_article.id is null or not v_article.actif then
      raise exception 'Article inconnu ou archivé';
    end if;
  end if;
  v_prix := coalesce(v_prix, v_article.prix_vente);
  if v_quantite is null or v_quantite = 'NaN'::numeric or v_quantite <= 0 or v_quantite > 1000 then
    raise exception 'Quantité invalide';
  end if;
  if v_prix is null or v_prix = 'NaN'::numeric or v_prix < 0 then
    raise exception 'Prix invalide';
  end if;
  if coalesce(nullif(btrim(p ->> 'libelle'), ''), v_article.nom) is null then
    raise exception 'Indiquez la prestation';
  end if;
  insert into public.hotel_prestations (etablissement_id, reservation_id, article_id, libelle, quantite, prix_unitaire, date_prestation, saisi_par)
  values (r.etablissement_id, r.id, v_article.id, coalesce(nullif(btrim(p ->> 'libelle'), ''), v_article.nom), v_quantite, round(v_prix, 2),
    coalesce(nullif(p ->> 'date_prestation', '')::date, public.date_locale(r.etablissement_id)), auth.uid())
  returning id into resultat;
  return resultat;
end
$$;

create function public.annuler_prestation_hotel(p_prestation_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pr public.hotel_prestations%rowtype;
  v_statut text;
begin
  select * into pr from public.hotel_prestations where id = p_prestation_id for update;
  if pr.id is null then
    raise exception 'Prestation introuvable';
  end if;
  perform public.exiger_permission(pr.etablissement_id, 'hotel_reservations.sejour');
  select statut into v_statut from public.hotel_reservations where id = pr.reservation_id;
  if v_statut <> 'en_cours' then
    raise exception 'Le séjour est clos : corrigez par un avoir sur la facture';
  end if;
  if pr.statut = 'annulee' then
    raise exception 'Prestation déjà annulée';
  end if;
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Le motif est obligatoire';
  end if;
  update public.hotel_prestations set statut = 'annulee', annule_le = now(), annule_par = auth.uid(), motif_annulation = btrim(p_motif)
  where id = pr.id;
end
$$;

-- Départ : nuits réelles (au moins une) + prestations → facture émise (Facturation), chambre « à nettoyer ».
-- Le client sans fiche devient un contact (nom, téléphone) pour la facture. Paiement ensuite sur la facture.
create function public.check_out_hotel(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.hotel_reservations%rowtype;
  v_chambre public.hotel_chambres%rowtype;
  v_type text;
  aujourdhui date;
  v_nuits integer;
  v_lignes jsonb;
  v_contact uuid;
  v_facture uuid;
  v_hub uuid;
  emission jsonb;
begin
  select * into r from public.hotel_reservations where id = p_reservation_id for update;
  if r.id is null then
    raise exception 'Réservation introuvable';
  end if;
  perform public.exiger_permission(r.etablissement_id, 'hotel_reservations.sejour');
  perform public.exiger_permission(r.etablissement_id, 'facturation.gerer');
  if r.statut <> 'en_cours' then
    raise exception 'Seul un séjour en cours se termine';
  end if;
  aujourdhui := public.date_locale(r.etablissement_id);
  v_nuits := greatest(1, aujourdhui - r.arrivee);
  select * into v_chambre from public.hotel_chambres where id = r.chambre_id for update;
  select nom into v_type from public.hotel_types_chambre where id = r.type_id;
  v_contact := r.contact_id;
  if v_contact is null then
    insert into public.contacts (etablissement_id, type, nom, telephone)
    values (r.etablissement_id, 'client', r.nom_client, r.telephone)
    returning id into v_contact;
  end if;
  v_lignes := jsonb_build_array(jsonb_build_object(
    'libelle', 'Hébergement chambre ' || v_chambre.numero || ' (' || v_type || ')',
    'description', 'Du ' || to_char(r.arrivee, 'DD/MM/YYYY') || ' au ' || to_char(r.arrivee + v_nuits, 'DD/MM/YYYY'),
    'quantite', v_nuits, 'unite', 'nuit', 'prix_unitaire', r.tarif_nuit));
  v_lignes := v_lignes || coalesce((
    select jsonb_agg(jsonb_build_object('article_id', pr.article_id, 'libelle', pr.libelle,
      'description', to_char(pr.date_prestation, 'DD/MM/YYYY'), 'quantite', pr.quantite, 'prix_unitaire', pr.prix_unitaire) order by pr.date_prestation, pr.cree_le)
    from public.hotel_prestations pr where pr.reservation_id = r.id and pr.statut = 'valide'), '[]'::jsonb);
  select id into v_hub from public.hubs where etablissement_id = r.etablissement_id and principal;
  v_facture := public.enregistrer_document_vente(r.etablissement_id, jsonb_build_object(
    'type', 'facture', 'contact_id', v_contact, 'hub_id', v_hub, 'objet', 'Séjour ' || r.numero || ' · chambre ' || v_chambre.numero,
    'echeance', aujourdhui, 'lignes', v_lignes));
  emission := public.emettre_facture(v_facture);
  update public.hotel_reservations set statut = 'terminee', check_out_le = now(), depart = r.arrivee + v_nuits,
    contact_id = v_contact, document_vente_id = v_facture
  where id = r.id;
  if coalesce((public.parametre_module(r.etablissement_id, 'hotel_reservations', 'menage_au_depart') #>> '{}')::boolean, true) then
    update public.hotel_chambres set menage = 'sale' where id = v_chambre.id and menage <> 'hors_service';
    perform public.notifier_permission(r.etablissement_id, 'hotel_chambres.menage', 'hotel.menage',
      'Chambre ' || v_chambre.numero || ' à nettoyer', 'Départ de ' || r.nom_client, 'chambres');
  end if;
  return jsonb_build_object('document_id', v_facture, 'numero', emission ->> 'numero', 'nuits', v_nuits);
end
$$;

-- Disponibilités par type et par nuit (planning) : chambres utilisables, réservées, libres.
create function public.disponibilites_hotel(p_etablissement_id uuid, p_du date, p_au date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.lecture_autorisee(p_etablissement_id, 'hotel_reservations.lire') then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if p_du is null or p_au is null or p_au < p_du or p_au - p_du > 92 then
    raise exception 'Période invalide (92 jours au plus)';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('type_id', t.id, 'nom', t.nom, 'nuits', (
      select jsonb_agg(jsonb_build_object('date', n::date,
        'chambres', (select count(*) from public.hotel_chambres c where c.type_id = t.id and c.actif and c.menage <> 'hors_service'),
        'reservees', (select count(*) from public.hotel_reservations r where r.type_id = t.id and r.statut in ('confirmee', 'en_cours')
          and r.arrivee <= n::date and r.depart > n::date)) order by n)
      from generate_series(p_du, p_au, interval '1 day') n)) order by t.ordre, t.nom)
    from public.hotel_types_chambre t where t.etablissement_id = p_etablissement_id and t.actif), '[]'::jsonb);
end
$$;

create function public.tableau_de_bord_hotel(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  jour date := public.date_locale(p_etablissement_id);
  v_chambres integer;
  v_occupees integer;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'hotel_reservations.lire') and not public.lecture_autorisee(p_etablissement_id, 'hotel_chambres.lire') then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  select count(*) into v_chambres from public.hotel_chambres where etablissement_id = p_etablissement_id and actif and menage <> 'hors_service';
  select count(*) into v_occupees from public.hotel_reservations where etablissement_id = p_etablissement_id and statut = 'en_cours';
  return jsonb_build_object(
    'chambres', v_chambres,
    'occupees', v_occupees,
    'taux_occupation', case when v_chambres > 0 then round(100.0 * v_occupees / v_chambres) else 0 end,
    'arrivees_jour', (select count(*) from public.hotel_reservations where etablissement_id = p_etablissement_id and statut = 'confirmee' and arrivee <= jour),
    'departs_jour', (select count(*) from public.hotel_reservations where etablissement_id = p_etablissement_id and statut = 'en_cours' and depart <= jour),
    'a_nettoyer', (select count(*) from public.hotel_chambres where etablissement_id = p_etablissement_id and actif and menage in ('sale', 'en_nettoyage')),
    'hors_service', (select count(*) from public.hotel_chambres where etablissement_id = p_etablissement_id and actif and menage = 'hors_service'),
    'reservations_a_venir', (select count(*) from public.hotel_reservations where etablissement_id = p_etablissement_id and statut = 'confirmee' and arrivee > jour),
    'chiffre_mois', (select coalesce(sum(d.total_ttc), 0) from public.hotel_reservations r join public.documents_vente d on d.id = r.document_vente_id
      where r.etablissement_id = p_etablissement_id and d.statut = 'emise' and date_trunc('month', d.date_document) = date_trunc('month', jour::timestamp)),
    'nuitees_mois', (select coalesce(sum(r.depart - r.arrivee), 0) from public.hotel_reservations r
      where r.etablissement_id = p_etablissement_id and r.statut = 'terminee' and date_trunc('month', r.depart) = date_trunc('month', jour::timestamp))
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Disponibilité, solution « Hôtel », droits d'exécution
-- ---------------------------------------------------------------------------
update public.modules set statut = 'actif', version = '1.0' where id in ('hotel_chambres', 'hotel_reservations');
insert into public.solution_modules (solution_id, module_id, par_defaut) values
  ('hotel', 'etablissement', true), ('hotel', 'membres', true), ('hotel', 'tableau_de_bord', true), ('hotel', 'facturation', true),
  ('hotel', 'rh_presences', false), ('hotel', 'rh_conges', false), ('hotel', 'documents', false), ('hotel', 'achats', false)
on conflict (solution_id, module_id) do nothing;
update public.solution_modules set par_defaut = true where solution_id = 'hotel'
  and module_id in ('etablissement', 'membres', 'tableau_de_bord', 'articles', 'ventes', 'paiements', 'recus', 'contacts', 'facturation',
    'hotel_chambres', 'hotel_reservations', 'caisse', 'cloture', 'stock');
update public.solutions set statut = 'active',
  description = 'Hôtels, auberges, résidences : chambres, planning, réservations, arrivées, départs facturés, entretien ; restaurant et boutique en Hubs.'
where id = 'hotel' and statut in ('future', 'en_preparation');
-- Offre d'essai (30 jours automatiques), prix à 0 : Agence Elite fixe les prix dans son espace avant toute vente.
insert into public.offres (id, solution_id, nom, description, modules, offre_essai, actif, ordre) values
  ('hotel-complet', 'hotel', 'Hôtel Complet',
   'Chambres et entretien, planning, réservations, séjours facturés, caisse, ventes, paiements, reçus, ticket Z, stock, contacts, dépenses.',
   array['articles', 'stock', 'caisse', 'ventes', 'paiements', 'recus', 'cloture', 'contacts', 'depenses', 'facturation',
     'hotel_chambres', 'hotel_reservations'], true, true, 30)
on conflict (id) do nothing;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.enregistrer_type_chambre(uuid, jsonb)',
    'public.enregistrer_chambre(uuid, jsonb)',
    'public.changer_menage_chambre(uuid, text, text)',
    'public.enregistrer_reservation_hotel(uuid, jsonb)',
    'public.annuler_reservation_hotel(uuid, text, boolean)',
    'public.check_in_hotel(uuid, uuid)',
    'public.ajouter_prestation_hotel(uuid, jsonb)',
    'public.annuler_prestation_hotel(uuid, text)',
    'public.check_out_hotel(uuid)',
    'public.disponibilites_hotel(uuid, date, date)',
    'public.tableau_de_bord_hotel(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
  foreach signature in array array['public.verifier_disponibilite_hotel(uuid, uuid, uuid, date, date, uuid)', 'public.proteger_prestation_hotel()'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', signature);
  end loop;
end
$$;
