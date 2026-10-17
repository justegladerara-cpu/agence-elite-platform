-- Caisse du Dream (demande de Juste, 2026-10-13) : un bar ouvert 24 h/24, une seule caisse physique.
-- 1. Une seule caisse ouverte à la fois par point de vente (réglage « caisse_unique », oui par défaut) : la caissière
--    suivante ouvre seulement après le ticket Z de la précédente. Un responsable peut fermer une caisse oubliée sans
--    compter (ticket Z « espèces à compter »).
-- 2. Factures en cours au ticket Z : elles passent à la caissière suivante et le ticket Z les note (nombre, montant).
-- 3. Tableau de bord par service : une vente compte pour le jour où la caisse a été ouverte, pas pour l'heure du
--    calendrier (un service de 18 h à 3 h reste entier). Dernière vente et nombre de ventes du service en cours.
-- 4. Alerte « ticket Z non tiré » : caisse ouverte depuis plus de N heures ou sans vente depuis N heures (réglages),
--    notification au gérant et aux responsables, et à la caissière.
-- 5. Serveurs : une liste par établissement, partagée par toutes les tablettes. Un prénom tapé une fois est gardé.
--    Le serveur se choisit à la commande, suit la facture en cours, et se retrouve dans les statistiques.
-- Migration additive : aucune vente, caisse ni ticket Z existant n'est modifié (seul « serveur_id » est rempli pour
-- les ventes qui avaient déjà un « Servi par »).

-- ---------------------------------------------------------------------------
-- 0. Réglages
-- ---------------------------------------------------------------------------
update public.modules set parametres_schema = parametres_schema || '[
  {"cle": "caisse_unique", "libelle": "Une seule caisse ouverte à la fois par point de vente : la caissière suivante ouvre après le ticket Z de la précédente", "type": "booleen", "defaut": true}
]'::jsonb
where id = 'cloture' and not parametres_schema @> '[{"cle": "caisse_unique"}]'::jsonb;

update public.modules set parametres_schema = parametres_schema || '[
  {"cle": "alerte_caisse_ouverte_heures", "libelle": "Alerte « ticket Z non tiré » quand une caisse est ouverte depuis plus de N heures (0 = jamais)", "type": "nombre", "defaut": 12}
]'::jsonb
where id = 'cloture' and not parametres_schema @> '[{"cle": "alerte_caisse_ouverte_heures"}]'::jsonb;

update public.modules set parametres_schema = parametres_schema || '[
  {"cle": "alerte_caisse_inactive_heures", "libelle": "Alerte quand une caisse ouverte n''a fait aucune vente depuis N heures (0 = jamais)", "type": "nombre", "defaut": 4}
]'::jsonb
where id = 'cloture' and not parametres_schema @> '[{"cle": "alerte_caisse_inactive_heures"}]'::jsonb;

