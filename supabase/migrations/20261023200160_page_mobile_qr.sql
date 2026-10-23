-- Page mobile des QR codes (demande de Juste, 2026-10-23) : « un petit builder, comme un website builder pour les
-- mobiles » pour la page que voient les clients qui scannent, et capter leurs coordonnées.
-- 1. pages_qr : une page par QR code (sauf Wi-Fi), faite de blocs (en-tête, texte, boutons, menu, formulaire).
--    Allumée, elle s'affiche au scan au lieu d'envoyer directement vers la destination ; le QR code déjà imprimé ne
--    change pas. Éteinte (par défaut), rien ne change pour les QR codes existants.
-- 2. inscriptions_qr : nom, téléphone, e-mail, anniversaire, message laissés par le client dans le formulaire de la page
--    (sans compte, avec plafonds). Lus par le gérant et les responsables (droit caisse.menu_qr).
-- Additif : deux tables, trois fonctions ; ouvrir_qr_code renvoie en plus la page allumée.

create table public.pages_qr (
  qr_code_id uuid primary key references public.qr_codes(id) on delete restrict,
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  active boolean not null default false,
  blocs jsonb not null default '[]'::jsonb check (jsonb_typeof(blocs) = 'array' and jsonb_array_length(blocs) <= 25 and length(blocs::text) <= 20000),
  couleur text check (couleur is null or couleur ~ '^#[0-9A-Fa-f]{6}$'),
  modifie_par uuid references auth.users(id) on delete restrict,
  modifie_le timestamptz not null default now()
);
create index pages_qr_etablissement_idx on public.pages_qr(etablissement_id);

create table public.inscriptions_qr (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  qr_code_id uuid not null references public.qr_codes(id) on delete restrict,
  nom text not null check (length(btrim(nom)) between 1 and 80),
  telephone text check (telephone is null or telephone ~ '^[0-9]{6,15}$'),
  email text check (email is null or length(email) <= 254),
  anniversaire date,
  message text check (message is null or length(message) <= 500),
  appareil text not null default 'inconnu' check (appareil in ('mobile', 'tablette', 'ordinateur', 'inconnu')),
  cree_le timestamptz not null default now()
);
create index inscriptions_qr_etablissement_idx on public.inscriptions_qr(etablissement_id, cree_le desc);
create index inscriptions_qr_code_idx on public.inscriptions_qr(qr_code_id, cree_le desc);

alter table public.pages_qr enable row level security;
alter table public.inscriptions_qr enable row level security;
create policy lecture on public.pages_qr for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'caisse.menu_qr'));
create policy lecture on public.inscriptions_qr for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'caisse.menu_qr'));
revoke all on public.pages_qr, public.inscriptions_qr from anon;
create trigger pages_qr_verrou_etablissement before update on public.pages_qr
  for each row execute function public.verrouiller_etablissement_id();
create trigger pages_qr_sans_suppression before delete on public.pages_qr
  for each row execute function public.refuser_suppression();
create trigger inscriptions_qr_verrou_etablissement before update on public.inscriptions_qr
  for each row execute function public.verrouiller_etablissement_id();
create trigger inscriptions_qr_sans_suppression before delete on public.inscriptions_qr
  for each row execute function public.refuser_suppression();

-- Blocs vérifiés et nettoyés (lève une erreur en français simple). Types :
--   entete {titre, texte, logo}, texte {titre, texte}, bouton {libelle, action, valeur},
--   menu {titre}, formulaire {titre, texte, bouton, merci, email, anniversaire, message}.
-- action d'un bouton : destination (celle du QR code), lien (https), whatsapp, appel (numéro), menu.
create function public.blocs_page_qr_verifies(p jsonb)
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
  limites jsonb := '{"titre": 80, "texte": 600, "libelle": 40, "bouton": 40, "merci": 200, "valeur": 300}'::jsonb;
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
    if t is null or t not in ('entete', 'texte', 'bouton', 'menu', 'formulaire') then
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
    foreach cle in array array['logo', 'email', 'anniversaire', 'message'] loop
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
    r := r || jsonb_build_array(v);
  end loop;
  if (select count(*) from jsonb_array_elements(r) x where x ->> 'type' = 'formulaire') > 1 then
    raise exception 'Un seul formulaire par page';
  end if;
  return r;
end
$$;

