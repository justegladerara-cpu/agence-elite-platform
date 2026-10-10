-- Qualification CRM (lot D, 2026-10-10). Rien ne change pour une opportunité ou un contact qui n'utilise pas ces outils.
--  * Interlocuteurs : plusieurs personnes par entreprise (fonction, coordonnées), dont le ou les décideurs.
--  * Opportunité : budget en fourchette et date de démarrage souhaitée.
--  * Critères de qualification et questionnaire d'audit propres à l'établissement (oui/non, choix, nombre, texte),
--    pondérés, avec questions conditionnelles (affichées selon la réponse à une autre question) ; réponses par opportunité.
--  * Motifs de perte normalisés (liste réglable) et modèle de compte rendu d'appel (réglage).
--  * Coordonnées confirmées : date et auteur, remis à zéro dès qu'un téléphone, un e-mail ou une adresse change.
--  * Doublons : contacts qui partagent un téléphone, un e-mail ou un nom ; avertissement avant de créer un contact.

-- ---------------------------------------------------------------------------
-- 1. Réglages
-- ---------------------------------------------------------------------------
update public.modules set parametres_schema = '[
  {"cle": "relance_jours", "libelle": "Relance proposée après un contact (jours)", "type": "nombre", "defaut": 3},
  {"cle": "jours_sans_activite", "libelle": "Alerte : opportunité ouverte sans activité depuis (jours)", "type": "nombre", "defaut": 14},
  {"cle": "motifs_perte", "libelle": "Motifs de perte proposés (un par ligne)", "type": "texte", "defaut": "Prix trop élevé\nChoix d''un concurrent\nPas de budget\nProjet reporté\nSans réponse\nBesoin non couvert"},
  {"cle": "modele_compte_rendu", "libelle": "Modèle de compte rendu d''appel ou de rendez-vous", "type": "texte", "defaut": "Besoin :\nObjections :\nProchaine étape :"}
]'::jsonb where id = 'crm_pipeline';

-- ---------------------------------------------------------------------------
-- 2. Colonnes
-- ---------------------------------------------------------------------------
alter table public.crm_opportunites add column budget_min numeric(14, 2) check (budget_min is null or budget_min >= 0);
alter table public.crm_opportunites add column budget_max numeric(14, 2) check (budget_max is null or budget_max >= 0);
alter table public.crm_opportunites add constraint crm_opportunites_budget_check
  check (budget_min is null or budget_max is null or budget_min <= budget_max);
alter table public.crm_opportunites add column demarrage_souhaite date;

alter table public.contacts add column coordonnees_confirmees_le timestamptz;
alter table public.contacts add column coordonnees_confirmees_par uuid references auth.users(id) on delete restrict;

-- Une coordonnée qui change n'est plus confirmée.
create function public.invalider_confirmation_contact()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.coordonnees_confirmees_le is not null
     and (new.telephone is distinct from old.telephone or new.email is distinct from old.email or new.adresse is distinct from old.adresse)
     and new.coordonnees_confirmees_le is not distinct from old.coordonnees_confirmees_le then
    new.coordonnees_confirmees_le := null;
    new.coordonnees_confirmees_par := null;
  end if;
  return new;
end
$$;
create trigger contacts_invalider_confirmation before update on public.contacts
for each row execute function public.invalider_confirmation_contact();

-- ---------------------------------------------------------------------------
-- 3. Tables
-- ---------------------------------------------------------------------------
create table public.contact_interlocuteurs (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  contact_id uuid not null,
  nom text not null check (btrim(nom) <> '' and length(nom) <= 120),
  fonction text check (fonction is null or length(fonction) <= 120),
  telephone text check (telephone is null or length(telephone) <= 40),
  email text check (email is null or length(email) <= 200),
  decideur boolean not null default false,
  notes text check (notes is null or length(notes) <= 1000),
  actif boolean not null default true,
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (id, etablissement_id)
);
alter table public.contacts add constraint contacts_id_etablissement_unique unique (id, etablissement_id);
alter table public.contact_interlocuteurs add constraint contact_interlocuteurs_contact_fk
  foreign key (contact_id, etablissement_id) references public.contacts(id, etablissement_id) on delete restrict;
create index contact_interlocuteurs_contact_idx on public.contact_interlocuteurs(contact_id);

