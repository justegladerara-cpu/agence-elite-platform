-- Espace client, suite (lot P2, 2026-10-10) : rendez-vous en ligne, base d'aide publiée, nouveautés.
-- 1. Rendez-vous : si le réglage « rdv_en_ligne » est coché et le module Agenda actif, le client choisit un créneau
--    libre (jours et heures d'ouverture réglés, dans le fuseau de l'établissement, délai minimum, horizon) ; le
--    rendez-vous est créé « prévu », origine « espace_client », sans personne attribuée, et l'équipe est prévenue.
--    Le client voit tous ses rendez-vous (pris par lui ou par l'équipe), peut les confirmer, les annuler avant
--    l'heure ou les déplacer sur un autre créneau libre (redevient « prévu » : l'équipe reconfirme).
--    Un créneau est libre quand aucun rendez-vous prévu ou confirmé de l'établissement ne le chevauche : une seule
--    file de rendez-vous en ligne, jamais de double réservation.
-- 2. Base d'aide : un article d'aide du Support peut être « publié aux clients » ; il apparaît dans l'espace client.
-- 3. Nouveautés : l'espace reçoit la date de la visite précédente pour signaler ce qui est nouveau.
-- Aucun envoi d'e-mail ni de SMS : aucun canal d'envoi au client n'est branché.

-- ---------------------------------------------------------------------------
-- 1. Réglages, colonnes, types d'événements
-- ---------------------------------------------------------------------------
update public.modules set parametres_schema = '[
  {"cle": "duree_jours", "libelle": "Durée proposée pour un lien d''accès (jours)", "type": "nombre", "defaut": 30},
  {"cle": "depot_fichiers", "libelle": "Le client peut déposer des fichiers", "type": "booleen", "defaut": true},
  {"cle": "message_accueil", "libelle": "Message d''accueil affiché au client", "type": "texte", "defaut": ""},
  {"cle": "rdv_en_ligne", "libelle": "Le client peut prendre rendez-vous en ligne (module Agenda)", "type": "booleen", "defaut": false},
  {"cle": "rdv_duree_minutes", "libelle": "Durée d''un rendez-vous en ligne (minutes)", "type": "nombre", "defaut": 60},
  {"cle": "rdv_jours", "libelle": "Jours ouverts aux rendez-vous (1 = lundi … 7 = dimanche, séparés par des virgules)", "type": "texte", "defaut": "1,2,3,4,5"},
  {"cle": "rdv_heure_debut", "libelle": "Premier rendez-vous possible (HH:MM)", "type": "texte", "defaut": "09:00"},
  {"cle": "rdv_heure_fin", "libelle": "Fin du dernier rendez-vous (HH:MM)", "type": "texte", "defaut": "18:00"},
  {"cle": "rdv_delai_heures", "libelle": "Délai minimum avant un rendez-vous pris ou déplacé en ligne (heures)", "type": "nombre", "defaut": 24},
  {"cle": "rdv_horizon_jours", "libelle": "Rendez-vous proposés sur les prochains (jours)", "type": "nombre", "defaut": 21}
]'::jsonb where id = 'portail_client';

alter table public.agenda_rendez_vous add column origine text not null default 'equipe' check (origine in ('equipe', 'espace_client'));
alter table public.support_bibliotheque add column public boolean not null default false;
alter table public.support_bibliotheque add constraint support_bibliotheque_public_article check (not public or genre = 'article');

alter table public.portail_evenements drop constraint portail_evenements_type_check;
alter table public.portail_evenements add constraint portail_evenements_type_check check (type in ('ouverture', 'document_vu',
  'devis_accepte', 'devis_refuse', 'devis_modification', 'livrable_valide', 'livrable_a_corriger', 'message', 'depot',
  'rdv_demande', 'rdv_confirme', 'rdv_annule', 'rdv_deplace', 'aide_vue'));
alter table public.portail_evenements drop constraint portail_evenements_objet_type_check;
alter table public.portail_evenements add constraint portail_evenements_objet_type_check
  check (objet_type in ('document_vente', 'projet', 'projet_livrable', 'agenda_rendez_vous', 'support_bibliotheque'));

