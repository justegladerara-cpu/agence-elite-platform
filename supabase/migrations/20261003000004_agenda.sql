-- Agenda (2026-10-03) : nouveau module « agenda » (rendez-vous clients et planning de l'équipe).
-- Rendez-vous avec un client enregistré ou un nom + téléphone, une personne de l'équipe, une prestation (article)
-- facultative, un lieu ; jamais deux rendez-vous en même temps pour la même personne. Statuts : prévu → confirmé →
-- honoré ; annulé ou absent avec motif. La personne est prévenue quand on lui attribue un rendez-vous.
-- Un rendez-vous honoré avec prestation peut être facturé (module Facturation : facture en brouillon).
-- Rien ne se supprime.

-- ---------------------------------------------------------------------------
-- 1. Catalogue et droits
-- ---------------------------------------------------------------------------
insert into public.modules (id, nom, description, nature, statut, categorie, icone, ordre, version, documentation) values
  ('agenda', 'Agenda et rendez-vous', 'Rendez-vous clients, planning de l''équipe, sans double réservation.', 'transversal', 'actif', 'projets',
   'calendrier', 285, '1.0', 'docs/AGENDA.md')
on conflict (id) do nothing;
insert into public.module_dependances (module_id, depend_de) values ('agenda', 'contacts'), ('agenda', 'membres')
on conflict do nothing;
insert into public.solution_modules (solution_id, module_id, par_defaut) values
  ('services', 'agenda', true), ('commerce', 'agenda', false), ('restaurant', 'agenda', false), ('hotel', 'agenda', false),
  ('ecommerce', 'agenda', false)
on conflict (solution_id, module_id) do nothing;
-- Offre d'essai Services (prix 0) : l'agenda en fait partie. Les autres solutions l'obtiennent comme module accordé.
update public.offres set modules = array_append(modules, 'agenda') where id = 'services-complet' and not ('agenda' = any (modules));

insert into public.permissions (id, module_id, description) values
  ('agenda.lire', 'agenda', 'Voir l''agenda de l''établissement'),
  ('agenda.gerer', 'agenda', 'Prendre, modifier, annuler les rendez-vous')
on conflict (id) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['gerant', 'responsable', 'responsable_hub', 'commercial', 'employe', 'receptionniste', 'collaborateur']) r
cross join unnest(array['agenda.lire', 'agenda.gerer']) p
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id) values ('lecteur', 'agenda.lire'), ('comptable', 'agenda.lire')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Table
-- ---------------------------------------------------------------------------
create table public.agenda_rendez_vous (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  numero text not null,
  titre text not null check (btrim(titre) <> '' and length(titre) <= 160),
  contact_id uuid references public.contacts(id) on delete restrict,
  nom_client text check (nom_client is null or length(nom_client) <= 160),
  telephone text check (telephone is null or length(telephone) <= 40),
  responsable uuid references auth.users(id) on delete restrict,
  article_id uuid references public.articles(id) on delete restrict,
  prix numeric(14, 2) check (prix is null or prix >= 0),
  debut timestamptz not null,
  fin timestamptz not null,
  lieu text check (lieu is null or length(lieu) <= 200),
  note text check (note is null or length(note) <= 2000),
  statut text not null default 'prevu' check (statut in ('prevu', 'confirme', 'honore', 'annule', 'absent')),
  motif text,
  document_id uuid references public.documents_vente(id) on delete restrict,
  cree_par uuid references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (etablissement_id, numero),
  check (fin > debut and fin <= debut + interval '24 hours'),
  check (contact_id is not null or btrim(coalesce(nom_client, '')) <> ''),
  check (statut not in ('annule', 'absent') or btrim(coalesce(motif, '')) <> '')
);
create index agenda_rdv_etablissement_debut_idx on public.agenda_rendez_vous(etablissement_id, debut);
create index agenda_rdv_responsable_idx on public.agenda_rendez_vous(responsable, debut);

