-- Le Kangourou : remettre les fonctions de la version de septembre 2026 qui ne sont pas dans l'offre d'essai Commerce.
-- Demandé par Juste le 2026-11-04 (« remets-les toutes »). Comparaison faite avec l'ancienne version :
--   déjà présents : point de vente, articles (photo), stock, ventes et ventes à crédit, paiements, reçus 80 mm,
--   clients (contacts, reste dû), dépenses, tableau de bord, équipe et rôles, clôture de caisse ;
--   ajoutés ici : « Devis et factures » (devis / proforma, factures A4) et « Rapports et analyses »
--   (ventes et dépenses sur plusieurs mois, meilleurs articles).
-- Les deux modules sont ajoutés à la licence d'essai (modules vendus en plus, montant 0) puis activés.
-- Exécutée UNIQUEMENT par le workflow « Corriger des données » (simulation, puis appliquer = JE CONFIRME après une
-- sauvegarde). Le script s'arrête si l'état n'est pas celui créé par 20261104_creation_essai_un_mois.sql.
\set ON_ERROR_STOP on
begin;
set local statement_timeout = '60s';

do $$
declare
  etab uuid;
  essai public.licences%rowtype;
  ajout text[] := array['facturation', 'rapports'];
  m text;
  n integer;
begin
  select e.id into etab from public.etablissements e join public.clients c on c.id = e.client_id
  where c.nom = 'Le Kangourou' and e.nom = 'Le Kangourou' and e.solution_id = 'commerce';
  if etab is null then raise exception 'Établissement Le Kangourou introuvable : arrêt'; end if;

  select * into essai from public.licences where etablissement_id = etab and statut <> 'terminee';
  if essai.id is null or essai.formule <> 'essai' or essai.fin_a is distinct from '2026-12-04 11:00:00+00'::timestamptz then
    raise exception 'État inattendu de la licence (%, %, %) : arrêt', essai.id, essai.formule, essai.fin_a;
  end if;

  update public.licences
  set modules_supplementaires = array(select distinct x from unnest(modules_supplementaires || ajout) x order by x)
  where id = essai.id;

  foreach m in array ajout loop
    insert into public.etablissement_modules(etablissement_id, module_id, actif, active_le, active_par, source)
    values (etab, m, true, now(), null, 'manuel')
    on conflict (etablissement_id, module_id) do update set actif = true, active_le = now(), source = 'manuel';
  end loop;

  select count(*) into n from public.etablissement_modules
  where etablissement_id = etab and actif and module_id = any (ajout);
  if n <> 2 then raise exception 'Résultat inattendu : % modules ajoutés actifs : arrêt', n; end if;
  if not public.licence_valide(etab) or public.licence_coupee(etab) then raise exception 'Licence non valide : arrêt'; end if;
  raise notice 'Résultat : Devis et factures + Rapports et analyses actifs sur %', etab;
end
$$;

\if :appliquer
  commit;
  \echo 'APPLIQUÉ.'
\else
  rollback;
  \echo 'SIMULATION : tout a été annulé, rien n''est écrit.'
\endif
