-- Audit offensif final du moteur Commerce et du socle (2026-10-02).
-- Chaque correctif est couvert par tests/audit_offensif.test.js.
-- Aucune donnée n'est supprimée ; les contraintes ajoutées sont NOT VALID afin de ne
-- jamais bloquer une base existante tout en s'appliquant à toute nouvelle écriture.

-- 1. Privilèges de tables : TRUNCATE (qui contourne la RLS et les triggers de ligne),
--    TRIGGER (qui permettrait de greffer du code sur une table partagée) et REFERENCES
--    ne sont jamais accordés aux rôles de l'API. anon n'écrit jamais.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
revoke insert, update, delete on all tables in schema public from anon;
alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;
alter default privileges in schema public revoke insert, update, delete on tables from anon;

-- Les séquences (journal, mouvements, événements) ne sont manipulables que par le
-- propriétaire : setval() permettait de casser la numérotation du journal d'audit.
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- Ceinture et bretelles : TRUNCATE est refusé sur les tables commerciales et les journaux,
-- quel que soit le rôle.
do $$
declare
  nom_table text;
begin
  foreach nom_table in array array[
    'categories_articles', 'articles', 'contacts', 'sessions_caisse', 'ventes', 'lignes_vente',
    'paiements', 'mouvements_stock', 'depenses', 'clotures', 'journal_audit', 'evenements', 'numerotations'
  ] loop
    execute format(
      'create trigger %I_sans_vidage before truncate on public.%I for each statement execute function public.refuser_suppression()',
      nom_table, nom_table
    );
  end loop;
end
$$;

-- 2. Fonctions : aucune n'est exécutable par anon ni par PUBLIC. authenticated garde
--    les fonctions métier et les assistants utilisés par les politiques ; les fonctions
--    internes restent réservées au propriétaire.
do $$
declare
  fonction record;
begin
  for fonction in
    select p.oid::regprocedure as signature, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from public, anon', fonction.signature);
    if fonction.proname in ('exiger_permission', 'prochain_numero', 'stock_article', 'recalculer_paiement_vente', 'exiger_super_admin') then
      execute format('revoke execute on function %s from authenticated', fonction.signature);
    else
      execute format('grant execute on function %s to authenticated', fonction.signature);
    end if;
  end loop;
end
$$;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges revoke execute on functions from public;

-- 3. Valeurs numériques : NaN est accepté par le type numeric et passe toutes les
--    comparaisons (NaN > 0, NaN = NaN). Il est refusé partout.
do $$
declare
  colonne record;
begin
  for colonne in
    select c.table_name, c.column_name
    from information_schema.columns c
    where c.table_schema = 'public' and c.data_type = 'numeric'
      and c.table_name in ('articles', 'sessions_caisse', 'ventes', 'lignes_vente', 'paiements',
                           'mouvements_stock', 'depenses', 'clotures')
  loop
    execute format(
      'alter table public.%I add constraint %I check (%I is null or %I <> ''NaN''::numeric) not valid',
      colonne.table_name, colonne.table_name || '_' || colonne.column_name || '_fini', colonne.column_name, colonne.column_name
    );
  end loop;
end
$$;

-- 4. Numérotation : le gérant ne peut plus réécrire les compteurs (V-…, Z-…) en direct ;
--    seule prochain_numero() les fait avancer, sans trou ni doublon.
drop policy if exists numerotations_ecriture on public.numerotations;

-- 5. Journal d'audit : le drapeau mode_support n'est vrai que pour une session support
--    réelle, ouverte, appartenant à l'utilisateur connecté (plus de simple variable).
create or replace function public.journaliser_modification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  contenu jsonb;
  etablissement uuid;
  identifiant text;
  support boolean;
