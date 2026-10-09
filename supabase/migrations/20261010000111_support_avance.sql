-- Support avancé (2026-10-09, lot A de la demande des 150 fonctions) : nature du ticket (demande, question, incident,
-- réclamation), bibliothèque (réponses types et base d'aide interne), affectation automatique à la personne la moins
-- chargée (réglage), escalade motivée, tickets similaires, rendez-vous pris depuis un ticket, confirmation de la
-- résolution par le client, note de satisfaction, délai de première réponse dans les indicateurs.
-- Aucune ligne existante n'est modifiée : les nouvelles colonnes ont une valeur par défaut ou restent vides.

-- ---------------------------------------------------------------------------
-- 1. Réglages
-- ---------------------------------------------------------------------------
update public.modules set parametres_schema = '[
  {"cle": "delai_urgente", "libelle": "Délai de réponse, priorité urgente (heures)", "type": "nombre", "defaut": 2},
  {"cle": "delai_haute", "libelle": "Délai de réponse, priorité haute (heures)", "type": "nombre", "defaut": 8},
  {"cle": "delai_normale", "libelle": "Délai de réponse, priorité normale (heures)", "type": "nombre", "defaut": 24},
  {"cle": "delai_basse", "libelle": "Délai de réponse, priorité basse (heures)", "type": "nombre", "defaut": 72},
  {"cle": "affectation_auto", "libelle": "Assigner chaque nouveau ticket à la personne qui en a le moins en cours", "type": "booleen", "defaut": false}
]'::jsonb where id = 'support_tickets';

-- ---------------------------------------------------------------------------
-- 2. Tickets : nouvelles colonnes
-- ---------------------------------------------------------------------------
alter table public.support_tickets
  add column nature text not null default 'demande' check (nature in ('demande', 'question', 'incident', 'reclamation')),
  add column niveau_escalade smallint not null default 0 check (niveau_escalade between 0 and 20),
  add column resolution_confirmee boolean,
  add column satisfaction smallint check (satisfaction is null or satisfaction between 1 and 5),
  add column satisfaction_commentaire text check (satisfaction_commentaire is null or length(satisfaction_commentaire) <= 1000),
  add column satisfaction_le timestamptz;

-- ---------------------------------------------------------------------------
-- 3. Bibliothèque : réponses types et articles d'aide (jamais supprimés : archivés)
-- ---------------------------------------------------------------------------
create table public.support_bibliotheque (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  genre text not null check (genre in ('reponse', 'article')),
  titre text not null check (btrim(titre) <> '' and length(titre) <= 160),
  texte text not null check (btrim(texte) <> '' and length(texte) <= 8000),
  categorie text check (categorie is null or length(categorie) <= 80),
  actif boolean not null default true,
  cree_par uuid references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
create index support_bibliotheque_etablissement_idx on public.support_bibliotheque(etablissement_id, genre, actif);
create trigger support_bibliotheque_modifie_le before update on public.support_bibliotheque for each row execute function public.fixer_modifie_le();
create trigger support_bibliotheque_sans_suppression before delete on public.support_bibliotheque for each row execute function public.refuser_suppression();
create trigger support_bibliotheque_verrou_etablissement before update on public.support_bibliotheque for each row execute function public.verrouiller_etablissement_id();
create trigger support_bibliotheque_audit after insert or update or delete on public.support_bibliotheque for each row execute function public.journaliser_modification();
alter table public.support_bibliotheque enable row level security;
create policy lecture on public.support_bibliotheque for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'support_tickets.lire'));

-- p : { id?, genre, titre, texte, categorie?, actif? }
create function public.enregistrer_element_support(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p ->> 'id', '')::uuid;
  v_genre text := p ->> 'genre';
