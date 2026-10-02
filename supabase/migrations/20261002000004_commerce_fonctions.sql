-- Lot 2 : fonctions de la Solution Commerce.
-- Toutes les écritures passent ici. Chaque fonction `security definer` :
--   1. vérifie la permission (qui inclut l'adhésion active et le module actif) ;
--   2. vérifie que l'établissement et son client sont actifs ;
--   3. vérifie que chaque objet référencé appartient au même établissement ;
--   4. s'exécute dans une seule transaction (tout ou rien).

create function public.exiger_permission(p_etablissement_id uuid, p_permission text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Une authentification est requise';
  end if;
  if not public.a_permission(p_etablissement_id, p_permission) then
    raise exception 'Permission refusée : %', p_permission using errcode = '42501';
  end if;
  if not public.etablissement_autorise_ecriture(p_etablissement_id) then
    raise exception 'Établissement suspendu ou archivé : aucune écriture possible' using errcode = '42501';
  end if;
end
$$;

-- Numérotation atomique par établissement (V-00001, Z-00001…).
create function public.prochain_numero(p_etablissement_id uuid, p_type text, p_prefixe text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  numero bigint;
  prefixe text;
begin
  insert into public.numerotations as n (etablissement_id, type, prefixe, prochain_numero)
  values (p_etablissement_id, p_type, p_prefixe, 2)
  on conflict (etablissement_id, type)
  do update set prochain_numero = n.prochain_numero + 1
  returning n.prochain_numero - 1, n.prefixe into numero, prefixe;
  return coalesce(prefixe, p_prefixe) || lpad(numero::text, 5, '0');
end
$$;

create function public.stock_article(p_article_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(quantite), 0) from public.mouvements_stock where article_id = p_article_id
$$;

-- Activation des modules par défaut dans l'ordre des dépendances.
create or replace function public.creer_etablissement(p_client_id uuid, p_solution_id text, p_nom text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid;
begin
  perform public.exiger_super_admin();
  insert into public.etablissements(client_id, solution_id, nom)
  values (p_client_id, p_solution_id, p_nom)
  returning id into resultat;
  insert into public.etablissement_modules(etablissement_id, module_id, actif, active_le, active_par, source)
  with recursive profondeur(module_id, niveau) as (
    select sm.module_id, 0
    from public.solution_modules sm
    where sm.solution_id = p_solution_id and sm.par_defaut
    union all
    select d.depend_de, p.niveau + 1
    from profondeur p
    join public.module_dependances d on d.module_id = p.module_id
    where p.niveau < 20
  )
  select resultat, sm.module_id, true, now(), auth.uid(), 'inclus'
  from public.solution_modules sm
  join (select module_id, max(niveau) as niveau from profondeur group by module_id) p on p.module_id = sm.module_id
  where sm.solution_id = p_solution_id and sm.par_defaut
  order by p.niveau desc;
  insert into public.points_de_vente(etablissement_id, nom) values (resultat, 'Caisse principale');
  insert into public.etablissement_identite(etablissement_id, nom_commercial) values (resultat, p_nom);
  return resultat;
end
$$;

-- Contexte de l'utilisateur connecté : ses établissements, rôle, permissions, modules.
create function public.mon_contexte()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'utilisateur', jsonb_build_object(
      'id', auth.uid(),
      'email', (select email from auth.users where id = auth.uid()),
      'nom', (select nom_complet from public.profils where id = auth.uid())
    ),
    'editeur', (select role from public.plateforme_admins where user_id = auth.uid() and actif),
    'etablissements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'nom', e.nom,
        'ville', e.ville,
        'devise', e.devise,
        'statut', e.statut,
        'solution_id', e.solution_id,
        'client', c.nom,
        'ecriture', public.etablissement_autorise_ecriture(e.id),
        'role', m.role_id,
        'identite', (select to_jsonb(i) - 'etablissement_id' from public.etablissement_identite i where i.etablissement_id = e.id),
        'modules', coalesce((
          select jsonb_agg(em.module_id order by em.module_id)
          from public.etablissement_modules em
          where em.etablissement_id = e.id and em.actif
        ), '[]'::jsonb),
        'permissions', coalesce((
          select jsonb_agg(p.id order by p.id)
          from public.permissions p
          where public.a_permission(e.id, p.id)
        ), '[]'::jsonb)
      ) order by e.nom)
      from public.etablissement_membres m
      join public.etablissements e on e.id = m.etablissement_id
      join public.clients c on c.id = e.client_id
      where m.user_id = auth.uid() and m.actif and e.statut <> 'archive'
    ), '[]'::jsonb)
  )
