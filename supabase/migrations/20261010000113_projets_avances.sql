-- Projets avancés (lot C, 2026-10-09). Rien ne change pour un projet qui n'utilise pas ces outils.
--  * Checklists de démarrage et de qualité (modèles réglables ; clôture bloquée si la qualité n'est pas faite, réglage).
--  * Dépendances entre tâches : une tâche ne démarre pas tant que celle dont elle dépend n'est pas terminée.
--  * Livrables versionnés : soumis, validés ou à corriger (une demande de correction crée une tâche).
--  * Journal du projet : décisions à valider, attentes du client, compte rendu de fin.
--  * Devis : demande supplémentaire chiffrée liée au projet ; tâches créées depuis un devis accepté.
--  * Continuité : réaffecter les tâches ouvertes d'une personne ; tâches de personnes absentes signalées.

-- ---------------------------------------------------------------------------
-- 1. Réglages
-- ---------------------------------------------------------------------------
update public.modules set parametres_schema = '[
  {"cle": "taux_horaire", "libelle": "Taux horaire facturé par défaut", "type": "nombre", "defaut": 0},
  {"cle": "saisie_temps_jours", "libelle": "Saisie de temps possible jusqu''à (jours en arrière)", "type": "nombre", "defaut": 31},
  {"cle": "modele_demarrage", "libelle": "Checklist de démarrage proposée (un point par ligne)", "type": "texte", "defaut": ""},
  {"cle": "modele_qualite", "libelle": "Checklist qualité proposée (un point par ligne)", "type": "texte", "defaut": ""},
  {"cle": "qualite_avant_cloture", "libelle": "Refuser de terminer un projet tant que la checklist qualité n''est pas faite", "type": "booleen", "defaut": false}
]'::jsonb where id = 'projets';

-- ---------------------------------------------------------------------------
-- 2. Colonnes et tables
-- ---------------------------------------------------------------------------
alter table public.projets add column devis_origine_id uuid references public.documents_vente(id) on delete restrict;
alter table public.documents_vente add column projet_id uuid;
alter table public.documents_vente add constraint documents_vente_projet_fk
  foreign key (projet_id, etablissement_id) references public.projets(id, etablissement_id) on delete restrict;
create index documents_vente_projet_idx on public.documents_vente(projet_id) where projet_id is not null;

alter table public.projet_taches add column depend_de uuid;
alter table public.projet_taches add constraint projet_taches_dependance_fk
  foreign key (depend_de, etablissement_id) references public.projet_taches(id, etablissement_id) on delete restrict;
alter table public.projet_taches add column ligne_document_id uuid references public.lignes_document_vente(id) on delete restrict;
alter table public.projet_taches add column livrable_id uuid;
create unique index projet_taches_ligne_unique on public.projet_taches(projet_id, ligne_document_id) where ligne_document_id is not null;

create table public.projet_checklist (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  projet_id uuid not null,
  genre text not null check (genre in ('demarrage', 'qualite')),
  libelle text not null check (btrim(libelle) <> '' and length(libelle) <= 200),
  ordre integer not null default 0,
  fait boolean not null default false,
  fait_par uuid references auth.users(id) on delete restrict,
  fait_le timestamptz,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  check (fait = (fait_le is not null)),
  foreign key (projet_id, etablissement_id) references public.projets(id, etablissement_id) on delete restrict
);
create index projet_checklist_projet_idx on public.projet_checklist(projet_id, genre, ordre);

create table public.projet_livrables (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  projet_id uuid not null,
  titre text not null check (btrim(titre) <> '' and length(titre) <= 200),
  description text check (description is null or length(description) <= 2000),
  statut text not null default 'en_preparation' check (statut in ('en_preparation', 'soumis', 'valide', 'a_corriger', 'abandonne')),
  version integer not null default 0 check (version between 0 and 99),
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (id, etablissement_id),
  foreign key (projet_id, etablissement_id) references public.projets(id, etablissement_id) on delete restrict
);
create index projet_livrables_projet_idx on public.projet_livrables(projet_id, statut);
alter table public.projet_taches add constraint projet_taches_livrable_fk
  foreign key (livrable_id, etablissement_id) references public.projet_livrables(id, etablissement_id) on delete restrict;

