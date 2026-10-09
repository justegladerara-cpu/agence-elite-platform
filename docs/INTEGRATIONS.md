# Intégrations (socle commun)

Migration `20261010000103_integrations.sql`, écran **Paramètres › Connexions** (`src/modules/etablissement/Connexions.jsx`),
catalogue partagé `src/noyau/integrations.js`, serveur `serveur/integrations/` et fonctions Cloudflare
`functions/api/integrations.js` et `functions/api/webhooks/[fournisseur]/[connexion].js`. Mode d'emploi : SOP 60.

## Ce que fait le socle
- **Une connexion par établissement et par service** (`integrations_connexions`) : mode `test` ou `reel`, réglages non
  secrets, aperçu de la clé (`••••abcd`), activation et désactivation en un clic (rien ne se supprime).
- **Secrets chiffrés** : la clé saisie part au serveur Cloudflare, qui la chiffre (AES-GCM 256, clé maîtresse
  `INTEGRATIONS_CLE`) avant de l'enregistrer dans `integrations_secrets`. Cette table n'a aucune règle de lecture :
  personne ne la lit depuis l'interface. Seule la fonction `lire_secrets_integration` (gérant, droit
  `etablissement.integrations`) rend le texte chiffré au serveur, qui seul sait le déchiffrer.
- **Les réglages refusent les clés** : un nom de champ contenant secret, cle, key, token, password ou mot_de_passe est
  refusé par la base.
- **Webhooks signés et idempotents** : adresse `/api/webhooks/<service>/<connexion>`, en-tête
  `x-ae-signature: t=<horodatage>,v1=<HMAC-SHA256 de "t.corps">`, tolérance 5 minutes, comparaison à temps constant,
  corps limité à 64 Ko. Un même événement reçu deux fois est noté « doublon » et n'est pas retraité.
- **Journal des appels** (`integrations_journal`) : chaque test, appel sortant et événement reçu, avec statut, code,
  durée et erreur. Visible dans l'écran Connexions (20 derniers).
- **Adaptateur commun** (`serveur/integrations/adaptateurs.js`) : chaque service fournit `tester` et `verifierWebhook`.
  Aucun pays, aucune devise, aucun fournisseur n'est imposé par le socle.

## Statut des 10 intégrations
| Service | Statut | Pourquoi |
|---|---|---|
| Bac à sable Agence Elite | Bêta : mode test | Fournisseur fictif interne, sert à essayer le socle de bout en bout |
| Mobile Money | Prévu | Bloqué : agrégateur à choisir et accès à son bac à sable |
| Paiement par carte | Prévu | Bloqué : compte de test du prestataire |
| WhatsApp Business | Prévu | Bloqué : compte WhatsApp Business et numéro de test |
| E-mail transactionnel | Prévu | Bloqué : fournisseur d'envoi à choisir |
| SMS | Prévu | Bloqué : fournisseur SMS à choisir |
| Google / Microsoft | Prévu | Bloqué : application OAuth à déclarer |
| Logiciel comptable | Prévu | Bloqué : logiciel cible à choisir |
| Channel manager | Prévu | Bloqué : channel manager à choisir |
| Livraison et réseaux sociaux | Prévu | Bloqué : plateforme à choisir |
| Matériel de caisse | Prévu | Bloqué : matériel à valider |

Règle : un service ne passe « Disponible » qu'après un test réussi contre le **vrai bac à sable du fournisseur**.

## Installation côté serveur (une fois, par Juste)
Dans Cloudflare › Pages › `agence-elite-saas` › Paramètres › Variables et secrets, ajouter en **secret** :
1. `INTEGRATIONS_CLE` : 32 octets aléatoires en base64 (par exemple `openssl rand -base64 32`). Ne jamais la changer
   sans re-chiffrer les clés déjà enregistrées.
2. `SUPABASE_SERVICE_ROLE_KEY` : nécessaire seulement pour recevoir des webhooks.

Sans `INTEGRATIONS_CLE`, l'écran affiche les services mais refuse d'enregistrer une clé (réponse 503, message clair).

## Limites connues
- Aucun vrai fournisseur n'est branché : seul le bac à sable interne fonctionne.
- La démo locale (sans serveur) affiche le catalogue mais ne permet pas de connecter.
- Rotation de la clé maîtresse : pas encore d'outil de re-chiffrement.
- Pas de nouvelle tentative automatique pour un appel sortant en échec (le journal le montre).
- Webhooks sortants (vers les outils du client) : pas encore faits.
