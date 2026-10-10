-- Lot H2 (2026-10-10), suite de la demande des 150 fonctions :
-- 1. Propositions adaptées au besoin (ligne 8) : modèles de proposition du CRM (lignes de devis types, mots du besoin).
--    Sur une opportunité, les modèles sont classés selon les mots trouvés dans le besoin (titre, notes, réponses de
--    qualification), le budget du client et les ventes déjà gagnées avec ce modèle ; le devis se crée en un geste.
-- 2. Parrainage (ligne 39, module Fidélité) : un client recommande une personne (saisi par l'équipe ou depuis l'espace
--    client si le réglage l'autorise). Le filleul devient « client » à sa première vente validée ; la récompense du
--    parrain (texte annoncé, points de fidélité facultatifs) est accordée par un responsable et tracée.
-- 3. Bilan périodique de collaboration (ligne 40, Espace client) : bilan chiffré d'une période (factures, paiements,
--    projets, livrables, tickets, rendez-vous), synthèse et prochaines actions écrites par l'équipe, publié dans
--    l'espace du client ; rappel des clients sans bilan récent selon la périodicité réglée.
-- 4. Préavis de maintenance planifiée (ligne 119, Support) : l'équipe annonce une interruption (début, fin, impact) ;
--    l'annonce apparaît dans l'espace client et sur la page Support, avec le respect du préavis réglé.
-- Aucun envoi d'e-mail ni de SMS : aucun canal d'envoi au client n'est branché. Aucune ligne existante n'est modifiée.

-- ---------------------------------------------------------------------------
-- 1. Réglages et types d'événements
-- ---------------------------------------------------------------------------
update public.modules set parametres_schema = coalesce(parametres_schema, '[]'::jsonb) || '[
  {"cle": "parrainage_recompense", "libelle": "Récompense annoncée au parrain quand son filleul devient client (texte)", "type": "texte", "defaut": ""},
  {"cle": "parrainage_points", "libelle": "Points de fidélité offerts au parrain avec la récompense (0 = aucun)", "type": "nombre", "defaut": 0},
  {"cle": "parrainage_espace_client", "libelle": "Vos clients peuvent recommander quelqu''un depuis leur espace client", "type": "booleen", "defaut": false}
]'::jsonb where id = 'fidelite';

update public.modules set parametres_schema = coalesce(parametres_schema, '[]'::jsonb) || '[
  {"cle": "bilan_periodicite_mois", "libelle": "Un bilan de collaboration par client tous les (mois, 0 = pas de rappel)", "type": "nombre", "defaut": 3}
]'::jsonb where id = 'portail_client';

update public.modules set parametres_schema = coalesce(parametres_schema, '[]'::jsonb) || '[
  {"cle": "maintenance_preavis_heures", "libelle": "Préavis minimum avant une maintenance planifiée (heures)", "type": "nombre", "defaut": 48}
]'::jsonb where id = 'support_tickets';

alter table public.portail_evenements drop constraint portail_evenements_type_check;
alter table public.portail_evenements add constraint portail_evenements_type_check check (type in ('ouverture', 'document_vu',
  'devis_accepte', 'devis_refuse', 'devis_modification', 'livrable_valide', 'livrable_a_corriger', 'message', 'depot',
  'rdv_demande', 'rdv_confirme', 'rdv_annule', 'rdv_deplace', 'aide_vue', 'bilan_vu', 'recommandation'));
alter table public.portail_evenements drop constraint portail_evenements_objet_type_check;
alter table public.portail_evenements add constraint portail_evenements_objet_type_check
  check (objet_type in ('document_vente', 'projet', 'projet_livrable', 'agenda_rendez_vous', 'support_bibliotheque', 'bilan_client', 'parrainage'));

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
-- Lignes : [{ article_id?, libelle, description?, quantite, unite?, prix_unitaire, taux_tva?, optionnelle? }]
create table public.crm_modeles_proposition (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  nom text not null check (length(btrim(nom)) between 2 and 120),
  description text check (description is null or length(description) <= 1000),
  mots_cles text[] not null default '{}' check (cardinality(mots_cles) <= 30),
  lignes jsonb not null check (jsonb_typeof(lignes) = 'array' and jsonb_array_length(lignes) between 1 and 50),
  actif boolean not null default true,
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (etablissement_id, nom),
  unique (id, etablissement_id)
);
create index crm_modeles_proposition_etab_idx on public.crm_modeles_proposition(etablissement_id, actif);
alter table public.crm_opportunites add column modele_proposition_id uuid;
alter table public.crm_opportunites add constraint crm_opportunites_modele_proposition_fk
  foreign key (modele_proposition_id, etablissement_id) references public.crm_modeles_proposition(id, etablissement_id) on delete restrict;
create index crm_opportunites_modele_idx on public.crm_opportunites(modele_proposition_id) where modele_proposition_id is not null;

-- contact_id : le parrain ; filleul_id : la personne recommandée.
create table public.parrainages (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  filleul_id uuid not null references public.contacts(id) on delete restrict,
  origine text not null default 'equipe' check (origine in ('equipe', 'espace_client')),
  statut text not null default 'en_attente' check (statut in ('en_attente', 'converti', 'recompense', 'annule')),
  note text check (note is null or length(note) <= 1000),
  vente_id uuid references public.ventes(id) on delete restrict,
  converti_le timestamptz,
  recompense text check (recompense is null or length(recompense) <= 300),
  points integer check (points is null or points > 0),
  mouvement_id uuid references public.fidelite_mouvements(id) on delete restrict,
  recompense_le timestamptz,
  recompense_par uuid references auth.users(id) on delete restrict,
  motif_annulation text check (motif_annulation is null or length(motif_annulation) <= 500),
  annule_le timestamptz,
  cree_par uuid references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  check (contact_id <> filleul_id),
  check ((origine = 'equipe') = (cree_par is not null)),
  check (statut not in ('converti', 'recompense') or converti_le is not null),
  check ((statut = 'recompense') = (recompense_le is not null)),
  check ((statut = 'annule') = (annule_le is not null)),
  check (statut <> 'annule' or btrim(coalesce(motif_annulation, '')) <> ''),
  check ((points is null) = (mouvement_id is null))
);
-- Une personne n'est filleule qu'une fois par établissement (hors parrainage annulé).
create unique index parrainages_filleul_unique on public.parrainages(etablissement_id, filleul_id) where statut <> 'annule';
create index parrainages_parrain_idx on public.parrainages(contact_id, cree_le desc);
create index parrainages_etab_idx on public.parrainages(etablissement_id, statut);

