-- QR codes : logo facultatif, style, QR codes libres dynamiques et suivi des scans (2026-10-17, demandes de Juste :
-- « que le logo du client puisse être dans le QR code, qu'on puisse générer le QR code directement là-bas, et qu'on
-- puisse traquer les scans », puis « le logo en option » et « les fonctions des meilleurs générateurs de QR codes »).
--   1. Apparence par établissement (menus_qr) : logo au centre des QR codes des tables (facultatif) et « style par
--      défaut » (formes, couleurs, dégradé, fond, marge, cadre) repris par les tables et les nouveaux QR codes.
--      Le dessin est fait par l'écran ; la base garde le style tel quel (objet JSON court, nettoyé à l'affichage).
--   2. QR codes libres (écran « QR codes ») : lien web, avis Google, WhatsApp, appel, SMS, e-mail, fiche contact,
--      menu sans table, Wi-Fi. Tous, sauf le Wi-Fi, sont DYNAMIQUES : le QR code imprimé contient #/q/<jeton> ; la
--      destination se change après impression, et chaque changement est gardé (qr_codes_historique).
--      Options : logo (désactivé par défaut), balises UTM sur les liens, dates de début et de fin.
--      Jamais supprimés : désactivés. Le Wi-Fi est écrit dans le QR code : ni compté, ni modifiable après impression.
--   3. Scans : QR code (ou table), établissement, date et type d'appareil (mobile, tablette, ordinateur, calculé par le
--      navigateur). Aucune adresse IP, aucune donnée personnelle. Le même navigateur n'est compté qu'une fois par
--      30 minutes (identifiant au hasard gardé dans le navigateur, enregistré seulement haché avec le QR code) ; plafond
--      de 60 scans par minute et par QR code, 600 par minute et par établissement.
-- Droit : « caisse.menu_qr » (gérant, responsable), comme le menu QR des tables.

-- ---------------------------------------------------------------------------
-- 1. Apparence des QR codes (par établissement)
-- ---------------------------------------------------------------------------
alter table public.menus_qr add column if not exists qr_logo boolean not null default false;
alter table public.menus_qr add column if not exists qr_style jsonb not null default '{}'::jsonb
  check (jsonb_typeof(qr_style) = 'object' and length(qr_style::text) <= 2000);

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
create table public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  nom text not null check (length(btrim(nom)) between 1 and 60),
  type text not null check (type in ('lien', 'avis', 'whatsapp', 'telephone', 'sms', 'email', 'vcard', 'menu', 'wifi')),
  -- Lien web et avis Google : adresse complète.
  cible text check (cible is null or (length(cible) <= 2000 and cible ~ '^https?://[^[:space:]]+$')),
  -- Autres types : numéro, message, e-mail, fiche contact, réseau Wi-Fi… (vérifiés par enregistrer_qr_code).
  contenu jsonb not null default '{}'::jsonb check (jsonb_typeof(contenu) = 'object' and length(contenu::text) <= 3000),
  -- Menu sans table : un emplacement dédié (consultation seule) porte le menu ; il n'apparaît pas parmi les tables.
  emplacement_id uuid unique references public.emplacements_qr(id) on delete restrict,
  jeton text not null unique check (jeton ~ '^[a-f0-9]{20}$'),
  avec_logo boolean not null default false,
  utm boolean not null default false,
  valide_du date,
  valide_au date,
  style jsonb not null default '{}'::jsonb check (jsonb_typeof(style) = 'object' and length(style::text) <= 2000),
  actif boolean not null default true,
  cree_par uuid references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  check (type not in ('lien', 'avis') or cible is not null),
  check (type <> 'menu' or emplacement_id is not null),
  check (valide_au is null or valide_du is null or valide_au >= valide_du)
);
create unique index qr_codes_nom on public.qr_codes(etablissement_id, lower(btrim(nom)));
create index qr_codes_etablissement_idx on public.qr_codes(etablissement_id, cree_le);

-- Changements de destination d'un QR code dynamique (le QR code imprimé ne change pas).
create table public.qr_codes_historique (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  qr_code_id uuid not null references public.qr_codes(id) on delete restrict,
  avant jsonb not null,
  apres jsonb not null,
  modifie_par uuid references auth.users(id) on delete restrict,
  modifie_le timestamptz not null default now()
);
create index qr_codes_historique_idx on public.qr_codes_historique(qr_code_id, modifie_le desc);