$$;

-- Identité et points de vente ------------------------------------------------
create function public.enregistrer_identite(p_etablissement_id uuid, p_identite jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exiger_permission(p_etablissement_id, 'etablissement.modifier');
  insert into public.etablissement_identite as i (
    etablissement_id, nom_commercial, logo_url, couleur_principale, adresse, telephone, email, rccm, niu, mentions_recu
  ) values (
    p_etablissement_id,
    nullif(btrim(p_identite ->> 'nom_commercial'), ''),
    nullif(p_identite ->> 'logo_url', ''),
    nullif(p_identite ->> 'couleur_principale', ''),
    nullif(btrim(p_identite ->> 'adresse'), ''),
    nullif(btrim(p_identite ->> 'telephone'), ''),
    nullif(btrim(p_identite ->> 'email'), ''),
    nullif(btrim(p_identite ->> 'rccm'), ''),
    nullif(btrim(p_identite ->> 'niu'), ''),
    nullif(btrim(p_identite ->> 'mentions_recu'), '')
  )
  on conflict (etablissement_id) do update set
    nom_commercial = excluded.nom_commercial,
    logo_url = excluded.logo_url,
    couleur_principale = excluded.couleur_principale,
    adresse = excluded.adresse,
    telephone = excluded.telephone,
    email = excluded.email,
    rccm = excluded.rccm,
    niu = excluded.niu,
    mentions_recu = excluded.mentions_recu;
end
$$;

create function public.enregistrer_point_de_vente(p_etablissement_id uuid, p_nom text, p_id uuid default null, p_actif boolean default true)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'etablissement.modifier');
  if p_id is null then
    insert into public.points_de_vente(etablissement_id, nom) values (p_etablissement_id, btrim(p_nom))
    returning id into resultat;
  else
    update public.points_de_vente set nom = btrim(p_nom), actif = p_actif
    where id = p_id and etablissement_id = p_etablissement_id
    returning id into resultat;
    if resultat is null then
      raise exception 'Point de vente introuvable';
    end if;
  end if;
  return resultat;
end
$$;

