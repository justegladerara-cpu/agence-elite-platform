-- Mise à jour « Hubs » (2026-10-02), partie 3 : opérations par Hub.
-- Chaque écriture vérifie, côté base : la permission, l'accès au Hub (restriction membre_hubs),
-- l'état et les capacités du Hub, et que tout objet cité appartient au même établissement.
-- Les signatures existantes sont conservées (l'application publiée continue de fonctionner).

-- Hubs ---------------------------------------------------------------------------------
create function public.exiger_gestion_hubs(p_etablissement_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.est_editeur() then
    if not exists (select 1 from public.etablissements where id = p_etablissement_id and statut <> 'archive') then
      raise exception 'Établissement introuvable ou archivé';
    end if;
    return;
  end if;
  perform public.exiger_permission(p_etablissement_id, 'etablissement.gerer_hubs');
end
$$;

create function public.enregistrer_hub(p_etablissement_id uuid, p_hub jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  existant public.hubs%rowtype;
  identifiant uuid := nullif(p_hub ->> 'id', '')::uuid;
  v_type_hub text := coalesce(nullif(p_hub ->> 'type', ''), 'point_de_vente');
  v_vente boolean;
  v_stock boolean;
  v_caisse boolean;
  v_transfert boolean;
  v_actif boolean := coalesce((p_hub ->> 'actif')::boolean, true);
  resultat uuid;
begin
  perform public.exiger_gestion_hubs(p_etablissement_id);
  if v_type_hub not in ('point_de_vente', 'depot', 'mixte') then
    raise exception 'Type de Hub inconnu : %', v_type_hub;
  end if;
  v_vente := coalesce((p_hub ->> 'capacite_vente')::boolean, v_type_hub <> 'depot');
  v_stock := coalesce((p_hub ->> 'capacite_stock')::boolean, true);
  v_caisse := coalesce((p_hub ->> 'capacite_caisse')::boolean, v_vente);
  v_transfert := coalesce((p_hub ->> 'capacite_transfert')::boolean, true);
  if v_caisse and not v_vente then
    raise exception 'Une caisse suppose la capacité « vente »';
  end if;
  if coalesce(btrim(p_hub ->> 'nom'), '') = '' then
    raise exception 'Le nom du Hub est obligatoire';
  end if;
  if identifiant is null then
    insert into public.hubs (etablissement_id, nom, code, type, capacite_vente, capacite_stock, capacite_caisse,
      capacite_transfert, actif, adresse, telephone)
    values (p_etablissement_id, btrim(p_hub ->> 'nom'), nullif(upper(btrim(p_hub ->> 'code')), ''), v_type_hub, v_vente, v_stock, v_caisse,
      v_transfert, v_actif, nullif(btrim(p_hub ->> 'adresse'), ''), nullif(btrim(p_hub ->> 'telephone'), ''))
    returning id into resultat;
    if v_caisse and coalesce((p_hub ->> 'creer_caisse')::boolean, true) then
      insert into public.points_de_vente (etablissement_id, hub_id, nom)
      values (p_etablissement_id, resultat, 'Caisse ' || btrim(p_hub ->> 'nom'));
    end if;
    return resultat;
  end if;
  select * into existant from public.hubs where id = identifiant and etablissement_id = p_etablissement_id for update;
  if existant.id is null then
    raise exception 'Hub introuvable dans cet établissement';
  end if;
  if existant.principal and not v_actif then
    raise exception 'Le Hub principal ne peut pas être désactivé';
  end if;
  if (not v_actif or not v_caisse) and exists (
    select 1 from public.sessions_caisse where hub_id = existant.id and statut = 'ouverte'
  ) then
    raise exception 'Une caisse de ce Hub est ouverte : clôturez-la d''abord';
  end if;
  if not v_caisse and exists (select 1 from public.points_de_vente where hub_id = existant.id and actif) then
    raise exception 'Désactivez d''abord les caisses de ce Hub';
  end if;
  update public.hubs set
    nom = btrim(p_hub ->> 'nom'), code = nullif(upper(btrim(p_hub ->> 'code')), ''), type = v_type_hub,
    capacite_vente = v_vente, capacite_stock = v_stock, capacite_caisse = v_caisse, capacite_transfert = v_transfert,
    actif = v_actif, adresse = nullif(btrim(p_hub ->> 'adresse'), ''), telephone = nullif(btrim(p_hub ->> 'telephone'), '')
  where id = existant.id;
  return existant.id;
end
$$;

create function public.enregistrer_caisse(p_etablissement_id uuid, p_hub_id uuid, p_nom text, p_id uuid default null, p_actif boolean default true)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid;
begin
  perform public.exiger_gestion_hubs(p_etablissement_id);
  if not exists (select 1 from public.hubs where id = p_hub_id and etablissement_id = p_etablissement_id) then
    raise exception 'Hub introuvable dans cet établissement';
  end if;
  if coalesce(btrim(p_nom), '') = '' then
    raise exception 'Le nom de la caisse est obligatoire';
  end if;
  if p_id is null then
    insert into public.points_de_vente (etablissement_id, hub_id, nom, actif)
    values (p_etablissement_id, p_hub_id, btrim(p_nom), coalesce(p_actif, true))
    returning id into resultat;
    return resultat;
  end if;
  if not coalesce(p_actif, true) and exists (
    select 1 from public.sessions_caisse where point_de_vente_id = p_id and statut = 'ouverte'
  ) then
    raise exception 'Cette caisse est ouverte : clôturez-la d''abord';
  end if;
  update public.points_de_vente set nom = btrim(p_nom), actif = coalesce(p_actif, true)
  where id = p_id and etablissement_id = p_etablissement_id and hub_id = p_hub_id
  returning id into resultat;
  if resultat is null then
    raise exception 'Caisse introuvable dans ce Hub';
  end if;
  return resultat;
end
$$;

-- Hubs autorisés d'un membre (liste vide = tous les Hubs).
create function public.definir_hubs_membre(p_etablissement_id uuid, p_user_id uuid, p_hubs uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  role_membre text;
begin
  select role_id into role_membre from public.etablissement_membres
  where etablissement_id = p_etablissement_id and user_id = p_user_id;
  if role_membre is null then
    raise exception 'Membre introuvable dans cet établissement';
  end if;
  perform public.exiger_gestion_membres(p_etablissement_id, role_membre);
  if p_user_id = auth.uid() and not public.est_editeur() then
    raise exception 'Vous ne pouvez pas modifier vos propres Hubs';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_hubs, '{}')) h(id)
    where not exists (select 1 from public.hubs x where x.id = h.id and x.etablissement_id = p_etablissement_id)
  ) then
    raise exception 'Hub inconnu dans cet établissement';
  end if;
  delete from public.membre_hubs
  where etablissement_id = p_etablissement_id and user_id = p_user_id
    and not (hub_id = any (coalesce(p_hubs, '{}')));
  insert into public.membre_hubs (etablissement_id, user_id, hub_id, cree_par)
  select p_etablissement_id, p_user_id, h, auth.uid() from unnest(coalesce(p_hubs, '{}')) h
  on conflict (user_id, hub_id) do nothing;
end
$$;

-- Caisse -------------------------------------------------------------------------------
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

create or replace function public.enregistrer_vente(
  p_etablissement_id uuid, p_session_id uuid, p_lignes jsonb, p_paiements jsonb default '[]'::jsonb,
  p_contact_id uuid default null, p_remise numeric default 0, p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session public.sessions_caisse%rowtype;
  hub public.hubs%rowtype;
  ligne jsonb;
  paiement jsonb;
  article public.articles%rowtype;
  besoin record;
  stock_negatif boolean;
  disponible numeric;
  quantite numeric;
  remise_ligne numeric;
  sous_total numeric := 0;
  total numeric;
  remise numeric := round(coalesce(p_remise, 0), 2);
  verse numeric := 0;
  verse_hors_especes numeric := 0;
  especes numeric := 0;
  monnaie numeric := 0;
  paye numeric;
  montant numeric;
  mode text;
  vente_id uuid;
  numero text;
begin
  perform public.exiger_permission(p_etablissement_id, 'caisse.utiliser');
  select * into session from public.sessions_caisse
  where id = p_session_id and etablissement_id = p_etablissement_id
  for update;
  if session.id is null or session.statut <> 'ouverte' then
    raise exception 'Aucune caisse ouverte : ouvrez la caisse avant de vendre';
  end if;
  perform public.exiger_acces_hub(session.hub_id);
  select * into hub from public.hubs where id = session.hub_id;
  if not hub.actif or not hub.capacite_vente then
    raise exception 'Ce Hub ne vend pas : vente impossible';
  end if;
  if p_lignes is null or jsonb_typeof(p_lignes) is distinct from 'array' or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Le panier est vide';
  end if;
  if exists (select 1 from jsonb_array_elements(p_lignes) l where jsonb_typeof(l) <> 'object') then
    raise exception 'Ligne de vente invalide';
  end if;
  if p_contact_id is not null and not exists (
    select 1 from public.contacts where id = p_contact_id and etablissement_id = p_etablissement_id
  ) then
    raise exception 'Contact inconnu dans cet établissement';
  end if;
  if remise = 'NaN'::numeric then
    raise exception 'Remise globale invalide';
  end if;

  select coalesce((data ->> 'stock_negatif')::boolean, false) into stock_negatif
  from public.etablissement_parametres
  where etablissement_id = p_etablissement_id and module_id = 'caisse';
  stock_negatif := coalesce(stock_negatif, false);

  for ligne in select * from jsonb_array_elements(p_lignes) loop
    quantite := (ligne ->> 'quantite')::numeric;
    if quantite is null or quantite = 'NaN'::numeric or quantite <= 0 then
      raise exception 'Quantité invalide';
    end if;
  end loop;

  -- Stock contrôlé dans le Hub de la caisse (verrou sur les articles, ordre stable).
  for besoin in
    select (l ->> 'article_id')::uuid as article_id, sum((l ->> 'quantite')::numeric) as quantite
    from jsonb_array_elements(p_lignes) l
    group by 1
    order by 1
  loop
    select * into article from public.articles
    where id = besoin.article_id and etablissement_id = p_etablissement_id
    for update;
    if article.id is null then
      raise exception 'Article inconnu dans cet établissement';
    end if;
    if not article.actif then
      raise exception 'L''article « % » est archivé', article.nom;
    end if;
    if article.suivi_stock and not hub.capacite_stock then
      raise exception 'Le Hub « % » ne gère pas de stock : « % » ne peut pas y être vendu', hub.nom, article.nom;
    end if;
    if article.suivi_stock and not stock_negatif then
      disponible := public.stock_hub(hub.id, article.id);
      if disponible < besoin.quantite then
        raise exception 'Stock insuffisant pour « % » dans % (disponible : %)', article.nom, hub.nom, disponible;
      end if;
    end if;
  end loop;

  for ligne in select * from jsonb_array_elements(p_lignes) loop
    quantite := (ligne ->> 'quantite')::numeric;
    remise_ligne := round(coalesce(nullif(ligne ->> 'remise', '')::numeric, 0), 2);
    select * into article from public.articles
    where id = (ligne ->> 'article_id')::uuid and etablissement_id = p_etablissement_id;
    if remise_ligne = 'NaN'::numeric or remise_ligne < 0 or remise_ligne > round(article.prix_vente * quantite, 2) then
      raise exception 'Remise invalide pour « % »', article.nom;
    end if;
    sous_total := sous_total + round(article.prix_vente * quantite, 2) - remise_ligne;
  end loop;

  if remise < 0 or remise > sous_total then
    raise exception 'Remise globale invalide';
  end if;
  total := sous_total - remise;

  if p_paiements is not null and jsonb_typeof(p_paiements) <> 'array' then
    raise exception 'Paiements invalides';
  end if;
  for paiement in select * from jsonb_array_elements(coalesce(p_paiements, '[]'::jsonb)) loop
    if jsonb_typeof(paiement) <> 'object' then
      raise exception 'Paiements invalides';
    end if;
    montant := (paiement ->> 'montant')::numeric;
    mode := paiement ->> 'mode';
    if montant is null or montant = 'NaN'::numeric or montant <= 0 or montant <> round(montant, 2) then
      raise exception 'Montant de paiement invalide';
    end if;
    if mode is null or mode not in ('especes', 'mobile_money', 'carte', 'virement', 'cheque') then
      raise exception 'Mode de paiement inconnu : %', mode;
    end if;
    verse := verse + montant;
    if mode = 'especes' then
      especes := especes + montant;
    else
      verse_hors_especes := verse_hors_especes + montant;
    end if;
  end loop;
  if verse_hors_especes > total then
    raise exception 'Les paiements hors espèces dépassent le total de la vente';
  end if;
  monnaie := greatest(verse - total, 0);
  paye := verse - monnaie;
  if paye < total and p_contact_id is null then
    raise exception 'Vente à crédit : choisissez le contact qui doit le reste';
  end if;

  numero := public.prochain_numero(p_etablissement_id, 'vente', 'V-');
  insert into public.ventes(
    etablissement_id, hub_id, numero, session_caisse_id, point_de_vente_id, contact_id, sous_total, remise, total,
    montant_paye, statut_paiement, note, vendeur
  ) values (
    p_etablissement_id, hub.id, numero, session.id, session.point_de_vente_id, p_contact_id, sous_total, remise, total,
    paye,
    case when paye >= total then 'payee' when paye > 0 then 'partielle' else 'impayee' end,
    nullif(btrim(p_note), ''),
    auth.uid()
  )
  returning id into vente_id;

  for ligne in select * from jsonb_array_elements(p_lignes) loop
    quantite := (ligne ->> 'quantite')::numeric;
    remise_ligne := round(coalesce(nullif(ligne ->> 'remise', '')::numeric, 0), 2);
    select * into article from public.articles
    where id = (ligne ->> 'article_id')::uuid and etablissement_id = p_etablissement_id;
    insert into public.lignes_vente(vente_id, etablissement_id, article_id, libelle, quantite, prix_unitaire, remise, total, cout_unitaire)
    values (vente_id, p_etablissement_id, article.id, article.nom, quantite, article.prix_vente, remise_ligne,
            round(article.prix_vente * quantite, 2) - remise_ligne, article.cout_achat);
    if article.suivi_stock then
      insert into public.mouvements_stock(etablissement_id, hub_id, article_id, type, quantite, cout_unitaire, motif, vente_id, acteur)
      values (p_etablissement_id, hub.id, article.id, 'sortie_vente', -quantite, article.cout_achat, 'Vente ' || numero, vente_id, auth.uid());
    end if;
  end loop;

  for paiement in select * from jsonb_array_elements(coalesce(p_paiements, '[]'::jsonb)) loop
    montant := (paiement ->> 'montant')::numeric;
    if paiement ->> 'mode' = 'especes' then
      montant := montant - least(monnaie, montant);
      monnaie := monnaie - least(monnaie, (paiement ->> 'montant')::numeric);
    end if;
    if montant > 0 then
      insert into public.paiements(etablissement_id, hub_id, vente_id, session_caisse_id, mode, montant, reference, encaisse_par)
      values (p_etablissement_id, hub.id, vente_id, session.id, paiement ->> 'mode', montant,
              nullif(btrim(paiement ->> 'reference'), ''), auth.uid());
    end if;
  end loop;

  return jsonb_build_object(
    'vente_id', vente_id,
    'numero', numero,
    'hub_id', hub.id,
    'total', total,
    'paye', paye,
    'reste', total - paye,
    'monnaie', greatest(verse - total, 0)
  );
end
$$;

-- L'annulation remet le stock dans le Hub d'origine de chaque mouvement.
create or replace function public.annuler_vente(p_vente_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  vente public.ventes%rowtype;
  session_statut text;
begin
  select * into vente from public.ventes where id = p_vente_id for update;
  if vente.id is null then
    raise exception 'Vente introuvable';
  end if;
  perform public.exiger_permission(vente.etablissement_id, 'ventes.annuler');
  perform public.exiger_acces_hub(vente.hub_id);
  if vente.statut = 'annulee' then
    raise exception 'Cette vente est déjà annulée';
  end if;
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Le motif d''annulation est obligatoire';
  end if;
  select statut into session_statut from public.sessions_caisse where id = vente.session_caisse_id for update;
  if session_statut is distinct from 'ouverte' then
    raise exception 'La caisse de cette vente est clôturée : l''annulation n''est plus possible';
  end if;
  if exists (
    select 1 from public.paiements p join public.sessions_caisse s on s.id = p.session_caisse_id
    where p.vente_id = vente.id and p.statut = 'valide' and s.statut <> 'ouverte'
  ) then
    raise exception 'Un paiement de cette vente appartient à une caisse clôturée : l''annulation n''est plus possible';
  end if;

  insert into public.mouvements_stock(etablissement_id, hub_id, article_id, type, quantite, cout_unitaire, motif, vente_id, acteur)
  select vente.etablissement_id, m.hub_id, m.article_id, 'retour_annulation', -m.quantite, m.cout_unitaire,
         'Annulation ' || vente.numero, vente.id, auth.uid()
  from public.mouvements_stock m
  where m.vente_id = vente.id and m.type = 'sortie_vente';

  update public.paiements
  set statut = 'annule', annule_le = now(), annule_par = auth.uid(), motif_annulation = 'Annulation de la vente : ' || btrim(p_motif)
  where vente_id = vente.id and statut = 'valide';

  update public.ventes
  set statut = 'annulee', annulee_le = now(), annulee_par = auth.uid(), motif_annulation = btrim(p_motif),
      montant_paye = 0, statut_paiement = 'impayee'
  where id = vente.id;
end
$$;

create or replace function public.encaisser_paiement(p_vente_id uuid, p_montant numeric, p_mode text, p_session_id uuid default null, p_reference text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  vente public.ventes%rowtype;
  session public.sessions_caisse%rowtype;
  resultat uuid;
begin
  select * into vente from public.ventes where id = p_vente_id for update;
  if vente.id is null then
    raise exception 'Vente introuvable';
  end if;
  perform public.exiger_permission(vente.etablissement_id, 'paiements.encaisser');
  perform public.exiger_acces_hub(vente.hub_id);
  if vente.statut <> 'validee' then
    raise exception 'Vente annulée : aucun paiement possible';
  end if;
  if p_mode not in ('especes', 'mobile_money', 'carte', 'virement', 'cheque') then
    raise exception 'Mode de paiement inconnu : %', p_mode;
  end if;
  if p_montant is null or p_montant <= 0 or p_montant > vente.total - vente.montant_paye then
    raise exception 'Le montant doit être positif et ne pas dépasser le reste dû (%)', vente.total - vente.montant_paye;
  end if;
  if p_session_id is not null then
    select * into session from public.sessions_caisse
    where id = p_session_id and etablissement_id = vente.etablissement_id and statut = 'ouverte';
    if session.id is null then
      raise exception 'Caisse introuvable ou clôturée';
    end if;
    perform public.exiger_acces_hub(session.hub_id);
  end if;
  if p_mode = 'especes' and p_session_id is null then
    raise exception 'Un paiement en espèces doit être rattaché à une caisse ouverte';
  end if;
  insert into public.paiements(etablissement_id, hub_id, vente_id, session_caisse_id, mode, montant, reference, encaisse_par)
  values (vente.etablissement_id, coalesce(session.hub_id, vente.hub_id), vente.id, p_session_id, p_mode, p_montant,
          nullif(btrim(p_reference), ''), auth.uid())
  returning id into resultat;
  perform public.recalculer_paiement_vente(vente.id);
  return resultat;
end
$$;

create or replace function public.annuler_paiement(p_paiement_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  paiement public.paiements%rowtype;
begin
  select * into paiement from public.paiements where id = p_paiement_id for update;
  if paiement.id is null then
    raise exception 'Paiement introuvable';
  end if;
  perform public.exiger_permission(paiement.etablissement_id, 'paiements.encaisser');
  perform public.exiger_acces_hub(paiement.hub_id);
  if paiement.statut <> 'valide' then
    raise exception 'Ce paiement est déjà annulé';
  end if;
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Le motif d''annulation est obligatoire';
  end if;
  if paiement.session_caisse_id is not null and not exists (
    select 1 from public.sessions_caisse where id = paiement.session_caisse_id and statut = 'ouverte'
  ) then
    raise exception 'La caisse de ce paiement est clôturée : l''annulation n''est plus possible';
  end if;
  perform 1 from public.ventes where id = paiement.vente_id for update;
  update public.paiements
  set statut = 'annule', annule_le = now(), annule_par = auth.uid(), motif_annulation = btrim(p_motif)
  where id = paiement.id;
  perform public.recalculer_paiement_vente(paiement.vente_id);
end
$$;

create or replace function public.enregistrer_depense(p_etablissement_id uuid, p_depense jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid;
  fournisseur uuid := nullif(p_depense ->> 'fournisseur_id', '')::uuid;
  session public.sessions_caisse%rowtype;
  hub uuid := nullif(p_depense ->> 'hub_id', '')::uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'depenses.gerer');
  if fournisseur is not null and not exists (
    select 1 from public.contacts where id = fournisseur and etablissement_id = p_etablissement_id
  ) then
    raise exception 'Fournisseur inconnu dans cet établissement';
  end if;
  if nullif(p_depense ->> 'session_caisse_id', '') is not null then
    select * into session from public.sessions_caisse
    where id = (p_depense ->> 'session_caisse_id')::uuid and etablissement_id = p_etablissement_id and statut = 'ouverte';
    if session.id is null then
      raise exception 'Caisse introuvable ou clôturée';
    end if;
    hub := session.hub_id;
  end if;
  if hub is not null then
    if not exists (select 1 from public.hubs where id = hub and etablissement_id = p_etablissement_id) then
      raise exception 'Hub inconnu dans cet établissement';
    end if;
    perform public.exiger_acces_hub(hub);
  end if;
  insert into public.depenses(
    etablissement_id, hub_id, date_depense, categorie, libelle, montant, mode, fournisseur_id, session_caisse_id, justificatif, cree_par
  ) values (
    p_etablissement_id,
    hub,
    coalesce(nullif(p_depense ->> 'date_depense', '')::date, current_date),
    coalesce(nullif(btrim(p_depense ->> 'categorie'), ''), 'Divers'),
    btrim(p_depense ->> 'libelle'),
    (p_depense ->> 'montant')::numeric,
    coalesce(nullif(p_depense ->> 'mode', ''), 'especes'),
    fournisseur,
    session.id,
    nullif(p_depense ->> 'justificatif', ''),
    auth.uid()
  )
  returning id into resultat;
  return resultat;
end
$$;

-- Les lectures d'une session ou d'une vente respectent l'accès au Hub.
create or replace function public.apercu_cloture(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  session public.sessions_caisse%rowtype;
  encaissements jsonb;
  especes numeric;
  depenses_especes numeric;
begin
  select * into session from public.sessions_caisse where id = p_session_id;
  if session.id is null or not (
    public.lecture_autorisee(session.etablissement_id, 'cloture.lire')
    or public.a_permission(session.etablissement_id, 'caisse.utiliser')
  ) or not public.lecture_hub(session.etablissement_id, session.hub_id) then
    raise exception 'Session de caisse introuvable';
  end if;
  select coalesce(jsonb_object_agg(mode, total), '{}'::jsonb) into encaissements
  from (
    select p.mode, sum(p.montant) as total
    from public.paiements p
    where p.session_caisse_id = session.id and p.statut = 'valide'
    group by p.mode
  ) t;
  especes := coalesce((encaissements ->> 'especes')::numeric, 0);
  select coalesce(sum(montant), 0) into depenses_especes
  from public.depenses
  where session_caisse_id = session.id and statut = 'valide' and mode = 'especes';
  return jsonb_build_object(
    'session_id', session.id,
    'statut', session.statut,
    'point_de_vente', (select nom from public.points_de_vente where id = session.point_de_vente_id),
    'hub_id', session.hub_id,
    'hub', (select nom from public.hubs where id = session.hub_id),
    'ouverte_le', session.ouverte_le,
    'fond_initial', session.fond_initial,
    'nombre_ventes', (select count(*) from public.ventes where session_caisse_id = session.id and statut = 'validee'),
    'total_ventes', (select coalesce(sum(total), 0) from public.ventes where session_caisse_id = session.id and statut = 'validee'),
    'nombre_annulations', (select count(*) from public.ventes where session_caisse_id = session.id and statut = 'annulee'),
    'total_annulations', (select coalesce(sum(total), 0) from public.ventes where session_caisse_id = session.id and statut = 'annulee'),
    'total_remises', (select coalesce(sum(v.remise), 0) + coalesce((select sum(l.remise) from public.lignes_vente l join public.ventes w on w.id = l.vente_id where w.session_caisse_id = session.id and w.statut = 'validee'), 0)
                      from public.ventes v where v.session_caisse_id = session.id and v.statut = 'validee'),
    'encaissements', encaissements,
    'depenses_especes', depenses_especes,
    'credit_accorde', (select coalesce(sum(total - montant_paye), 0) from public.ventes where session_caisse_id = session.id and statut = 'validee'),
    'especes_attendues', session.fond_initial + especes - depenses_especes,
    'articles_vendus', coalesce((
      select jsonb_agg(jsonb_build_object('libelle', libelle, 'quantite', quantite, 'total', total) order by total desc)
      from (
        select l.libelle, sum(l.quantite) as quantite, sum(l.total) as total
        from public.lignes_vente l join public.ventes v on v.id = l.vente_id
        where v.session_caisse_id = session.id and v.statut = 'validee'
        group by l.libelle
      ) a
    ), '[]'::jsonb)
  );
end
$$;

create or replace function public.cloturer_caisse(p_session_id uuid, p_especes_comptees numeric, p_commentaire text default null)
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
begin
  select * into session from public.sessions_caisse where id = p_session_id for update;
  if session.id is null then
    raise exception 'Session de caisse introuvable';
  end if;
  perform public.exiger_permission(session.etablissement_id, 'cloture.cloturer');
  perform public.exiger_acces_hub(session.hub_id);
  if session.statut <> 'ouverte' then
    raise exception 'Cette caisse est déjà clôturée';
  end if;
  if p_especes_comptees is null or p_especes_comptees < 0 then
    raise exception 'Indiquez les espèces comptées dans le tiroir';
  end if;
  apercu := public.apercu_cloture(p_session_id);
  numero := public.prochain_numero(session.etablissement_id, 'cloture', 'Z-');
  insert into public.clotures(
    etablissement_id, hub_id, numero, session_caisse_id, point_de_vente_id, ouverte_le, cloturee_par, fond_initial,
    nombre_ventes, total_ventes, nombre_annulations, total_annulations, total_remises, encaissements,
    depenses_especes, credit_accorde, especes_attendues, especes_comptees, ecart, articles_vendus, commentaire
  ) values (
    session.etablissement_id, session.hub_id, numero, session.id, session.point_de_vente_id, session.ouverte_le, auth.uid(), session.fond_initial,
    (apercu ->> 'nombre_ventes')::int, (apercu ->> 'total_ventes')::numeric,
    (apercu ->> 'nombre_annulations')::int, (apercu ->> 'total_annulations')::numeric,
    (apercu ->> 'total_remises')::numeric, apercu -> 'encaissements',
    (apercu ->> 'depenses_especes')::numeric, (apercu ->> 'credit_accorde')::numeric,
    (apercu ->> 'especes_attendues')::numeric, p_especes_comptees,
    p_especes_comptees - (apercu ->> 'especes_attendues')::numeric,
    apercu -> 'articles_vendus', nullif(btrim(p_commentaire), '')
  )
  returning * into resultat;
  update public.sessions_caisse set statut = 'cloturee', cloturee_le = now() where id = session.id;
  return to_jsonb(resultat) || jsonb_build_object('point_de_vente', apercu ->> 'point_de_vente', 'hub', apercu ->> 'hub');
end
$$;

create or replace function public.recu_vente(p_vente_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  vente public.ventes%rowtype;
begin
  select * into vente from public.ventes where id = p_vente_id;
  if vente.id is null or not (
    public.lecture_autorisee(vente.etablissement_id, 'recus.lire')
    or public.lecture_autorisee(vente.etablissement_id, 'ventes.lire')
  ) or not public.lecture_hub(vente.etablissement_id, vente.hub_id) then
    raise exception 'Reçu introuvable';
  end if;
  return jsonb_build_object(
    'vente', to_jsonb(vente),
    'etablissement', (
      select jsonb_build_object('nom', e.nom, 'ville', e.ville, 'devise', e.devise, 'fuseau', e.fuseau)
      from public.etablissements e where e.id = vente.etablissement_id
    ),
    'identite', (select to_jsonb(i) - 'etablissement_id' - 'logo_url' from public.etablissement_identite i where i.etablissement_id = vente.etablissement_id),
    'logo', (select logo_url from public.etablissement_identite i where i.etablissement_id = vente.etablissement_id),
    'point_de_vente', (select nom from public.points_de_vente where id = vente.point_de_vente_id),
    'hub', (select jsonb_build_object('nom', h.nom, 'adresse', h.adresse, 'telephone', h.telephone, 'principal', h.principal)
            from public.hubs h where h.id = vente.hub_id),
    'vendeur', coalesce(
      (select nom_complet from public.profils where id = vente.vendeur),
      (select split_part(email, '@', 1) from auth.users where id = vente.vendeur)
    ),
    'contact', (select jsonb_build_object('nom', c.nom, 'telephone', c.telephone) from public.contacts c where c.id = vente.contact_id),
    'lignes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'libelle', l.libelle, 'quantite', l.quantite, 'prix_unitaire', l.prix_unitaire, 'remise', l.remise, 'total', l.total
      ) order by l.libelle)
      from public.lignes_vente l where l.vente_id = vente.id
    ), '[]'::jsonb),
    'paiements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'mode', p.mode, 'montant', p.montant, 'reference', p.reference, 'statut', p.statut, 'cree_le', p.cree_le
      ) order by p.cree_le)
      from public.paiements p where p.vente_id = vente.id
    ), '[]'::jsonb)
  );