begin
  perform public.exiger_permission(p_etablissement_id, 'support_tickets.gerer');
  if coalesce(btrim(p ->> 'titre'), '') = '' or coalesce(btrim(p ->> 'texte'), '') = '' then
    raise exception 'Le titre et le texte sont obligatoires';
  end if;
  if resultat is null then
    if v_genre is null or v_genre not in ('reponse', 'article') then
      raise exception 'Choisissez « réponse type » ou « article d''aide »';
    end if;
    insert into public.support_bibliotheque (etablissement_id, genre, titre, texte, categorie, actif, cree_par)
    values (p_etablissement_id, v_genre, left(btrim(p ->> 'titre'), 160), left(btrim(p ->> 'texte'), 8000),
      nullif(left(btrim(coalesce(p ->> 'categorie', '')), 80), ''), coalesce((p ->> 'actif')::boolean, true), auth.uid())
    returning id into resultat;
  else
    update public.support_bibliotheque set titre = left(btrim(p ->> 'titre'), 160), texte = left(btrim(p ->> 'texte'), 8000),
      categorie = nullif(left(btrim(coalesce(p ->> 'categorie', '')), 80), ''), actif = coalesce((p ->> 'actif')::boolean, actif)
    where id = resultat and etablissement_id = p_etablissement_id;
    if not found then
      raise exception 'Élément introuvable';
    end if;
  end if;
  return resultat;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Ouverture : nature et affectation automatique
