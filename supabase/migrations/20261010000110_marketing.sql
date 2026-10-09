-- Marketing (module M03, Bêta) : segments de contacts, consentements par canal, campagnes (brouillon → prête →
-- envoyée), destinataires figés au moment de la préparation, suivi. Aucun message ne part tout seul : l'envoi par un
-- service externe (e-mail, SMS, WhatsApp) attend les intégrations correspondantes ; en attendant, la liste des
-- destinataires s'exporte et l'envoi se déclare à la main. Seuls les contacts ayant accepté le canal sont retenus.
-- Proposé, jamais activé d'office.

-- ---------------------------------------------------------------------------
-- 1. Catalogue et droits
-- ---------------------------------------------------------------------------
insert into public.modules (id, nom, description, nature, statut, categorie, icone, ordre, version, documentation) values
  ('marketing', 'Marketing', 'Segments de contacts, consentements, campagnes préparées et suivies.',
   'transversal', 'beta', 'crm', 'message', 720, '0.1', 'docs/MARKETING.md')
on conflict (id) do nothing;
update public.modules set parametres_schema = '[
  {"cle": "signature", "libelle": "Signature ajoutée à la fin des messages", "type": "texte", "defaut": ""},
  {"cle": "mention_desinscription", "libelle": "Mention pour ne plus recevoir de messages", "type": "texte", "defaut": "Pour ne plus recevoir nos messages, répondez STOP."}
]'::jsonb where id = 'marketing';
insert into public.module_dependances (module_id, depend_de) values ('marketing', 'contacts')
on conflict do nothing;
insert into public.solution_modules (solution_id, module_id, par_defaut)
select s.id, 'marketing', false from public.solutions s
on conflict (solution_id, module_id) do nothing;

insert into public.permissions (id, module_id, description) values
  ('marketing.lire', 'marketing', 'Voir les segments, consentements et campagnes'),
  ('marketing.gerer', 'marketing', 'Créer les segments et campagnes, enregistrer les consentements, préparer et déclarer les envois')
on conflict (id) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['gerant', 'responsable', 'commercial']) r
cross join unnest(array['marketing.lire', 'marketing.gerer']) p
where exists (select 1 from public.roles where id = r)
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id) select 'lecteur', 'marketing.lire'
where exists (select 1 from public.roles where id = 'lecteur')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
-- Critères : { types?: [client, prospect, les_deux, fournisseur], acheteurs_jours?: n, inactifs_jours?: n, depense_min?: x }
create table public.mkt_segments (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  nom text not null check (btrim(nom) <> '' and length(nom) <= 80),
  criteres jsonb not null default '{}'::jsonb check (jsonb_typeof(criteres) = 'object'),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (etablissement_id, nom),
  unique (id, etablissement_id)
);

create table public.mkt_consentements (
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  canal text not null check (canal in ('email', 'sms', 'whatsapp')),
  accepte boolean not null,
  source text not null check (btrim(source) <> '' and length(source) <= 120),
  par uuid not null references auth.users(id) on delete restrict,
  modifie_le timestamptz not null default now(),
  primary key (contact_id, canal)
);
create index mkt_consentements_etab_idx on public.mkt_consentements(etablissement_id);

create table public.mkt_campagnes (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  numero text not null,
  nom text not null check (btrim(nom) <> '' and length(nom) <= 120),
  canal text not null check (canal in ('email', 'sms', 'whatsapp')),
  segment_id uuid not null,
  objet text check (objet is null or length(objet) <= 150),
  message text not null check (btrim(message) <> '' and length(message) <= 2000),
  statut text not null default 'brouillon' check (statut in ('brouillon', 'prete', 'envoyee', 'annulee')),
  nb_destinataires integer not null default 0,
  prepare_le timestamptz,
  envoyee_le timestamptz,
  note_envoi text check (note_envoi is null or length(note_envoi) <= 300),
  motif_annulation text,
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (etablissement_id, numero),
  unique (id, etablissement_id),
  foreign key (segment_id, etablissement_id) references public.mkt_segments(id, etablissement_id) on delete restrict,
  check (statut <> 'annulee' or btrim(coalesce(motif_annulation, '')) <> '')
);

