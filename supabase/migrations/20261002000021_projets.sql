-- Projets et tâches (2026-10-02) : le module « projets », jusqu'ici « Prévu », devient réel.
-- Projet (PJ-) pour un client (contact), tâches en colonnes (à faire → terminée), temps passé saisi par chacun,
-- temps facturable transformé en facture brouillon (module Facturation). Rien ne se supprime : on annule avec motif.
-- La solution « Services et projets » (contacts, CRM, facturation, projets) devient commercialisable.

-- ---------------------------------------------------------------------------
-- 1. Catalogue et droits
-- ---------------------------------------------------------------------------
update public.modules set
  description = 'Projets clients, tâches, échéances, temps passé, facturation du temps.',
  documentation = 'docs/PROJETS.md',
  parametres_schema = '[
    {"cle": "taux_horaire", "libelle": "Taux horaire facturé par défaut", "type": "nombre", "defaut": 0},
    {"cle": "saisie_temps_jours", "libelle": "Saisie de temps possible jusqu''à (jours en arrière)", "type": "nombre", "defaut": 31}
  ]'::jsonb
where id = 'projets';

insert into public.permissions (id, module_id, description) values
  ('projets.lire', 'projets', 'Voir les projets, tâches et temps'),
  ('projets.contribuer', 'projets', 'Travailler sur ses tâches et saisir son temps'),
  ('projets.gerer', 'projets', 'Créer et piloter les projets, assigner les tâches, facturer le temps')
on conflict (id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['gerant', 'responsable']) r
cross join unnest(array['projets.lire', 'projets.contribuer', 'projets.gerer']) p
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id) values
  ('collaborateur', 'projets.lire'), ('collaborateur', 'projets.contribuer'),
  ('commercial', 'projets.lire'), ('comptable', 'projets.lire'), ('lecteur', 'projets.lire')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
create table public.projets (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  numero text not null,
  nom text not null check (btrim(nom) <> '' and length(nom) <= 160),
  description text check (description is null or length(description) <= 4000),
  contact_id uuid references public.contacts(id) on delete restrict,
  opportunite_id uuid references public.crm_opportunites(id) on delete restrict,
  responsable_id uuid not null references auth.users(id) on delete restrict,
  statut text not null default 'en_cours' check (statut in ('a_venir', 'en_cours', 'en_pause', 'termine', 'annule')),
  date_debut date,
  date_fin_prevue date,
  budget numeric(14, 2) check (budget is null or budget >= 0),
  heures_prevues numeric(10, 2) check (heures_prevues is null or heures_prevues >= 0),
  taux_horaire numeric(14, 2) check (taux_horaire is null or taux_horaire >= 0),
  couleur text check (couleur is null or couleur ~ '^#[0-9a-fA-F]{6}$'),
  motif_annulation text,
  termine_le timestamptz,
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (etablissement_id, numero),
  unique (id, etablissement_id),
  check (date_fin_prevue is null or date_debut is null or date_fin_prevue >= date_debut),
  check (statut <> 'annule' or btrim(coalesce(motif_annulation, '')) <> '')
);
create index projets_etablissement_idx on public.projets(etablissement_id, statut);

create table public.projet_taches (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  projet_id uuid not null,
  titre text not null check (btrim(titre) <> '' and length(titre) <= 200),
  description text check (description is null or length(description) <= 4000),
  statut text not null default 'a_faire' check (statut in ('a_faire', 'en_cours', 'en_revue', 'terminee', 'annulee')),
  priorite text not null default 'normale' check (priorite in ('basse', 'normale', 'haute', 'urgente')),
  assigne_a uuid references auth.users(id) on delete restrict,
  echeance date,
  estimation_heures numeric(8, 2) check (estimation_heures is null or estimation_heures >= 0),
  ordre integer not null default 0,
  terminee_le timestamptz,
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (id, etablissement_id),
  check ((statut = 'terminee') = (terminee_le is not null)),
  foreign key (projet_id, etablissement_id) references public.projets(id, etablissement_id) on delete restrict
);
create index projet_taches_projet_idx on public.projet_taches(projet_id, statut, ordre);
create index projet_taches_assigne_idx on public.projet_taches(assigne_a, statut);

