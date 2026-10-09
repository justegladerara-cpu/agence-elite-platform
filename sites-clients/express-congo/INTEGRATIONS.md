# État réel des intégrations

| Intégration                    | État                                                                                                                 | Variables / activation                                                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| SQLite                         | Locale, testable, données fictives                                                                                   | LOCAL_DATABASE_PATH ; jamais production                                                                                          |
| PostgreSQL                     | Schéma préparé, non raccordé à l’application                                                                         | Docker local ; npm run db:migrate ; DATABASE_URL pour futur repository                                                           |
| Supabase Database/Auth/Storage | Non connectée, adaptateurs de production à réaliser                                                                  | SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY ; EC-025. La présence de ces variables n’active pas une intégration  |
| Email                          | Non connectée, aucun email envoyé ; inscription et récupération affichent le message à l’écran en démonstration      | EMAIL_PROVIDER, EMAIL_API_KEY, EMAIL_FROM ; EC-022                                                                               |
| SMS                            | Non connectée                                                                                                        | SMS_PROVIDER, SMS_API_KEY ; EC-022                                                                                               |
| WhatsApp automatisé            | Non connectée                                                                                                        | WHATSAPP_API_KEY, WHATSAPP_PHONE_ID ; EC-022                                                                                     |
| WhatsApp manuel                | Lien observé, à vérifier, aucune persistance associée                                                                | EC-002 ; ouvre un service externe uniquement après clic                                                                          |
| Paiement                       | Hub en place : virement, Mobile Money et espèces configurables et affichés au client ; paiement en ligne non branché | PAYMENT_PROVIDER, PAYMENT_API_KEY, PAYMENT_WEBHOOK_SECRET ; EC-022                                                               |
| Analyse documentaire           | Non connectée, toutes les pièces restent en quarantaine                                                              | DOCUMENT_SCANNER_URL ; EC-027                                                                                                    |
| Netlify                        | Non déployé                                                                                                          | Préproduction persistante après connexion aux données ; autorisation d’aperçu hébergé à obtenir séparément du déploiement public |
| Statistiques/cartes tierces    | Absentes                                                                                                             | Consentement et textes à revoir avant ajout                                                                                      |

Procédure d’activation : choisir le prestataire, créer l’adaptateur serveur, ajouter ses tests contractuels, connecter un environnement d’essai, vérifier les erreurs et doublons, documenter les preuves, valider le registre puis ouvrir l’interrupteur. Activer un drapeau seul ne suffit pas. Les états non connectés ne doivent jamais être présentés comme des succès.

Authentification opérationnelle locale : démonstration, comptes prédéfinis, scrypt, cookie HttpOnly/SameSite strict, jetons hachés. Le second facteur est simulé ; aucun contrôle réel de possession d’email ou MFA de production n’est connecté. Les opérations, PDF, QR et exports privés sont soumis aux permissions serveur.

Suivi public : codes dérivés par HMAC de l’identifiant interne avec `TRACKING_SECRET` (32 caractères minimum, obligatoire hors démonstration). Changer ce secret change tous les codes déjà communiqués.

Paiement en ligne : déposer les clés comme **secrets du Worker** (Cloudflare → Workers & Pages → express-congo → Paramètres → Variables et secrets), jamais dans le dépôt ni dans l’application :

| Prestataire    | Secrets                                                              |
| -------------- | -------------------------------------------------------------------- |
| Stripe (carte) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`                         |
| MTN MoMo       | `MTN_MOMO_SUBSCRIPTION_KEY`, `MTN_MOMO_API_USER`, `MTN_MOMO_API_KEY` |
| Airtel Money   | `AIRTEL_MONEY_CLIENT_ID`, `AIRTEL_MONEY_CLIENT_SECRET`               |

Le hub détecte leur présence sans les afficher. L’adaptateur (création du paiement, webhook authentifié et idempotent, enregistrement automatique de l’encaissement) reste à écrire pour le prestataire retenu.