create function public.enregistrer_parametres_module(p_etablissement_id uuid, p_module_id text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exiger_permission(p_etablissement_id, 'etablissement.modifier');
  if not public.module_actif(p_etablissement_id, p_module_id) then
    raise exception 'Module inactif : %', p_module_id;
  end if;
  insert into public.etablissement_parametres(etablissement_id, module_id, data)
  values (p_etablissement_id, p_module_id, p_data)
  on conflict (etablissement_id, module_id) do update set data = excluded.data;
end
$$;

-- Articles -------------------------------------------------------------------
create function public.enregistrer_categorie(p_etablissement_id uuid, p_nom text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'articles.gerer');
  insert into public.categories_articles(etablissement_id, nom) values (p_etablissement_id, btrim(p_nom))
  on conflict (etablissement_id, nom) do update set actif = true
  returning id into resultat;
  return resultat;
end
$$;

create function public.enregistrer_article(p_etablissement_id uuid, p_article jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p_article ->> 'id', '')::uuid;
  categorie uuid := nullif(p_article ->> 'categorie_id', '')::uuid;
  stock_initial numeric := coalesce(nullif(p_article ->> 'stock_initial', '')::numeric, 0);
begin
  perform public.exiger_permission(p_etablissement_id, 'articles.gerer');
  if categorie is not null and not exists (
    select 1 from public.categories_articles where id = categorie and etablissement_id = p_etablissement_id
  ) then
    raise exception 'Catégorie inconnue dans cet établissement';
  end if;
  if resultat is null then
    insert into public.articles(
      etablissement_id, reference, code_barres, nom, description, categorie_id, prix_vente, cout_achat,
      unite, suivi_stock, stock_minimum, photo
    ) values (
      p_etablissement_id,
      nullif(btrim(p_article ->> 'reference'), ''),
      nullif(btrim(p_article ->> 'code_barres'), ''),
      btrim(p_article ->> 'nom'),
      nullif(btrim(p_article ->> 'description'), ''),
      categorie,
      (p_article ->> 'prix_vente')::numeric,
      nullif(p_article ->> 'cout_achat', '')::numeric,
      coalesce(nullif(btrim(p_article ->> 'unite'), ''), 'unité'),
      coalesce((p_article ->> 'suivi_stock')::boolean, true),
      coalesce(nullif(p_article ->> 'stock_minimum', '')::numeric, 0),
      nullif(p_article ->> 'photo', '')
    )
    returning id into resultat;
    if stock_initial < 0 then
      raise exception 'Le stock initial ne peut pas être négatif';
    end if;
    if stock_initial > 0 then
      perform public.exiger_permission(p_etablissement_id, 'stock.ajuster');
      insert into public.mouvements_stock(etablissement_id, article_id, type, quantite, cout_unitaire, motif, acteur)
      values (p_etablissement_id, resultat, 'entree', stock_initial, nullif(p_article ->> 'cout_achat', '')::numeric, 'Stock initial', auth.uid());
    end if;
  else
    update public.articles set
      reference = nullif(btrim(p_article ->> 'reference'), ''),
      code_barres = nullif(btrim(p_article ->> 'code_barres'), ''),
      nom = btrim(p_article ->> 'nom'),
      description = nullif(btrim(p_article ->> 'description'), ''),
      categorie_id = categorie,
      prix_vente = (p_article ->> 'prix_vente')::numeric,
      cout_achat = nullif(p_article ->> 'cout_achat', '')::numeric,
      unite = coalesce(nullif(btrim(p_article ->> 'unite'), ''), 'unité'),
      suivi_stock = coalesce((p_article ->> 'suivi_stock')::boolean, true),
      stock_minimum = coalesce(nullif(p_article ->> 'stock_minimum', '')::numeric, 0),
      photo = nullif(p_article ->> 'photo', ''),
      actif = coalesce((p_article ->> 'actif')::boolean, actif)
    where id = resultat and etablissement_id = p_etablissement_id;
    if not found then
      raise exception 'Article introuvable dans cet établissement';
    end if;
  end if;
  return resultat;
end
$$;

-- Stock ----------------------------------------------------------------------
-- p_type : 'entree' (quantité > 0), 'ajustement' (quantité signée, motif obligatoire),
-- 'inventaire' (quantité = stock compté ; le mouvement enregistre l'écart).
create function public.ajuster_stock(
  p_etablissement_id uuid, p_article_id uuid, p_type text, p_quantite numeric,
  p_motif text default null, p_cout_unitaire numeric default null
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  article public.articles%rowtype;
  actuel numeric;
  mouvement numeric;
begin
  perform public.exiger_permission(p_etablissement_id, 'stock.ajuster');
  select * into article from public.articles
  where id = p_article_id and etablissement_id = p_etablissement_id
  for update;
  if article.id is null then
    raise exception 'Article introuvable dans cet établissement';
  end if;
  if not article.suivi_stock then
    raise exception 'Cet article n''est pas suivi en stock';
  end if;
  actuel := public.stock_article(p_article_id);
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
    insert into public.mouvements_stock(etablissement_id, article_id, type, quantite, cout_unitaire, motif, acteur)
    values (p_etablissement_id, p_article_id, p_type, mouvement, p_cout_unitaire, nullif(btrim(p_motif), ''), auth.uid());
  end if;
  return actuel + mouvement;
end
$$;

-- Caisse ---------------------------------------------------------------------
create function public.ouvrir_caisse(p_etablissement_id uuid, p_point_de_vente_id uuid default null, p_fond_initial numeric default 0)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pdv uuid := p_point_de_vente_id;
  existante uuid;
  resultat uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'caisse.utiliser');
  if pdv is null then
    select id into pdv from public.points_de_vente
    where etablissement_id = p_etablissement_id and actif
    order by cree_le limit 1;
    if pdv is null then
      insert into public.points_de_vente(etablissement_id, nom) values (p_etablissement_id, 'Caisse principale')
      returning id into pdv;
    end if;
  elsif not exists (
    select 1 from public.points_de_vente where id = pdv and etablissement_id = p_etablissement_id and actif
  ) then
    raise exception 'Point de vente introuvable ou inactif';
  end if;
  select id into existante from public.sessions_caisse where point_de_vente_id = pdv and statut = 'ouverte';
  if existante is not null then
    return existante;
  end if;
  if coalesce(p_fond_initial, 0) < 0 then
    raise exception 'Le fond de caisse ne peut pas être négatif';
  end if;
  insert into public.sessions_caisse(etablissement_id, point_de_vente_id, fond_initial, ouverte_par)
  values (p_etablissement_id, pdv, coalesce(p_fond_initial, 0), auth.uid())
  returning id into resultat;
  return resultat;
end
$$;

-- Vente atomique : lignes, sorties de stock, paiements, monnaie rendue.
-- p_lignes   : [{"article_id": uuid, "quantite": n, "remise": n}]
-- p_paiements: [{"mode": "especes"|"mobile_money"|…, "montant": n, "reference": text}]
create function public.enregistrer_vente(
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
  ligne jsonb;
  paiement jsonb;
  article public.articles%rowtype;
  besoin record;
  stock_negatif boolean;
  quantite numeric;
  remise_ligne numeric;
  sous_total numeric := 0;
  total numeric;
  remise numeric := coalesce(p_remise, 0);
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
  if jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Le panier est vide';
  end if;
  if p_contact_id is not null and not exists (
    select 1 from public.contacts where id = p_contact_id and etablissement_id = p_etablissement_id
  ) then
    raise exception 'Contact inconnu dans cet établissement';
  end if;

  select coalesce((data ->> 'stock_negatif')::boolean, false) into stock_negatif
  from public.etablissement_parametres
  where etablissement_id = p_etablissement_id and module_id = 'caisse';
  stock_negatif := coalesce(stock_negatif, false);

  -- Contrôle du stock par article (verrou sur les articles, dans un ordre stable).
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
    if article.suivi_stock and not stock_negatif and public.stock_article(article.id) < besoin.quantite then
      raise exception 'Stock insuffisant pour « % » (disponible : %)', article.nom, public.stock_article(article.id);
    end if;
  end loop;

  for ligne in select * from jsonb_array_elements(p_lignes) loop
    quantite := (ligne ->> 'quantite')::numeric;
    remise_ligne := coalesce(nullif(ligne ->> 'remise', '')::numeric, 0);
    select * into article from public.articles where id = (ligne ->> 'article_id')::uuid;
    if quantite is null or quantite <= 0 then
      raise exception 'Quantité invalide pour « % »', article.nom;
    end if;
    if remise_ligne < 0 or remise_ligne > round(article.prix_vente * quantite, 2) then
      raise exception 'Remise invalide pour « % »', article.nom;
    end if;
    sous_total := sous_total + round(article.prix_vente * quantite, 2) - remise_ligne;
  end loop;

  if remise < 0 or remise > sous_total then
    raise exception 'Remise globale invalide';
  end if;
  total := sous_total - remise;

  if jsonb_typeof(coalesce(p_paiements, '[]'::jsonb)) <> 'array' then
    raise exception 'Paiements invalides';
  end if;
  for paiement in select * from jsonb_array_elements(coalesce(p_paiements, '[]'::jsonb)) loop
    montant := (paiement ->> 'montant')::numeric;
    mode := paiement ->> 'mode';
    if montant is null or montant <= 0 then
      raise exception 'Montant de paiement invalide';
    end if;
    if mode not in ('especes', 'mobile_money', 'carte', 'virement', 'cheque') then
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
    etablissement_id, numero, session_caisse_id, point_de_vente_id, contact_id, sous_total, remise, total,
    montant_paye, statut_paiement, note, vendeur
  ) values (
    p_etablissement_id, numero, session.id, session.point_de_vente_id, p_contact_id, sous_total, remise, total,
    paye,
    case when paye >= total then 'payee' when paye > 0 then 'partielle' else 'impayee' end,
    nullif(btrim(p_note), ''),
    auth.uid()
  )
  returning id into vente_id;

  for ligne in select * from jsonb_array_elements(p_lignes) loop
    quantite := (ligne ->> 'quantite')::numeric;
    remise_ligne := coalesce(nullif(ligne ->> 'remise', '')::numeric, 0);
    select * into article from public.articles where id = (ligne ->> 'article_id')::uuid;
    insert into public.lignes_vente(vente_id, etablissement_id, article_id, libelle, quantite, prix_unitaire, remise, total, cout_unitaire)
    values (vente_id, p_etablissement_id, article.id, article.nom, quantite, article.prix_vente, remise_ligne,
            round(article.prix_vente * quantite, 2) - remise_ligne, article.cout_achat);
    if article.suivi_stock then
      insert into public.mouvements_stock(etablissement_id, article_id, type, quantite, cout_unitaire, motif, vente_id, acteur)
      values (p_etablissement_id, article.id, 'sortie_vente', -quantite, article.cout_achat, 'Vente ' || numero, vente_id, auth.uid());
    end if;
  end loop;

  -- La monnaie rendue est déduite des espèces encaissées.
  for paiement in select * from jsonb_array_elements(coalesce(p_paiements, '[]'::jsonb)) loop
    montant := (paiement ->> 'montant')::numeric;
    if paiement ->> 'mode' = 'especes' then
      montant := montant - least(monnaie, montant);
      monnaie := monnaie - least(monnaie, (paiement ->> 'montant')::numeric);
    end if;
    if montant > 0 then
      insert into public.paiements(etablissement_id, vente_id, session_caisse_id, mode, montant, reference, encaisse_par)
      values (p_etablissement_id, vente_id, session.id, paiement ->> 'mode', montant,
              nullif(btrim(paiement ->> 'reference'), ''), auth.uid());
    end if;
  end loop;

  return jsonb_build_object(
    'vente_id', vente_id,
    'numero', numero,
    'total', total,
    'paye', paye,
    'reste', total - paye,
    'monnaie', greatest(verse - total, 0)
  );
end
$$;

-- Ventes : annulation tracée, possible tant que la caisse de la vente est ouverte.
create function public.annuler_vente(p_vente_id uuid, p_motif text)
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
  if vente.statut = 'annulee' then
    raise exception 'Cette vente est déjà annulée';
  end if;
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Le motif d''annulation est obligatoire';
  end if;
  select statut into session_statut from public.sessions_caisse where id = vente.session_caisse_id;
  if session_statut is distinct from 'ouverte' then
    raise exception 'La caisse de cette vente est clôturée : l''annulation n''est plus possible';
  end if;

  insert into public.mouvements_stock(etablissement_id, article_id, type, quantite, cout_unitaire, motif, vente_id, acteur)
  select vente.etablissement_id, m.article_id, 'retour_annulation', -m.quantite, m.cout_unitaire,
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

-- Paiements ------------------------------------------------------------------
create function public.recalculer_paiement_vente(p_vente_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  paye numeric;
  total_vente numeric;
begin
  select coalesce(sum(montant), 0) into paye from public.paiements where vente_id = p_vente_id and statut = 'valide';
  select total into total_vente from public.ventes where id = p_vente_id;
  update public.ventes
  set montant_paye = paye,
      statut_paiement = case when paye >= total_vente then 'payee' when paye > 0 then 'partielle' else 'impayee' end
  where id = p_vente_id;
end
$$;
revoke execute on function public.recalculer_paiement_vente(uuid) from public, anon, authenticated;

create function public.encaisser_paiement(
  p_vente_id uuid, p_montant numeric, p_mode text, p_session_id uuid default null, p_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  vente public.ventes%rowtype;
  resultat uuid;
begin
  select * into vente from public.ventes where id = p_vente_id for update;
  if vente.id is null then
    raise exception 'Vente introuvable';
  end if;
  perform public.exiger_permission(vente.etablissement_id, 'paiements.encaisser');
  if vente.statut <> 'validee' then
    raise exception 'Vente annulée : aucun paiement possible';
  end if;
  if p_mode not in ('especes', 'mobile_money', 'carte', 'virement', 'cheque') then
    raise exception 'Mode de paiement inconnu : %', p_mode;
  end if;
  if p_montant is null or p_montant <= 0 or p_montant > vente.total - vente.montant_paye then
    raise exception 'Le montant doit être positif et ne pas dépasser le reste dû (%)', vente.total - vente.montant_paye;
  end if;
  if p_session_id is not null and not exists (
    select 1 from public.sessions_caisse
    where id = p_session_id and etablissement_id = vente.etablissement_id and statut = 'ouverte'
  ) then
    raise exception 'Caisse introuvable ou clôturée';
  end if;
  if p_mode = 'especes' and p_session_id is null then
    raise exception 'Un paiement en espèces doit être rattaché à une caisse ouverte';
  end if;
  insert into public.paiements(etablissement_id, vente_id, session_caisse_id, mode, montant, reference, encaisse_par)
  values (vente.etablissement_id, vente.id, p_session_id, p_mode, p_montant, nullif(btrim(p_reference), ''), auth.uid())
  returning id into resultat;
  perform public.recalculer_paiement_vente(vente.id);
  return resultat;
end
$$;

create function public.annuler_paiement(p_paiement_id uuid, p_motif text)
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

-- Reçu : données complètes d'une vente pour impression.
create function public.recu_vente(p_vente_id uuid)
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
  ) then
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

-- Clôture : calcule et fige le ticket Z, puis ferme la session.
create function public.apercu_cloture(p_session_id uuid)
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
  ) then
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

create function public.cloturer_caisse(p_session_id uuid, p_especes_comptees numeric, p_commentaire text default null)
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
  if session.statut <> 'ouverte' then
    raise exception 'Cette caisse est déjà clôturée';
  end if;
  if p_especes_comptees is null or p_especes_comptees < 0 then
    raise exception 'Indiquez les espèces comptées dans le tiroir';
  end if;
  apercu := public.apercu_cloture(p_session_id);
  numero := public.prochain_numero(session.etablissement_id, 'cloture', 'Z-');
  insert into public.clotures(
    etablissement_id, numero, session_caisse_id, point_de_vente_id, ouverte_le, cloturee_par, fond_initial,
    nombre_ventes, total_ventes, nombre_annulations, total_annulations, total_remises, encaissements,
    depenses_especes, credit_accorde, especes_attendues, especes_comptees, ecart, articles_vendus, commentaire
  ) values (
    session.etablissement_id, numero, session.id, session.point_de_vente_id, session.ouverte_le, auth.uid(), session.fond_initial,
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
  return to_jsonb(resultat) || jsonb_build_object('point_de_vente', apercu ->> 'point_de_vente');
end
$$;

-- Contacts -------------------------------------------------------------------
create function public.enregistrer_contact(p_etablissement_id uuid, p_contact jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p_contact ->> 'id', '')::uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'contacts.gerer');
  if resultat is null then
    insert into public.contacts(etablissement_id, type, nom, telephone, email, adresse, notes)
    values (
      p_etablissement_id,
      coalesce(nullif(p_contact ->> 'type', ''), 'client'),
      btrim(p_contact ->> 'nom'),
      nullif(btrim(p_contact ->> 'telephone'), ''),
      nullif(lower(btrim(p_contact ->> 'email')), ''),
      nullif(btrim(p_contact ->> 'adresse'), ''),
      nullif(btrim(p_contact ->> 'notes'), '')
    )
    returning id into resultat;
  else
    update public.contacts set
      type = coalesce(nullif(p_contact ->> 'type', ''), type),
      nom = btrim(p_contact ->> 'nom'),
      telephone = nullif(btrim(p_contact ->> 'telephone'), ''),
      email = nullif(lower(btrim(p_contact ->> 'email')), ''),
      adresse = nullif(btrim(p_contact ->> 'adresse'), ''),
      notes = nullif(btrim(p_contact ->> 'notes'), ''),
      actif = coalesce((p_contact ->> 'actif')::boolean, actif)
    where id = resultat and etablissement_id = p_etablissement_id;
    if not found then
      raise exception 'Contact introuvable dans cet établissement';
    end if;
  end if;
  return resultat;
end
$$;

-- Dépenses -------------------------------------------------------------------
create function public.enregistrer_depense(p_etablissement_id uuid, p_depense jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid;
  fournisseur uuid := nullif(p_depense ->> 'fournisseur_id', '')::uuid;
  session uuid := nullif(p_depense ->> 'session_caisse_id', '')::uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'depenses.gerer');
  if fournisseur is not null and not exists (
    select 1 from public.contacts where id = fournisseur and etablissement_id = p_etablissement_id
  ) then
    raise exception 'Fournisseur inconnu dans cet établissement';
  end if;
  if session is not null and not exists (
    select 1 from public.sessions_caisse where id = session and etablissement_id = p_etablissement_id and statut = 'ouverte'
  ) then
    raise exception 'Caisse introuvable ou clôturée';
  end if;
  insert into public.depenses(
    etablissement_id, date_depense, categorie, libelle, montant, mode, fournisseur_id, session_caisse_id, justificatif, cree_par
  ) values (
    p_etablissement_id,
    coalesce(nullif(p_depense ->> 'date_depense', '')::date, current_date),
    coalesce(nullif(btrim(p_depense ->> 'categorie'), ''), 'Divers'),
    btrim(p_depense ->> 'libelle'),
    (p_depense ->> 'montant')::numeric,
    coalesce(nullif(p_depense ->> 'mode', ''), 'especes'),
    fournisseur,
    session,
    nullif(p_depense ->> 'justificatif', ''),
    auth.uid()
  )
  returning id into resultat;
  return resultat;
end
$$;

create function public.annuler_depense(p_depense_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  depense public.depenses%rowtype;
begin
  select * into depense from public.depenses where id = p_depense_id for update;
  if depense.id is null then
    raise exception 'Dépense introuvable';
  end if;
  perform public.exiger_permission(depense.etablissement_id, 'depenses.gerer');
  if depense.statut <> 'valide' then
    raise exception 'Cette dépense est déjà annulée';
  end if;
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Le motif d''annulation est obligatoire';
  end if;
  if depense.session_caisse_id is not null and not exists (
    select 1 from public.sessions_caisse where id = depense.session_caisse_id and statut = 'ouverte'
  ) then
    raise exception 'La caisse de cette dépense est clôturée : l''annulation n''est plus possible';
  end if;
  update public.depenses
  set statut = 'annulee', annulee_le = now(), annulee_par = auth.uid(), motif_annulation = btrim(p_motif)
  where id = depense.id;
end
$$;

-- Tableau de bord : lecture seule, la RLS filtre selon les permissions de l'utilisateur.
create function public.tableau_de_bord_commerce(p_etablissement_id uuid, p_du date, p_au date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with fuseau as (
    select coalesce((select e.fuseau from public.etablissements e where e.id = p_etablissement_id), 'UTC') as tz
  ),
  ventes as (
    select v.*, (v.cree_le at time zone (select tz from fuseau))::date as jour
    from public.ventes v
    where v.etablissement_id = p_etablissement_id and v.statut = 'validee'
      and (v.cree_le at time zone (select tz from fuseau))::date between p_du and p_au
  ),
  lignes as (
    select l.* from public.lignes_vente l join ventes v on v.id = l.vente_id
  ),
  paiements as (
    select p.* from public.paiements p
    where p.etablissement_id = p_etablissement_id and p.statut = 'valide'
      and (p.cree_le at time zone (select tz from fuseau))::date between p_du and p_au
  ),
  depenses as (
    select d.* from public.depenses d
    where d.etablissement_id = p_etablissement_id and d.statut = 'valide'
      and d.date_depense between p_du and p_au
  )
  select jsonb_build_object(
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
                 where v.etablissement_id = p_etablissement_id and v.statut = 'validee' and v.montant_paye < v.total),
    'ventes_par_jour', (select coalesce(jsonb_agg(jsonb_build_object('jour', jour, 'total', total, 'nombre', nombre) order by jour), '[]'::jsonb)
                        from (select jour, sum(total) total, count(*) nombre from ventes group by jour) t),
    'top_articles', (select coalesce(jsonb_agg(jsonb_build_object('libelle', libelle, 'quantite', quantite, 'total', total) order by total desc), '[]'::jsonb)
                     from (select libelle, sum(quantite) quantite, sum(total) total from lignes group by libelle order by sum(total) desc limit 5) t),
    'stock_bas', (select coalesce(jsonb_agg(jsonb_build_object('article_id', article_id, 'nom', nom, 'quantite', quantite, 'minimum', stock_minimum) order by quantite), '[]'::jsonb)
                  from (select * from public.stock_articles s
                        where s.etablissement_id = p_etablissement_id and s.actif and s.suivi_stock and s.quantite <= s.stock_minimum
                        order by s.quantite limit 10) t)
  )
$$;

-- Droits d'exécution : jamais pour anon ; les fonctions internes ne sont pas exposées.
do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.exiger_permission(uuid, text)',
    'public.prochain_numero(uuid, text, text)',
    'public.stock_article(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', signature);
  end loop;
  foreach signature in array array[
    'public.mon_contexte()',
    'public.enregistrer_identite(uuid, jsonb)',
    'public.enregistrer_point_de_vente(uuid, text, uuid, boolean)',
    'public.enregistrer_parametres_module(uuid, text, jsonb)',
    'public.enregistrer_categorie(uuid, text)',
    'public.enregistrer_article(uuid, jsonb)',
    'public.ajuster_stock(uuid, uuid, text, numeric, text, numeric)',
    'public.ouvrir_caisse(uuid, uuid, numeric)',
    'public.enregistrer_vente(uuid, uuid, jsonb, jsonb, uuid, numeric, text)',
    'public.annuler_vente(uuid, text)',
    'public.encaisser_paiement(uuid, numeric, text, uuid, text)',
    'public.annuler_paiement(uuid, text)',
    'public.recu_vente(uuid)',
    'public.apercu_cloture(uuid)',
    'public.cloturer_caisse(uuid, numeric, text)',
    'public.enregistrer_contact(uuid, jsonb)',
    'public.enregistrer_depense(uuid, jsonb)',
    'public.annuler_depense(uuid, text)',
    'public.tableau_de_bord_commerce(uuid, date, date)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
end
$$;
