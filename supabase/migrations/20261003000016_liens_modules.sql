-- Liens entre modules (2026-10-03) :
-- 1. CRM ↔ Facturation : un devis lié à une opportunité ouverte la fait gagner quand il est accepté (ou converti en
--    facture) et perdre (« Devis refusé ») quand il est refusé. La synchronisation passe par une fonction interne, non
--    exposée aux clients : la personne qui change le devis n'a pas besoin du droit CRM. Une opportunité déjà gagnée ou
--    perdue n'est jamais rouverte. La facture issue du devis se retrouve par documents_vente.origine_id (pas de colonne).
-- 2. Fidélité : les points d'une vente se calculent sur son total moins les retours ; un retour inscrit l'écart.
-- 3. Projets : annuler la facture du temps passé libère ce temps, qui peut être refacturé.
-- 4. Agenda ↔ CRM : un rendez-vous peut être rattaché à une opportunité du même établissement.
-- Rien ne se supprime ; aucune fonction interne n'est exécutable par les rôles clients.

-- ---------------------------------------------------------------------------
-- 1. CRM ↔ Facturation
-- ---------------------------------------------------------------------------
create index if not exists crm_opportunites_document_idx on public.crm_opportunites(document_vente_id) where document_vente_id is not null;

-- Applique une étape à une opportunité et ses effets (clôture, prospect → client, notification).
-- Interne : les droits sont vérifiés par l'appelant (deplacer_opportunite, ou la synchronisation d'un devis).
create or replace function public.crm_appliquer_etape(p_opportunite_id uuid, p_etape_id uuid, p_motif text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.crm_opportunites%rowtype;
  v_etape public.crm_etapes%rowtype;
begin
  select * into o from public.crm_opportunites where id = p_opportunite_id for update;
  if o.id is null then
    raise exception 'Opportunité introuvable';
  end if;
  select * into v_etape from public.crm_etapes where id = p_etape_id and etablissement_id = o.etablissement_id and actif;
  if v_etape.id is null then
    raise exception 'Étape inconnue';
  end if;
  if v_etape.nature = 'perdue' and coalesce(btrim(p_motif), '') = '' then
    raise exception 'Indiquez pourquoi l''opportunité est perdue';
  end if;
  update public.crm_opportunites set
    etape_id = v_etape.id, probabilite = v_etape.probabilite,
    statut = case v_etape.nature when 'gagnee' then 'gagnee' when 'perdue' then 'perdue' else 'ouverte' end,
    cloturee_le = case when v_etape.nature = 'ouverte' then null else coalesce(cloturee_le, now()) end,
    motif_perte = case when v_etape.nature = 'perdue' then btrim(p_motif) else null end,
    derniere_activite = now()
  where id = o.id;
  if v_etape.nature = 'gagnee' then
    update public.contacts set type = 'client' where id = o.contact_id and type = 'prospect';
    perform public.notifier_permission(o.etablissement_id, 'crm_pipeline.administrer', 'crm.gagnee', 'Opportunité gagnée',
      o.numero || ' · ' || o.titre, 'crm/' || o.id);
  end if;
end
$$;

-- Même comportement qu'avant : droits du commercial, puis l'étape et ses effets (fonction commune ci-dessus).
create or replace function public.deplacer_opportunite(p_opportunite_id uuid, p_etape_id uuid, p_motif text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.crm_opportunites%rowtype;
begin
  select * into o from public.crm_opportunites where id = p_opportunite_id for update;
  if o.id is null then
    raise exception 'Opportunité introuvable';
  end if;
  perform public.exiger_droit_opportunite(o);
  perform public.crm_appliquer_etape(o.id, p_etape_id, p_motif);
end
$$;

-- Synchronise les opportunités encore ouvertes liées à un devis : 'gagnee' (accepté, converti) ou 'perdue' (refusé).
-- Interne, appelée seulement par les fonctions de facturation qui ont déjà vérifié les droits sur le devis.
create or replace function public.crm_synchroniser_devis(p_document_id uuid, p_nature text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.documents_vente%rowtype;
  o public.crm_opportunites%rowtype;
  v_etape uuid;
  v_sujet text;
begin
  if p_nature not in ('gagnee', 'perdue') then
    raise exception 'Nature inconnue : %', p_nature;
  end if;
  select * into doc from public.documents_vente where id = p_document_id;
  if doc.id is null or doc.type <> 'devis' then
    return;
  end if;
  select id into v_etape from public.crm_etapes where etablissement_id = doc.etablissement_id and nature = p_nature and actif;
  if v_etape is null then
    return;
  end if;
  v_sujet := 'Devis ' || coalesce(doc.numero, '') || case p_nature when 'gagnee' then ' accepté' else ' refusé' end;
  for o in
    select * from public.crm_opportunites
    where document_vente_id = doc.id and etablissement_id = doc.etablissement_id and statut = 'ouverte'
    order by id for update
  loop
    perform public.crm_appliquer_etape(o.id, v_etape, case when p_nature = 'perdue' then 'Devis refusé' end);
    insert into public.crm_activites (etablissement_id, opportunite_id, contact_id, type, sujet, statut, faite_le, resultat, assigne_a, cree_par)
    values (o.etablissement_id, o.id, o.contact_id, 'note', left(v_sujet, 200), 'faite', now(),
      case p_nature when 'gagnee' then 'Opportunité gagnée automatiquement' else 'Opportunité perdue automatiquement' end,
      o.responsable_id, coalesce(auth.uid(), o.responsable_id));
  end loop;
end
$$;

-- Devis : envoyé, accepté, refusé (retour possible d'« envoyé » vers « brouillon »).
-- Ajout : l'opportunité liée suit (accepté → gagnée, refusé → perdue).
create or replace function public.changer_statut_devis(p_document_id uuid, p_statut text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.documents_vente%rowtype;
begin
  select * into doc from public.documents_vente where id = p_document_id for update;
  if doc.id is null or doc.type <> 'devis' then
    raise exception 'Devis introuvable';
  end if;
  perform public.exiger_permission(doc.etablissement_id, 'facturation.gerer');
  perform public.exiger_acces_hub(doc.hub_id);
  if not ((doc.statut = 'brouillon' and p_statut = 'envoye')
       or (doc.statut = 'envoye' and p_statut in ('brouillon', 'accepte', 'refuse'))
       or (doc.statut = 'accepte' and p_statut = 'envoye')) then
    raise exception 'Passage impossible de « % » à « % »', doc.statut, p_statut;
  end if;
  update public.documents_vente set statut = p_statut where id = doc.id;
  if p_statut = 'accepte' then
    perform public.crm_synchroniser_devis(doc.id, 'gagnee');
  elsif p_statut = 'refuse' then
    perform public.crm_synchroniser_devis(doc.id, 'perdue');
  end if;
end
$$;

-- Transforme un devis (envoyé ou accepté) en facture brouillon ; le devis devient « converti ».
-- Ajout : facturer un devis vaut accord du client, l'opportunité liée encore ouverte est gagnée. Le lien reste sur le
-- devis ; la facture se retrouve par son origine_id.
create or replace function public.convertir_devis(p_document_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.documents_vente%rowtype;
  resultat uuid;
  delai integer;
begin
  select * into doc from public.documents_vente where id = p_document_id for update;
  if doc.id is null or doc.type <> 'devis' then
    raise exception 'Devis introuvable';
  end if;
  perform public.exiger_permission(doc.etablissement_id, 'facturation.gerer');
  perform public.exiger_acces_hub(doc.hub_id);
  if doc.statut not in ('envoye', 'accepte', 'brouillon') then
    raise exception 'Ce devis ne peut plus être facturé (%)', doc.statut;
  end if;
  delai := coalesce((public.parametre_module(doc.etablissement_id, 'facturation', 'delai_paiement_jours') #>> '{}')::integer, 30);
  insert into public.documents_vente (etablissement_id, hub_id, type, contact_id, date_document, echeance, objet, notes, conditions, origine_id, cree_par)
  values (doc.etablissement_id, doc.hub_id, 'facture', doc.contact_id, public.date_locale(doc.etablissement_id),
          public.date_locale(doc.etablissement_id) + delai, doc.objet, doc.notes, doc.conditions, doc.id, auth.uid())
  returning id into resultat;
  insert into public.lignes_document_vente (document_id, etablissement_id, ordre, article_id, libelle, description, quantite, unite,
    prix_unitaire, remise, taux_tva, total_ht, total_tva, total_ttc)
  select resultat, etablissement_id, ordre, article_id, libelle, description, quantite, unite, prix_unitaire, remise, taux_tva,
         total_ht, total_tva, total_ttc
  from public.lignes_document_vente where document_id = doc.id;
  perform public.recalculer_document_vente(resultat);
  update public.documents_vente set statut = 'converti' where id = doc.id;
  perform public.crm_synchroniser_devis(doc.id, 'gagnee');
  return resultat;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Fidélité : total net des retours
-- ---------------------------------------------------------------------------
-- Points attendus pour la vente (0 si annulée, sans client ou module inactif), calculés sur le total moins les retours,
-- moins points déjà inscrits : seul l'écart est inscrit, donc rejouer le calcul ne double jamais rien. Un client changé
-- sur la vente est traité aussi. Comme pour une annulation, le retrait suit l'achat même si les points ont été dépensés.
create or replace function public.recalculer_points_fidelite_vente(p_vente_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.ventes%rowtype;
  tranche numeric;
  par_tranche numeric;
  attendu integer;
  retours numeric;
  ligne record;
begin
  select * into v from public.ventes where id = p_vente_id;
  if v.id is null or not exists (select 1 from public.fidelite_mouvements where vente_id = v.id)
     and not (v.statut = 'validee' and v.contact_id is not null and public.module_actif(v.etablissement_id, 'fidelite')) then
    return;
  end if;
  tranche := coalesce((public.parametre_module(v.etablissement_id, 'fidelite', 'tranche') #>> '{}')::numeric, 1000);
  par_tranche := coalesce((public.parametre_module(v.etablissement_id, 'fidelite', 'points_par_tranche') #>> '{}')::numeric, 1);
  -- Retirer les points inscrits pour un autre client que celui de la vente.
  for ligne in
    select contact_id, sum(points)::integer total from public.fidelite_mouvements
    where vente_id = v.id and contact_id is distinct from v.contact_id group by contact_id having sum(points) <> 0
  loop
    insert into public.fidelite_mouvements (etablissement_id, contact_id, vente_id, type, points, motif)
    values (v.etablissement_id, ligne.contact_id, v.id, 'annulation', -ligne.total, 'Client modifié sur la vente ' || v.numero);
  end loop;
  if v.contact_id is null then
    return;
  end if;
  select coalesce(sum(montant), 0) into retours from public.retours_vente where vente_id = v.id;
  attendu := case when v.statut = 'validee' and tranche > 0 and par_tranche > 0
    then floor(floor(greatest(v.total - retours, 0) / tranche) * par_tranche)::integer else 0 end;
  -- Une vente déjà comptée garde ses points si le module est désactivé ensuite ; seuls l'annulation et le retour les retirent.
  if v.statut = 'validee' and not public.module_actif(v.etablissement_id, 'fidelite') and retours = 0 then
    return;
  end if;
  attendu := attendu - coalesce((select sum(points) from public.fidelite_mouvements where vente_id = v.id and contact_id = v.contact_id), 0);
  -- Module désactivé : un retour peut retirer des points, jamais en ajouter.
  if v.statut = 'validee' and not public.module_actif(v.etablissement_id, 'fidelite') and attendu > 0 then
    return;
  end if;
  if attendu <> 0 then
    insert into public.fidelite_mouvements (etablissement_id, contact_id, vente_id, type, points, motif)
    values (v.etablissement_id, v.contact_id, v.id, case when attendu > 0 then 'gain' else 'annulation' end, attendu,
      case when attendu > 0 then 'Achat ' || v.numero
           when v.statut = 'validee' and retours > 0 then 'Retour sur la vente ' || v.numero
           else 'Vente ' || v.numero || ' annulée ou corrigée' end);
  end if;
end
$$;

create or replace function public.points_vente_fidelite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.recalculer_points_fidelite_vente(new.id);
  return null;
end
$$;

-- Un retour (partiel ou total) recalcule les points de la vente en fin de transaction.
create or replace function public.points_retour_fidelite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.recalculer_points_fidelite_vente(new.vente_id);
  return null;
end
$$;
drop trigger if exists retours_vente_fidelite on public.retours_vente;
create constraint trigger retours_vente_fidelite after insert on public.retours_vente
deferrable initially deferred for each row execute function public.points_retour_fidelite();

-- Rattrapage : ventes déjà retournées dont les points n'ont pas été corrigés.
do $$
declare v uuid;
begin
  for v in select distinct r.vente_id from public.retours_vente r
           where exists (select 1 from public.fidelite_mouvements m where m.vente_id = r.vente_id) loop
    perform public.recalculer_points_fidelite_vente(v);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Projets : une facture annulée libère le temps qu'elle facturait
-- ---------------------------------------------------------------------------
-- Un temps saisi ne change plus (seule l'annulation, le rattachement à une facture, ou sa libération quand cette
-- facture est annulée, sont possibles).
create or replace function public.proteger_temps_projet()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - array['statut', 'annule_le', 'annule_par', 'motif_annulation', 'document_vente_id'])
     <> (to_jsonb(old) - array['statut', 'annule_le', 'annule_par', 'motif_annulation', 'document_vente_id']) then
    raise exception 'Un temps saisi ne se modifie pas : annulez-le et ressaisissez-le';
  end if;
  if old.statut = 'annule' and new.statut <> 'annule' then
    raise exception 'Un temps annulé le reste';
  end if;
  if old.document_vente_id is not null and new.document_vente_id is distinct from old.document_vente_id
     and not (new.document_vente_id is null
              and exists (select 1 from public.documents_vente where id = old.document_vente_id and statut = 'annule')) then
    raise exception 'Ce temps est déjà facturé';
  end if;
  return new;
end
$$;

-- Facture passée à « annulé » (brouillon annulé, ou facture émise annulée par avoir, ce qui exige qu'aucun paiement
-- ne reste) : le temps rattaché redevient « à facturer ».
create or replace function public.liberer_temps_facture_annulee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type = 'facture' and new.statut = 'annule' and old.statut is distinct from 'annule' then
    update public.projet_temps set document_vente_id = null
    where document_vente_id = new.id and etablissement_id = new.etablissement_id;
  end if;
  return null;
end
$$;
drop trigger if exists documents_vente_liberer_temps on public.documents_vente;
create trigger documents_vente_liberer_temps after update of statut on public.documents_vente
for each row execute function public.liberer_temps_facture_annulee();

-- Rattrapage : temps encore rattachés à une facture déjà annulée.
update public.projet_temps t set document_vente_id = null
from public.documents_vente d
where d.id = t.document_vente_id and d.type = 'facture' and d.statut = 'annule';

-- ---------------------------------------------------------------------------
-- 4. Agenda ↔ CRM
-- ---------------------------------------------------------------------------
alter table public.agenda_rendez_vous add column if not exists opportunite_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agenda_rendez_vous_opportunite_fk') then
    alter table public.agenda_rendez_vous add constraint agenda_rendez_vous_opportunite_fk
      foreign key (opportunite_id, etablissement_id) references public.crm_opportunites(id, etablissement_id) on delete restrict;
  end if;
end
$$;
create index if not exists agenda_rdv_opportunite_idx on public.agenda_rendez_vous(opportunite_id) where opportunite_id is not null;
create index if not exists agenda_rdv_contact_idx on public.agenda_rendez_vous(contact_id, debut) where contact_id is not null;

-- p : { id?, titre?, contact_id?, nom_client?, telephone?, responsable?, article_id?, prix?, debut, fin?, duree_minutes?, lieu?, note?,
--       statut?, opportunite_id? }
-- opportunite_id (facultatif) : opportunité du même établissement, lisible par la personne (crm_pipeline.lire) ; le client
-- du rendez-vous est alors celui de l'opportunité. Absent de p en modification : le lien existant est conservé.
create or replace function public.enregistrer_rendez_vous(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p ->> 'id', '')::uuid;
  existant public.agenda_rendez_vous%rowtype;
  v_contact public.contacts%rowtype;
  v_article public.articles%rowtype;
  v_opportunite public.crm_opportunites%rowtype;
  v_opportunite_id uuid;
  v_responsable uuid := nullif(p ->> 'responsable', '')::uuid;
  v_debut timestamptz := nullif(p ->> 'debut', '')::timestamptz;
  v_fin timestamptz := nullif(p ->> 'fin', '')::timestamptz;
  v_statut text := coalesce(nullif(p ->> 'statut', ''), 'prevu');
  v_titre text;
  conflit text;
begin
  perform public.exiger_permission(p_etablissement_id, 'agenda.gerer');
  if resultat is not null then
    select * into existant from public.agenda_rendez_vous where id = resultat and etablissement_id = p_etablissement_id for update;
    if existant.id is null then
      raise exception 'Rendez-vous introuvable';
    end if;
    if existant.statut not in ('prevu', 'confirme') then
      raise exception 'Ce rendez-vous est clos : il ne se modifie plus';
    end if;
  end if;
  v_opportunite_id := case when p ? 'opportunite_id' then nullif(p ->> 'opportunite_id', '')::uuid else existant.opportunite_id end;
  if v_opportunite_id is not null and v_opportunite_id is distinct from existant.opportunite_id then
    if not public.a_permission(p_etablissement_id, 'crm_pipeline.lire') then
      raise exception 'Permission refusée : crm_pipeline.lire' using errcode = '42501';
    end if;
    select * into v_opportunite from public.crm_opportunites where id = v_opportunite_id and etablissement_id = p_etablissement_id;
    if v_opportunite.id is null then
      raise exception 'Opportunité introuvable dans cet établissement';
    end if;
    if nullif(p ->> 'contact_id', '') is null then
      p := p || jsonb_build_object('contact_id', v_opportunite.contact_id);
    elsif (p ->> 'contact_id')::uuid <> v_opportunite.contact_id then
      raise exception 'L''opportunité concerne un autre client';
    end if;
  end if;
  if v_statut not in ('prevu', 'confirme') then
    raise exception 'Statut invalide : utilisez Honoré, Annuler ou Absent';
  end if;
  if v_debut is null then
    raise exception 'Indiquez la date et l''heure';
  end if;
  if v_fin is null then
    v_fin := v_debut + make_interval(mins => greatest(5, least(1440, coalesce(nullif(p ->> 'duree_minutes', '')::integer, 60))));
  end if;
  if v_fin <= v_debut or v_fin > v_debut + interval '24 hours' then
    raise exception 'La fin doit suivre le début (24 h au plus)';
  end if;
  if resultat is null and v_debut < now() - interval '1 day' then
    raise exception 'Date passée : un rendez-vous se prend à l''avance';
  end if;
  if nullif(p ->> 'contact_id', '') is not null then
    select * into v_contact from public.contacts where id = (p ->> 'contact_id')::uuid and etablissement_id = p_etablissement_id and actif;
    if v_contact.id is null then
      raise exception 'Client introuvable';
    end if;
  elsif coalesce(btrim(p ->> 'nom_client'), '') = '' then
    raise exception 'Indiquez le client (fiche ou nom)';
  end if;
  -- Lien conservé : le client doit rester celui de l'opportunité.
  if v_opportunite_id is not null and v_opportunite.id is null
     and v_contact.id is distinct from (select contact_id from public.crm_opportunites where id = v_opportunite_id) then
    raise exception 'L''opportunité concerne un autre client';
  end if;
  if nullif(p ->> 'article_id', '') is not null then
    select * into v_article from public.articles where id = (p ->> 'article_id')::uuid and etablissement_id = p_etablissement_id;
    if v_article.id is null then
      raise exception 'Prestation introuvable';
    end if;
  end if;
  if v_responsable is not null then
    if not exists (select 1 from public.etablissement_membres where etablissement_id = p_etablissement_id and user_id = v_responsable and actif) then
      raise exception 'La personne choisie n''est pas membre de l''établissement';
    end if;
    -- Une personne ne tient qu'un rendez-vous à la fois (verrou par personne pour les prises simultanées).
    perform pg_advisory_xact_lock(hashtextextended('agenda:' || v_responsable::text, 0));
    select numero into conflit from public.agenda_rendez_vous
    where responsable = v_responsable and statut in ('prevu', 'confirme') and id is distinct from resultat
      and debut < v_fin and fin > v_debut
    limit 1;
    if conflit is not null then
      raise exception 'Cette personne a déjà le rendez-vous % sur ce créneau', conflit;
    end if;
  end if;
  v_titre := coalesce(nullif(btrim(p ->> 'titre'), ''), v_article.nom, 'Rendez-vous');
  if resultat is null then
    insert into public.agenda_rendez_vous (etablissement_id, numero, titre, contact_id, nom_client, telephone, responsable, article_id, prix,
      debut, fin, lieu, note, statut, cree_par, opportunite_id)
    values (p_etablissement_id, public.prochain_numero(p_etablissement_id, 'rendez_vous', 'RV-'), left(v_titre, 160), v_contact.id,
      coalesce(nullif(btrim(p ->> 'nom_client'), ''), v_contact.nom), coalesce(nullif(btrim(p ->> 'telephone'), ''), v_contact.telephone),
      v_responsable, v_article.id, coalesce(nullif(p ->> 'prix', '')::numeric, v_article.prix_vente), v_debut, v_fin,
      nullif(btrim(p ->> 'lieu'), ''), nullif(btrim(p ->> 'note'), ''), v_statut, auth.uid(), v_opportunite_id)
    returning id into resultat;
  else
    update public.agenda_rendez_vous set titre = left(v_titre, 160), contact_id = v_contact.id,
      nom_client = coalesce(nullif(btrim(p ->> 'nom_client'), ''), v_contact.nom), telephone = coalesce(nullif(btrim(p ->> 'telephone'), ''), v_contact.telephone),
      responsable = v_responsable, article_id = v_article.id, prix = coalesce(nullif(p ->> 'prix', '')::numeric, v_article.prix_vente),
      debut = v_debut, fin = v_fin, lieu = nullif(btrim(p ->> 'lieu'), ''), note = nullif(btrim(p ->> 'note'), ''), statut = v_statut,
      opportunite_id = v_opportunite_id
    where id = resultat;
  end if;
  if v_responsable is not null and v_responsable is distinct from auth.uid()
     and (existant.id is null or existant.responsable is distinct from v_responsable or existant.debut <> v_debut) then
    perform public.notifier(v_responsable, p_etablissement_id, 'agenda.rendez_vous', 'Rendez-vous : ' || left(v_titre, 100),
      coalesce(nullif(btrim(p ->> 'nom_client'), ''), v_contact.nom) || ' · ' || to_char(v_debut at time zone 'UTC', 'DD/MM HH24:MI') || ' (UTC)',
      'agenda/' || resultat);
  end if;
  return resultat;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Droits d'exécution
-- ---------------------------------------------------------------------------
do $$
declare signature text;
begin
  -- Fonctions publiques redéfinies : droits inchangés (réaffirmés).
  foreach signature in array array[
    'public.deplacer_opportunite(uuid, uuid, text)',
    'public.changer_statut_devis(uuid, text)',
    'public.convertir_devis(uuid)',
    'public.enregistrer_rendez_vous(uuid, jsonb)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
  -- Fonctions internes : jamais appelables directement.
  foreach signature in array array[
    'public.crm_appliquer_etape(uuid, uuid, text)',
    'public.crm_synchroniser_devis(uuid, text)',
    'public.recalculer_points_fidelite_vente(uuid)',
    'public.points_vente_fidelite()',
    'public.points_retour_fidelite()',
    'public.proteger_temps_projet()',
    'public.liberer_temps_facture_annulee()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', signature);
  end loop;
end
$$;
