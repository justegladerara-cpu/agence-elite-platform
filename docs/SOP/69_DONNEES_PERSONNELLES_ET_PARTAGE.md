# SOP 69 — Données personnelles d'un contact et partage de documents par lien

**Qui :** le gérant (droit `contacts.donnees_personnelles`) pour l'export et l'anonymisation ; toute personne qui peut
modifier un document pour le partager par lien. **Où :** Contacts › fiche du contact ; section « Pièces jointes » d'un
document (facture, devis, commande, opportunité…).

## Un contact demande ses données
1. Ouvrir sa fiche › **Exporter ses données**. Un fichier `donnees-contact-AAAA-MM-JJ.json` se télécharge : sa fiche et
   tout ce qui le concerne (ventes, factures, rendez-vous, opportunités, tickets, réservations…), sans les images.
2. Envoyer le fichier au contact par un canal sûr. L'export est tracé (événement `contact.export`).

## Un contact demande l'effacement de ses données
1. Vérifier que rien n'est en cours : facture à payer, crédit client disponible, abonnement, contrat ou location en
   cours. La plateforme refuse sinon, en disant quoi terminer.
2. S'il le demande aussi : exporter ses données d'abord (l'anonymisation n'est pas réversible).
3. Fiche › **Anonymiser** › noter la demande (date et canal) › taper `ANONYMISER` › **Anonymiser définitivement**.
4. La fiche devient « Contact anonymisé » (badge orange), inactive. Montants, dates et numéros restent pour la
   comptabilité. Le registre (date, auteur, motif, nombre de lignes touchées) est dans `anonymisations`.

## Envoyer un document sans créer de compte
1. Dans « Pièces jointes », **Partager** à côté du document (absent pour un document confidentiel).
2. Choisir la durée (1 heure à 30 jours) › **Créer le lien** › **Copier le lien** ou **Envoyer par WhatsApp**.
   Le lien n'est affiché qu'une fois.
3. La personne ouvre le lien et clique « Télécharger le document ». Le nombre d'ouvertures s'affiche dans « Liens actifs ».
4. Envoyé à la mauvaise personne : **Partager** › **Révoquer**. Archiver le document coupe aussi tous ses liens.

## Ce qu'il ne faut pas faire
- Anonymiser un contact sans demande de sa part (c'est irréversible).
- Partager par lien un document qui contient des données d'autres personnes : marquez-le confidentiel.