create table public.qr_scans (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  qr_code_id uuid references public.qr_codes(id) on delete restrict,
  emplacement_id uuid references public.emplacements_qr(id) on delete restrict,
  scanne_le timestamptz not null default now(),
  appareil text not null default 'inconnu' check (appareil in ('mobile', 'tablette', 'ordinateur', 'inconnu')),
  -- Haché (md5 du QR code et d'un identifiant tiré au hasard par le navigateur) : sert seulement à ne pas compter deux
  -- fois le même navigateur ; ne permet pas de suivre une personne d'un QR code à l'autre.
  visiteur text check (visiteur is null or visiteur ~ '^[a-f0-9]{32}$'),
  check (num_nonnulls(qr_code_id, emplacement_id) = 1)
);
create index qr_scans_code_idx on public.qr_scans(qr_code_id, scanne_le desc) where qr_code_id is not null;
create index qr_scans_emplacement_idx on public.qr_scans(emplacement_id, scanne_le desc) where emplacement_id is not null;
create index qr_scans_etablissement_idx on public.qr_scans(etablissement_id, scanne_le desc);

alter table public.qr_codes enable row level security;
alter table public.qr_codes_historique enable row level security;
alter table public.qr_scans enable row level security;
create policy lecture on public.qr_codes for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'caisse.menu_qr'));
create policy lecture on public.qr_codes_historique for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'caisse.menu_qr'));
create policy lecture on public.qr_scans for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'caisse.menu_qr'));
revoke all on public.qr_codes, public.qr_codes_historique, public.qr_scans from anon;

create trigger qr_codes_verrou_etablissement before update on public.qr_codes
  for each row execute function public.verrouiller_etablissement_id();
create trigger qr_codes_sans_suppression before delete on public.qr_codes
  for each row execute function public.refuser_suppression();
create trigger qr_codes_audit after update on public.qr_codes
  for each row execute function public.journaliser_modification();
create trigger qr_codes_historique_verrou_etablissement before update on public.qr_codes_historique
  for each row execute function public.verrouiller_etablissement_id();
create trigger qr_codes_historique_sans_suppression before delete on public.qr_codes_historique
  for each row execute function public.refuser_suppression();
create trigger qr_scans_verrou_etablissement before update on public.qr_scans
  for each row execute function public.verrouiller_etablissement_id();
create trigger qr_scans_sans_suppression before delete on public.qr_scans
  for each row execute function public.refuser_suppression();

-- ---------------------------------------------------------------------------
-- 3. Réglages (gérant, responsable)
-- ---------------------------------------------------------------------------
-- p : { logo?: bool, style?: objet } — style : style par défaut de l'établissement.
create function public.regler_apparence_qr(p_etablissement_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exiger_permission(p_etablissement_id, 'caisse.menu_qr');
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'Réglages invalides';
  end if;
  if p ? 'style' and (jsonb_typeof(p -> 'style') <> 'object' or length((p -> 'style')::text) > 2000) then
    raise exception 'Style invalide';
  end if;
  insert into public.menus_qr as m (etablissement_id, qr_logo, qr_style, modifie_par)
  values (p_etablissement_id, coalesce((p ->> 'logo')::boolean, false), coalesce(p -> 'style', '{}'::jsonb), auth.uid())
  on conflict (etablissement_id) do update set
    qr_logo = coalesce((p ->> 'logo')::boolean, m.qr_logo),
    qr_style = coalesce(p -> 'style', m.qr_style),
    modifie_par = auth.uid(), modifie_le = now();
end
$$;

-- Numéro de téléphone : chiffres seuls, « 00 » de tête retiré.
create function public.numero_qr(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), '^00', ''), '')
$$;