create table public.mkt_destinataires (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  campagne_id uuid not null,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  nom text not null,
  coordonnee text not null,
  unique (campagne_id, contact_id),
  foreign key (campagne_id, etablissement_id) references public.mkt_campagnes(id, etablissement_id) on delete restrict
);

alter table public.mkt_segments enable row level security;
alter table public.mkt_consentements enable row level security;
alter table public.mkt_campagnes enable row level security;
alter table public.mkt_destinataires enable row level security;
create policy lecture on public.mkt_segments for select to authenticated using (public.lecture_autorisee(etablissement_id, 'marketing.lire'));
create policy lecture on public.mkt_consentements for select to authenticated using (public.lecture_autorisee(etablissement_id, 'marketing.lire'));
create policy lecture on public.mkt_campagnes for select to authenticated using (public.lecture_autorisee(etablissement_id, 'marketing.lire'));
create policy lecture on public.mkt_destinataires for select to authenticated using (public.lecture_autorisee(etablissement_id, 'marketing.lire'));
revoke insert, update, delete on public.mkt_segments, public.mkt_consentements, public.mkt_campagnes, public.mkt_destinataires from anon, authenticated;

create trigger mkt_segments_etab before update on public.mkt_segments for each row execute function public.verrouiller_etablissement_id();
create trigger mkt_segments_sans_suppression before delete on public.mkt_segments for each row execute function public.refuser_suppression();
create trigger mkt_segments_audit after insert or update or delete on public.mkt_segments for each row execute function public.journaliser_modification();
create trigger mkt_consentements_etab before update on public.mkt_consentements for each row execute function public.verrouiller_etablissement_id();
create trigger mkt_consentements_sans_suppression before delete on public.mkt_consentements for each row execute function public.refuser_suppression();
create trigger mkt_consentements_audit after insert or update or delete on public.mkt_consentements for each row execute function public.journaliser_modification();
create trigger mkt_campagnes_etab before update on public.mkt_campagnes for each row execute function public.verrouiller_etablissement_id();
create trigger mkt_campagnes_sans_suppression before delete on public.mkt_campagnes for each row execute function public.refuser_suppression();
create trigger mkt_campagnes_audit after insert or update or delete on public.mkt_campagnes for each row execute function public.journaliser_modification();
create trigger mkt_destinataires_figes before update on public.mkt_destinataires for each row execute function public.refuser_modification();
create trigger mkt_destinataires_sans_suppression before delete on public.mkt_destinataires for each row execute function public.refuser_suppression();

