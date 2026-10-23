-- Le patron et les serveurs sur la caisse ouverte (demande de Juste, 2026-10-23).
-- 1. Le patron (droit « Clôturer une caisse ») n'ouvre pas de caisse : il vend sur la caisse ouverte de la caissière.
--    La vente garde son nom (vendeur) ; elle compte dans le ticket Z de la caisse. Jusqu'ici exiger_ma_caisse refusait
--    toute vente sur la caisse d'une autre personne, même pour le patron.
-- 2. Serveurs sur tablette : chaque serveur a son compte (rôle « Serveur (tablette) », droit caisse.commander, sans
--    caisse à lui). Il prend la commande et l'envoie : elle arrive dans « Factures en cours » de la caisse ouverte, avec
--    son prénom. La caissière encaisse comme d'habitude.
-- Additif : aucune vente ni caisse existante n'est modifiée.

-- ---------------------------------------------------------------------------
-- 1. Droits et rôle
-- ---------------------------------------------------------------------------
insert into public.permissions (id, module_id, description) values
  ('caisse.commander', 'caisse', 'Prendre des commandes sur sa tablette et les envoyer à la caisse')
on conflict (id) do nothing;

insert into public.roles (id, nom, description, ordre, modules_requis) values
  ('serveur_tablette', 'Serveur (tablette)', 'Prend les commandes sur sa tablette ; la caisse les reçoit. Ne tient pas la caisse.', 56, '{caisse}')
on conflict (id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r, 'caisse.commander' from unnest(array['serveur', 'serveur_tablette']) r
where exists (select 1 from public.roles where id = r)
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id) values
  ('serveur_tablette', 'etablissement.lire'), ('serveur_tablette', 'articles.lire')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Ventes et factures en cours sur la caisse d'une autre personne
-- ---------------------------------------------------------------------------
-- La personne de la caisse, ou le patron / un responsable (droit « Clôturer une caisse »), ou une commande de serveur
-- envoyée par envoyer_commande_caisse (marqueur posé seulement pendant cet envoi).
create or replace function public.exiger_ma_caisse()
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
  select * into session from public.sessions_caisse where id = new.session_caisse_id;
  if session.ouverte_par is not distinct from auth.uid() then
    return new;
  end if;
  if session.statut = 'ouverte' and public.a_permission(session.etablissement_id, 'cloture.cloturer') then
    return new;
  end if;
  if tg_table_name = 'ventes_en_attente' and session.statut = 'ouverte'
     and current_setting('elite.commande_serveur', true) = 'on' then
    return new;
  end if;
  raise exception 'Cette caisse est celle d''une autre personne : ouvrez votre propre caisse';