-- ---------------------------------------------------------------------------
-- 1. Une seule caisse ouverte à la fois
-- ---------------------------------------------------------------------------
create or replace function public.ouvrir_caisse(p_etablissement_id uuid, p_point_de_vente_id uuid default null, p_fond_initial numeric default 0)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pdv public.points_de_vente%rowtype;
  existante uuid;
  autre public.sessions_caisse%rowtype;
  resultat uuid;
  fuseau text := coalesce((select e.fuseau from public.etablissements e where e.id = p_etablissement_id), 'UTC');
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
  -- Verrou sur le point de vente : deux personnes qui ouvrent au même instant passent l'une après l'autre.
  perform 1 from public.points_de_vente where id = pdv.id for update;
  select id into existante from public.sessions_caisse
  where point_de_vente_id = pdv.id and statut = 'ouverte' and not rattrapage and ouverte_par = auth.uid();
  if existante is not null then
    return existante;
  end if;
  if coalesce((public.parametre_module(p_etablissement_id, 'cloture', 'caisse_unique', 'true'::jsonb) #>> '{}')::boolean, true) then
    select * into autre from public.sessions_caisse
    where point_de_vente_id = pdv.id and statut = 'ouverte' and not rattrapage
    order by ouverte_le limit 1;
    if autre.id is not null then
      raise exception 'La caisse de % est encore ouverte (depuis le %). Elle doit d''abord tirer son ticket Z, ou un responsable la ferme.',
        public.nom_membre_restaurant(autre.ouverte_par), to_char(autre.ouverte_le at time zone fuseau, 'DD/MM à HH24:MI');
    end if;
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

-- Qui occupe la caisse : affiché à la personne qui veut ouvrir (nom et heure seulement, aucun montant).
create function public.caisse_occupee(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.a_permission(p_etablissement_id, 'caisse.utiliser') or public.voit_toutes_caisses(p_etablissement_id)) then
    raise exception 'Accès refusé';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'session_id', s.id, 'point_de_vente_id', s.point_de_vente_id, 'ouverte_le', s.ouverte_le,
        'caissier', public.nom_membre_restaurant(s.ouverte_par), 'mienne', s.ouverte_par = auth.uid())
      order by s.ouverte_le)
    from public.sessions_caisse s
    where s.etablissement_id = p_etablissement_id and s.statut = 'ouverte' and not s.rattrapage
      and public.lecture_hub(s.etablissement_id, s.hub_id)
  ), '[]'::jsonb);