-- Une ligne par version soumise ; la décision s'y inscrit une seule fois.
create table public.projet_livrable_versions (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  livrable_id uuid not null,
  version integer not null,
  note text check (note is null or length(note) <= 2000),
  soumis_par uuid not null references auth.users(id) on delete restrict,
  soumis_le timestamptz not null default now(),
  decision text check (decision in ('valide', 'a_corriger')),
  decision_note text check (decision_note is null or length(decision_note) <= 2000),
  decide_par uuid references auth.users(id) on delete restrict,
  decide_par_nom text check (decide_par_nom is null or length(decide_par_nom) <= 120),
  decide_le timestamptz,
  unique (livrable_id, version),
  check ((decision is null) = (decide_le is null)),
  foreign key (livrable_id, etablissement_id) references public.projet_livrables(id, etablissement_id) on delete restrict
);

-- Journal : décisions à valider, attentes du client, compte rendu de fin.
create table public.projet_journal (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  projet_id uuid not null,
  genre text not null check (genre in ('decision', 'attente', 'compte_rendu')),
  texte text not null check (btrim(texte) <> '' and length(texte) <= 4000),
  statut text check (statut in ('proposee', 'validee', 'refusee', 'ouverte', 'satisfaite')),
  statue_par uuid references auth.users(id) on delete restrict,
  statue_par_nom text check (statue_par_nom is null or length(statue_par_nom) <= 120),
  statue_le timestamptz,
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  check ((genre = 'decision' and statut in ('proposee', 'validee', 'refusee'))
      or (genre = 'attente' and statut in ('ouverte', 'satisfaite'))
      or (genre = 'compte_rendu' and statut is null)),
  foreign key (projet_id, etablissement_id) references public.projets(id, etablissement_id) on delete restrict
);
create index projet_journal_projet_idx on public.projet_journal(projet_id, genre, cree_le);

do $$
declare
  nom_table text;
begin
  foreach nom_table in array array['projet_checklist', 'projet_livrables', 'projet_livrable_versions', 'projet_journal'] loop
    execute format('create trigger %I_sans_suppression before delete on public.%I for each row execute function public.refuser_suppression()', nom_table, nom_table);
    execute format('create trigger %I_verrou_etablissement before update on public.%I for each row execute function public.verrouiller_etablissement_id()', nom_table, nom_table);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.journaliser_modification()', nom_table, nom_table);
    execute format('alter table public.%I enable row level security', nom_table);
    execute format('create policy lecture on public.%I for select to authenticated using (public.lecture_autorisee(etablissement_id, ''projets.lire''))', nom_table);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', nom_table);
  end loop;
  foreach nom_table in array array['projet_checklist', 'projet_livrables'] loop
    execute format('create trigger %I_modifie_le before update on public.%I for each row execute function public.fixer_modifie_le()', nom_table, nom_table);
  end loop;
end
$$;

-- Version soumise : seule la décision s'ajoute, une fois.
create function public.proteger_version_livrable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.decision is not null
     or (to_jsonb(new) - array['decision', 'decision_note', 'decide_par', 'decide_par_nom', 'decide_le'])
        is distinct from (to_jsonb(old) - array['decision', 'decision_note', 'decide_par', 'decide_par_nom', 'decide_le']) then
    raise exception 'Une version soumise ne se modifie pas';
  end if;
  return new;
end
$$;
create trigger projet_livrable_versions_protection before update on public.projet_livrable_versions
for each row execute function public.proteger_version_livrable();