-- ---------------------------------------------------------------------------
-- 2. Base d'aide : publier un article aux clients
-- ---------------------------------------------------------------------------
-- p : { id?, genre, titre, texte, categorie?, actif?, public? }
create or replace function public.enregistrer_element_support(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p ->> 'id', '')::uuid;
  v_genre text := p ->> 'genre';
begin
  perform public.exiger_permission(p_etablissement_id, 'support_tickets.gerer');
  if coalesce(btrim(p ->> 'titre'), '') = '' or coalesce(btrim(p ->> 'texte'), '') = '' then
    raise exception 'Le titre et le texte sont obligatoires';
  end if;
  if resultat is null then
    if v_genre is null or v_genre not in ('reponse', 'article') then
      raise exception 'Choisissez « réponse type » ou « article d''aide »';
    end if;
    if v_genre <> 'article' and coalesce((p ->> 'public')::boolean, false) then
      raise exception 'Seul un article d''aide se publie aux clients';
    end if;
    insert into public.support_bibliotheque (etablissement_id, genre, titre, texte, categorie, actif, public, cree_par)
    values (p_etablissement_id, v_genre, left(btrim(p ->> 'titre'), 160), left(btrim(p ->> 'texte'), 8000),
      nullif(left(btrim(coalesce(p ->> 'categorie', '')), 80), ''), coalesce((p ->> 'actif')::boolean, true),
      coalesce((p ->> 'public')::boolean, false), auth.uid())
    returning id into resultat;
  else
    select genre into v_genre from public.support_bibliotheque where id = resultat and etablissement_id = p_etablissement_id;
    if v_genre is null then
      raise exception 'Élément introuvable';
    end if;
    if v_genre <> 'article' and coalesce((p ->> 'public')::boolean, false) then
      raise exception 'Seul un article d''aide se publie aux clients';
    end if;
    update public.support_bibliotheque set titre = left(btrim(p ->> 'titre'), 160), texte = left(btrim(p ->> 'texte'), 8000),
      categorie = nullif(left(btrim(coalesce(p ->> 'categorie', '')), 80), ''), actif = coalesce((p ->> 'actif')::boolean, actif),
      public = coalesce((p ->> 'public')::boolean, public)
    where id = resultat and etablissement_id = p_etablissement_id;
  end if;
  return resultat;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Rendez-vous en ligne (interne)
