-- Tarifs Agence Elite (2026-10-02) : frais de mise en service et support séparé.
-- Les prix restent des données des offres, modifiables dans l'espace Agence Elite ;
-- aucune logique ne dépend d'un montant.

alter table public.offres
  add column prix_mise_en_service numeric(14, 2) not null default 0 check (prix_mise_en_service >= 0),
  add column prix_support_mensuel numeric(14, 2) not null default 0 check (prix_support_mensuel >= 0);

-- Support : contrat séparé, non inclus par défaut.
alter table public.licences add column support boolean not null default false;

alter table public.licence_evenements drop constraint licence_evenements_type_check;
alter table public.licence_evenements add constraint licence_evenements_type_check
  check (type in ('attribution', 'renouvellement', 'suspension', 'reactivation', 'fin', 'support'));

-- Tarifs de départ (seulement si encore à 0, pour ne jamais écraser une saisie).
update public.offres set
  prix_acquisition = 450000, prix_mise_en_service = 50000, prix_mensuel = 25000, prix_annuel = 150000
where solution_id = 'commerce' and id in ('commerce-caisse', 'commerce-complet')
  and prix_acquisition = 0 and prix_mensuel = 0 and prix_annuel = 0;

create or replace function public.enregistrer_offre(p_offre jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  modules_offre text[] := coalesce(array(select jsonb_array_elements_text(p_offre -> 'modules')), '{}');
  identifiant text := lower(btrim(coalesce(p_offre ->> 'id', '')));
  solution text := coalesce(p_offre ->> 'solution_id', 'commerce');
begin
  perform public.exiger_super_admin();
  if identifiant = '' then
    raise exception 'L''identifiant de l''offre est obligatoire';
  end if;
  perform public.verifier_modules_offre(solution, modules_offre);
  insert into public.offres(id, solution_id, nom, description, modules, prix_acquisition, prix_mise_en_service, prix_mensuel,
    prix_annuel, prix_support_mensuel, devise, actif, ordre)
  values (
    identifiant, solution, btrim(p_offre ->> 'nom'), nullif(btrim(p_offre ->> 'description'), ''), modules_offre,
    coalesce((p_offre ->> 'prix_acquisition')::numeric, 0), coalesce((p_offre ->> 'prix_mise_en_service')::numeric, 0),
    coalesce((p_offre ->> 'prix_mensuel')::numeric, 0), coalesce((p_offre ->> 'prix_annuel')::numeric, 0),
    coalesce((p_offre ->> 'prix_support_mensuel')::numeric, 0), coalesce(nullif(p_offre ->> 'devise', ''), 'XAF'),
    coalesce((p_offre ->> 'actif')::boolean, true), coalesce((p_offre ->> 'ordre')::integer, 0)
  )
  on conflict (id) do update set
    nom = excluded.nom, description = excluded.description, modules = excluded.modules,
    prix_acquisition = excluded.prix_acquisition, prix_mise_en_service = excluded.prix_mise_en_service,
    prix_mensuel = excluded.prix_mensuel, prix_annuel = excluded.prix_annuel,
    prix_support_mensuel = excluded.prix_support_mensuel, devise = excluded.devise, actif = excluded.actif, ordre = excluded.ordre
  where public.offres.solution_id = excluded.solution_id;
  return identifiant;
end
$$;

-- Ajouter ou retirer le contrat de support d'une licence en cours (tracé).
create function public.definir_support_licence(
  p_licence_id uuid,
  p_support boolean,
  p_montant numeric default 0,
  p_reference text default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  licence public.licences%rowtype;
begin
  perform public.exiger_super_admin();
  select * into licence from public.licences where id = p_licence_id for update;
  if licence.id is null or licence.statut = 'terminee' then
    raise exception 'Licence introuvable ou terminée';
  end if;
  if p_support is null then
    raise exception 'Indiquer si le support est inclus';
  end if;
  if coalesce(p_montant, 0) < 0 or coalesce(p_montant, 0) = 'NaN'::numeric then
    raise exception 'Montant invalide';
  end if;
  if licence.support = p_support then
    return;
  end if;
  update public.licences set support = p_support where id = p_licence_id;
  insert into public.licence_evenements(licence_id, etablissement_id, type, ancienne_echeance, nouvelle_echeance, montant, reference, motif, acteur)
  values (
    p_licence_id, licence.etablissement_id, 'support', licence.echeance, licence.echeance, coalesce(p_montant, 0),
    nullif(btrim(p_reference), ''), coalesce(nullif(btrim(p_note), ''), case when p_support then 'Support ajouté' else 'Support retiré' end), auth.uid()
  );
end
$$;
revoke execute on function public.definir_support_licence(uuid, boolean, numeric, text, text) from public, anon;
grant execute on function public.definir_support_licence(uuid, boolean, numeric, text, text) to authenticated;

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
    'valide', public.licence_valide(p_etablissement_id)
  )
  from public.licences l
  join public.offres o on o.id = l.offre_id
  where l.etablissement_id = p_etablissement_id and l.statut <> 'terminee'
$$;
revoke execute on function public.resume_licence(uuid) from public, anon, authenticated;
