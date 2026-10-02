# Sécurité et règles d'accès

## Qui voit quoi
| Acteur | Lecture | Écriture |
|---|---|---|
| `anon` | rien | rien |
| Membre actif d'un établissement actif | les données de **son** établissement, pour les modules activés, selon ses permissions | selon ses permissions, si l'établissement est `actif` et le module activé |
| Dirigeant / lecteur d'un client | tous les établissements de ce client | rien (sauf via son éventuel rôle de membre) |
| Gérant | son établissement : identité, paramètres, membres | idem |
| Éditeur (`plateforme_admins`) | catalogue, clients, établissements, modules, membres (administration) | via des fonctions dédiées (tâche 004) |
| Éditeur en mode support | les données d'un établissement, **après ouverture d'une session support journalisée** (motif, 8 h) | non |

## Calcul d'une permission
Pour avoir la permission P (`module.action`) dans l'établissement E, il faut :
1. être membre actif de E ;
2. que E soit `actif`, que son client soit actif et que sa licence soit valide (sinon la lecture reste possible mais l'écriture est refusée) ;
3. que le module de P soit couvert par la licence et activé pour E ;
4. que P soit dans le rôle, sauf si `permissions_ajustees` la retire (`false`) ; ou qu'elle soit ajoutée par `permissions_ajustees` (`true`).

## Règles techniques
- RLS est activée sur toute table de `public`, et chaque politique s'appuie sur des fonctions `security definer` avec un `search_path` fixé.
- `etablissement_id` ne change jamais après la création d'une ligne. `solution_id` d'un établissement ne change jamais.
- Un module ne s'active pour un établissement que s'il est proposé par sa solution et que ses dépendances sont actives.
- Toute écriture sensible est inscrite dans `journal_audit`, avec l'acteur et le drapeau `mode_support`.
- Aucun secret dans le dépôt. Les tests tournent sur une base locale (PGlite), jamais sur une base distante.
- Équipe : rôle attribué ≤ rôle de celui qui l'attribue ; pas de modification de son propre accès ; au moins un gérant actif ; `membres.gerer` donné à un non-gérant par Agence Elite seulement.
- Licences, offres et historique : écriture réservée aux super administrateurs, historique en ajout seul.
- Droits retirés à tous : `TRUNCATE`, `TRIGGER`, `REFERENCES`, séquences ; `anon` n'exécute aucune fonction.
- Images (logo, photo, justificatif) : `data:image/…` ou `https://` uniquement.
- En ligne : connexion à un Supabase hébergé seulement si `VITE_AUTORISER_SUPABASE_DISTANT=oui` ; en-têtes de sécurité dans `public/_headers` ; secrets dans l'environnement GitHub `production`, jamais dans le dépôt.