begin
  contenu := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  etablissement := nullif(contenu ->> 'etablissement_id', '')::uuid;
  identifiant := coalesce(contenu ->> 'id', contenu ->> 'user_id', contenu ->> 'type');
  support := exists (
    select 1 from public.sessions_support s
    where s.id::text = coalesce(current_setting('app.session_support_id', true), '')
      and s.admin_id = auth.uid()
      and s.fermee_le is null
      and (etablissement is null or s.etablissement_id = etablissement)
  );
  insert into public.journal_audit (
    table_nom, operation, ligne_id, etablissement_id, acteur, mode_support, avant, apres
  ) values (
    tg_table_name, tg_op, identifiant, etablissement, auth.uid(), support,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return case when tg_op = 'DELETE' then old else new end;
end
$$;
revoke execute on function public.journaliser_modification() from public, anon;

-- Couverture complète : lignes de vente, mouvements de stock et administrateurs éditeur.
create trigger lignes_vente_audit after insert or update or delete on public.lignes_vente
for each row execute function public.journaliser_modification();
create trigger mouvements_stock_audit after insert or update or delete on public.mouvements_stock
for each row execute function public.journaliser_modification();
create trigger plateforme_admins_audit after insert or update or delete on public.plateforme_admins
for each row execute function public.journaliser_modification();

-- 6. Sessions de caisse : une session clôturée est définitive ; seule la clôture
--    (ouverte -> cloturee) modifie une session.
create function public.proteger_session_caisse()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.statut = 'cloturee' then
    raise exception 'Une caisse clôturée est définitive';
  end if;
  if (new.id, new.point_de_vente_id, new.fond_initial, new.ouverte_par, new.ouverte_le)
     is distinct from (old.id, old.point_de_vente_id, old.fond_initial, old.ouverte_par, old.ouverte_le) then
    raise exception 'Une session de caisse ne change que par sa clôture';
  end if;
  if new.statut = 'cloturee' and new.cloturee_le is null then
    raise exception 'La date de clôture est obligatoire';
  end if;
  return new;
end
$$;
revoke execute on function public.proteger_session_caisse() from public, anon;
create trigger sessions_caisse_protection before update on public.sessions_caisse
for each row execute function public.proteger_session_caisse();

-- 7. Invitations : l'auteur est toujours l'utilisateur connecté et ne change jamais.
create function public.fixer_auteur_invitation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.cree_par := coalesce(auth.uid(), new.cree_par);
  elsif new.cree_par is distinct from old.cree_par then
    raise exception 'L''auteur d''une invitation ne peut pas être modifié';
  end if;
  return new;
end
$$;
revoke execute on function public.fixer_auteur_invitation() from public, anon;
create trigger invitations_auteur before insert or update on public.invitations
for each row execute function public.fixer_auteur_invitation();

-- 8. Vente : panier nul refusé, nombres non finis refusés, remises arrondies au centime.
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
  ligne jsonb;
  paiement jsonb;
  article public.articles%rowtype;
  besoin record;
  stock_negatif boolean;
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

  -- Quantités contrôlées avant tout calcul de stock (NaN, négatives, nulles).
  for ligne in select * from jsonb_array_elements(p_lignes) loop
    quantite := (ligne ->> 'quantite')::numeric;
    if quantite is null or quantite = 'NaN'::numeric or quantite <= 0 then
      raise exception 'Quantité invalide';
    end if;
  end loop;

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
    remise_ligne := round(coalesce(nullif(ligne ->> 'remise', '')::numeric, 0), 2);
    select * into article from public.articles
    where id = (ligne ->> 'article_id')::uuid and etablissement_id = p_etablissement_id;
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

-- 9. Annulation de vente : impossible si un de ses paiements appartient à une caisse
--    déjà clôturée (le ticket Z de cette caisse deviendrait faux).
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

-- Les fonctions remplacées gardent leurs droits ; on les réaffirme par prudence.
revoke execute on function public.enregistrer_vente(uuid, uuid, jsonb, jsonb, uuid, numeric, text) from public, anon;
revoke execute on function public.annuler_vente(uuid, text) from public, anon;
grant execute on function public.enregistrer_vente(uuid, uuid, jsonb, jsonb, uuid, numeric, text) to authenticated;
grant execute on function public.annuler_vente(uuid, text) to authenticated;
