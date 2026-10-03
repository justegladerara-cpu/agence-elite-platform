-- Site web (2026-10-03) : le module « site_web », jusqu'ici « Prévu », devient réel.
-- Un site par établissement, public à l'adresse #/site/<adresse>[/<page>] : pages construites avec des blocs contrôlés
-- (hero, texte, image, galerie, appel à l'action, services, produits de la boutique, témoignages, FAQ, contact avec
-- formulaire). Brouillon puis publication ; navigation déduite des pages ; SEO (titre, description) par page ;
-- couleur et thème choisis dans une palette. Aucun HTML, CSS ou script fourni par le client : chaque bloc est un type
-- connu dont la base ne garde que les champs attendus, texte brut, longueurs bornées, liens et images filtrés.
-- Les messages du formulaire arrivent dans l'espace (notification). Rien ne se supprime : une page s'archive.
-- Le module est accordé par Agence Elite comme module supplémentaire (centre des modules) : aucune offre n'est modifiée.

-- ---------------------------------------------------------------------------
-- 1. Catalogue et droits
-- ---------------------------------------------------------------------------
update public.modules set
  description = 'Site vitrine par blocs contrôlés : pages, navigation, SEO, brouillon et publication, formulaire de contact.',
  documentation = 'docs/SITE_WEB.md'
where id = 'site_web';

insert into public.permissions (id, module_id, description) values
  ('site_web.lire', 'site_web', 'Voir le site, ses brouillons et les messages reçus'),
  ('site_web.modifier', 'site_web', 'Modifier les pages en brouillon et traiter les messages'),
  ('site_web.publier', 'site_web', 'Publier ou retirer les pages, régler le site')
on conflict (id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['gerant', 'responsable']) r
cross join unnest(array['site_web.lire', 'site_web.modifier', 'site_web.publier']) p
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id) values
  ('commercial', 'site_web.lire'), ('commercial', 'site_web.modifier'),
  ('responsable_hub', 'site_web.lire'), ('employe', 'site_web.lire'), ('lecteur', 'site_web.lire')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
