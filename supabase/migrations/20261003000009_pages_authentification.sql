-- Pages d'authentification administrables depuis l'espace Agence Elite (Super Admin), sans code.
-- Contenu seulement : textes, identité affichée, couleurs de la palette, image, disposition choisie dans une
-- liste fermée. Aucun CSS, aucun HTML, aucun script : chaque clé est déclarée et validée ici.
-- Rien de ce qui est réglé ici ne touche Supabase Auth, les droits, la politique des mots de passe,
-- le changement obligatoire du mot de passe, la RLS ni les redirections (calculées par le code).
-- Héritage : plateforme → client → établissement (clé absente = valeur du niveau au-dessus, puis du code).
-- Cycle : brouillon → aperçu → publication ; restauration d'une version publiée ; retour aux valeurs par défaut.
-- Seul le contenu publié est lisible sans connexion (pages_connexion).

-- ---------------------------------------------------------------------------
-- 1. Catalogue des réglages autorisés (liste blanche)
-- ---------------------------------------------------------------------------
-- type : texte (une ligne), long (plusieurs lignes), image, couleur (palette), fond (fonds clairs ou sombres
-- prédéfinis), choix (liste fermée), lien (https, mailto ou tel).
create function public.champs_pages_auth()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select $j$
  {
    "nom_logiciel": {"type":"texte","max":40},
    "nom_court": {"type":"texte","max":4},
    "sous_titre": {"type":"texte","max":60},
    "logo_url": {"type":"image","max":400000},
    "nom_editeur": {"type":"texte","max":60},
    "contact_support": {"type":"texte","max":120},
    "couleur_accent": {"type":"couleur"},
    "disposition": {"type":"choix","choix":["centree","partagee","laterale"]},
    "fond": {"type":"choix","choix":["degrade","uni","image"]},
    "couleur_fond": {"type":"fond"},
    "image_fond": {"type":"image","max":900000},
    "accroche": {"type":"long","max":160},
    "alignement": {"type":"choix","choix":["gauche","centre"]},
    "pied": {"type":"long","max":300},
    "copyright": {"type":"texte","max":120},
    "lien_1_libelle": {"type":"texte","max":40},
    "lien_1_url": {"type":"lien"},
    "lien_2_libelle": {"type":"texte","max":40},
    "lien_2_url": {"type":"lien"},
    "lien_3_libelle": {"type":"texte","max":40},
    "lien_3_url": {"type":"lien"},
    "connexion_titre": {"type":"texte","max":80},
    "connexion_intro": {"type":"long","max":300},
    "onglet_connexion": {"type":"texte","max":40},
    "onglet_invitation": {"type":"texte","max":40},
    "champ_identifiant": {"type":"texte","max":60},
    "champ_mot_de_passe": {"type":"texte","max":60},
    "bouton_connexion": {"type":"texte","max":40},
    "lien_oubli": {"type":"texte","max":60},
    "invitation_intro": {"type":"long","max":300},
    "champ_nom": {"type":"texte","max":60},
    "champ_email": {"type":"texte","max":60},
    "bouton_invitation": {"type":"texte","max":40},
    "invitation_succes": {"type":"long","max":300},
    "premiere_titre": {"type":"texte","max":80},
    "premiere_intro": {"type":"long","max":400},
    "champ_nouveau": {"type":"texte","max":60},
    "champ_confirmation": {"type":"texte","max":60},
    "bouton_mot_de_passe": {"type":"texte","max":40},
    "expire_titre": {"type":"texte","max":80},
    "expire_texte": {"type":"long","max":400},
    "oubli_titre": {"type":"texte","max":80},
    "oubli_intro": {"type":"long","max":300},
    "bouton_oubli": {"type":"texte","max":40},
    "oubli_envoye": {"type":"long","max":300},
    "lien_retour": {"type":"texte","max":60},
    "lien_expire": {"type":"long","max":300},
    "reinit_titre": {"type":"texte","max":80},
    "reinit_intro": {"type":"long","max":300},
    "bouton_reinit": {"type":"texte","max":40},
    "bloque_texte": {"type":"long","max":300},
    "desactive_texte": {"type":"long","max":300},
    "refuse_titre": {"type":"texte","max":80},
    "refuse_texte": {"type":"long","max":400},
    "bienvenue_titre": {"type":"texte","max":80},
    "bienvenue_intro": {"type":"long","max":300},
    "lien_changer_compte": {"type":"texte","max":40},
    "lien_deconnexion": {"type":"texte","max":40},
    "expiree_titre": {"type":"texte","max":80},
    "expiree_texte": {"type":"long","max":300}
  }$j$::jsonb