-- ---------------------------------------------------------------------------
-- Réglages lus avec des bornes : un réglage mal saisi retombe sur sa valeur par défaut, jamais d'erreur côté client.
create function public.portail_rdv_reglages(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_duree integer;
  v_delai integer;
  v_horizon integer;
  v_jours integer[];
  v_debut text := public.parametre_module(p_etablissement_id, 'portail_client', 'rdv_heure_debut') #>> '{}';
  v_fin text := public.parametre_module(p_etablissement_id, 'portail_client', 'rdv_heure_fin') #>> '{}';
  v_texte text := coalesce(public.parametre_module(p_etablissement_id, 'portail_client', 'rdv_jours') #>> '{}', '');
begin
  begin
    v_duree := (public.parametre_module(p_etablissement_id, 'portail_client', 'rdv_duree_minutes') #>> '{}')::numeric::integer;
  exception when others then v_duree := null;
  end;
  begin
    v_delai := (public.parametre_module(p_etablissement_id, 'portail_client', 'rdv_delai_heures') #>> '{}')::numeric::integer;
  exception when others then v_delai := null;
  end;
  begin
    v_horizon := (public.parametre_module(p_etablissement_id, 'portail_client', 'rdv_horizon_jours') #>> '{}')::numeric::integer;
  exception when others then v_horizon := null;
  end;
  select array_agg(distinct j::integer order by j::integer) into v_jours
  from regexp_split_to_table(v_texte, '\s*,\s*') j where j ~ '^[1-7]$';
  if v_debut is null or v_debut !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then v_debut := '09:00'; end if;
  if v_fin is null or v_fin !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$|^24:00$' then v_fin := '18:00'; end if;
  return jsonb_build_object(
    'actif', coalesce((public.parametre_module(p_etablissement_id, 'portail_client', 'rdv_en_ligne') #>> '{}')::boolean, false)
             and public.module_actif(p_etablissement_id, 'agenda'),
    'duree', case when v_duree between 15 and 480 then v_duree else 60 end,
    'delai', case when v_delai between 0 and 720 then v_delai else 24 end,
    'horizon', case when v_horizon between 1 and 90 then v_horizon else 21 end,
    'jours', to_jsonb(coalesce(v_jours, array[1, 2, 3, 4, 5])),
    'debut', v_debut,
    'fin', v_fin,
    'fuseau', coalesce((select fuseau from public.etablissements where id = p_etablissement_id), 'UTC'));
end
$$;

-- Créneaux libres (début de chaque créneau), 300 au plus ; p_sauf : rendez-vous à ignorer (celui que l'on déplace).
create function public.portail_creneaux(p_etablissement_id uuid, p_sauf uuid default null)
returns setof timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r jsonb := public.portail_rdv_reglages(p_etablissement_id);
  v_tz text := r ->> 'fuseau';
  v_duree interval := make_interval(mins => (r ->> 'duree')::integer);
  v_aujourdhui date := (now() at time zone v_tz)::date;
begin
  if not (r ->> 'actif')::boolean then
    return;
  end if;
  return query
  select c.debut from (
    select ((j::date + make_interval(mins => h)) at time zone v_tz) as debut
    from generate_series(v_aujourdhui, v_aujourdhui + (r ->> 'horizon')::integer, interval '1 day') j
    cross join lateral generate_series((extract(epoch from (r ->> 'debut')::interval) / 60)::integer,
                                       (extract(epoch from (r ->> 'fin')::interval) / 60)::integer - (r ->> 'duree')::integer,
                                       (r ->> 'duree')::integer) h
    where extract(isodow from j)::integer in (select jsonb_array_elements_text(r -> 'jours')::integer)
  ) c
  where c.debut >= now() + make_interval(hours => (r ->> 'delai')::integer)
    and not exists (select 1 from public.agenda_rendez_vous x
                    where x.etablissement_id = p_etablissement_id and x.statut in ('prevu', 'confirme') and x.id is distinct from p_sauf
                      and x.debut < c.debut + v_duree and x.fin > c.debut)
  order by c.debut
  limit 300;
end
$$;

-- Rendez-vous du client, verrouillé ; seulement ceux de ce contact (interne).
create function public.portail_rdv_du_client(a public.portail_acces, p_rdv_id uuid)
returns public.agenda_rendez_vous
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.agenda_rendez_vous%rowtype;
begin
  if not public.module_actif(a.etablissement_id, 'agenda') then
    raise exception 'Rendez-vous introuvable';
  end if;
  select * into r from public.agenda_rendez_vous
  where id = p_rdv_id and etablissement_id = a.etablissement_id and contact_id = a.contact_id for update;
  if r.id is null then
    raise exception 'Rendez-vous introuvable';
  end if;
  if r.statut not in ('prevu', 'confirme') then
    raise exception 'Ce rendez-vous est clos';
  end if;
  if r.debut <= now() then
    raise exception 'Ce rendez-vous a déjà commencé : contactez-nous directement';
  end if;
  return r;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Côté client (sans compte, par le jeton du lien)
-- ---------------------------------------------------------------------------
-- Ouverture : comme au lot P, avec la date de la visite précédente, le fuseau et les rubriques disponibles.
create or replace function public.portail_ouvrir(p_jeton text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.portail_acces%rowtype := public.portail_acces_valide(p_jeton);
  k public.contacts%rowtype;
  v_facturation boolean := public.module_actif(a.etablissement_id, 'facturation');
  v_projets boolean := public.module_actif(a.etablissement_id, 'projets');
  v_precedente timestamptz := a.derniere_ouverture;
begin
  select * into k from public.contacts where id = a.contact_id;
  if a.derniere_ouverture is null or a.derniere_ouverture < now() - interval '1 hour' then
    perform public.portail_tracer(a, 'ouverture');
  end if;
  update public.portail_acces set ouvertures = ouvertures + 1, derniere_ouverture = now() where id = a.id;
  return jsonb_build_object(
    'emetteur', (select jsonb_build_object(
        'nom', coalesce(nullif(i.nom_commercial, ''), e.nom), 'logo_url', i.logo_url, 'couleur', i.couleur_principale,
        'telephone', i.telephone, 'email', i.email, 'adresse', i.adresse, 'devise', e.devise)
      from public.etablissements e left join public.etablissement_identite i on i.etablissement_id = e.id where e.id = a.etablissement_id),
    'message_accueil', nullif(public.parametre_module(a.etablissement_id, 'portail_client', 'message_accueil') #>> '{}', ''),
    'depot_fichiers', coalesce((public.parametre_module(a.etablissement_id, 'portail_client', 'depot_fichiers') #>> '{}')::boolean, true),
    'contact', jsonb_build_object('nom', k.nom, 'societe', k.societe),
    'expire_le', a.expire_le,
    'precedente_ouverture', v_precedente,
    'fuseau', (select e.fuseau from public.etablissements e where e.id = a.etablissement_id),
    'agenda', public.module_actif(a.etablissement_id, 'agenda'),
    'aide', public.module_actif(a.etablissement_id, 'support_tickets')
            and exists (select 1 from public.support_bibliotheque b where b.etablissement_id = a.etablissement_id and b.genre = 'article' and b.actif and b.public),
    'documents', case when v_facturation then (
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', d.id, 'type', d.type, 'numero', d.numero, 'statut', d.statut, 'date_document', d.date_document, 'echeance', d.echeance,
          'objet', d.objet, 'notes', d.notes, 'conditions', d.conditions, 'version', d.version,
          'total_ht', d.total_ht, 'total_tva', d.total_tva, 'total_ttc', d.total_ttc,
          'reste', case when d.type = 'facture' and v.statut = 'validee' then v.total - v.montant_paye end,
          'vu_le', (select min(x.cree_le) from public.portail_evenements x where x.contact_id = a.contact_id and x.type = 'document_vu' and x.objet_id = d.id),
          'reponse', (select jsonb_build_object('type', x.type, 'nom', x.nom_signataire, 'le', x.cree_le) from public.portail_evenements x
                      where x.contact_id = a.contact_id and x.objet_id = d.id and x.type in ('devis_accepte', 'devis_refuse', 'devis_modification')
                      order by x.cree_le desc limit 1),
          'lignes', (select coalesce(jsonb_agg(jsonb_build_object('libelle', l.libelle, 'description', l.description, 'quantite', l.quantite,
                       'unite', l.unite, 'prix_unitaire', l.prix_unitaire, 'remise', l.remise, 'taux_tva', l.taux_tva, 'total_ttc', l.total_ttc,
                       'optionnelle', l.optionnelle, 'retenue', l.retenue) order by l.ordre), '[]'::jsonb)
                     from public.lignes_document_vente l where l.document_id = d.id),
          'pieces', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nom', p.nom, 'taille', p.taille) order by p.ajoute_le), '[]'::jsonb)
                     from public.pieces_jointes p where p.objet_type = 'document_vente' and p.objet_id = d.id and p.statut = 'active' and not p.confidentiel)
        ) order by d.date_document desc, d.numero desc), '[]'::jsonb)
      from (select * from public.documents_vente x
            where x.etablissement_id = a.etablissement_id and x.contact_id = a.contact_id
              and ((x.type = 'devis' and x.statut in ('envoye', 'accepte', 'refuse', 'converti')) or (x.type in ('facture', 'avoir') and x.statut = 'emise'))
            order by x.date_document desc limit 100) d
      left join public.ventes v on v.id = d.vente_id) end,
    'projets', case when v_projets then (
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', p.id, 'numero', p.numero, 'nom', p.nom, 'statut', p.statut, 'date_debut', p.date_debut, 'date_fin_prevue', p.date_fin_prevue,
          'avancement', (select case when count(*) filter (where t.statut <> 'annulee') = 0 then 0
                                     else round(count(*) filter (where t.statut = 'terminee') * 100.0 / count(*) filter (where t.statut <> 'annulee')) end
                         from public.projet_taches t where t.projet_id = p.id),
          'taches', (select coalesce(jsonb_agg(jsonb_build_object('titre', t.titre, 'statut', t.statut, 'echeance', t.echeance)
                       order by t.statut = 'terminee', t.echeance nulls last, t.ordre), '[]'::jsonb)
                     from public.projet_taches t where t.projet_id = p.id and t.statut <> 'annulee'),
          'livrables', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'titre', l.titre, 'description', l.description, 'statut', l.statut,
                          'version', l.version,
                          'note', (select lv.note from public.projet_livrable_versions lv where lv.livrable_id = l.id and lv.version = l.version))
                        order by l.cree_le), '[]'::jsonb)
                        from public.projet_livrables l where l.projet_id = p.id and l.statut in ('soumis', 'valide', 'a_corriger'))
        ) order by p.statut = 'termine', p.cree_le desc), '[]'::jsonb)
      from public.projets p
      where p.etablissement_id = a.etablissement_id and p.contact_id = a.contact_id and p.partage_client and p.statut <> 'annule') end,
    'messages', (select coalesce(jsonb_agg(jsonb_build_object('auteur', m.auteur, 'texte', m.texte, 'cree_le', m.cree_le,
                   'objet_type', m.objet_type, 'objet_id', m.objet_id) order by m.cree_le), '[]'::jsonb)
                 from (select * from public.portail_messages x where x.contact_id = a.contact_id order by x.cree_le desc limit 100) m),
    'depots', (select coalesce(jsonb_agg(jsonb_build_object('nom', d.nom, 'taille', d.taille, 'cree_le', d.cree_le, 'statut', d.statut)
                 order by d.cree_le desc), '[]'::jsonb)
               from (select * from public.portail_depots x where x.contact_id = a.contact_id order by x.cree_le desc limit 50) d)
  );
end
$$;


-- Rendez-vous du client (pris en ligne ou par l'équipe) et créneaux libres si la prise en ligne est ouverte.
create function public.portail_agenda(p_jeton text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.portail_acces%rowtype := public.portail_acces_valide(p_jeton);
  r jsonb := public.portail_rdv_reglages(a.etablissement_id);
begin
  if not public.module_actif(a.etablissement_id, 'agenda') then
    return jsonb_build_object('agenda', false, 'en_ligne', false, 'rendez_vous', '[]'::jsonb, 'creneaux', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'agenda', true,
    'en_ligne', (r ->> 'actif')::boolean,
    'duree', (r ->> 'duree')::integer,
    'delai', (r ->> 'delai')::integer,
    'fuseau', r ->> 'fuseau',
    'rendez_vous', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'numero', x.numero, 'titre', x.titre, 'debut', x.debut, 'fin', x.fin,
                      'lieu', x.lieu, 'statut', x.statut, 'origine', x.origine,
                      'modifiable', x.statut in ('prevu', 'confirme') and x.debut > now())
                    order by x.debut desc), '[]'::jsonb)
                    from (select * from public.agenda_rendez_vous y
                          where y.etablissement_id = a.etablissement_id and y.contact_id = a.contact_id and y.debut > now() - interval '90 days'
                          order by y.debut desc limit 50) x),
    'creneaux', (select coalesce(jsonb_agg(c order by c), '[]'::jsonb) from public.portail_creneaux(a.etablissement_id) c));