create table public.bilans_client (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  numero text not null,
  titre text not null check (length(btrim(titre)) between 2 and 160),
  du date not null,
  au date not null,
  chiffres jsonb not null default '{}'::jsonb,
  synthese text check (synthese is null or length(synthese) <= 4000),
  prochaines_actions text check (prochaines_actions is null or length(prochaines_actions) <= 4000),
  statut text not null default 'brouillon' check (statut in ('brouillon', 'publie', 'retire')),
  publie_le timestamptz,
  publie_par uuid references auth.users(id) on delete restrict,
  vu_le timestamptz,
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (etablissement_id, numero),
  check (au >= du and au <= du + 731),
  check ((statut = 'brouillon') = (publie_le is null)),
  check (vu_le is null or publie_le is not null)
);
create index bilans_client_contact_idx on public.bilans_client(contact_id, au desc);
create index bilans_client_etab_idx on public.bilans_client(etablissement_id, statut);

create table public.support_maintenances (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  titre text not null check (length(btrim(titre)) between 3 and 160),
  description text check (description is null or length(description) <= 2000),
  debut timestamptz not null,
  fin timestamptz not null,
  impact text not null default 'interruption' check (impact in ('interruption', 'partiel', 'ralentissement')),
  statut text not null default 'planifiee' check (statut in ('planifiee', 'annulee')),
  annonce_le timestamptz not null default now(),
  motif_annulation text check (motif_annulation is null or length(motif_annulation) <= 500),
  annulee_le timestamptz,
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  check (fin > debut and fin <= debut + interval '14 days'),
  check ((statut = 'annulee') = (annulee_le is not null)),
  check (statut <> 'annulee' or btrim(coalesce(motif_annulation, '')) <> '')
);
create index support_maintenances_etab_idx on public.support_maintenances(etablissement_id, fin desc);

do $$
declare
  t text;
  p text;
begin
  foreach t in array array['crm_modeles_proposition', 'parrainages', 'bilans_client', 'support_maintenances'] loop
    p := case t when 'crm_modeles_proposition' then 'crm_pipeline.lire' when 'parrainages' then 'fidelite.lire'
                when 'bilans_client' then 'portail_client.lire' else 'support_tickets.lire' end;
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy lecture on public.%I for select to authenticated using (public.lecture_autorisee(etablissement_id, %L))', t, p);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
    execute format('create trigger %I_etab before update on public.%I for each row execute function public.verrouiller_etablissement_id()', t, t);
    execute format('create trigger %I_modifie_le before update on public.%I for each row execute function public.fixer_modifie_le()', t, t);
    execute format('create trigger %I_sans_suppression before delete on public.%I for each row execute function public.refuser_suppression()', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.journaliser_modification()', t, t);
  end loop;
end
$$;

-- Données personnelles (lot F) : textes libres effacés à l'anonymisation du contact (parrain ou client du bilan).
create or replace function public.champs_personnels(p_table text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['nom_client', 'destinataire', 'telephone', 'email', 'adresse_livraison', 'coordonnee'] || case p_table
    when 'contact_interlocuteurs' then array['nom', 'fonction', 'notes']
    when 'mkt_destinataires' then array['nom']
    when 'liv_livraisons' then array['adresse', 'instructions']
    when 'contacts' then array['nom', 'societe', 'adresse', 'notes', 'identifiant_fiscal']
    when 'portail_messages' then array['texte']
    when 'portail_evenements' then array['nom_signataire', 'note']
    when 'portail_depots' then array['nom', 'note', 'contenu']
    when 'portail_acces' then array['libelle']
    when 'parrainages' then array['note']
    when 'bilans_client' then array['synthese', 'prochaines_actions']
    else array[]::text[] end
$$;

-- ---------------------------------------------------------------------------
-- 3. Modèles de proposition (CRM)
-- ---------------------------------------------------------------------------
-- Texte ramené à des mots simples (minuscules, sans accents latins, sans ponctuation), pour comparer un besoin à des mots-clés.
create function public.crm_mots(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(lower(translate(coalesce(p, ''),
    'ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖòóôõöÙÚÛÜùúûüÝýÿŒœÆæ',
    'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOoooooUUUUuuuuYyyOoAa')), '[^[:alnum:]]+', ' ', 'g'))
$$;

-- Montant hors options d'un modèle (quantité × prix ; le prix d'un article sans prix écrit est son prix de vente).
create function public.montant_modele_proposition(p_etablissement_id uuid, p_lignes jsonb)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(round(sum(coalesce(nullif(l ->> 'quantite', '')::numeric, 1)
                            * coalesce(nullif(l ->> 'prix_unitaire', '')::numeric, a.prix_vente, 0)), 2), 0)
  from jsonb_array_elements(p_lignes) l
  left join public.articles a on a.id = nullif(l ->> 'article_id', '')::uuid and a.etablissement_id = p_etablissement_id
  where not coalesce((l ->> 'optionnelle')::boolean, false)
$$;

-- Crée ou modifie un modèle. p : { id?, nom, description?, mots_cles (liste ou texte séparé par des virgules), lignes, actif? }
create function public.enregistrer_modele_proposition(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p ->> 'id', '')::uuid;
  v_lignes jsonb := '[]'::jsonb;
  v_mots text[];
  l jsonb;
  v_rang integer := 0;
  v_quantite numeric;
  v_prix numeric;
  v_taux numeric;
begin
  perform public.exiger_permission(p_etablissement_id, 'crm_pipeline.administrer');
  if length(coalesce(btrim(p ->> 'nom'), '')) < 2 then
    raise exception 'Donnez un nom au modèle';
  end if;
  if jsonb_typeof(p -> 'lignes') is distinct from 'array' or jsonb_array_length(p -> 'lignes') = 0 then
    raise exception 'Ajoutez au moins une ligne au modèle';
  end if;
  if jsonb_array_length(p -> 'lignes') > 50 then
    raise exception 'Pas plus de 50 lignes par modèle';
  end if;
  for l in select * from jsonb_array_elements(p -> 'lignes') loop
    v_rang := v_rang + 1;
    if jsonb_typeof(l) <> 'object' then
      raise exception 'Ligne % invalide', v_rang;
    end if;
    if nullif(l ->> 'article_id', '') is not null
       and not exists (select 1 from public.articles where id = (l ->> 'article_id')::uuid and etablissement_id = p_etablissement_id) then
      raise exception 'Article inconnu dans cet établissement (ligne %)', v_rang;
    end if;
    if nullif(l ->> 'article_id', '') is null and length(coalesce(btrim(l ->> 'libelle'), '')) = 0 then
      raise exception 'Désignation manquante (ligne %)', v_rang;
    end if;
    v_quantite := coalesce(nullif(l ->> 'quantite', '')::numeric, 1);
    v_prix := nullif(l ->> 'prix_unitaire', '')::numeric;
    v_taux := nullif(l ->> 'taux_tva', '')::numeric;
    if v_quantite = 'NaN'::numeric or v_quantite <= 0 or v_quantite > 1000000 then
      raise exception 'Quantité invalide (ligne %)', v_rang;
    end if;
    if v_prix is null and nullif(l ->> 'article_id', '') is null then
      raise exception 'Prix manquant (ligne %)', v_rang;
    end if;
    if v_prix is not null and (v_prix = 'NaN'::numeric or v_prix < 0) then
      raise exception 'Prix invalide (ligne %)', v_rang;
    end if;
    if v_taux is not null and (v_taux = 'NaN'::numeric or v_taux < 0 or v_taux > 100) then
      raise exception 'Taux de TVA invalide (ligne %)', v_rang;
    end if;
    v_lignes := v_lignes || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'article_id', nullif(l ->> 'article_id', ''),
      'libelle', left(nullif(btrim(l ->> 'libelle'), ''), 200),
      'description', left(nullif(btrim(l ->> 'description'), ''), 1000),
      'quantite', v_quantite,
      'unite', left(nullif(btrim(l ->> 'unite'), ''), 20),
      'prix_unitaire', round(v_prix, 2),
      'taux_tva', v_taux,
      'optionnelle', case when coalesce((l ->> 'optionnelle')::boolean, false) then true end)));
  end loop;
  select coalesce(array_agg(distinct m order by m), '{}') into v_mots
  from (select left(public.crm_mots(x), 60) m
        from jsonb_array_elements_text(case jsonb_typeof(p -> 'mots_cles') when 'array' then p -> 'mots_cles'
                                            else to_jsonb(string_to_array(coalesce(p ->> 'mots_cles', ''), ',')) end) x) s
  where m <> '';
  if cardinality(v_mots) > 30 then
    raise exception 'Pas plus de 30 mots du besoin par modèle';
  end if;
  if resultat is null then
    insert into public.crm_modeles_proposition (etablissement_id, nom, description, mots_cles, lignes, cree_par)
    values (p_etablissement_id, btrim(p ->> 'nom'), left(nullif(btrim(p ->> 'description'), ''), 1000), v_mots, v_lignes, auth.uid())
    returning id into resultat;
  else
    update public.crm_modeles_proposition set nom = btrim(p ->> 'nom'), description = left(nullif(btrim(p ->> 'description'), ''), 1000),
      mots_cles = v_mots, lignes = v_lignes, actif = coalesce((p ->> 'actif')::boolean, actif)
    where id = resultat and etablissement_id = p_etablissement_id;
    if not found then
      raise exception 'Modèle introuvable';
    end if;
  end if;
  return resultat;