create table public.crm_criteres (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  groupe text not null default 'qualification' check (groupe in ('qualification', 'audit')),
  libelle text not null check (btrim(libelle) <> '' and length(libelle) <= 200),
  aide text check (aide is null or length(aide) <= 500),
  type text not null default 'oui_non' check (type in ('oui_non', 'choix', 'nombre', 'texte')),
  choix text[] not null default '{}' check (cardinality(choix) <= 20),
  poids integer not null default 0 check (poids between 0 and 100),
  depend_de uuid,
  depend_valeur text check (depend_valeur is null or length(depend_valeur) <= 200),
  ordre integer not null default 0,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (id, etablissement_id),
  check (type <> 'choix' or cardinality(choix) >= 2),
  check ((depend_de is null) = (depend_valeur is null))
);
alter table public.crm_criteres add constraint crm_criteres_dependance_fk
  foreign key (depend_de, etablissement_id) references public.crm_criteres(id, etablissement_id) on delete restrict;
create index crm_criteres_etablissement_idx on public.crm_criteres(etablissement_id, groupe, ordre);

create table public.crm_reponses (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  opportunite_id uuid not null,
  critere_id uuid not null,
  valeur text check (valeur is null or length(valeur) <= 2000),
  repondu_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (opportunite_id, critere_id),
  foreign key (opportunite_id, etablissement_id) references public.crm_opportunites(id, etablissement_id) on delete restrict,
  foreign key (critere_id, etablissement_id) references public.crm_criteres(id, etablissement_id) on delete restrict
);
create index crm_reponses_opportunite_idx on public.crm_reponses(opportunite_id);

do $$
declare
  nom_table text;
begin
  foreach nom_table in array array['contact_interlocuteurs', 'crm_criteres', 'crm_reponses'] loop
    execute format('create trigger %I_modifie_le before update on public.%I for each row execute function public.fixer_modifie_le()', nom_table, nom_table);
    execute format('create trigger %I_sans_suppression before delete on public.%I for each row execute function public.refuser_suppression()', nom_table, nom_table);
    execute format('create trigger %I_verrou_etablissement before update on public.%I for each row execute function public.verrouiller_etablissement_id()', nom_table, nom_table);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.journaliser_modification()', nom_table, nom_table);
    execute format('alter table public.%I enable row level security', nom_table);
  end loop;
end
$$;
create policy lecture on public.contact_interlocuteurs for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'contacts.lire'));
create policy lecture on public.crm_criteres for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'crm_pipeline.lire'));
create policy lecture on public.crm_reponses for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'crm_pipeline.lire'));

-- ---------------------------------------------------------------------------
-- 4. Interlocuteurs et coordonnées
-- ---------------------------------------------------------------------------
-- p : { id?, contact_id, nom, fonction?, telephone?, email?, decideur?, notes?, actif? }
create function public.enregistrer_interlocuteur(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p ->> 'id', '')::uuid;
  v_contact uuid := nullif(p ->> 'contact_id', '')::uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'contacts.gerer');
  if resultat is not null then
    select contact_id into v_contact from public.contact_interlocuteurs where id = resultat and etablissement_id = p_etablissement_id;
    if v_contact is null then
      raise exception 'Interlocuteur introuvable dans cet établissement';
    end if;
  elsif v_contact is null or not exists (select 1 from public.contacts where id = v_contact and etablissement_id = p_etablissement_id) then
    raise exception 'Contact introuvable dans cet établissement';
  end if;
  if coalesce(btrim(p ->> 'nom'), '') = '' then
    raise exception 'Indiquez le nom de l''interlocuteur';
  end if;
  if resultat is null then
    insert into public.contact_interlocuteurs (etablissement_id, contact_id, nom, fonction, telephone, email, decideur, notes, cree_par)
    values (p_etablissement_id, v_contact, btrim(p ->> 'nom'), nullif(btrim(p ->> 'fonction'), ''), nullif(btrim(p ->> 'telephone'), ''),
      nullif(lower(btrim(p ->> 'email')), ''), coalesce((p ->> 'decideur')::boolean, false), nullif(btrim(p ->> 'notes'), ''), auth.uid())
    returning id into resultat;
  else
    update public.contact_interlocuteurs set
      nom = btrim(p ->> 'nom'), fonction = nullif(btrim(p ->> 'fonction'), ''), telephone = nullif(btrim(p ->> 'telephone'), ''),
      email = nullif(lower(btrim(p ->> 'email')), ''), decideur = coalesce((p ->> 'decideur')::boolean, decideur),
      notes = nullif(btrim(p ->> 'notes'), ''), actif = coalesce((p ->> 'actif')::boolean, actif)
    where id = resultat;
  end if;
  return resultat;
