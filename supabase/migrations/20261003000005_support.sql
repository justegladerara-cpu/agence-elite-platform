-- Support (2026-10-03) : nouveau module « support_tickets » (demandes clients, service après-vente, assistance).
-- Ticket TK- : client (fiche ou nom + téléphone), sujet, description, canal, priorité, échéance de réponse déduite de la
-- priorité (réglable), personne assignée (prévenue), fil d'échanges (réponses au client et notes internes), pièces
-- jointes communes. Statuts : ouvert → en cours → en attente du client → résolu → fermé ; réouverture possible.
-- Rien ne se supprime ; un message ne se modifie pas.

-- ---------------------------------------------------------------------------
-- 1. Catalogue et droits
-- ---------------------------------------------------------------------------
insert into public.modules (id, nom, description, nature, statut, categorie, icone, ordre, version, documentation) values
  ('support_tickets', 'Support et demandes', 'Tickets clients, priorités, échéances, assignation, échanges et notes internes.',
   'transversal', 'actif', 'support', 'message', 290, '1.0', 'docs/SUPPORT.md')
on conflict (id) do nothing;
update public.modules set parametres_schema = '[
  {"cle": "delai_urgente", "libelle": "Délai de réponse, priorité urgente (heures)", "type": "nombre", "defaut": 2},
  {"cle": "delai_haute", "libelle": "Délai de réponse, priorité haute (heures)", "type": "nombre", "defaut": 8},
  {"cle": "delai_normale", "libelle": "Délai de réponse, priorité normale (heures)", "type": "nombre", "defaut": 24},
  {"cle": "delai_basse", "libelle": "Délai de réponse, priorité basse (heures)", "type": "nombre", "defaut": 72}
]'::jsonb where id = 'support_tickets';
insert into public.module_dependances (module_id, depend_de) values ('support_tickets', 'contacts'), ('support_tickets', 'membres')
on conflict do nothing;
insert into public.solution_modules (solution_id, module_id, par_defaut) values
  ('services', 'support_tickets', false), ('commerce', 'support_tickets', false), ('restaurant', 'support_tickets', false),
  ('hotel', 'support_tickets', false), ('ecommerce', 'support_tickets', false)
on conflict (solution_id, module_id) do nothing;

insert into public.permissions (id, module_id, description) values
  ('support_tickets.lire', 'support_tickets', 'Voir les tickets et leurs échanges'),
  ('support_tickets.traiter', 'support_tickets', 'Créer, répondre, changer le statut des tickets'),
  ('support_tickets.gerer', 'support_tickets', 'Assigner, régler les échéances')
on conflict (id) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['gerant', 'responsable']) r
cross join unnest(array['support_tickets.lire', 'support_tickets.traiter', 'support_tickets.gerer']) p
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['responsable_hub', 'commercial', 'employe', 'receptionniste', 'collaborateur']) r
cross join unnest(array['support_tickets.lire', 'support_tickets.traiter']) p
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id) values ('lecteur', 'support_tickets.lire') on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  numero text not null,
  sujet text not null check (btrim(sujet) <> '' and length(sujet) <= 200),
  description text check (description is null or length(description) <= 5000),
  contact_id uuid references public.contacts(id) on delete restrict,
  nom_client text check (nom_client is null or length(nom_client) <= 160),
  telephone text check (telephone is null or length(telephone) <= 40),
  canal text not null default 'telephone' check (canal in ('telephone', 'whatsapp', 'email', 'sur_place', 'site_web', 'autre')),
  priorite text not null default 'normale' check (priorite in ('basse', 'normale', 'haute', 'urgente')),
  statut text not null default 'ouvert' check (statut in ('ouvert', 'en_cours', 'attente_client', 'resolu', 'ferme')),
  assigne_a uuid references auth.users(id) on delete restrict,
  echeance timestamptz not null,
  vente_id uuid references public.ventes(id) on delete restrict,
  resolu_le timestamptz,
  ferme_le timestamptz,
  cree_par uuid references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (etablissement_id, numero),
  check (contact_id is not null or btrim(coalesce(nom_client, '')) <> '')
);
create index support_tickets_etablissement_idx on public.support_tickets(etablissement_id, statut, echeance);
create index support_tickets_assigne_idx on public.support_tickets(assigne_a) where statut not in ('resolu', 'ferme');

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete restrict,
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  auteur uuid references auth.users(id) on delete restrict,
  texte text not null check (btrim(texte) <> '' and length(texte) <= 5000),
  interne boolean not null default false,
  evenement boolean not null default false,
  cree_le timestamptz not null default now()
);
create index support_messages_ticket_idx on public.support_messages(ticket_id, cree_le);