end
$$;
revoke execute on function public.exiger_ma_caisse() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Tablette du serveur
-- ---------------------------------------------------------------------------
-- Caisses ouvertes où envoyer une commande (nom de la caissière et du point de vente, aucun montant).
create function public.caisses_pour_commande(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exiger_permission(p_etablissement_id, 'caisse.commander');
  return coalesce((
    select jsonb_agg(jsonb_build_object('session_id', s.id, 'caissier', public.nom_membre_restaurant(s.ouverte_par),
        'point_de_vente', p.nom, 'ouverte_le', s.ouverte_le) order by s.ouverte_le)
    from public.sessions_caisse s
    left join public.points_de_vente p on p.id = s.point_de_vente_id
    where s.etablissement_id = p_etablissement_id and s.statut = 'ouverte' and not s.rattrapage and public.acces_hub(s.hub_id)
  ), '[]'::jsonb);
end
$$;
revoke execute on function public.caisses_pour_commande(uuid) from public, anon;
grant execute on function public.caisses_pour_commande(uuid) to authenticated;

-- p_lignes : [{article_id, quantite}] ; p_libelle : table ou nom du client. Sans p_session_id, la seule caisse ouverte.
create function public.envoyer_commande_caisse(
  p_etablissement_id uuid, p_lignes jsonb, p_libelle text default null, p_session_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session public.sessions_caisse%rowtype;
  nb integer;
  propres jsonb;
  estime numeric;
  nom text := left(public.nom_membre_restaurant(auth.uid()), 40);
  serveur public.serveurs_caisse%rowtype;
  nouvel uuid;
  v_libelle text;
begin
  perform public.exiger_permission(p_etablissement_id, 'caisse.commander');
  if p_session_id is null then
    select count(*) into nb from public.sessions_caisse s
    where s.etablissement_id = p_etablissement_id and s.statut = 'ouverte' and not s.rattrapage and public.acces_hub(s.hub_id);
    if nb = 0 then
      raise exception 'Aucune caisse n''est ouverte : demandez à la caissière d''ouvrir la caisse';
    elsif nb > 1 then
      raise exception 'Plusieurs caisses sont ouvertes : choisissez la caisse';
    end if;
    select s.* into session from public.sessions_caisse s
    where s.etablissement_id = p_etablissement_id and s.statut = 'ouverte' and not s.rattrapage and public.acces_hub(s.hub_id);
  else
    select * into session from public.sessions_caisse
    where id = p_session_id and etablissement_id = p_etablissement_id and not rattrapage;
    if session.id is null or session.statut <> 'ouverte' then
      raise exception 'Cette caisse est fermée : rechargez la page';
    end if;
    perform public.exiger_acces_hub(session.hub_id);
  end if;
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then
    raise exception 'La commande est vide';
  end if;
  if jsonb_array_length(p_lignes) > 60 then
    raise exception 'Commande trop longue (60 articles différents au plus)';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lignes) l
    left join public.articles a on a.id = nullif(l ->> 'article_id', '')::uuid and a.etablissement_id = p_etablissement_id and a.actif
    where a.id is null or (l ->> 'quantite')::numeric is null or (l ->> 'quantite')::numeric <= 0
      or (l ->> 'quantite')::numeric > 500 or (l ->> 'quantite')::numeric = 'NaN'::numeric
  ) then
    raise exception 'Un article de la commande n''existe plus : rechargez la page';
  end if;
  select jsonb_agg(jsonb_build_object('article_id', a.id, 'quantite', x.quantite)), sum(a.prix_vente * x.quantite)
  into propres, estime
  from (select (l ->> 'article_id')::uuid article_id, (l ->> 'quantite')::numeric quantite from jsonb_array_elements(p_lignes) l) x
  join public.articles a on a.id = x.article_id;
  if (select count(*) from public.ventes_en_attente where session_caisse_id = session.id and statut = 'en_attente') >= 20 then
    raise exception 'La caisse a déjà 20 commandes en attente : demandez à la caissière d''en encaisser';
  end if;
  serveur := public.serveur_par_prenom(p_etablissement_id, nom);
  v_libelle := left(coalesce(nullif(btrim(p_libelle), ''), 'Commande') || ' · ' || serveur.prenom, 60);
  perform set_config('elite.commande_serveur', 'on', true);
  insert into public.ventes_en_attente(etablissement_id, hub_id, session_caisse_id, libelle, lignes, total_estime, cree_par, serveur_id)
  values (session.etablissement_id, session.hub_id, session.id, v_libelle, propres, round(coalesce(estime, 0), 2), auth.uid(), serveur.id)
  returning id into nouvel;
  perform set_config('elite.commande_serveur', '', true);
  perform public.notifier_permission(p_etablissement_id, 'caisse.utiliser', 'caisse.commande_serveur',
    'Commande de ' || serveur.prenom, v_libelle || ' · ' || jsonb_array_length(propres) || ' article(s)', 'caisse');
  return jsonb_build_object('id', nouvel, 'libelle', v_libelle, 'total', round(coalesce(estime, 0), 2),
    'caissier', public.nom_membre_restaurant(session.ouverte_par));
end
$$;
revoke execute on function public.envoyer_commande_caisse(uuid, jsonb, text, uuid) from public, anon;
grant execute on function public.envoyer_commande_caisse(uuid, jsonb, text, uuid) to authenticated;

-- Les commandes envoyées par moi depuis 24 h : en attente à la caisse ou encaissées.
create function public.mes_commandes_envoyees(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exiger_permission(p_etablissement_id, 'caisse.commander');
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', w.id, 'libelle', w.libelle, 'total', w.total_estime, 'statut', w.statut,
        'cree_le', w.cree_le, 'termine_le', w.termine_le, 'caissier', public.nom_membre_restaurant(s.ouverte_par),
        'articles', (select jsonb_agg(jsonb_build_object('nom', a.nom, 'quantite', (l ->> 'quantite')::numeric))
                     from jsonb_array_elements(w.lignes) l join public.articles a on a.id = (l ->> 'article_id')::uuid))
      order by w.cree_le desc)
    from public.ventes_en_attente w
    join public.sessions_caisse s on s.id = w.session_caisse_id
    where w.etablissement_id = p_etablissement_id and w.cree_par = auth.uid() and w.cree_le > now() - interval '24 hours'
  ), '[]'::jsonb);
end
$$;
revoke execute on function public.mes_commandes_envoyees(uuid) from public, anon;
grant execute on function public.mes_commandes_envoyees(uuid) to authenticated;

notify pgrst, 'reload schema';