$$;

-- Fonds proposés (clairs, plus trois sombres) : la carte du formulaire reste toujours sur fond blanc.
create function public.couleurs_fond_auth()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['#f8fafc', '#f1f5f9', '#eff6ff', '#eef2ff', '#f5f3ff', '#fdf2f8', '#fff7ed', '#fefce8', '#ecfdf5',
               '#0f172a', '#18202f', '#1e293b']
$$;

-- Contrôle d'un contenu : clés connues, chaînes seulement, valeurs vides retirées (= héritage).
-- Renvoie le contenu nettoyé ; lève une erreur lisible sinon.
create function public.valider_pages_auth(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  champs constant jsonb := public.champs_pages_auth();
  resultat jsonb := '{}'::jsonb;
  cle text;
  brut jsonb;
  v text;
  regle jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'Contenu invalide' using errcode = '22023';
  end if;
  if octet_length(p::text) > 2000000 then
    raise exception 'Contenu trop volumineux : utilisez des images plus légères' using errcode = '22023';
  end if;
  for cle, brut in select * from jsonb_each(p) loop
    regle := champs -> cle;
    if regle is null then
      raise exception 'Réglage inconnu : %', left(cle, 60) using errcode = '22023';
    end if;
    if jsonb_typeof(brut) = 'null' then
      continue;
    end if;
    if jsonb_typeof(brut) <> 'string' then
      raise exception 'Valeur invalide pour %', cle using errcode = '22023';
    end if;
    v := btrim(brut #>> '{}');
    if v = '' then
      continue;
    end if;
    case regle ->> 'type'
      when 'texte' then
        if length(v) > (regle ->> 'max')::int or v ~ '[<>\x00-\x1f\x7f]' then
          raise exception 'Texte refusé pour % : % caractères au plus, sans < ni > ni retour à la ligne', cle, regle ->> 'max' using errcode = '22023';
        end if;
      when 'long' then
        v := regexp_replace(v, '\r\n?', E'\n', 'g');
        if length(v) > (regle ->> 'max')::int or v ~ '[<>\x00-\x09\x0b-\x1f\x7f]' then
          raise exception 'Texte refusé pour % : % caractères au plus, sans < ni >', cle, regle ->> 'max' using errcode = '22023';
        end if;
      when 'image' then
        if length(v) > (regle ->> 'max')::int
           or v !~ '^(data:image/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+|https://[^\s"''()<>\\]+)$' then
          raise exception 'Image refusée pour % : PNG, JPEG, GIF ou WebP, ou adresse https, et pas trop lourde', cle using errcode = '22023';
        end if;
      when 'couleur' then
        if not v = any (public.couleurs_marque()) then
          raise exception 'Couleur hors palette pour %', cle using errcode = '22023';
        end if;
      when 'fond' then
        if not v = any (public.couleurs_fond_auth()) then
          raise exception 'Fond hors palette pour %', cle using errcode = '22023';
        end if;
      when 'choix' then
        if not (regle -> 'choix') ? v then
          raise exception 'Choix inconnu pour % : %', cle, left(v, 40) using errcode = '22023';
        end if;
      when 'lien' then
        if length(v) > 300 or v !~ '^(https://[^\s"''<>\\]+|mailto:[^\s"''<>\\]+@[^\s"''<>\\]+|tel:\+?[0-9 ().-]{3,30})$' then
          raise exception 'Lien refusé pour % : https://…, mailto:… ou tel:… seulement', cle using errcode = '22023';
        end if;
      else
        raise exception 'Réglage non pris en charge : %', cle;
    end case;
    resultat := resultat || jsonb_build_object(cle, v);
  end loop;
  return resultat;
end
$$;

-- Différences entre deux contenus (les images sont résumées).
create function public.diff_pages_auth(p_avant jsonb, p_apres jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'cle', k,
    'avant', case when (public.champs_pages_auth() -> k ->> 'type') = 'image' and p_avant ? k then to_jsonb('[image]'::text) else p_avant -> k end,
    'apres', case when (public.champs_pages_auth() -> k ->> 'type') = 'image' and p_apres ? k then to_jsonb('[image]'::text) else p_apres -> k end
  ) order by k), '[]'::jsonb)
  from (select jsonb_object_keys(coalesce(p_avant, '{}')) k union select jsonb_object_keys(coalesce(p_apres, '{}'))) cles
  where coalesce(p_avant, '{}') -> k is distinct from coalesce(p_apres, '{}') -> k