-- Enregistrer la page d'un QR code (gérant, responsable).
create function public.enregistrer_page_qr(p_qr_code_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.qr_codes%rowtype;
  v_blocs jsonb;
  v_couleur text := nullif(btrim(coalesce(p ->> 'couleur', '')), '');
begin
  select * into q from public.qr_codes where id = p_qr_code_id;
  if q.id is null then
    raise exception 'QR code introuvable';
  end if;
  perform public.exiger_permission(q.etablissement_id, 'caisse.menu_qr');
  if q.type = 'wifi' then
    raise exception 'Un QR code Wi-Fi ne passe par aucune page';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'Page invalide';
  end if;
  if v_couleur is not null and v_couleur !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Couleur invalide';
  end if;
  v_blocs := public.blocs_page_qr_verifies(coalesce(p -> 'blocs', '[]'::jsonb));
  if coalesce((p ->> 'active')::boolean, false) and jsonb_array_length(v_blocs) = 0 then
    raise exception 'Ajoutez au moins un bloc avant d''allumer la page';
  end if;
  insert into public.pages_qr (qr_code_id, etablissement_id, active, blocs, couleur, modifie_par, modifie_le)
  values (q.id, q.etablissement_id, coalesce((p ->> 'active')::boolean, false), v_blocs, v_couleur, auth.uid(), now())
  on conflict (qr_code_id) do update set active = excluded.active, blocs = excluded.blocs, couleur = excluded.couleur,
    modifie_par = excluded.modifie_par, modifie_le = excluded.modifie_le;
end
$$;

-- Ce que voit le client : la page allumée, avec le menu (articles visibles sur le menu, sans photo) si un bloc le montre.
create function public.page_qr_publique(q public.qr_codes)
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
      select jsonb_agg(jsonb_build_object('nom', g.nom, 'articles', g.articles) order by g.ordre nulls last, g.nom)
      from (
        select c.ordre, coalesce(c.nom, 'Autres') nom,
          jsonb_agg(jsonb_build_object('nom', a.nom || coalesce(' — ' || nullif(btrim(a.variante), ''), ''), 'prix', a.prix_vente)
            order by a.ordre_affichage, a.nom, a.variante) articles
        from public.articles a
        left join public.categories_articles c on c.id = a.categorie_id
        where a.etablissement_id = q.etablissement_id and a.actif and a.visible_menu and a.prix_vente > 0
          and a.disponible and not a.epuise and (c.id is null or c.actif)
        group by c.id, c.ordre, c.nom
      ) g), '[]'::jsonb) end);
end
$$;

