# SOP 79 — Parcours simple « comme J'ai reçu / Je compte » (2026-10-11)

Demande de Juste : rendre tout le logiciel aussi simple que « J'ai reçu de la marchandise ». Propositions détaillées :
`/mnt/project-files/plateforme/ameliorations-parcours-simple-2026-10-10.md` (45 points, A1 à H6).

## Règles à garder pour tout nouvel écran
1. Un gros bouton qui dit ce qu'on veut faire, en mots de commerçant.
2. Une seule page, un seul bouton pour valider ; le reste sous « Plus d'options » / « Plus de détails ».
3. Le logiciel calcule (totaux, marges, poids pour un montant, pertes en argent).
4. WhatsApp = liens `wa.me` préparés (`src/noyau/messagesWhatsapp.js`), jamais d'envoi automatique (aucun canal).
5. Une bulle d'aide d'une phrase par écran : `src/noyau/aides.js`.

## Ce qui existe (où le trouver)
| Point | Écran / fichier |
|---|---|
| A1–A4 Accueil gros boutons, « Je veux… », chiffres du jour, à faire | `#/accueil`, `src/modules/accueil/` (premier écran du menu) |
| A5 Mode simple | case sur l'accueil, `src/noyau/modeSimple.js` (préférence de l'appareil) |
| B1 Vente au poids (½, ¼, autre poids, pour un montant) | Caisse, `src/modules/caisse/poids.js` |
| B2 Favoris | Caisse, puce « ★ Favoris » (compté sur l'appareil) |
| B5/F1 Client rapide par téléphone | fenêtre de paiement de la caisse |
| B6 Reçu WhatsApp | fenêtre du reçu, `src/modules/recus/whatsapp.js` |
| H6 « Oups, annuler » | reçu, 15 s, permission `ventes.annuler` seulement |
| C3 Commande WhatsApp au fournisseur | Achats › Réapprovisionnement |
| C4 J'ai perdu / cassé / périmé | Stock (`?vue=perte`), raisons en un clic |
| C6 Dates de péremption | Stock › Dates de péremption (`?vue=peremptions`), migration `20261011000127_peremptions.sql` |
| C7 Comptage partiel | « Je compte mon stock » : seules les lignes saisies changent, filtre par catégorie |
| C8 Prix d'achat en hausse | réception d'une commande fournisseur |
| D1–D5 Article en 3 champs, plusieurs d'un coup, modèles par métier, changer les prix, photo téléphone | Articles (`?nouveau=1`, `?nouveau=plusieurs`) |
| E1 J'ai payé une dépense | Dépenses (`?nouveau=1`) |
| E3 Qui me doit ? | `#/qui-me-doit` (module paiements) |
| E4 À qui je dois ? | `#/a-qui-je-dois` (module achats) |
| E6 Bilan du jour WhatsApp | accueil |
| G2 Devis → facture | « Le client a accepté → facturer » |
| G3 Relances | Factures › Retards, ton selon le retard |
| F3 Message à plusieurs clients | Contacts (liens wa.me un par un) |

Déjà présents avant : B3 monnaie, B4 paiement mixte, B7 vente en attente, B8 retours, C1 casiers, C5 transferts,
E2 clôture, E5 rapprochement Mobile Money, F2 fidélité, H4 assistant, H5 affichage « gros texte / tactile ».

## Non faits (et pourquoi)
- C2 réception depuis une photo de facture : aucun service de lecture d'image (OCR).
- H3 vidéos : à tourner par Agence Elite ; aucun contenu à intégrer.
- E6/G3 envoi automatique (20 h, J+7) : aucun canal d'envoi WhatsApp/SMS ; on prépare le message en un clic.
- B9 vente hors connexion : l'application s'ouvre sans réseau, mais enregistrer une vente exige la base (risque de double vente et de stock faux) ; chantier à part.
- D4 n'est pas « tout ou rien » : `modifier_articles_lot` n'accepte pas le prix ; une migration future pourra l'ajouter.
