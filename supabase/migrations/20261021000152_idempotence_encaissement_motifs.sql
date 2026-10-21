-- Demandé par le CRM (SUPERADMIN 2.0, lot 5) : PR proposée, NON APPLIQUÉE. À appliquer seulement avec l'accord écrit
-- de Juste, par le workflow « Déploiement de la base » (sauvegarde, simulation, application), base avant site.
--
-- 1. Clé d'idempotence des encaissements : le CRM envoie un identifiant d'opération « OP-… » comme référence du
--    renouvellement. Deux envois de la même opération (réponse perdue, deux onglets au même instant) ne prolongent
--    la licence qu'une fois : le second renvoie l'échéance déjà enregistrée. Garanti par un index unique partiel
--    et par la vérification faite sous le verrou de la licence.
-- 2. Motif des gestes de l’équipe éditeur : definir_statut_client, definir_statut_etablissement et
--    definir_module_etablissement acceptent un motif (facultatif, compatible avec les appels actuels) et le gardent
--    dans journal_audit.
--
-- Additive et réversible : retour arrière en fin de fichier (en commentaire). Aucune donnée existante modifiée.
-- Pré-requis vérifié en lecture : aucune référence « OP-% » en double dans licence_evenements (sinon l'index échoue
-- et rien n'est appliqué).

create unique index if not exists licence_evenements_reference_operation_unique
  on public.licence_evenements (reference)
  where reference like 'OP-%';

create or replace function public.renouveler_licence(
  p_licence_id uuid,
  p_nouvelle_echeance date default null,
  p_montant numeric default 0,
  p_reference text default null,
  p_note text default null
)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  licence public.licences%rowtype;
  base date;
  nouvelle date := p_nouvelle_echeance;
  deja public.licence_evenements%rowtype;
begin
  perform public.exiger_editeur();
  select * into licence from public.licences where id = p_licence_id for update;
  if licence.id is null or licence.statut = 'terminee' then
    raise exception 'Licence introuvable ou terminée';
  end if;
  -- Idempotence : même opération déjà enregistrée → on renvoie son échéance, rien n'est refait
  if p_reference like 'OP-%' then
    select * into deja from public.licence_evenements where reference = p_reference;
    if deja.id is not null then
      if deja.licence_id <> p_licence_id then
        raise exception 'Cette référence d''opération appartient à une autre licence';
      end if;
      return deja.nouvelle_echeance;
    end if;
  end if;
  if coalesce(p_montant, 0) < 0 then
    raise exception 'Le montant ne peut pas être négatif';
  end if;
  -- Le renouvellement part de l'échéance, ou d'aujourd'hui si elle est dépassée.
  base := greatest(coalesce(licence.echeance, current_date), current_date);
  if nouvelle is null then
    nouvelle := case licence.formule
      when 'mensuel' then (base + interval '1 month')::date
      when 'annuel' then (base + interval '1 year')::date
      else null
    end;
  end if;
  if nouvelle is null or nouvelle <= coalesce(licence.echeance, licence.debut) then
    raise exception 'La nouvelle échéance doit être postérieure à l''actuelle';
  end if;
  update public.licences set echeance = nouvelle where id = p_licence_id;
  insert into public.licence_evenements(licence_id, etablissement_id, type, ancienne_echeance, nouvelle_echeance, montant, reference, motif, acteur)
  values (p_licence_id, licence.etablissement_id, 'renouvellement', licence.echeance, nouvelle, coalesce(p_montant, 0), nullif(btrim(p_reference), ''), nullif(btrim(p_note), ''), auth.uid());
  return nouvelle;
end
$$;

-- Motif : nouvelle signature avec p_motif facultatif (l'ancienne est retirée pour éviter deux fonctions homonymes)
drop function if exists public.definir_statut_client(uuid, text);
create function public.definir_statut_client(p_client_id uuid, p_statut text, p_motif text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  avant text;
begin
  perform public.exiger_editeur();
  if p_statut not in ('actif', 'suspendu', 'archive') then raise exception 'Statut client invalide'; end if;
  select statut into avant from public.clients where id = p_client_id;
  update public.clients set statut = p_statut where id = p_client_id;
  insert into public.journal_audit(table_nom, operation, ligne_id, acteur, avant, apres)
  values ('clients', 'UPDATE', p_client_id::text, auth.uid(), jsonb_build_object('statut', avant), jsonb_build_object('statut', p_statut, 'motif', nullif(btrim(p_motif), '')));
end
$$;
revoke execute on function public.definir_statut_client(uuid, text, text) from public, anon;
grant execute on function public.definir_statut_client(uuid, text, text) to authenticated;

drop function if exists public.definir_statut_etablissement(uuid, text);
create function public.definir_statut_etablissement(p_etablissement_id uuid, p_statut text, p_motif text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  avant text;
begin
  perform public.exiger_editeur();
  if p_statut not in ('actif', 'suspendu', 'archive') then raise exception 'Statut établissement invalide'; end if;
  select statut into avant from public.etablissements where id = p_etablissement_id;
  update public.etablissements set statut = p_statut where id = p_etablissement_id;
  insert into public.journal_audit(table_nom, operation, ligne_id, etablissement_id, acteur, avant, apres)
  values ('etablissements', 'UPDATE', p_etablissement_id::text, p_etablissement_id, auth.uid(), jsonb_build_object('statut', avant), jsonb_build_object('statut', p_statut, 'motif', nullif(btrim(p_motif), '')));
end
$$;
revoke execute on function public.definir_statut_etablissement(uuid, text, text) from public, anon;
grant execute on function public.definir_statut_etablissement(uuid, text, text) to authenticated;

drop function if exists public.definir_module_etablissement(uuid, text, boolean);
create function public.definir_module_etablissement(p_etablissement_id uuid, p_module_id text, p_actif boolean, p_motif text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.exiger_editeur();
  insert into public.etablissement_modules(etablissement_id, module_id, actif, active_le, active_par, source)
  values (p_etablissement_id, p_module_id, p_actif, case when p_actif then now() end, auth.uid(), 'manuel')
  on conflict (etablissement_id, module_id) do update
  set actif = excluded.actif, active_le = excluded.active_le, active_par = excluded.active_par, source = 'manuel';
  insert into public.journal_audit(table_nom, operation, ligne_id, etablissement_id, acteur, apres)
  values ('etablissement_modules', 'UPDATE', p_etablissement_id::text || ':' || p_module_id, p_etablissement_id, auth.uid(), jsonb_build_object('module', p_module_id, 'actif', p_actif, 'motif', nullif(btrim(p_motif), '')));
end
$$;
revoke execute on function public.definir_module_etablissement(uuid, text, boolean, text) from public, anon;
grant execute on function public.definir_module_etablissement(uuid, text, boolean, text) to authenticated;

-- Retour arrière (à exécuter seulement si besoin, par le même workflow) :
--   drop index if exists public.licence_evenements_reference_operation_unique;
--   -- renouveler_licence : recréer la version de 20261002000010_comptes_admin.sql (ligne « CREATE OR REPLACE FUNCTION public.renouveler_licence »)
--   drop function if exists public.definir_statut_client(uuid, text, text);
--   drop function if exists public.definir_statut_etablissement(uuid, text, text);
--   drop function if exists public.definir_module_etablissement(uuid, text, boolean, text);
--   -- puis recréer les trois fonctions depuis 20261002000010_comptes_admin.sql et leurs droits (grant … to authenticated)
--   -- (les lignes ajoutées à journal_audit restent : le journal est en ajout seul)