-- Journal : seul le statut (et qui l'a donné) évolue, une fois.
create function public.proteger_journal_projet()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.statut not in ('proposee', 'ouverte') or old.genre = 'compte_rendu'
     or (to_jsonb(new) - array['statut', 'statue_par', 'statue_par_nom', 'statue_le'])
        is distinct from (to_jsonb(old) - array['statut', 'statue_par', 'statue_par_nom', 'statue_le']) then
    raise exception 'Cette note du projet est définitive';
  end if;
  return new;
end
$$;
create trigger projet_journal_protection before update on public.projet_journal
for each row execute function public.proteger_journal_projet();

-- ---------------------------------------------------------------------------
-- 3. Dépendances entre tâches
-- ---------------------------------------------------------------------------
create function public.controler_dependance_tache()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  amont public.projet_taches%rowtype;
begin
  if new.depend_de is null then
    return new;
  end if;
  select * into amont from public.projet_taches where id = new.depend_de;
  if amont.projet_id <> new.projet_id or amont.id = new.id then
    raise exception 'Une tâche dépend d''une autre tâche du même projet';
  end if;
  if new.statut in ('en_cours', 'en_revue', 'terminee')
     and (tg_op = 'INSERT' or new.statut is distinct from old.statut or new.depend_de is distinct from old.depend_de)
     and amont.statut not in ('terminee', 'annulee') then
    raise exception 'Tâche bloquée : « % » doit d''abord être terminée', amont.titre;
  end if;
  return new;
end
$$;
create trigger projet_taches_dependance before insert or update on public.projet_taches
for each row execute function public.controler_dependance_tache();

create function public.definir_dependance_tache(p_tache_id uuid, p_depend_de uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.projet_taches%rowtype;
  courant uuid := p_depend_de;
  n integer := 0;
begin
  select * into t from public.projet_taches where id = p_tache_id for update;
  if t.id is null then
    raise exception 'Tâche introuvable';
  end if;
  perform public.exiger_permission(t.etablissement_id, 'projets.gerer');
  while courant is not null loop
    if courant = t.id then
      raise exception 'Dépendance circulaire : cette tâche serait bloquée par elle-même';
    end if;
    n := n + 1;
    if n > 100 then
      raise exception 'Chaîne de dépendances trop longue';
    end if;
    select depend_de into courant from public.projet_taches where id = courant;
  end loop;
  update public.projet_taches set depend_de = p_depend_de where id = t.id;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Checklists
-- ---------------------------------------------------------------------------
-- p_libelles : tableau de textes ; vide → points du modèle réglé pour ce genre.
create function public.ajouter_points_checklist(p_projet_id uuid, p_genre text, p_libelles jsonb default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  pr public.projets%rowtype;
  v_libelles text[];
  l text;
  rang integer;
  n integer := 0;
begin
  select * into pr from public.projets where id = p_projet_id;
  if pr.id is null then
    raise exception 'Projet introuvable';
  end if;
  perform public.exiger_permission(pr.etablissement_id, 'projets.gerer');
  if p_genre not in ('demarrage', 'qualite') then
    raise exception 'Checklist inconnue';
  end if;
  if pr.statut in ('termine', 'annule') then
    raise exception 'Projet terminé ou annulé';
  end if;
  if p_libelles is not null and jsonb_typeof(p_libelles) = 'array' and jsonb_array_length(p_libelles) > 0 then
    v_libelles := array(select jsonb_array_elements_text(p_libelles));
  else
    v_libelles := regexp_split_to_array(coalesce(public.parametre_module(pr.etablissement_id, 'projets',
      case p_genre when 'demarrage' then 'modele_demarrage' else 'modele_qualite' end) #>> '{}', ''), E'\\s*\\n\\s*');
  end if;
  select coalesce(max(ordre), 0) into rang from public.projet_checklist where projet_id = pr.id and genre = p_genre;
  foreach l in array v_libelles loop
    l := btrim(l);
    continue when l = '' or exists (select 1 from public.projet_checklist where projet_id = pr.id and genre = p_genre and actif and lower(libelle) = lower(left(l, 200)));
    rang := rang + 1;
    n := n + 1;
    if n > 50 then
      raise exception 'Pas plus de 50 points à la fois';
    end if;
    insert into public.projet_checklist (etablissement_id, projet_id, genre, libelle, ordre)
    values (pr.etablissement_id, pr.id, p_genre, left(l, 200), rang);
  end loop;
  return n;
end
$$;

create function public.cocher_point_checklist(p_point_id uuid, p_fait boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.projet_checklist%rowtype;
begin
  select * into c from public.projet_checklist where id = p_point_id for update;
  if c.id is null then
    raise exception 'Point introuvable';
  end if;
  perform public.exiger_permission(c.etablissement_id, 'projets.contribuer');
  if not c.actif then
    raise exception 'Point retiré';
  end if;
  update public.projet_checklist set fait = coalesce(p_fait, false),
    fait_par = case when p_fait then auth.uid() end, fait_le = case when p_fait then now() end
  where id = c.id;
end
$$;

create function public.retirer_point_checklist(p_point_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.projet_checklist%rowtype;
begin
  select * into c from public.projet_checklist where id = p_point_id for update;
  if c.id is null then
    raise exception 'Point introuvable';
  end if;
  perform public.exiger_permission(c.etablissement_id, 'projets.gerer');
  update public.projet_checklist set actif = false where id = c.id;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Livrables
-- ---------------------------------------------------------------------------
create function public.enregistrer_livrable(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p ->> 'id', '')::uuid;
  existant public.projet_livrables%rowtype;
  pr public.projets%rowtype;
begin
  perform public.exiger_permission(p_etablissement_id, 'projets.contribuer');
  if coalesce(btrim(p ->> 'titre'), '') = '' then
    raise exception 'Le titre du livrable est obligatoire';
  end if;
  if resultat is not null then
    select * into existant from public.projet_livrables where id = resultat and etablissement_id = p_etablissement_id for update;
    if existant.id is null then
      raise exception 'Livrable introuvable';
    end if;
    if existant.statut in ('valide', 'abandonne') then
      raise exception 'Ce livrable est clos';
    end if;
  end if;
  select * into pr from public.projets where id = coalesce(existant.projet_id, nullif(p ->> 'projet_id', '')::uuid) and etablissement_id = p_etablissement_id;
  if pr.id is null then
    raise exception 'Projet introuvable dans cet établissement';
  end if;
  if pr.statut in ('termine', 'annule') then
    raise exception 'Projet terminé ou annulé';
  end if;
  if resultat is null then
    insert into public.projet_livrables (etablissement_id, projet_id, titre, description, cree_par)
    values (p_etablissement_id, pr.id, left(btrim(p ->> 'titre'), 200), nullif(btrim(p ->> 'description'), ''), auth.uid())
    returning id into resultat;
  else
    update public.projet_livrables set titre = left(btrim(p ->> 'titre'), 200), description = nullif(btrim(p ->> 'description'), '')
    where id = resultat;
  end if;
  return resultat;
end
$$;

create function public.soumettre_livrable(p_livrable_id uuid, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.projet_livrables%rowtype;
begin
  select * into l from public.projet_livrables where id = p_livrable_id for update;
  if l.id is null then
    raise exception 'Livrable introuvable';
  end if;
  perform public.exiger_permission(l.etablissement_id, 'projets.contribuer');
  if l.statut not in ('en_preparation', 'a_corriger') then
    raise exception 'Ce livrable attend déjà une décision ou est clos';
  end if;
  if l.version >= 99 then
    raise exception 'Trop de versions pour ce livrable';
  end if;
  insert into public.projet_livrable_versions (etablissement_id, livrable_id, version, note, soumis_par)
  values (l.etablissement_id, l.id, l.version + 1, nullif(btrim(p_note), ''), auth.uid());
  update public.projet_livrables set statut = 'soumis', version = l.version + 1 where id = l.id;
  return l.version + 1;
end
$$;

-- Décision sur la version soumise : validée, ou à corriger (note obligatoire, tâche de correction créée).
create function public.decider_livrable(p_livrable_id uuid, p_decision text, p_note text default null, p_par_nom text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.projet_livrables%rowtype;
  pr public.projets%rowtype;
  v_tache uuid;
begin
  select * into l from public.projet_livrables where id = p_livrable_id for update;
  if l.id is null then
    raise exception 'Livrable introuvable';
  end if;
  perform public.exiger_permission(l.etablissement_id, 'projets.gerer');
  if l.statut <> 'soumis' then
    raise exception 'Seul un livrable soumis reçoit une décision';
  end if;
  if p_decision not in ('valide', 'a_corriger') then
    raise exception 'Décision inconnue';
  end if;
  if p_decision = 'a_corriger' and coalesce(btrim(p_note), '') = '' then
    raise exception 'Dites ce qu''il faut corriger';
  end if;
  update public.projet_livrable_versions set decision = p_decision, decision_note = nullif(btrim(p_note), ''),
    decide_par = auth.uid(), decide_par_nom = left(nullif(btrim(p_par_nom), ''), 120), decide_le = now()
  where livrable_id = l.id and version = l.version;
  update public.projet_livrables set statut = p_decision where id = l.id;
  if p_decision = 'a_corriger' then
    select * into pr from public.projets where id = l.projet_id;
    insert into public.projet_taches (etablissement_id, projet_id, titre, description, priorite, assigne_a, ordre, livrable_id, cree_par)
    values (l.etablissement_id, l.projet_id, left(format('Correction : %s (V%s)', l.titre, l.version), 200), left(btrim(p_note), 4000), 'haute',
            pr.responsable_id, coalesce((select max(ordre) + 1 from public.projet_taches where projet_id = l.projet_id), 1), l.id, auth.uid())
    returning id into v_tache;
    if pr.responsable_id <> auth.uid() then
      perform public.notifier(pr.responsable_id, l.etablissement_id, 'projets.correction', 'Correction demandée : ' || l.titre,
        pr.numero || ' · ' || pr.nom, 'projets/' || pr.id);
    end if;
  end if;
  return v_tache;
end
$$;

create function public.abandonner_livrable(p_livrable_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.projet_livrables%rowtype;
begin
  select * into l from public.projet_livrables where id = p_livrable_id for update;
  if l.id is null then
    raise exception 'Livrable introuvable';
  end if;
  perform public.exiger_permission(l.etablissement_id, 'projets.gerer');
  if l.statut = 'valide' then
    raise exception 'Un livrable validé reste validé';
  end if;
  update public.projet_livrables set statut = 'abandonne' where id = l.id;
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Journal : décisions, attentes, compte rendu
-- ---------------------------------------------------------------------------
create function public.noter_projet(p_projet_id uuid, p_genre text, p_texte text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pr public.projets%rowtype;
  resultat uuid;
begin
  select * into pr from public.projets where id = p_projet_id;
  if pr.id is null then
    raise exception 'Projet introuvable';
  end if;
  perform public.exiger_permission(pr.etablissement_id, case when p_genre = 'compte_rendu' then 'projets.gerer' else 'projets.contribuer' end);
  if p_genre not in ('decision', 'attente', 'compte_rendu') then
    raise exception 'Type de note inconnu';
  end if;
  if coalesce(btrim(p_texte), '') = '' then
    raise exception 'Le texte est obligatoire';
  end if;
  insert into public.projet_journal (etablissement_id, projet_id, genre, texte, statut, cree_par)
  values (pr.etablissement_id, pr.id, p_genre, left(btrim(p_texte), 4000),
          case p_genre when 'decision' then 'proposee' when 'attente' then 'ouverte' end, auth.uid())
  returning id into resultat;
  return resultat;
end
$$;

-- Décision validée ou refusée (par qui, côté client si besoin) ; attente satisfaite.
create function public.statuer_note_projet(p_note_id uuid, p_statut text, p_par_nom text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n public.projet_journal%rowtype;
begin
  select * into n from public.projet_journal where id = p_note_id for update;
  if n.id is null then
    raise exception 'Note introuvable';
  end if;
  perform public.exiger_permission(n.etablissement_id, 'projets.gerer');
  if not ((n.genre = 'decision' and n.statut = 'proposee' and p_statut in ('validee', 'refusee'))
       or (n.genre = 'attente' and n.statut = 'ouverte' and p_statut = 'satisfaite')) then
    raise exception 'Passage impossible';
  end if;
  update public.projet_journal set statut = p_statut, statue_par = auth.uid(), statue_par_nom = left(nullif(btrim(p_par_nom), ''), 120), statue_le = now()
  where id = n.id;
end
$$;

-- Terminer (compte rendu facultatif dans p_motif ; checklist qualité exigée si réglé), annuler (motif) ou rouvrir.
create or replace function public.changer_statut_projet(p_projet_id uuid, p_statut text, p_motif text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pr public.projets%rowtype;
  restants integer;
begin
  select * into pr from public.projets where id = p_projet_id for update;
  if pr.id is null then
    raise exception 'Projet introuvable';
  end if;
  perform public.exiger_permission(pr.etablissement_id, 'projets.gerer');
  if p_statut = 'termine' and pr.statut in ('a_venir', 'en_cours', 'en_pause') then
    if coalesce((public.parametre_module(pr.etablissement_id, 'projets', 'qualite_avant_cloture') #>> '{}')::boolean, false) then
      select count(*) into restants from public.projet_checklist where projet_id = pr.id and genre = 'qualite' and actif and not fait;
      if restants > 0 then
        raise exception 'Checklist qualité incomplète : % point(s) restant(s)', restants;
      end if;
    end if;
    update public.projets set statut = 'termine', termine_le = now() where id = pr.id;
    if coalesce(btrim(p_motif), '') <> '' then
      insert into public.projet_journal (etablissement_id, projet_id, genre, texte, cree_par)
      values (pr.etablissement_id, pr.id, 'compte_rendu', left(btrim(p_motif), 4000), auth.uid());
    end if;
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

-- ---------------------------------------------------------------------------
-- 7. Devis et projet
-- ---------------------------------------------------------------------------
-- Demande supplémentaire : devis brouillon pour le client du projet, lié au projet, à compléter dans l'éditeur.
create function public.demande_supplementaire_projet(p_projet_id uuid, p_objet text, p_detail text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pr public.projets%rowtype;
  resultat uuid;
begin
  select * into pr from public.projets where id = p_projet_id;
  if pr.id is null then
    raise exception 'Projet introuvable';
  end if;
  perform public.exiger_permission(pr.etablissement_id, 'projets.gerer');
  if pr.contact_id is null then
    raise exception 'Le projet n''a pas de client : choisissez-en un d''abord';
  end if;
  if coalesce(btrim(p_objet), '') = '' then
    raise exception 'Décrivez la demande';
  end if;
  resultat := public.enregistrer_document_vente(pr.etablissement_id, jsonb_build_object(
    'type', 'devis', 'contact_id', pr.contact_id, 'objet', left('Supplément ' || pr.numero || ' : ' || btrim(p_objet), 200),
    'lignes', jsonb_build_array(jsonb_build_object('libelle', left(btrim(p_objet), 200), 'description', nullif(btrim(p_detail), ''),
      'quantite', 1, 'prix_unitaire', 0))));
  update public.documents_vente set projet_id = pr.id where id = resultat;
  return resultat;
end
$$;

-- Tâches depuis un devis accepté ou facturé : une tâche par ligne comptée (une seule fois par ligne). Projet : celui
-- du devis (demande supplémentaire), celui déjà créé depuis ce devis, sinon un nouveau projet pour le client.
create function public.taches_depuis_devis(p_document_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.documents_vente%rowtype;
  v_projet uuid;
  l record;
  rang integer;
begin
  select * into doc from public.documents_vente where id = p_document_id;
  if doc.id is null or doc.type <> 'devis' or not public.lecture_autorisee(doc.etablissement_id, 'facturation.lire')
     or not public.lecture_hub(doc.etablissement_id, doc.hub_id) then
    raise exception 'Devis introuvable';
  end if;
  perform public.exiger_permission(doc.etablissement_id, 'projets.gerer');
  if doc.statut not in ('accepte', 'converti') then
    raise exception 'Seul un devis accepté ou facturé crée des tâches';
  end if;
  v_projet := coalesce(doc.projet_id, (select id from public.projets where devis_origine_id = doc.id and statut not in ('annule') order by cree_le limit 1));
  if v_projet is null then
    v_projet := public.enregistrer_projet(doc.etablissement_id, jsonb_build_object(
      'nom', left(coalesce(doc.objet, 'Devis ' || doc.numero), 160), 'contact_id', doc.contact_id, 'budget', doc.total_ht));
    update public.projets set devis_origine_id = doc.id where id = v_projet;
  elsif exists (select 1 from public.projets where id = v_projet and statut in ('termine', 'annule')) then
    raise exception 'Le projet lié est terminé ou annulé : rouvrez-le';
  end if;
  select coalesce(max(ordre), 0) into rang from public.projet_taches where projet_id = v_projet;
  for l in
    select * from public.lignes_document_vente
    where document_id = doc.id and (not optionnelle or retenue)
      and id not in (select ligne_document_id from public.projet_taches where projet_id = v_projet and ligne_document_id is not null)
    order by ordre
  loop
    rang := rang + 1;
    insert into public.projet_taches (etablissement_id, projet_id, titre, description, ordre, ligne_document_id, cree_par)
    values (doc.etablissement_id, v_projet, left(l.libelle, 200), l.description, rang, l.id, auth.uid());
  end loop;
  return v_projet;
end
$$;

-- ---------------------------------------------------------------------------
-- 8. Continuité
-- ---------------------------------------------------------------------------
-- Réaffecte les tâches ouvertes d'une personne (tout l'établissement ou un projet) ; la nouvelle personne est prévenue.
create function public.reaffecter_taches(p_etablissement_id uuid, p_de uuid, p_a uuid, p_projet_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform public.exiger_permission(p_etablissement_id, 'projets.gerer');
  if p_de is null or p_a is null or p_de = p_a then
    raise exception 'Choisissez deux personnes différentes';
  end if;
  perform public.exiger_membre_actif(p_etablissement_id, p_a, 'La personne qui reprend');
  update public.projet_taches t set assigne_a = p_a
  where t.etablissement_id = p_etablissement_id and t.assigne_a = p_de and t.statut not in ('terminee', 'annulee')
    and (p_projet_id is null or t.projet_id = p_projet_id)
    and exists (select 1 from public.projets pr where pr.id = t.projet_id and pr.statut not in ('termine', 'annule'));
  get diagnostics n = row_count;
  if n > 0 and p_a <> auth.uid() then
    perform public.notifier(p_a, p_etablissement_id, 'projets.tache', format('%s tâche(s) reprise(s)', n),
      'Tâches réaffectées pour assurer la continuité', 'projets');
  end if;
  return n;
end
$$;

-- Personnes absentes aujourd'hui (absence RH approuvée) qui ont des tâches ouvertes.
create function public.projets_absents(p_etablissement_id uuid)
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
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', x.user_id, 'jusqu_au', x.fin, 'taches', x.n) order by x.n desc)
    from (
      select e.user_id, max(a.fin) fin,
             (select count(*) from public.projet_taches t where t.etablissement_id = p_etablissement_id and t.assigne_a = e.user_id
                and t.statut not in ('terminee', 'annulee')) n
      from public.rh_absences a join public.rh_employes e on e.id = a.employe_id
      where a.etablissement_id = p_etablissement_id and a.statut = 'approuvee' and aujourdhui between a.debut and a.fin and e.user_id is not null
      group by e.user_id
    ) x where x.n > 0
  ), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------------------
-- 9. Synthèse et tableaux de bord
-- ---------------------------------------------------------------------------
create or replace function public.synthese_projet(p_projet_id uuid)
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
    tp as (select * from public.projet_temps where projet_id = pr.id and statut = 'valide'),
    ck as (select * from public.projet_checklist where projet_id = pr.id and actif)
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
              from tp join auth.users u on u.id = tp.user_id left join public.profils pf on pf.id = tp.user_id group by 1, 2) x), '[]'::jsonb),
      'corrections_restantes', (select count(*) from t where livrable_id is not null and statut <> 'terminee'),
      'taches_bloquees', (select count(*) from t join public.projet_taches a on a.id = t.depend_de
                          where t.statut = 'a_faire' and a.statut not in ('terminee', 'annulee')),
      'demarrage_faits', (select count(*) from ck where genre = 'demarrage' and fait),
      'demarrage_total', (select count(*) from ck where genre = 'demarrage'),
      'qualite_faits', (select count(*) from ck where genre = 'qualite' and fait),
      'qualite_total', (select count(*) from ck where genre = 'qualite'),
      'livrables_soumis', (select count(*) from public.projet_livrables where projet_id = pr.id and statut = 'soumis'),
      'livrables_valides', (select count(*) from public.projet_livrables where projet_id = pr.id and statut = 'valide'),
      'decisions_attente', (select count(*) from public.projet_journal where projet_id = pr.id and genre = 'decision' and statut = 'proposee'),
      'attentes_ouvertes', (select count(*) from public.projet_journal where projet_id = pr.id and genre = 'attente' and statut = 'ouverte')
    )
  );
end
$$;

create or replace function public.tableau_de_bord_projets(p_etablissement_id uuid)
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
      'heures_a_facturer', coalesce((select round(sum(minutes) / 60.0, 2) from tp where facturable and document_vente_id is null), 0),
      'corrections_restantes', (select count(*) from t where livrable_id is not null),
      'livrables_soumis', (select count(*) from public.projet_livrables l join pr on pr.id = l.projet_id
                           where l.statut = 'soumis' and pr.statut not in ('termine', 'annule')),
      'decisions_attente', (select count(*) from public.projet_journal j join pr on pr.id = j.projet_id
                            where j.genre = 'decision' and j.statut = 'proposee' and pr.statut not in ('termine', 'annule')),
      'taches_absents', coalesce((select sum((x ->> 'taches')::int) from jsonb_array_elements(public.projets_absents(p_etablissement_id)) x), 0)
    )
  );
end
$$;

create or replace function public.cockpit_projets(p_etablissement_id uuid, p_du date, p_au date, p_filtres jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  c public.cockpit_ctx;
  s jsonb;
  v_minutes bigint; v_minutes_p bigint; v_fact_minutes bigint; v_premier date; v_nb_p bigint; v_comp boolean; v_terminees bigint;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'projets.lire') then
    raise exception 'Permission refusée : projets.lire' using errcode = '42501';
  end if;
  c := public.cockpit_preparer(p_etablissement_id, p_du, p_au, p_filtres);
  s := public.tableau_de_bord_projets(p_etablissement_id);
  select coalesce(sum(t.minutes) filter (where t.date_travail between c.du and c.au), 0),
         coalesce(sum(t.minutes) filter (where t.date_travail between c.pdu and c.pau), 0),
         coalesce(sum(t.minutes) filter (where t.date_travail between c.du and c.au and t.facturable), 0),
         count(*) filter (where t.date_travail between c.pdu and c.pau), min(t.date_travail)
  into v_minutes, v_minutes_p, v_fact_minutes, v_nb_p, v_premier
  from public.projet_temps t where t.etablissement_id = p_etablissement_id and t.statut = 'valide' and (c.vendeur is null or t.user_id = c.vendeur);
  v_comp := public.cockpit_comparable(v_nb_p, v_premier, c.pdu);
  select count(*) into v_terminees from public.projet_taches t
  where t.etablissement_id = p_etablissement_id and t.statut = 'terminee' and (t.terminee_le at time zone c.tz)::date between c.du and c.au;
  return jsonb_build_object(
    'domaine', 'projets',
    'periode', jsonb_build_object('du', c.du, 'au', c.au, 'du_precedent', c.pdu, 'au_precedent', c.pau, 'comparable', v_comp),
    'kpis', public.cockpit_liste(array[
      public.cockpit_kpi('en_cours', 'Projets en cours', (s ->> 'en_cours')::numeric, 'nombre', 'projets?statut=en_cours', null,
        case when (s ->> 'en_retard')::int > 0 then format('%s en retard', s ->> 'en_retard') end, case when (s ->> 'en_retard')::int > 0 then 'attention' end, true),
      public.cockpit_kpi('heures', 'Heures saisies', round(v_minutes / 60.0, 1), 'heures', 'projets?vue=temps', case when v_comp then round(v_minutes_p / 60.0, 1) end,
        format('%s h facturables', round(v_fact_minutes / 60.0, 1)), null, true),
      public.cockpit_kpi('a_facturer', 'Heures à facturer', (s ->> 'heures_a_facturer')::numeric, 'heures', 'projets?vue=temps', null, 'Facturables, pas encore facturées'),
      public.cockpit_kpi('taches_ouvertes', 'Tâches ouvertes', (s ->> 'taches_ouvertes')::numeric, 'nombre', 'projets?vue=taches', null, format('%s terminée(s) sur la période', v_terminees)),
      public.cockpit_kpi('taches_retard', 'Tâches en retard', (s ->> 'taches_retard')::numeric, 'nombre', 'projets?vue=taches', null, null, case when (s ->> 'taches_retard')::int > 0 then 'alerte' end),
      public.cockpit_kpi('mes_taches', 'Mes tâches', (s ->> 'mes_taches')::numeric, 'nombre', 'projets?vue=taches'),
      public.cockpit_kpi('corrections', 'Corrections restantes', (s ->> 'corrections_restantes')::numeric, 'nombre', 'projets?vue=taches', null, 'Demandées sur des livrables')
    ]),
    'attention', public.cockpit_liste(array[
      public.cockpit_alerte('projets_retard', 'alerte', 'Projets en retard', 'Date de fin prévue dépassée', (s ->> 'en_retard')::numeric, 'projets?statut=en_cours'),
      public.cockpit_alerte('taches_retard', 'alerte', 'Tâches en retard', null, (s ->> 'taches_retard')::numeric, 'projets?vue=taches'),
      public.cockpit_alerte('absents', 'alerte', 'Tâches de personnes absentes', 'À réaffecter', (s ->> 'taches_absents')::numeric, 'projets'),
      public.cockpit_alerte('livrables', 'info', 'Livrables en attente de décision', null, (s ->> 'livrables_soumis')::numeric, 'projets'),
      public.cockpit_alerte('decisions', 'info', 'Décisions à valider', null, (s ->> 'decisions_attente')::numeric, 'projets'),
      public.cockpit_alerte('a_facturer', 'info', 'Temps facturable non facturé', format('%s h', s ->> 'heures_a_facturer'), (s ->> 'heures_a_facturer')::numeric, 'projets?vue=temps')
    ]),
    'graphiques', '[]'::jsonb,
    'listes', public.cockpit_liste(array[
      (select case when count(*) > 0 then jsonb_build_object('cle', 'temps_projet', 'titre', 'Temps par projet', 'route', 'projets',
        'lignes', jsonb_agg(jsonb_build_object('libelle', nom, 'detail', format('%s h', round(m / 60.0, 1)), 'route', 'projets/' || id) order by m desc)) end
       from (select p.id, p.nom, sum(t.minutes) m from public.projet_temps t join public.projets p on p.id = t.projet_id
             where t.etablissement_id = p_etablissement_id and t.statut = 'valide' and t.date_travail between c.du and c.au
             group by p.id, p.nom order by 3 desc limit 5) t)
    ]),
    'activite', '[]'::jsonb
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 10. Droits d'exécution
-- ---------------------------------------------------------------------------
do $$
declare signature text;
begin
  foreach signature in array array[
    'public.definir_dependance_tache(uuid, uuid)', 'public.ajouter_points_checklist(uuid, text, jsonb)',
    'public.cocher_point_checklist(uuid, boolean)', 'public.retirer_point_checklist(uuid)',
    'public.enregistrer_livrable(uuid, jsonb)', 'public.soumettre_livrable(uuid, text)', 'public.decider_livrable(uuid, text, text, text)',
    'public.abandonner_livrable(uuid)', 'public.noter_projet(uuid, text, text)', 'public.statuer_note_projet(uuid, text, text)',
    'public.changer_statut_projet(uuid, text, text)', 'public.demande_supplementaire_projet(uuid, text, text)',
    'public.taches_depuis_devis(uuid)', 'public.reaffecter_taches(uuid, uuid, uuid, uuid)', 'public.projets_absents(uuid)',
    'public.synthese_projet(uuid)', 'public.tableau_de_bord_projets(uuid)', 'public.cockpit_projets(uuid, date, date, jsonb)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
  foreach signature in array array[
    'public.controler_dependance_tache()', 'public.proteger_version_livrable()', 'public.proteger_journal_projet()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', signature);
  end loop;
end
$$;

notify pgrst, 'reload schema';