end
$$;

-- Prendre un rendez-vous sur un créneau libre. Renvoie l'identifiant du rendez-vous.
create function public.portail_demander_rdv(p_jeton text, p_debut timestamptz, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.portail_acces%rowtype := public.portail_acces_valide(p_jeton);
  r jsonb := public.portail_rdv_reglages(a.etablissement_id);
  k public.contacts%rowtype;
  v_id uuid;
begin
  if not (r ->> 'actif')::boolean then
    raise exception 'La prise de rendez-vous en ligne n''est pas ouverte : contactez-nous directement';
  end if;
  if length(coalesce(p_note, '')) > 1000 then
    raise exception 'Message trop long (1000 caractères au plus)';
  end if;
  perform public.portail_limiter(a.id, 'rdv_demande', 5);
  -- Une prise à la fois par établissement : deux clients ne peuvent pas obtenir le même créneau.
  perform pg_advisory_xact_lock(hashtextextended('portail-rdv:' || a.etablissement_id::text, 0));
  if p_debut is null or not exists (select 1 from public.portail_creneaux(a.etablissement_id) c where c = p_debut) then
    raise exception 'Ce créneau n''est plus disponible : choisissez-en un autre';
  end if;
  select * into k from public.contacts where id = a.contact_id;
  insert into public.agenda_rendez_vous (etablissement_id, numero, titre, contact_id, nom_client, telephone, debut, fin, note, statut, origine)
  values (a.etablissement_id, public.prochain_numero(a.etablissement_id, 'rendez_vous', 'RV-'), 'Rendez-vous demandé en ligne', k.id,
    left(coalesce(nullif(k.societe, ''), k.nom), 160), k.telephone, p_debut, p_debut + make_interval(mins => (r ->> 'duree')::integer),
    nullif(btrim(p_note), ''), 'prevu', 'espace_client')
  returning id into v_id;
  perform public.portail_tracer(a, 'rdv_demande', 'agenda_rendez_vous', v_id, null, p_note);
  perform public.notifier_permission(a.etablissement_id, 'agenda.gerer', 'portail.rdv',
    'Rendez-vous pris en ligne : ' || left(coalesce(nullif(k.societe, ''), k.nom), 80),
    to_char(p_debut at time zone (r ->> 'fuseau'), 'DD/MM/YYYY HH24:MI') || ' (' || (r ->> 'fuseau') || ')', 'agenda/' || v_id);
  return v_id;
end
$$;

-- Confirmer sa présence à un rendez-vous prévu.
create function public.portail_confirmer_rdv(p_jeton text, p_rdv_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.portail_acces%rowtype := public.portail_acces_valide(p_jeton);
  r public.agenda_rendez_vous%rowtype := public.portail_rdv_du_client(a, p_rdv_id);
begin
  if r.statut = 'confirme' then
    return;
  end if;
  perform public.portail_limiter(a.id, 'rdv_confirme', 20);
  update public.agenda_rendez_vous set statut = 'confirme' where id = r.id;
  perform public.portail_tracer(a, 'rdv_confirme', 'agenda_rendez_vous', r.id);
  perform public.notifier_permission(a.etablissement_id, 'agenda.gerer', 'portail.rdv', 'Rendez-vous confirmé par le client : ' || r.numero,
    left(r.titre, 120), 'agenda/' || r.id);
end
$$;

-- Annuler un rendez-vous avant son heure (motif facultatif).
create function public.portail_annuler_rdv(p_jeton text, p_rdv_id uuid, p_motif text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.portail_acces%rowtype := public.portail_acces_valide(p_jeton);
  r public.agenda_rendez_vous%rowtype := public.portail_rdv_du_client(a, p_rdv_id);
begin
  if length(coalesce(p_motif, '')) > 500 then
    raise exception 'Motif trop long (500 caractères au plus)';
  end if;
  perform public.portail_limiter(a.id, 'rdv_annule', 10);
  update public.agenda_rendez_vous set statut = 'annule',
    motif = 'Annulé par le client depuis son espace' || coalesce(' : ' || nullif(btrim(p_motif), ''), '')
  where id = r.id;
  perform public.portail_tracer(a, 'rdv_annule', 'agenda_rendez_vous', r.id, null, p_motif);
  perform public.notifier_permission(a.etablissement_id, 'agenda.gerer', 'portail.rdv', 'Rendez-vous annulé par le client : ' || r.numero,
    left(r.titre, 120), 'agenda/' || r.id);
end
$$;

-- Déplacer un rendez-vous sur un autre créneau libre, en respectant le délai minimum. Il redevient « prévu ».
create function public.portail_deplacer_rdv(p_jeton text, p_rdv_id uuid, p_debut timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.portail_acces%rowtype := public.portail_acces_valide(p_jeton);
  r public.agenda_rendez_vous%rowtype := public.portail_rdv_du_client(a, p_rdv_id);
  g jsonb := public.portail_rdv_reglages(a.etablissement_id);
  v_fin timestamptz;
begin
  if not (g ->> 'actif')::boolean then
    raise exception 'Le report en ligne n''est pas ouvert : contactez-nous directement';
  end if;
  if r.debut < now() + make_interval(hours => (g ->> 'delai')::integer) then
    raise exception 'Ce rendez-vous est trop proche pour être déplacé en ligne : contactez-nous directement';
  end if;
  perform public.portail_limiter(a.id, 'rdv_deplace', 5);
  perform pg_advisory_xact_lock(hashtextextended('portail-rdv:' || a.etablissement_id::text, 0));
  if p_debut is null or not exists (select 1 from public.portail_creneaux(a.etablissement_id, r.id) c where c = p_debut) then
    raise exception 'Ce créneau n''est plus disponible : choisissez-en un autre';
  end if;
  v_fin := p_debut + (r.fin - r.debut);
  if exists (select 1 from public.agenda_rendez_vous x where x.etablissement_id = a.etablissement_id and x.id <> r.id
             and x.statut in ('prevu', 'confirme') and x.debut < v_fin and x.fin > p_debut) then
    raise exception 'Ce créneau n''est plus disponible : choisissez-en un autre';
  end if;
  update public.agenda_rendez_vous set debut = p_debut, fin = v_fin, statut = 'prevu' where id = r.id;
  perform public.portail_tracer(a, 'rdv_deplace', 'agenda_rendez_vous', r.id, null,
    'Ancien horaire : ' || to_char(r.debut at time zone (g ->> 'fuseau'), 'DD/MM/YYYY HH24:MI'));
  perform public.notifier_permission(a.etablissement_id, 'agenda.gerer', 'portail.rdv', 'Rendez-vous déplacé par le client : ' || r.numero,
    to_char(r.debut at time zone (g ->> 'fuseau'), 'DD/MM HH24:MI') || ' → ' || to_char(p_debut at time zone (g ->> 'fuseau'), 'DD/MM/YYYY HH24:MI')
    || ' (' || (g ->> 'fuseau') || ')', 'agenda/' || r.id);
end
$$;

-- Articles d'aide publiés aux clients (module Support actif).
create function public.portail_aide(p_jeton text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.portail_acces%rowtype := public.portail_acces_valide(p_jeton);
begin
  if not public.module_actif(a.etablissement_id, 'support_tickets') then
    return '[]'::jsonb;
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'titre', b.titre, 'texte', b.texte, 'categorie', b.categorie)
            order by b.categorie nulls last, b.titre), '[]'::jsonb)
          from public.support_bibliotheque b
          where b.etablissement_id = a.etablissement_id and b.genre = 'article' and b.actif and b.public);
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Droits d'exécution
-- ---------------------------------------------------------------------------
revoke execute on function public.portail_rdv_reglages(uuid) from public, anon, authenticated;
revoke execute on function public.portail_creneaux(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.portail_rdv_du_client(public.portail_acces, uuid) from public, anon, authenticated;
do $$
declare
  f text;
begin
  foreach f in array array['portail_agenda(text)', 'portail_demander_rdv(text, timestamptz, text)', 'portail_confirmer_rdv(text, uuid)',
                            'portail_annuler_rdv(text, uuid, text)', 'portail_deplacer_rdv(text, uuid, timestamptz)', 'portail_aide(text)'] loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end
$$;

notify pgrst, 'reload schema';