end
$$;

-- Stock par Hub ----------------------------------------------------------------------
create function public.ajuster_stock_hub(p_hub_id uuid, p_article_id uuid, p_type text, p_quantite numeric,
  p_motif text default null, p_cout_unitaire numeric default null)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  hub public.hubs%rowtype;
  article public.articles%rowtype;
  actuel numeric;
  mouvement numeric;
begin
  select * into hub from public.hubs where id = p_hub_id;
  if hub.id is null then
    raise exception 'Hub introuvable';
  end if;
  perform public.exiger_permission(hub.etablissement_id, 'stock.ajuster');
  perform public.exiger_acces_hub(hub.id);
  if not hub.actif or not hub.capacite_stock then
    raise exception 'Ce Hub ne gère pas de stock';
  end if;
  select * into article from public.articles
  where id = p_article_id and etablissement_id = hub.etablissement_id
  for update;
  if article.id is null then
    raise exception 'Article introuvable dans cet établissement';
  end if;
  if not article.suivi_stock then
    raise exception 'Cet article n''est pas suivi en stock';
  end if;
  if p_cout_unitaire is not null and (p_cout_unitaire < 0 or p_cout_unitaire = 'NaN'::numeric) then
    raise exception 'Coût unitaire invalide';
  end if;
  actuel := public.stock_hub(hub.id, article.id);
  if p_quantite = 'NaN'::numeric then
    raise exception 'Quantité invalide';
  end if;
  if p_type = 'entree' then
    if p_quantite is null or p_quantite <= 0 then
      raise exception 'Une entrée de stock doit être positive';
    end if;
    mouvement := p_quantite;
  elsif p_type = 'ajustement' then
    if p_quantite is null or p_quantite = 0 then
      raise exception 'Un ajustement ne peut pas être nul';
    end if;
    if coalesce(btrim(p_motif), '') = '' then
      raise exception 'Le motif est obligatoire pour un ajustement';
    end if;
    mouvement := p_quantite;
  elsif p_type = 'inventaire' then
    if p_quantite is null or p_quantite < 0 then
      raise exception 'Le stock compté ne peut pas être négatif';
    end if;
    mouvement := p_quantite - actuel;
  else
    raise exception 'Type de mouvement inconnu : %', p_type;
  end if;
  if mouvement <> 0 then
    insert into public.mouvements_stock(etablissement_id, hub_id, article_id, type, quantite, cout_unitaire, motif, acteur)
    values (hub.etablissement_id, hub.id, article.id, p_type, mouvement, p_cout_unitaire, nullif(btrim(p_motif), ''), auth.uid());
  end if;
  return actuel + mouvement;