end
$$;

-- Le contact a confirmé ses coordonnées (appel, visite) : on note quand et par qui.
create function public.confirmer_coordonnees_contact(p_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_etab uuid;
begin
  select etablissement_id into v_etab from public.contacts where id = p_contact_id;
  if v_etab is null then
    raise exception 'Contact introuvable';
  end if;
  perform public.exiger_permission(v_etab, 'contacts.gerer');
  update public.contacts set coordonnees_confirmees_le = now(), coordonnees_confirmees_par = auth.uid() where id = p_contact_id;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Doublons
-- ---------------------------------------------------------------------------
-- Clés de comparaison : 8 derniers chiffres du téléphone, e-mail en minuscules, nom (ou société) sans espaces ni ponctuation.
create function public.cle_telephone(p text)
returns text
language sql
immutable
set search_path = ''
as $$ select case when length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) >= 8 then right(regexp_replace(p, '\D', '', 'g'), 8) end $$;

create function public.cle_nom(p text)
returns text
language sql
immutable
set search_path = ''
as $$ select nullif(lower(regexp_replace(coalesce(p, ''), '[^[:alnum:]]', '', 'g')), '') $$;

-- Contacts proches de ce qu'on s'apprête à créer (avertissement, rien n'est bloqué).
create function public.contacts_similaires(p_etablissement_id uuid, p_nom text, p_telephone text default null, p_email text default null,
  p_sauf uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.lecture_autorisee(p_etablissement_id, 'contacts.lire') then
    raise exception 'Permission refusée : contacts.lire' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', k.id, 'nom', k.nom, 'societe', k.societe, 'type', k.type, 'telephone', k.telephone,
      'email', k.email, 'raison', r.raison) order by k.nom)
    from public.contacts k
    cross join lateral (select case
      when public.cle_telephone(p_telephone) is not null and public.cle_telephone(k.telephone) = public.cle_telephone(p_telephone) then 'telephone'
      when nullif(lower(btrim(p_email)), '') is not null and lower(k.email) = lower(btrim(p_email)) then 'email'
      when public.cle_nom(p_nom) is not null and public.cle_nom(p_nom) in (public.cle_nom(k.nom), public.cle_nom(k.societe)) then 'nom'
    end raison) r
    where k.etablissement_id = p_etablissement_id and k.actif and r.raison is not null and k.id is distinct from p_sauf
  ), '[]'::jsonb);
end
$$;