-- ---------------------------------------------------------------------------
-- 3. Fonctions
-- ---------------------------------------------------------------------------
create function public.mkt_criteres_valides(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v jsonb := '{}'::jsonb; t text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return v; end if;
  if jsonb_typeof(p -> 'types') = 'array' and jsonb_array_length(p -> 'types') > 0 then
    for t in select jsonb_array_elements_text(p -> 'types') loop
      if t not in ('client', 'prospect', 'les_deux', 'fournisseur') then raise exception 'Type de contact inconnu : %', t; end if;
    end loop;
    v := v || jsonb_build_object('types', p -> 'types');
  end if;
  if nullif(p ->> 'acheteurs_jours', '') is not null then
    if (p ->> 'acheteurs_jours')::integer not between 1 and 3650 then raise exception 'Nombre de jours invalide'; end if;
    v := v || jsonb_build_object('acheteurs_jours', (p ->> 'acheteurs_jours')::integer);
  end if;
  if nullif(p ->> 'inactifs_jours', '') is not null then
    if (p ->> 'inactifs_jours')::integer not between 1 and 3650 then raise exception 'Nombre de jours invalide'; end if;
    v := v || jsonb_build_object('inactifs_jours', (p ->> 'inactifs_jours')::integer);
  end if;
  if nullif(p ->> 'depense_min', '') is not null then
    if (p ->> 'depense_min')::numeric < 0 then raise exception 'Montant invalide'; end if;
    v := v || jsonb_build_object('depense_min', (p ->> 'depense_min')::numeric);
  end if;
  return v;
end
$$;

-- Interne : contacts actifs qui répondent aux critères.
create function public.mkt_contacts_segment(p_etablissement_id uuid, p_criteres jsonb)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.contacts c
  where c.etablissement_id = p_etablissement_id and c.actif
    and (p_criteres -> 'types' is null or c.type in (select jsonb_array_elements_text(p_criteres -> 'types')))
    and (p_criteres ->> 'acheteurs_jours' is null or exists (
      select 1 from public.ventes v where v.contact_id = c.id and v.statut = 'validee'
        and v.cree_le >= now() - make_interval(days => (p_criteres ->> 'acheteurs_jours')::integer)))
    and (p_criteres ->> 'inactifs_jours' is null or (
      exists (select 1 from public.ventes v where v.contact_id = c.id and v.statut = 'validee')
      and not exists (select 1 from public.ventes v where v.contact_id = c.id and v.statut = 'validee'
        and v.cree_le >= now() - make_interval(days => (p_criteres ->> 'inactifs_jours')::integer))))
    and (p_criteres ->> 'depense_min' is null or (
      select coalesce(sum(v.total), 0) from public.ventes v where v.contact_id = c.id and v.statut = 'validee'
    ) >= (p_criteres ->> 'depense_min')::numeric)
$$;

-- Coordonnée utilisable pour un canal (e-mail, ou téléphone pour SMS et WhatsApp).
create function public.mkt_coordonnee(p_canal text, p_email text, p_telephone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_canal = 'email' then case when p_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then lower(btrim(p_email)) end
              else case when regexp_replace(coalesce(p_telephone, ''), '[^0-9]', '', 'g') ~ '^[0-9]{6,15}$' then btrim(p_telephone) end end
$$;

-- Aperçu d'un segment : nombre de contacts et nombre joignables par canal (consentement + coordonnée).
create function public.apercu_segment(p_etablissement_id uuid, p_criteres jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_criteres jsonb := public.mkt_criteres_valides(p_criteres);
begin
  if not public.lecture_autorisee(p_etablissement_id, 'marketing.lire') then
    raise exception 'Permission refusée : marketing.lire' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object('contacts', count(*),
      'email', count(*) filter (where public.mkt_coordonnee('email', c.email, c.telephone) is not null
        and exists (select 1 from public.mkt_consentements k where k.contact_id = c.id and k.canal = 'email' and k.accepte)),
      'sms', count(*) filter (where public.mkt_coordonnee('sms', c.email, c.telephone) is not null
        and exists (select 1 from public.mkt_consentements k where k.contact_id = c.id and k.canal = 'sms' and k.accepte)),
      'whatsapp', count(*) filter (where public.mkt_coordonnee('whatsapp', c.email, c.telephone) is not null
        and exists (select 1 from public.mkt_consentements k where k.contact_id = c.id and k.canal = 'whatsapp' and k.accepte)))
    from public.contacts c where c.id in (select public.mkt_contacts_segment(p_etablissement_id, v_criteres))
  );
end
$$;

-- Segment : p = { id?, nom, criteres, actif? }
create function public.enregistrer_segment(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_criteres jsonb := public.mkt_criteres_valides(p -> 'criteres');
begin
  perform public.exiger_permission(p_etablissement_id, 'marketing.gerer');
  if coalesce(btrim(p ->> 'nom'), '') = '' then raise exception 'Le nom est obligatoire'; end if;
  if v_id is null then
    insert into public.mkt_segments (etablissement_id, nom, criteres, actif)
    values (p_etablissement_id, left(btrim(p ->> 'nom'), 80), v_criteres, coalesce((p ->> 'actif')::boolean, true))
    returning id into v_id;
  else
    update public.mkt_segments set nom = left(btrim(p ->> 'nom'), 80), criteres = v_criteres,
      actif = coalesce((p ->> 'actif')::boolean, true), modifie_le = now()
    where id = v_id and etablissement_id = p_etablissement_id;
    if not found then raise exception 'Segment introuvable'; end if;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'Ce nom de segment existe déjà';
end
$$;

-- Consentement d'un contact pour un canal, avec sa source (ex. « formulaire en boutique », « demande par téléphone »).
create function public.definir_consentement(p_etablissement_id uuid, p_contact_id uuid, p_canal text, p_accepte boolean, p_source text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exiger_permission(p_etablissement_id, 'marketing.gerer');
  if not exists (select 1 from public.contacts where id = p_contact_id and etablissement_id = p_etablissement_id) then
    raise exception 'Contact introuvable';
  end if;
  if p_canal is null or p_canal not in ('email', 'sms', 'whatsapp') then raise exception 'Canal inconnu'; end if;
  if p_accepte is null then raise exception 'Réponse obligatoire'; end if;
  if coalesce(btrim(p_source), '') = '' then raise exception 'Indiquez comment le contact a donné sa réponse'; end if;
  insert into public.mkt_consentements (etablissement_id, contact_id, canal, accepte, source, par)
  values (p_etablissement_id, p_contact_id, p_canal, p_accepte, left(btrim(p_source), 120), auth.uid())
  on conflict (contact_id, canal) do update set accepte = excluded.accepte, source = excluded.source, par = excluded.par, modifie_le = now();
end
$$;

-- Campagne : p = { id?, nom, canal, segment_id, objet?, message } ; modifiable seulement en brouillon.
create function public.enregistrer_campagne(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_segment uuid := nullif(p ->> 'segment_id', '')::uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'marketing.gerer');
  if coalesce(btrim(p ->> 'nom'), '') = '' then raise exception 'Le nom est obligatoire'; end if;
  if coalesce(btrim(p ->> 'message'), '') = '' then raise exception 'Le message est obligatoire'; end if;
  if coalesce(p ->> 'canal', '') not in ('email', 'sms', 'whatsapp') then raise exception 'Canal inconnu'; end if;
  if not exists (select 1 from public.mkt_segments where id = v_segment and etablissement_id = p_etablissement_id and actif) then
    raise exception 'Segment introuvable ou inactif';
  end if;
  if p ->> 'canal' = 'email' and coalesce(btrim(p ->> 'objet'), '') = '' then raise exception 'L''objet est obligatoire pour un e-mail'; end if;
  if v_id is null then
    insert into public.mkt_campagnes (etablissement_id, numero, nom, canal, segment_id, objet, message, cree_par)
    values (p_etablissement_id, public.prochain_numero(p_etablissement_id, 'campagne', 'CP-'), left(btrim(p ->> 'nom'), 120),
            p ->> 'canal', v_segment, nullif(left(btrim(p ->> 'objet'), 150), ''), left(btrim(p ->> 'message'), 2000), auth.uid())
    returning id into v_id;
  else
    update public.mkt_campagnes set nom = left(btrim(p ->> 'nom'), 120), canal = p ->> 'canal', segment_id = v_segment,
      objet = nullif(left(btrim(p ->> 'objet'), 150), ''), message = left(btrim(p ->> 'message'), 2000), modifie_le = now()
    where id = v_id and etablissement_id = p_etablissement_id and statut = 'brouillon';
    if not found then raise exception 'Campagne introuvable ou déjà préparée'; end if;
  end if;
  return v_id;
end
$$;

-- Préparer : fige la liste des destinataires (contacts du segment, consentement accepté, coordonnée valide).
create function public.preparer_campagne(p_campagne_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.mkt_campagnes%rowtype; v_nb integer;
begin
  select * into k from public.mkt_campagnes where id = p_campagne_id for update;
  if k.id is null then raise exception 'Campagne introuvable'; end if;
  perform public.exiger_permission(k.etablissement_id, 'marketing.gerer');
  if k.statut <> 'brouillon' then raise exception 'Campagne déjà préparée'; end if;
  insert into public.mkt_destinataires (etablissement_id, campagne_id, contact_id, nom, coordonnee)
  select k.etablissement_id, k.id, c.id, c.nom, public.mkt_coordonnee(k.canal, c.email, c.telephone)
  from public.contacts c
  where c.id in (select public.mkt_contacts_segment(k.etablissement_id, (select s.criteres from public.mkt_segments s where s.id = k.segment_id)))
    and public.mkt_coordonnee(k.canal, c.email, c.telephone) is not null
    and exists (select 1 from public.mkt_consentements m where m.contact_id = c.id and m.canal = k.canal and m.accepte);
  get diagnostics v_nb = row_count;
  if v_nb = 0 then raise exception 'Aucun destinataire : aucun contact du segment n''a accepté ce canal ou n''a de coordonnée valide'; end if;
  update public.mkt_campagnes set statut = 'prete', nb_destinataires = v_nb, prepare_le = now(), modifie_le = now() where id = k.id;
  return jsonb_build_object('destinataires', v_nb);
end
$$;

-- Déclarer l'envoi fait hors plateforme (en attendant les intégrations d'envoi).
create function public.declarer_envoi_campagne(p_campagne_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.mkt_campagnes%rowtype;
begin
  select * into k from public.mkt_campagnes where id = p_campagne_id for update;
  if k.id is null then raise exception 'Campagne introuvable'; end if;
  perform public.exiger_permission(k.etablissement_id, 'marketing.gerer');
  if k.statut <> 'prete' then raise exception 'Seule une campagne prête peut être déclarée envoyée'; end if;
  if coalesce(btrim(p_note), '') = '' then raise exception 'Indiquez comment les messages ont été envoyés'; end if;
  update public.mkt_campagnes set statut = 'envoyee', envoyee_le = now(), note_envoi = left(btrim(p_note), 300), modifie_le = now() where id = k.id;
end
$$;

create function public.annuler_campagne(p_campagne_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.mkt_campagnes%rowtype;
begin
  select * into k from public.mkt_campagnes where id = p_campagne_id for update;
  if k.id is null then raise exception 'Campagne introuvable'; end if;
  perform public.exiger_permission(k.etablissement_id, 'marketing.gerer');
  if k.statut not in ('brouillon', 'prete') then raise exception 'Cette campagne ne peut plus être annulée'; end if;
  if coalesce(btrim(p_motif), '') = '' then raise exception 'Le motif est obligatoire'; end if;
  update public.mkt_campagnes set statut = 'annulee', motif_annulation = left(btrim(p_motif), 300), modifie_le = now() where id = k.id;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Tableau de bord
-- ---------------------------------------------------------------------------
create function public.cockpit_marketing(p_etablissement_id uuid, p_du date, p_au date, p_filtres jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  c public.cockpit_ctx;
  v_envoyees bigint; v_envoyees_p bigint; v_touches bigint; v_touches_p bigint; v_premier date; v_comp boolean;
  v_consentants bigint; v_pretes bigint; v_brouillons bigint;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'marketing.lire') then
    raise exception 'Permission refusée : marketing.lire' using errcode = '42501';
  end if;
  c := public.cockpit_preparer(p_etablissement_id, p_du, p_au, p_filtres);
  select count(*) filter (where (k.envoyee_le at time zone c.tz)::date between c.du and c.au),
         count(*) filter (where (k.envoyee_le at time zone c.tz)::date between c.pdu and c.pau),
         coalesce(sum(k.nb_destinataires) filter (where (k.envoyee_le at time zone c.tz)::date between c.du and c.au), 0),
         coalesce(sum(k.nb_destinataires) filter (where (k.envoyee_le at time zone c.tz)::date between c.pdu and c.pau), 0),
         min((k.envoyee_le at time zone c.tz)::date),
         count(*) filter (where k.statut = 'prete'), count(*) filter (where k.statut = 'brouillon')
  into v_envoyees, v_envoyees_p, v_touches, v_touches_p, v_premier, v_pretes, v_brouillons
  from public.mkt_campagnes k where k.etablissement_id = p_etablissement_id;
  v_comp := public.cockpit_comparable(v_envoyees_p, v_premier, c.pdu);
  select count(distinct m.contact_id) into v_consentants from public.mkt_consentements m
  where m.etablissement_id = p_etablissement_id and m.accepte;
  return jsonb_build_object(
    'domaine', 'marketing',
    'periode', jsonb_build_object('du', c.du, 'au', c.au, 'du_precedent', c.pdu, 'au_precedent', c.pau, 'comparable', v_comp),
    'kpis', public.cockpit_liste(array[
      public.cockpit_kpi('envoyees', 'Campagnes envoyées', v_envoyees, 'nombre', 'marketing?statut=envoyee', case when v_comp then v_envoyees_p end, null, null, true),
      public.cockpit_kpi('touches', 'Messages déclarés envoyés', v_touches, 'nombre', 'marketing?statut=envoyee', case when v_comp then v_touches_p end, null, null, true),
      public.cockpit_kpi('consentants', 'Contacts qui acceptent des messages', v_consentants, 'nombre', 'marketing?vue=consentements', null, 'Au moins un canal')
    ]),
    'attention', public.cockpit_liste(array[
      public.cockpit_alerte('pretes', 'info', 'Campagnes prêtes à envoyer', 'Destinataires figés, envoi à faire', v_pretes, 'marketing?statut=prete'),
      public.cockpit_alerte('brouillons', 'info', 'Campagnes en brouillon', null, v_brouillons, 'marketing?statut=brouillon')
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
    (12, 'marketing', 'Marketing', public.lecture_autorisee(p_etablissement_id, 'marketing.lire')),
    (13, 'achats', 'Achats', public.lecture_autorisee(p_etablissement_id, 'achats.lire')),
    (14, 'production', 'Production', public.lecture_autorisee(p_etablissement_id, 'production.lire')),
    (15, 'rh', 'RH', public.lecture_autorisee(p_etablissement_id, 'rh_employes.lire')),
    (16, 'projets', 'Projets', public.lecture_autorisee(p_etablissement_id, 'projets.lire')),
    (17, 'agenda', 'Agenda', public.lecture_autorisee(p_etablissement_id, 'agenda.lire')),
    (18, 'support', 'Support', public.lecture_autorisee(p_etablissement_id, 'support_tickets.lire')),
    (19, 'abonnements', 'Abonnements', public.lecture_autorisee(p_etablissement_id, 'abonnements.lire')),
    (20, 'fidelite', 'Fidélité', public.lecture_autorisee(p_etablissement_id, 'fidelite.lire')),
    (21, 'siteweb', 'Site web', public.lecture_autorisee(p_etablissement_id, 'site_web.lire'))
  ) as d(ordre, id, titre, visible)
  where d.visible
$$;

revoke all on function public.mkt_contacts_segment(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.mkt_criteres_valides(jsonb) from public, anon;
revoke all on function public.mkt_coordonnee(text, text, text) from public, anon;
revoke all on function public.apercu_segment(uuid, jsonb) from public, anon;
revoke all on function public.enregistrer_segment(uuid, jsonb) from public, anon;
revoke all on function public.definir_consentement(uuid, uuid, text, boolean, text) from public, anon;
revoke all on function public.enregistrer_campagne(uuid, jsonb) from public, anon;
revoke all on function public.preparer_campagne(uuid) from public, anon;
revoke all on function public.declarer_envoi_campagne(uuid, text) from public, anon;
revoke all on function public.annuler_campagne(uuid, text) from public, anon;
revoke all on function public.cockpit_marketing(uuid, date, date, jsonb) from public, anon;
grant execute on function public.mkt_criteres_valides(jsonb) to authenticated;
grant execute on function public.mkt_coordonnee(text, text, text) to authenticated;
grant execute on function public.apercu_segment(uuid, jsonb) to authenticated;
grant execute on function public.enregistrer_segment(uuid, jsonb) to authenticated;
grant execute on function public.definir_consentement(uuid, uuid, text, boolean, text) to authenticated;
grant execute on function public.enregistrer_campagne(uuid, jsonb) to authenticated;
grant execute on function public.preparer_campagne(uuid) to authenticated;
grant execute on function public.declarer_envoi_campagne(uuid, text) to authenticated;
grant execute on function public.annuler_campagne(uuid, text) to authenticated;
grant execute on function public.cockpit_marketing(uuid, date, date, jsonb) to authenticated;

notify pgrst, 'reload schema';