end
$$;

-- Ancienne signature : agit sur le Hub principal.
create or replace function public.ajuster_stock(p_etablissement_id uuid, p_article_id uuid, p_type text, p_quantite numeric,
  p_motif text default null, p_cout_unitaire numeric default null)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  principal uuid := public.hub_principal(p_etablissement_id);
begin
  perform public.exiger_permission(p_etablissement_id, 'stock.ajuster');
  if principal is null then
    raise exception 'Établissement sans Hub principal';
  end if;
  return public.ajuster_stock_hub(principal, p_article_id, p_type, p_quantite, p_motif, p_cout_unitaire);
end
$$;

-- Transfert atomique entre deux Hubs du même établissement.
create function public.transferer_stock(p_etablissement_id uuid, p_hub_source_id uuid, p_hub_destination_id uuid,
  p_lignes jsonb, p_motif text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  source public.hubs%rowtype;
  destination public.hubs%rowtype;
  besoin record;
  article public.articles%rowtype;
  disponible numeric;
  transfert uuid;
  numero text;
  nombre integer := 0;
begin
  perform public.exiger_permission(p_etablissement_id, 'stock.transferer');
  if p_hub_source_id is null or p_hub_destination_id is null then
    raise exception 'Choisissez le Hub de départ et le Hub d''arrivée';
  end if;
  if p_hub_source_id = p_hub_destination_id then
    raise exception 'Le Hub de départ et le Hub d''arrivée doivent être différents';
  end if;
  select * into source from public.hubs where id = p_hub_source_id and etablissement_id = p_etablissement_id;
  select * into destination from public.hubs where id = p_hub_destination_id and etablissement_id = p_etablissement_id;
  if source.id is null or destination.id is null then
    raise exception 'Les deux Hubs doivent appartenir à cet établissement';
  end if;
  perform public.exiger_acces_hub(source.id);
  if not (source.actif and source.capacite_stock and source.capacite_transfert) then
    raise exception 'Le Hub « % » ne peut pas envoyer de stock', source.nom;
  end if;
  if not (destination.actif and destination.capacite_stock and destination.capacite_transfert) then
    raise exception 'Le Hub « % » ne peut pas recevoir de stock', destination.nom;
  end if;
  if p_lignes is null or jsonb_typeof(p_lignes) is distinct from 'array' or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Ajoutez au moins un article à transférer';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lignes) l
    where jsonb_typeof(l) <> 'object' or (l ->> 'quantite') is null
      or (l ->> 'quantite')::numeric = 'NaN'::numeric or (l ->> 'quantite')::numeric <= 0
  ) then
    raise exception 'Quantité invalide';
  end if;

  numero := public.prochain_numero(p_etablissement_id, 'transfert', 'T-');
  insert into public.transferts (etablissement_id, numero, hub_source_id, hub_destination_id, motif, auteur)
  values (p_etablissement_id, numero, source.id, destination.id, nullif(btrim(p_motif), ''), auth.uid())
  returning id into transfert;

  for besoin in
    select (l ->> 'article_id')::uuid as article_id, sum((l ->> 'quantite')::numeric) as quantite
    from jsonb_array_elements(p_lignes) l
    group by 1
    order by 1
  loop
    select * into article from public.articles
    where id = besoin.article_id and etablissement_id = p_etablissement_id
    for update;
    if article.id is null then
      raise exception 'Article inconnu dans cet établissement';
    end if;
    if not article.suivi_stock then
      raise exception 'L''article « % » n''est pas suivi en stock', article.nom;
    end if;
    disponible := public.stock_hub(source.id, article.id);
    if disponible < besoin.quantite then
      raise exception 'Stock insuffisant pour « % » dans % (disponible : %)', article.nom, source.nom, disponible;
    end if;
    insert into public.lignes_transfert (transfert_id, etablissement_id, article_id, libelle, quantite)
    values (transfert, p_etablissement_id, article.id, article.nom, besoin.quantite);
    insert into public.mouvements_stock (etablissement_id, hub_id, article_id, type, quantite, cout_unitaire, motif, transfert_id, acteur)
    values
      (p_etablissement_id, source.id, article.id, 'transfert_sortie', -besoin.quantite, article.cout_achat, 'Transfert ' || numero || ' vers ' || destination.nom, transfert, auth.uid()),
      (p_etablissement_id, destination.id, article.id, 'transfert_entree', besoin.quantite, article.cout_achat, 'Transfert ' || numero || ' depuis ' || source.nom, transfert, auth.uid());
    nombre := nombre + 1;
  end loop;
  return jsonb_build_object('transfert_id', transfert, 'numero', numero, 'lignes', nombre);
