# Solution Commerce

La première solution du socle : boutique, quincaillerie, magasin. Kangourou a servi de référence fonctionnelle (lecture seule, aucune donnée reprise).

## Parcours couvert
Créer un article → enregistrer du stock → ouvrir la caisse → vendre → stock diminué → paiement (un ou plusieurs modes, crédit client) → reçu → retrouver la vente → annuler avec motif si besoin → clôturer avec le ticket Z → contacts → dépenses → tableau de bord.

## Modules
| Module | Écran | Permissions |
|---|---|---|
| articles | Articles | `articles.lire`, `articles.gerer` |
| stock | Stock (niveaux, mouvements, entrée, ajustement, inventaire) | `stock.lire`, `stock.ajuster` |
| caisse | Caisse (POS plein écran) | `caisse.utiliser` |
| ventes | Ventes (liste, détail, annulation) | `ventes.lire`, `ventes.annuler` |
| paiements | dans Caisse et Ventes | `paiements.lire`, `paiements.encaisser`, `paiements.annuler` |
| recus | reçu 80 mm imprimable | `recus.lire` |
| cloture | Clôtures et tickets Z | `cloture.lire`, `cloture.effectuer` |
| contacts | Contacts (clients, fournisseurs, dettes) | `contacts.lire`, `contacts.gerer` |
| depenses | Dépenses (justificatif photo) | `depenses.lire`, `depenses.gerer` |
| tableau_de_bord | Tableau de bord | `tableau_de_bord.lire` |

Rôles par défaut : gérant et responsable ont tout ; employé (caissier) vend, encaisse et gère les contacts ; comptable lit tout et gère les dépenses ; lecteur lit. Le détail est dans `supabase/migrations/20261002000002_commerce_catalogue.sql`.

## Règles métier
- **Écriture uniquement par fonctions RPC** (`security definer`, `search_path` vide). Les tables n'ont que des politiques de lecture pour `authenticated`. Chaque RPC vérifie la permission, le module actif, l'établissement et son client actifs, et l'appartenance de chaque objet cité au même établissement.
- **Stock = somme des mouvements** (`entree`, `sortie_vente`, `retour_annulation`, `ajustement`, `inventaire`). On ne modifie jamais un stock directement. Le stock négatif est refusé sauf réglage `stock_negatif` de la caisse.
- **Vente atomique** : lignes, sortie de stock, paiements et numéro `V-00001` dans une seule transaction.
- **Rien n'est effacé ni modifié en silence** : suppression interdite sur toutes les tables commerce ; une vente validée ne change que par annulation (motif obligatoire) ou encaissement ; paiements et dépenses ne s'annulent qu'avec un motif ; lignes, mouvements et tickets Z sont figés. Tout passe dans `journal_audit`.
- **Annulation d'une vente** seulement tant que sa session de caisse est ouverte : le ticket Z déjà édité reste juste. Elle remet le stock (mouvement `retour_annulation`) et annule les paiements.
- **Espèces** : le paiement est enregistré net de la monnaie rendue. Un encaissement en espèces exige une session ouverte.
- **Crédit** : une vente non soldée exige un contact ; le reste se règle plus tard depuis Ventes.
- **Ticket Z** (`Z-00001`) : espèces attendues = fond + espèces encaissées − dépenses payées en caisse ; l'écart avec le comptage est figé.
- **Tableau de bord** : chiffre d'affaires, panier moyen, encaissé par mode, dépenses, marge brute (prix − coût d'achat, coût inconnu = 0), résultat estimé, crédits à encaisser, ventes par jour, meilleures ventes, stock bas.

## Fonctions (RPC)
`mon_contexte`, `enregistrer_identite`, `enregistrer_point_de_vente`, `enregistrer_parametres_module`, `enregistrer_categorie`, `enregistrer_article`, `ajuster_stock`, `ouvrir_caisse`, `enregistrer_vente`, `annuler_vente`, `encaisser_paiement`, `annuler_paiement`, `recu_vente`, `apercu_cloture`, `cloturer_caisse`, `enregistrer_contact`, `enregistrer_depense`, `annuler_depense`, `tableau_de_bord_commerce`. Définitions : `supabase/migrations/20261002000004_commerce_fonctions.sql`.

## Faire tourner l'application
```
npm install
npm run dev
```
Sans variables d'environnement, l'application démarre en **mode local** : une vraie base Postgres (PGlite) tourne dans le navigateur, construite avec les mêmes migrations que Supabase, et se remplit d'une démo fictive (Quincaillerie Démo à Pointe-Noire, un second magasin à Brazzaville). On choisit un profil à l'écran de connexion : gérante, caissier ou comptable. « Réinitialiser la démo » efface la base du navigateur.

Avec `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (Supabase local uniquement pour l'instant), l'application utilise Supabase et une connexion par e-mail.

## Vérifier
- `npm test` : migrations, sécurité, isolation entre établissements, parcours commerce complet, moteur local, interface.
- `npm run build` puis `npx vite preview --port 4173` et `node scripts/parcours_navigateur.cjs` (Playwright) : parcours complet dans Chromium avec captures dans `captures-parcours/`.

## Exploitation par Agence Elite
- Espace éditeur (clients, établissements, licences, modules, équipe, mise en service, support) : `docs/PROCESSUS_CLIENT.md`.
- Prise en main par rôle : `docs/GUIDE_UTILISATEUR.md` ; modèle d'import : `docs/modele_import_articles.csv`.
- Mise en ligne, sauvegardes, retour arrière : `docs/PRODUCTION.md`.

## Pas encore fait
- Mise en ligne réelle : projet Supabase dédié et projet Cloudflare Pages à créer par Agence Elite (voir `docs/PRODUCTION.md`).
- Envoi automatique des invitations par e-mail : pour l'instant, message à copier (WhatsApp, SMS, e-mail).
- Facturation automatique des licences : les paiements sont notés à la main (montant, référence).
- Fonctionne hors connexion uniquement en mode local ; pas de synchronisation.
