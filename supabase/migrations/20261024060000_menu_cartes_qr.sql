-- Menu de la page mobile en cartes (demande de Juste, 2026-10-24) : sur le téléphone du client, le menu s'ouvre sur
-- une carte par rayon (« Nos bières », photo, nombre de choix) ; toucher une carte montre ses articles avec photo.
-- Additif : aucune donnée n'est modifiée ni effacée.
--   1. categories_articles.photo (facultative) + photo_categorie_article (droit articles.categories).
--   2. blocs_page_qr_verifies : bloc menu { affichage cartes|liste, recherche, cartes {rayon: {titre, cache}}, ordre }.
--      Le message tout prêt d'un bouton WhatsApp est son « texte » (déjà accepté).
--   3. page_qr_publique : rayons avec identifiant, photo et description ; articles avec identifiant, description et
--      « a_photo » (les photos des articles arrivent rayon par rayon : photos_menu_page_qr, sans compte).

-- ---------------------------------------------------------------------------
-- 1. Photo d'un rayon
-- ---------------------------------------------------------------------------
alter table public.categories_articles add column if not exists photo text
  check (public.image_acceptable(photo) and (photo is null or length(photo) <= 400000));

create function public.photo_categorie_article(p_categorie_id uuid, p_photo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.categories_articles%rowtype;
begin
  select * into c from public.categories_articles where id = p_categorie_id;
  if c.id is null then
    raise exception 'Catégorie introuvable';
  end if;
  perform public.exiger_permission(c.etablissement_id, 'articles.categories');
  if c.archivee_le is not null then
    raise exception 'Cette catégorie est archivée : restaurez-la avant de la modifier';
  end if;
  if nullif(p_photo, '') is not null and (not public.image_acceptable(p_photo) or length(p_photo) > 400000) then
    raise exception 'Photo refusée : choisissez une image plus petite (JPG, PNG ou WebP)';
  end if;
  update public.categories_articles set photo = nullif(p_photo, ''), modifie_le = now() where id = c.id;
end
$$;
revoke execute on function public.photo_categorie_article(uuid, text) from public, anon;
grant execute on function public.photo_categorie_article(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Blocs de la page : réglages du menu en cartes
-- ---------------------------------------------------------------------------
create or replace function public.blocs_page_qr_verifies(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  b jsonb;
  r jsonb := '[]'::jsonb;
  v jsonb;
  t text;
  cle text;
  limites jsonb := '{"titre": 80, "texte": 600, "libelle": 40, "bouton": 40, "merci": 200, "valeur": 300,
                     "instagram": 300, "facebook": 300, "tiktok": 300, "youtube": 300, "whatsapp": 25,
                     "reseau": 64, "mot_de_passe": 64}'::jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'array' then
    raise exception 'Page invalide';
  end if;
  if jsonb_array_length(p) > 25 then
    raise exception 'Pas plus de 25 blocs sur la page';
  end if;
  for b in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(b) <> 'object' then
      raise exception 'Bloc invalide';
    end if;
    t := b ->> 'type';
    if t is null or t not in ('entete', 'texte', 'bouton', 'menu', 'formulaire', 'reseaux', 'wifi') then
      raise exception 'Type de bloc inconnu';
    end if;
    v := jsonb_build_object('type', t);
    foreach cle in array array['titre', 'texte', 'libelle', 'bouton', 'merci', 'valeur'] loop
      if b ? cle and jsonb_typeof(b -> cle) = 'string' and btrim(b ->> cle) <> '' then
        if length(b ->> cle) > (limites ->> cle)::integer then
          raise exception 'Texte trop long dans un bloc (% caractères au plus)', limites ->> cle;
        end if;
        v := v || jsonb_build_object(cle, btrim(b ->> cle));
      end if;
    end loop;
    foreach cle in array array['logo', 'email', 'anniversaire', 'message', 'recherche'] loop
      if jsonb_typeof(b -> cle) = 'boolean' then
        v := v || jsonb_build_object(cle, (b ->> cle)::boolean);
      end if;
    end loop;
    if t = 'bouton' then
      if coalesce(b ->> 'action', '') not in ('destination', 'lien', 'whatsapp', 'appel', 'menu') then
        raise exception 'Bouton : choisissez ce qu''il ouvre';
      end if;
      if not v ? 'libelle' then
        raise exception 'Bouton : écrivez le texte du bouton';
      end if;
      v := v || jsonb_build_object('action', b ->> 'action');
      if b ->> 'action' = 'lien' and coalesce(v ->> 'valeur', '') !~ '^https?://[^[:space:]/?#.][^[:space:]]*$' then
        raise exception 'Bouton « % » : le lien doit commencer par https://', v ->> 'libelle';
      end if;
      if b ->> 'action' in ('whatsapp', 'appel') then
        if coalesce(public.numero_qr(v ->> 'valeur'), '') !~ '^[0-9]{8,15}$' then
          raise exception 'Bouton « % » : numéro invalide, mettez l''indicatif du pays (ex. 242 06 123 45 67)', v ->> 'libelle';
        end if;
        v := v || jsonb_build_object('valeur', public.numero_qr(v ->> 'valeur'));
      elsif b ->> 'action' in ('destination', 'menu') then
        v := v - 'valeur';
      end if;
    end if;
    -- Menu en cartes (migration 20261024060000) : affichage, titre et masquage par rayon, ordre des rayons.
    -- Clé d'un rayon : son identifiant, ou « autres » pour les articles sans rayon.
    if t = 'menu' then
      if b ? 'affichage' then
        if coalesce(b ->> 'affichage', '') not in ('cartes', 'liste') then
          raise exception 'Menu : affichage « cartes » ou « liste »';
        end if;
        v := v || jsonb_build_object('affichage', b ->> 'affichage');
      end if;
      if jsonb_typeof(b -> 'cartes') = 'object' then
        if (select count(*) from jsonb_object_keys(b -> 'cartes')) > 100 then
          raise exception 'Menu : 100 rayons au plus';
        end if;
        declare
          k text;
          c jsonb;
          propre jsonb := '{}'::jsonb;
          une jsonb;
        begin
          for k, c in select key, value from jsonb_each(b -> 'cartes') loop
            if k !~ '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|autres)$' or jsonb_typeof(c) <> 'object' then
              raise exception 'Menu : rayon inconnu';
            end if;
            une := '{}'::jsonb;
            if jsonb_typeof(c -> 'titre') = 'string' and btrim(c ->> 'titre') <> '' then
              if length(c ->> 'titre') > 60 then
                raise exception 'Menu : titre de carte trop long (60 caractères au plus)';
              end if;
              une := une || jsonb_build_object('titre', btrim(c ->> 'titre'));
            end if;
            if jsonb_typeof(c -> 'cache') = 'boolean' and (c ->> 'cache')::boolean then
              une := une || jsonb_build_object('cache', true);
            end if;
            if une <> '{}'::jsonb then
              propre := propre || jsonb_build_object(k, une);
            end if;
          end loop;
          if propre <> '{}'::jsonb then
            v := v || jsonb_build_object('cartes', propre);
          end if;
        end;
      end if;
      if jsonb_typeof(b -> 'ordre') = 'array' then
        if jsonb_array_length(b -> 'ordre') > 100 or exists (
          select 1 from jsonb_array_elements(b -> 'ordre') x
          where jsonb_typeof(x) <> 'string' or (x #>> '{}') !~ '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|autres)$') then
          raise exception 'Menu : ordre des rayons invalide';
        end if;
        if jsonb_array_length(b -> 'ordre') > 0 then
          v := v || jsonb_build_object('ordre', b -> 'ordre');
        end if;
      end if;
    end if;
    if t = 'reseaux' then
      foreach cle in array array['instagram', 'facebook', 'tiktok', 'youtube'] loop
        if jsonb_typeof(b -> cle) = 'string' and btrim(b ->> cle) <> '' then
          if length(b ->> cle) > 300 or btrim(b ->> cle) !~ '^https?://[^[:space:]/?#.][^[:space:]]*$' then
            raise exception 'Réseaux sociaux : le lien % doit commencer par https://', initcap(cle);
          end if;
          v := v || jsonb_build_object(cle, btrim(b ->> cle));
        end if;
      end loop;
      if jsonb_typeof(b -> 'whatsapp') = 'string' and btrim(b ->> 'whatsapp') <> '' then
        if coalesce(public.numero_qr(b ->> 'whatsapp'), '') !~ '^[0-9]{8,15}$' then
          raise exception 'Réseaux sociaux : numéro WhatsApp invalide, mettez l''indicatif du pays (ex. 242 06 123 45 67)';
        end if;
        v := v || jsonb_build_object('whatsapp', public.numero_qr(b ->> 'whatsapp'));
      end if;
    end if;
    if t = 'wifi' then
      foreach cle in array array['reseau', 'mot_de_passe'] loop
        if jsonb_typeof(b -> cle) = 'string' and btrim(b ->> cle) <> '' then
          if length(b ->> cle) > 64 then
            raise exception 'Wi-Fi : 64 caractères au plus';
          end if;
          v := v || jsonb_build_object(cle, b ->> cle);
        end if;
      end loop;
      if not v ? 'reseau' then
        raise exception 'Wi-Fi : écrivez le nom du Wi-Fi';
      end if;
    end if;
    r := r || jsonb_build_array(v);
  end loop;
  if (select count(*) from jsonb_array_elements(r) x where x ->> 'type' = 'formulaire') > 1 then
    raise exception 'Un seul formulaire par page';
  end if;
  return r;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Ce que voit le client : rayons et articles prêts pour les cartes
-- ---------------------------------------------------------------------------
create or replace function public.page_qr_publique(q public.qr_codes)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pg public.pages_qr%rowtype;
  i public.etablissement_identite%rowtype;
begin
  select * into pg from public.pages_qr where qr_code_id = q.id and active;
  if pg.qr_code_id is null then
    return null;
  end if;
  select * into i from public.etablissement_identite where etablissement_id = q.etablissement_id;
  return jsonb_build_object(
    'blocs', pg.blocs,
    'couleur', coalesce(pg.couleur, i.couleur_principale),
    'logo', i.logo_url,
    'devise', coalesce((select e.devise from public.etablissements e where e.id = q.etablissement_id), 'XAF'),
    'menu', case when exists (select 1 from jsonb_array_elements(pg.blocs) b where b ->> 'type' = 'menu') then coalesce((
      select jsonb_agg(jsonb_build_object('id', g.cle, 'nom', g.nom, 'description', g.description, 'photo', g.photo, 'articles', g.articles)
        order by g.ordre nulls last, g.nom)
      from (
        select coalesce(c.id::text, 'autres') cle, c.ordre, coalesce(c.nom, 'Autres') nom, c.description,
          case when c.photo is not null and length(c.photo) <= 200000 then c.photo end photo,
          jsonb_agg(jsonb_build_object(
              'id', a.id,
              'nom', a.nom || coalesce(' — ' || nullif(btrim(a.variante), ''), ''),
              'prix', a.prix_vente,
              'description', nullif(left(btrim(coalesce(a.description, '')), 160), ''),
              'a_photo', a.photo is not null and length(a.photo) <= 200000)
            order by a.ordre_affichage, a.nom, a.variante) articles
        from public.articles a
        left join public.categories_articles c on c.id = a.categorie_id
        where a.etablissement_id = q.etablissement_id and a.actif and a.visible_menu and a.prix_vente > 0
          and a.disponible and not a.epuise and (c.id is null or c.actif)
        group by c.id, c.ordre, c.nom, c.description, c.photo
      ) g), '[]'::jsonb) end);
end
$$;
revoke execute on function public.page_qr_publique(public.qr_codes) from public, anon, authenticated;

-- Photos des articles d'un rayon, demandées quand le client ouvre la carte (sans compte). Rien n'est compté ni écrit.
create function public.photos_menu_page_qr(p_jeton text, p_rayon text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q public.qr_codes%rowtype;
begin
  select * into q from public.qr_codes where jeton = lower(btrim(coalesce(p_jeton, ''))) and type <> 'wifi';
  if q.id is null or not q.actif or not public.module_actif(q.etablissement_id, 'caisse') then
    raise exception 'QR code introuvable';
  end if;
  if not exists (select 1 from public.pages_qr pg where pg.qr_code_id = q.id and pg.active
                 and exists (select 1 from jsonb_array_elements(pg.blocs) b where b ->> 'type' = 'menu')) then
    return '{}'::jsonb;
  end if;
  return coalesce((
    select jsonb_object_agg(x.id, x.photo)
    from (
      select a.id, a.photo
      from public.articles a
      left join public.categories_articles c on c.id = a.categorie_id
      where a.etablissement_id = q.etablissement_id and a.actif and a.visible_menu and a.prix_vente > 0
        and a.disponible and not a.epuise and (c.id is null or c.actif)
        and a.photo is not null and length(a.photo) <= 200000
        and coalesce(a.categorie_id::text, 'autres') = coalesce(p_rayon, '')
      order by a.ordre_affichage, a.nom
      limit 80
    ) x), '{}'::jsonb);
end
$$;
revoke execute on function public.photos_menu_page_qr(text, text) from public;
grant execute on function public.photos_menu_page_qr(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
