-- Le Kangourou (Pointe-Noire) : création du client, de son établissement Commerce et d'un essai d'un mois.
-- Demandé par Juste le 2026-11-04 : essai du 04/11/2026 au vendredi 04/12/2026 à 12h00 heure de Brazzaville (11h00 UTC).
-- À cette heure : écran « Licence expirée », plus de vente, plus de caisse, plus de stock ; les données restent intactes.
-- Le renouvellement se fait par code de licence depuis le CRM (Clients logiciel > Le Kangourou > Générer une licence).
-- Comptes sans e-mail (connexion par identifiant) :
--   achille.kangou  Achille KANGOU, PDG                      rôle Gérant
--   itoua           ITOUA, Directeur technique               rôle Responsable
--   narcie.kangou   Narcie KANGOU, Assistante de direction   rôle Responsable
-- Aucun mot de passe ici : chaque compte reçoit un mot de passe aléatoire que personne ne connaît. Agence Elite donne
-- ensuite un mot de passe temporaire à chacun avec « Réinitialiser le mot de passe » (changement obligatoire à la
-- première connexion).
-- Exécutée UNIQUEMENT par le workflow « Corriger des données » (simulation = tout est annulé ; appliquer = JE CONFIRME,
-- après une sauvegarde). Le script s'arrête si Le Kangourou ou un des identifiants existe déjà.
\set ON_ERROR_STOP on
begin;
set local statement_timeout = '60s';

do $$
declare
  client uuid;
  etab uuid;
  essai public.licences%rowtype;
  fin timestamptz := '2026-12-04 11:00:00+00';
  compte record;
  nouvel_id uuid;
  n integer;
begin
  if exists (select 1 from public.clients where lower(btrim(nom)) in ('le kangourou', 'kangourou')) then
    raise exception 'Le client Le Kangourou existe déjà : arrêt';
  end if;
  if exists (select 1 from public.comptes_connexion
             where lower(identifiant) in ('achille.kangou', 'itoua', 'narcie.kangou')) then
    raise exception 'Un des identifiants existe déjà : arrêt';
  end if;
  if not exists (select 1 from public.offres where solution_id = 'commerce' and offre_essai and actif) then
    raise exception 'Aucune offre d''essai Commerce active : arrêt';
  end if;
  if now() >= fin then raise exception 'L''heure de fin est déjà passée : arrêt'; end if;

  -- 1. Client
  insert into public.clients(nom, pays, devise_facturation, contact)
  values ('Le Kangourou', 'Congo', 'XAF',
          jsonb_build_object('responsable', 'Achille KANGOU (PDG)', 'telephone', '', 'email', '', 'adresse', 'Pointe-Noire'))
  returning id into client;

  -- 2. Établissement Commerce (modules par défaut, Hub principal, caisse principale, essai automatique de 30 jours)
  etab := public.initialiser_etablissement(client, 'commerce', 'Le Kangourou');
  update public.etablissements set ville = 'Pointe-Noire', pays = 'Congo' where id = etab;

  -- 3. Essai : fin précise le 04/12/2026 à 12h00 (Brazzaville)
  select * into essai from public.licences where etablissement_id = etab and statut <> 'terminee';
  if essai.id is null or essai.formule <> 'essai' then raise exception 'Essai automatique absent : arrêt'; end if;
  update public.licences
  set echeance = '2026-12-04', fin_a = fin,
      note = 'Essai d''un mois : du 04/11/2026 au 04/12/2026 12h00 (Brazzaville)'
  where id = essai.id;

  -- 4. Catégories d'articles du Kangourou (reprises de la version de septembre)
  insert into public.categories_articles(etablissement_id, nom)
  select etab, c from unnest(array['Robinetterie', 'Vannes', 'EPI', 'Tôles noires', 'Chiffons', 'Peinture', 'Tiges',
                                   'Outillage', 'Consommables', 'Autre']) c
  on conflict do nothing;

  -- 5. Comptes par identifiant (mot de passe aléatoire inconnu, à réinitialiser par Agence Elite)
  for compte in
    select * from (values ('achille.kangou', 'Achille KANGOU', 'gerant'),
                          ('itoua', 'ITOUA', 'responsable'),
                          ('narcie.kangou', 'Narcie KANGOU', 'responsable')) v(identifiant, nom, role_id)
  loop
    nouvel_id := public.creer_compte_auth(null, compte.identifiant, compte.nom,
                                          replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 30);
    insert into public.etablissement_membres(etablissement_id, user_id, role_id) values (etab, nouvel_id, compte.role_id);
  end loop;

  -- Contrôles
  select count(*) into n from public.etablissement_membres where etablissement_id = etab;
  if n <> 3 then raise exception 'Résultat inattendu : % membres : arrêt', n; end if;
  if not public.licence_valide(etab) or public.licence_coupee(etab) then raise exception 'Résultat inattendu : licence non valide : arrêt'; end if;
  raise notice 'Résultat : client %, établissement %, essai % jusqu''au 04/12/2026 12h00 (Brazzaville), 3 comptes', client, etab, essai.id;
end
$$;

\if :appliquer
  commit;
  \echo 'APPLIQUÉ.'
\else
  rollback;
  \echo 'SIMULATION : tout a été annulé, rien n''est écrit.'
\endif
