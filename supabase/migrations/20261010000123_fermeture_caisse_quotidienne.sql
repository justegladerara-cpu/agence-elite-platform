-- Fermeture automatique de la caisse chaque jour (2026-10-10, demande de Juste : « la caisse doit se fermer chaque jour
-- à minuit »). Réglage du module Clôture « fermeture_automatique » : heure locale de l'établissement, 00:00 par défaut,
-- vide = jamais (un bar de nuit peut choisir 04:00). Une caisse ouverte avant la dernière heure de fermeture est fermée
-- avec un ticket Z marqué « fermée automatiquement » : les espèces ne peuvent pas être comptées par la machine, le
-- comptage se saisit ensuite (compter_cloture), une seule fois. Après l'heure, plus rien ne s'enregistre sur la caisse
-- de la veille : il faut ouvrir la caisse du jour. Les tickets Z existants ne changent pas.

-- ---------------------------------------------------------------------------
-- 1. Réglage
-- ---------------------------------------------------------------------------
update public.modules set parametres_schema = parametres_schema || '[
  {"cle": "fermeture_automatique", "libelle": "Fermeture automatique de la caisse chaque jour, heure locale HH:MM (vide = jamais ; ex. 04:00 pour un bar de nuit)", "type": "texte", "defaut": "00:00", "motif": "^(([01][0-9]|2[0-3]):[0-5][0-9])?$"}
]'::jsonb
where id = 'cloture' and not parametres_schema @> '[{"cle": "fermeture_automatique"}]'::jsonb;