-- Groupes de contacts actifs qui se ressemblent (même téléphone, même e-mail ou même nom).
create function public.contacts_doublons(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.lecture_autorisee(p_etablissement_id, 'contacts.lire') then
    raise exception 'Permission refusée : contacts.lire' using errcode = '42501';
  end if;
  return coalesce((
    with k as (select * from public.contacts where etablissement_id = p_etablissement_id and actif),
    cles as (
      select 'telephone' raison, public.cle_telephone(telephone) cle, id from k where public.cle_telephone(telephone) is not null
      union all select 'email', lower(email), id from k where email is not null
      union all select 'nom', public.cle_nom(coalesce(societe, nom)), id from k where public.cle_nom(coalesce(societe, nom)) is not null
    ),
    groupes as (select raison, cle, array_agg(id order by id) ids from cles group by raison, cle having count(*) > 1)
    select jsonb_agg(jsonb_build_object('raison', g.raison, 'contacts',
      (select jsonb_agg(jsonb_build_object('id', c.id, 'nom', c.nom, 'societe', c.societe, 'type', c.type, 'telephone', c.telephone,
        'email', c.email, 'cree_le', c.cree_le) order by c.cree_le) from public.contacts c where c.id = any (g.ids)))
      order by g.raison, g.cle)
    from groupes g
  ), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Critères de qualification et questionnaire d'audit
-- ---------------------------------------------------------------------------
-- p : { id?, groupe?, libelle, aide?, type?, choix?: [], poids?, depend_de?, depend_valeur?, ordre?, actif? }
create function public.enregistrer_critere_crm(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p ->> 'id', '')::uuid;
  existant public.crm_criteres%rowtype;
  v_type text;
  v_choix text[];
  v_depend uuid;
  parent public.crm_criteres%rowtype;
begin
  perform public.exiger_permission(p_etablissement_id, 'crm_pipeline.administrer');
  if resultat is not null then
    select * into existant from public.crm_criteres where id = resultat and etablissement_id = p_etablissement_id for update;
    if existant.id is null then
      raise exception 'Critère introuvable';
    end if;
  end if;
  v_type := coalesce(nullif(p ->> 'type', ''), existant.type, 'oui_non');
  if p ? 'choix' then
    select coalesce(array_agg(btrim(x)), '{}') into v_choix from jsonb_array_elements_text(coalesce(p -> 'choix', '[]'::jsonb)) x where btrim(x) <> '';
  else
    v_choix := coalesce(existant.choix, '{}');
  end if;
  if v_type <> 'choix' then
    v_choix := '{}';
  elsif cardinality(v_choix) < 2 then
    raise exception 'Une question à choix demande au moins deux réponses possibles';
  end if;
  v_depend := case when p ? 'depend_de' then nullif(p ->> 'depend_de', '')::uuid else existant.depend_de end;
  if v_depend is not null then
    select * into parent from public.crm_criteres where id = v_depend and etablissement_id = p_etablissement_id;
    if parent.id is null or parent.id = resultat then
      raise exception 'La question dont dépend celle-ci est introuvable';
    end if;
    if parent.depend_de is not null then
      raise exception 'Une question ne peut dépendre que d''une question qui ne dépend elle-même de rien';
    end if;
    if parent.type not in ('oui_non', 'choix') then
      raise exception 'Une question ne peut dépendre que d''une question oui/non ou à choix';
    end if;
    if resultat is not null and exists (select 1 from public.crm_criteres where depend_de = resultat) then
      raise exception 'D''autres questions dépendent de celle-ci : elle ne peut pas dépendre à son tour d''une autre';
    end if;
  end if;
  if resultat is null then
    insert into public.crm_criteres (etablissement_id, groupe, libelle, aide, type, choix, poids, depend_de, depend_valeur, ordre)
    values (p_etablissement_id, coalesce(nullif(p ->> 'groupe', ''), 'qualification'), btrim(p ->> 'libelle'), nullif(btrim(p ->> 'aide'), ''),
      v_type, v_choix, coalesce((p ->> 'poids')::integer, 0), v_depend, case when v_depend is not null then nullif(btrim(p ->> 'depend_valeur'), '') end,
      coalesce((p ->> 'ordre')::integer,
        (select coalesce(max(ordre), 0) + 1 from public.crm_criteres where etablissement_id = p_etablissement_id)))
    returning id into resultat;
  else
    update public.crm_criteres set
      groupe = coalesce(nullif(p ->> 'groupe', ''), groupe),
      libelle = coalesce(nullif(btrim(p ->> 'libelle'), ''), libelle),
      aide = case when p ? 'aide' then nullif(btrim(p ->> 'aide'), '') else aide end,
      type = v_type, choix = v_choix,
      poids = coalesce((p ->> 'poids')::integer, poids),
      depend_de = v_depend,
      depend_valeur = case when v_depend is null then null when p ? 'depend_valeur' then nullif(btrim(p ->> 'depend_valeur'), '') else depend_valeur end,
      ordre = coalesce((p ->> 'ordre')::integer, ordre),
      actif = coalesce((p ->> 'actif')::boolean, actif)
    where id = resultat;
  end if;
  return resultat;
end
$$;

-- Critères de départ (génériques, modifiables) quand l'établissement n'en a aucun.
create function public.crm_criteres_initialiser(p_etablissement_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  besoin uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'crm_pipeline.administrer');
  perform pg_advisory_xact_lock(hashtext('crm_criteres:' || p_etablissement_id::text));
  if exists (select 1 from public.crm_criteres where etablissement_id = p_etablissement_id) then
    return 0;
  end if;
  insert into public.crm_criteres (etablissement_id, groupe, libelle, type, poids, ordre) values
    (p_etablissement_id, 'qualification', 'Le besoin est clairement exprimé', 'oui_non', 25, 1)
  returning id into besoin;
  insert into public.crm_criteres (etablissement_id, groupe, libelle, aide, type, choix, poids, depend_de, depend_valeur, ordre) values
    (p_etablissement_id, 'qualification', 'Le budget est confirmé', 'Indiquez la fourchette sur l''opportunité', 'oui_non', '{}', 25, null, null, 2),
    (p_etablissement_id, 'qualification', 'Le décideur est identifié', 'Ajoutez-le comme interlocuteur du contact', 'oui_non', '{}', 25, null, null, 3),
    (p_etablissement_id, 'qualification', 'Le délai de décision est connu', null, 'oui_non', '{}', 25, null, null, 4),
    (p_etablissement_id, 'qualification', 'Urgence du besoin', null, 'choix', '{Faible,Moyenne,Forte}', 0, besoin, 'oui', 5),
    (p_etablissement_id, 'audit', 'Outils utilisés aujourd''hui', null, 'texte', '{}', 0, null, null, 6),
    (p_etablissement_id, 'audit', 'Nombre de personnes concernées', null, 'nombre', '{}', 0, null, null, 7),
    (p_etablissement_id, 'audit', 'Principale difficulté rencontrée', null, 'texte', '{}', 0, null, null, 8),
    (p_etablissement_id, 'audit', 'Résultat attendu', null, 'texte', '{}', 0, null, null, 9);
  return 9;
end
$$;

-- Enregistre les réponses d'une opportunité. p_reponses : { "<critere_id>": "valeur" | null, … } (null efface).
create function public.repondre_criteres_crm(p_opportunite_id uuid, p_reponses jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.crm_opportunites%rowtype;
  cle text;
  v_valeur text;
  k public.crm_criteres%rowtype;
begin
  select * into o from public.crm_opportunites where id = p_opportunite_id for update;
  if o.id is null then
    raise exception 'Opportunité introuvable';
  end if;
  perform public.exiger_droit_opportunite(o);
  if jsonb_typeof(p_reponses) <> 'object' then
    raise exception 'Réponses invalides';
  end if;
  for cle, v_valeur in select key, nullif(btrim(value #>> '{}'), '') from jsonb_each(p_reponses) loop
    select * into k from public.crm_criteres where id = cle::uuid and etablissement_id = o.etablissement_id;
    if k.id is null then
      raise exception 'Critère introuvable dans cet établissement';
    end if;
    if v_valeur is not null then
      if k.type = 'oui_non' and v_valeur not in ('oui', 'non') then
        raise exception 'Répondez par oui ou non : %', k.libelle;
      elsif k.type = 'choix' and not (v_valeur = any (k.choix)) then
        raise exception 'Réponse non prévue : %', k.libelle;
      elsif k.type = 'nombre' and v_valeur !~ '^-?[0-9]+([.,][0-9]+)?$' then
        raise exception 'Indiquez un nombre : %', k.libelle;
      end if;
    end if;
    insert into public.crm_reponses (etablissement_id, opportunite_id, critere_id, valeur, repondu_par)
    values (o.etablissement_id, o.id, k.id, v_valeur, auth.uid())
    on conflict (opportunite_id, critere_id) do update set valeur = excluded.valeur, repondu_par = excluded.repondu_par
    where public.crm_reponses.valeur is distinct from excluded.valeur;
  end loop;
  update public.crm_opportunites set derniere_activite = now() where id = o.id;
end
$$;

-- Score de qualification : part des poids gagnés sur les questions visibles (oui → poids ; autre type → poids si répondu).
create function public.qualification_opportunite(p_opportunite_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_etab uuid;
begin
  select etablissement_id into v_etab from public.crm_opportunites where id = p_opportunite_id;
  if v_etab is null or not public.lecture_autorisee(v_etab, 'crm_pipeline.lire') then
    raise exception 'Opportunité introuvable';
  end if;
  return (
    with r as (select critere_id, valeur from public.crm_reponses where opportunite_id = p_opportunite_id and valeur is not null),
    k as (
      select c.*, r.valeur from public.crm_criteres c left join r on r.critere_id = c.id
      where c.etablissement_id = v_etab and c.actif
        and (c.depend_de is null or exists (select 1 from r where r.critere_id = c.depend_de and r.valeur = c.depend_valeur))
    )
    select jsonb_build_object(
      'score', case when coalesce(sum(poids) filter (where groupe = 'qualification'), 0) = 0 then null
        else round(100.0 * coalesce(sum(poids) filter (where groupe = 'qualification' and valeur is not null and (type <> 'oui_non' or valeur = 'oui')), 0)
                   / sum(poids) filter (where groupe = 'qualification')) end,
      'repondus', count(*) filter (where valeur is not null),
      'questions', count(*),
      'audit_repondus', count(*) filter (where groupe = 'audit' and valeur is not null),
      'audit_questions', count(*) filter (where groupe = 'audit'))
    from k
  );
end
$$;

-- Réglages du CRM utiles aux écrans (lecture seule, valeurs par défaut si non réglés).
create function public.crm_reglages(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_motifs text := coalesce(public.parametre_module(p_etablissement_id, 'crm_pipeline', 'motifs_perte') #>> '{}', '');
begin
  if not public.lecture_autorisee(p_etablissement_id, 'crm_pipeline.lire') then
    raise exception 'Permission refusée : crm_pipeline.lire' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'motifs_perte', coalesce((select jsonb_agg(m) from (select btrim(x) m from regexp_split_to_table(v_motifs, E'\\n') x where btrim(x) <> '' limit 30) t), '[]'::jsonb),
    'modele_compte_rendu', coalesce(public.parametre_module(p_etablissement_id, 'crm_pipeline', 'modele_compte_rendu') #>> '{}', ''),
    'relance_jours', coalesce((public.parametre_module(p_etablissement_id, 'crm_pipeline', 'relance_jours') #>> '{}')::integer, 3));
end
$$;

-- ---------------------------------------------------------------------------
-- 7. Opportunité : budget en fourchette et démarrage souhaité (clés ajoutées, rien d'autre ne change)
-- p : { id?, titre, contact_id, etape_id?, montant?, cloture_prevue?, source?, responsable_id?, notes?,
--       budget_min?, budget_max?, demarrage_souhaite? }
-- ---------------------------------------------------------------------------
create or replace function public.enregistrer_opportunite(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p ->> 'id', '')::uuid;
  existante public.crm_opportunites%rowtype;
  v_contact uuid := nullif(p ->> 'contact_id', '')::uuid;
  v_etape public.crm_etapes%rowtype;
  v_responsable uuid := nullif(p ->> 'responsable_id', '')::uuid;
  v_montant numeric := coalesce(nullif(p ->> 'montant', '')::numeric, 0);
  v_min numeric;
  v_max numeric;
  v_demarrage date;
begin
  perform public.exiger_permission(p_etablissement_id, 'crm_pipeline.gerer');
  perform public.crm_initialiser(p_etablissement_id);
  if resultat is not null then
    select * into existante from public.crm_opportunites where id = resultat and etablissement_id = p_etablissement_id for update;
    if existante.id is null then
      raise exception 'Opportunité introuvable dans cet établissement';
    end if;
    perform public.exiger_droit_opportunite(existante);
    if existante.statut <> 'ouverte' then
      raise exception 'Une opportunité clôturée ne se modifie plus (rouvrez-la)';
    end if;
  end if;
  if v_contact is null or not exists (
    select 1 from public.contacts where id = v_contact and etablissement_id = p_etablissement_id and type <> 'fournisseur' and actif) then
    raise exception 'Choisissez un prospect ou un client actif de cet établissement';
  end if;
  if v_montant = 'NaN'::numeric or v_montant < 0 or v_montant <> round(v_montant, 2) then
    raise exception 'Montant invalide';
  end if;
  v_min := case when p ? 'budget_min' then nullif(p ->> 'budget_min', '')::numeric else existante.budget_min end;
  v_max := case when p ? 'budget_max' then nullif(p ->> 'budget_max', '')::numeric else existante.budget_max end;
  if v_min = 'NaN'::numeric or v_max = 'NaN'::numeric or v_min < 0 or v_max < 0 or v_min <> round(v_min, 2) or v_max <> round(v_max, 2) then
    raise exception 'Budget invalide';
  end if;
  if v_min > v_max then
    raise exception 'Le budget minimum dépasse le budget maximum';
  end if;
  v_demarrage := case when p ? 'demarrage_souhaite' then nullif(p ->> 'demarrage_souhaite', '')::date else existante.demarrage_souhaite end;
  v_responsable := coalesce(v_responsable, existante.responsable_id, auth.uid());
  if v_responsable <> coalesce(existante.responsable_id, auth.uid()) then
    perform public.exiger_permission(p_etablissement_id, 'crm_pipeline.administrer');
  end if;
  if v_responsable not in (select public.membres_avec_permission(p_etablissement_id, 'crm_pipeline.gerer')) then
    raise exception 'Le responsable doit être un membre actif qui gère le CRM';
  end if;
  select * into v_etape from public.crm_etapes
  where id = coalesce(nullif(p ->> 'etape_id', '')::uuid, existante.etape_id) and etablissement_id = p_etablissement_id;
  if v_etape.id is null then
    select * into v_etape from public.crm_etapes
    where etablissement_id = p_etablissement_id and nature = 'ouverte' and actif order by ordre limit 1;
  end if;
  if v_etape.id is null or not v_etape.actif or v_etape.nature <> 'ouverte' then
    raise exception 'Choisissez une étape ouverte du pipeline (gagner ou perdre passe par le bouton dédié)';
  end if;

  if resultat is null then
    insert into public.crm_opportunites (etablissement_id, numero, titre, contact_id, etape_id, montant, probabilite, cloture_prevue,
      source, responsable_id, notes, cree_par, budget_min, budget_max, demarrage_souhaite)
    values (p_etablissement_id, public.prochain_numero(p_etablissement_id, 'opportunite', 'OP-'), btrim(p ->> 'titre'), v_contact,
      v_etape.id, v_montant, v_etape.probabilite, nullif(p ->> 'cloture_prevue', '')::date,
      coalesce(nullif(p ->> 'source', ''), (select source from public.contacts where id = v_contact)),
      v_responsable, nullif(btrim(p ->> 'notes'), ''), auth.uid(), v_min, v_max, v_demarrage)
    returning id into resultat;
  else
    update public.crm_opportunites set
      titre = btrim(p ->> 'titre'), contact_id = v_contact, etape_id = v_etape.id, montant = v_montant,
      probabilite = case when v_etape.id <> existante.etape_id then v_etape.probabilite else probabilite end,
      cloture_prevue = nullif(p ->> 'cloture_prevue', '')::date,
      source = case when p ? 'source' then nullif(p ->> 'source', '') else source end,
      responsable_id = v_responsable, notes = nullif(btrim(p ->> 'notes'), ''),
      budget_min = v_min, budget_max = v_max, demarrage_souhaite = v_demarrage
    where id = resultat;
  end if;
  if v_responsable <> auth.uid() and (existante.id is null or existante.responsable_id <> v_responsable) then
    perform public.notifier(v_responsable, p_etablissement_id, 'crm.opportunite_attribuee', 'Opportunité attribuée',
      btrim(p ->> 'titre'), 'crm/' || resultat);
  end if;
  return resultat;
end
$$;

-- ---------------------------------------------------------------------------
-- 8. Droits d'exécution
-- ---------------------------------------------------------------------------
do $$
declare signature text;
begin
  foreach signature in array array[
    'public.enregistrer_interlocuteur(uuid, jsonb)', 'public.confirmer_coordonnees_contact(uuid)',
    'public.contacts_similaires(uuid, text, text, text, uuid)', 'public.contacts_doublons(uuid)',
    'public.enregistrer_critere_crm(uuid, jsonb)', 'public.crm_criteres_initialiser(uuid)',
    'public.repondre_criteres_crm(uuid, jsonb)', 'public.qualification_opportunite(uuid)', 'public.crm_reglages(uuid)',
    'public.enregistrer_opportunite(uuid, jsonb)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
  foreach signature in array array['public.invalider_confirmation_contact()', 'public.cle_telephone(text)', 'public.cle_nom(text)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', signature);
  end loop;
end
$$;

notify pgrst, 'reload schema';