$$;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
create table public.pages_auth (
  id uuid primary key default gen_random_uuid(),
  niveau text not null check (niveau in ('plateforme', 'client', 'etablissement')),
  client_id uuid references public.clients(id) on delete restrict,
  etablissement_id uuid references public.etablissements(id) on delete restrict,
  brouillon jsonb not null default '{}'::jsonb check (jsonb_typeof(brouillon) = 'object'),
  publie jsonb not null default '{}'::jsonb check (jsonb_typeof(publie) = 'object'),
  version integer not null default 0,
  brouillon_modifie_le timestamptz,
  brouillon_modifie_par uuid references auth.users(id) on delete set null,
  publie_le timestamptz,
  publie_par uuid references auth.users(id) on delete set null,
  cree_le timestamptz not null default now(),
  check ((niveau = 'plateforme' and client_id is null and etablissement_id is null)
      or (niveau = 'client' and client_id is not null and etablissement_id is null)
      or (niveau = 'etablissement' and etablissement_id is not null and client_id is null))
);
create unique index pages_auth_plateforme on public.pages_auth (niveau) where niveau = 'plateforme';
create unique index pages_auth_client on public.pages_auth (client_id) where client_id is not null;
create unique index pages_auth_etablissement on public.pages_auth (etablissement_id) where etablissement_id is not null;
create trigger pages_auth_sans_suppression before delete on public.pages_auth
for each row execute function public.refuser_suppression();
alter table public.pages_auth enable row level security;
revoke all on public.pages_auth from public, anon, authenticated;

-- Historique : qui, quand, quoi (valeurs avant / après), publications et restaurations. Jamais modifié.
create table public.pages_auth_journal (
  id uuid primary key default gen_random_uuid(),
  pages_auth_id uuid not null references public.pages_auth(id) on delete restrict,
  action text not null check (action in ('brouillon', 'publication', 'restauration', 'retour_defaut', 'abandon')),
  version integer,
  contenu jsonb not null,
  changements jsonb not null default '[]'::jsonb,
  auteur uuid references auth.users(id) on delete set null default auth.uid(),
  cree_le timestamptz not null default now()
);
create index pages_auth_journal_cible on public.pages_auth_journal (pages_auth_id, cree_le desc);
create trigger pages_auth_journal_immuable before update or delete on public.pages_auth_journal
for each row execute function public.refuser_modification_journal();
alter table public.pages_auth_journal enable row level security;
revoke all on public.pages_auth_journal from public, anon, authenticated;

-- Adresse de connexion propre à un établissement (facultative) : #/connexion/<adresse>.
-- Une adresse est unique entre clients et établissements.
alter table public.etablissement_identite
  add column adresse_connexion text unique check (adresse_connexion is null or adresse_connexion ~ '^[a-z0-9][a-z0-9-]{2,39}$');

create function public.verifier_adresse_connexion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.adresse_connexion is null then
    return new;
  end if;
  if (tg_table_name = 'client_identite' and exists (select 1 from public.etablissement_identite i where i.adresse_connexion = new.adresse_connexion))
     or (tg_table_name = 'etablissement_identite' and exists (select 1 from public.client_identite c where c.adresse_connexion = new.adresse_connexion)) then
    raise exception 'Adresse de connexion déjà utilisée' using errcode = '23505';
  end if;
  return new;