-- ---------------------------------------------------------------------------
-- Personne qui traite les tickets et en a le moins en cours (à égalité : la plus ancienne dans l'établissement).
create function public.support_moins_charge(p_etablissement_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id
  from public.membres_avec_permission(p_etablissement_id, 'support_tickets.traiter') as m(user_id)
  left join public.etablissement_membres em on em.etablissement_id = p_etablissement_id and em.user_id = m.user_id
  order by (select count(*) from public.support_tickets t where t.etablissement_id = p_etablissement_id and t.assigne_a = m.user_id
              and t.statut in ('ouvert', 'en_cours', 'attente_client')),
           em.cree_le nulls last, m.user_id
  limit 1
$$;

-- p : { sujet, description?, contact_id?, nom_client?, telephone?, canal?, priorite?, nature?, assigne_a?, vente_id? }
create or replace function public.ouvrir_ticket_support(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact public.contacts%rowtype;
  v_assigne uuid := nullif(p ->> 'assigne_a', '')::uuid;
  v_priorite text := coalesce(nullif(p ->> 'priorite', ''), 'normale');
  v_nature text := coalesce(nullif(p ->> 'nature', ''), 'demande');
  v_auto boolean := false;
  t public.support_tickets%rowtype;
begin
  perform public.exiger_permission(p_etablissement_id, 'support_tickets.traiter');
  if coalesce(btrim(p ->> 'sujet'), '') = '' then
    raise exception 'Le sujet est obligatoire';
  end if;
  if v_priorite not in ('basse', 'normale', 'haute', 'urgente') then
    raise exception 'Priorité inconnue';
  end if;
  if v_nature not in ('demande', 'question', 'incident', 'reclamation') then
    raise exception 'Nature de ticket inconnue';
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
  elsif coalesce((public.parametre_module(p_etablissement_id, 'support_tickets', 'affectation_auto') #>> '{}')::boolean, false) then
    v_assigne := public.support_moins_charge(p_etablissement_id);
    v_auto := v_assigne is not null;
  end if;
  if nullif(p ->> 'vente_id', '') is not null
     and not exists (select 1 from public.ventes where id = (p ->> 'vente_id')::uuid and etablissement_id = p_etablissement_id) then
    raise exception 'Vente introuvable';
  end if;
  insert into public.support_tickets (etablissement_id, numero, sujet, description, contact_id, nom_client, telephone, canal, priorite,
    nature, assigne_a, echeance, vente_id, cree_par)
  values (p_etablissement_id, public.prochain_numero(p_etablissement_id, 'ticket', 'TK-'), left(btrim(p ->> 'sujet'), 200),
    nullif(left(btrim(coalesce(p ->> 'description', '')), 5000), ''), v_contact.id,
    coalesce(nullif(btrim(p ->> 'nom_client'), ''), v_contact.nom), coalesce(nullif(btrim(p ->> 'telephone'), ''), v_contact.telephone),
    coalesce(nullif(p ->> 'canal', ''), 'telephone'), v_priorite, v_nature, v_assigne, now() + public.delai_support(p_etablissement_id, v_priorite),
    nullif(p ->> 'vente_id', '')::uuid, auth.uid())
  returning * into t;
  if v_auto then
    perform public.journal_ticket(t, 'Assigné automatiquement à ' || coalesce((select coalesce(nullif(pr.nom_complet, ''), split_part(u.email, '@', 1))
      from auth.users u left join public.profils pr on pr.id = u.id where u.id = v_assigne), 'un membre') || ' (moins de tickets en cours)');
  end if;
  if v_assigne is not null and v_assigne is distinct from auth.uid() then
    perform public.notifier(v_assigne, p_etablissement_id, 'support.ticket', 'Ticket ' || t.numero || ' : ' || left(t.sujet, 100), t.nom_client, 'support/' || t.id);
  end if;
  if v_priorite = 'urgente' then
    perform public.notifier_permission(p_etablissement_id, 'support_tickets.gerer', 'support.urgent', 'Ticket urgent ' || t.numero, left(t.sujet, 140), 'support/' || t.id);
  end if;
  return t.id;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Escalade, confirmation de résolution, satisfaction
-- ---------------------------------------------------------------------------
-- Escalade : la priorité monte d'un cran (l'urgente reste urgente), l'échéance repart de maintenant, les responsables
-- (droit « gerer ») sont prévenus. Motif obligatoire.
create function public.escalader_ticket(p_ticket_id uuid, p_motif text)
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
  perform public.exiger_permission(t.etablissement_id, 'support_tickets.traiter');
  if t.statut not in ('ouvert', 'en_cours', 'attente_client') then
    raise exception 'Seul un ticket en cours de traitement s''escalade';
  end if;
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Indiquez pourquoi le ticket est escaladé';
  end if;
  v_priorite := case t.priorite when 'basse' then 'normale' when 'normale' then 'haute' else 'urgente' end;
  update public.support_tickets set priorite = v_priorite, niveau_escalade = least(20, niveau_escalade + 1),
    echeance = now() + public.delai_support(t.etablissement_id, v_priorite)
  where id = t.id;
  perform public.journal_ticket(t, 'Escaladé (niveau ' || least(20, t.niveau_escalade + 1) || ', priorité ' || v_priorite || ') — '
    || left(btrim(p_motif), 2000));
  perform public.notifier_permission(t.etablissement_id, 'support_tickets.gerer', 'support.escalade', 'Ticket escaladé ' || t.numero,
    left(btrim(p_motif), 140), 'support/' || t.id);
end
$$;

-- Réponse du client sur la solution : confirmée → ticket fermé ; refusée → ticket rouvert (motif obligatoire).
create function public.confirmer_resolution_ticket(p_ticket_id uuid, p_confirme boolean, p_note text default null)
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
  if t.statut <> 'resolu' then
    raise exception 'Le client confirme une solution : le ticket doit être résolu';
  end if;
  if p_confirme is null then
    raise exception 'Indiquez la réponse du client';
  end if;
  if not p_confirme and coalesce(btrim(p_note), '') = '' then
    raise exception 'Indiquez ce que le client signale encore';
  end if;
  if p_confirme then
    update public.support_tickets set resolution_confirmee = true, statut = 'ferme', ferme_le = now() where id = t.id;
    perform public.journal_ticket(t, 'Solution confirmée par le client, ticket fermé' || coalesce(' — ' || nullif(left(btrim(p_note), 2000), ''), ''));
  else
    update public.support_tickets set resolution_confirmee = false, statut = 'ouvert', resolu_le = null,
      echeance = now() + public.delai_support(t.etablissement_id, t.priorite)
    where id = t.id;
    perform public.journal_ticket(t, 'Le client ne confirme pas la solution, ticket rouvert — ' || left(btrim(p_note), 2000));
  end if;
end
$$;

-- Note de satisfaction donnée par le client (1 à 5), une seule fois, sur un ticket résolu ou fermé.
create function public.noter_satisfaction_ticket(p_ticket_id uuid, p_note integer, p_commentaire text default null)
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
  if t.statut not in ('resolu', 'ferme') then
    raise exception 'La satisfaction se note quand le ticket est résolu';
  end if;
  if t.satisfaction is not null then
    raise exception 'La satisfaction est déjà notée';
  end if;
  if p_note is null or p_note not between 1 and 5 then
    raise exception 'La note va de 1 à 5';
  end if;
  update public.support_tickets set satisfaction = p_note, satisfaction_le = now(),
    satisfaction_commentaire = nullif(left(btrim(coalesce(p_commentaire, '')), 1000), '')
  where id = t.id;
  perform public.journal_ticket(t, 'Satisfaction du client : ' || p_note || '/5' || coalesce(' — ' || nullif(left(btrim(p_commentaire), 1000), ''), ''));
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Tickets similaires et rendez-vous depuis un ticket
-- ---------------------------------------------------------------------------
-- Jusqu'à 5 autres tickets : même client (fiche ou téléphone) ou mots du sujet en commun (4 lettres et plus).
create function public.tickets_similaires(p_ticket_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t public.support_tickets%rowtype;
  v_mots text[];
begin
  select * into t from public.support_tickets where id = p_ticket_id;
  if t.id is null or not public.lecture_autorisee(t.etablissement_id, 'support_tickets.lire') then
    raise exception 'Ticket introuvable';
  end if;
  select coalesce(array_agg(distinct m), '{}') into v_mots
  from regexp_split_to_table(lower(t.sujet), '[^[:alnum:]]+') m where length(m) >= 4;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', y.id, 'numero', y.numero, 'sujet', y.sujet, 'statut', y.statut, 'cree_le', y.cree_le,
      'meme_client', y.meme_client) order by y.score desc, y.cree_le desc)
    from (
      select x.* from (
        select s.id, s.numero, s.sujet, s.statut, s.cree_le,
          coalesce((t.contact_id is not null and s.contact_id = t.contact_id)
            or (nullif(regexp_replace(coalesce(t.telephone, ''), '[^0-9]', '', 'g'), '') = regexp_replace(coalesce(s.telephone, ''), '[^0-9]', '', 'g')), false) as meme_client,
          (select count(*) from unnest(v_mots) m where position(m in lower(s.sujet)) > 0) as mots
        from public.support_tickets s
        where s.etablissement_id = t.etablissement_id and s.id <> t.id
      ) x0
      cross join lateral (select x0.*, (case when x0.meme_client then 3 else 0 end) + x0.mots as score) x
      where x.score > 0
      order by x.score desc, x.cree_le desc
      limit 5
    ) y
  ), '[]'::jsonb);
end
$$;

-- Rendez-vous pris pour le client du ticket (droit Agenda nécessaire, vérifié par enregistrer_rendez_vous), tracé au ticket.
create function public.rdv_depuis_ticket(p_ticket_id uuid, p_debut timestamptz, p_duree_minutes integer default 60, p_responsable uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.support_tickets%rowtype;
  v_rdv uuid;
begin
  select * into t from public.support_tickets where id = p_ticket_id for update;
  if t.id is null then
    raise exception 'Ticket introuvable';
  end if;
  perform public.exiger_permission(t.etablissement_id, 'support_tickets.traiter');
  if t.statut = 'ferme' then
    raise exception 'Ticket fermé : rouvrez-le d''abord';
  end if;
  v_rdv := public.enregistrer_rendez_vous(t.etablissement_id, jsonb_strip_nulls(jsonb_build_object(
    'titre', left('Ticket ' || t.numero || ' : ' || t.sujet, 160),
    'contact_id', t.contact_id,
    'nom_client', case when t.contact_id is null then t.nom_client end,
    'telephone', case when t.contact_id is null then t.telephone end,
    'debut', p_debut, 'duree_minutes', p_duree_minutes, 'responsable', p_responsable,
    'note', 'Pris depuis le ticket ' || t.numero)));
  perform public.journal_ticket(t, 'Rendez-vous ' || (select numero from public.agenda_rendez_vous where id = v_rdv) || ' pris pour le '
    || to_char(p_debut at time zone coalesce((select fuseau from public.etablissements where id = t.etablissement_id), 'UTC'), 'DD/MM/YYYY HH24:MI'));
  return v_rdv;
end
$$;

-- ---------------------------------------------------------------------------
-- 7. Indicateurs : délai de première réponse et satisfaction
-- ---------------------------------------------------------------------------
create or replace function public.tableau_de_bord_support(p_etablissement_id uuid)
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
    'escalades', (select count(*) from public.support_tickets where etablissement_id = p_etablissement_id and niveau_escalade > 0
      and statut in ('ouvert', 'en_cours', 'attente_client')),
    'resolus_mois', (select count(*) from public.support_tickets where etablissement_id = p_etablissement_id and resolu_le is not null
      and date_trunc('month', resolu_le) = date_trunc('month', jour::timestamp)),
    'delai_moyen_heures', (select round(avg(extract(epoch from resolu_le - cree_le) / 3600)::numeric, 1) from public.support_tickets
      where etablissement_id = p_etablissement_id and resolu_le is not null and resolu_le > now() - interval '90 days'),
    'premiere_reponse_heures', (select round(avg(extract(epoch from r.premiere - t.cree_le) / 3600)::numeric, 1)
      from public.support_tickets t
      cross join lateral (select min(m.cree_le) premiere from public.support_messages m
        where m.ticket_id = t.id and not m.interne and not m.evenement) r
      where t.etablissement_id = p_etablissement_id and r.premiere is not null and t.cree_le > now() - interval '90 days'),
    'satisfaction_moyenne', (select round(avg(satisfaction)::numeric, 1) from public.support_tickets
      where etablissement_id = p_etablissement_id and satisfaction is not null and satisfaction_le > now() - interval '90 days'),
    'satisfaction_nombre', (select count(*) from public.support_tickets
      where etablissement_id = p_etablissement_id and satisfaction is not null and satisfaction_le > now() - interval '90 days')
  );
end
$$;

create or replace function public.cockpit_support(p_etablissement_id uuid, p_du date, p_au date, p_filtres jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  c public.cockpit_ctx;
  s jsonb;
  v_crees bigint; v_crees_p bigint; v_resolus bigint; v_resolus_p bigint; v_premier date; v_comp boolean;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'support_tickets.lire') then
    raise exception 'Permission refusée : support_tickets.lire' using errcode = '42501';
  end if;
  c := public.cockpit_preparer(p_etablissement_id, p_du, p_au, p_filtres);
  s := public.tableau_de_bord_support(p_etablissement_id);
  select count(*) filter (where (t.cree_le at time zone c.tz)::date between c.du and c.au),
         count(*) filter (where (t.cree_le at time zone c.tz)::date between c.pdu and c.pau),
         count(*) filter (where (t.resolu_le at time zone c.tz)::date between c.du and c.au),
         count(*) filter (where (t.resolu_le at time zone c.tz)::date between c.pdu and c.pau),
         min((t.cree_le at time zone c.tz)::date)
  into v_crees, v_crees_p, v_resolus, v_resolus_p, v_premier
  from public.support_tickets t where t.etablissement_id = p_etablissement_id;
  v_comp := public.cockpit_comparable(v_crees_p, v_premier, c.pdu);
  return jsonb_build_object(
    'domaine', 'support',
    'periode', jsonb_build_object('du', c.du, 'au', c.au, 'du_precedent', c.pdu, 'au_precedent', c.pau, 'comparable', v_comp),
    'kpis', public.cockpit_liste(array[
      public.cockpit_kpi('ouverts', 'Tickets ouverts', (s ->> 'ouverts')::numeric, 'nombre', 'support?etat=actifs', null,
        case when (s ->> 'urgents')::int > 0 then format('%s urgent(s)', s ->> 'urgents') end, case when (s ->> 'urgents')::int > 0 then 'attention' end, true),
      public.cockpit_kpi('crees', 'Nouveaux tickets', v_crees, 'nombre', 'support', case when v_comp then v_crees_p end),
      public.cockpit_kpi('resolus', 'Résolus', v_resolus, 'nombre', 'support', case when v_comp then v_resolus_p end),
      public.cockpit_kpi('en_retard', 'En retard', (s ->> 'en_retard')::numeric, 'nombre', 'support?etat=retard', null, null, case when (s ->> 'en_retard')::int > 0 then 'alerte' end),
      public.cockpit_kpi('non_assignes', 'Non assignés', (s ->> 'non_assignes')::numeric, 'nombre', 'support?etat=non_assignes'),
      case when s ->> 'premiere_reponse_heures' is not null then
        public.cockpit_kpi('premiere_reponse', 'Délai de première réponse', (s ->> 'premiere_reponse_heures')::numeric, 'heures', 'support', null, '90 derniers jours') end,
      case when s ->> 'delai_moyen_heures' is not null then
        public.cockpit_kpi('delai', 'Délai moyen de résolution', (s ->> 'delai_moyen_heures')::numeric, 'heures', 'support', null, '90 derniers jours') end,
      case when s ->> 'satisfaction_moyenne' is not null then
        public.cockpit_kpi('satisfaction', 'Satisfaction moyenne (sur 5)', (s ->> 'satisfaction_moyenne')::numeric, 'nombre', 'support', null,
          format('%s avis, 90 derniers jours', s ->> 'satisfaction_nombre')) end
    ]),
    'attention', public.cockpit_liste(array[
      public.cockpit_alerte('urgents', 'critique', 'Tickets urgents ouverts', null, (s ->> 'urgents')::numeric, 'support?etat=actifs&priorite=urgente'),
      public.cockpit_alerte('en_retard', 'alerte', 'Tickets en retard', 'Échéance dépassée', (s ->> 'en_retard')::numeric, 'support?etat=retard'),
      public.cockpit_alerte('escalades', 'alerte', 'Tickets escaladés', null, (s ->> 'escalades')::numeric, 'support?etat=escalades'),
      public.cockpit_alerte('non_assignes', 'info', 'Tickets sans responsable', null, (s ->> 'non_assignes')::numeric, 'support?etat=non_assignes')
    ]),
    'graphiques', '[]'::jsonb,
    'listes', '[]'::jsonb,
    'activite', '[]'::jsonb
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 8. Droits d'exécution
-- ---------------------------------------------------------------------------
do $$
declare signature text;
begin
  foreach signature in array array[
    'public.enregistrer_element_support(uuid, jsonb)', 'public.ouvrir_ticket_support(uuid, jsonb)',
    'public.escalader_ticket(uuid, text)', 'public.confirmer_resolution_ticket(uuid, boolean, text)',
    'public.noter_satisfaction_ticket(uuid, integer, text)', 'public.tickets_similaires(uuid)',
    'public.rdv_depuis_ticket(uuid, timestamptz, integer, uuid)', 'public.tableau_de_bord_support(uuid)',
    'public.cockpit_support(uuid, date, date, jsonb)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
  execute 'revoke execute on function public.support_moins_charge(uuid) from public, anon, authenticated';
end
$$;

notify pgrst, 'reload schema';
