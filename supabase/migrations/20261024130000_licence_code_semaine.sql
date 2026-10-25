-- Codes de licence courts (paiement en plusieurs fois) : un modèle de licence peut couper l'accès à midi, heure de
-- Brazzaville, le jour de son échéance (licences.fin_a, migration 20261022000154). Exemple : « 1 semaine » = 8 jours,
-- coupure le 8e jour à 12h00 si la tranche suivante n'est pas payée. Sans ce réglage, rien ne change.
-- Additive : une colonne facultative et deux fonctions remplacées (même signature, même comportement par défaut).

alter table public.licence_modeles add column if not exists coupure_midi boolean not null default false;

-- Pose une licence issue d'un modèle sur un établissement (la licence en cours est terminée, l'historique reste).
create or replace function public.poser_licence_modele(p_etablissement_id uuid, p_modele public.licence_modeles, p_cle_id uuid, p_reference text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  offre public.offres%rowtype;
  debut date := current_date;
  echeance date;
  coupure timestamptz;
  resultat uuid;
  note text;
begin
  select * into offre from public.offres where id = p_modele.offre_id;
  echeance := case
    when p_modele.duree_jours is not null and p_modele.formule <> 'acquisition' then debut + p_modele.duree_jours
    when p_modele.formule = 'mensuel' then (debut + interval '1 month')::date
    when p_modele.formule = 'annuel' then (debut + interval '1 year')::date
    when p_modele.formule = 'essai' then debut + 30
  end;
  -- Coupure à midi (Brazzaville) le jour de l'échéance : la caisse s'arrête aussi (pas de délai de grâce).
  if coalesce(p_modele.coupure_midi, false) and echeance is not null then
    coupure := (echeance::timestamp + time '12:00') at time zone 'Africa/Brazzaville';
  end if;
  note := 'Clé ' || p_reference || ' (' || p_modele.nom || ')'
    || case when p_modele.frais_installation > 0 then ' · installation ' || p_modele.frais_installation::text || ' ' || offre.devise else '' end
    || case when coupure is not null then ' · coupure le ' || to_char(echeance, 'DD/MM/YYYY') || ' à 12h00 (Brazzaville)' else '' end;
  update public.licences
  set statut = 'terminee', motif_statut = 'Remplacée par une clé d''activation'
  where etablissement_id = p_etablissement_id and statut <> 'terminee';
  insert into public.licences(etablissement_id, offre_id, formule, debut, echeance, fin_a, montant, devise, note, cree_par, appareils_max, cle_id)
  values (p_etablissement_id, offre.id, p_modele.formule, debut, echeance, coupure, p_modele.montant, offre.devise, note, auth.uid(), p_modele.appareils_max, p_cle_id)
  returning id into resultat;
  insert into public.licence_evenements(licence_id, etablissement_id, type, nouvelle_echeance, montant, reference, motif, acteur)
  values (resultat, p_etablissement_id, 'attribution', echeance, p_modele.montant, p_reference, note, auth.uid());
  perform public.synchroniser_modules_licence(p_etablissement_id);
  return resultat;
end
$$;

create or replace function public.enregistrer_modele_licence(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_offre public.offres%rowtype;
  resultat uuid;
begin
  perform public.exiger_super_admin();
  select * into v_offre from public.offres where id = p ->> 'offre_id';
  if v_offre.id is null then
    raise exception 'Choisissez une offre';
  end if;
  if coalesce(p ->> 'formule', '') not in ('essai', 'acquisition', 'mensuel', 'annuel') then
    raise exception 'Formule invalide';
  end if;
  if coalesce((p ->> 'montant')::numeric, 0) < 0 or coalesce((p ->> 'frais_installation')::numeric, 0) < 0 then
    raise exception 'Les montants ne peuvent pas être négatifs';
  end if;
  if v_id is null then
    insert into public.licence_modeles(nom, description, offre_id, formule, duree_jours, montant, frais_installation, appareils_max, formule_suivante, actif, ordre, coupure_midi)
    values (btrim(p ->> 'nom'), nullif(btrim(p ->> 'description'), ''), v_offre.id, p ->> 'formule', nullif(p ->> 'duree_jours', '')::integer,
            coalesce((p ->> 'montant')::numeric, 0), coalesce((p ->> 'frais_installation')::numeric, 0), nullif(p ->> 'appareils_max', '')::integer,
            nullif(p ->> 'formule_suivante', ''), coalesce((p ->> 'actif')::boolean, true), coalesce((p ->> 'ordre')::integer, 0),
            coalesce((p ->> 'coupure_midi')::boolean, false))
    returning id into resultat;
  else
    update public.licence_modeles set
      nom = btrim(p ->> 'nom'), description = nullif(btrim(p ->> 'description'), ''), offre_id = v_offre.id, formule = p ->> 'formule',
      duree_jours = nullif(p ->> 'duree_jours', '')::integer, montant = coalesce((p ->> 'montant')::numeric, 0),
      frais_installation = coalesce((p ->> 'frais_installation')::numeric, 0), appareils_max = nullif(p ->> 'appareils_max', '')::integer,
      formule_suivante = nullif(p ->> 'formule_suivante', ''), actif = coalesce((p ->> 'actif')::boolean, true), ordre = coalesce((p ->> 'ordre')::integer, 0),
      coupure_midi = coalesce((p ->> 'coupure_midi')::boolean, coupure_midi)
    where id = v_id
    returning id into resultat;
    if resultat is null then
      raise exception 'Modèle introuvable';
    end if;
  end if;
  return resultat;
end
$$;