end
$$;
revoke execute on function public.verifier_adresse_connexion() from public, anon, authenticated;
create trigger client_identite_adresse_unique before insert or update of adresse_connexion on public.client_identite
for each row execute function public.verifier_adresse_connexion();
create trigger etablissement_identite_adresse_unique before insert or update of adresse_connexion on public.etablissement_identite
for each row execute function public.verifier_adresse_connexion();

-- ---------------------------------------------------------------------------
-- 3. Droits et résolution du niveau
-- ---------------------------------------------------------------------------
-- Plateforme : super administrateurs. Client et établissement : équipe Agence Elite.
-- p_creer : crée la ligne au premier enregistrement.
create function public.cible_pages_auth(p_niveau text, p_cible uuid, p_creer boolean)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_niveau = 'plateforme' then
    if p_creer then perform public.exiger_super_admin(); else perform public.exiger_editeur(); end if;
    select id into v_id from public.pages_auth where niveau = 'plateforme';
    if v_id is null and p_creer then
      insert into public.pages_auth (niveau) values ('plateforme') returning id into v_id;
    end if;
  elsif p_niveau = 'client' then
    perform public.exiger_editeur();
    if not exists (select 1 from public.clients where id = p_cible) then
      raise exception 'Client introuvable' using errcode = 'P0002';
    end if;
    select id into v_id from public.pages_auth where client_id = p_cible;
    if v_id is null and p_creer then
      insert into public.pages_auth (niveau, client_id) values ('client', p_cible) returning id into v_id;
    end if;
  elsif p_niveau = 'etablissement' then
    perform public.exiger_editeur();
    if not exists (select 1 from public.etablissements where id = p_cible) then
      raise exception 'Établissement introuvable' using errcode = 'P0002';
    end if;
    select id into v_id from public.pages_auth where etablissement_id = p_cible;
    if v_id is null and p_creer then
      insert into public.pages_auth (niveau, etablissement_id) values ('etablissement', p_cible) returning id into v_id;
    end if;
  else
    raise exception 'Niveau inconnu' using errcode = '22023';
  end if;
  return v_id;
end
$$;
revoke execute on function public.cible_pages_auth(text, uuid, boolean) from public, anon, authenticated;