exception
  when unique_violation then
    raise exception 'Un modèle porte déjà ce nom';
end
$$;

-- Activer ou retirer un modèle (rien ne se supprime : un modèle déjà utilisé garde son historique).
create function public.activer_modele_proposition(p_modele_id uuid, p_actif boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.crm_modeles_proposition%rowtype;
begin
  select * into m from public.crm_modeles_proposition where id = p_modele_id;
  if m.id is null then
    raise exception 'Modèle introuvable';
  end if;
  perform public.exiger_permission(m.etablissement_id, 'crm_pipeline.administrer');
  update public.crm_modeles_proposition set actif = coalesce(p_actif, true) where id = m.id;
end
$$;

-- Modèles actifs classés pour une opportunité : mots du besoin retrouvés, montant par rapport au budget du client,
-- ventes gagnées avec ce modèle. Chaque modèle donne ses raisons ; rien n'est caché ni choisi à la place du commercial.
create function public.propositions_adaptees(p_opportunite_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public.crm_opportunites%rowtype;
  v_texte text;
  v_min numeric;
  v_max numeric;
begin
  select * into o from public.crm_opportunites where id = p_opportunite_id;
  if o.id is null or not public.lecture_autorisee(o.etablissement_id, 'crm_pipeline.lire') then
    raise exception 'Opportunité introuvable';
  end if;
  v_texte := ' ' || public.crm_mots(concat_ws(' ', o.titre, o.notes,
    (select string_agg(r.valeur, ' ') from public.crm_reponses r where r.opportunite_id = o.id))) || ' ';
  v_min := coalesce(o.budget_min, o.budget_max, nullif(o.montant, 0));
  v_max := coalesce(o.budget_max, o.budget_min, nullif(o.montant, 0));
  return coalesce((
    select jsonb_agg(x order by (x ->> 'score')::numeric desc, x ->> 'nom')
    from (
      select jsonb_build_object(
        'id', m.id, 'nom', m.nom, 'description', m.description, 'mots_cles', to_jsonb(m.mots_cles), 'lignes', m.lignes,
        'montant', s.montant, 'mots_trouves', to_jsonb(s.trouves), 'budget', s.budget,
        'utilisations', h.utilisations, 'gagnees', h.gagnees,
        'score', cardinality(s.trouves) * 10
                 + case s.budget when 'dans_budget' then 5 when 'au_dessus' then -5 else 0 end
                 + case when h.utilisations >= 2 then round(5.0 * h.gagnees / h.utilisations) else 0 end,
        'adapte', cardinality(s.trouves) > 0 or s.budget = 'dans_budget') x
      from public.crm_modeles_proposition m
      cross join lateral (
        select public.montant_modele_proposition(m.etablissement_id, m.lignes) montant,
               coalesce((select array_agg(k order by k) from unnest(m.mots_cles) k where position(' ' || k || ' ' in v_texte) > 0), '{}') trouves,
               case when v_min is null then null
                    when public.montant_modele_proposition(m.etablissement_id, m.lignes) > v_max * 1.1 then 'au_dessus'
                    when public.montant_modele_proposition(m.etablissement_id, m.lignes) < v_min * 0.5 then 'en_dessous'
                    else 'dans_budget' end budget) s
      cross join lateral (
        select count(*)::integer utilisations, count(*) filter (where x.statut = 'gagnee')::integer gagnees
        from public.crm_opportunites x where x.modele_proposition_id = m.id) h
      where m.etablissement_id = o.etablissement_id and m.actif
    ) t
  ), '[]'::jsonb);
end
$$;

-- Crée le devis de l'opportunité à partir d'un modèle (mêmes contrôles que « Créer le devis ») et retient le modèle utilisé.
create function public.creer_devis_depuis_modele(p_opportunite_id uuid, p_modele_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.crm_opportunites%rowtype;
  m public.crm_modeles_proposition%rowtype;
  v_devis uuid;
begin
  select * into o from public.crm_opportunites where id = p_opportunite_id;
  select * into m from public.crm_modeles_proposition where id = p_modele_id;
  if o.id is null then
    raise exception 'Opportunité introuvable';
  end if;
  if m.id is null or m.etablissement_id <> o.etablissement_id or not m.actif then
    raise exception 'Modèle introuvable ou retiré';
  end if;
  v_devis := public.creer_devis_opportunite(o.id, m.lignes);
  update public.crm_opportunites set modele_proposition_id = m.id where id = o.id;
  return v_devis;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Parrainage (module Fidélité)
-- ---------------------------------------------------------------------------
-- Un parrainage en attente devient « converti » à la première vente validée du filleul ; il redevient « en attente »
-- si cette vente est annulée et qu'aucune autre vente validée ne la remplace (en fin de transaction).
create function public.parrainage_suivre_vente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.ventes%rowtype;
  p public.parrainages%rowtype;
  v_autre uuid;
begin
  select * into v from public.ventes where id = new.id;
  if v.id is null or v.contact_id is null then
    return null;
  end if;
  if v.statut = 'validee' then
    for p in select * from public.parrainages
             where etablissement_id = v.etablissement_id and filleul_id = v.contact_id and statut = 'en_attente' and cree_le <= v.cree_le + interval '1 minute'
             for update loop
      update public.parrainages set statut = 'converti', converti_le = now(), vente_id = v.id where id = p.id;
      perform public.notifier_permission(v.etablissement_id, 'fidelite.gerer', 'fidelite.parrainage',
        'Filleul devenu client : ' || left(coalesce((select coalesce(nullif(k.societe, ''), k.nom) from public.contacts k where k.id = v.contact_id), 'Contact'), 80),
        'Parrainé par ' || left(coalesce((select coalesce(nullif(k.societe, ''), k.nom) from public.contacts k where k.id = p.contact_id), 'Contact'), 80)
        || ' · récompense à accorder', 'fidelite');
    end loop;
  else
    for p in select * from public.parrainages where vente_id = v.id and statut = 'converti' for update loop
      select x.id into v_autre from public.ventes x
      where x.etablissement_id = v.etablissement_id and x.contact_id = p.filleul_id and x.statut = 'validee' and x.id <> v.id
        and x.cree_le >= p.cree_le - interval '1 minute'
      order by x.cree_le limit 1;
      if v_autre is not null then
        update public.parrainages set vente_id = v_autre where id = p.id;
      else
        update public.parrainages set statut = 'en_attente', converti_le = null, vente_id = null where id = p.id;
      end if;
    end loop;
  end if;
  return null;
end
$$;
create constraint trigger ventes_parrainage after insert or update of statut, contact_id on public.ventes
deferrable initially deferred for each row execute function public.parrainage_suivre_vente();

-- Enregistrer une recommandation (l'équipe) : le filleul ne doit pas être déjà client (aucune vente validée).
create function public.enregistrer_parrainage(p_etablissement_id uuid, p_parrain_id uuid, p_filleul_id uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'fidelite.utiliser');
  if p_parrain_id is null or p_filleul_id is null or p_parrain_id = p_filleul_id then
    raise exception 'Choisissez le parrain et la personne recommandée (deux contacts différents)';
  end if;
  if (select count(*) from public.contacts where id in (p_parrain_id, p_filleul_id) and etablissement_id = p_etablissement_id
        and actif and anonymise_le is null) <> 2 then
    raise exception 'Contact introuvable';
  end if;
  if length(coalesce(p_note, '')) > 1000 then
    raise exception 'Note trop longue (1000 caractères au plus)';
  end if;
  if exists (select 1 from public.parrainages where etablissement_id = p_etablissement_id and filleul_id = p_filleul_id and statut <> 'annule') then
    raise exception 'Cette personne a déjà été recommandée';
  end if;
  if exists (select 1 from public.ventes where etablissement_id = p_etablissement_id and contact_id = p_filleul_id and statut = 'validee') then
    raise exception 'Cette personne est déjà cliente : le parrainage vaut pour un nouveau client';
  end if;
  insert into public.parrainages (etablissement_id, contact_id, filleul_id, origine, note, cree_par)
  values (p_etablissement_id, p_parrain_id, p_filleul_id, 'equipe', nullif(btrim(p_note), ''), auth.uid())
  returning id into resultat;
  return resultat;
end
$$;

-- Accorder la récompense d'un parrainage converti : le texte annoncé (ou celui écrit ici) et, si réglé, des points
-- de fidélité au parrain (mouvement « ajustement » motivé, définitif).
create function public.recompenser_parrainage(p_parrainage_id uuid, p_recompense text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.parrainages%rowtype;
  v_texte text;
  v_points integer;
  v_mouvement uuid;
begin
  select * into p from public.parrainages where id = p_parrainage_id for update;
  if p.id is null then
    raise exception 'Parrainage introuvable';
  end if;
  perform public.exiger_permission(p.etablissement_id, 'fidelite.gerer');
  if p.statut <> 'converti' then
    raise exception 'La récompense s''accorde quand la personne recommandée est devenue cliente';
  end if;
  v_texte := left(nullif(btrim(coalesce(p_recompense, public.parametre_module(p.etablissement_id, 'fidelite', 'parrainage_recompense') #>> '{}')), ''), 300);
  v_points := greatest(0, least(1000000, coalesce(floor((public.parametre_module(p.etablissement_id, 'fidelite', 'parrainage_points') #>> '{}')::numeric), 0)))::integer;
  if v_texte is null and v_points = 0 then
    raise exception 'Écrivez la récompense accordée (ou réglez-la dans les paramètres du module Fidélité)';
  end if;
  if v_points > 0 then
    insert into public.fidelite_mouvements (etablissement_id, contact_id, type, points, motif, cree_par)
    values (p.etablissement_id, p.contact_id, 'ajustement', v_points,
      left('Parrainage de ' || coalesce((select coalesce(nullif(k.societe, ''), k.nom) from public.contacts k where k.id = p.filleul_id), 'Contact'), 300), auth.uid())
    returning id into v_mouvement;
  end if;
  update public.parrainages set statut = 'recompense', recompense = v_texte, points = nullif(v_points, 0), mouvement_id = v_mouvement,
    recompense_le = now(), recompense_par = auth.uid()
  where id = p.id;
end
$$;

create function public.annuler_parrainage(p_parrainage_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.parrainages%rowtype;
begin
  select * into p from public.parrainages where id = p_parrainage_id for update;
  if p.id is null then
    raise exception 'Parrainage introuvable';
  end if;
  perform public.exiger_permission(p.etablissement_id, 'fidelite.gerer');
  if p.statut not in ('en_attente', 'converti') then
    raise exception 'Ce parrainage est déjà récompensé ou annulé';
  end if;
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Indiquez le motif de l''annulation';
  end if;
  update public.parrainages set statut = 'annule', annule_le = now(), motif_annulation = left(btrim(p_motif), 500) where id = p.id;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Bilans de collaboration (Espace client)
-- ---------------------------------------------------------------------------
-- Chiffres d'un client sur une période (dates locales de l'établissement), seulement pour les modules actifs (interne).
create function public.calculer_bilan_client(p_etablissement_id uuid, p_contact_id uuid, p_du date, p_au date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r jsonb := jsonb_build_object('devise', (select devise from public.etablissements where id = p_etablissement_id), 'calcule_le', now());
begin
  if public.module_actif(p_etablissement_id, 'facturation') then
    r := r || jsonb_build_object('facturation', (
      select jsonb_build_object(
        'factures', count(*) filter (where d.type = 'facture'),
        'facture', coalesce(sum(d.total_ttc) filter (where d.type = 'facture'), 0),
        'avoirs', coalesce(sum(d.total_ttc) filter (where d.type = 'avoir'), 0),
        'devis_acceptes', (select count(*) from public.documents_vente x where x.etablissement_id = p_etablissement_id and x.contact_id = p_contact_id
                           and x.type = 'devis' and x.statut in ('accepte', 'converti') and x.date_document between p_du and p_au),
        'encaisse', (select coalesce(sum(pa.montant), 0) from public.paiements pa join public.ventes v on v.id = pa.vente_id
                     where v.etablissement_id = p_etablissement_id and v.contact_id = p_contact_id and pa.statut = 'valide'
                       and public.date_locale(p_etablissement_id, pa.cree_le) between p_du and p_au),
        'reste_du', (select coalesce(sum(v.total - v.montant_paye), 0) from public.documents_vente x join public.ventes v on v.id = x.vente_id
                     where x.etablissement_id = p_etablissement_id and x.contact_id = p_contact_id and x.type = 'facture' and x.statut = 'emise'
                       and v.statut = 'validee'))
      from public.documents_vente d
      where d.etablissement_id = p_etablissement_id and d.contact_id = p_contact_id and d.type in ('facture', 'avoir') and d.statut = 'emise'
        and d.date_document between p_du and p_au));
  end if;
  if public.module_actif(p_etablissement_id, 'projets') then
    r := r || jsonb_build_object('projets', jsonb_build_object(
      'termines', (select count(*) from public.projets p where p.etablissement_id = p_etablissement_id and p.contact_id = p_contact_id
                   and p.statut = 'termine' and public.date_locale(p_etablissement_id, p.termine_le) between p_du and p_au),
      'en_cours', (select count(*) from public.projets p where p.etablissement_id = p_etablissement_id and p.contact_id = p_contact_id
                   and p.statut in ('a_venir', 'en_cours', 'en_pause')),
      'livrables_valides', (select count(*) from public.projet_livrable_versions lv join public.projet_livrables l on l.id = lv.livrable_id
                            join public.projets p on p.id = l.projet_id
                            where p.etablissement_id = p_etablissement_id and p.contact_id = p_contact_id and lv.decision = 'valide'
                              and public.date_locale(p_etablissement_id, lv.decide_le) between p_du and p_au)));
  end if;
  if public.module_actif(p_etablissement_id, 'support_tickets') then
    r := r || jsonb_build_object('support', (
      select jsonb_build_object(
        'ouverts', count(*) filter (where public.date_locale(p_etablissement_id, t.cree_le) between p_du and p_au),
        'resolus', count(*) filter (where t.resolu_le is not null and public.date_locale(p_etablissement_id, t.resolu_le) between p_du and p_au),
        'delai_moyen_heures', round((avg(extract(epoch from t.resolu_le - t.cree_le) / 3600)
                                      filter (where t.resolu_le is not null and public.date_locale(p_etablissement_id, t.resolu_le) between p_du and p_au))::numeric, 1))
      from public.support_tickets t where t.etablissement_id = p_etablissement_id and t.contact_id = p_contact_id));
  end if;
  if public.module_actif(p_etablissement_id, 'agenda') then
    r := r || jsonb_build_object('agenda', jsonb_build_object(
      'rendez_vous', (select count(*) from public.agenda_rendez_vous a where a.etablissement_id = p_etablissement_id and a.contact_id = p_contact_id
                      and a.statut = 'honore' and public.date_locale(p_etablissement_id, a.debut) between p_du and p_au)));
  end if;
  r := r || jsonb_build_object('echanges', jsonb_build_object(
    'messages', (select count(*) from public.portail_messages m where m.contact_id = p_contact_id and m.etablissement_id = p_etablissement_id
                 and public.date_locale(p_etablissement_id, m.cree_le) between p_du and p_au)));
  return r;
end
$$;

-- Crée ou modifie un bilan en brouillon ; les chiffres sont recalculés à chaque enregistrement.
-- p : { id?, contact_id, du, au, titre?, synthese?, prochaines_actions? }
create function public.enregistrer_bilan_client(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p ->> 'id', '')::uuid;
  b public.bilans_client%rowtype;
  v_contact uuid := nullif(p ->> 'contact_id', '')::uuid;
  v_du date := nullif(p ->> 'du', '')::date;
  v_au date := nullif(p ->> 'au', '')::date;
  v_titre text;
begin
  perform public.exiger_permission(p_etablissement_id, 'portail_client.gerer');
  if resultat is not null then
    select * into b from public.bilans_client where id = resultat and etablissement_id = p_etablissement_id for update;
    if b.id is null then
      raise exception 'Bilan introuvable';
    end if;
    if b.statut <> 'brouillon' then
      raise exception 'Un bilan publié ne se modifie plus : retirez-le et préparez-en un nouveau';
    end if;
    v_contact := b.contact_id;
  end if;
  if v_contact is null or not exists (select 1 from public.contacts where id = v_contact and etablissement_id = p_etablissement_id and anonymise_le is null) then
    raise exception 'Client introuvable';
  end if;
  if v_du is null or v_au is null or v_au < v_du then
    raise exception 'Indiquez une période valide (début puis fin)';
  end if;
  if v_au > v_du + 731 then
    raise exception 'Un bilan couvre deux ans au plus';
  end if;
  if length(coalesce(p ->> 'synthese', '')) > 4000 or length(coalesce(p ->> 'prochaines_actions', '')) > 4000 then
    raise exception 'Texte trop long (4000 caractères au plus)';
  end if;
  v_titre := coalesce(nullif(btrim(p ->> 'titre'), ''), 'Bilan du ' || to_char(v_du, 'DD/MM/YYYY') || ' au ' || to_char(v_au, 'DD/MM/YYYY'));
  if length(v_titre) > 160 then
    raise exception 'Titre trop long (160 caractères au plus)';
  end if;
  if resultat is null then
    insert into public.bilans_client (etablissement_id, contact_id, numero, titre, du, au, chiffres, synthese, prochaines_actions, cree_par)
    values (p_etablissement_id, v_contact, public.prochain_numero(p_etablissement_id, 'bilan_client', 'BIL-'), v_titre, v_du, v_au,
      public.calculer_bilan_client(p_etablissement_id, v_contact, v_du, v_au), nullif(btrim(p ->> 'synthese'), ''),
      nullif(btrim(p ->> 'prochaines_actions'), ''), auth.uid())
    returning id into resultat;
  else
    update public.bilans_client set titre = v_titre, du = v_du, au = v_au,
      chiffres = public.calculer_bilan_client(p_etablissement_id, v_contact, v_du, v_au),
      synthese = nullif(btrim(p ->> 'synthese'), ''), prochaines_actions = nullif(btrim(p ->> 'prochaines_actions'), '')
    where id = resultat;
  end if;
  return resultat;
end
$$;

-- Publier dans l'espace du client (chiffres recalculés une dernière fois), ou retirer un bilan publié.
create function public.publier_bilan_client(p_bilan_id uuid, p_publier boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bilans_client%rowtype;
begin
  select * into b from public.bilans_client where id = p_bilan_id for update;
  if b.id is null then
    raise exception 'Bilan introuvable';
  end if;
  perform public.exiger_permission(b.etablissement_id, 'portail_client.gerer');
  if coalesce(p_publier, true) then
    if b.statut <> 'brouillon' then
      raise exception 'Ce bilan est déjà publié';
    end if;
    if coalesce(b.synthese, '') = '' and coalesce(b.prochaines_actions, '') = '' then
      raise exception 'Écrivez la synthèse ou les prochaines actions avant de publier';
    end if;
    update public.bilans_client set statut = 'publie', publie_le = now(), publie_par = auth.uid(),
      chiffres = public.calculer_bilan_client(b.etablissement_id, b.contact_id, b.du, b.au)
    where id = b.id;
  else
    if b.statut <> 'publie' then
      raise exception 'Seul un bilan publié se retire';
    end if;
    update public.bilans_client set statut = 'retire' where id = b.id;
  end if;
end
$$;

-- Clients qui ont un espace actif et pas de bilan publié depuis la périodicité réglée (0 = aucun rappel).
create function public.bilans_a_preparer(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mois integer := least(24, greatest(0, coalesce(floor((public.parametre_module(p_etablissement_id, 'portail_client', 'bilan_periodicite_mois') #>> '{}')::numeric), 3)))::integer;
  v_jour date := public.date_locale(p_etablissement_id);
begin
  if not public.lecture_autorisee(p_etablissement_id, 'portail_client.lire') then
    raise exception 'Permission refusée : portail_client.lire' using errcode = '42501';
  end if;
  if v_mois = 0 then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('contact_id', k.id, 'nom', coalesce(nullif(k.societe, ''), k.nom), 'dernier_au', d.dernier_au,
             'du', coalesce(d.dernier_au + 1, (v_jour - make_interval(months => v_mois))::date), 'au', v_jour)
           order by d.dernier_au nulls first, k.nom)
    from public.contacts k
    cross join lateral (select max(b.au) dernier_au from public.bilans_client b where b.contact_id = k.id and b.statut = 'publie') d
    where k.etablissement_id = p_etablissement_id and k.actif and k.anonymise_le is null
      and exists (select 1 from public.portail_acces a where a.contact_id = k.id and a.revoque_le is null and a.expire_le > now())
      and (d.dernier_au is null or d.dernier_au < (v_jour - make_interval(months => v_mois))::date)
      and not exists (select 1 from public.bilans_client b where b.contact_id = k.id and b.statut = 'brouillon')
  ), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Maintenances planifiées (Support)
-- ---------------------------------------------------------------------------
-- p : { id?, titre, description?, debut, fin, impact? }. Changer les horaires vaut nouvelle annonce (préavis recompté).
create function public.enregistrer_maintenance(p_etablissement_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p ->> 'id', '')::uuid;
  m public.support_maintenances%rowtype;
  v_debut timestamptz := nullif(p ->> 'debut', '')::timestamptz;
  v_fin timestamptz := nullif(p ->> 'fin', '')::timestamptz;
  v_impact text := coalesce(nullif(p ->> 'impact', ''), 'interruption');
  v_preavis integer := least(2160, greatest(0, coalesce(floor((public.parametre_module(p_etablissement_id, 'support_tickets', 'maintenance_preavis_heures') #>> '{}')::numeric), 48)))::integer;
  v_fuseau text := (select fuseau from public.etablissements where id = p_etablissement_id);
begin
  perform public.exiger_permission(p_etablissement_id, 'support_tickets.gerer');
  if length(coalesce(btrim(p ->> 'titre'), '')) < 3 or length(btrim(p ->> 'titre')) > 160 then
    raise exception 'Donnez un titre à la maintenance (3 à 160 caractères)';
  end if;
  if length(coalesce(p ->> 'description', '')) > 2000 then
    raise exception 'Description trop longue (2000 caractères au plus)';
  end if;
  if v_impact not in ('interruption', 'partiel', 'ralentissement') then
    raise exception 'Impact inconnu';
  end if;
  if v_debut is null or v_fin is null or v_fin <= v_debut then
    raise exception 'Indiquez le début puis la fin de la maintenance';
  end if;
  if v_fin > v_debut + interval '14 days' then
    raise exception 'Une maintenance dure 14 jours au plus';
  end if;
  if v_fin <= now() then
    raise exception 'Cette maintenance serait déjà terminée';
  end if;
  if resultat is not null then
    select * into m from public.support_maintenances where id = resultat and etablissement_id = p_etablissement_id for update;
    if m.id is null then
      raise exception 'Maintenance introuvable';
    end if;
    if m.statut = 'annulee' or m.fin <= now() then
      raise exception 'Cette maintenance est annulée ou terminée';
    end if;
    update public.support_maintenances set titre = btrim(p ->> 'titre'), description = nullif(btrim(p ->> 'description'), ''),
      debut = v_debut, fin = v_fin, impact = v_impact,
      annonce_le = case when m.debut is distinct from v_debut or m.fin is distinct from v_fin then now() else annonce_le end
    where id = resultat
    returning * into m;
  else
    insert into public.support_maintenances (etablissement_id, titre, description, debut, fin, impact, cree_par)
    values (p_etablissement_id, btrim(p ->> 'titre'), nullif(btrim(p ->> 'description'), ''), v_debut, v_fin, v_impact, auth.uid())
    returning * into m;
  end if;
  perform public.notifier_permission(p_etablissement_id, 'support_tickets.traiter', 'support.maintenance',
    'Maintenance planifiée : ' || left(m.titre, 100),
    to_char(m.debut at time zone v_fuseau, 'DD/MM/YYYY HH24:MI') || ' → ' || to_char(m.fin at time zone v_fuseau, 'DD/MM/YYYY HH24:MI') || ' (' || v_fuseau || ')',
    'support');
  return jsonb_build_object('id', m.id, 'preavis_heures', v_preavis,
    'preavis_respecte', m.debut >= m.annonce_le + make_interval(hours => v_preavis));
end
$$;

create function public.annuler_maintenance(p_maintenance_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.support_maintenances%rowtype;
begin
  select * into m from public.support_maintenances where id = p_maintenance_id for update;
  if m.id is null then
    raise exception 'Maintenance introuvable';
  end if;
  perform public.exiger_permission(m.etablissement_id, 'support_tickets.gerer');
  if m.statut = 'annulee' or m.fin <= now() then
    raise exception 'Cette maintenance est déjà annulée ou terminée';
  end if;
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Indiquez le motif de l''annulation (il est affiché aux clients)';
  end if;
  update public.support_maintenances set statut = 'annulee', annulee_le = now(), motif_annulation = left(btrim(p_motif), 500) where id = m.id;
end
$$;

-- Maintenances à montrer : en cours ou à venir dans les 30 jours ; annulées récemment (pour prévenir ceux qui s'organisaient).
create function public.maintenances_visibles(p_etablissement_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'titre', m.titre, 'description', m.description, 'debut', m.debut, 'fin', m.fin,
           'impact', m.impact, 'statut', m.statut, 'motif_annulation', m.motif_annulation, 'en_cours', m.statut = 'planifiee' and m.debut <= now())
         order by m.debut), '[]'::jsonb)
  from public.support_maintenances m
  where m.etablissement_id = p_etablissement_id and m.fin > now() and m.debut < now() + interval '30 days'
    and (m.statut = 'planifiee' or m.annulee_le > now() - interval '7 days')
$$;

-- ---------------------------------------------------------------------------
-- 7. Côté client (espace client, sans compte)
-- ---------------------------------------------------------------------------
-- Compléments de l'espace : maintenances annoncées, bilans publiés, parrainage (si ouvert aux clients).
create function public.portail_suivi(p_jeton text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.portail_acces%rowtype := public.portail_acces_valide(p_jeton);
  v_parrainage boolean := public.module_actif(a.etablissement_id, 'fidelite')
    and coalesce((public.parametre_module(a.etablissement_id, 'fidelite', 'parrainage_espace_client') #>> '{}')::boolean, false);
begin
  return jsonb_build_object(
    'fuseau', (select fuseau from public.etablissements where id = a.etablissement_id),
    'maintenances', case when public.module_actif(a.etablissement_id, 'support_tickets') then public.maintenances_visibles(a.etablissement_id) else '[]'::jsonb end,
    'bilans', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'numero', b.numero, 'titre', b.titre, 'du', b.du, 'au', b.au,
                 'chiffres', b.chiffres, 'synthese', b.synthese, 'prochaines_actions', b.prochaines_actions, 'publie_le', b.publie_le, 'vu_le', b.vu_le)
               order by b.au desc, b.publie_le desc), '[]'::jsonb)
               from public.bilans_client b where b.contact_id = a.contact_id and b.etablissement_id = a.etablissement_id and b.statut = 'publie'),
    'parrainage', jsonb_build_object(
      'actif', v_parrainage,
      'recompense', case when v_parrainage then nullif(public.parametre_module(a.etablissement_id, 'fidelite', 'parrainage_recompense') #>> '{}', '') end,
      'recommandations', case when v_parrainage or exists (select 1 from public.parrainages x where x.contact_id = a.contact_id) then (
        select coalesce(jsonb_agg(jsonb_build_object('nom', case when k.anonymise_le is null then coalesce(nullif(k.societe, ''), k.nom) else 'Contact' end,
                 'statut', p.statut, 'cree_le', p.cree_le, 'recompense', p.recompense, 'points', p.points) order by p.cree_le desc), '[]'::jsonb)
        from public.parrainages p join public.contacts k on k.id = p.filleul_id
        where p.contact_id = a.contact_id and p.etablissement_id = a.etablissement_id and p.statut <> 'annule') else '[]'::jsonb end));
end
$$;

-- Le client a ouvert un bilan publié (accusé de lecture, une fois).
create function public.portail_bilan_vu(p_jeton text, p_bilan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.portail_acces%rowtype := public.portail_acces_valide(p_jeton);
  b public.bilans_client%rowtype;
begin
  select * into b from public.bilans_client where id = p_bilan_id and contact_id = a.contact_id and etablissement_id = a.etablissement_id and statut = 'publie' for update;
  if b.id is null then
    raise exception 'Bilan introuvable';
  end if;
  if b.vu_le is null then
    update public.bilans_client set vu_le = now() where id = b.id;
    perform public.portail_tracer(a, 'bilan_vu', 'bilan_client', b.id);
  end if;
end
$$;

-- Recommander une personne. La réponse est la même que la personne soit connue ou non (rien n'est révélé au client).
-- Personne inconnue : fiche « prospect » d'origine « recommandation » et parrainage en attente. Personne déjà connue
-- sans vente ni parrainage : parrainage en attente. Sinon : la recommandation est seulement transmise à l'équipe.
create function public.portail_recommander(p_jeton text, p_nom text, p_telephone text default null, p_email text default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.portail_acces%rowtype := public.portail_acces_valide(p_jeton);
  v_parrain public.contacts%rowtype;
  v_filleul uuid;
  v_nom text := btrim(coalesce(p_nom, ''));
  v_tel text := nullif(btrim(coalesce(p_telephone, '')), '');
  v_mail text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_parrainage uuid;
begin
  if not (public.module_actif(a.etablissement_id, 'fidelite')
          and coalesce((public.parametre_module(a.etablissement_id, 'fidelite', 'parrainage_espace_client') #>> '{}')::boolean, false)) then
    raise exception 'Les recommandations ne sont pas ouvertes : parlez-en directement à l''équipe';
  end if;
  if length(v_nom) < 2 or length(v_nom) > 120 then
    raise exception 'Écrivez le nom de la personne recommandée';
  end if;
  if v_tel is null and v_mail is null then
    raise exception 'Indiquez au moins un téléphone ou un e-mail pour que l''équipe puisse la joindre';
  end if;
  if length(coalesce(v_tel, '')) > 40 or (v_tel is not null and public.cle_telephone(v_tel) is null) then
    raise exception 'Numéro de téléphone invalide';
  end if;
  if length(coalesce(v_mail, '')) > 160 or (v_mail is not null and v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'Adresse e-mail invalide';
  end if;
  if length(coalesce(p_note, '')) > 1000 then
    raise exception 'Message trop long (1000 caractères au plus)';
  end if;
  perform public.portail_limiter(a.id, 'recommandation', 5);
  select * into v_parrain from public.contacts where id = a.contact_id;
  if (v_tel is not null and public.cle_telephone(v_parrain.telephone) = public.cle_telephone(v_tel))
     or (v_mail is not null and lower(v_parrain.email) = v_mail) then
    raise exception 'Vous ne pouvez pas vous recommander vous-même';
  end if;
  select k.id into v_filleul from public.contacts k
  where k.etablissement_id = a.etablissement_id and k.anonymise_le is null and k.id <> a.contact_id
    and ((v_tel is not null and public.cle_telephone(k.telephone) = public.cle_telephone(v_tel)) or (v_mail is not null and lower(k.email) = v_mail))
  order by k.actif desc, k.cree_le
  limit 1;
  if v_filleul is null then
    insert into public.contacts (etablissement_id, type, nom, telephone, email, source, notes)
    values (a.etablissement_id, 'prospect', v_nom, v_tel, v_mail, 'recommandation',
      left('Recommandé par ' || coalesce(nullif(v_parrain.societe, ''), v_parrain.nom) || ' depuis son espace client.'
           || coalesce(' Message : ' || nullif(btrim(p_note), ''), ''), 4000))
    returning id into v_filleul;
  end if;
  if not exists (select 1 from public.parrainages where etablissement_id = a.etablissement_id and filleul_id = v_filleul and statut <> 'annule')
     and not exists (select 1 from public.ventes where etablissement_id = a.etablissement_id and contact_id = v_filleul and statut = 'validee') then
    insert into public.parrainages (etablissement_id, contact_id, filleul_id, origine, note)
    values (a.etablissement_id, a.contact_id, v_filleul, 'espace_client', nullif(btrim(p_note), ''))
    returning id into v_parrainage;
  end if;
  perform public.portail_tracer(a, 'recommandation', case when v_parrainage is not null then 'parrainage' end, v_parrainage, v_nom, p_note);
  perform public.notifier_permission(a.etablissement_id, 'fidelite.lire', 'fidelite.parrainage',
    'Recommandation de ' || left(coalesce(nullif(v_parrain.societe, ''), v_parrain.nom), 80),
    left(v_nom, 80) || case when v_parrainage is null then ' · déjà cliente ou déjà recommandée' else ' · nouveau parrainage à suivre' end, 'fidelite');
end
$$;

-- ---------------------------------------------------------------------------
-- 8. Droits d'exécution
-- ---------------------------------------------------------------------------
revoke execute on function public.crm_mots(text) from public, anon, authenticated;
revoke execute on function public.montant_modele_proposition(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.parrainage_suivre_vente() from public, anon, authenticated;
revoke execute on function public.calculer_bilan_client(uuid, uuid, date, date) from public, anon, authenticated;
revoke execute on function public.maintenances_visibles(uuid) from public, anon, authenticated;
do $$
declare
  f text;
begin
  foreach f in array array['enregistrer_modele_proposition(uuid, jsonb)', 'activer_modele_proposition(uuid, boolean)',
                            'propositions_adaptees(uuid)', 'creer_devis_depuis_modele(uuid, uuid)',
                            'enregistrer_parrainage(uuid, uuid, uuid, text)', 'recompenser_parrainage(uuid, text)', 'annuler_parrainage(uuid, text)',
                            'enregistrer_bilan_client(uuid, jsonb)', 'publier_bilan_client(uuid, boolean)', 'bilans_a_preparer(uuid)',
                            'enregistrer_maintenance(uuid, jsonb)', 'annuler_maintenance(uuid, text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['portail_suivi(text)', 'portail_bilan_vu(text, uuid)', 'portail_recommander(text, text, text, text, text)'] loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end
$$;

notify pgrst, 'reload schema';
