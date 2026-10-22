-- Heure de fin précise d'une licence (fin_a) : coupure à une heure donnée, par exemple « samedi 24/10 à 12h00 ».
-- Demandé par Juste le 2026-10-22 pour The Dream (licence annuelle non payée).
-- Sans fin_a (toutes les licences existantes), rien ne change : Elite License Guard s'applique comme avant
-- (une échéance dépassée laisse la caisse ouverte).
-- Avec fin_a, à partir de cette heure :
--   * plus aucune écriture : ni vente, ni encaissement, ni ouverture de caisse, ni stock (consultation seule) ;
--   * seules exceptions : envoyer les ventes faites hors ligne AVANT la coupure (caisse.rattraper) et tirer le ticket Z
--     d'une caisse restée ouverte (cloture.cloturer), pour ne perdre aucune donnée ;
--   * le menu QR des tables est fermé ; l'écran déconnecte les comptes ouverts (src/noyau/continuite.js).
-- Un renouvellement (échéance repoussée) ou une nouvelle licence efface la coupure. Aucune donnée n'est supprimée.

alter table public.licences add column if not exists fin_a timestamptz;
comment on column public.licences.fin_a is 'Heure de fin précise (facultative). Passée cette heure : consultation seule, caisse fermée.';

-- Un renouvellement efface l'heure de fin (la licence repart normalement).
create or replace function public.licence_effacer_fin_a()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.fin_a is not null and new.fin_a is not distinct from old.fin_a
     and new.echeance is distinct from old.echeance
     and (new.echeance is null or old.echeance is null or new.echeance > old.echeance) then
    new.fin_a := null;
  end if;
  return new;
end
$$;
drop trigger if exists licences_effacer_fin_a on public.licences;
create trigger licences_effacer_fin_a before update of echeance on public.licences
  for each row execute function public.licence_effacer_fin_a();

-- Vrai quand la licence en cours a passé son heure de fin (établissement et client actifs).
create or replace function public.licence_coupee(p_etablissement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.etablissements e
    join public.clients c on c.id = e.client_id
    join public.licences l on l.etablissement_id = e.id and l.statut = 'active'
    where e.id = p_etablissement_id and e.statut = 'actif' and c.statut = 'actif'
      and l.fin_a is not null and now() >= l.fin_a
  )
$$;
revoke all on function public.licence_coupee(uuid) from public, anon;
grant execute on function public.licence_coupee(uuid) to authenticated;

-- Gestes encore permis après la coupure : ne rien perdre de ce qui a été fait avant.
create or replace function public.permissions_apres_coupure()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['caisse.rattraper', 'cloture.cloturer']::text[]
$$;

-- Même règle qu'en 20261002000007, plus l'heure de fin.
create or replace function public.licence_valide(p_etablissement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.licences l
    where l.etablissement_id = p_etablissement_id
      and l.statut = 'active'
      and l.debut <= current_date
      and (l.echeance is null or current_date <= l.echeance + case when l.formule = 'essai' then 0 else 7 end)
      and (l.fin_a is null or now() < l.fin_a)
  )
$$;

-- Même règle qu'en 20261021000151, plus l'heure de fin : après la coupure, la caisse ne continue plus.
create or replace function public.caisse_continue(p_etablissement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.etablissements e
    join public.clients c on c.id = e.client_id
    join public.licences l on l.etablissement_id = e.id and l.statut = 'active' and l.debut <= current_date
    where e.id = p_etablissement_id and e.statut = 'actif' and c.statut = 'actif'
      and (l.fin_a is null or now() < l.fin_a)
  )
$$;

create or replace function public.exiger_permission(p_etablissement_id uuid, p_permission text)
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
  if public.etablissement_autorise_ecriture(p_etablissement_id) then
    return;
  end if;
  if p_permission = any (public.permissions_continuite()) and public.caisse_continue(p_etablissement_id) then
    return;
  end if;
  if p_permission = any (public.permissions_apres_coupure()) and public.licence_coupee(p_etablissement_id) then
    return;
  end if;
  if public.licence_coupee(p_etablissement_id) then
    raise exception 'Licence expirée : consultation seule. Contactez Agence Elite pour la renouveler.' using errcode = '42501';
  end if;
  raise exception 'Établissement suspendu ou archivé : aucune écriture possible' using errcode = '42501';
end
$$;

-- Résumé de licence lu par l'écran (même contenu qu'en 20261002000009, plus fin_a).
create or replace function public.resume_licence(p_etablissement_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', l.id,
    'offre_id', l.offre_id,
    'offre', o.nom,
    'formule', l.formule,
    'statut', l.statut,
    'debut', l.debut,
    'echeance', l.echeance,
    'jours_restants', case when l.echeance is null then null else l.echeance - current_date end,
    'montant', l.montant,
    'devise', l.devise,
    'modules', to_jsonb(o.modules || l.modules_supplementaires),
    'modules_supplementaires', to_jsonb(l.modules_supplementaires),
    'support', l.support,
    'fin_a', l.fin_a,
    'valide', public.licence_valide(p_etablissement_id)
  )
  from public.licences l
  join public.offres o on o.id = l.offre_id
  where l.etablissement_id = p_etablissement_id and l.statut <> 'terminee'