-- Contenu vérifié et nettoyé selon le type (lève une erreur en français simple).
create function public.contenu_qr_verifie(p_type text, c jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_numero text := public.numero_qr(c ->> 'numero');
  v_message text := nullif(btrim(coalesce(c ->> 'message', '')), '');
  v jsonb;
  cle text;
begin
  c := coalesce(c, '{}'::jsonb);
  if jsonb_typeof(c) <> 'object' then
    raise exception 'Contenu du QR code invalide';
  end if;
  if p_type in ('whatsapp', 'telephone', 'sms') then
    -- WhatsApp : indicatif du pays obligatoire (8 chiffres au moins).
    if v_numero is null or v_numero !~ '^[0-9]{6,15}$' or (p_type = 'whatsapp' and length(v_numero) < 8) then
      raise exception 'Numéro invalide : mettez l''indicatif du pays (ex. 242 06 123 45 67)';
    end if;
    if length(coalesce(v_message, '')) > 500 then
      raise exception 'Message trop long (500 caractères au plus)';
    end if;
    return jsonb_strip_nulls(jsonb_build_object('numero', v_numero, 'message', case when p_type <> 'telephone' then v_message end));
  elsif p_type = 'email' then
    if btrim(coalesce(c ->> 'adresse', '')) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(c ->> 'adresse') > 254 then
      raise exception 'Adresse e-mail invalide';
    end if;
    if length(coalesce(c ->> 'sujet', '')) > 150 or length(coalesce(c ->> 'message', '')) > 1000 then
      raise exception 'Objet ou message trop long';
    end if;
    return jsonb_strip_nulls(jsonb_build_object('adresse', btrim(c ->> 'adresse'),
      'sujet', nullif(btrim(coalesce(c ->> 'sujet', '')), ''), 'message', nullif(btrim(coalesce(c ->> 'message', '')), '')));
  elsif p_type = 'vcard' then
    v := '{}'::jsonb;
    foreach cle in array array['prenom', 'nom', 'societe', 'email', 'site', 'adresse'] loop
      if length(coalesce(c ->> cle, '')) > 200 then
        raise exception 'Fiche contact : « % » trop long (200 caractères au plus)', cle;
      end if;
      if nullif(btrim(coalesce(c ->> cle, '')), '') is not null then
        v := v || jsonb_build_object(cle, btrim(c ->> cle));
      end if;
    end loop;
    if public.numero_qr(c ->> 'telephone') is not null then
      if public.numero_qr(c ->> 'telephone') !~ '^[0-9]{6,15}$' then
        raise exception 'Fiche contact : numéro de téléphone invalide';
      end if;
      v := v || jsonb_build_object('telephone', public.numero_qr(c ->> 'telephone'));
    end if;
    if not (v ? 'prenom' or v ? 'nom' or v ? 'societe') then
      raise exception 'Fiche contact : indiquez au moins un nom ou une société';
    end if;
    return v;
  elsif p_type = 'wifi' then
    if nullif(c ->> 'reseau', '') is null or length(c ->> 'reseau') > 32 then
      raise exception 'Nom du réseau Wi-Fi requis (32 caractères au plus)';
    end if;
    if coalesce(c ->> 'securite', 'WPA') not in ('WPA', 'WEP', 'nopass') then
      raise exception 'Sécurité du Wi-Fi invalide';
    end if;
    if coalesce(c ->> 'securite', 'WPA') <> 'nopass'
       and (nullif(c ->> 'cle', '') is null or length(c ->> 'cle') > 63 or (coalesce(c ->> 'securite', 'WPA') = 'WPA' and length(c ->> 'cle') < 8)) then
      raise exception 'Mot de passe du Wi-Fi requis (8 à 63 caractères)';
    end if;
    return jsonb_strip_nulls(jsonb_build_object('reseau', c ->> 'reseau', 'securite', coalesce(c ->> 'securite', 'WPA'),
      'cle', case when coalesce(c ->> 'securite', 'WPA') <> 'nopass' then c ->> 'cle' end,
      'cache', case when coalesce((c ->> 'cache')::boolean, false) then true end));
  end if;
  return '{}'::jsonb;
end
$$;

-- Créer ou modifier un QR code libre. Le type ne change pas après la création.
-- p : { id?, nom, type, url?, contenu?, avec_logo?, utm?, valide_du?, valide_au?, style?, actif? } ; renvoie le QR code.
-- Une destination changée (url, contenu, utm) est gardée dans qr_codes_historique.
create function public.enregistrer_qr_code(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  existant public.qr_codes%rowtype;
  v_type text;
  v_nom text := btrim(coalesce(p ->> 'nom', ''));
  v_cible text;
  v_contenu jsonb;
  v_utm boolean;
  v_du date;
  v_au date;
  v_style jsonb;
  v_emplacement uuid;
  v_actif boolean;
begin
  perform public.exiger_permission(p_etablissement_id, 'caisse.menu_qr');
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'QR code invalide';
  end if;
  if v_id is not null then
    select * into existant from public.qr_codes where id = v_id and etablissement_id = p_etablissement_id for update;
    if existant.id is null then
      raise exception 'QR code introuvable dans cet établissement';
    end if;
    if p ? 'type' and p ->> 'type' is distinct from existant.type then
      raise exception 'Le type d''un QR code ne change pas : créez-en un nouveau';
    end if;
  end if;
  v_type := coalesce(existant.type, p ->> 'type');
  if v_type is null or v_type not in ('lien', 'avis', 'whatsapp', 'telephone', 'sms', 'email', 'vcard', 'menu', 'wifi') then
    raise exception 'Choisissez le type du QR code';
  end if;
  if v_nom = '' and existant.id is not null then
    v_nom := existant.nom;
  end if;
  if v_nom = '' or length(v_nom) > 60 then
    raise exception 'Donnez un nom au QR code (60 caractères au plus)';
  end if;
  if exists (select 1 from public.qr_codes where etablissement_id = p_etablissement_id
             and lower(btrim(nom)) = lower(v_nom) and id is distinct from v_id) then
    raise exception 'Un QR code s''appelle déjà « % »', v_nom;
  end if;

  -- Destination (les champs absents d'une modification sont gardés).
  v_cible := case when p ? 'url' then nullif(btrim(p ->> 'url'), '') else existant.cible end;
  if v_type in ('lien', 'avis') then
    if v_cible is null or length(v_cible) > 2000 or v_cible !~ '^https?://[^[:space:]/?#.][^[:space:]]*$' then
      raise exception 'Lien invalide : collez l''adresse complète, qui commence par https://';
    end if;
  else
    v_cible := null;
  end if;
  v_contenu := public.contenu_qr_verifie(v_type, case when p ? 'contenu' then p -> 'contenu' else existant.contenu end);
  v_utm := v_type in ('lien', 'avis') and coalesce((p ->> 'utm')::boolean, existant.utm, false);

  -- Options : dates (AAAA-MM-JJ), style, logo.
  begin
    v_du := case when p ? 'valide_du' then nullif(p ->> 'valide_du', '')::date else existant.valide_du end;
    v_au := case when p ? 'valide_au' then nullif(p ->> 'valide_au', '')::date else existant.valide_au end;
  exception when others then
    raise exception 'Date invalide';
  end;
  if v_du is not null and v_au is not null and v_au < v_du then
    raise exception 'La date de fin est avant la date de début';
  end if;
  if v_type = 'wifi' and (v_du is not null or v_au is not null) then
    raise exception 'Un QR code Wi-Fi n''a pas de dates : il ne passe par aucune page';
  end if;
  v_style := case when p ? 'style' then p -> 'style' else coalesce(existant.style, '{}'::jsonb) end;
  if v_style is null or jsonb_typeof(v_style) <> 'object' or length(v_style::text) > 2000 then
    raise exception 'Style invalide';
  end if;
  v_actif := coalesce((p ->> 'actif')::boolean, existant.actif, true);

  if existant.id is null then
    if (select count(*) from public.qr_codes where etablissement_id = p_etablissement_id) >= 200 then
      raise exception 'Pas plus de 200 QR codes par établissement';
    end if;
    if v_type = 'menu' then
      -- Menu sans table : consultation seule (aucune table où servir une commande).
      if exists (select 1 from public.emplacements_qr where etablissement_id = p_etablissement_id
                 and lower(btrim(libelle)) = lower(left(v_nom, 40))) then
        raise exception 'Une table s''appelle déjà « % » : choisissez un autre nom', left(v_nom, 40);
      end if;
      v_emplacement := public.enregistrer_emplacement_qr(p_etablissement_id,
        jsonb_build_object('libelle', left(v_nom, 40), 'commande', false, 'actif', v_actif));
    end if;
    insert into public.qr_codes (etablissement_id, nom, type, cible, contenu, emplacement_id, jeton, avec_logo, utm,
      valide_du, valide_au, style, actif, cree_par)
    values (p_etablissement_id, v_nom, v_type, v_cible, v_contenu, v_emplacement, public.nouveau_jeton_qr(),
      coalesce((p ->> 'avec_logo')::boolean, false), v_utm, v_du, v_au, v_style, v_actif, auth.uid())
    returning id into v_id;
  else
    if v_type <> 'wifi' and (v_cible is distinct from existant.cible or v_contenu is distinct from existant.contenu or v_utm is distinct from existant.utm) then
      insert into public.qr_codes_historique (etablissement_id, qr_code_id, avant, apres, modifie_par)
      values (p_etablissement_id, v_id,
        jsonb_strip_nulls(jsonb_build_object('cible', existant.cible, 'contenu', existant.contenu, 'utm', existant.utm)),
        jsonb_strip_nulls(jsonb_build_object('cible', v_cible, 'contenu', v_contenu, 'utm', v_utm)), auth.uid());
    end if;
    update public.qr_codes set nom = v_nom, cible = v_cible, contenu = v_contenu, utm = v_utm, valide_du = v_du, valide_au = v_au,
      style = v_style, avec_logo = coalesce((p ->> 'avec_logo')::boolean, avec_logo), actif = v_actif, modifie_le = now()
    where id = v_id;
    if existant.emplacement_id is not null then
      update public.emplacements_qr set actif = v_actif where id = existant.emplacement_id and actif is distinct from v_actif;
    end if;
  end if;
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Scans (sans compte)
-- ---------------------------------------------------------------------------
-- Usage interne : enregistre un scan sauf doublon (même navigateur dans les 30 minutes) ou plafond atteint.
create function public.noter_scan_qr(p_etablissement_id uuid, p_qr_code_id uuid, p_emplacement_id uuid, p_appareil text, p_visiteur text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appareil text := case when p_appareil in ('mobile', 'tablette', 'ordinateur') then p_appareil else 'inconnu' end;
  v_visiteur text;
begin
  if p_visiteur ~ '^[A-Za-z0-9-]{16,64}$' then
    v_visiteur := md5(coalesce(p_qr_code_id, p_emplacement_id)::text || ':' || p_visiteur);
  end if;
  if v_visiteur is not null and exists (
    select 1 from public.qr_scans s
    where ((p_qr_code_id is not null and s.qr_code_id = p_qr_code_id) or (p_qr_code_id is null and s.emplacement_id = p_emplacement_id))
      and s.visiteur = v_visiteur and s.scanne_le > now() - interval '30 minutes') then
    return false;
  end if;
  if (select count(*) from public.qr_scans s
      where ((p_qr_code_id is not null and s.qr_code_id = p_qr_code_id) or (p_qr_code_id is null and s.emplacement_id = p_emplacement_id))
        and s.scanne_le > now() - interval '1 minute') >= 60 then
    return false;
  end if;
  if (select count(*) from public.qr_scans s
      where s.etablissement_id = p_etablissement_id and s.scanne_le > now() - interval '1 minute') >= 600 then
    return false;
  end if;
  insert into public.qr_scans (etablissement_id, qr_code_id, emplacement_id, appareil, visiteur)
  values (p_etablissement_id, p_qr_code_id, p_emplacement_id, v_appareil, v_visiteur);
  return true;
end
$$;

-- Page publique #/q/<jeton> : compte le scan puis renvoie la destination. QR code désactivé ou hors de ses dates :
-- refusé avec un message poli, rien n'est compté.
create function public.ouvrir_qr_code(p_jeton text, p_appareil text default null, p_visiteur text default null)
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
    'etablissement', coalesce((select nullif(btrim(i.nom_commercial), '') from public.etablissement_identite i where i.etablissement_id = q.etablissement_id),
      (select e.nom from public.etablissements e where e.id = q.etablissement_id)),
    'compte', v_compte);
end
$$;

-- Menu d'une table (#/menu/<jeton>) : compte l'ouverture. Ne lève jamais d'erreur (la page du menu ne doit pas casser).
-- Le menu sans table est déjà compté par #/q/ : il n'est pas compté deux fois.
create function public.noter_scan_menu(p_jeton text, p_appareil text default null, p_visiteur text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.emplacements_qr%rowtype;
begin
  begin
    e := public.emplacement_qr_ouvert(p_jeton);
  exception when others then
    return false;
  end;
  if exists (select 1 from public.qr_codes where emplacement_id = e.id) then
    return false;
  end if;
  return public.noter_scan_qr(e.etablissement_id, null, e.id, p_appareil, p_visiteur);
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Statistiques (gérant, responsable)
-- ---------------------------------------------------------------------------
-- Scans par QR code (aujourd'hui, 7 jours, 30 jours, premier et dernier scan), par jour sur 30 jours, par heure, par
-- appareil. p_qr_code_id ou p_emplacement_id : limite courbes et appareils à un seul QR code ou une seule table.
create function public.statistiques_qr(p_etablissement_id uuid, p_qr_code_id uuid default null, p_emplacement_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text := coalesce((select e.fuseau from public.etablissements e where e.id = p_etablissement_id), 'UTC');
  v_jour date := (now() at time zone v_tz)::date;
  v_codes jsonb;
  v_jours jsonb;
  v_heures jsonb;
  v_appareils jsonb;
begin
  if auth.uid() is null or not public.lecture_autorisee(p_etablissement_id, 'caisse.menu_qr') then
    raise exception 'Permission refusée : caisse.menu_qr' using errcode = '42501';
  end if;
  with scans as (
    select coalesce(s.qr_code_id, s.emplacement_id) code, (s.scanne_le at time zone v_tz)::date jour
    from public.qr_scans s
    where s.etablissement_id = p_etablissement_id and s.scanne_le > now() - interval '31 days'
  ), totaux as (
    select q.id, 'qr' genre, q.nom, q.type, q.actif, null::uuid table_id
    from public.qr_codes q where q.etablissement_id = p_etablissement_id
    union all
    select e.id, 'table', e.libelle, 'table', e.actif, e.table_id
    from public.emplacements_qr e
    where e.etablissement_id = p_etablissement_id and not exists (select 1 from public.qr_codes q where q.emplacement_id = e.id)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'genre', t.genre, 'nom', t.nom, 'type', t.type, 'actif', t.actif, 'table_id', t.table_id,
      'total', a.total, 'premier', a.premier, 'dernier', a.dernier,
      'aujourdhui', (select count(*) from scans s where s.code = t.id and s.jour = v_jour),
      'sept_jours', (select count(*) from scans s where s.code = t.id and s.jour > v_jour - 7),
      'trente_jours', (select count(*) from scans s where s.code = t.id and s.jour > v_jour - 30)
    ) order by t.genre, t.nom), '[]'::jsonb)
  into v_codes
  from totaux t
  cross join lateral (
    select count(*) total, min(x.scanne_le) premier, max(x.scanne_le) dernier from public.qr_scans x
    where (t.genre = 'qr' and x.qr_code_id = t.id) or (t.genre = 'table' and x.emplacement_id = t.id)
  ) a;

  with scans as (
    select s.appareil, (s.scanne_le at time zone v_tz) moment
    from public.qr_scans s
    where s.etablissement_id = p_etablissement_id and s.scanne_le > now() - interval '31 days'
      and (p_qr_code_id is null or s.qr_code_id = p_qr_code_id)
      and (p_emplacement_id is null or s.emplacement_id = p_emplacement_id)
  )
  select
    (select jsonb_agg(jsonb_build_object('jour', j::date, 'scans', (select count(*) from scans s where s.moment::date = j::date)) order by j)
     from generate_series((v_jour - 29)::timestamp, v_jour::timestamp, interval '1 day') j),
    (select jsonb_agg(jsonb_build_object('heure', h, 'scans', (select count(*) from scans s
       where extract(hour from s.moment) = h and s.moment::date > v_jour - 30)) order by h)
     from generate_series(0, 23) h),
    (select jsonb_build_object(
       'mobile', count(*) filter (where appareil = 'mobile'), 'tablette', count(*) filter (where appareil = 'tablette'),
       'ordinateur', count(*) filter (where appareil = 'ordinateur'), 'inconnu', count(*) filter (where appareil = 'inconnu'))
     from scans s where s.moment::date > v_jour - 30)
  into v_jours, v_heures, v_appareils;

  return jsonb_build_object('codes', v_codes, 'jours', v_jours, 'heures', v_heures, 'appareils', v_appareils,
    'aujourdhui', coalesce((select sum((c ->> 'aujourdhui')::integer) from jsonb_array_elements(v_codes) c), 0),
    'sept_jours', coalesce((select sum((c ->> 'sept_jours')::integer) from jsonb_array_elements(v_codes) c), 0),
    'trente_jours', coalesce((select sum((c ->> 'trente_jours')::integer) from jsonb_array_elements(v_codes) c), 0));
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Droits d'exécution
-- ---------------------------------------------------------------------------
do $$
declare signature text;
begin
  foreach signature in array array[
    'public.regler_apparence_qr(uuid, jsonb)',
    'public.enregistrer_qr_code(uuid, jsonb)',
    'public.statistiques_qr(uuid, uuid, uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
  foreach signature in array array[
    'public.ouvrir_qr_code(text, text, text)',
    'public.noter_scan_menu(text, text, text)'
  ] loop
    execute format('revoke execute on function %s from public', signature);
    execute format('grant execute on function %s to anon, authenticated', signature);
  end loop;
  foreach signature in array array[
    'public.noter_scan_qr(uuid, uuid, uuid, text, text)',
    'public.numero_qr(text)',
    'public.contenu_qr_verifie(text, jsonb)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', signature);
  end loop;
end
$$;

notify pgrst, 'reload schema';