create trigger agenda_rendez_vous_modifie_le before update on public.agenda_rendez_vous for each row execute function public.fixer_modifie_le();
create trigger agenda_rendez_vous_sans_suppression before delete on public.agenda_rendez_vous for each row execute function public.refuser_suppression();
create trigger agenda_rendez_vous_verrou_etablissement before update on public.agenda_rendez_vous for each row execute function public.verrouiller_etablissement_id();
create trigger agenda_rendez_vous_audit after insert or update or delete on public.agenda_rendez_vous for each row execute function public.journaliser_modification();
alter table public.agenda_rendez_vous enable row level security;
create policy lecture on public.agenda_rendez_vous for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'agenda.lire'));

-- ---------------------------------------------------------------------------
-- 3. Fonctions
-- ---------------------------------------------------------------------------
-- p : { id?, titre?, contact_id?, nom_client?, telephone?, responsable?, article_id?, prix?, debut, fin?, duree_minutes?, lieu?, note?, statut? }
create function public.enregistrer_rendez_vous(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p ->> 'id', '')::uuid;
  existant public.agenda_rendez_vous%rowtype;
  v_contact public.contacts%rowtype;
  v_article public.articles%rowtype;
  v_responsable uuid := nullif(p ->> 'responsable', '')::uuid;
  v_debut timestamptz := nullif(p ->> 'debut', '')::timestamptz;
  v_fin timestamptz := nullif(p ->> 'fin', '')::timestamptz;
  v_statut text := coalesce(nullif(p ->> 'statut', ''), 'prevu');
  v_titre text;
  conflit text;
begin
  perform public.exiger_permission(p_etablissement_id, 'agenda.gerer');
  if resultat is not null then
    select * into existant from public.agenda_rendez_vous where id = resultat and etablissement_id = p_etablissement_id for update;
    if existant.id is null then
      raise exception 'Rendez-vous introuvable';
    end if;
    if existant.statut not in ('prevu', 'confirme') then
      raise exception 'Ce rendez-vous est clos : il ne se modifie plus';
    end if;
  end if;
  if v_statut not in ('prevu', 'confirme') then
    raise exception 'Statut invalide : utilisez Honoré, Annuler ou Absent';
  end if;
  if v_debut is null then
    raise exception 'Indiquez la date et l''heure';
  end if;
  if v_fin is null then
    v_fin := v_debut + make_interval(mins => greatest(5, least(1440, coalesce(nullif(p ->> 'duree_minutes', '')::integer, 60))));
  end if;
  if v_fin <= v_debut or v_fin > v_debut + interval '24 hours' then
    raise exception 'La fin doit suivre le début (24 h au plus)';
  end if;
  if resultat is null and v_debut < now() - interval '1 day' then
    raise exception 'Date passée : un rendez-vous se prend à l''avance';
  end if;
  if nullif(p ->> 'contact_id', '') is not null then
    select * into v_contact from public.contacts where id = (p ->> 'contact_id')::uuid and etablissement_id = p_etablissement_id and actif;
    if v_contact.id is null then
      raise exception 'Client introuvable';
    end if;
  elsif coalesce(btrim(p ->> 'nom_client'), '') = '' then
    raise exception 'Indiquez le client (fiche ou nom)';
  end if;
  if nullif(p ->> 'article_id', '') is not null then
    select * into v_article from public.articles where id = (p ->> 'article_id')::uuid and etablissement_id = p_etablissement_id;
    if v_article.id is null then
      raise exception 'Prestation introuvable';
    end if;
  end if;
  if v_responsable is not null then
    if not exists (select 1 from public.etablissement_membres where etablissement_id = p_etablissement_id and user_id = v_responsable and actif) then
      raise exception 'La personne choisie n''est pas membre de l''établissement';
    end if;
    -- Une personne ne tient qu'un rendez-vous à la fois (verrou par personne pour les prises simultanées).
    perform pg_advisory_xact_lock(hashtextextended('agenda:' || v_responsable::text, 0));
    select numero into conflit from public.agenda_rendez_vous
    where responsable = v_responsable and statut in ('prevu', 'confirme') and id is distinct from resultat
      and debut < v_fin and fin > v_debut
    limit 1;
    if conflit is not null then
      raise exception 'Cette personne a déjà le rendez-vous % sur ce créneau', conflit;
    end if;
  end if;
  v_titre := coalesce(nullif(btrim(p ->> 'titre'), ''), v_article.nom, 'Rendez-vous');
  if resultat is null then
    insert into public.agenda_rendez_vous (etablissement_id, numero, titre, contact_id, nom_client, telephone, responsable, article_id, prix,
      debut, fin, lieu, note, statut, cree_par)
    values (p_etablissement_id, public.prochain_numero(p_etablissement_id, 'rendez_vous', 'RV-'), left(v_titre, 160), v_contact.id,
      coalesce(nullif(btrim(p ->> 'nom_client'), ''), v_contact.nom), coalesce(nullif(btrim(p ->> 'telephone'), ''), v_contact.telephone),
      v_responsable, v_article.id, coalesce(nullif(p ->> 'prix', '')::numeric, v_article.prix_vente), v_debut, v_fin,
      nullif(btrim(p ->> 'lieu'), ''), nullif(btrim(p ->> 'note'), ''), v_statut, auth.uid())
    returning id into resultat;
  else
    update public.agenda_rendez_vous set titre = left(v_titre, 160), contact_id = v_contact.id,
      nom_client = coalesce(nullif(btrim(p ->> 'nom_client'), ''), v_contact.nom), telephone = coalesce(nullif(btrim(p ->> 'telephone'), ''), v_contact.telephone),
      responsable = v_responsable, article_id = v_article.id, prix = coalesce(nullif(p ->> 'prix', '')::numeric, v_article.prix_vente),
      debut = v_debut, fin = v_fin, lieu = nullif(btrim(p ->> 'lieu'), ''), note = nullif(btrim(p ->> 'note'), ''), statut = v_statut
    where id = resultat;
  end if;
  if v_responsable is not null and v_responsable is distinct from auth.uid()
     and (existant.id is null or existant.responsable is distinct from v_responsable or existant.debut <> v_debut) then
    perform public.notifier(v_responsable, p_etablissement_id, 'agenda.rendez_vous', 'Rendez-vous : ' || left(v_titre, 100),
      coalesce(nullif(btrim(p ->> 'nom_client'), ''), v_contact.nom) || ' · ' || to_char(v_debut at time zone 'UTC', 'DD/MM HH24:MI') || ' (UTC)',
      'agenda/' || resultat);
  end if;
  return resultat;