$$;
revoke execute on function public.resume_licence(uuid) from public, anon, authenticated;

-- Alertes quotidiennes : même fonction qu'en 20261021000151, sans les licences à heure de fin précise.
create or replace function public.alerter_echeances_licences(p_simulation boolean default false, p_jour date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  reglage public.licence_alertes_reglages%rowtype;
  l record;
  v_palier integer;
  titre text;
  texte text;
  destinataires integer;
  liste jsonb := '[]'::jsonb;
  envoyees integer := 0;
begin
  select * into reglage from public.licence_alertes_reglages where id;
  if reglage.id is null or not reglage.actif then
    return jsonb_build_object('actif', false, 'envoyees', 0, 'simulation', p_simulation, 'liste', liste);
  end if;
  for l in
    select * from public.licences_echeances(p_jour) x
    where x.statut = 'active' and x.echeance is not null and x.debut <= p_jour
      and x.etablissement_statut = 'actif' and x.client_statut = 'actif'
      -- Licence à heure de fin précise : prévenue par son propre message (le texte habituel dit que la caisse continue).
      and not exists (select 1 from public.licences z where z.id = x.licence_id and z.fin_a is not null)
    order by x.echeance
  loop
    select min(p) into v_palier from unnest(reglage.paliers) p where p >= l.jours;
    if v_palier is null then
      continue;
    end if;
    -- Déjà prévenu pour ce palier ou un plus urgent, sur cette échéance : rien.
    if exists (select 1 from public.licence_alertes a where a.licence_id = l.licence_id and a.echeance = l.echeance and a.palier <= v_palier) then
      continue;
    end if;
    titre := case
      when l.jours > 0 then case when l.formule = 'essai' then 'Fin de l''essai dans ' else 'Abonnement : échéance dans ' end || l.jours || ' jour(s)'
      when l.jours = 0 then 'Abonnement : échéance aujourd''hui'
      when l.etat = 'grace' then 'Abonnement échu : délai de grâce'
      else 'Abonnement expiré'
    end;
    texte := public.licence_texte_alerte(l.formule, l.offre, l.echeance, l.jours, l.grace);
    select count(*) into destinataires from public.membres_avec_permission(l.etablissement_id, 'etablissement.modifier');
    liste := liste || jsonb_build_object(
      'licence_id', l.licence_id, 'etablissement_id', l.etablissement_id, 'etablissement', l.etablissement, 'client', l.client,
      'echeance', l.echeance, 'jours', l.jours, 'palier', v_palier, 'etat', l.etat, 'titre', titre, 'texte', texte,
      'destinataires', destinataires, 'partenaire', l.partenaire
    );
    if p_simulation then
      continue;
    end if;
    insert into public.licence_alertes(licence_id, etablissement_id, echeance, palier, jours, etat, destinataires)
    values (l.licence_id, l.etablissement_id, l.echeance, v_palier, l.jours, l.etat, destinataires)
    on conflict do nothing;
    if not found then
      continue;
    end if;
    envoyees := envoyees + 1;
    -- Responsables de l'établissement (même règle que les autres alertes : la permission, pas le titre).
    perform public.notifier(r, l.etablissement_id, 'licence.echeance', titre || ' · ' || l.etablissement, texte, 'parametres/licence')
    from public.membres_avec_permission(l.etablissement_id, 'etablissement.modifier') r;
    -- Partenaire Elite Partners du client.
    if reglage.prevenir_partenaire and l.partenaire_user is not null then
      perform public.notifier(l.partenaire_user, null, 'licence.echeance_partenaire',
        'Client à renouveler : ' || l.etablissement,
        l.client || ' · ' || l.offre || ' · échéance le ' || to_char(l.echeance, 'DD/MM/YYYY') || ' (' || l.jours || ' j). Appelez-le pour le renouvellement.',
        'partenaire');
    end if;
    -- Équipe Agence Elite (lue aussi dans le CRM, écran Échéances).
    if l.jours <= reglage.prevenir_equipe_jours then
      perform public.notifier(a.user_id, l.etablissement_id, 'licence.echeance_equipe',
        titre || ' · ' || l.etablissement, l.client || ' · ' || l.offre || ' · échéance le ' || to_char(l.echeance, 'DD/MM/YYYY') || '.', null)
      from public.plateforme_admins a where a.actif and a.role in ('super_admin', 'admin');
    end if;
  end loop;
  return jsonb_build_object('actif', true, 'envoyees', envoyees, 'simulation', p_simulation, 'jour', p_jour, 'liste', liste);
end
$$;
revoke all on function public.alerter_echeances_licences(boolean, date) from public, anon, authenticated;

notify pgrst, 'reload schema';
