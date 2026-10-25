-- Nouvelle version de The Dream (2026-10-25) : réglages et petites tables pour
--   1. les moyens d'encaissement réglables (MTN, Airtel, Espèces, TPE…), la caisse « Ma caisse », l'apparence ;
--   2. la fiche des serveurs (photo, rôle, téléphone, statut) pour les badges ;
--   3. la présence en caisse (questions à des moments imprévisibles) ;
--   4. les avis des recommandations (« Utile » / « Pas pour moi ») ;
--   5. la boîte à suggestions des clients (depuis le QR « Menu »).
-- Migration additive : aucune donnée existante n'est modifiée. Tant que « nouvelle_version » n'est pas activé pour un
-- établissement, ses écrans restent exactement les mêmes.

-- ---------------------------------------------------------------------------
-- 1. Réglages (validés par enregistrer_parametres_module ; le type « json » n'est pas contrôlé par la base,
--    l'écran le vérifie et le lit avec des valeurs par défaut sûres).
-- ---------------------------------------------------------------------------
update public.modules set parametres_schema = coalesce(parametres_schema, '[]'::jsonb) || '[
  {"cle": "nouvelle_version", "libelle": "Nouvelle version des écrans (tuiles, centre de pilotage, thème)", "type": "booleen", "defaut": false},
  {"cle": "apparence", "libelle": "Apparence : thème et couleurs (réglé dans Paramètres › Apparence)", "type": "json", "defaut": {}},
  {"cle": "objectif_jour", "libelle": "Objectif d’argent encaissé par soirée (0 = calculé tout seul)", "type": "nombre", "defaut": 0},
  {"cle": "suggestions_actives", "libelle": "Boîte à suggestions des clients sur la page du QR « Menu »", "type": "booleen", "defaut": true}
]'::jsonb
where id = 'etablissement' and not coalesce(parametres_schema, '[]'::jsonb) @> '[{"cle": "nouvelle_version"}]'::jsonb;

update public.modules set parametres_schema = coalesce(parametres_schema, '[]'::jsonb) || '[
  {"cle": "moyens_encaissement", "libelle": "Moyens d’encaissement (réglés dans Paramètres › Encaissement)", "type": "json", "defaut": []},
  {"cle": "ma_caisse", "libelle": "Écran de la caisse choisi par le gérant (réglé dans Ma caisse)", "type": "json", "defaut": {}},
  {"cle": "qui_a_servi", "libelle": "« Qui a servi ? » avant l’impression : non, rappel ou obligatoire", "type": "texte", "defaut": "rappel", "motif": "^(non|rappel|obligatoire)$"},
  {"cle": "presence_controle", "libelle": "Vérifier que la caissière est bien à la caisse (questions à des moments imprévisibles)", "type": "booleen", "defaut": false},
  {"cle": "presence_minutes", "libelle": "Une question de présence en moyenne toutes les … minutes", "type": "nombre", "defaut": 40}
]'::jsonb
where id = 'caisse' and not coalesce(parametres_schema, '[]'::jsonb) @> '[{"cle": "moyens_encaissement"}]'::jsonb;

-- ---------------------------------------------------------------------------
-- 2. Fiche des serveurs (badge) : photo, rôle, téléphone, statut.
-- ---------------------------------------------------------------------------
alter table public.serveurs_caisse add column if not exists photo_url text
  check (photo_url is null or (length(photo_url) <= 2000 and photo_url ~ '^https?://[^[:space:]]+$'));
alter table public.serveurs_caisse add column if not exists role text not null default 'Serveur'
  check (length(btrim(role)) between 1 and 40);
alter table public.serveurs_caisse add column if not exists telephone text
  check (telephone is null or telephone ~ '^\+?[0-9 ]{6,20}$');
alter table public.serveurs_caisse add column if not exists statut text not null default 'actif'
  check (statut in ('actif', 'conge', 'parti'));