end
$$;
revoke execute on function public.caisse_occupee(uuid) from public, anon;
grant execute on function public.caisse_occupee(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Factures en cours notées sur le ticket Z (elles passent à la caissière suivante)
-- ---------------------------------------------------------------------------
alter table public.clotures add column if not exists factures_en_cours integer not null default 0;
alter table public.clotures add column if not exists total_factures_en_cours numeric(14, 2) not null default 0;

create function public.noter_factures_en_cours_cloture()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select count(*), coalesce(sum(total_estime), 0) into new.factures_en_cours, new.total_factures_en_cours
  from public.ventes_en_attente where session_caisse_id = new.session_caisse_id and statut = 'en_attente';
  return new;
end
$$;
revoke execute on function public.noter_factures_en_cours_cloture() from public, anon, authenticated;
create trigger clotures_factures_en_cours before insert on public.clotures
for each row execute function public.noter_factures_en_cours_cloture();

-- ---------------------------------------------------------------------------
-- 3. Un responsable ferme une caisse oubliée sans compter : ticket Z « espèces à compter »
-- ---------------------------------------------------------------------------
create function public.fermer_caisse_oubliee(p_session_id uuid, p_motif text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session public.sessions_caisse%rowtype;
  apercu jsonb;
  numero text;
  resultat public.clotures%rowtype;
  motif text := nullif(left(btrim(coalesce(p_motif, '')), 300), '');
begin
  select * into session from public.sessions_caisse where id = p_session_id for update;
  if session.id is null then raise exception 'Session de caisse introuvable'; end if;
  perform public.exiger_permission(session.etablissement_id, 'cloture.cloturer');
  perform public.exiger_acces_hub(session.hub_id);
  if session.statut <> 'ouverte' then raise exception 'Cette caisse est déjà clôturée'; end if;
  if session.rattrapage then raise exception 'Une caisse de rattrapage se clôture depuis la saisie après coup'; end if;
  apercu := public.donnees_cloture(session.id);
  numero := public.prochain_numero(session.etablissement_id, 'cloture', 'Z-');
  insert into public.clotures(etablissement_id, hub_id, numero, session_caisse_id, point_de_vente_id, ouverte_le, cloturee_le, cloturee_par,
    fond_initial, nombre_ventes, total_ventes, nombre_annulations, total_annulations, nombre_retours, total_retours, total_remises,
    encaissements, remboursements, depenses_especes, credit_accorde, especes_attendues, especes_comptees, ecart, articles_vendus,
    commentaire, automatique)
  values (session.etablissement_id, session.hub_id, numero, session.id, session.point_de_vente_id, session.ouverte_le, now(), auth.uid(),
    session.fond_initial, (apercu->>'nombre_ventes')::int, (apercu->>'total_ventes')::numeric, (apercu->>'nombre_annulations')::int,
    (apercu->>'total_annulations')::numeric, (apercu->>'nombre_retours')::int, (apercu->>'total_retours')::numeric,
    (apercu->>'total_remises')::numeric, apercu->'encaissements', apercu->'remboursements', (apercu->>'depenses_especes')::numeric,
    (apercu->>'credit_accorde')::numeric, (apercu->>'especes_attendues')::numeric, null, null, apercu->'articles_vendus',
    'Caisse oubliée fermée par ' || public.nom_membre_restaurant(auth.uid()) || ' : espèces à compter' || coalesce(' (' || motif || ')', ''), true)
  returning * into resultat;
  update public.sessions_caisse set statut = 'cloturee', cloturee_le = now() where id = session.id;
  if session.ouverte_par is distinct from auth.uid() then
    perform public.notifier(session.ouverte_par, session.etablissement_id, 'cloture.fermee_par_responsable',
      'Ta caisse a été fermée par un responsable', 'Ticket Z ' || numero || ' : les espèces restent à compter.', 'cloture');
  end if;
  return to_jsonb(resultat) || jsonb_build_object('point_de_vente', apercu->>'point_de_vente', 'hub', apercu->>'hub',
    'caissier_id', session.ouverte_par, 'caissier', public.nom_membre_restaurant(session.ouverte_par));
end
$$;
revoke execute on function public.fermer_caisse_oubliee(uuid, text) from public, anon;
grant execute on function public.fermer_caisse_oubliee(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Tableau de bord par service
-- ---------------------------------------------------------------------------
-- Une vente de caisse compte pour le jour (heure locale) où SA caisse a été ouverte : une soirée de 18 h à 3 h reste
-- entière, à la caissière qui l'a tenue. Les autres ventes (facture, boutique en ligne) gardent leur date.
create or replace function public.activite_caissiers(p_etablissement_id uuid, p_du date default null, p_au date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  fuseau text := coalesce((select e.fuseau from public.etablissements e where e.id = p_etablissement_id), 'UTC');
  du date := coalesce(p_du, (now() at time zone fuseau)::date);
  au date := coalesce(p_au, du);
begin
  if not public.voit_toutes_caisses(p_etablissement_id) then
    raise exception 'Accès refusé';
  end if;
  return coalesce((
    with ventes as (
      select coalesce(s.ouverte_par, v.vendeur) personne, v.total
      from public.ventes v
      left join public.sessions_caisse s on s.id = v.session_caisse_id
      where v.etablissement_id = p_etablissement_id and v.statut = 'validee'
        and (coalesce(s.ouverte_le, v.cree_le) at time zone fuseau)::date between du and au
        and public.lecture_hub(v.etablissement_id, v.hub_id)
    ), totaux as (
      select personne, count(*) nombre, sum(total) total from ventes where personne is not null group by personne
    ), ouvertes as (
      select s.ouverte_par personne, min(s.ouverte_le) depuis,
        string_agg(distinct p.nom, ', ') caisses,
        sum((select coalesce(sum(v.total), 0) from public.ventes v where v.session_caisse_id = s.id and v.statut = 'validee')) en_cours,
        sum((select count(*) from public.ventes v where v.session_caisse_id = s.id and v.statut = 'validee')) nombre_en_cours,
        max((select max(v.cree_le) from public.ventes v where v.session_caisse_id = s.id and v.statut = 'validee')) derniere_vente
      from public.sessions_caisse s join public.points_de_vente p on p.id = s.point_de_vente_id
      where s.etablissement_id = p_etablissement_id and s.statut = 'ouverte' and not s.rattrapage
        and public.lecture_hub(s.etablissement_id, s.hub_id)
      group by s.ouverte_par
    )
    select jsonb_agg(jsonb_build_object(
        'id', x.personne, 'nom', public.nom_membre_restaurant(x.personne),
        'nombre_ventes', coalesce(t.nombre, 0), 'total_ventes', coalesce(t.total, 0),
        'en_caisse', o.personne is not null, 'depuis', o.depuis, 'caisses', o.caisses, 'caisse_en_cours', o.en_cours,
        'nombre_en_cours', o.nombre_en_cours, 'derniere_vente', o.derniere_vente)
      order by coalesce(t.total, 0) desc, public.nom_membre_restaurant(x.personne))
    from (select personne from totaux union select personne from ouvertes) x
    left join totaux t on t.personne = x.personne
    left join ouvertes o on o.personne = x.personne
  ), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Alerte « ticket Z non tiré »
-- ---------------------------------------------------------------------------
-- Une alerte par caisse et par motif : la notification part une seule fois.
create table public.caisse_alertes (
  session_caisse_id uuid not null references public.sessions_caisse(id) on delete restrict,
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  motif text not null check (motif in ('ouverte_longtemps', 'sans_vente')),
  cree_le timestamptz not null default now(),
  primary key (session_caisse_id, motif)
);
alter table public.caisse_alertes enable row level security;
create policy lecture on public.caisse_alertes for select to authenticated
  using (public.voit_toutes_caisses(etablissement_id));
create trigger caisse_alertes_sans_suppression before delete on public.caisse_alertes
  for each row execute function public.refuser_suppression();

-- Caisses ouvertes qui dépassent les seuils, calculées à l'instant (sans rien écrire).
create function public.caisses_en_retard(p_etablissement_id uuid)
returns table (session_id uuid, ouverte_par uuid, caissier text, ouverte_le timestamptz, derniere_vente timestamptz,
  nombre_ventes bigint, total_ventes numeric, ouverte_longtemps boolean, sans_vente boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with seuils as (
    select greatest(coalesce((public.parametre_module(p_etablissement_id, 'cloture', 'alerte_caisse_ouverte_heures', '12'::jsonb) #>> '{}')::numeric, 0), 0) ouverte,
      greatest(coalesce((public.parametre_module(p_etablissement_id, 'cloture', 'alerte_caisse_inactive_heures', '4'::jsonb) #>> '{}')::numeric, 0), 0) inactive
  ), caisses as (
    select s.id, s.ouverte_par, s.ouverte_le,
      (select max(v.cree_le) from public.ventes v where v.session_caisse_id = s.id and v.statut = 'validee') derniere,
      (select count(*) from public.ventes v where v.session_caisse_id = s.id and v.statut = 'validee') nombre,
      (select coalesce(sum(v.total), 0) from public.ventes v where v.session_caisse_id = s.id and v.statut = 'validee') total
    from public.sessions_caisse s
    where s.etablissement_id = p_etablissement_id and s.statut = 'ouverte' and not s.rattrapage
  )
  select c.id, c.ouverte_par, public.nom_membre_restaurant(c.ouverte_par), c.ouverte_le, c.derniere, c.nombre, c.total,
    x.ouverte > 0 and c.ouverte_le < now() - make_interval(secs => (x.ouverte * 3600)::double precision),
    x.inactive > 0 and coalesce(c.derniere, c.ouverte_le) < now() - make_interval(secs => (x.inactive * 3600)::double precision)
  from caisses c cross join seuils x
  where (x.ouverte > 0 and c.ouverte_le < now() - make_interval(secs => (x.ouverte * 3600)::double precision))
     or (x.inactive > 0 and coalesce(c.derniere, c.ouverte_le) < now() - make_interval(secs => (x.inactive * 3600)::double precision))
$$;
revoke execute on function public.caisses_en_retard(uuid) from public, anon, authenticated;

-- Envoie les alertes pas encore envoyées (tâche planifiée, et à chaque ouverture du tableau de bord). Les responsables
-- sont tous prévenus, y compris celui qui ouvre le tableau de bord.
create function public.alerter_caisses_ouvertes(p_etablissement_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  e uuid;
  c record;
  nombre integer := 0;
  heures integer;
begin
  for e in
    select distinct s.etablissement_id from public.sessions_caisse s
    where s.statut = 'ouverte' and not s.rattrapage and (p_etablissement_id is null or s.etablissement_id = p_etablissement_id)
  loop
    for c in select * from public.caisses_en_retard(e) loop
      if c.ouverte_longtemps then
        insert into public.caisse_alertes(session_caisse_id, etablissement_id, motif) values (c.session_id, e, 'ouverte_longtemps')
        on conflict do nothing;
        if found then
          heures := floor(extract(epoch from now() - c.ouverte_le) / 3600);
          perform public.notifier(r, e, 'cloture.z_non_tire', 'Ticket Z non tiré : ' || c.caissier,
            'La caisse de ' || c.caissier || ' est ouverte depuis ' || heures || ' h (' || c.nombre_ventes || ' vente(s)). Demandez-lui de tirer son ticket Z, ou fermez la caisse.',
            'cloture')
          from public.membres_avec_permission(e, 'cloture.cloturer') r where r is distinct from c.ouverte_par;
          perform public.notifier(c.ouverte_par, e, 'cloture.z_non_tire', 'Pense à tirer ton ticket Z',
            'Ta caisse est ouverte depuis ' || heures || ' h.', 'caisse');
          nombre := nombre + 1;
        end if;
      end if;
      if c.sans_vente then
        insert into public.caisse_alertes(session_caisse_id, etablissement_id, motif) values (c.session_id, e, 'sans_vente')
        on conflict do nothing;
        if found then
          heures := floor(extract(epoch from now() - coalesce(c.derniere_vente, c.ouverte_le)) / 3600);
          perform public.notifier(r, e, 'cloture.caisse_inactive', 'Caisse sans vente : ' || c.caissier,
            'Aucune vente depuis ' || heures || ' h sur la caisse de ' || c.caissier || ', toujours ouverte. Ticket Z oublié ?',
            'cloture')
          from public.membres_avec_permission(e, 'cloture.cloturer') r where r is distinct from c.ouverte_par;
          nombre := nombre + 1;
        end if;
      end if;
    end loop;
  end loop;
  return nombre;
end
$$;
revoke execute on function public.alerter_caisses_ouvertes(uuid) from public, anon, authenticated;

-- Pour le tableau de bord : envoie les alertes en attente, puis rend la liste des caisses en retard.
create function public.alertes_caisses(p_etablissement_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.voit_toutes_caisses(p_etablissement_id) then
    raise exception 'Accès refusé';
  end if;
  perform public.alerter_caisses_ouvertes(p_etablissement_id);
  return coalesce((
    select jsonb_agg(to_jsonb(r) order by r.ouverte_le) from public.caisses_en_retard(p_etablissement_id) r
  ), '[]'::jsonb) ;
end
$$;
revoke execute on function public.alertes_caisses(uuid) from public, anon;
grant execute on function public.alertes_caisses(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('alerter-caisses-ouvertes', '*/15 * * * *', 'select public.alerter_caisses_ouvertes()');
  end if;
exception when others then
  raise warning 'Tâche planifiée non installée (%), alertes envoyées à l''ouverture du tableau de bord', sqlerrm;
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Serveurs
-- ---------------------------------------------------------------------------
create table public.serveurs_caisse (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  prenom text not null check (length(btrim(prenom)) between 1 and 40),
  actif boolean not null default true,
  fusionne_dans uuid references public.serveurs_caisse(id) on delete restrict,
  cree_par uuid references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now()
);
create unique index serveurs_caisse_prenom_actif on public.serveurs_caisse(etablissement_id, lower(btrim(prenom))) where actif;
alter table public.serveurs_caisse enable row level security;
create policy lecture on public.serveurs_caisse for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'caisse.utiliser') or public.voit_toutes_caisses(etablissement_id));
create trigger serveurs_caisse_verrou_etablissement before update on public.serveurs_caisse
  for each row execute function public.verrouiller_etablissement_id();
create trigger serveurs_caisse_sans_suppression before delete on public.serveurs_caisse
  for each row execute function public.refuser_suppression();

alter table public.ventes add column if not exists serveur_id uuid references public.serveurs_caisse(id) on delete restrict;
create index if not exists ventes_serveur_idx on public.ventes(serveur_id) where serveur_id is not null;
alter table public.ventes_en_attente add column if not exists serveur_id uuid references public.serveurs_caisse(id) on delete restrict;

-- Trouve le serveur actif de ce prénom, ou le crée (usage interne).
create function public.serveur_par_prenom(p_etablissement_id uuid, p_prenom text)
returns public.serveurs_caisse
language plpgsql
security definer
set search_path = ''
as $$
declare
  nom text := nullif(left(regexp_replace(btrim(coalesce(p_prenom, '')), '\s+', ' ', 'g'), 40), '');
  s public.serveurs_caisse%rowtype;
begin
  if nom is null then
    raise exception 'Tapez le prénom du serveur';
  end if;
  select * into s from public.serveurs_caisse
  where etablissement_id = p_etablissement_id and actif and lower(btrim(prenom)) = lower(nom);
  if s.id is null then
    insert into public.serveurs_caisse(etablissement_id, prenom, cree_par) values (p_etablissement_id, nom, auth.uid())
    on conflict do nothing
    returning * into s;
    if s.id is null then
      select * into s from public.serveurs_caisse
      where etablissement_id = p_etablissement_id and actif and lower(btrim(prenom)) = lower(nom);
    end if;
  end if;
  return s;
end
$$;
revoke execute on function public.serveur_par_prenom(uuid, text) from public, anon, authenticated;

-- « + Nouveau serveur » à la caisse : le prénom est gardé pour toutes les tablettes.
create function public.enregistrer_serveur(p_etablissement_id uuid, p_prenom text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.serveurs_caisse%rowtype;
begin
  if not (public.a_permission(p_etablissement_id, 'caisse.utiliser') or public.a_permission(p_etablissement_id, 'cloture.cloturer')) then
    raise exception 'Permission refusée';
  end if;
  if (select count(*) from public.serveurs_caisse where etablissement_id = p_etablissement_id and actif) >= 200 then
    raise exception 'Déjà 200 serveurs actifs : désactivez ceux qui sont partis';
  end if;
  s := public.serveur_par_prenom(p_etablissement_id, p_prenom);
  return jsonb_build_object('id', s.id, 'prenom', s.prenom);
end
$$;
revoke execute on function public.enregistrer_serveur(uuid, text) from public, anon;
grant execute on function public.enregistrer_serveur(uuid, text) to authenticated;

-- Servi par (migration 129) : le nom tapé ou choisi rejoint la liste des serveurs.
create or replace function public.indiquer_serveur_vente(p_vente_id uuid, p_nom text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.ventes%rowtype;
  nom text := nullif(left(btrim(coalesce(p_nom, '')), 60), '');
  s public.serveurs_caisse%rowtype;
begin
  select * into v from public.ventes where id = p_vente_id for update;
  if not found then
    raise exception 'Vente introuvable';
  end if;
  if not ((v.vendeur = auth.uid() and public.a_permission(v.etablissement_id, 'caisse.utiliser'))
          or public.a_permission(v.etablissement_id, 'cloture.cloturer')) then
    raise exception 'Permission refusée';
  end if;
  if v.statut <> 'validee' then
    raise exception 'Une vente annulée est définitive';
  end if;
  if nom is null then
    update public.ventes set servi_par = null, serveur_id = null where id = v.id;
    return;
  end if;
  s := public.serveur_par_prenom(v.etablissement_id, nom);
  update public.ventes set servi_par = s.prenom, serveur_id = s.id where id = v.id;
end
$$;

-- Le serveur suit la facture en cours (table) jusqu'à l'encaissement.
create function public.indiquer_serveur_attente(p_attente_id uuid, p_serveur_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.ventes_en_attente%rowtype;
  session public.sessions_caisse%rowtype;
begin
  select * into a from public.ventes_en_attente where id = p_attente_id for update;
  if a.id is null then raise exception 'Facture en cours introuvable'; end if;
  perform public.exiger_permission(a.etablissement_id, 'caisse.utiliser');
  perform public.exiger_acces_hub(a.hub_id);
  if a.statut <> 'en_attente' then raise exception 'Cette facture n''est plus en cours'; end if;
  select * into session from public.sessions_caisse where id = a.session_caisse_id;
  if session.statut = 'ouverte' and session.ouverte_par is distinct from auth.uid()
     and not public.a_permission(a.etablissement_id, 'cloture.cloturer') then
    raise exception 'Cette caisse est celle d''une autre personne : seul un responsable peut intervenir dessus';
  end if;
  if p_serveur_id is not null and not exists (
    select 1 from public.serveurs_caisse where id = p_serveur_id and etablissement_id = a.etablissement_id and actif
  ) then raise exception 'Serveur inconnu dans cet établissement'; end if;
  update public.ventes_en_attente set serveur_id = p_serveur_id where id = a.id;
end
$$;
revoke execute on function public.indiquer_serveur_attente(uuid, uuid) from public, anon;
grant execute on function public.indiquer_serveur_attente(uuid, uuid) to authenticated;

-- Gérant : désactiver un serveur parti (l'historique reste) ou le réactiver.
create function public.activer_serveur(p_serveur_id uuid, p_actif boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.serveurs_caisse%rowtype;
begin
  select * into s from public.serveurs_caisse where id = p_serveur_id for update;
  if s.id is null then raise exception 'Serveur introuvable'; end if;
  perform public.exiger_permission(s.etablissement_id, 'cloture.cloturer');
  if s.fusionne_dans is not null then raise exception 'Ce serveur a été fusionné avec un autre'; end if;
  if coalesce(p_actif, false) and exists (
    select 1 from public.serveurs_caisse where etablissement_id = s.etablissement_id and actif and id <> s.id
      and lower(btrim(prenom)) = lower(btrim(s.prenom))
  ) then raise exception 'Un serveur actif porte déjà ce prénom'; end if;
  update public.serveurs_caisse set actif = coalesce(p_actif, false) where id = s.id;
end
$$;
revoke execute on function public.activer_serveur(uuid, boolean) from public, anon;
grant execute on function public.activer_serveur(uuid, boolean) to authenticated;

-- Gérant : fusionner un doublon (« jean » dans « Jean ») ; ses ventes passent au serveur gardé.
create function public.fusionner_serveurs(p_source_id uuid, p_cible_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  source public.serveurs_caisse%rowtype;
  cible public.serveurs_caisse%rowtype;
begin
  select * into source from public.serveurs_caisse where id = p_source_id for update;
  select * into cible from public.serveurs_caisse where id = p_cible_id for update;
  if source.id is null or cible.id is null or source.etablissement_id <> cible.etablissement_id then
    raise exception 'Serveur introuvable';
  end if;
  perform public.exiger_permission(source.etablissement_id, 'cloture.cloturer');
  if source.id = cible.id then raise exception 'Choisissez deux serveurs différents'; end if;
  if cible.fusionne_dans is not null or source.fusionne_dans is not null then raise exception 'Ce serveur a déjà été fusionné'; end if;
  update public.ventes set serveur_id = cible.id, servi_par = cible.prenom where serveur_id = source.id;
  update public.ventes_en_attente set serveur_id = cible.id where serveur_id = source.id;
  update public.serveurs_caisse set actif = false, fusionne_dans = cible.id where id = source.id;
end
$$;
revoke execute on function public.fusionner_serveurs(uuid, uuid) from public, anon;
grant execute on function public.fusionner_serveurs(uuid, uuid) to authenticated;

-- Statistiques par serveur sur une période (jour du service, comme le tableau des caissières).
create function public.statistiques_serveurs_caisse(p_etablissement_id uuid, p_du date default null, p_au date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  fuseau text := coalesce((select e.fuseau from public.etablissements e where e.id = p_etablissement_id), 'UTC');
  du date := coalesce(p_du, (now() at time zone fuseau)::date);
  au date := coalesce(p_au, du);
begin
  if not public.voit_toutes_caisses(p_etablissement_id) then
    raise exception 'Accès refusé';
  end if;
  if au < du then raise exception 'Période invalide'; end if;
  return coalesce((
    with ventes as (
      select v.id, v.serveur_id, v.total
      from public.ventes v
      left join public.sessions_caisse s on s.id = v.session_caisse_id
      where v.etablissement_id = p_etablissement_id and v.statut = 'validee' and v.serveur_id is not null
        and (coalesce(s.ouverte_le, v.cree_le) at time zone fuseau)::date between du and au
        and public.lecture_hub(v.etablissement_id, v.hub_id)
    )
    select jsonb_agg(jsonb_build_object(
        'id', sc.id, 'prenom', sc.prenom, 'actif', sc.actif,
        'nombre_ventes', (select count(*) from ventes w where w.serveur_id = sc.id),
        'total_ventes', (select coalesce(sum(w.total), 0) from ventes w where w.serveur_id = sc.id),
        'article_phare', (select l.libelle from public.lignes_vente l join ventes w on w.id = l.vente_id
                          where w.serveur_id = sc.id group by l.libelle order by sum(l.quantite) desc, l.libelle limit 1))
      order by (select coalesce(sum(w.total), 0) from ventes w where w.serveur_id = sc.id) desc, lower(sc.prenom))
    from public.serveurs_caisse sc
    where sc.etablissement_id = p_etablissement_id and sc.fusionne_dans is null
      and (sc.actif or exists (select 1 from ventes w where w.serveur_id = sc.id))
  ), '[]'::jsonb);
end
$$;
revoke execute on function public.statistiques_serveurs_caisse(uuid, date, date) from public, anon;
grant execute on function public.statistiques_serveurs_caisse(uuid, date, date) to authenticated;

-- Reprise de l'existant : noms du réglage caisse « serveurs » et « Servi par » déjà saisis.
insert into public.serveurs_caisse(etablissement_id, prenom)
select distinct on (x.etablissement_id, lower(x.nom)) x.etablissement_id, x.nom
from (
  select ep.etablissement_id, left(btrim(n), 40) nom
  from public.etablissement_parametres ep, regexp_split_to_table(coalesce(ep.data ->> 'serveurs', ''), '[,;\n]') n
  where ep.module_id = 'caisse'
  union all
  select v.etablissement_id, left(btrim(v.servi_par), 40) from public.ventes v where v.servi_par is not null
) x
where length(x.nom) > 0
order by x.etablissement_id, lower(x.nom), x.nom
on conflict do nothing;

update public.ventes v set serveur_id = sc.id
from public.serveurs_caisse sc
where v.servi_par is not null and v.serveur_id is null and sc.etablissement_id = v.etablissement_id and sc.actif
  and lower(btrim(sc.prenom)) = lower(left(btrim(v.servi_par), 40));

-- Le réglage texte « serveurs » reste lu (ses noms rejoignent la liste quand on les choisit) ; la liste se gère
-- maintenant à la caisse (« + Nouveau serveur ») et dans le tableau de bord.
update public.modules m
set parametres_schema = (
  select jsonb_agg(
    case when d ->> 'cle' = 'serveurs'
      then d || '{"libelle": "Serveurs proposés en plus de la liste (facultatif, séparés par des virgules) : la liste se gère à la caisse avec « + Nouveau serveur »"}'::jsonb
      else d end
    order by n)
  from jsonb_array_elements(m.parametres_schema) with ordinality as t(d, n)
)
where m.id = 'caisse' and m.parametres_schema @> '[{"cle": "serveurs"}]'::jsonb;

notify pgrst, 'reload schema';
