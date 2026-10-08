Des politiques RLS historiques permettent encore des écritures directes sur sept tables, dont une promotion de membre qui contourne les limites de la RPC. Une nouvelle migration retire seulement les huit politiques d'écriture, conserve les lectures et RPC autorisées, ferme l'accès API à un helper interne et ajoute deux verrous d'établissement manquants. Une seconde migration couvre 190 clés étrangères par 189 index.

Les tests vérifient le catalogue après toutes les migrations (RLS, politiques, SECURITY DEFINER et exceptions documentées, déclencheurs, index, vues), ainsi que les attaques et les droits légitimes. Les anciens tests qui attendaient des écritures directes ont été renforcés.

Preuves : attaque avant échoue au contrôle, après bloquée ; catalogue 4 échecs avant / 7 réussites après ; suite complète 490/490 (51 fichiers), build réussi. Reconstruction Supabase Docker bloquée ici par le registre public.ecr.aws (403), CI obligatoire avant suite.

NE PAS FUSIONNER avant la séquence base protégée et les vérifications : comparaison production en lecture seule, sauvegarde réussie, simulation avec la liste EXACTE suivante, application avec JE CONFIRME, vérification. Aucun autre fichier ni migration immobilier :
- 20261012000001_fermer_ecritures_directes.sql
- 20261012000002_indexer_cles_etrangeres.sql

Aucune migration appliquée en production dans cette mission.


État externe : branche poussée, PR non créée (API GitHub Forbidden), CI distante/base/production non vérifiées. Les résultats cités sont locaux.

Prérequis : `codex/audit-013-tests-fictifs` est intégré pour supprimer les données réelles des tests. Base de revue temporaire : cette branche ; retargeter main après sa fusion verte. Aucune fusion effectuée.

Les mêmes contrôles de catalogue sont ajoutés à reconstruction-supabase après db reset, via un lecteur psql strictement local et en transaction read only. Gardes d’adresse testées ; exécution sur PostgreSQL réel non prouvée ici faute d’accès au registre Docker/CI.

SOP03/05/12 et modèle documentaire alignés sur les règles actuelles ; deux tests compilent/rejouent le modèle, auparavant en échec sur une fonction a_acces absente. Aucune migration existante modifiée.

Vérification commune locale (sept thèmes réunis, e50a8a9) : npmci, lint0,509/509tests (56fichiers), deuxbuilds/tousJS<=500000octets, Commerce/Restaurant/impression réussis, console navigateur vide. Aucun résultat CI/production déduit.