create function public.modifier_fiche_serveur(p_serveur_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.serveurs_caisse%rowtype;
  v_prenom text;
begin
  select * into s from public.serveurs_caisse where id = p_serveur_id for update;
  if s.id is null then raise exception 'Serveur introuvable'; end if;
  perform public.exiger_permission(s.etablissement_id, 'etablissement.modifier');
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Fiche invalide'; end if;
  v_prenom := coalesce(nullif(left(regexp_replace(btrim(coalesce(p ->> 'prenom', '')), '\s+', ' ', 'g'), 40), ''), s.prenom);
  if lower(v_prenom) <> lower(s.prenom) and exists (
    select 1 from public.serveurs_caisse where etablissement_id = s.etablissement_id and actif and id <> s.id
      and lower(btrim(prenom)) = lower(v_prenom)
  ) then raise exception 'Une autre personne porte déjà ce prénom'; end if;
  update public.serveurs_caisse set
    prenom = v_prenom,
    role = case when p ? 'role' then coalesce(nullif(left(btrim(p ->> 'role'), 40), ''), 'Serveur') else role end,
    telephone = case when p ? 'telephone' then nullif(btrim(p ->> 'telephone'), '') else telephone end,
    photo_url = case when p ? 'photo_url' then nullif(btrim(p ->> 'photo_url'), '') else photo_url end,
    statut = case when p ? 'statut' then p ->> 'statut' else statut end
  where id = s.id returning * into s;
  return to_jsonb(s);
end
$$;
revoke execute on function public.modifier_fiche_serveur(uuid, jsonb) from public, anon;
grant execute on function public.modifier_fiche_serveur(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Présence en caisse : chaque question posée à la caissière et sa réponse.
-- ---------------------------------------------------------------------------
create table public.presences_caisse (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  session_caisse_id uuid references public.sessions_caisse(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  evenement text not null check (evenement in ('presente', 'manquee', 'absence_debut', 'absence_fin')),
  delai_secondes integer check (delai_secondes is null or delai_secondes between 0 and 86400),
  motif text check (motif is null or length(motif) <= 120),
  cree_le timestamptz not null default now()
);
create index presences_caisse_etab_idx on public.presences_caisse(etablissement_id, cree_le desc);
alter table public.presences_caisse enable row level security;
create policy lecture on public.presences_caisse for select to authenticated
  using (user_id = auth.uid() or public.lecture_autorisee(etablissement_id, 'cloture.cloturer'));
create trigger presences_caisse_sans_suppression before delete on public.presences_caisse
  for each row execute function public.refuser_suppression();
create trigger presences_caisse_verrou_etablissement before update on public.presences_caisse
  for each row execute function public.verrouiller_etablissement_id();

create function public.noter_presence_caisse(p_etablissement_id uuid, p_evenement text, p_delai integer default null, p_motif text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'caisse.utiliser');
  select id into v_session from public.sessions_caisse
  where etablissement_id = p_etablissement_id and statut = 'ouverte' and ouverte_par = auth.uid()
  order by ouverte_le desc limit 1;
  insert into public.presences_caisse(etablissement_id, session_caisse_id, user_id, evenement, delai_secondes, motif)
  values (p_etablissement_id, v_session, auth.uid(), p_evenement, p_delai, nullif(left(btrim(coalesce(p_motif, '')), 120), ''));
end
$$;
revoke execute on function public.noter_presence_caisse(uuid, text, integer, text) from public, anon;
grant execute on function public.noter_presence_caisse(uuid, text, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Avis du patron sur les recommandations (le logiciel conseille, le patron décide).
-- ---------------------------------------------------------------------------
create table public.avis_recommandations (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  cle text not null check (length(cle) between 1 and 80),
  avis text not null check (avis in ('utile', 'pas_pour_moi')),
  valeur_depart numeric(14, 2),
  donne_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now()
);
create index avis_recommandations_etab_idx on public.avis_recommandations(etablissement_id, cle, cree_le desc);
alter table public.avis_recommandations enable row level security;
create policy lecture on public.avis_recommandations for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'cloture.cloturer'));
create trigger avis_recommandations_sans_suppression before delete on public.avis_recommandations
  for each row execute function public.refuser_suppression();
create trigger avis_recommandations_verrou_etablissement before update on public.avis_recommandations
  for each row execute function public.verrouiller_etablissement_id();

create function public.donner_avis_recommandation(p_etablissement_id uuid, p_cle text, p_avis text, p_valeur numeric default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exiger_permission(p_etablissement_id, 'cloture.cloturer');
  insert into public.avis_recommandations(etablissement_id, cle, avis, valeur_depart, donne_par)
  values (p_etablissement_id, left(btrim(coalesce(p_cle, '')), 80), p_avis, p_valeur, auth.uid());
end
$$;
revoke execute on function public.donner_avis_recommandation(uuid, text, text, numeric) from public, anon;
grant execute on function public.donner_avis_recommandation(uuid, text, text, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Boîte à suggestions : le client donne une note et un mot depuis la page du QR. Rien ne l'identifie.
-- ---------------------------------------------------------------------------
create table public.suggestions_clients (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  qr_code_id uuid references public.qr_codes(id) on delete restrict,
  note smallint not null check (note between 1 and 5),
  sujets text[] not null default '{}' check (cardinality(sujets) <= 6),
  message text check (message is null or length(message) <= 500),
  lue boolean not null default false,
  cree_le timestamptz not null default now()
);
create index suggestions_clients_etab_idx on public.suggestions_clients(etablissement_id, cree_le desc);
alter table public.suggestions_clients enable row level security;
create policy lecture on public.suggestions_clients for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'cloture.cloturer'));
create trigger suggestions_clients_sans_suppression before delete on public.suggestions_clients
  for each row execute function public.refuser_suppression();
create trigger suggestions_clients_verrou_etablissement before update on public.suggestions_clients
  for each row execute function public.verrouiller_etablissement_id();

create function public.laisser_suggestion(p_jeton text, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.qr_codes%rowtype;
  v_note integer;
  v_sujets text[];
  v_message text := nullif(left(btrim(coalesce(p ->> 'message', '')), 501), '');
begin
  select * into q from public.qr_codes where jeton = lower(btrim(coalesce(p_jeton, '')));
  if q.id is null or not q.actif then raise exception 'Ce QR code n''est plus actif'; end if;
  if coalesce((select (data ->> 'suggestions_actives')::boolean from public.etablissement_parametres
               where etablissement_id = q.etablissement_id and module_id = 'etablissement'), true) is false then
    raise exception 'La boîte à suggestions est fermée';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Avis invalide'; end if;
  -- Champ caché : un robot le remplit, une personne non.
  if nullif(btrim(coalesce(p ->> 'site', '')), '') is not null then return jsonb_build_object('merci', true); end if;
  v_note := case when (p ->> 'note') ~ '^[1-5]$' then (p ->> 'note')::int end;
  if v_note is null then raise exception 'Choisissez une note de 1 à 5'; end if;
  if length(coalesce(v_message, '')) > 500 then raise exception 'Message trop long (500 caractères au plus)'; end if;
  select coalesce(array_agg(distinct left(btrim(s), 30)) filter (where btrim(s) <> ''), '{}') into v_sujets
  from jsonb_array_elements_text(case when jsonb_typeof(p -> 'sujets') = 'array' then p -> 'sujets' else '[]'::jsonb end) s;
  if cardinality(v_sujets) > 6 then raise exception 'Six sujets au plus'; end if;
  -- Pas plus de 30 avis par heure et par QR (protection contre les envois en boucle).
  if (select count(*) from public.suggestions_clients where qr_code_id = q.id and cree_le > now() - interval '1 hour') >= 30 then
    raise exception 'Trop d''avis en ce moment, réessayez plus tard';
  end if;
  insert into public.suggestions_clients(etablissement_id, qr_code_id, note, sujets, message)
  values (q.etablissement_id, q.id, v_note, v_sujets, v_message);
  return jsonb_build_object('merci', true);
end
$$;
revoke execute on function public.laisser_suggestion(text, jsonb) from public;
grant execute on function public.laisser_suggestion(text, jsonb) to anon, authenticated;

create function public.marquer_suggestion_lue(p_suggestion_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.suggestions_clients%rowtype;
begin
  select * into s from public.suggestions_clients where id = p_suggestion_id for update;
  if s.id is null then raise exception 'Avis introuvable'; end if;
  perform public.exiger_permission(s.etablissement_id, 'cloture.cloturer');
  update public.suggestions_clients set lue = true where id = s.id;
end
$$;
revoke execute on function public.marquer_suggestion_lue(uuid) from public, anon;
grant execute on function public.marquer_suggestion_lue(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Centre de pilotage : les chiffres sont regroupés ici, sur le serveur. Le téléphone reçoit de petits résumés
--    (internet lent) et fait lui-même les comparaisons, les signaux et les conseils.
--    Une « soirée » va de l'heure de début du service (Paramètres › Clôture, 8 h par défaut) au lendemain même heure.
--    Les ventes d'essai effacées ne comptent pas. Au-delà de 92 jours, les produits sont regroupés par mois.
-- ---------------------------------------------------------------------------
create function public.pilotage_bar(p_etablissement_id uuid, p_du date, p_au date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tz text;
  debut integer;
  de timestamptz;
  a timestamptz;
  par_mois boolean;
  r jsonb;
begin
  -- Gérant ou responsable seulement (les chiffres de toute la maison) : pas la caissière.
  perform public.exiger_permission(p_etablissement_id, 'cloture.cloturer');
  if p_du is null or p_au is null or p_au < p_du then raise exception 'Période invalide'; end if;
  if p_au - p_du > 400 then raise exception 'Période trop longue (400 jours au plus)'; end if;
  select coalesce(fuseau, 'Africa/Brazzaville') into tz from public.etablissements where id = p_etablissement_id;
  debut := coalesce((select case when (data ->> 'debut_service') ~ '^[0-9]{1,2}$' then (data ->> 'debut_service')::int end
                     from public.etablissement_parametres where etablissement_id = p_etablissement_id and module_id = 'cloture'), 8);
  debut := least(greatest(debut, 0), 23);
  de := (p_du + make_interval(hours => debut))::timestamp at time zone tz;
  a := (p_au + 1 + make_interval(hours => debut))::timestamp at time zone tz;
  par_mois := p_au - p_du > 92;

  with v as (
    select x.*, ((x.cree_le at time zone tz) - make_interval(hours => debut))::date as jour,
           extract(hour from x.cree_le at time zone tz)::int as heure
    from public.ventes x
    where x.etablissement_id = p_etablissement_id and x.cree_le >= de and x.cree_le < a
      and not exists (select 1 from public.ventes_essais e where e.vente_id = x.id and e.efface_le is not null)
  ), ok as (select * from v where statut = 'validee')
  select jsonb_build_object(
    'fuseau', tz, 'debut_service', debut, 'du', p_du, 'au', p_au, 'genere_le', now(),
    'heures', coalesce((select jsonb_agg(jsonb_build_array(jour, heure, nb, total)) from (
        select jour, heure, count(*) nb, sum(total) total from ok group by 1, 2 order by 1, 2) t), '[]'::jsonb),
    'produits', coalesce((select jsonb_agg(jsonb_build_array(jour, article_id, qte, total, cout)) from (
        select case when par_mois then date_trunc('month', ok.jour)::date else ok.jour end jour, l.article_id,
               sum(l.quantite) qte, sum(l.total) total, sum(l.quantite * coalesce(l.cout_unitaire, 0)) cout
        from ok join public.lignes_vente l on l.vente_id = ok.id
        where l.article_id is not null group by 1, 2 order by 1) t), '[]'::jsonb),
    'serveurs', coalesce((select jsonb_agg(jsonb_build_array(jour, serveur_id, nb, total)) from (
        select jour, serveur_id, count(*) nb, sum(total) total from ok group by 1, 2 order by 1) t), '[]'::jsonb),
    'caissiers', coalesce((select jsonb_agg(jsonb_build_array(jour, vendeur, nb, total)) from (
        select jour, vendeur, count(*) nb, sum(total) total from ok group by 1, 2 order by 1) t), '[]'::jsonb),
    'paiements', coalesce((select jsonb_agg(jsonb_build_array(jour, mode, moyen, montant, nb)) from (
        select ok.jour, p.mode,
               coalesce(nullif(upper(btrim(split_part(coalesce(p.reference, ''), '·', 1))), ''), upper(p.mode)) moyen,
               sum(p.montant) montant, count(*) nb
        from ok join public.paiements p on p.vente_id = ok.id and p.statut = 'valide'
        group by 1, 2, 3 order by 1) t), '[]'::jsonb),
    'reste_du', coalesce((select jsonb_agg(jsonb_build_array(jour, montant)) from (
        select jour, sum(total - montant_paye) montant from ok where montant_paye < total group by 1 order by 1) t), '[]'::jsonb),
    'remises', coalesce((select jsonb_agg(jsonb_build_array(jour, nb, total)) from (
        select jour, count(*) nb, sum(remise) total from ok where remise > 0 group by 1 order by 1) t), '[]'::jsonb),
    'annulations', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'numero', numero, 'total', total, 'quand', cree_le,
        'annulee_le', annulee_le, 'par', annulee_par, 'vendeur', vendeur, 'serveur_id', serveur_id, 'motif', motif_annulation, 'jour', jour)
        order by cree_le desc) from (select * from v where statut = 'annulee' order by cree_le desc limit 300) t), '[]'::jsonb),
    'personnes', coalesce((select jsonb_object_agg(p.id, coalesce(nullif(btrim(p.nom_complet), ''), 'Sans nom'))
        from public.profils p where p.id in (select vendeur from v union select annulee_par from v where annulee_par is not null)), '{}'::jsonb),
    'serveurs_liste', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'prenom', s.prenom, 'role', s.role,
        'photo_url', s.photo_url, 'statut', s.statut, 'actif', s.actif) order by s.prenom)
        from public.serveurs_caisse s where s.etablissement_id = p_etablissement_id and s.fusionne_dans is null), '[]'::jsonb),
    'clotures', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'numero', c.numero, 'ouverte_le', c.ouverte_le,
        'cloturee_le', c.cloturee_le, 'total_ventes', c.total_ventes, 'nombre_ventes', c.nombre_ventes, 'ecart', c.ecart,
        'especes_attendues', c.especes_attendues, 'especes_comptees', c.especes_comptees, 'encaissements', c.encaissements,
        'nombre_annulations', c.nombre_annulations, 'total_annulations', c.total_annulations, 'total_remises', c.total_remises,
        'automatique', c.automatique, 'caissier', s.ouverte_par, 'caissier_nom', pr.nom_complet) order by c.cloturee_le desc)
        from public.clotures c join public.sessions_caisse s on s.id = c.session_caisse_id
        left join public.profils pr on pr.id = s.ouverte_par
        where c.etablissement_id = p_etablissement_id and c.cloturee_le >= de and c.cloturee_le < a + interval '1 day'), '[]'::jsonb),
    'caisses_ouvertes', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'ouverte_le', s.ouverte_le, 'par', s.ouverte_par,
        'nom', pr.nom_complet, 'fond', s.fond_initial))
        from public.sessions_caisse s left join public.profils pr on pr.id = s.ouverte_par
        where s.etablissement_id = p_etablissement_id and s.statut = 'ouverte' and not s.rattrapage), '[]'::jsonb),
    'presences', coalesce((select jsonb_agg(jsonb_build_array(((x.cree_le at time zone tz) - make_interval(hours => debut))::date,
        x.user_id, x.evenement, x.delai_secondes)) from public.presences_caisse x
        where x.etablissement_id = p_etablissement_id and x.cree_le >= de and x.cree_le < a), '[]'::jsonb),
    'suggestions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'note', s.note, 'sujets', s.sujets, 'message', s.message,
        'lue', s.lue, 'quand', s.cree_le) order by s.cree_le desc) from (select * from public.suggestions_clients s
        where s.etablissement_id = p_etablissement_id and s.cree_le >= de and s.cree_le < a order by s.cree_le desc limit 200) s), '[]'::jsonb),
    'avis', coalesce((select jsonb_object_agg(cle, jsonb_build_object('avis', avis, 'quand', cree_le, 'valeur', valeur_depart)) from (
        select distinct on (cle) cle, avis, cree_le, valeur_depart from public.avis_recommandations
        where etablissement_id = p_etablissement_id order by cle, cree_le desc) t), '{}'::jsonb)
  ) into r;
  return r;
end
$$;
revoke execute on function public.pilotage_bar(uuid, date, date) from public, anon;
grant execute on function public.pilotage_bar(uuid, date, date) to authenticated;