end
$$;

-- Clôture : honoré, annulé (motif) ou absent (motif, à partir de l'heure prévue).
create function public.cloturer_rendez_vous(p_id uuid, p_statut text, p_motif text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.agenda_rendez_vous%rowtype;
begin
  select * into r from public.agenda_rendez_vous where id = p_id for update;
  if r.id is null then
    raise exception 'Rendez-vous introuvable';
  end if;
  perform public.exiger_permission(r.etablissement_id, 'agenda.gerer');
  if r.statut not in ('prevu', 'confirme') then
    raise exception 'Ce rendez-vous est déjà clos';
  end if;
  if p_statut not in ('honore', 'annule', 'absent') then
    raise exception 'Statut inconnu : %', p_statut;
  end if;
  if p_statut in ('annule', 'absent') and coalesce(btrim(p_motif), '') = '' then
    raise exception 'Le motif est obligatoire';
  end if;
  if p_statut in ('honore', 'absent') and r.debut > now() then
    raise exception 'Le rendez-vous n''a pas encore commencé';
  end if;
  update public.agenda_rendez_vous set statut = p_statut, motif = nullif(btrim(p_motif), '') where id = r.id;
end
$$;

-- Facture en brouillon (module Facturation) pour un rendez-vous honoré avec prestation ou prix ; une seule fois.
create function public.facturer_rendez_vous(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.agenda_rendez_vous%rowtype;
  v_contact uuid;
  v_doc uuid;
begin
  select * into r from public.agenda_rendez_vous where id = p_id for update;
  if r.id is null then
    raise exception 'Rendez-vous introuvable';
  end if;
  perform public.exiger_permission(r.etablissement_id, 'agenda.gerer');
  if r.statut <> 'honore' then
    raise exception 'Seul un rendez-vous honoré se facture';
  end if;
  if r.document_id is not null then
    raise exception 'Ce rendez-vous est déjà facturé';
  end if;
  if r.prix is null or r.prix <= 0 then
    raise exception 'Indiquez d''abord une prestation ou un prix';
  end if;
  v_contact := r.contact_id;
  if v_contact is null then
    perform public.exiger_permission(r.etablissement_id, 'contacts.gerer');
    insert into public.contacts (etablissement_id, type, nom, telephone) values (r.etablissement_id, 'client', r.nom_client, r.telephone)
    returning id into v_contact;
    update public.agenda_rendez_vous set contact_id = v_contact where id = r.id;
  end if;
  v_doc := public.enregistrer_document_vente(r.etablissement_id, jsonb_build_object(
    'type', 'facture', 'contact_id', v_contact, 'objet', r.titre || ' du ' || to_char(public.date_locale(r.etablissement_id, r.debut), 'DD/MM/YYYY'),
    'lignes', jsonb_build_array(jsonb_build_object('article_id', r.article_id, 'libelle', r.titre, 'quantite', 1, 'prix_unitaire', r.prix))));
  update public.agenda_rendez_vous set document_id = v_doc where id = r.id;
  return v_doc;
end
$$;

create function public.tableau_de_bord_agenda(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  jour date := public.date_locale(p_etablissement_id);
begin
  if not public.lecture_autorisee(p_etablissement_id, 'agenda.lire') then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'aujourd_hui', (select count(*) from public.agenda_rendez_vous where etablissement_id = p_etablissement_id
      and public.date_locale(p_etablissement_id, debut) = jour and statut in ('prevu', 'confirme', 'honore')),
    'mes_rendez_vous', (select count(*) from public.agenda_rendez_vous where etablissement_id = p_etablissement_id and responsable = auth.uid()
      and public.date_locale(p_etablissement_id, debut) = jour and statut in ('prevu', 'confirme')),
    'semaine', (select count(*) from public.agenda_rendez_vous where etablissement_id = p_etablissement_id
      and public.date_locale(p_etablissement_id, debut) between jour and jour + 6 and statut in ('prevu', 'confirme')),
    'a_confirmer', (select count(*) from public.agenda_rendez_vous where etablissement_id = p_etablissement_id
      and statut = 'prevu' and debut > now()),
    'absents_mois', (select count(*) from public.agenda_rendez_vous where etablissement_id = p_etablissement_id and statut = 'absent'
      and date_trunc('month', debut) = date_trunc('month', jour::timestamp)),
    'a_cloturer', (select count(*) from public.agenda_rendez_vous where etablissement_id = p_etablissement_id
      and statut in ('prevu', 'confirme') and fin < now())
  );
end
$$;

-- Équipe affichable (nom seulement) : personnes qui peuvent recevoir un rendez-vous, ou en ont déjà.
create function public.agenda_equipe(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.lecture_autorisee(p_etablissement_id, 'agenda.lire') then
    raise exception 'Permission refusée : agenda.lire' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', u.id, 'nom', coalesce(nullif(p.nom_complet, ''), split_part(u.email, '@', 1)),
      'moi', u.id = auth.uid()) order by coalesce(p.nom_complet, u.email))
    from auth.users u left join public.profils p on p.id = u.id
    where u.id in (select public.membres_avec_permission(p_etablissement_id, 'agenda.gerer'))
       or u.id in (select responsable from public.agenda_rendez_vous where etablissement_id = p_etablissement_id)
  ), '[]'::jsonb);
end
$$;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.enregistrer_rendez_vous(uuid, jsonb)', 'public.cloturer_rendez_vous(uuid, text, text)',
    'public.facturer_rendez_vous(uuid)', 'public.tableau_de_bord_agenda(uuid)', 'public.agenda_equipe(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
end
$$;
