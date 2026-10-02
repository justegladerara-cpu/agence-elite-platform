-- Socle transversal (2026-10-02, mission « tout le travail restant ») :
-- briques communes réutilisées par tous les modules métier, jamais dupliquées.
--   1. Rôles : identifiants libres (format contrôlé) et rôles proposés selon les modules actifs.
--   2. Lecture d'un paramètre de module.
--   3. Notifications internes (cloche) : écrites seulement par les fonctions de la plateforme.
--   4. Pièces jointes : fichier stocké à part, métadonnées lisibles selon le droit du type d'objet.
--   5. Module « Documents » : bibliothèque de dossiers et de fichiers de l'établissement.
-- Aucune donnée existante n'est modifiée.

-- ---------------------------------------------------------------------------
-- 1. Rôles
-- ---------------------------------------------------------------------------
alter table public.roles drop constraint if exists roles_id_check;
alter table public.roles add constraint roles_id_check check (id ~ '^[a-z][a-z_]{1,39}$');
-- Rôle « métier » : proposé seulement si l'un de ces modules est actif (vide = toujours proposé).
alter table public.roles add column if not exists modules_requis text[] not null default '{}';
update public.roles set nom = 'Caissier', description = 'Vend et encaisse à sa caisse' where id = 'employe';

-- ---------------------------------------------------------------------------
-- 2. Paramètre d'un module (valeur de etablissement_parametres, sinon défaut du schéma, sinon p_defaut)
-- ---------------------------------------------------------------------------
create function public.parametre_module(p_etablissement_id uuid, p_module_id text, p_cle text, p_defaut jsonb default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select ep.data -> p_cle from public.etablissement_parametres ep
     where ep.etablissement_id = p_etablissement_id and ep.module_id = p_module_id),
    (select d -> 'defaut' from public.modules m, jsonb_array_elements(m.parametres_schema) d
     where m.id = p_module_id and d ->> 'cle' = p_cle),
    p_defaut
  )
$$;

-- ---------------------------------------------------------------------------
-- 3. Notifications
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  etablissement_id uuid references public.etablissements(id) on delete restrict,
  type text not null check (type ~ '^[a-z][a-z0-9_.]*$'),
  titre text not null check (length(btrim(titre)) between 1 and 160),
  texte text check (texte is null or length(texte) <= 600),
  lien text check (lien is null or lien ~ '^[a-z0-9_/-]{1,120}$'),
  lue_le timestamptz,
  cree_le timestamptz not null default now()
);
create index notifications_user_cree_le_idx on public.notifications(user_id, cree_le desc);
create index notifications_non_lues_idx on public.notifications(user_id) where lue_le is null;
create index notifications_etablissement_id_idx on public.notifications(etablissement_id);
alter table public.notifications enable row level security;
create policy lecture on public.notifications for select to authenticated using (user_id = auth.uid());
create trigger notifications_sans_suppression before delete on public.notifications
for each row execute function public.refuser_suppression();

-- Seule la date de lecture change.
create function public.proteger_notification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'lue_le') is distinct from (to_jsonb(old) - 'lue_le') then
    raise exception 'Une notification ne peut pas être modifiée';
  end if;
  return new;
end
$$;
create trigger notifications_protection before update on public.notifications
for each row execute function public.proteger_notification();