create table public.sites (
  etablissement_id uuid primary key references public.etablissements(id) on delete restrict,
  adresse text not null unique check (adresse ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  titre text not null check (btrim(titre) <> '' and length(titre) <= 120),
  description text check (description is null or length(description) <= 300),
  publie boolean not null default false,
  couleur text check (couleur is null or couleur = any (public.couleurs_marque())),
  theme text not null default 'clair' check (theme in ('clair', 'sombre')),
  pied_de_page text check (pied_de_page is null or length(pied_de_page) <= 500),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);

create table public.site_pages (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.sites(etablissement_id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  titre text not null check (btrim(titre) <> '' and length(titre) <= 80),
  description_seo text check (description_seo is null or length(description_seo) <= 300),
  ordre integer not null default 0,
  dans_menu boolean not null default true,
  accueil boolean not null default false,
  brouillon jsonb not null default '[]' check (jsonb_typeof(brouillon) = 'array' and octet_length(brouillon::text) <= 3000000),
  publie jsonb check (publie is null or jsonb_typeof(publie) = 'array'),
  publiee boolean not null default false,
  publiee_le timestamptz,
  publiee_par uuid references auth.users(id) on delete restrict,
  archivee boolean not null default false,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (etablissement_id, slug),
  check (not publiee or publie is not null),
  check (not (accueil and archivee))
);
create unique index site_pages_une_accueil on public.site_pages(etablissement_id) where accueil;

create table public.site_messages (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.sites(etablissement_id) on delete restrict,
  page_id uuid references public.site_pages(id) on delete restrict,
  nom text not null check (btrim(nom) <> '' and length(nom) <= 120),
  telephone text check (telephone is null or length(telephone) <= 40),
  email text check (email is null or (length(email) <= 160 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  message text not null check (btrim(message) <> '' and length(message) <= 2000),
  statut text not null default 'nouveau' check (statut in ('nouveau', 'traite')),
  traite_par uuid references auth.users(id) on delete restrict,
  traite_le timestamptz,
  cree_le timestamptz not null default now(),
  check (telephone is not null or email is not null)
);
create index site_messages_etablissement_idx on public.site_messages(etablissement_id, cree_le desc);

do $$
declare
  nom_table text;
begin
  foreach nom_table in array array['sites', 'site_pages'] loop
    execute format('create trigger %I_modifie_le before update on public.%I for each row execute function public.fixer_modifie_le()', nom_table, nom_table);
  end loop;
  foreach nom_table in array array['sites', 'site_pages', 'site_messages'] loop
    execute format('create trigger %I_sans_suppression before delete on public.%I for each row execute function public.refuser_suppression()', nom_table, nom_table);
    execute format('create trigger %I_verrou_etablissement before update on public.%I for each row execute function public.verrouiller_etablissement_id()', nom_table, nom_table);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.journaliser_modification()', nom_table, nom_table);
    execute format('alter table public.%I enable row level security', nom_table);
    execute format('create policy lecture on public.%I for select to authenticated using (public.lecture_autorisee(etablissement_id, ''site_web.lire''))', nom_table);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Blocs contrôlés
-- ---------------------------------------------------------------------------
-- Texte brut borné (jamais interprété comme HTML à l'écran).
create function public.texte_site(p jsonb, p_cle text, p_max integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(left(btrim(regexp_replace(coalesce(p ->> p_cle, ''), '[\x01-\x08\x0B\x0C\x0E-\x1F]', '', 'g')), p_max), '')
$$;

-- Lien accepté : https, tel:, mailto:, page du site (/slug) ou boutique (/boutique). Tout le reste est refusé.
create function public.lien_site(p jsonb, p_cle text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := nullif(btrim(coalesce(p ->> p_cle, '')), '');
begin
  if v is null then
    return null;
  end if;
  if length(v) > 500 or v !~ '^(https://[^\s<>"]+|tel:\+?[0-9 ()-]{3,30}|mailto:[^@\s<>"]+@[^@\s<>"]+|/[a-z0-9][a-z0-9-]{0,39}|/)$' then
    raise exception 'Lien refusé : « % » (https://…, tel:…, mailto:… ou /page du site)', left(v, 60);
  end if;
  return v;
end
$$;

create function public.image_site(p jsonb, p_cle text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := nullif(btrim(coalesce(p ->> p_cle, '')), '');
begin
  if v is not null and (not public.image_acceptable(v) or length(v) > 1500000) then
    raise exception 'Image refusée : une image importée (PNG, JPEG, WebP, GIF) ou une adresse https://';
  end if;
  return v;
end
$$;

-- Liste d'éléments d'un bloc (services, témoignages, FAQ, galerie) : au plus p_max, champs connus seulement.
create function public.elements_site(p jsonb, p_champs text[], p_max integer)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  e jsonb;
  champ text;
  propre jsonb;
  resultat jsonb := '[]';
begin
  if p -> 'elements' is null then
    return resultat;
  end if;
  if jsonb_typeof(p -> 'elements') <> 'array' then
    raise exception 'Bloc mal formé';
  end if;
  if jsonb_array_length(p -> 'elements') > p_max then
    raise exception 'Trop d''éléments dans un bloc (% au plus)', p_max;
  end if;
  for e in select * from jsonb_array_elements(p -> 'elements') loop
    if jsonb_typeof(e) <> 'object' then
      raise exception 'Bloc mal formé';
    end if;
    propre := '{}';
    foreach champ in array p_champs loop
      propre := propre || jsonb_build_object(champ, case
        when champ = 'image' then public.image_site(e, champ)
        when champ in ('texte', 'reponse') then public.texte_site(e, champ, 1500)
        else public.texte_site(e, champ, 160) end);
    end loop;
    resultat := resultat || jsonb_build_array(jsonb_strip_nulls(propre));
  end loop;
  return resultat;
end
$$;

-- Nettoie une liste de blocs : type connu, champs attendus seulement, au plus 30 blocs.
create function public.blocs_site_valides(p_blocs jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  b jsonb;
  t text;
  propre jsonb;
  resultat jsonb := '[]';
begin
  if p_blocs is null or jsonb_typeof(p_blocs) <> 'array' then
    raise exception 'Blocs mal formés';
  end if;
  if jsonb_array_length(p_blocs) > 30 then
    raise exception 'Une page compte au plus 30 blocs';
  end if;
  for b in select * from jsonb_array_elements(p_blocs) loop
    if jsonb_typeof(b) <> 'object' then
      raise exception 'Bloc mal formé';
    end if;
    t := b ->> 'type';
    propre := case t
      when 'hero' then jsonb_build_object('titre', public.texte_site(b, 'titre', 120), 'sous_titre', public.texte_site(b, 'sous_titre', 300),
        'image', public.image_site(b, 'image'), 'bouton_texte', public.texte_site(b, 'bouton_texte', 40), 'bouton_lien', public.lien_site(b, 'bouton_lien'))
      when 'texte' then jsonb_build_object('titre', public.texte_site(b, 'titre', 120), 'texte', public.texte_site(b, 'texte', 5000))
      when 'image' then jsonb_build_object('image', public.image_site(b, 'image'), 'legende', public.texte_site(b, 'legende', 200))
      when 'galerie' then jsonb_build_object('titre', public.texte_site(b, 'titre', 120), 'elements', public.elements_site(b, array['image', 'legende'], 12))
      when 'cta' then jsonb_build_object('titre', public.texte_site(b, 'titre', 120), 'texte', public.texte_site(b, 'texte', 500),
        'bouton_texte', public.texte_site(b, 'bouton_texte', 40), 'bouton_lien', public.lien_site(b, 'bouton_lien'))
      when 'services' then jsonb_build_object('titre', public.texte_site(b, 'titre', 120), 'elements', public.elements_site(b, array['titre', 'texte', 'image'], 12))
      when 'produits' then jsonb_build_object('titre', public.texte_site(b, 'titre', 120),
        'nombre', greatest(1, least(12, coalesce(nullif(b ->> 'nombre', '')::integer, 6))))
      when 'temoignages' then jsonb_build_object('titre', public.texte_site(b, 'titre', 120), 'elements', public.elements_site(b, array['nom', 'texte'], 12))
      when 'faq' then jsonb_build_object('titre', public.texte_site(b, 'titre', 120), 'elements', public.elements_site(b, array['question', 'reponse'], 20))
      when 'contact' then jsonb_build_object('titre', public.texte_site(b, 'titre', 120), 'texte', public.texte_site(b, 'texte', 500),
        'telephone', public.texte_site(b, 'telephone', 40), 'whatsapp', public.texte_site(b, 'whatsapp', 40), 'email', public.texte_site(b, 'email', 160),
        'adresse', public.texte_site(b, 'adresse', 300), 'horaires', public.texte_site(b, 'horaires', 300),
        'formulaire', coalesce((b ->> 'formulaire')::boolean, true))
      else null end;
    if propre is null then
      raise exception 'Type de bloc inconnu : %', coalesce(t, '(aucun)');
    end if;
    resultat := resultat || jsonb_build_array(jsonb_build_object('type', t) || jsonb_strip_nulls(propre));
  end loop;
  if octet_length(resultat::text) > 3000000 then
    raise exception 'Page trop lourde : réduisez le nombre ou la taille des images';
  end if;
  return resultat;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Fonctions de l'établissement
-- ---------------------------------------------------------------------------
-- p : { adresse, titre, description?, publie?, couleur?, theme?, pied_de_page? }
create function public.enregistrer_site(p_etablissement_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_adresse text := lower(btrim(coalesce(p ->> 'adresse', '')));
  v_couleur text := nullif(lower(btrim(coalesce(p ->> 'couleur', ''))), '');
begin
  perform public.exiger_permission(p_etablissement_id, 'site_web.publier');
  if v_adresse !~ '^[a-z0-9][a-z0-9-]{2,39}$' then
    raise exception 'Adresse du site invalide : 3 à 40 lettres minuscules, chiffres ou tirets';
  end if;
  if exists (select 1 from public.sites where adresse = v_adresse and etablissement_id <> p_etablissement_id) then
    raise exception 'L''adresse « % » est déjà prise', v_adresse;
  end if;
  if coalesce(btrim(p ->> 'titre'), '') = '' then
    raise exception 'Le nom du site est obligatoire';
  end if;
  if v_couleur is not null and not v_couleur = any (public.couleurs_marque()) then
    raise exception 'Choisissez une couleur de la palette';
  end if;
  if coalesce((p ->> 'publie')::boolean, false)
     and not exists (select 1 from public.site_pages where etablissement_id = p_etablissement_id and accueil and publiee) then
    raise exception 'Publiez d''abord la page d''accueil';
  end if;
  insert into public.sites (etablissement_id, adresse, titre, description, publie, couleur, theme, pied_de_page)
  values (p_etablissement_id, v_adresse, left(btrim(p ->> 'titre'), 120), public.texte_site(p, 'description', 300),
    coalesce((p ->> 'publie')::boolean, false), v_couleur, coalesce(nullif(p ->> 'theme', ''), 'clair'), public.texte_site(p, 'pied_de_page', 500))
  on conflict (etablissement_id) do update set adresse = excluded.adresse, titre = excluded.titre, description = excluded.description,
    publie = excluded.publie, couleur = excluded.couleur, theme = excluded.theme, pied_de_page = excluded.pied_de_page;
end
$$;

-- p : { id?, slug, titre, description_seo?, ordre?, dans_menu?, accueil?, archivee? }. La première page devient l'accueil.
create function public.enregistrer_page_site(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p ->> 'id', '')::uuid;
  v_slug text := lower(btrim(coalesce(p ->> 'slug', '')));
  v_accueil boolean;
  v_archivee boolean := coalesce((p ->> 'archivee')::boolean, false);
begin
  perform public.exiger_permission(p_etablissement_id, 'site_web.modifier');
  if not exists (select 1 from public.sites where etablissement_id = p_etablissement_id) then
    raise exception 'Réglez d''abord le site (adresse et nom)';
  end if;
  if v_slug !~ '^[a-z0-9][a-z0-9-]{0,39}$' or v_slug = 'boutique' then
    raise exception 'Adresse de page invalide : lettres minuscules, chiffres ou tirets (« boutique » est réservé)';
  end if;
  if coalesce(btrim(p ->> 'titre'), '') = '' then
    raise exception 'Le titre de la page est obligatoire';
  end if;
  if exists (select 1 from public.site_pages where etablissement_id = p_etablissement_id and slug = v_slug and id is distinct from resultat) then
    raise exception 'Une page « % » existe déjà', v_slug;
  end if;
  v_accueil := coalesce((p ->> 'accueil')::boolean, false)
    or not exists (select 1 from public.site_pages where etablissement_id = p_etablissement_id and accueil and id is distinct from resultat);
  if v_accueil and v_archivee then
    raise exception 'La page d''accueil ne s''archive pas : choisissez d''abord une autre page d''accueil';
  end if;
  if v_accueil then
    update public.site_pages set accueil = false where etablissement_id = p_etablissement_id and accueil and id is distinct from resultat;
  end if;
  if resultat is null then
    insert into public.site_pages (etablissement_id, slug, titre, description_seo, ordre, dans_menu, accueil)
    values (p_etablissement_id, v_slug, left(btrim(p ->> 'titre'), 80), public.texte_site(p, 'description_seo', 300),
      coalesce(nullif(p ->> 'ordre', '')::integer, 0), coalesce((p ->> 'dans_menu')::boolean, true), v_accueil)
    returning id into resultat;
  else
    update public.site_pages set slug = v_slug, titre = left(btrim(p ->> 'titre'), 80), description_seo = public.texte_site(p, 'description_seo', 300),
      ordre = coalesce(nullif(p ->> 'ordre', '')::integer, 0), dans_menu = coalesce((p ->> 'dans_menu')::boolean, true), accueil = v_accueil,
      archivee = v_archivee, publiee = publiee and not v_archivee
    where id = resultat and etablissement_id = p_etablissement_id;
    if not found then
      raise exception 'Page introuvable';
    end if;
  end if;
  return resultat;
end
$$;

-- Brouillon : les blocs sont nettoyés par la base ; la version publiée ne change pas.
create function public.enregistrer_blocs_page_site(p_page_id uuid, p_blocs jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pg public.site_pages%rowtype;
  propres jsonb;
begin
  select * into pg from public.site_pages where id = p_page_id for update;
  if pg.id is null then
    raise exception 'Page introuvable';
  end if;
  perform public.exiger_permission(pg.etablissement_id, 'site_web.modifier');
  if pg.archivee then
    raise exception 'Page archivée';
  end if;
  propres := public.blocs_site_valides(p_blocs);
  update public.site_pages set brouillon = propres where id = pg.id;
  return propres;
end
$$;

-- Publication : le brouillon devient la version en ligne ; p_publier faux retire la page du site.
create function public.publier_page_site(p_page_id uuid, p_publier boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pg public.site_pages%rowtype;
begin
  select * into pg from public.site_pages where id = p_page_id for update;
  if pg.id is null then
    raise exception 'Page introuvable';
  end if;
  perform public.exiger_permission(pg.etablissement_id, 'site_web.publier');
  if p_publier then
    if pg.archivee then
      raise exception 'Page archivée';
    end if;
    if jsonb_array_length(pg.brouillon) = 0 then
      raise exception 'La page est vide : ajoutez au moins un bloc';
    end if;
    update public.site_pages set publie = public.blocs_site_valides(pg.brouillon), publiee = true, publiee_le = now(), publiee_par = auth.uid()
    where id = pg.id;
  else
    if pg.accueil and exists (select 1 from public.sites where etablissement_id = pg.etablissement_id and publie) then
      raise exception 'La page d''accueil d''un site en ligne ne se retire pas : mettez d''abord le site hors ligne';
    end if;
    update public.site_pages set publiee = false where id = pg.id;
  end if;
end
$$;

create function public.traiter_message_site(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.site_messages%rowtype;
begin
  select * into m from public.site_messages where id = p_message_id for update;
  if m.id is null then
    raise exception 'Message introuvable';
  end if;
  perform public.exiger_permission(m.etablissement_id, 'site_web.modifier');
  if m.statut = 'traite' then
    raise exception 'Message déjà traité';
  end if;
  update public.site_messages set statut = 'traite', traite_par = auth.uid(), traite_le = now() where id = m.id;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Fonctions publiques (visiteur anonyme) : seulement ce qui est publié
-- ---------------------------------------------------------------------------
create function public.site_ouvert(p_adresse text)
returns public.sites
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.sites%rowtype;
begin
  select * into s from public.sites where adresse = lower(btrim(coalesce(p_adresse, ''))) and publie;
  if s.etablissement_id is null or not public.module_actif(s.etablissement_id, 'site_web') then
    raise exception 'Site introuvable ou hors ligne';
  end if;
  return s;
end
$$;

-- Page publiée (accueil si p_slug vide), menu, identité ; produits de la boutique en ligne si un bloc les demande.
create function public.site_public(p_adresse text, p_slug text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.sites%rowtype;
  pg public.site_pages%rowtype;
  b public.boutiques%rowtype;
  produits jsonb;
begin
  s := public.site_ouvert(p_adresse);
  select * into pg from public.site_pages
  where etablissement_id = s.etablissement_id and publiee and not archivee
    and (case when coalesce(btrim(p_slug), '') = '' then accueil else slug = lower(btrim(p_slug)) end);
  if pg.id is null then
    raise exception 'Page introuvable';
  end if;
  if exists (select 1 from jsonb_array_elements(pg.publie) x where x ->> 'type' = 'produits') then
    select * into b from public.boutiques where etablissement_id = s.etablissement_id and publiee;
    if b.etablissement_id is not null and public.module_actif(s.etablissement_id, 'ecommerce_boutique') then
      produits := jsonb_build_object('adresse', b.adresse, 'liste', public.boutique_publique(b.adresse) -> 'produits');
    end if;
  end if;
  return jsonb_build_object(
    'adresse', s.adresse, 'titre', s.titre, 'description', s.description, 'couleur', s.couleur, 'theme', s.theme, 'pied_de_page', s.pied_de_page,
    'logo', (select i.logo_url from public.etablissement_identite i where i.etablissement_id = s.etablissement_id),
    'menu', coalesce((select jsonb_agg(jsonb_build_object('slug', x.slug, 'titre', x.titre, 'accueil', x.accueil) order by x.accueil desc, x.ordre, x.titre)
      from public.site_pages x where x.etablissement_id = s.etablissement_id and x.publiee and not x.archivee and x.dans_menu), '[]'),
    'page', jsonb_build_object('id', pg.id, 'slug', pg.slug, 'titre', pg.titre, 'description_seo', pg.description_seo, 'accueil', pg.accueil, 'blocs', pg.publie),
    'boutique', produits
  );
end
$$;

-- Formulaire de contact. p : { nom, telephone?, email?, message, page_id? } ; limites anti-abus.
create function public.envoyer_message_site(p_adresse text, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.sites%rowtype;
  v_tel text := public.texte_site(p, 'telephone', 40);
  v_email text := lower(public.texte_site(p, 'email', 160));
  v_page uuid;
begin
  s := public.site_ouvert(p_adresse);
  if public.texte_site(p, 'nom', 120) is null then
    raise exception 'Indiquez votre nom';
  end if;
  if public.texte_site(p, 'message', 2000) is null then
    raise exception 'Écrivez votre message';
  end if;
  if v_tel is null and v_email is null then
    raise exception 'Indiquez un téléphone ou un e-mail pour être recontacté';
  end if;
  if v_tel is not null and length(regexp_replace(v_tel, '[^0-9]', '', 'g')) not between 6 and 20 then
    raise exception 'Indiquez un numéro de téléphone valide';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Indiquez une adresse e-mail valide';
  end if;
  if (select count(*) from public.site_messages where etablissement_id = s.etablissement_id and cree_le > now() - interval '1 day'
      and ((v_tel is not null and regexp_replace(coalesce(telephone, ''), '[^0-9]', '', 'g') = regexp_replace(v_tel, '[^0-9]', '', 'g'))
        or (v_email is not null and email = v_email))) >= 3 then
    raise exception 'Message déjà reçu : l''établissement va vous recontacter';
  end if;
  if (select count(*) from public.site_messages where etablissement_id = s.etablissement_id and cree_le > now() - interval '1 hour') >= 30 then
    raise exception 'Trop de messages en ce moment : réessayez plus tard';
  end if;
  select id into v_page from public.site_pages
  where id = nullif(p ->> 'page_id', '')::uuid and etablissement_id = s.etablissement_id and publiee;
  insert into public.site_messages (etablissement_id, page_id, nom, telephone, email, message)
  values (s.etablissement_id, v_page, public.texte_site(p, 'nom', 120), v_tel, v_email, public.texte_site(p, 'message', 2000));
  perform public.notifier_permission(s.etablissement_id, 'site_web.modifier', 'site.message',
    'Message du site : ' || public.texte_site(p, 'nom', 120), left(public.texte_site(p, 'message', 2000), 140), 'siteweb/messages');
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Disponibilité et droits d'exécution
-- ---------------------------------------------------------------------------
update public.modules set statut = 'actif', version = '1.0' where id = 'site_web';
insert into public.solution_modules (solution_id, module_id, par_defaut) values ('services', 'site_web', false)
on conflict (solution_id, module_id) do nothing;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.enregistrer_site(uuid, jsonb)',
    'public.enregistrer_page_site(uuid, jsonb)',
    'public.enregistrer_blocs_page_site(uuid, jsonb)',
    'public.publier_page_site(uuid, boolean)',
    'public.traiter_message_site(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
  foreach signature in array array['public.site_public(text, text)', 'public.envoyer_message_site(text, jsonb)'] loop
    execute format('revoke execute on function %s from public', signature);
    execute format('grant execute on function %s to anon, authenticated', signature);
  end loop;
  foreach signature in array array[
    'public.site_ouvert(text)', 'public.texte_site(jsonb, text, integer)', 'public.lien_site(jsonb, text)', 'public.image_site(jsonb, text)',
    'public.elements_site(jsonb, text[], integer)', 'public.blocs_site_valides(jsonb)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', signature);
  end loop;
end
$$;
