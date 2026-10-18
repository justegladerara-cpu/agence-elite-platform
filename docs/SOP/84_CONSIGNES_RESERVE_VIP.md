# SOP 84 — Emballages consignés, bouteilles en réserve, tables VIP avec minimum

**Pour :** bars, maquis, lounges, restaurants. **Migration :** `supabase/migrations/20261017000136_consignes_reserve_vip.sql`.
Rien n'est propre à un client : chaque établissement crée ses emballages, ses réserves et ses minimums.

## 1. Emballages consignés (casiers, bouteilles vides)

**Où :** Stock › **Emballages consignés**. **Qui :** droit `stock.emballages` (personnes qui ajustent le stock ou tiennent
la caisse) ; `stock.emballages_gerer` (gérant, responsable, responsable Hub) pour régler les types, corriger le compte et
annuler.

1. **Régler une fois** (gérant) : ⋯ › Types d'emballage › nom (« Casier 12 bouteilles », « Bouteille 65 cl ») et
   consigne (0 permis). « Retirer » masque un type sans rien effacer.
2. **Au quotidien**, un gros bouton par geste :
   - **Un client rapporte des vides** : emballage, nombre, client (ou client de passage) ; cocher « Je rends la consigne »
     ou non (consigne gardée = 0).
   - **Je confie des emballages à un client** : la consigne encaissée est proposée (nombre × consigne), modifiable.
   - **J'ai reçu du fournisseur** / **Je rends au fournisseur** : le fournisseur est obligatoire (Contacts, type
     fournisseur). On ne peut pas rendre plus qu'on ne doit.
3. **Lire l'écran**, par emballage : **Chez nous** (pleins ou vides), **Chez les clients**, **Dus aux fournisseurs**
   (détail par fournisseur), et en haut le total des **consignes gardées** pour les clients.
4. **Casse, comptage** (gérant) : ⋯ › Corriger le compte : + ou −, motif obligatoire.
5. **Erreur** : Derniers mouvements › Annuler (gérant), motif obligatoire. Le mouvement reste visible, barré.

Sens des mouvements : reçu fournisseur = chez nous +, dû +. Rendu fournisseur = chez nous −, dû −. Confié client =
chez nous −, chez les clients +. Rapporté client = chez nous +, chez les clients −.

## 2. Bouteille en réserve (bottle keeping)

**Où :** Vente › **Bouteilles en réserve**. **Qui :** `caisse.reserve` (toute personne qui tient la caisse ou sert) ;
`caisse.reserve_annuler` (gérant, responsable, responsable Hub).

1. Le client **achète la bouteille par une vente normale** (caisse ou addition de la salle).
2. Il n'a pas fini : **Mettre une bouteille en réserve** › client (enregistré ou nom + téléphone), bouteille (article
   ou nom libre), compter en **bouteille** (1/4, 1/2, 3/4), en **verres** ou en **cl**, ce qui reste ; facultatif : photo,
   date limite, vente de la bouteille.
3. Visite suivante : chercher le **nom ou le téléphone** › **Servir** › 1/4, 1/2, « Tout le reste » ou autre quantité.
   **Aucune nouvelle vente.** À zéro, la bouteille passe « Terminée ».
4. **Historique** : chaque service avec la personne et l'heure. Un service saisi par erreur s'annule (responsable, motif) :
   la quantité revient dans la bouteille.
5. **Date limite dépassée** : la base refuse de servir ; le responsable décide (annuler la réserve avec un motif).

## 3. Table VIP avec minimum de consommation

**Où :** Salle. **Qui :** `restaurant_salle.minimum` (gérant, responsable, responsable Hub) pour régler et lever ;
`restaurant_salle.servir` pour noter le minimum d'une réservation ; `restaurant_salle.encaisser` pour le complément.

1. **Table VIP** : Salle › ⋯ › Tables et postes › la table › **Minimum de consommation**. Le plan affiche « VIP ».
2. **Réservation** : Salle › Réserver › **Minimum de consommation (facultatif)**. Il passe sur la commande quand le client
   est marqué **Arrivée** sur une table (prioritaire sur le minimum de la table).
3. **Pendant le service** : la commande affiche « **Encore X à consommer pour atteindre le minimum** », puis
   « Minimum atteint ». ⋯ › Changer le minimum (responsable).
4. **Addition** : si la dernière addition reste sous le minimum, un avertissement s'ouvre :
   - **Ajouter le complément** : une ligne « Complément minimum de consommation » du montant manquant s'ajoute à
     l'addition (article technique créé tout seul : prix 1, quantité = montant, sans stock, absent du menu QR et des
     tuiles de caisse) ;
   - **Lever le minimum** (responsable) : motif obligatoire ; nom, heure et motif sont gardés sur la commande.
5. Une addition séparée peut payer une part ; le contrôle porte sur la **dernière** addition (et sur « Libérer la table »).
   La base refuse la clôture sous le minimum : rien n'est encaissé à moitié.

Fonctions : `enregistrer_emballage`, `noter_mouvement_emballage`, `annuler_mouvement_emballage`, `situation_emballages`,
`mettre_bouteille_en_reserve`, `servir_depuis_reserve`, `annuler_service_reserve`, `annuler_reserve_bouteille`,
`regler_minimum_table`, `regler_minimum_reservation`, `regler_minimum_commande`, `lever_minimum_commande`,
`ajouter_complement_minimum`. Tests : `tests/consignes_reserve_vip.test.js`.