create table public.projet_temps (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  projet_id uuid not null,
  tache_id uuid,
  user_id uuid not null references auth.users(id) on delete restrict,
  date_travail date not null,
  minutes integer not null check (minutes > 0 and minutes <= 1440),
  description text check (description is null or length(description) <= 500),
  facturable boolean not null default true,
  statut text not null default 'valide' check (statut in ('valide', 'annule')),
  document_vente_id uuid references public.documents_vente(id) on delete restrict,
  saisi_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  annule_le timestamptz,
  annule_par uuid references auth.users(id) on delete restrict,
  motif_annulation text,
  check (statut = 'valide' or (annule_le is not null and annule_par is not null and btrim(coalesce(motif_annulation, '')) <> '')),
  foreign key (projet_id, etablissement_id) references public.projets(id, etablissement_id) on delete restrict,
  foreign key (tache_id, etablissement_id) references public.projet_taches(id, etablissement_id) on delete restrict
);
create index projet_temps_projet_idx on public.projet_temps(projet_id, date_travail);
create index projet_temps_user_idx on public.projet_temps(user_id, date_travail);

do $$
declare
  nom_table text;
begin
  foreach nom_table in array array['projets', 'projet_taches'] loop
    execute format('create trigger %I_modifie_le before update on public.%I for each row execute function public.fixer_modifie_le()', nom_table, nom_table);
  end loop;
  foreach nom_table in array array['projets', 'projet_taches', 'projet_temps'] loop
    execute format('create trigger %I_sans_suppression before delete on public.%I for each row execute function public.refuser_suppression()', nom_table, nom_table);
    execute format('create trigger %I_verrou_etablissement before update on public.%I for each row execute function public.verrouiller_etablissement_id()', nom_table, nom_table);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.journaliser_modification()', nom_table, nom_table);
    execute format('alter table public.%I enable row level security', nom_table);
    execute format('create policy lecture on public.%I for select to authenticated using (public.lecture_autorisee(etablissement_id, ''projets.lire''))', nom_table);
  end loop;
end
$$;
-- Un temps saisi ne change plus (seule l'annulation, ou le rattachement à une facture, sont possibles).
create function public.proteger_temps_projet()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - array['statut', 'annule_le', 'annule_par', 'motif_annulation', 'document_vente_id'])
     <> (to_jsonb(old) - array['statut', 'annule_le', 'annule_par', 'motif_annulation', 'document_vente_id']) then
    raise exception 'Un temps saisi ne se modifie pas : annulez-le et ressaisissez-le';
  end if;
  if old.statut = 'annule' and new.statut <> 'annule' then
    raise exception 'Un temps annulé le reste';
  end if;
  if old.document_vente_id is not null and new.document_vente_id is distinct from old.document_vente_id then
    raise exception 'Ce temps est déjà facturé';
  end if;
  return new;
end
$$;
create trigger projet_temps_protection before update on public.projet_temps
for each row execute function public.proteger_temps_projet();

