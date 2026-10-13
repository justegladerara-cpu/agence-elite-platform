# SOP 86 — Rapport du soir envoyé au patron sur WhatsApp

**Qui :** gérant, responsable (droit « Clôturer une caisse »), comptable ou toute personne qui lit les rapports.
**Où :** Pilotage › **Rapport du soir** (`#/rapport-du-soir`), ou le bouton **Envoyer le rapport du soir** sous le
ticket Z juste après une clôture.

## À quoi ça sert
Le soir, le patron reçoit sur WhatsApp le résumé de sa journée sans ouvrir la plateforme. Il n'y a **aucune API
WhatsApp** : l'écran prépare le texte et ouvre WhatsApp (lien `https://wa.me/<numéro>?text=…`). La personne relit et
appuie sur « Envoyer ». Rien ne part tout seul.

## Ce que contient le rapport
- Ventes du jour (montant) et nombre de tickets ; crédit accordé (reste à payer) s'il y en a.
- Encaissé par mode : espèces, Mobile Money, carte… (paiements reçus ce jour-là, y compris une dette réglée).
- Top 5 des articles (montant puis quantité).
- Remises, annulations (nombre et montant), retours remboursés s'il y en a, dépenses du jour.
- Écart de caisse des tickets Z (« manque 200 FCFA », « 500 FCFA en trop ») et les tickets Z dont les espèces ne sont
  pas encore comptées.
- Montant de chaque caissière / caissier.
- Nombre de caisses encore ouvertes (« Attention : 1 caisse encore ouverte »).

## Faire
1. Ouvrir **Rapport du soir**. La date proposée est aujourd'hui ; **avant 6 h du matin, c'est la veille** (un bar qui
   ferme à 2 h envoie le rapport de sa soirée). Changer la date au besoin.
2. Vérifier les gros chiffres. Une caisse encore ouverte ? La faire fermer (ticket Z) avant d'envoyer.
3. **Numéro WhatsApp du patron** : déjà rempli s'il est enregistré. Sinon le taper (ex. `06 123 45 67` ; l'indicatif
   242 est ajouté) ; le gérant peut cliquer **Enregistrer le numéro**. Le réglage est aussi dans Paramètres › Réglages
   des modules › Clôture. Vide : WhatsApp demande à qui envoyer.
4. **Envoyer au patron sur WhatsApp** : WhatsApp s'ouvre avec le texte ; appuyer sur Envoyer.
   Ou **Copier le texte**, puis le coller où on veut (SMS, groupe WhatsApp…).

## Règles de calcul (fonction `rapport_du_soir`)
- La journée = le jour du calendrier dans le fuseau de l'établissement (Africa/Brazzaville par défaut).
- Ventes, tickets, remises, articles, caissières : ventes **validées** créées ce jour-là. Une vente compte pour la
  personne de sa caisse (sinon pour son vendeur).
- Annulations : ventes annulées ce jour-là. Dépenses : dépenses valides datées de ce jour.
- Écart de caisse : tickets Z des caisses **ouvertes** ce jour-là (une caisse ouverte à 18 h et fermée à 2 h compte pour
  le jour de son ouverture).
- Caisses encore ouvertes : ouvertes ce jour-là ou avant, pas encore clôturées.
- En multi-Hub, un responsable de Hub ne voit que ses Hubs.
- Lecture seule ; refusée à une caissière (elle voit seulement SON ticket Z) et à toute personne d'un autre
  établissement.

## Ce qu'il ne faut pas faire
- Envoyer le rapport avant d'avoir fermé les caisses : l'écart de caisse serait incomplet.
- Mettre un numéro qui n'est pas celui du patron : le texte contient le chiffre d'affaires.

Code : `supabase/migrations/20261013000137_rapport_du_soir.sql` (fonction `rapport_du_soir`, réglage
`whatsapp_patron` du module Clôture), `src/modules/cloture/RapportDuSoir.jsx` (écran),
`src/modules/cloture/rapportDuSoir.js` (texte et lien, fonctions pures). Tests : `tests/rapport_du_soir.test.js`,
`tests/rapport_du_soir_ecran.test.jsx`, étape `rapport-du-soir` de `scripts/parcours_navigateur.cjs`.