-- Formulaire de la page (sans compte). p : { nom, telephone?, email?, anniversaire?, message?, site? (piège à robots) }.
create function public.envoyer_inscription_qr(p_jeton text, p jsonb, p_appareil text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.qr_codes%rowtype;
  f jsonb;
  v_nom text := left(btrim(coalesce(p ->> 'nom', '')), 81);
  v_tel text := public.numero_qr(p ->> 'telephone');
  v_email text := nullif(btrim(coalesce(p ->> 'email', '')), '');
  v_message text := nullif(btrim(coalesce(p ->> 'message', '')), '');
  v_anniv date;
begin
  select * into q from public.qr_codes where jeton = lower(btrim(coalesce(p_jeton, ''))) and type <> 'wifi';
  if q.id is null or not q.actif then
    raise exception 'Ce QR code n''est plus actif';
  end if;
  select b into f from public.pages_qr pg, jsonb_array_elements(pg.blocs) b
  where pg.qr_code_id = q.id and pg.active and b ->> 'type' = 'formulaire' limit 1;
  if f is null then
    raise exception 'Ce formulaire n''est plus ouvert';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'Formulaire invalide';
  end if;
  -- Champ caché : un robot le remplit, une personne non. On répond « merci » sans rien garder.
  if nullif(btrim(coalesce(p ->> 'site', '')), '') is not null then
    return jsonb_build_object('merci', coalesce(f ->> 'merci', 'Merci !'));
  end if;
  if v_nom = '' or length(v_nom) > 80 then
    raise exception 'Écrivez votre nom';
  end if;
  if v_tel is null or v_tel !~ '^[0-9]{8,15}$' then
    raise exception 'Numéro de téléphone invalide : mettez l''indicatif du pays (ex. 242 06 123 45 67)';
  end if;
  if v_email is not null and (v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(v_email) > 254) then
    raise exception 'Adresse e-mail invalide';
  end if;
  if length(coalesce(v_message, '')) > 500 then
    raise exception 'Message trop long (500 caractères au plus)';
  end if;
  begin
    v_anniv := nullif(p ->> 'anniversaire', '')::date;
  exception when others then
    raise exception 'Date d''anniversaire invalide';
  end;
  if v_anniv is not null and (v_anniv < date '1900-01-01' or v_anniv > current_date) then
    raise exception 'Date d''anniversaire invalide';
  end if;
  if exists (select 1 from public.inscriptions_qr where qr_code_id = q.id and telephone = v_tel and cree_le > now() - interval '1 day') then
    return jsonb_build_object('merci', coalesce(f ->> 'merci', 'Merci ! Nous avons bien vos coordonnées.'));
  end if;
  if (select count(*) from public.inscriptions_qr where qr_code_id = q.id and cree_le > now() - interval '1 minute') >= 20
     or (select count(*) from public.inscriptions_qr where etablissement_id = q.etablissement_id and cree_le > now() - interval '1 day') >= 1000 then
    raise exception 'Trop d''inscriptions en peu de temps : réessayez dans un moment';
  end if;
  insert into public.inscriptions_qr (etablissement_id, qr_code_id, nom, telephone, email, anniversaire, message, appareil)
  values (q.etablissement_id, q.id, v_nom, v_tel,
    case when coalesce((f ->> 'email')::boolean, false) then v_email end,
    case when coalesce((f ->> 'anniversaire')::boolean, false) then v_anniv end,
    case when coalesce((f ->> 'message')::boolean, false) then v_message end,
    case when p_appareil in ('mobile', 'tablette', 'ordinateur') then p_appareil else 'inconnu' end);
  perform public.notifier_permission(q.etablissement_id, 'caisse.menu_qr', 'caisse.inscription_qr',
    'Nouveau client inscrit : ' || v_nom, 'Par le QR code « ' || q.nom || ' »', 'qr-codes/inscrits');
  return jsonb_build_object('merci', coalesce(f ->> 'merci', 'Merci ! Nous avons bien vos coordonnées.'));
end
$$;

create or replace function public.ouvrir_qr_code(p_jeton text, p_appareil text default null, p_visiteur text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.qr_codes%rowtype;
  v_jour date;
  v_menu text;
  v_compte boolean;
begin
  select * into q from public.qr_codes where jeton = lower(btrim(coalesce(p_jeton, ''))) and type <> 'wifi';
  if q.id is null then
    raise exception 'QR code introuvable';
  end if;
  if not q.actif or not public.module_actif(q.etablissement_id, 'caisse') or not public.etablissement_autorise_ecriture(q.etablissement_id) then
    raise exception 'Ce QR code n''est plus actif';
  end if;
  v_jour := public.date_locale(q.etablissement_id);
  if q.valide_du is not null and v_jour < q.valide_du then
    raise exception 'Ce QR code sera actif à partir du %. Merci de revenir à cette date', to_char(q.valide_du, 'DD/MM/YYYY');
  end if;
  if q.valide_au is not null and v_jour > q.valide_au then
    raise exception 'Ce QR code était valable jusqu''au %. Merci de votre visite', to_char(q.valide_au, 'DD/MM/YYYY');
  end if;
  if q.type = 'menu' then
    select jeton into v_menu from public.emplacements_qr where id = q.emplacement_id;
  end if;
  v_compte := public.noter_scan_qr(q.etablissement_id, q.id, null, p_appareil, p_visiteur);
  return jsonb_build_object(
    'type', q.type, 'nom', q.nom, 'cible', q.cible, 'contenu', q.contenu, 'utm', q.utm, 'menu', v_menu,
    -- Page mobile allumée (migration 20261023200160) : le client la voit au lieu d'être envoyé tout de suite.
    'page', public.page_qr_publique(q),
    'etablissement', coalesce((select nullif(btrim(i.nom_commercial), '') from public.etablissement_identite i where i.etablissement_id = q.etablissement_id),
      (select e.nom from public.etablissements e where e.id = q.etablissement_id)),
    'compte', v_compte);
end
$$;

do $$
declare signature text;
begin
  execute 'revoke execute on function public.enregistrer_page_qr(uuid, jsonb) from public, anon';
  execute 'grant execute on function public.enregistrer_page_qr(uuid, jsonb) to authenticated';
  execute 'revoke execute on function public.envoyer_inscription_qr(text, jsonb, text) from public';
  execute 'grant execute on function public.envoyer_inscription_qr(text, jsonb, text) to anon, authenticated';
  foreach signature in array array['public.blocs_page_qr_verifies(jsonb)', 'public.page_qr_publique(public.qr_codes)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', signature);
  end loop;
end
$$;

notify pgrst, 'reload schema';
