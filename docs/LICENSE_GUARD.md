# Elite License Guard — alertes d'échéance et renouvellement des licences

Statut : **en production depuis le 2026-10-21** (migration `20261021000151_elite_license_guard.sql`, PR #73 ; CRM PR #29).
Appliqué avec l'accord écrit de Juste, après sauvegarde ; pilote en production 88/88.

## En une phrase
Chaque matin, la plateforme regarde l'échéance de chaque licence, prévient au bon moment le gérant, le partenaire
Elite Partners et l'équipe Agence Elite, laisse le client demander son renouvellement… et **ne bloque jamais une vente
ni un encaissement** quand seule la date est dépassée.

## Ce qui est réutilisé (aucun doublon)
| Besoin | Existant réutilisé |
|---|---|
| Licence, échéance, formule, statut | `licences`, `licence_evenements` (migration 007) |
| Renouveler | `renouveler_licence` (super admin, référence du paiement) ; dans le CRM : « Encaisser » |
| Délai de grâce | règle de `licence_valide` : 7 jours (payant), 0 (essai) |
| Alertes | `notifications` + `notifier` + `membres_avec_permission` (migration 016), cloche existante |
| Prix pour renouveler | `offres.prix_mensuel` / `prix_annuel`, réglés dans l'espace éditeur (jamais dans le code) |
| Partenaire du client | `partenaire_clients`, `partenaires` (Elite Partners, migration 123) |
| Tâche planifiée | `pg_cron`, déjà utilisé (`fermer-caisses-echues`, `alerter-caisses-ouvertes`) |

Nouveau : 3 petites tables (`licence_alertes_reglages`, `licence_alertes`, `licence_demandes`) et des fonctions.

## Correspondance avec les statuts réels
`licences.statut` ne contient que `active`, `suspendue`, `terminee`. L'état d'échéance est **calculé**, jamais stocké
(`licence_etat`, même calcul à l'écran dans `src/noyau/continuite.js`) :

| Statut réel | Échéance | État affiché | Écriture | Caisse |
|---|---|---|---|---|
| `terminee` | — | Terminée (historique) | — | — |
| `suspendue` | — | Suspendue (décision manuelle) | bloquée | **bloquée** (inchangé) |
| `active` | vide (acquisition) | Sans échéance | oui | oui |
| `active` | > plus grand palier (30 j) | À jour | oui | oui |
| `active` | 8 à 30 j | Échéance proche | oui | oui |
| `active` | 1 à 7 j | À renouveler | oui | oui |
| `active` | aujourd'hui | Échéance aujourd'hui | oui | oui |
| `active` | échue, dans la grâce | Délai de grâce | oui | oui |
| `active` | échue, après la grâce | Expirée | **consultation seule** | **oui (nouveau)** |

## 1. Moteur d'échéance
- `licence_etat(statut, formule, echeance, jour)` : l'état ci-dessus.
- `licences_echeances(jour)` : toutes les licences en cours avec établissement, client, offre, jours restants, fin de
  grâce, état, prix de l'offre et partenaire. Interne (aucun droit pour `authenticated`).

## 2. Calendrier des alertes
Paliers par défaut : **J-30, J-15, J-7, J-3, J-1, jour J, J+1, J+3, J+7** (réglables par le super admin).
- Une alerte par licence, par échéance et par palier (`licence_alertes`, unique, ni modifiable ni supprimable).
- Jour manqué : le palier le plus proche franchi part **une seule fois** ; jamais un palier moins urgent après un plus
  urgent.
- Un renouvellement change l'échéance : un nouveau cycle commence.
- Rien n'est envoyé si la licence est suspendue, ou si l'établissement ou le client n'est pas actif (archivés exclus).

Destinataires :
| Qui | Quand | Lien |
|---|---|---|
| Responsables de l'établissement (permission `etablissement.modifier`, ex. gérant) | chaque palier | Paramètres › Mon abonnement |
| Partenaire Elite Partners du client (s'il est actif) | chaque palier (réglable) | espace partenaire |
| Équipe Agence Elite (super admin, admin) | à partir de J-7 (réglable) | CRM › Échéances |

La caissière n'est **jamais** prévenue (rien à faire de son côté, et la caisse continue).

Textes : toujours « Vos ventes et vos encaissements continuent quoi qu'il arrive ». Aucun texte ne dit qu'un paiement a
été reçu.

## 3. Tâche planifiée
`cron.schedule('alerter-echeances-licences', '0 7 * * *', 'select public.alerter_echeances_licences()')` : chaque jour à
07:00 UTC (08:00 à Brazzaville). Installée par la migration si `pg_cron` existe (c'est le cas en production).
- L'envoi réel n'est possible que par la tâche (fonction sans droit pour les comptes).
- `simuler_alertes_echeances()` (équipe Agence Elite) : ce qui partirait aujourd'hui, sans rien écrire.
- Désactiver : réglage `actif = false` dans le CRM, ou `select cron.unschedule('alerter-echeances-licences')`.

## 4. Interface SaaS (client)
- Bandeau : « Licence expirée : la caisse et les encaissements continuent, le reste est en consultation seule » ; avant
  l'échéance (J-7), le bandeau n'apparaît qu'aux responsables, avec un bouton « Renouveler ».
- Paramètres › **Mon abonnement** (`#/parametres/licence`) : offre, formule, état, échéance, fin du délai de grâce,
  partenaire, historique (renouvellements avec référence), demande de renouvellement, clé d'activation (inchangée).

## 5. Rôles
| Rôle | Voit | Fait |
|---|---|---|
| Super admin | tout | réglages des paliers, renouvellement (`renouveler_licence`), demandes |
| Admin Agence Elite | calendrier, demandes, journal, simulation | traiter une demande |
| Gérant / responsable (`etablissement.modifier`) et dirigeant | Mon abonnement complet, alertes | demander le renouvellement |
| Autres membres (caisse…) | état et échéance seulement | rien |
| Partenaire actif | échéances de **ses** clients | les appeler |
| Inconnu | rien | rien |

## 6. Protection de la caisse
`exiger_permission` (le contrôle de toutes les écritures) laisse passer une liste fermée de gestes de vente et
d'encaissement quand **seule l'échéance** bloque (`permissions_continuite()` + `caisse_continue()`) :
`caisse.utiliser`, `caisse.rattraper` (ventes hors ligne), `caisse.reserve`, `caisse.offerts_pertes`,
`cloture.cloturer` (ticket Z), `ventes.annuler`, `ventes.retourner`, `paiements.encaisser`, `fidelite.utiliser`,
`restaurant_salle.*` (servir, encaisser, affecter, transférer), `hotel_reservations.sejour`, `scolaire.encaisser`,
`immo_locations.encaisser`. Le menu QR des tables reste ouvert de la même façon.
Une **suspension manuelle** (licence, établissement ou client) bloque toujours, comme avant : c'est une décision
humaine. Le reste du logiciel (articles, réglages, équipe…) passe en consultation seule, comme avant.
Même liste à l'écran : `src/noyau/continuite.js` (test qui compare les deux).

## 7. Demandes de renouvellement
- `demander_renouvellement_licence(etablissement, formule, message, téléphone)` : responsable ou dirigeant, marche
  même licence expirée ; une seule demande ouverte à la fois ; prévient l'équipe et le partenaire.
- `traiter_demande_licence(demande, statut, note)` : équipe Agence Elite. **« Traitée » est refusé tant qu'aucun
  renouvellement (ou nouvelle licence) n'a été enregistré après la demande** : une demande ne se clôt jamais sur un
  paiement inventé. « Abandonnée » exige un motif. Le demandeur est prévenu.
- Une demande ne prolonge rien, ne crée ni facture ni paiement.

## 8. CRM
Écran CRM › Clients logiciel › **Échéances** (`#/plateforme-echeances`) : à traiter, calendrier, demandes, alertes
envoyées, réglages, simulation. Le renouvellement passe par « Encaisser » (licence + paiement du CRM, sans doublon).
Fonctions : `editeur_echeances(debut, fin)`, `simuler_alertes_echeances()`, `enregistrer_reglages_alertes_licences(p)`,
`traiter_demande_licence(...)`.

## 9. Sécurité
RLS sur les 3 tables (lecture : équipe, responsables de l'établissement ; partenaire par fonction seulement), écriture
uniquement par fonctions `security definer` à `search_path` vide, `revoke` pour `public`/`anon`, journal d'audit sur
les réglages et les demandes, alertes non modifiables et non supprimables, aucun secret, aucune donnée réelle.

## 10. Tests
`tests/license_guard.test.js` (19 tests) : états, simulation sans écriture, destinataires, jamais deux fois le même
palier, rattrapage, aucune création de paiement/renouvellement, suspension, droits, caisse qui vend et tire son Z après
expiration, reste bloqué, suspension manuelle qui bloque, même liste écran/base, demandes (droits, doublon, garde
« traitée »), Mon abonnement par rôle, calendrier et réglages réservés, partenaire isolé.

## Revenir en arrière
Migration additive. Pour annuler sans perte : nouvelle migration qui remet `exiger_permission` et
`emplacement_qr_ouvert` tels qu'en `20261002000004` et `20261012000131`, et `select cron.unschedule('alerter-echeances-licences')`.
Les tables peuvent rester (inertes) ; les supprimer n'efface aucune donnée métier.

## Mise en production (avec l'accord de Juste seulement)
Sauvegarde → « Déploiement de la base » `simulation` (doit lister exactement `20261021000151`) → `appliquer` +
`JE CONFIRME` → fusion de la PR plateforme → Pilote en production → fusion de la PR CRM.
Au premier passage de la tâche, les licences déjà dans la fenêtre reçoivent **une** alerte (palier le plus proche).
Vérifié en lecture le 2026-10-21 : Le Kangourou (essai, J-11) recevrait l'alerte J-15 ; The Dream (annuel, J-351)
rien ; H-2i (licence **suspendue** à la main) rien.

## 11. Heure de fin précise (migration `20261022000154_licence_heure_de_fin.sql`, 2026-10-22)
Demandé par Juste pour The Dream (licence annuelle non payée) : couper une licence à une **heure donnée**.
- Colonne facultative `licences.fin_a` (timestamptz). Sans elle, rien ne change pour les autres licences.
- Avant l'heure : tout marche. Dans les 72 dernières heures, toute l'équipe (caisse comprise) voit un bandeau
  permanent avec le compte à rebours (`src/ui/FinLicence.jsx`), un rappel toutes les 15 min qui ne prend jamais le
  clic, et les responsables une fenêtre à la connexion puis au plus toutes les 2 h.
- À l'heure : l'écran déconnecte les comptes ouverts ; la base (`licence_valide`, `caisse_continue`,
  `exiger_permission`) refuse toute écriture : plus de vente, d'encaissement, d'ouverture de caisse, de stock, menu QR
  fermé. Restent permis (`permissions_apres_coupure()`) : `caisse.rattraper` (ventes hors ligne d'avant) et
  `cloture.cloturer` (le responsable tire le Z d'une caisse restée ouverte). Consultation des données intacte.
- Les alertes quotidiennes ignorent ces licences (leur texte dit « la caisse continue »).
- Un renouvellement (échéance repoussée, `renouveler_licence`) ou une nouvelle licence efface la coupure.
- Mise en place pour The Dream : `donnees/corrections/the-dream/20261022_licence_fin_samedi_midi.sql` (workflow
  « Corriger des données ») : l'annuelle est terminée (« annuel non payé »), un essai finit le 24/10/2026 à 12h00
  (Brazzaville).
- Débloquer après paiement : attribuer la licence payée dans le CRM (Encaisser) ; la coupure disparaît.