end
$$;

-- Annulation d'un transfert : mouvements inverses, si le stock est encore à l'arrivée.
create function public.annuler_transfert(p_transfert_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.transferts%rowtype;
  ligne record;
  disponible numeric;
begin
  select * into t from public.transferts where id = p_transfert_id for update;
  if t.id is null then
    raise exception 'Transfert introuvable';
  end if;
  perform public.exiger_permission(t.etablissement_id, 'stock.transferer');
  if not (public.acces_hub(t.hub_source_id) and public.acces_hub(t.hub_destination_id)) then
    raise exception 'Accès refusé à ce Hub' using errcode = '42501';
  end if;
  if t.statut <> 'valide' then
    raise exception 'Ce transfert est déjà annulé';
  end if;
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Le motif d''annulation est obligatoire';
  end if;
  for ligne in
    select l.article_id, l.libelle, l.quantite, a.cout_achat
    from public.lignes_transfert l join public.articles a on a.id = l.article_id
    where l.transfert_id = t.id order by l.article_id
  loop
    perform 1 from public.articles where id = ligne.article_id for update;
    disponible := public.stock_hub(t.hub_destination_id, ligne.article_id);
    if disponible < ligne.quantite then
      raise exception 'Annulation impossible : « % » n''est plus disponible à l''arrivée (disponible : %)', ligne.libelle, disponible;
    end if;
    insert into public.mouvements_stock (etablissement_id, hub_id, article_id, type, quantite, cout_unitaire, motif, transfert_id, acteur)
    values
      (t.etablissement_id, t.hub_destination_id, ligne.article_id, 'transfert_annulation', -ligne.quantite, ligne.cout_achat, 'Annulation ' || t.numero, t.id, auth.uid()),
      (t.etablissement_id, t.hub_source_id, ligne.article_id, 'transfert_annulation', ligne.quantite, ligne.cout_achat, 'Annulation ' || t.numero, t.id, auth.uid());
  end loop;
  update public.transferts set statut = 'annule', annule_le = now(), annule_par = auth.uid(), motif_annulation = btrim(p_motif)
  where id = t.id;
end
$$;

-- Inventaire d'un Hub : chaque écart devient un mouvement « inventaire » tracé.
create function public.enregistrer_inventaire(p_hub_id uuid, p_lignes jsonb, p_motif text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  hub public.hubs%rowtype;
  ligne record;
  article public.articles%rowtype;
  theorique numeric;
  inventaire uuid;
  numero text;
  nombre integer := 0;
  ecarts integer := 0;
begin
  select * into hub from public.hubs where id = p_hub_id;
  if hub.id is null then
    raise exception 'Hub introuvable';
  end if;
  perform public.exiger_permission(hub.etablissement_id, 'stock.ajuster');
  perform public.exiger_acces_hub(hub.id);
  if not hub.actif or not hub.capacite_stock then
    raise exception 'Ce Hub ne gère pas de stock';
  end if;
  if p_lignes is null or jsonb_typeof(p_lignes) is distinct from 'array' or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Comptez au moins un article';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lignes) l
    where jsonb_typeof(l) <> 'object' or (l ->> 'quantite_comptee') is null
      or (l ->> 'quantite_comptee')::numeric = 'NaN'::numeric or (l ->> 'quantite_comptee')::numeric < 0
  ) then
    raise exception 'Quantité comptée invalide';
  end if;
  if (select count(*) from jsonb_array_elements(p_lignes)) <> (select count(distinct l ->> 'article_id') from jsonb_array_elements(p_lignes) l) then
    raise exception 'Un article apparaît deux fois dans l''inventaire';
  end if;
  numero := public.prochain_numero(hub.etablissement_id, 'inventaire', 'I-');
  insert into public.inventaires (etablissement_id, hub_id, numero, motif, auteur)
  values (hub.etablissement_id, hub.id, numero, nullif(btrim(p_motif), ''), auth.uid())
  returning id into inventaire;
  for ligne in
    select (l ->> 'article_id')::uuid as article_id, (l ->> 'quantite_comptee')::numeric as compte
    from jsonb_array_elements(p_lignes) l order by 1
  loop
    select * into article from public.articles where id = ligne.article_id and etablissement_id = hub.etablissement_id for update;
    if article.id is null then
      raise exception 'Article inconnu dans cet établissement';
    end if;
    if not article.suivi_stock then
      raise exception 'L''article « % » n''est pas suivi en stock', article.nom;
    end if;
    theorique := public.stock_hub(hub.id, article.id);
    insert into public.lignes_inventaire (inventaire_id, etablissement_id, article_id, libelle, quantite_theorique, quantite_comptee, ecart)
    values (inventaire, hub.etablissement_id, article.id, article.nom, theorique, ligne.compte, ligne.compte - theorique);
    if ligne.compte <> theorique then
      insert into public.mouvements_stock (etablissement_id, hub_id, article_id, type, quantite, cout_unitaire, motif, inventaire_id, acteur)
      values (hub.etablissement_id, hub.id, article.id, 'inventaire', ligne.compte - theorique, article.cout_achat,
              'Inventaire ' || numero, inventaire, auth.uid());
      ecarts := ecarts + 1;
    end if;
    nombre := nombre + 1;
  end loop;
  return jsonb_build_object('inventaire_id', inventaire, 'numero', numero, 'articles', nombre, 'ecarts', ecarts);
end
$$;

-- Tableaux de bord -----------------------------------------------------------------------
-- Exécutés avec les droits de l'appelant : la RLS limite aux Hubs autorisés.
-- p_hub_id nul = consolidé (tous les Hubs visibles de l'établissement).
create function public.tableau_de_bord_hub(p_etablissement_id uuid, p_hub_id uuid, p_du date, p_au date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with fuseau as (
    select coalesce((select e.fuseau from public.etablissements e where e.id = p_etablissement_id), 'UTC') as tz
  ),
  ventes as (
    select v.*, (v.cree_le at time zone (select tz from fuseau))::date as jour
    from public.ventes v
    where v.etablissement_id = p_etablissement_id and v.statut = 'validee'
      and (p_hub_id is null or v.hub_id = p_hub_id)
      and (v.cree_le at time zone (select tz from fuseau))::date between p_du and p_au
  ),
  lignes as (
    select l.* from public.lignes_vente l join ventes v on v.id = l.vente_id
  ),
  paiements as (
    select p.* from public.paiements p
    where p.etablissement_id = p_etablissement_id and p.statut = 'valide'
      and (p_hub_id is null or p.hub_id = p_hub_id)
      and (p.cree_le at time zone (select tz from fuseau))::date between p_du and p_au
  ),
  depenses as (
    select d.* from public.depenses d
    where d.etablissement_id = p_etablissement_id and d.statut = 'valide'
      and (p_hub_id is null or d.hub_id = p_hub_id)
      and d.date_depense between p_du and p_au
  ),
  stock as (
    select s.hub_id, s.article_id, s.quantite, a.nom, a.stock_minimum, a.cout_achat
    from public.stock_hubs s join public.articles a on a.id = s.article_id
    where s.etablissement_id = p_etablissement_id and a.actif and a.suivi_stock
      and (p_hub_id is null or s.hub_id = p_hub_id)
  ),
  hubs as (
    select h.* from public.hubs h
    where h.etablissement_id = p_etablissement_id and (p_hub_id is null or h.id = p_hub_id)
      and public.lecture_hub(h.etablissement_id, h.id)
  )
  select jsonb_build_object(
    'hub_id', p_hub_id,
    'chiffre_affaires', (select coalesce(sum(total), 0) from ventes),
    'nombre_ventes', (select count(*) from ventes),
    'panier_moyen', (select coalesce(round(avg(total), 2), 0) from ventes),
    'encaissements', (select coalesce(sum(montant), 0) from paiements),
    'encaissements_par_mode', (select coalesce(jsonb_object_agg(mode, total), '{}'::jsonb)
                               from (select mode, sum(montant) total from paiements group by mode) t),
    'depenses', (select coalesce(sum(montant), 0) from depenses),
    'depenses_par_categorie', (select coalesce(jsonb_object_agg(categorie, total), '{}'::jsonb)
                               from (select categorie, sum(montant) total from depenses group by categorie) t),
    'cout_marchandises', (select coalesce(sum(quantite * cout_unitaire), 0) from lignes where cout_unitaire is not null),
    'marge_brute', (select coalesce(sum(total - quantite * coalesce(cout_unitaire, 0)), 0) from lignes),
    'creances', (select coalesce(sum(v.total - v.montant_paye), 0) from public.ventes v
                 where v.etablissement_id = p_etablissement_id and v.statut = 'validee' and v.montant_paye < v.total
                   and (p_hub_id is null or v.hub_id = p_hub_id)),
    'ventes_par_jour', (select coalesce(jsonb_agg(jsonb_build_object('jour', jour, 'total', total, 'nombre', nombre) order by jour), '[]'::jsonb)
                        from (select jour, sum(total) total, count(*) nombre from ventes group by jour) t),
    'top_articles', (select coalesce(jsonb_agg(jsonb_build_object('libelle', libelle, 'quantite', quantite, 'total', total) order by total desc), '[]'::jsonb)
                     from (select libelle, sum(quantite) quantite, sum(total) total from lignes group by libelle order by sum(total) desc limit 5) t),
    'valeur_stock', (select coalesce(sum(greatest(quantite, 0) * coalesce(cout_achat, 0)), 0) from stock),
    'stock_bas', (select coalesce(jsonb_agg(jsonb_build_object('article_id', article_id, 'nom', nom, 'quantite', quantite, 'minimum', stock_minimum) order by quantite), '[]'::jsonb)
                  from (
                    select a.id as article_id, a.nom, a.stock_minimum,
                           coalesce((select sum(s.quantite) from stock s where s.article_id = a.id), 0) as quantite
                    from public.articles a
                    where a.etablissement_id = p_etablissement_id and a.actif and a.suivi_stock
                      and coalesce((select sum(s.quantite) from stock s where s.article_id = a.id), 0) <= a.stock_minimum
                    order by 4 limit 10
                  ) t),
    'transferts', (select count(*) from public.transferts t
                   where t.etablissement_id = p_etablissement_id and t.statut = 'valide'
                     and (p_hub_id is null or p_hub_id in (t.hub_source_id, t.hub_destination_id))
                     and (t.cree_le at time zone (select tz from fuseau))::date between p_du and p_au),
    'caisses_ouvertes', (select count(*) from public.sessions_caisse s
                         where s.etablissement_id = p_etablissement_id and s.statut = 'ouverte'
                           and (p_hub_id is null or s.hub_id = p_hub_id)),
    'par_hub', (select coalesce(jsonb_agg(jsonb_build_object(
                  'hub_id', h.id, 'nom', h.nom, 'type', h.type, 'principal', h.principal, 'actif', h.actif,
                  'chiffre_affaires', coalesce((select sum(v.total) from ventes v where v.hub_id = h.id), 0),
                  'nombre_ventes', (select count(*) from ventes v where v.hub_id = h.id),
                  'encaissements', coalesce((select sum(p.montant) from paiements p where p.hub_id = h.id), 0),
                  'valeur_stock', coalesce((select sum(greatest(s.quantite, 0) * coalesce(s.cout_achat, 0)) from stock s where s.hub_id = h.id), 0),
                  'articles_sous_minimum', (select count(*) from stock s where s.hub_id = h.id and s.quantite <= s.stock_minimum),
                  'caisses_ouvertes', (select count(*) from public.sessions_caisse s where s.hub_id = h.id and s.statut = 'ouverte')
                ) order by h.principal desc, h.nom), '[]'::jsonb)
                from hubs h)
  )
$$;

create or replace function public.tableau_de_bord_commerce(p_etablissement_id uuid, p_du date, p_au date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select public.tableau_de_bord_hub(p_etablissement_id, null, p_du, p_au)
$$;

-- Contexte de l'utilisateur connecté : compte, accès, Hubs autorisés et caisses.
create or replace function public.mon_contexte()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with compte as (
    select c.identifiant, coalesce(c.doit_changer_mot_de_passe, false) as doit_changer, c.temporaire_expire_le
    from (select auth.uid() as id) moi
    left join public.comptes_connexion c on c.user_id = moi.id
  ),
  acces as (
    select m.etablissement_id as id, m.role_id as role, 1 as priorite
    from public.etablissement_membres m
    where m.user_id = auth.uid() and m.actif
    union all
    select e.id, 'dirigeant', 2
    from public.etablissements e
    join public.client_membres cm on cm.client_id = e.client_id
    where cm.user_id = auth.uid() and cm.actif
    union all
    select s.etablissement_id, 'support', 3
    from public.sessions_support s
    where s.admin_id = auth.uid() and s.fermee_le is null and public.session_support_active(s.etablissement_id)
  ),
  choisi as (
    select distinct on (id) id, role from acces
    where public.compte_pret()
    order by id, priorite
  )
  select jsonb_build_object(
    'utilisateur', jsonb_build_object(
      'id', auth.uid(),
      'email', (select email from auth.users where id = auth.uid()),
      'nom', (select nom_complet from public.profils where id = auth.uid())
    ),
    'compte', (select jsonb_build_object(
      'identifiant', identifiant,
      'doit_changer_mot_de_passe', doit_changer,
      'temporaire_expire_le', temporaire_expire_le,
      'temporaire_expire', doit_changer and temporaire_expire_le is not null and temporaire_expire_le < now()
    ) from compte),
    'editeur', case when public.compte_pret() then (select role from public.plateforme_admins where user_id = auth.uid() and actif) end,
    'invitations', case when public.compte_pret() then public.mes_invitations() else '[]'::jsonb end,
    'etablissements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'nom', e.nom,
        'ville', e.ville,
        'devise', e.devise,
        'statut', e.statut,
        'solution_id', e.solution_id,
        'client', c.nom,
        'client_id', c.id,
        'client_statut', c.statut,
        'ecriture', a.role not in ('dirigeant', 'support') and public.etablissement_autorise_ecriture(e.id),
        'role', a.role,
        'mis_en_service_le', e.mis_en_service_le,
        'licence', public.resume_licence(e.id),
        'identite', (select to_jsonb(i) - 'etablissement_id' from public.etablissement_identite i where i.etablissement_id = e.id),
        'modules', coalesce((
          select jsonb_agg(em.module_id order by em.module_id)
          from public.etablissement_modules em
          where em.etablissement_id = e.id and em.actif
        ), '[]'::jsonb),
        'permissions', coalesce((
          select jsonb_agg(p.id order by p.id)
          from public.permissions p
          where case
            when a.role in ('dirigeant', 'support') then p.id like '%.lire' and public.module_actif(e.id, p.module_id)
            else public.a_permission(e.id, p.id)
          end
        ), '[]'::jsonb),
        'hubs_restreints', exists (select 1 from public.membre_hubs r where r.etablissement_id = e.id and r.user_id = auth.uid()),
        'hubs', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', h.id, 'nom', h.nom, 'code', h.code, 'type', h.type, 'principal', h.principal, 'actif', h.actif,
            'capacite_vente', h.capacite_vente, 'capacite_stock', h.capacite_stock,
            'capacite_caisse', h.capacite_caisse, 'capacite_transfert', h.capacite_transfert,
            'caisses', coalesce((
              select jsonb_agg(jsonb_build_object('id', p.id, 'nom', p.nom, 'actif', p.actif) order by p.nom)
              from public.points_de_vente p where p.hub_id = h.id
            ), '[]'::jsonb)
          ) order by h.principal desc, h.nom)
          from public.hubs h
          where h.etablissement_id = e.id
            and (a.role in ('dirigeant', 'support') or public.acces_hub(h.id))
        ), '[]'::jsonb),
        'hubs_total', (select count(*) from public.hubs h where h.etablissement_id = e.id and h.actif)
      ) order by e.nom)
      from choisi a
      join public.etablissements e on e.id = a.id
      join public.clients c on c.id = e.client_id
      where e.statut <> 'archive' or a.role = 'support'
    ), '[]'::jsonb)
  )
$$;

revoke execute on function public.exiger_gestion_hubs(uuid) from public, anon, authenticated;