-- Membres actifs d'un établissement qui ont une permission (même règle que a_permission).
create function public.membres_avec_permission(p_etablissement_id uuid, p_permission_id text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select em.user_id
  from public.etablissement_membres em
  join public.permissions p on p.id = p_permission_id
  where em.etablissement_id = p_etablissement_id
    and em.actif
    and public.module_actif(p_etablissement_id, p.module_id)
    and coalesce(
      (em.permissions_ajustees ->> p_permission_id)::boolean,
      exists (select 1 from public.role_permissions rp where rp.role_id = em.role_id and rp.permission_id = p_permission_id)
    )
$$;

create function public.notifier(p_user_id uuid, p_etablissement_id uuid, p_type text, p_titre text, p_texte text default null, p_lien text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    return;
  end if;
  insert into public.notifications (user_id, etablissement_id, type, titre, texte, lien)
  values (p_user_id, p_etablissement_id, p_type, left(btrim(p_titre), 160), left(nullif(btrim(p_texte), ''), 600), p_lien);
end
$$;

-- Prévient chaque membre qui a la permission (sauf l'auteur de l'action).
create function public.notifier_permission(p_etablissement_id uuid, p_permission_id text, p_type text, p_titre text,
  p_texte text default null, p_lien text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  destinataire uuid;
begin
  for destinataire in select * from public.membres_avec_permission(p_etablissement_id, p_permission_id) loop
    if destinataire is distinct from auth.uid() then
      perform public.notifier(destinataire, p_etablissement_id, p_type, p_titre, p_texte, p_lien);
    end if;
  end loop;
end
$$;

create function public.mes_notifications(p_limite integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'non_lues', (select count(*) from public.notifications where user_id = auth.uid() and lue_le is null),
    'liste', coalesce((
      select jsonb_agg(to_jsonb(n) order by n.cree_le desc)
      from (
        select n.id, n.etablissement_id, n.type, n.titre, n.texte, n.lien, n.lue_le, n.cree_le
        from public.notifications n
        where n.user_id = auth.uid()
        order by n.cree_le desc
        limit least(greatest(coalesce(p_limite, 30), 1), 100)
      ) n
    ), '[]'::jsonb)
  )
$$;

create function public.marquer_notifications_lues(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  nombre integer;
begin
  if auth.uid() is null then
    raise exception 'Une authentification est requise';
  end if;
  update public.notifications set lue_le = now()
  where user_id = auth.uid() and lue_le is null and (p_ids is null or id = any (p_ids));
  get diagnostics nombre = row_count;
  return nombre;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Pièces jointes
-- ---------------------------------------------------------------------------
-- Types d'objets auxquels on peut joindre un fichier, et droits correspondants.
-- Ajouter un type = une ligne ici (dans la migration du module), jamais une nouvelle table de fichiers.
create table public.types_pieces_jointes (
  objet_type text primary key check (objet_type ~ '^[a-z][a-z0-9_]*$'),
  table_nom text not null check (table_nom ~ '^[a-z][a-z0-9_]*$'),
  module_id text not null references public.modules(id) on delete restrict,
  permission_lire text not null references public.permissions(id) on delete restrict,
  permission_ecrire text not null references public.permissions(id) on delete restrict,
  libelle text not null
);
alter table public.types_pieces_jointes enable row level security;
create policy lecture on public.types_pieces_jointes for select to authenticated using (true);

-- Contenu (data URL), jamais lu directement : seulement via lire_piece_jointe().
create table public.fichiers (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  contenu text not null check (
    length(contenu) <= 4200000
    and contenu ~ '^data:(image/(png|jpeg|gif|webp)|application/pdf|text/(plain|csv)|application/msword|application/vnd\.ms-excel|application/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation));base64,[A-Za-z0-9+/=]+$'
  ),
  cree_le timestamptz not null default now()
);
create index fichiers_etablissement_id_idx on public.fichiers(etablissement_id);
alter table public.fichiers enable row level security;
create trigger fichiers_immuables before update on public.fichiers
for each row execute function public.refuser_modification();
create trigger fichiers_sans_suppression before delete on public.fichiers
for each row execute function public.refuser_suppression();

create table public.pieces_jointes (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  objet_type text not null references public.types_pieces_jointes(objet_type) on delete restrict,
  objet_id uuid not null,
  nom text not null check (length(btrim(nom)) between 1 and 160 and nom !~ '[<>/\\]'),
  type_mime text not null,
  taille integer not null check (taille > 0),
  categorie text check (categorie is null or length(categorie) <= 60),
  confidentiel boolean not null default false,
  fichier_id uuid not null unique references public.fichiers(id) on delete restrict,
  ajoute_par uuid not null references auth.users(id) on delete restrict,
  ajoute_le timestamptz not null default now(),
  statut text not null default 'active' check (statut in ('active', 'archivee')),
  archivee_le timestamptz,
  archivee_par uuid references auth.users(id) on delete restrict,
  motif_archivage text,
  check (statut = 'active' or (archivee_le is not null and archivee_par is not null and btrim(coalesce(motif_archivage, '')) <> ''))
);
create index pieces_jointes_objet_idx on public.pieces_jointes(objet_type, objet_id);
create index pieces_jointes_etablissement_id_idx on public.pieces_jointes(etablissement_id, ajoute_le desc);
alter table public.pieces_jointes enable row level security;
create trigger pieces_jointes_verrou_etablissement before update on public.pieces_jointes
for each row execute function public.verrouiller_etablissement_id();
create trigger pieces_jointes_sans_suppression before delete on public.pieces_jointes
for each row execute function public.refuser_suppression();
create trigger pieces_jointes_audit after insert or update or delete on public.pieces_jointes
for each row execute function public.journaliser_modification();

-- Seul l'archivage (avec motif) modifie une pièce jointe.
create function public.proteger_piece_jointe()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.statut <> 'active' then
    raise exception 'Une pièce archivée est définitive';
  end if;
  if (to_jsonb(new) - array['statut', 'archivee_le', 'archivee_par', 'motif_archivage'])
     is distinct from (to_jsonb(old) - array['statut', 'archivee_le', 'archivee_par', 'motif_archivage']) then
    raise exception 'Une pièce jointe ne se modifie pas : archivez-la et ajoutez la nouvelle version';
  end if;
  return new;
end
$$;
create trigger pieces_jointes_protection before update on public.pieces_jointes
for each row execute function public.proteger_piece_jointe();

-- Propriétaire d'un objet (accès personnel, ex. un employé à son propre dossier). Étendu par les modules.
create function public.proprietaire_objet(p_objet_type text, p_objet_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return false;
end
$$;

-- Lecture d'une pièce : droit de lecture du type (confidentiel : droit d'écriture),
-- ou propriétaire de l'objet pour une pièce non confidentielle.
create function public.piece_lisible(p_etablissement_id uuid, p_objet_type text, p_objet_id uuid, p_confidentiel boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.types_pieces_jointes t
    where t.objet_type = p_objet_type
      and (
        public.lecture_autorisee(p_etablissement_id, case when p_confidentiel then t.permission_ecrire else t.permission_lire end)
        or (not p_confidentiel and public.module_actif(p_etablissement_id, t.module_id) and public.proprietaire_objet(p_objet_type, p_objet_id))
      )
  )
$$;
create policy lecture on public.pieces_jointes for select to authenticated
using (statut = 'active' and public.piece_lisible(etablissement_id, objet_type, objet_id, confidentiel)
  or statut = 'archivee' and public.piece_lisible(etablissement_id, objet_type, objet_id, true));

-- L'objet existe-t-il dans cet établissement ? (table_nom vient de types_pieces_jointes, jamais de l'appelant)
create function public.objet_existe(p_objet_type text, p_objet_id uuid, p_etablissement_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  nom_table text;
  resultat boolean;
begin
  select table_nom into nom_table from public.types_pieces_jointes where objet_type = p_objet_type;
  if nom_table is null then
    return false;
  end if;
  execute format('select exists (select 1 from public.%I where id = $1 and etablissement_id = $2)', nom_table)
  into resultat using p_objet_id, p_etablissement_id;
  return resultat;
end
$$;

create function public.ajouter_piece_jointe(p_etablissement_id uuid, p_piece jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  type_objet public.types_pieces_jointes%rowtype;
  objet uuid := nullif(p_piece ->> 'objet_id', '')::uuid;
  v_contenu text := p_piece ->> 'contenu';
  mime text;
  fichier uuid;
  resultat uuid;
  proprietaire boolean;
begin
  select * into type_objet from public.types_pieces_jointes where objet_type = p_piece ->> 'objet_type';
  if type_objet.objet_type is null then
    raise exception 'Type d''objet inconnu';
  end if;
  if objet is null or not public.objet_existe(type_objet.objet_type, objet, p_etablissement_id) then
    raise exception 'Objet introuvable dans cet établissement';
  end if;
  proprietaire := public.module_actif(p_etablissement_id, type_objet.module_id)
    and public.proprietaire_objet(type_objet.objet_type, objet)
    and not coalesce((p_piece ->> 'confidentiel')::boolean, false);
  if proprietaire and not public.a_permission(p_etablissement_id, type_objet.permission_ecrire) then
    if not public.etablissement_autorise_ecriture(p_etablissement_id) or not public.compte_pret() then
      raise exception 'Établissement suspendu ou archivé : aucune écriture possible' using errcode = '42501';
    end if;
  else
    perform public.exiger_permission(p_etablissement_id, type_objet.permission_ecrire);
  end if;
  if v_contenu is null or length(v_contenu) > 4200000 then
    raise exception 'Fichier absent ou trop lourd (3 Mo au plus)';
  end if;
  mime := substring(v_contenu from '^data:([a-z./+-]+);base64,');
  if mime is null then
    raise exception 'Format de fichier non accepté';
  end if;
  insert into public.fichiers (etablissement_id, contenu) values (p_etablissement_id, v_contenu) returning id into fichier;
  insert into public.pieces_jointes (etablissement_id, objet_type, objet_id, nom, type_mime, taille, categorie, confidentiel, fichier_id, ajoute_par)
  values (
    p_etablissement_id, type_objet.objet_type, objet, btrim(p_piece ->> 'nom'), mime,
    greatest(1, (length(v_contenu) - length('data:' || mime || ';base64,')) * 3 / 4),
    nullif(btrim(p_piece ->> 'categorie'), ''),
    coalesce((p_piece ->> 'confidentiel')::boolean, false),
    fichier, auth.uid()
  )
  returning id into resultat;
  return resultat;
end
$$;

create function public.lire_piece_jointe(p_piece_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  piece public.pieces_jointes%rowtype;
begin
  select * into piece from public.pieces_jointes where id = p_piece_id;
  if piece.id is null or not public.piece_lisible(piece.etablissement_id, piece.objet_type, piece.objet_id,
                                                  piece.confidentiel or piece.statut <> 'active') then
    raise exception 'Pièce introuvable';
  end if;
  return jsonb_build_object('id', piece.id, 'nom', piece.nom, 'type_mime', piece.type_mime,
    'contenu', (select contenu from public.fichiers where id = piece.fichier_id));
end
$$;

create function public.archiver_piece_jointe(p_piece_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  piece public.pieces_jointes%rowtype;
begin
  select * into piece from public.pieces_jointes where id = p_piece_id for update;
  if piece.id is null then
    raise exception 'Pièce introuvable';
  end if;
  perform public.exiger_permission(piece.etablissement_id,
    (select permission_ecrire from public.types_pieces_jointes where objet_type = piece.objet_type));
  if piece.statut <> 'active' then
    raise exception 'Cette pièce est déjà archivée';
  end if;
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Le motif est obligatoire';
  end if;
  update public.pieces_jointes
  set statut = 'archivee', archivee_le = now(), archivee_par = auth.uid(), motif_archivage = btrim(p_motif)
  where id = piece.id;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Module Documents (bibliothèque)
-- ---------------------------------------------------------------------------
insert into public.modules (id, nom, description, nature, statut, categorie, icone, ordre, documentation)
values ('documents', 'Documents', 'Bibliothèque de l''établissement : dossiers, fichiers, versions archivées, et toutes les pièces jointes des autres modules.',
        'transversal', 'en_preparation', 'documents', 'cloture', 150, 'docs/SOP/43_PIECES_JOINTES_ET_DOCUMENTS.md')
on conflict (id) do nothing;
insert into public.module_dependances (module_id, depend_de) values ('documents', 'etablissement') on conflict do nothing;
insert into public.permissions (id, module_id, description) values
  ('documents.lire', 'documents', 'Consulter la bibliothèque de documents'),
  ('documents.gerer', 'documents', 'Créer des dossiers, ajouter et archiver des documents')
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id) values
  ('gerant', 'documents.lire'), ('gerant', 'documents.gerer'),
  ('responsable', 'documents.lire'), ('responsable', 'documents.gerer'),
  ('responsable_hub', 'documents.lire'), ('comptable', 'documents.lire'), ('comptable', 'documents.gerer'),
  ('lecteur', 'documents.lire')
on conflict do nothing;
insert into public.solution_modules (solution_id, module_id, par_defaut)
select s.id, 'documents', false from public.solutions s
on conflict (solution_id, module_id) do nothing;

create table public.documents_dossiers (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  parent_id uuid references public.documents_dossiers(id) on delete restrict,
  nom text not null check (length(btrim(nom)) between 1 and 80 and nom !~ '[<>/\\]'),
  description text check (description is null or length(description) <= 300),
  actif boolean not null default true,
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (etablissement_id, parent_id, nom)
);
create index documents_dossiers_etablissement_id_idx on public.documents_dossiers(etablissement_id);
create index documents_dossiers_parent_id_idx on public.documents_dossiers(parent_id);
alter table public.documents_dossiers enable row level security;
create trigger documents_dossiers_modifie_le before update on public.documents_dossiers
for each row execute function public.fixer_modifie_le();
create trigger documents_dossiers_verrou_etablissement before update on public.documents_dossiers
for each row execute function public.verrouiller_etablissement_id();
create trigger documents_dossiers_sans_suppression before delete on public.documents_dossiers
for each row execute function public.refuser_suppression();
create trigger documents_dossiers_audit after insert or update or delete on public.documents_dossiers
for each row execute function public.journaliser_modification();
create policy lecture on public.documents_dossiers for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'documents.lire'));

insert into public.types_pieces_jointes (objet_type, table_nom, module_id, permission_lire, permission_ecrire, libelle)
values ('document', 'documents_dossiers', 'documents', 'documents.lire', 'documents.gerer', 'Bibliothèque')
on conflict (objet_type) do nothing;

create function public.enregistrer_dossier(p_etablissement_id uuid, p_dossier jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p_dossier ->> 'id', '')::uuid;
  parent uuid := nullif(p_dossier ->> 'parent_id', '')::uuid;
  remonte uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'documents.gerer');
  if parent is not null and not exists (
    select 1 from public.documents_dossiers where id = parent and etablissement_id = p_etablissement_id
  ) then
    raise exception 'Dossier parent introuvable';
  end if;
  if resultat is null then
    insert into public.documents_dossiers (etablissement_id, parent_id, nom, description, cree_par)
    values (p_etablissement_id, parent, btrim(p_dossier ->> 'nom'), nullif(btrim(p_dossier ->> 'description'), ''), auth.uid())
    returning id into resultat;
  else
    -- Pas de boucle : le nouveau parent ne peut pas être le dossier lui-même ni l'un de ses sous-dossiers.
    remonte := parent;
    while remonte is not null loop
      if remonte = resultat then
        raise exception 'Un dossier ne peut pas être rangé dans lui-même';
      end if;
      select parent_id into remonte from public.documents_dossiers where id = remonte;
    end loop;
    update public.documents_dossiers set
      parent_id = parent,
      nom = btrim(p_dossier ->> 'nom'),
      description = nullif(btrim(p_dossier ->> 'description'), ''),
      actif = coalesce((p_dossier ->> 'actif')::boolean, actif)
    where id = resultat and etablissement_id = p_etablissement_id;
    if not found then
      raise exception 'Dossier introuvable dans cet établissement';
    end if;
  end if;
  return resultat;
end
$$;

-- Disponible : bibliothèque, ajout, lecture, archivage, écran « Documents ».
update public.modules set statut = 'actif' where id = 'documents';

-- ---------------------------------------------------------------------------
-- Droits d'exécution
-- ---------------------------------------------------------------------------
do $$
declare signature text;
begin
  foreach signature in array array[
    'public.mes_notifications(integer)',
    'public.marquer_notifications_lues(uuid[])',
    'public.ajouter_piece_jointe(uuid, jsonb)',
    'public.lire_piece_jointe(uuid)',
    'public.archiver_piece_jointe(uuid, text)',
    'public.enregistrer_dossier(uuid, jsonb)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
  foreach signature in array array[
    'public.parametre_module(uuid, text, text, jsonb)',
    'public.membres_avec_permission(uuid, text)',
    'public.notifier(uuid, uuid, text, text, text, text)',
    'public.notifier_permission(uuid, text, text, text, text, text)',
    'public.proteger_notification()',
    'public.proteger_piece_jointe()',
    'public.objet_existe(text, uuid, uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', signature);
  end loop;
  -- Utilisées par les politiques de lecture : exécutables par authenticated, jamais par anon.
  foreach signature in array array[
    'public.piece_lisible(uuid, text, uuid, boolean)',
    'public.proprietaire_objet(text, uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
end
$$;
