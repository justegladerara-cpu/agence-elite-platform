# SOP 81 — Menu QR sur les tables : consulter puis commander (2026-10-12)

Migration `20261012000131_menu_qr_tables.sql`. Écrans : Caisse › « Menu QR » (`#/menu-qr`, droit `caisse.menu_qr`,
gérant et responsable) et « Commandes des tables » (bouton dans la caisse, `#/commandes-qr`).

## Mise en route (gérant)
1. Menu QR › **Activer le menu** (titre et message facultatifs). Tant qu'il est éteint, les QR affichent « menu fermé ».
2. **Ajouter des tables** : « Table 1 à 12 », ou reprendre les tables de la Salle si le module Restaurant est actif.
3. **Imprimer** les QR (une carte par table) et les poser sur les tables.
4. Phase 1 : laisser « Commandes » éteint → le client **consulte** le menu (prix, photos, épuisé).
5. Phase 2 : allumer « **Commandes** » → le client ajoute au panier, envoie ; la caisse reçoit une notification.
6. Masquer un article du menu : liste « Visible sur le menu » (n'empêche pas de le vendre en caisse).
7. QR perdu ou copié : « Nouveau code » (l'ancien lien cesse de marcher).
8. Logo au centre (facultatif), formes, couleurs, cadre « Voir le menu » et scans par table : voir
   [SOP 88](88_QR_CODES_LOGO_SCANS.md) (écran « QR codes », onglets « Style par défaut » et « Statistiques des scans »).

## Pendant le service (caisse)
- Bouton « Commandes des tables (n) » dans la caisse, rafraîchi toutes les 15 s.
- **Accepter en caisse** : devient une facture en cours de **votre** caisse (« Table 3 · QR-00012 ») ; le stock bouge
  à l'encaissement, comme une vente normale.
- **Accepter en salle** (Restaurant actif) : ajoutée à la commande de la table, envoyée cuisine/bar.
- **Refuser** avec un motif : le client le voit sur son téléphone.

## Garde-fous
- Le client n'a aucun compte : il ne voit que le menu de cet établissement et le suivi de sa commande.
- Limites : 3 commandes en attente par table, 20 par heure et par table, 300 par heure par établissement, 50 par article.
- Stock vérifié à la commande (« épuisé » refusé) ; rien n'est encaissé ni sorti du stock sans un caissier.
- Établissement suspendu ou licence expirée → menu fermé.

## Pas fait
Paiement en ligne par le client : aucun moyen de paiement en ligne branché ; le client paie à la caisse.