-- Contenu publié hérité des niveaux au-dessus (sans le niveau lui-même).
create function public.pages_auth_herite(p_niveau text, p_cible uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_niveau = 'plateforme' then '{}'::jsonb
              else coalesce((select publie from public.pages_auth where niveau = 'plateforme'), '{}'::jsonb) end
    || case p_niveau
         when 'etablissement' then coalesce((select pa.publie from public.pages_auth pa join public.etablissements e on e.client_id = pa.client_id
                                             where e.id = p_cible), '{}'::jsonb)
         else '{}'::jsonb
       end
$$;
revoke execute on function public.pages_auth_herite(text, uuid) from public, anon, authenticated;

-- Identité (nom, logo, couleur) héritée de l'identité générale pour ce niveau.
create function public.marque_niveau(p_niveau text, p_cible uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case p_niveau
    when 'etablissement' then (
      select jsonb_build_object('nom_logiciel', m ->> 'nom_logiciel', 'nom_court', m ->> 'nom_court', 'sous_titre', m ->> 'sous_titre',
                                'logo_url', m ->> 'logo_url', 'favicon_url', m ->> 'favicon_url', 'couleur_accent', m ->> 'couleur_accent')
      from (select public.identite_effective(p_cible) m) x)
    else (
      select jsonb_build_object(
        'nom_logiciel', coalesce(ci.nom_logiciel, p.nom_logiciel), 'nom_court', coalesce(ci.nom_court, p.nom_court),
        'sous_titre', coalesce(ci.sous_titre, p.sous_titre), 'logo_url', coalesce(ci.logo_url, p.logo_url),
        'favicon_url', coalesce(ci.favicon_url, p.favicon_url), 'couleur_accent', coalesce(ci.couleur_accent, p.couleur_accent))
      from public.plateforme_identite p
      left join public.client_identite ci on p_niveau = 'client' and ci.client_id = p_cible)
  end
$$;
revoke execute on function public.marque_niveau(text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Lecture côté éditeur
-- ---------------------------------------------------------------------------
create function public.editeur_pages_auth(p_niveau text, p_cible uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  ligne public.pages_auth%rowtype;
  v_nom text;
  v_adresse text;
begin
  perform public.exiger_editeur();
  if p_niveau = 'plateforme' then
    v_nom := 'Plateforme';
  elsif p_niveau = 'client' then
    select c.nom, ci.adresse_connexion into v_nom, v_adresse
    from public.clients c left join public.client_identite ci on ci.client_id = c.id where c.id = p_cible;
    if v_nom is null then raise exception 'Client introuvable' using errcode = 'P0002'; end if;
  elsif p_niveau = 'etablissement' then
    select e.nom || ' (' || c.nom || ')', i.adresse_connexion into v_nom, v_adresse
    from public.etablissements e join public.clients c on c.id = e.client_id
    left join public.etablissement_identite i on i.etablissement_id = e.id where e.id = p_cible;
    if v_nom is null then raise exception 'Établissement introuvable' using errcode = 'P0002'; end if;
  else
    raise exception 'Niveau inconnu' using errcode = '22023';
  end if;
  select * into ligne from public.pages_auth pa
  where (p_niveau = 'plateforme' and pa.niveau = 'plateforme')
     or (p_niveau = 'client' and pa.client_id = p_cible)
     or (p_niveau = 'etablissement' and pa.etablissement_id = p_cible);
  v_id := ligne.id;
  return jsonb_build_object(
    'niveau', p_niveau,
    'cible', p_cible,
    'nom', v_nom,
    'adresse_connexion', v_adresse,
    'modifiable', case when p_niveau = 'plateforme' then public.est_super_admin() else true end,
    'brouillon', coalesce(ligne.brouillon, '{}'::jsonb),
    'publie', coalesce(ligne.publie, '{}'::jsonb),
    'version', coalesce(ligne.version, 0),
    'publie_le', ligne.publie_le,
    'brouillon_modifie_le', ligne.brouillon_modifie_le,
    'en_attente', coalesce(ligne.brouillon <> ligne.publie, false),
    'herite', public.pages_auth_herite(p_niveau, p_cible),
    'marque', public.marque_niveau(p_niveau, p_cible),
    'journal', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', j.id, 'action', j.action, 'version', j.version, 'cree_le', j.cree_le, 'changements', j.changements,
        'auteur', coalesce(nullif(pr.nom_complet, ''), u.email)
      ) order by j.cree_le desc)
      from (select * from public.pages_auth_journal where pages_auth_id = v_id order by cree_le desc limit 60) j
      left join public.profils pr on pr.id = j.auteur
      left join auth.users u on u.id = j.auteur
    ), '[]'::jsonb)
  );
end
$$;
revoke execute on function public.editeur_pages_auth(text, uuid) from public, anon;
grant execute on function public.editeur_pages_auth(text, uuid) to authenticated;

-- Vue d'ensemble : clients et établissements, avec l'état de leurs pages.
create function public.editeur_liste_pages_auth()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exiger_editeur();
  return jsonb_build_object(
    'plateforme', (select jsonb_build_object('version', version, 'en_attente', brouillon <> publie, 'publie_le', publie_le)
                   from public.pages_auth where niveau = 'plateforme'),
    'clients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'nom', c.nom, 'statut', c.statut, 'adresse_connexion', ci.adresse_connexion,
        'version', pa.version, 'en_attente', pa.brouillon <> pa.publie, 'personnalise', pa.publie <> '{}'::jsonb,
        'etablissements', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', e.id, 'nom', e.nom, 'adresse_connexion', i.adresse_connexion,
            'version', pe.version, 'en_attente', pe.brouillon <> pe.publie, 'personnalise', pe.publie <> '{}'::jsonb
          ) order by e.nom)
          from public.etablissements e
          left join public.etablissement_identite i on i.etablissement_id = e.id
          left join public.pages_auth pe on pe.etablissement_id = e.id
          where e.client_id = c.id and e.statut <> 'archive'
        ), '[]'::jsonb)
      ) order by c.nom)
      from public.clients c
      left join public.client_identite ci on ci.client_id = c.id
      left join public.pages_auth pa on pa.client_id = c.id
      where c.statut <> 'archive'
    ), '[]'::jsonb)
  );
