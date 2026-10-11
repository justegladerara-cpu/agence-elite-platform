-- Une caisse par caissière (demande de Juste, 2026-10-11).
-- Chaque personne ouvre SA caisse avec son compte, vend sur SA caisse et clôture SON ticket Z. Deux caissières peuvent
-- travailler en même temps sur le même point de vente : leurs ventes, encaissements et tickets Z restent séparés.
-- Personne ne vend, n'encaisse ni ne sort d'espèces sur la caisse d'une autre personne.
-- Migration additive : aucune donnée existante n'est modifiée ; les caisses déjà ouvertes restent à la personne qui
-- les a ouvertes.

-- ---------------------------------------------------------------------------
-- 1. Une caisse ouverte par personne et par point de vente (au lieu d'une seule par point de vente)
-- ---------------------------------------------------------------------------
drop index public.sessions_caisse_une_ouverte;
create unique index sessions_caisse_une_ouverte on public.sessions_caisse(point_de_vente_id, ouverte_par)
  where statut = 'ouverte' and not rattrapage;
create index if not exists sessions_caisse_ouverte_par_idx on public.sessions_caisse(ouverte_par);

-- ---------------------------------------------------------------------------
-- 2. Ouvrir la caisse : on retrouve SA caisse ouverte, jamais celle d'une autre personne
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
  select id into existante from public.sessions_caisse
  where point_de_vente_id = pdv.id and statut = 'ouverte' and not rattrapage and ouverte_par = auth.uid();
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
-- 3. Rien ne s'enregistre sur la caisse d'une autre personne
-- ---------------------------------------------------------------------------
-- Ventes, encaissements, ventes en attente : la caisse doit être la sienne.
-- Sans utilisateur connecté (tâches internes, boutique en ligne), rien ne change.
create function public.exiger_ma_caisse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  proprietaire uuid;
begin
  if new.session_caisse_id is null or auth.uid() is null then
    return new;
  end if;
  select ouverte_par into proprietaire from public.sessions_caisse where id = new.session_caisse_id;
  if proprietaire is distinct from auth.uid() then
    raise exception 'Cette caisse est celle d''une autre personne : ouvrez votre propre caisse';
  end if;
  return new;
end
$$;
revoke execute on function public.exiger_ma_caisse() from public, anon, authenticated;

create trigger ventes_ma_caisse before insert on public.ventes
for each row execute function public.exiger_ma_caisse();
create trigger paiements_ma_caisse before insert on public.paiements
for each row execute function public.exiger_ma_caisse();
create trigger ventes_en_attente_ma_caisse before insert on public.ventes_en_attente
for each row execute function public.exiger_ma_caisse();

-- Reprendre ou abandonner une vente en attente, annuler une vente pendant que la caisse est ouverte, sortir des espèces
-- du tiroir (dépense, remboursement d'un retour) : la personne de la caisse, ou un responsable (droit « Clôturer une caisse »). La dépense
-- garde son auteur : le ticket Z montre qui a sorti l'argent.
create function public.exiger_ma_caisse_ou_responsable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  session public.sessions_caisse%rowtype;
begin
  if new.session_caisse_id is null or auth.uid() is null then
    return new;
  end if;
  -- En modification, seul le changement de statut compte (annulation d'une vente, reprise ou abandon d'une attente).
  -- Les IF sont imbriqués : « statut » n'existe pas sur toutes les tables.
  if tg_op = 'UPDATE' then
    if new.statut is not distinct from old.statut then
      return new;
    end if;
    if tg_table_name = 'ventes' and new.statut <> 'annulee' then
      return new;
    end if;
  end if;
  select * into session from public.sessions_caisse where id = new.session_caisse_id;
  if session.statut = 'ouverte' and session.ouverte_par is distinct from auth.uid()
     and not public.a_permission(session.etablissement_id, 'cloture.cloturer') then
    raise exception 'Cette caisse est celle d''une autre personne : seul un responsable peut intervenir dessus';
  end if;
  return new;
end
$$;
revoke execute on function public.exiger_ma_caisse_ou_responsable() from public, anon, authenticated;

create trigger ventes_annulation_ma_caisse before update on public.ventes
for each row execute function public.exiger_ma_caisse_ou_responsable();
create trigger ventes_en_attente_reprise_ma_caisse before update on public.ventes_en_attente
for each row execute function public.exiger_ma_caisse_ou_responsable();
create trigger depenses_ma_caisse before insert on public.depenses
for each row execute function public.exiger_ma_caisse_ou_responsable();
create trigger remboursements_ma_caisse before insert on public.remboursements_vente
for each row execute function public.exiger_ma_caisse_ou_responsable();

-- ---------------------------------------------------------------------------
-- 4. Le ticket Z dit qui a tenu la caisse
-- ---------------------------------------------------------------------------
-- Le calcul existant est gardé tel quel (renommé) ; on y ajoute la personne de la caisse.
alter function public.donnees_cloture(uuid) rename to donnees_cloture_calcul;
revoke execute on function public.donnees_cloture_calcul(uuid) from public, anon, authenticated;

create function public.donnees_cloture(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.donnees_cloture_calcul(p_session_id) || jsonb_build_object(
    'caissier_id', s.ouverte_par, 'caissier', public.nom_membre_restaurant(s.ouverte_par))
  from public.sessions_caisse s where s.id = p_session_id
$$;
revoke execute on function public.donnees_cloture(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Chaque personne clôture SA caisse (ticket Z). Un responsable peut clôturer une caisse oubliée.
-- ---------------------------------------------------------------------------
create or replace function public.cloturer_caisse(p_session_id uuid, p_especes_comptees numeric, p_commentaire text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare session public.sessions_caisse%rowtype; apercu jsonb; numero text; resultat public.clotures%rowtype;
begin
  select * into session from public.sessions_caisse where id = p_session_id for update;
  if session.id is null then raise exception 'Session de caisse introuvable'; end if;
  if session.ouverte_par = auth.uid() then
    perform public.exiger_permission(session.etablissement_id, 'caisse.utiliser');
  else
    perform public.exiger_permission(session.etablissement_id, 'cloture.cloturer');
  end if;
  perform public.exiger_acces_hub(session.hub_id);
  if session.statut <> 'ouverte' then raise exception 'Cette caisse est déjà clôturée'; end if;
  if p_especes_comptees is null or p_especes_comptees < 0 then raise exception 'Indiquez les espèces comptées dans le tiroir'; end if;
  if length(coalesce(p_commentaire, '')) > 500 then raise exception 'Commentaire trop long (500 caractères au plus)'; end if;
  apercu := public.donnees_cloture(p_session_id);
  numero := public.prochain_numero(session.etablissement_id, 'cloture', 'Z-');
  insert into public.clotures(etablissement_id, hub_id, numero, session_caisse_id, point_de_vente_id, ouverte_le, cloturee_par, fond_initial,
    nombre_ventes, total_ventes, nombre_annulations, total_annulations, nombre_retours, total_retours, total_remises, encaissements, remboursements,
    depenses_especes, credit_accorde, especes_attendues, especes_comptees, ecart, articles_vendus, commentaire)
  values (session.etablissement_id, session.hub_id, numero, session.id, session.point_de_vente_id, session.ouverte_le, auth.uid(), session.fond_initial,
    (apercu->>'nombre_ventes')::int, (apercu->>'total_ventes')::numeric, (apercu->>'nombre_annulations')::int, (apercu->>'total_annulations')::numeric,
    (apercu->>'nombre_retours')::int, (apercu->>'total_retours')::numeric, (apercu->>'total_remises')::numeric, apercu->'encaissements', apercu->'remboursements',
    (apercu->>'depenses_especes')::numeric, (apercu->>'credit_accorde')::numeric, (apercu->>'especes_attendues')::numeric, p_especes_comptees,
    p_especes_comptees-(apercu->>'especes_attendues')::numeric, apercu->'articles_vendus', nullif(btrim(p_commentaire), '')) returning * into resultat;
  update public.sessions_caisse set statut='cloturee', cloturee_le=now() where id=session.id;
  return to_jsonb(resultat) || jsonb_build_object('point_de_vente', apercu->>'point_de_vente', 'hub', apercu->>'hub',
    'caissier_id', apercu->'caissier_id', 'caissier', apercu->>'caissier');
end
$$;

-- Ticket Z fermé automatiquement : la personne de la caisse compte ses espèces, ou un responsable.
create or replace function public.compter_cloture(p_cloture_id uuid, p_especes_comptees numeric, p_commentaire text default null)
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
  if exists (select 1 from public.sessions_caisse where id = z.session_caisse_id and ouverte_par = auth.uid()) then
    perform public.exiger_permission(z.etablissement_id, 'caisse.utiliser');
  else
    perform public.exiger_permission(z.etablissement_id, 'cloture.cloturer');
  end if;
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

-- ---------------------------------------------------------------------------
-- 6. Qui voit les caisses et tickets Z de tout le monde
-- ---------------------------------------------------------------------------
-- Un responsable (droit « Clôturer une caisse ») ou un rôle de lecture qui ne tient pas de caisse (comptable,
-- lecteur). Une personne qui tient une caisse (employé) ne voit que les siens.
create function public.voit_toutes_caisses(p_etablissement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.a_permission(p_etablissement_id, 'cloture.cloturer')
    or (public.lecture_autorisee(p_etablissement_id, 'cloture.lire') and not public.a_permission(p_etablissement_id, 'caisse.utiliser'))
$$;
revoke execute on function public.voit_toutes_caisses(uuid) from public, anon;
grant execute on function public.voit_toutes_caisses(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Liste des tickets Z avec la personne de chaque caisse
-- ---------------------------------------------------------------------------
create function public.tickets_z(p_etablissement_id uuid, p_limite integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tous boolean := public.voit_toutes_caisses(p_etablissement_id);
begin
  if not tous and not (public.a_permission(p_etablissement_id, 'caisse.utiliser') or public.lecture_autorisee(p_etablissement_id, 'cloture.lire')) then
    raise exception 'Accès refusé';
  end if;
  return coalesce((
    select jsonb_agg(x.ligne order by x.cloturee_le desc)
    from (
      select to_jsonb(z) || jsonb_build_object(
          'caissier_id', s.ouverte_par, 'caissier', public.nom_membre_restaurant(s.ouverte_par),
          'point_de_vente', (select p.nom from public.points_de_vente p where p.id = z.point_de_vente_id)) ligne,
        z.cloturee_le
      from public.clotures z
      join public.sessions_caisse s on s.id = z.session_caisse_id
      where z.etablissement_id = p_etablissement_id
        and public.lecture_hub(z.etablissement_id, z.hub_id)
        and (tous or s.ouverte_par = auth.uid())
      order by z.cloturee_le desc
      limit greatest(1, least(coalesce(p_limite, 200), 1000))
    ) x
  ), '[]'::jsonb);
end
$$;
revoke execute on function public.tickets_z(uuid, integer) from public, anon;
grant execute on function public.tickets_z(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Caisses ouvertes avec le nom de la personne : la sienne, et toutes pour un responsable
-- ---------------------------------------------------------------------------
create function public.caisses_ouvertes(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tous boolean := public.voit_toutes_caisses(p_etablissement_id);
begin
  if not tous and not public.a_permission(p_etablissement_id, 'caisse.utiliser') then
    raise exception 'Accès refusé';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(s) || jsonb_build_object(
        'caissier', public.nom_membre_restaurant(s.ouverte_par),
        'point_de_vente', (select p.nom from public.points_de_vente p where p.id = s.point_de_vente_id),
        'mienne', s.ouverte_par = auth.uid())
      order by (s.ouverte_par = auth.uid()) desc, s.ouverte_le)
    from public.sessions_caisse s
    where s.etablissement_id = p_etablissement_id and s.statut = 'ouverte' and not s.rattrapage
      and public.lecture_hub(s.etablissement_id, s.hub_id)
      and (tous or s.ouverte_par = auth.uid())
  ), '[]'::jsonb);
end
$$;
revoke execute on function public.caisses_ouvertes(uuid) from public, anon;
grant execute on function public.caisses_ouvertes(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Tableau de bord : qui tient une caisse en ce moment, combien chaque personne a vendu, classement
-- ---------------------------------------------------------------------------
-- Une vente compte pour la personne de sa caisse (sinon pour son vendeur : facture, boutique en ligne...).
-- Réservé à qui voit toutes les caisses (gérant, responsable, comptable).
create function public.activite_caissiers(p_etablissement_id uuid, p_du date default null, p_au date default null)
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
        and (v.cree_le at time zone fuseau)::date between du and au
        and public.lecture_hub(v.etablissement_id, v.hub_id)
    ), totaux as (
      select personne, count(*) nombre, sum(total) total from ventes where personne is not null group by personne
    ), ouvertes as (
      select s.ouverte_par personne, min(s.ouverte_le) depuis,
        string_agg(distinct p.nom, ', ') caisses,
        sum((select coalesce(sum(v.total), 0) from public.ventes v where v.session_caisse_id = s.id and v.statut = 'validee')) en_cours
      from public.sessions_caisse s join public.points_de_vente p on p.id = s.point_de_vente_id
      where s.etablissement_id = p_etablissement_id and s.statut = 'ouverte' and not s.rattrapage
        and public.lecture_hub(s.etablissement_id, s.hub_id)
      group by s.ouverte_par
    )
    select jsonb_agg(jsonb_build_object(
        'id', x.personne, 'nom', public.nom_membre_restaurant(x.personne),
        'nombre_ventes', coalesce(t.nombre, 0), 'total_ventes', coalesce(t.total, 0),
        'en_caisse', o.personne is not null, 'depuis', o.depuis, 'caisses', o.caisses, 'caisse_en_cours', o.en_cours)
      order by coalesce(t.total, 0) desc, public.nom_membre_restaurant(x.personne))
    from (select personne from totaux union select personne from ouvertes) x
    left join totaux t on t.personne = x.personne
    left join ouvertes o on o.personne = x.personne
  ), '[]'::jsonb);
end
$$;
revoke execute on function public.activite_caissiers(uuid, date, date) from public, anon;
grant execute on function public.activite_caissiers(uuid, date, date) to authenticated;

notify pgrst, 'reload schema';
