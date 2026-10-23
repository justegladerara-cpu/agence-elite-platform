-- Ventes : plus de détails et ventes d'essai (demande de Juste, 2026-10-23).
-- 1. infos_vente : qui a encaissé, quelle caisse, quel ticket Z, qui a annulé, les offerts et le pourboire, en une
--    lecture (les noms ne sont pas lisibles directement par l'écran).
-- 2. Ventes d'essai : les essais faits au démarrage peuvent être marqués « essai ». Une vente validée est d'abord
--    annulée (motif « Vente d'essai » : stock remis, paiements annulés, règles habituelles), puis rangée dans
--    ventes_essais. L'écran Ventes les cache. Aucune vente n'est effacée : les ventes sont protégées contre la
--    suppression (refuser_suppression) et un ticket Z déjà tiré garde ses chiffres.
-- Additif : une table, deux fonctions.

create table public.ventes_essais (
  vente_id uuid primary key references public.ventes(id) on delete restrict,
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  marque_par uuid not null references auth.users(id) on delete restrict,
  marque_le timestamptz not null default now()
);
create index ventes_essais_etablissement_idx on public.ventes_essais(etablissement_id);
alter table public.ventes_essais enable row level security;
create policy lecture on public.ventes_essais for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'ventes.lire'));

create or replace function public.infos_vente(p_vente_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.ventes%rowtype;
  r jsonb;
begin
  select * into v from public.ventes where id = p_vente_id;
  if v.id is null then
    raise exception 'Vente introuvable';
  end if;
  if not (public.lecture_autorisee(v.etablissement_id, 'ventes.lire') or v.vendeur = auth.uid()) then
    raise exception 'Accès refusé';
  end if;
  select jsonb_build_object(
    'caissier', (select coalesce(nullif(p.nom_affiche, ''), nullif(p.nom_complet, ''), 'Utilisateur') from public.profils p where p.id = v.vendeur),
    'annulee_par', (select coalesce(nullif(p.nom_affiche, ''), nullif(p.nom_complet, ''), 'Utilisateur') from public.profils p where p.id = v.annulee_par),
    -- Personne qui tenait la caisse : différente du vendeur quand le patron a vendu sur la caisse d'une caissière.
    'caisse_tenue_par', (select coalesce(nullif(p.nom_affiche, ''), nullif(p.nom_complet, ''), 'Utilisateur')
                         from public.sessions_caisse s join public.profils p on p.id = s.ouverte_par where s.id = v.session_caisse_id),
    'vendu_par_autre', coalesce((select s.ouverte_par is distinct from v.vendeur from public.sessions_caisse s where s.id = v.session_caisse_id), false),
    'point_de_vente', (select pdv.nom from public.points_de_vente pdv where pdv.id = v.point_de_vente_id),
    'hub', (select h.nom from public.hubs h where h.id = v.hub_id),
    'caisse_ouverte_le', (select s.ouverte_le from public.sessions_caisse s where s.id = v.session_caisse_id),
    'ticket_z', (select jsonb_build_object('numero', k.numero, 'cloturee_le', k.cloturee_le)
                 from public.clotures k where k.session_caisse_id = v.session_caisse_id),
    'offerts', (select coalesce(jsonb_agg(jsonb_build_object('libelle', o.libelle, 'quantite', o.quantite, 'valeur', o.valeur,
                  'raison', o.raison, 'precision', o.precision_raison) order by o.cree_le), '[]'::jsonb)
                from public.offerts o where o.vente_id = v.id),
    'pourboire', (select jsonb_build_object('montant', pb.montant, 'mode', pb.mode, 'serveur', pb.serveur)
                  from public.pourboires pb where pb.vente_id = v.id),
    'essai', (select jsonb_build_object('marque_le', e.marque_le,
                'marque_par', (select coalesce(nullif(p.nom_affiche, ''), nullif(p.nom_complet, ''), 'Utilisateur') from public.profils p where p.id = e.marque_par))
              from public.ventes_essais e where e.vente_id = v.id)
  ) into r;
  return r;
end
$$;
revoke execute on function public.infos_vente(uuid) from public, anon;
grant execute on function public.infos_vente(uuid) to authenticated;

create or replace function public.marquer_vente_essai(p_vente_id uuid, p_essai boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.ventes%rowtype;
begin
  select * into v from public.ventes where id = p_vente_id;
  if v.id is null then
    raise exception 'Vente introuvable';
  end if;
  -- Réservé au patron ou au responsable : il faut pouvoir annuler et fermer les caisses.
  perform public.exiger_permission(v.etablissement_id, 'ventes.annuler');
  perform public.exiger_permission(v.etablissement_id, 'cloture.cloturer');
  if not p_essai then
    delete from public.ventes_essais where vente_id = v.id;
    return jsonb_build_object('vente_id', v.id, 'essai', false, 'statut', v.statut);
  end if;
  if v.statut = 'validee' then
    perform public.annuler_vente(v.id, 'Vente d''essai');
  end if;
  insert into public.ventes_essais(vente_id, etablissement_id, marque_par)
  values (v.id, v.etablissement_id, auth.uid())
  on conflict (vente_id) do nothing;
  return jsonb_build_object('vente_id', v.id, 'essai', true, 'statut', 'annulee');
end
$$;
revoke execute on function public.marquer_vente_essai(uuid, boolean) from public, anon;
grant execute on function public.marquer_vente_essai(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