end
$$;
revoke execute on function public.editeur_liste_pages_auth() from public, anon;
grant execute on function public.editeur_liste_pages_auth() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Écriture : brouillon, publication, restauration, retour aux valeurs par défaut
-- ---------------------------------------------------------------------------
create function public.enregistrer_brouillon_pages_auth(p_niveau text, p_cible uuid, p_contenu jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid := public.cible_pages_auth(p_niveau, p_cible, true);
  propre jsonb := public.valider_pages_auth(p_contenu);
  avant jsonb;
begin
  select brouillon into avant from public.pages_auth where id = v_id for update;
  if avant = propre then
    return propre;
  end if;
  update public.pages_auth set brouillon = propre, brouillon_modifie_le = now(), brouillon_modifie_par = auth.uid() where id = v_id;
  insert into public.pages_auth_journal (pages_auth_id, action, contenu, changements)
  values (v_id, 'brouillon', propre, public.diff_pages_auth(avant, propre));
  return propre;
end
$$;
revoke execute on function public.enregistrer_brouillon_pages_auth(text, uuid, jsonb) from public, anon;
grant execute on function public.enregistrer_brouillon_pages_auth(text, uuid, jsonb) to authenticated;

create function public.publier_pages_auth(p_niveau text, p_cible uuid default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid := public.cible_pages_auth(p_niveau, p_cible, true);
  ligne public.pages_auth%rowtype;
  propre jsonb;
begin
  select * into ligne from public.pages_auth where id = v_id for update;
  -- Revalidé à la publication (le catalogue a pu se resserrer depuis l'enregistrement du brouillon).
  propre := public.valider_pages_auth(ligne.brouillon);
  if propre = ligne.publie then
    raise exception 'Aucune modification à publier' using errcode = '22023';
  end if;
  update public.pages_auth
  set publie = propre, brouillon = propre, version = version + 1, publie_le = now(), publie_par = auth.uid()
  where id = v_id;
  insert into public.pages_auth_journal (pages_auth_id, action, version, contenu, changements)
  values (v_id, 'publication', ligne.version + 1, propre, public.diff_pages_auth(ligne.publie, propre));
  return ligne.version + 1;
end
$$;
revoke execute on function public.publier_pages_auth(text, uuid) from public, anon;
grant execute on function public.publier_pages_auth(text, uuid) to authenticated;

-- Remet une version publiée dans le brouillon (à vérifier dans l'aperçu, puis publier).
create function public.restaurer_pages_auth(p_niveau text, p_cible uuid, p_entree_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid := public.cible_pages_auth(p_niveau, p_cible, true);
  entree public.pages_auth_journal%rowtype;
  avant jsonb;
  propre jsonb;
begin
  select * into entree from public.pages_auth_journal where id = p_entree_id and pages_auth_id = v_id and action = 'publication';
  if entree.id is null then
    raise exception 'Version introuvable pour ces pages' using errcode = 'P0002';
  end if;
  propre := public.valider_pages_auth(entree.contenu);
  select brouillon into avant from public.pages_auth where id = v_id for update;
  update public.pages_auth set brouillon = propre, brouillon_modifie_le = now(), brouillon_modifie_par = auth.uid() where id = v_id;
  insert into public.pages_auth_journal (pages_auth_id, action, version, contenu, changements)
  values (v_id, 'restauration', entree.version, propre, public.diff_pages_auth(avant, propre));
  return propre;
end
$$;
revoke execute on function public.restaurer_pages_auth(text, uuid, uuid) from public, anon;
grant execute on function public.restaurer_pages_auth(text, uuid, uuid) to authenticated;

-- p_mode : 'defaut' (brouillon vidé : tout est hérité) ou 'publie' (abandon du brouillon).
create function public.reinitialiser_pages_auth(p_niveau text, p_cible uuid, p_mode text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid := public.cible_pages_auth(p_niveau, p_cible, true);
  ligne public.pages_auth%rowtype;
  propre jsonb;
begin
  if p_mode not in ('defaut', 'publie') then
    raise exception 'Mode inconnu' using errcode = '22023';
  end if;
  select * into ligne from public.pages_auth where id = v_id for update;
  propre := case when p_mode = 'defaut' then '{}'::jsonb else ligne.publie end;
  if propre = ligne.brouillon then
    return propre;
  end if;
  update public.pages_auth set brouillon = propre, brouillon_modifie_le = now(), brouillon_modifie_par = auth.uid() where id = v_id;
  insert into public.pages_auth_journal (pages_auth_id, action, contenu, changements)
  values (v_id, case when p_mode = 'defaut' then 'retour_defaut' else 'abandon' end, propre, public.diff_pages_auth(ligne.brouillon, propre));
  return propre;
end
$$;
revoke execute on function public.reinitialiser_pages_auth(text, uuid, text) from public, anon;
grant execute on function public.reinitialiser_pages_auth(text, uuid, text) to authenticated;

-- Adresse de connexion d'un établissement (équipe Agence Elite).
create function public.enregistrer_adresse_connexion_etablissement(p_etablissement_id uuid, p_adresse text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v text := nullif(lower(btrim(coalesce(p_adresse, ''))), '');
begin
  perform public.exiger_editeur();
  if not exists (select 1 from public.etablissements where id = p_etablissement_id) then
    raise exception 'Établissement introuvable' using errcode = 'P0002';
  end if;
  insert into public.etablissement_identite (etablissement_id, adresse_connexion) values (p_etablissement_id, v)
  on conflict (etablissement_id) do update set adresse_connexion = excluded.adresse_connexion;
end
$$;
revoke execute on function public.enregistrer_adresse_connexion_etablissement(uuid, text) from public, anon;
grant execute on function public.enregistrer_adresse_connexion_etablissement(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Lecture publique (sans connexion) : contenu PUBLIÉ seulement
-- ---------------------------------------------------------------------------
-- Adresse inconnue, client ou établissement non actif : pages de la plateforme.
create function public.pages_connexion(p_adresse text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_adresse text := lower(btrim(coalesce(p_adresse, '')));
  v_client uuid;
  v_etab uuid;
  plateforme jsonb := coalesce((select publie from public.pages_auth where niveau = 'plateforme'), '{}'::jsonb);
begin
  if v_adresse ~ '^[a-z0-9][a-z0-9-]{2,39}$' then
    select e.id, e.client_id into v_etab, v_client
    from public.etablissement_identite i
    join public.etablissements e on e.id = i.etablissement_id and e.statut = 'actif'
    join public.clients c on c.id = e.client_id and c.statut = 'actif'
    where i.adresse_connexion = v_adresse;
    if v_etab is null then
      select ci.client_id into v_client
      from public.client_identite ci
      join public.clients c on c.id = ci.client_id and c.statut = 'actif'
      where ci.adresse_connexion = v_adresse;
    end if;
  end if;
  if v_etab is not null then
    return jsonb_build_object('niveau', 'etablissement', 'adresse', v_adresse,
      'marque', public.marque_niveau('etablissement', v_etab),
      'contenu', plateforme
        || coalesce((select publie from public.pages_auth where client_id = v_client), '{}'::jsonb)
        || coalesce((select publie from public.pages_auth where etablissement_id = v_etab), '{}'::jsonb));
  elsif v_client is not null then
    return jsonb_build_object('niveau', 'client', 'adresse', v_adresse,
      'marque', public.marque_niveau('client', v_client),
      'contenu', plateforme || coalesce((select publie from public.pages_auth where client_id = v_client), '{}'::jsonb));
  end if;
  return jsonb_build_object('niveau', 'plateforme', 'adresse', null, 'marque', public.marque_niveau('plateforme', null), 'contenu', plateforme);
end
$$;
revoke execute on function public.pages_connexion(text) from public;
grant execute on function public.pages_connexion(text) to anon, authenticated;