create trigger support_tickets_modifie_le before update on public.support_tickets for each row execute function public.fixer_modifie_le();
create trigger support_messages_definitifs before update on public.support_messages for each row execute function public.refuser_modification();
do $$
declare
  nom_table text;
begin
  foreach nom_table in array array['support_tickets', 'support_messages'] loop
    execute format('create trigger %I_sans_suppression before delete on public.%I for each row execute function public.refuser_suppression()', nom_table, nom_table);
    execute format('create trigger %I_verrou_etablissement before update on public.%I for each row execute function public.verrouiller_etablissement_id()', nom_table, nom_table);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.journaliser_modification()', nom_table, nom_table);
    execute format('alter table public.%I enable row level security', nom_table);
    execute format('create policy lecture on public.%I for select to authenticated using (public.lecture_autorisee(etablissement_id, ''support_tickets.lire''))', nom_table);
  end loop;
end
$$;

insert into public.types_pieces_jointes (objet_type, table_nom, module_id, permission_lire, permission_ecrire, libelle)
values ('support_ticket', 'support_tickets', 'support_tickets', 'support_tickets.lire', 'support_tickets.traiter', 'Ticket de support')
on conflict (objet_type) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Fonctions
-- ---------------------------------------------------------------------------
-- Délai de réponse (heures) par priorité : réglages « delai_<priorité> » du module (Paramètres › Réglages des modules).
create function public.delai_support(p_etablissement_id uuid, p_priorite text)
returns interval
language sql
stable
security definer
set search_path = ''
as $$
  select make_interval(hours => greatest(1, least(2160, coalesce(
    (public.parametre_module(p_etablissement_id, 'support_tickets', 'delai_' || p_priorite) #>> '{}')::numeric::integer,
    case p_priorite when 'basse' then 72 when 'haute' then 8 when 'urgente' then 2 else 24 end))))
$$;

create function public.journal_ticket(p_ticket public.support_tickets, p_texte text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.support_messages (ticket_id, etablissement_id, auteur, texte, interne, evenement)
  values (p_ticket.id, p_ticket.etablissement_id, auth.uid(), p_texte, true, true);
$$;

-- p : { sujet, description?, contact_id?, nom_client?, telephone?, canal?, priorite?, assigne_a?, vente_id? }
create function public.ouvrir_ticket_support(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact public.contacts%rowtype;
  v_assigne uuid := nullif(p ->> 'assigne_a', '')::uuid;
  v_priorite text := coalesce(nullif(p ->> 'priorite', ''), 'normale');
  t public.support_tickets%rowtype;
begin
  perform public.exiger_permission(p_etablissement_id, 'support_tickets.traiter');
  if coalesce(btrim(p ->> 'sujet'), '') = '' then
    raise exception 'Le sujet est obligatoire';
  end if;
  if v_priorite not in ('basse', 'normale', 'haute', 'urgente') then
    raise exception 'Priorité inconnue';
  end if;
  if nullif(p ->> 'contact_id', '') is not null then
    select * into v_contact from public.contacts where id = (p ->> 'contact_id')::uuid and etablissement_id = p_etablissement_id;
    if v_contact.id is null then
      raise exception 'Client introuvable';
    end if;
  elsif coalesce(btrim(p ->> 'nom_client'), '') = '' then
    raise exception 'Indiquez le client (fiche ou nom)';
  end if;
  if v_assigne is not null then
    if not v_assigne in (select public.membres_avec_permission(p_etablissement_id, 'support_tickets.traiter')) then
      raise exception 'La personne choisie ne traite pas les tickets';
    end if;
    perform public.exiger_permission(p_etablissement_id, 'support_tickets.gerer');
  end if;
  if nullif(p ->> 'vente_id', '') is not null
     and not exists (select 1 from public.ventes where id = (p ->> 'vente_id')::uuid and etablissement_id = p_etablissement_id) then
    raise exception 'Vente introuvable';
  end if;
  insert into public.support_tickets (etablissement_id, numero, sujet, description, contact_id, nom_client, telephone, canal, priorite,
    assigne_a, echeance, vente_id, cree_par)
  values (p_etablissement_id, public.prochain_numero(p_etablissement_id, 'ticket', 'TK-'), left(btrim(p ->> 'sujet'), 200),
    nullif(left(btrim(coalesce(p ->> 'description', '')), 5000), ''), v_contact.id,
    coalesce(nullif(btrim(p ->> 'nom_client'), ''), v_contact.nom), coalesce(nullif(btrim(p ->> 'telephone'), ''), v_contact.telephone),
    coalesce(nullif(p ->> 'canal', ''), 'telephone'), v_priorite, v_assigne, now() + public.delai_support(p_etablissement_id, v_priorite),
    nullif(p ->> 'vente_id', '')::uuid, auth.uid())
  returning * into t;
  if v_assigne is not null and v_assigne is distinct from auth.uid() then
    perform public.notifier(v_assigne, p_etablissement_id, 'support.ticket', 'Ticket ' || t.numero || ' : ' || left(t.sujet, 100), t.nom_client, 'support/' || t.id);
  end if;
  if v_priorite = 'urgente' then
    perform public.notifier_permission(p_etablissement_id, 'support_tickets.gerer', 'support.urgent', 'Ticket urgent ' || t.numero, left(t.sujet, 140), 'support/' || t.id);
  end if;
  return t.id;
end
$$;

-- Réponse au client (consignée) ou note interne ; une réponse fait passer un ticket ouvert « en cours ».
create function public.ecrire_ticket_support(p_ticket_id uuid, p_texte text, p_interne boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.support_tickets%rowtype;
  resultat uuid;
begin
  select * into t from public.support_tickets where id = p_ticket_id for update;
  if t.id is null then
    raise exception 'Ticket introuvable';
  end if;
  perform public.exiger_permission(t.etablissement_id, 'support_tickets.traiter');
  if t.statut = 'ferme' then
    raise exception 'Ticket fermé : rouvrez-le d''abord';
  end if;
  if coalesce(btrim(p_texte), '') = '' then
    raise exception 'Le message est vide';
  end if;
  insert into public.support_messages (ticket_id, etablissement_id, auteur, texte, interne)
  values (t.id, t.etablissement_id, auth.uid(), left(btrim(p_texte), 5000), coalesce(p_interne, false))
  returning id into resultat;
  if not coalesce(p_interne, false) and t.statut = 'ouvert' then
    update public.support_tickets set statut = 'en_cours' where id = t.id;
  end if;
  if t.assigne_a is not null and t.assigne_a is distinct from auth.uid() then
    perform public.notifier(t.assigne_a, t.etablissement_id, 'support.message', 'Nouveau message sur ' || t.numero, left(btrim(p_texte), 140), 'support/' || t.id);
  end if;
  return resultat;
end
$$;

-- Statut : ouvert, en_cours, attente_client, resolu (résumé de la solution obligatoire), ferme ; rouvrir = ouvert.
create function public.changer_statut_ticket(p_ticket_id uuid, p_statut text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.support_tickets%rowtype;
begin
  select * into t from public.support_tickets where id = p_ticket_id for update;
  if t.id is null then
    raise exception 'Ticket introuvable';
  end if;
  perform public.exiger_permission(t.etablissement_id, 'support_tickets.traiter');
  if p_statut not in ('ouvert', 'en_cours', 'attente_client', 'resolu', 'ferme') or p_statut = t.statut then
    raise exception 'Changement de statut impossible';
  end if;
  if p_statut = 'resolu' and coalesce(btrim(p_note), '') = '' then
    raise exception 'Indiquez la solution apportée';
  end if;
  if p_statut = 'ferme' and t.statut <> 'resolu' then
    raise exception 'Un ticket se ferme une fois résolu';
  end if;
  if p_statut = 'ouvert' and t.statut not in ('resolu', 'ferme') then
    raise exception 'Seul un ticket résolu ou fermé se rouvre';
  end if;
  if p_statut = 'ouvert' and coalesce(btrim(p_note), '') = '' then
    raise exception 'Indiquez pourquoi le ticket est rouvert';
  end if;
  update public.support_tickets set statut = p_statut,
    resolu_le = case when p_statut = 'resolu' then now() when p_statut = 'ouvert' then null else resolu_le end,
    ferme_le = case when p_statut = 'ferme' then now() when p_statut = 'ouvert' then null else ferme_le end,
    echeance = case when p_statut = 'ouvert' then now() + public.delai_support(t.etablissement_id, t.priorite) else echeance end
  where id = t.id;
  perform public.journal_ticket(t, 'Statut : ' || case p_statut when 'ouvert' then 'rouvert' when 'en_cours' then 'en cours'
    when 'attente_client' then 'en attente du client' when 'resolu' then 'résolu' else 'fermé' end
    || coalesce(' — ' || nullif(left(btrim(p_note), 4000), ''), ''));
end
$$;

-- Assignation et priorité (l'échéance suit la nouvelle priorité).
create function public.assigner_ticket_support(p_ticket_id uuid, p_assigne uuid, p_priorite text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.support_tickets%rowtype;
  v_priorite text;
begin
  select * into t from public.support_tickets where id = p_ticket_id for update;
  if t.id is null then
    raise exception 'Ticket introuvable';
  end if;
  perform public.exiger_permission(t.etablissement_id, 'support_tickets.gerer');
  if t.statut = 'ferme' then
    raise exception 'Ticket fermé';
  end if;
  v_priorite := coalesce(nullif(p_priorite, ''), t.priorite);
  if v_priorite not in ('basse', 'normale', 'haute', 'urgente') then
    raise exception 'Priorité inconnue';
  end if;
  if p_assigne is not null and not p_assigne in (select public.membres_avec_permission(t.etablissement_id, 'support_tickets.traiter')) then
    raise exception 'La personne choisie ne traite pas les tickets';
  end if;
  update public.support_tickets set assigne_a = p_assigne, priorite = v_priorite,
    echeance = case when v_priorite <> t.priorite then t.cree_le + public.delai_support(t.etablissement_id, v_priorite) else echeance end
  where id = t.id;
  if p_assigne is not null and p_assigne is distinct from t.assigne_a and p_assigne is distinct from auth.uid() then
    perform public.notifier(p_assigne, t.etablissement_id, 'support.ticket', 'Ticket ' || t.numero || ' : ' || left(t.sujet, 100), t.nom_client, 'support/' || t.id);
  end if;
  perform public.journal_ticket(t, 'Assigné à ' || coalesce((select coalesce(p.nom_complet, u.email) from auth.users u
    left join public.profils p on p.id = u.id where u.id = p_assigne), 'personne') || ' · priorité ' || v_priorite);
end
$$;

create function public.tableau_de_bord_support(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  jour date := public.date_locale(p_etablissement_id);
begin
  if not public.lecture_autorisee(p_etablissement_id, 'support_tickets.lire') then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'ouverts', (select count(*) from public.support_tickets where etablissement_id = p_etablissement_id and statut in ('ouvert', 'en_cours', 'attente_client')),
    'en_retard', (select count(*) from public.support_tickets where etablissement_id = p_etablissement_id
      and statut in ('ouvert', 'en_cours') and echeance < now()),
    'urgents', (select count(*) from public.support_tickets where etablissement_id = p_etablissement_id
      and statut in ('ouvert', 'en_cours', 'attente_client') and priorite = 'urgente'),
    'mes_tickets', (select count(*) from public.support_tickets where etablissement_id = p_etablissement_id and assigne_a = auth.uid()
      and statut in ('ouvert', 'en_cours', 'attente_client')),
    'non_assignes', (select count(*) from public.support_tickets where etablissement_id = p_etablissement_id and assigne_a is null
      and statut in ('ouvert', 'en_cours', 'attente_client')),
    'resolus_mois', (select count(*) from public.support_tickets where etablissement_id = p_etablissement_id and resolu_le is not null
      and date_trunc('month', resolu_le) = date_trunc('month', jour::timestamp)),
    'delai_moyen_heures', (select round(avg(extract(epoch from resolu_le - cree_le) / 3600)::numeric, 1) from public.support_tickets
      where etablissement_id = p_etablissement_id and resolu_le is not null and resolu_le > now() - interval '90 days')
  );
end
$$;

-- Équipe affichable (nom seulement) : personnes qui peuvent recevoir un ticket, ou en ont déjà.
create function public.support_equipe(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.lecture_autorisee(p_etablissement_id, 'support_tickets.lire') then
    raise exception 'Permission refusée : support_tickets.lire' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', u.id, 'nom', coalesce(nullif(p.nom_complet, ''), split_part(u.email, '@', 1)),
      'moi', u.id = auth.uid()) order by coalesce(p.nom_complet, u.email))
    from auth.users u left join public.profils p on p.id = u.id
    where u.id in (select public.membres_avec_permission(p_etablissement_id, 'support_tickets.traiter'))
       or u.id in (select assigne_a from public.support_tickets where etablissement_id = p_etablissement_id)
  ), '[]'::jsonb);
end
$$;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.ouvrir_ticket_support(uuid, jsonb)', 'public.ecrire_ticket_support(uuid, text, boolean)',
    'public.changer_statut_ticket(uuid, text, text)', 'public.assigner_ticket_support(uuid, uuid, text)',
    'public.tableau_de_bord_support(uuid)', 'public.support_equipe(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
  foreach signature in array array['public.delai_support(uuid, text)', 'public.journal_ticket(public.support_tickets, text)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', signature);
  end loop;
end
$$;