-- Un réglage texte peut déclarer un « motif » (expression régulière) : la valeur saisie doit le respecter.
create or replace function public.enregistrer_parametres_module(p_etablissement_id uuid, p_module_id text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  schema jsonb;
  cle text;
  attendu text;
  motif text;
begin
  perform public.exiger_permission(p_etablissement_id, 'etablissement.modifier');
  if not public.module_actif(p_etablissement_id, p_module_id) then
    raise exception 'Module inactif : %', p_module_id;
  end if;
  if jsonb_typeof(p_data) <> 'object' then
    raise exception 'Paramètres invalides';
  end if;
  select parametres_schema into schema from public.modules where id = p_module_id;
  for cle in select jsonb_object_keys(p_data) loop
    select d ->> 'type', d ->> 'motif' into attendu, motif from jsonb_array_elements(schema) d where d ->> 'cle' = cle;
    if attendu is null then
      raise exception 'Paramètre inconnu pour ce module : %', cle;
    end if;
    if (attendu = 'booleen' and jsonb_typeof(p_data -> cle) <> 'boolean')
       or (attendu = 'nombre' and jsonb_typeof(p_data -> cle) <> 'number')
       or (attendu = 'texte' and jsonb_typeof(p_data -> cle) <> 'string')
       or (attendu = 'texte' and motif is not null and btrim(p_data ->> cle) !~ motif) then
      raise exception 'Valeur invalide pour le paramètre %', cle;
    end if;
  end loop;
  insert into public.etablissement_parametres(etablissement_id, module_id, data)
  values (p_etablissement_id, p_module_id, p_data)
  on conflict (etablissement_id, module_id) do update set data = excluded.data;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Ticket Z automatique : espèces comptées plus tard
-- ---------------------------------------------------------------------------
alter table public.clotures alter column especes_comptees drop not null;
alter table public.clotures alter column ecart drop not null;
alter table public.clotures alter column cloturee_par drop not null;
alter table public.clotures add column automatique boolean not null default false;
alter table public.clotures add column comptee_le timestamptz;
alter table public.clotures add column comptee_par uuid references auth.users(id) on delete restrict;
alter table public.clotures add constraint clotures_comptage_ou_automatique
  check (automatique or (especes_comptees is not null and ecart is not null and cloturee_par is not null));

-- Un ticket Z reste définitif ; seule exception : saisir une fois les espèces d'un ticket fermé automatiquement.
create function public.proteger_cloture()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.automatique and old.especes_comptees is null and new.especes_comptees is not null
     and to_jsonb(new) - array['especes_comptees', 'ecart', 'commentaire', 'comptee_le', 'comptee_par']
       = to_jsonb(old) - array['especes_comptees', 'ecart', 'commentaire', 'comptee_le', 'comptee_par'] then
    return new;
  end if;
  raise exception 'Cette ligne est définitive et ne peut pas être modifiée';
end
$$;
drop trigger clotures_immuables on public.clotures;
create trigger clotures_immuables before update on public.clotures
for each row execute function public.proteger_cloture();

-- ---------------------------------------------------------------------------
-- 3. Calcul du ticket Z sans contrôle d'accès (usage interne), aperçu inchangé pour l'utilisateur
-- ---------------------------------------------------------------------------
create function public.donnees_cloture(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  session public.sessions_caisse%rowtype;
  encaissements jsonb;
  remboursements jsonb;
  especes numeric;
  especes_remboursees numeric;
  depenses_especes numeric;
begin
  select * into session from public.sessions_caisse where id = p_session_id;
  if session.id is null then raise exception 'Session de caisse introuvable'; end if;
  select coalesce(jsonb_object_agg(mode, total), '{}'::jsonb) into encaissements from (
    select p.mode, sum(p.montant) total from public.paiements p where p.session_caisse_id = session.id and p.statut = 'valide' group by p.mode
  ) t;
  select coalesce(jsonb_object_agg(mode, total), '{}'::jsonb) into remboursements from (
    select r.mode, sum(r.montant) total from public.remboursements_vente r where r.session_caisse_id = session.id group by r.mode
  ) t;
  especes := coalesce((encaissements ->> 'especes')::numeric, 0);
  especes_remboursees := coalesce((remboursements ->> 'especes')::numeric, 0);
  select coalesce(sum(montant), 0) into depenses_especes from public.depenses where session_caisse_id = session.id and statut = 'valide' and mode = 'especes';
  return jsonb_build_object(
    'session_id', session.id, 'statut', session.statut,
    'point_de_vente', (select nom from public.points_de_vente where id = session.point_de_vente_id),
    'hub_id', session.hub_id, 'hub', (select nom from public.hubs where id = session.hub_id),
    'ouverte_le', session.ouverte_le, 'fond_initial', session.fond_initial,
    'nombre_ventes', (select count(*) from public.ventes where session_caisse_id = session.id and statut = 'validee'),
    'total_ventes', (select coalesce(sum(total), 0) from public.ventes where session_caisse_id = session.id and statut = 'validee'),
    'nombre_annulations', (select count(*) from public.ventes where session_caisse_id = session.id and statut = 'annulee'),
    'total_annulations', (select coalesce(sum(total), 0) from public.ventes where session_caisse_id = session.id and statut = 'annulee'),
    'nombre_retours', (select count(*) from public.remboursements_vente where session_caisse_id = session.id),
    'total_retours', (select coalesce(sum(montant), 0) from public.remboursements_vente where session_caisse_id = session.id),
    'total_remises', (select coalesce(sum(v.remise), 0) + coalesce((select sum(l.remise) from public.lignes_vente l join public.ventes w on w.id = l.vente_id where w.session_caisse_id = session.id and w.statut = 'validee'), 0) from public.ventes v where v.session_caisse_id = session.id and v.statut = 'validee'),
    'encaissements', encaissements, 'remboursements', remboursements,
    'depenses_especes', depenses_especes,
    'credit_accorde', (select coalesce(sum(total - montant_paye), 0) from public.ventes where session_caisse_id = session.id and statut = 'validee'),
    'especes_attendues', session.fond_initial + especes - especes_remboursees - depenses_especes,
    'articles_vendus', coalesce((select jsonb_agg(jsonb_build_object('libelle', libelle, 'quantite', quantite, 'total', total) order by total desc) from (
      select l.libelle, sum(l.quantite) quantite, sum(l.total) total from public.lignes_vente l join public.ventes v on v.id = l.vente_id
      where v.session_caisse_id = session.id and v.statut = 'validee' group by l.libelle
    ) a), '[]'::jsonb)
  );
end
$$;
revoke execute on function public.donnees_cloture(uuid) from public, anon, authenticated;

create or replace function public.apercu_cloture(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  session public.sessions_caisse%rowtype;
begin
  select * into session from public.sessions_caisse where id = p_session_id;
  if session.id is null or not (public.lecture_autorisee(session.etablissement_id, 'cloture.lire') or public.a_permission(session.etablissement_id, 'caisse.utiliser'))
     or not public.lecture_hub(session.etablissement_id, session.hub_id) then raise exception 'Session de caisse introuvable'; end if;
  return public.donnees_cloture(p_session_id);
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Heure de fin de la journée de caisse
-- ---------------------------------------------------------------------------
-- Dernière heure de fermeture passée à p_instant (heure locale de l'établissement), ou null si désactivée.
create function public.fin_journee_caisse(p_etablissement_id uuid, p_instant timestamptz default now())
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  heure text := btrim(coalesce(public.parametre_module(p_etablissement_id, 'cloture', 'fermeture_automatique', '"00:00"'::jsonb) #>> '{}', ''));
  fuseau text := coalesce((select e.fuseau from public.etablissements e where e.id = p_etablissement_id), 'UTC');
  h time;
  local timestamp;
begin
  if heure !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    return null;
  end if;
  h := heure::time;
  local := p_instant at time zone fuseau;
  return ((local - h)::date + h) at time zone fuseau;
end
$$;
grant execute on function public.fin_journee_caisse(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Fermeture des caisses de la veille
-- ---------------------------------------------------------------------------
-- Usage interne (tâche planifiée, ouverture de caisse) : aucun contrôle d'accès, jamais appelable depuis l'interface.
create function public.fermer_caisses_echues(p_etablissement_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  session public.sessions_caisse%rowtype;
  fin timestamptz;
  apercu jsonb;
  numero text;
  nombre integer := 0;
begin
  for session in
    select s.* from public.sessions_caisse s
    where s.statut = 'ouverte' and (p_etablissement_id is null or s.etablissement_id = p_etablissement_id)
    order by s.ouverte_le
    for update skip locked
  loop
    fin := public.fin_journee_caisse(session.etablissement_id, now());
    continue when fin is null or session.ouverte_le >= fin;
    apercu := public.donnees_cloture(session.id);
    numero := public.prochain_numero(session.etablissement_id, 'cloture', 'Z-');
    insert into public.clotures(etablissement_id, hub_id, numero, session_caisse_id, point_de_vente_id, ouverte_le, cloturee_le, cloturee_par,
      fond_initial, nombre_ventes, total_ventes, nombre_annulations, total_annulations, nombre_retours, total_retours, total_remises,
      encaissements, remboursements, depenses_especes, credit_accorde, especes_attendues, especes_comptees, ecart, articles_vendus,
      commentaire, automatique)
    values (session.etablissement_id, session.hub_id, numero, session.id, session.point_de_vente_id, session.ouverte_le, fin, null,
      session.fond_initial, (apercu->>'nombre_ventes')::int, (apercu->>'total_ventes')::numeric, (apercu->>'nombre_annulations')::int,
      (apercu->>'total_annulations')::numeric, (apercu->>'nombre_retours')::int, (apercu->>'total_retours')::numeric,
      (apercu->>'total_remises')::numeric, apercu->'encaissements', apercu->'remboursements', (apercu->>'depenses_especes')::numeric,
      (apercu->>'credit_accorde')::numeric, (apercu->>'especes_attendues')::numeric, null, null, apercu->'articles_vendus',
      'Fermée automatiquement : espèces à compter', true);
    update public.sessions_caisse set statut = 'cloturee', cloturee_le = fin where id = session.id;
    nombre := nombre + 1;
  end loop;
  return nombre;
end
$$;
revoke execute on function public.fermer_caisses_echues(uuid) from public, anon, authenticated;

-- Depuis la caisse : ferme les caisses de la veille de l'établissement avant d'afficher la caisse.
create function public.fermer_caisses_du_jour(p_etablissement_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.a_permission(p_etablissement_id, 'caisse.utiliser') or public.lecture_autorisee(p_etablissement_id, 'cloture.lire')) then
    raise exception 'Accès refusé';
  end if;
  return public.fermer_caisses_echues(p_etablissement_id);
end
$$;
revoke execute on function public.fermer_caisses_du_jour(uuid) from public, anon;
grant execute on function public.fermer_caisses_du_jour(uuid) to authenticated;

-- Ouvrir la caisse ferme d'abord celle de la veille (sinon la caisse de la veille serait rendue telle quelle).
create or replace function public.ouvrir_caisse(p_etablissement_id uuid, p_point_de_vente_id uuid default null, p_fond_initial numeric default 0)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pdv public.points_de_vente%rowtype;
  existante uuid;
  resultat uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'caisse.utiliser');
  perform public.fermer_caisses_echues(p_etablissement_id);
  if p_point_de_vente_id is null then
    select p.* into pdv from public.points_de_vente p join public.hubs h on h.id = p.hub_id
    where p.etablissement_id = p_etablissement_id and p.actif and h.actif and h.capacite_caisse and public.acces_hub(h.id)
    order by h.principal desc, p.cree_le limit 1;
    if pdv.id is null and exists (
      select 1 from public.hubs h where h.etablissement_id = p_etablissement_id and h.principal and h.actif and h.capacite_caisse
        and public.acces_hub(h.id)
    ) and not exists (select 1 from public.points_de_vente where etablissement_id = p_etablissement_id and nom = 'Caisse principale') then
      insert into public.points_de_vente (etablissement_id, hub_id, nom)
      values (p_etablissement_id, public.hub_principal(p_etablissement_id), 'Caisse principale')
      returning * into pdv;
    end if;
    if pdv.id is null then
      raise exception 'Aucune caisse active dans vos Hubs';
    end if;
  else
    select * into pdv from public.points_de_vente where id = p_point_de_vente_id and etablissement_id = p_etablissement_id;
    if pdv.id is null or not pdv.actif then
      raise exception 'Point de vente introuvable ou inactif';
    end if;
  end if;
  perform public.exiger_acces_hub(pdv.hub_id);
  if not exists (select 1 from public.hubs where id = pdv.hub_id and actif and capacite_caisse) then
    raise exception 'Ce Hub n''a pas de caisse active';
  end if;
  select id into existante from public.sessions_caisse where point_de_vente_id = pdv.id and statut = 'ouverte';
  if existante is not null then
    return existante;
  end if;
  if coalesce(p_fond_initial, 0) < 0 then
    raise exception 'Le fond de caisse ne peut pas être négatif';
  end if;
  insert into public.sessions_caisse (etablissement_id, point_de_vente_id, hub_id, fond_initial, ouverte_par)
  values (p_etablissement_id, pdv.id, pdv.hub_id, coalesce(p_fond_initial, 0), auth.uid())
  returning id into resultat;
  return resultat;
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Après l'heure, rien ne s'enregistre plus sur la caisse de la veille
-- ---------------------------------------------------------------------------
create function public.refuser_caisse_echue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  session public.sessions_caisse%rowtype;
  fin timestamptz;
begin
  if new.session_caisse_id is null then
    return new;
  end if;
  select * into session from public.sessions_caisse where id = new.session_caisse_id;
  if session.statut = 'ouverte' then
    fin := public.fin_journee_caisse(session.etablissement_id, now());
    if fin is not null and session.ouverte_le < fin then
      raise exception 'Journée de caisse terminée (fermeture automatique) : ouvrez la caisse du jour pour continuer';
    end if;
  end if;
  return new;
end
$$;
create trigger ventes_caisse_du_jour before insert on public.ventes
for each row execute function public.refuser_caisse_echue();
create trigger paiements_caisse_du_jour before insert on public.paiements
for each row execute function public.refuser_caisse_echue();
create trigger depenses_caisse_du_jour before insert on public.depenses
for each row execute function public.refuser_caisse_echue();
create trigger remboursements_caisse_du_jour before insert on public.remboursements_vente
for each row execute function public.refuser_caisse_echue();

-- ---------------------------------------------------------------------------
-- 7. Saisir les espèces d'un ticket Z fermé automatiquement (une seule fois)
-- ---------------------------------------------------------------------------
create function public.compter_cloture(p_cloture_id uuid, p_especes_comptees numeric, p_commentaire text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  z public.clotures%rowtype;
begin
  select * into z from public.clotures where id = p_cloture_id for update;
  if z.id is null then
    raise exception 'Ticket Z introuvable';
  end if;
  perform public.exiger_permission(z.etablissement_id, 'cloture.cloturer');
  perform public.exiger_acces_hub(z.hub_id);
  if not z.automatique or z.especes_comptees is not null then
    raise exception 'Les espèces de ce ticket Z sont déjà comptées';
  end if;
  if p_especes_comptees is null or p_especes_comptees < 0 then
    raise exception 'Indiquez les espèces comptées dans le tiroir';
  end if;
  if length(coalesce(p_commentaire, '')) > 500 then
    raise exception 'Commentaire trop long (500 caractères au plus)';
  end if;
  update public.clotures set especes_comptees = round(p_especes_comptees, 2), ecart = round(p_especes_comptees, 2) - especes_attendues,
    comptee_le = now(), comptee_par = auth.uid(),
    commentaire = coalesce(nullif(btrim(p_commentaire), ''), commentaire)
  where id = z.id
  returning * into z;
  return to_jsonb(z);
end
$$;
revoke execute on function public.compter_cloture(uuid, numeric, text) from public, anon;
grant execute on function public.compter_cloture(uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Tâche planifiée (production) : toutes les 5 minutes. Sans pg_cron (tests, démo), la fermeture se fait à l'ouverture
--    de la caisse et à l'affichage de la caisse ; le déclencheur du point 6 garantit déjà qu'aucune vente n'est comptée
--    sur la mauvaise journée.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('fermer-caisses-echues', '*/5 * * * *', 'select public.fermer_caisses_echues()');
  end if;
end
$$;

notify pgrst, 'reload schema';