insert into public.types_pieces_jointes (objet_type, table_nom, module_id, permission_lire, permission_ecrire, libelle)
values ('projet', 'projets', 'projets', 'projets.lire', 'projets.contribuer', 'Projet')
on conflict (objet_type) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Fonctions
-- ---------------------------------------------------------------------------
-- Une personne qui reçoit un projet, une tâche ou du temps doit pouvoir y travailler (projets.contribuer).
create function public.exiger_membre_actif(p_etablissement_id uuid, p_user_id uuid, p_libelle text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_user_id is not null and p_user_id not in (select public.membres_avec_permission(p_etablissement_id, 'projets.contribuer')) then
    raise exception '% doit être un membre actif de l''établissement qui travaille sur les projets', p_libelle;
  end if;
end
$$;

-- p : { id?, nom, description?, contact_id?, opportunite_id?, responsable_id?, statut?, date_debut?, date_fin_prevue?, budget?, heures_prevues?, taux_horaire?, couleur? }
create function public.enregistrer_projet(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p ->> 'id', '')::uuid;
  existant public.projets%rowtype;
  v_contact uuid := nullif(p ->> 'contact_id', '')::uuid;
  v_opportunite uuid := nullif(p ->> 'opportunite_id', '')::uuid;
  v_responsable uuid := nullif(p ->> 'responsable_id', '')::uuid;
  v_statut text := coalesce(nullif(p ->> 'statut', ''), 'en_cours');
begin
  perform public.exiger_permission(p_etablissement_id, 'projets.gerer');
  if resultat is not null then
    select * into existant from public.projets where id = resultat and etablissement_id = p_etablissement_id for update;
    if existant.id is null then
      raise exception 'Projet introuvable dans cet établissement';
    end if;
    if existant.statut in ('termine', 'annule') then
      raise exception 'Un projet terminé ou annulé ne se modifie plus (rouvrez-le)';
    end if;
  end if;
  if v_statut not in ('a_venir', 'en_cours', 'en_pause') then
    raise exception 'Terminer ou annuler un projet passe par le bouton dédié';
  end if;
  if v_contact is not null and not exists (select 1 from public.contacts where id = v_contact and etablissement_id = p_etablissement_id) then
    raise exception 'Client inconnu dans cet établissement';
  end if;
  if v_opportunite is not null and not exists (select 1 from public.crm_opportunites where id = v_opportunite and etablissement_id = p_etablissement_id) then
    raise exception 'Opportunité inconnue dans cet établissement';
  end if;
  v_responsable := coalesce(v_responsable, existant.responsable_id, auth.uid());
  perform public.exiger_membre_actif(p_etablissement_id, v_responsable, 'Le responsable');
  if resultat is null then
    insert into public.projets (etablissement_id, numero, nom, description, contact_id, opportunite_id, responsable_id, statut,
      date_debut, date_fin_prevue, budget, heures_prevues, taux_horaire, couleur, cree_par)
    values (p_etablissement_id, public.prochain_numero(p_etablissement_id, 'projet', 'PJ-'), btrim(p ->> 'nom'),
      nullif(btrim(p ->> 'description'), ''), v_contact, v_opportunite, v_responsable, v_statut,
      coalesce(nullif(p ->> 'date_debut', '')::date, public.date_locale(p_etablissement_id)), nullif(p ->> 'date_fin_prevue', '')::date,
      nullif(p ->> 'budget', '')::numeric, nullif(p ->> 'heures_prevues', '')::numeric, nullif(p ->> 'taux_horaire', '')::numeric,
      nullif(p ->> 'couleur', ''), auth.uid())
    returning id into resultat;
  else
    update public.projets set nom = btrim(p ->> 'nom'), description = nullif(btrim(p ->> 'description'), ''),
      contact_id = v_contact, opportunite_id = v_opportunite, responsable_id = v_responsable, statut = v_statut,
      date_debut = nullif(p ->> 'date_debut', '')::date, date_fin_prevue = nullif(p ->> 'date_fin_prevue', '')::date,
      budget = nullif(p ->> 'budget', '')::numeric, heures_prevues = nullif(p ->> 'heures_prevues', '')::numeric,
      taux_horaire = nullif(p ->> 'taux_horaire', '')::numeric, couleur = nullif(p ->> 'couleur', '')
    where id = resultat;
  end if;
  if v_responsable <> auth.uid() and (existant.id is null or existant.responsable_id <> v_responsable) then
    perform public.notifier(v_responsable, p_etablissement_id, 'projets.responsable', 'Projet confié', btrim(p ->> 'nom'), 'projets/' || resultat);
  end if;
  return resultat;
end
$$;

-- Terminer, annuler (motif) ou rouvrir un projet.
create function public.changer_statut_projet(p_projet_id uuid, p_statut text, p_motif text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pr public.projets%rowtype;
begin
  select * into pr from public.projets where id = p_projet_id for update;
  if pr.id is null then
    raise exception 'Projet introuvable';
  end if;
  perform public.exiger_permission(pr.etablissement_id, 'projets.gerer');
  if p_statut = 'termine' and pr.statut in ('a_venir', 'en_cours', 'en_pause') then
    update public.projets set statut = 'termine', termine_le = now() where id = pr.id;
  elsif p_statut = 'annule' and pr.statut in ('a_venir', 'en_cours', 'en_pause') then
    if coalesce(btrim(p_motif), '') = '' then
      raise exception 'Le motif d''annulation est obligatoire';
    end if;
    update public.projets set statut = 'annule', motif_annulation = btrim(p_motif) where id = pr.id;
  elsif p_statut = 'en_cours' and pr.statut in ('termine', 'annule') then
    update public.projets set statut = 'en_cours', termine_le = null, motif_annulation = null where id = pr.id;
  else
    raise exception 'Passage impossible de « % » à « % »', pr.statut, p_statut;
  end if;
end
$$;

-- Tâche : créer / modifier (gérer, ou contribuer sur une tâche qui lui est assignée sans changer l'assignation).
-- p : { id?, projet_id, titre, description?, priorite?, assigne_a?, echeance?, estimation_heures?, statut? }
create function public.enregistrer_tache_projet(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p ->> 'id', '')::uuid;
  existante public.projet_taches%rowtype;
  pr public.projets%rowtype;
  v_assigne uuid := nullif(p ->> 'assigne_a', '')::uuid;
  v_statut text;
  gerer boolean := public.a_permission(p_etablissement_id, 'projets.gerer');
begin
  perform public.exiger_permission(p_etablissement_id, 'projets.contribuer');
  if resultat is not null then
    select * into existante from public.projet_taches where id = resultat and etablissement_id = p_etablissement_id for update;
    if existante.id is null then
      raise exception 'Tâche introuvable';
    end if;
    if not gerer and existante.assigne_a is distinct from auth.uid() then
      raise exception 'Permission refusée : cette tâche est assignée à quelqu''un d''autre' using errcode = '42501';
    end if;
    if not gerer and v_assigne is distinct from existante.assigne_a and p ? 'assigne_a' then
      raise exception 'Permission refusée : seul le pilote du projet réassigne une tâche' using errcode = '42501';
    end if;
    v_assigne := case when p ? 'assigne_a' then v_assigne else existante.assigne_a end;
  else
    if not gerer and v_assigne is distinct from auth.uid() then
      v_assigne := auth.uid();
    end if;
  end if;
  select * into pr from public.projets where id = coalesce(existante.projet_id, nullif(p ->> 'projet_id', '')::uuid) and etablissement_id = p_etablissement_id;
  if pr.id is null then
    raise exception 'Projet introuvable dans cet établissement';
  end if;
  if pr.statut in ('termine', 'annule') then
    raise exception 'Projet terminé ou annulé';
  end if;
  perform public.exiger_membre_actif(p_etablissement_id, v_assigne, 'La personne assignée');
  v_statut := coalesce(nullif(p ->> 'statut', ''), existante.statut, 'a_faire');
  if resultat is null then
    insert into public.projet_taches (etablissement_id, projet_id, titre, description, statut, priorite, assigne_a, echeance,
      estimation_heures, ordre, terminee_le, cree_par)
    values (p_etablissement_id, pr.id, btrim(p ->> 'titre'), nullif(btrim(p ->> 'description'), ''), v_statut,
      coalesce(nullif(p ->> 'priorite', ''), 'normale'), v_assigne, nullif(p ->> 'echeance', '')::date,
      nullif(p ->> 'estimation_heures', '')::numeric,
      coalesce((select max(ordre) + 1 from public.projet_taches where projet_id = pr.id), 1),
      case when v_statut = 'terminee' then now() end, auth.uid())
    returning id into resultat;
  else
    update public.projet_taches set titre = coalesce(nullif(btrim(p ->> 'titre'), ''), titre),
      description = case when p ? 'description' then nullif(btrim(p ->> 'description'), '') else description end,
      statut = v_statut, priorite = coalesce(nullif(p ->> 'priorite', ''), priorite), assigne_a = v_assigne,
      echeance = case when p ? 'echeance' then nullif(p ->> 'echeance', '')::date else echeance end,
      estimation_heures = case when p ? 'estimation_heures' then nullif(p ->> 'estimation_heures', '')::numeric else estimation_heures end,
      terminee_le = case when v_statut = 'terminee' then coalesce(terminee_le, now()) else null end
    where id = resultat;
  end if;
  if v_assigne is not null and v_assigne <> auth.uid() and (existante.id is null or existante.assigne_a is distinct from v_assigne) then
    perform public.notifier(v_assigne, p_etablissement_id, 'projets.tache', 'Tâche assignée : ' || btrim(coalesce(p ->> 'titre', existante.titre)),
      pr.numero || ' · ' || pr.nom, 'projets/' || pr.id);
  end if;
  return resultat;
end
$$;

-- Saisie de temps : pour soi (contribuer) ou pour un autre membre (gérer). p : { projet_id, tache_id?, user_id?, date_travail?, minutes, description?, facturable? }
create function public.saisir_temps_projet(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pr public.projets%rowtype;
  v_user uuid := coalesce(nullif(p ->> 'user_id', '')::uuid, auth.uid());
  v_date date := coalesce(nullif(p ->> 'date_travail', '')::date, public.date_locale(p_etablissement_id));
  v_tache uuid := nullif(p ->> 'tache_id', '')::uuid;
  v_minutes integer := nullif(p ->> 'minutes', '')::integer;
  recul integer := coalesce((public.parametre_module(p_etablissement_id, 'projets', 'saisie_temps_jours') #>> '{}')::integer, 31);
  resultat uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'projets.contribuer');
  if v_user <> auth.uid() then
    perform public.exiger_permission(p_etablissement_id, 'projets.gerer');
  end if;
  perform public.exiger_membre_actif(p_etablissement_id, v_user, 'La personne');
  select * into pr from public.projets where id = nullif(p ->> 'projet_id', '')::uuid and etablissement_id = p_etablissement_id;
  if pr.id is null then
    raise exception 'Projet introuvable dans cet établissement';
  end if;
  if pr.statut = 'annule' then
    raise exception 'Projet annulé';
  end if;
  if v_tache is not null and not exists (select 1 from public.projet_taches where id = v_tache and projet_id = pr.id) then
    raise exception 'Cette tâche n''appartient pas au projet';
  end if;
  if v_minutes is null or v_minutes <= 0 or v_minutes > 1440 then
    raise exception 'Durée invalide (entre 1 minute et 24 heures)';
  end if;
  if v_date > public.date_locale(p_etablissement_id) or v_date < public.date_locale(p_etablissement_id) - recul then
    raise exception 'Date hors de la période de saisie (% jours en arrière au plus)', recul;
  end if;
  if (select coalesce(sum(minutes), 0) from public.projet_temps where user_id = v_user and date_travail = v_date and statut = 'valide'
        and etablissement_id = p_etablissement_id) + v_minutes > 1440 then
    raise exception 'Plus de 24 heures saisies ce jour-là pour cette personne';
  end if;
  insert into public.projet_temps (etablissement_id, projet_id, tache_id, user_id, date_travail, minutes, description, facturable, saisi_par)
  values (p_etablissement_id, pr.id, v_tache, v_user, v_date, v_minutes, nullif(btrim(p ->> 'description'), ''),
    coalesce((p ->> 'facturable')::boolean, true), auth.uid())
  returning id into resultat;
  return resultat;
end
$$;

create function public.annuler_temps_projet(p_temps_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.projet_temps%rowtype;
begin
  select * into t from public.projet_temps where id = p_temps_id for update;
  if t.id is null then
    raise exception 'Temps introuvable';
  end if;
  perform public.exiger_permission(t.etablissement_id, 'projets.contribuer');
  if t.user_id <> auth.uid() and t.saisi_par <> auth.uid() then
    perform public.exiger_permission(t.etablissement_id, 'projets.gerer');
  end if;
  if t.statut = 'annule' then
    raise exception 'Déjà annulé';
  end if;
  if t.document_vente_id is not null and exists (select 1 from public.documents_vente where id = t.document_vente_id and statut <> 'annule') then
    raise exception 'Ce temps est facturé : annulez d''abord la facture';
  end if;
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Le motif d''annulation est obligatoire';
  end if;
  update public.projet_temps set statut = 'annule', annule_le = now(), annule_par = auth.uid(), motif_annulation = btrim(p_motif)
  where id = t.id;
end
$$;

-- Facture brouillon du temps facturable non facturé (une ligne par tâche), au taux du projet ou des paramètres.
create function public.facturer_temps_projet(p_projet_id uuid, p_taux numeric default null, p_jusqu_au date default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pr public.projets%rowtype;
  v_taux numeric;
  v_lignes jsonb;
  v_facture uuid;
  v_fin date;
begin
  select * into pr from public.projets where id = p_projet_id for update;
  if pr.id is null then
    raise exception 'Projet introuvable';
  end if;
  perform public.exiger_permission(pr.etablissement_id, 'projets.gerer');
  perform public.exiger_permission(pr.etablissement_id, 'facturation.gerer');
  if pr.contact_id is null then
    raise exception 'Indiquez le client du projet avant de facturer';
  end if;
  v_fin := coalesce(p_jusqu_au, public.date_locale(pr.etablissement_id));
  v_taux := coalesce(p_taux, pr.taux_horaire, (public.parametre_module(pr.etablissement_id, 'projets', 'taux_horaire') #>> '{}')::numeric, 0);
  if v_taux = 'NaN'::numeric or v_taux <= 0 then
    raise exception 'Indiquez un taux horaire positif';
  end if;
  select jsonb_agg(jsonb_build_object('libelle', x.libelle, 'description', x.detail, 'quantite', x.heures, 'unite', 'h', 'prix_unitaire', v_taux) order by x.libelle)
  into v_lignes
  from (
    select coalesce(t.titre, 'Temps passé sur ' || pr.nom) libelle,
           round(sum(tp.minutes) / 60.0, 2) heures,
           count(*) || ' saisie(s) du ' || to_char(min(tp.date_travail), 'DD/MM/YYYY') || ' au ' || to_char(max(tp.date_travail), 'DD/MM/YYYY') detail
    from public.projet_temps tp left join public.projet_taches t on t.id = tp.tache_id
    where tp.projet_id = pr.id and tp.statut = 'valide' and tp.facturable and tp.document_vente_id is null and tp.date_travail <= v_fin
    group by t.titre
  ) x;
  if v_lignes is null then
    raise exception 'Aucun temps facturable à facturer';
  end if;
  v_facture := public.enregistrer_document_vente(pr.etablissement_id, jsonb_build_object(
    'type', 'facture', 'contact_id', pr.contact_id, 'objet', pr.numero || ' · ' || pr.nom, 'lignes', v_lignes));
  update public.projet_temps set document_vente_id = v_facture
  where projet_id = pr.id and statut = 'valide' and facturable and document_vente_id is null and date_travail <= v_fin;
  return v_facture;
end
$$;

-- Synthèse d'un projet : avancement, heures, budget consommé.
create function public.synthese_projet(p_projet_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pr public.projets%rowtype;
begin
  select * into pr from public.projets where id = p_projet_id;
  if pr.id is null or not public.lecture_autorisee(pr.etablissement_id, 'projets.lire') then
    raise exception 'Projet introuvable';
  end if;
  return (
    with t as (select * from public.projet_taches where projet_id = pr.id and statut <> 'annulee'),
    tp as (select * from public.projet_temps where projet_id = pr.id and statut = 'valide')
    select jsonb_build_object(
      'taches', (select count(*) from t),
      'taches_terminees', (select count(*) from t where statut = 'terminee'),
      'taches_retard', (select count(*) from t where statut <> 'terminee' and echeance < public.date_locale(pr.etablissement_id)),
      'avancement', (select case when count(*) = 0 then 0 else round(100.0 * count(*) filter (where statut = 'terminee') / count(*)) end from t),
      'heures', coalesce((select round(sum(minutes) / 60.0, 2) from tp), 0),
      'heures_facturables_a_facturer', coalesce((select round(sum(minutes) / 60.0, 2) from tp where facturable and document_vente_id is null), 0),
      'heures_facturees', coalesce((select round(sum(minutes) / 60.0, 2) from tp where document_vente_id is not null), 0),
      'heures_estimees', coalesce((select sum(estimation_heures) from t), 0),
      'factures', coalesce((select jsonb_agg(distinct document_vente_id) from tp where document_vente_id is not null), '[]'::jsonb),
      'par_personne', coalesce((select jsonb_agg(jsonb_build_object('user_id', x.user_id, 'nom', x.nom, 'heures', x.h) order by x.h desc)
        from (select tp.user_id, coalesce(pf.nom_complet, split_part(u.email, '@', 1)) nom, round(sum(tp.minutes) / 60.0, 2) h
              from tp join auth.users u on u.id = tp.user_id left join public.profils pf on pf.id = tp.user_id group by 1, 2) x), '[]'::jsonb)
    )
  );
end
$$;

-- Membres qui peuvent recevoir des tâches (noms), sans exposer l'équipe entière.
create function public.projets_membres(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.lecture_autorisee(p_etablissement_id, 'projets.lire') then
    raise exception 'Permission refusée : projets.lire' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', u.id, 'nom', coalesce(nullif(p.nom_complet, ''), split_part(u.email, '@', 1)),
      'moi', u.id = auth.uid()) order by coalesce(p.nom_complet, u.email))
    from auth.users u left join public.profils p on p.id = u.id
    where u.id in (select public.membres_avec_permission(p_etablissement_id, 'projets.contribuer'))
       or u.id in (select responsable_id from public.projets where etablissement_id = p_etablissement_id)
       or u.id in (select assigne_a from public.projet_taches where etablissement_id = p_etablissement_id)
       or u.id in (select user_id from public.projet_temps where etablissement_id = p_etablissement_id)
  ), '[]'::jsonb);
end
$$;

create function public.tableau_de_bord_projets(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  aujourdhui date := public.date_locale(p_etablissement_id);
begin
  if not public.lecture_autorisee(p_etablissement_id, 'projets.lire') then
    raise exception 'Permission refusée : projets.lire' using errcode = '42501';
  end if;
  return (
    with pr as (select * from public.projets where etablissement_id = p_etablissement_id),
    t as (select * from public.projet_taches where etablissement_id = p_etablissement_id and statut not in ('terminee', 'annulee')),
    tp as (select * from public.projet_temps where etablissement_id = p_etablissement_id and statut = 'valide')
    select jsonb_build_object(
      'en_cours', (select count(*) from pr where statut = 'en_cours'),
      'en_retard', (select count(*) from pr where statut in ('en_cours', 'en_pause') and date_fin_prevue < aujourdhui),
      'taches_ouvertes', (select count(*) from t),
      'taches_retard', (select count(*) from t where echeance < aujourdhui),
      'mes_taches', (select count(*) from t where assigne_a = auth.uid()),
      'mes_taches_retard', (select count(*) from t where assigne_a = auth.uid() and echeance < aujourdhui),
      'heures_semaine', coalesce((select round(sum(minutes) / 60.0, 2) from tp where date_travail >= date_trunc('week', aujourdhui)::date), 0),
      'mes_heures_semaine', coalesce((select round(sum(minutes) / 60.0, 2) from tp where user_id = auth.uid() and date_travail >= date_trunc('week', aujourdhui)::date), 0),
      'heures_a_facturer', coalesce((select round(sum(minutes) / 60.0, 2) from tp where facturable and document_vente_id is null), 0)
    )
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Disponibilité, solution « Services et projets », droits d'exécution
-- ---------------------------------------------------------------------------
update public.modules set statut = 'actif', version = '1.0' where id = 'projets';
insert into public.solution_modules (solution_id, module_id, par_defaut) values
  ('commerce', 'projets', false), ('services', 'rh_employes', false), ('services', 'rh_presences', false),
  ('services', 'rh_conges', false), ('services', 'documents', false), ('services', 'depenses', false),
  ('services', 'articles', false), ('services', 'ventes', false), ('services', 'paiements', false), ('services', 'recus', false)
on conflict (solution_id, module_id) do nothing;
update public.solution_modules set par_defaut = true where solution_id = 'services' and module_id in ('contacts', 'crm_pipeline', 'facturation', 'projets', 'articles', 'ventes', 'paiements');
update public.solutions set statut = 'active',
  description = 'Prestataires de services : prospects et opportunités, devis et factures, projets, tâches, temps passé facturé.'
where id = 'services' and statut = 'future';
-- Offre d'essai de la solution (30 jours automatiques), prix à 0 comme les offres Commerce à l'origine :
-- Agence Elite fixe les prix dans son espace avant toute vente (décision commerciale, pas technique).
insert into public.offres (id, solution_id, nom, description, modules, offre_essai, actif, ordre) values
  ('services-complet', 'services', 'Services Complet',
   'Catalogue de prestations, contacts, CRM (prospects, opportunités), devis et factures, paiements, projets, tâches et temps passé.',
   array['articles', 'ventes', 'paiements', 'contacts', 'crm_pipeline', 'facturation', 'projets'], true, true, 10)
on conflict (id) do nothing;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.enregistrer_projet(uuid, jsonb)',
    'public.changer_statut_projet(uuid, text, text)',
    'public.enregistrer_tache_projet(uuid, jsonb)',
    'public.saisir_temps_projet(uuid, jsonb)',
    'public.annuler_temps_projet(uuid, text)',
    'public.facturer_temps_projet(uuid, numeric, date)',
    'public.synthese_projet(uuid)',
    'public.projets_membres(uuid)',
    'public.tableau_de_bord_projets(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
  foreach signature in array array['public.exiger_membre_actif(uuid, uuid, text)', 'public.proteger_temps_projet()'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', signature);
  end loop;
end
$$;
