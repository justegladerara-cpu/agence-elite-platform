# SOP 29 · Clôturer sa caisse (ticket Z)

**Une caisse par personne** (depuis le 2026-10-11, migration `20261011000128`) : chaque caissière se connecte avec son
propre compte, ouvre SA caisse, vend sur SA caisse et clôture SON ticket Z. Deux caissières peuvent travailler en même
temps sur le même point de vente : leurs ventes, encaissements et tickets Z restent séparés. Personne ne vend ni
n'encaisse sur la caisse d'une autre personne. Il n'y a plus de ticket X : seulement un ticket Z en fin de session.

1. **Caisse › Fermeture de caisse** (bouton dans l'écran de vente, ou page **Clôtures**) : « Ma caisse » affiche mes ventes, mes encaissements et les espèces
   attendues dans mon tiroir.
2. Si un bandeau indique des **factures en cours** (clients qui consomment encore), les reprendre (encaisser) ou les
   abandonner depuis la Caisse avant de clôturer. Chaque personne ne voit que ses propres factures en cours.
3. Compter les espèces. Si les **coupures** sont réglées (Paramètres › Réglages des modules › Clôture, par exemple
   `10000, 5000, 2000, 1000, 500, 100`), saisir le nombre de billets et de pièces : le total se remplit seul.
   Sinon saisir directement le montant compté.
4. L'écart (compté − attendu) s'affiche. Un écart doit être expliqué dans le commentaire.
5. **Clôturer ma caisse et éditer mon ticket Z** : non modifiable, imprimable. Le ticket indique qui a tenu la caisse
   (« Tenue par »). **Terminer et me déconnecter** ferme la session de travail.
6. Une caissière ne voit que **ses** tickets Z. Le gérant / responsable (droit « Clôturer une caisse ») et les rôles
   de lecture sans caisse (comptable) voient tout le monde : tableau **Personne / Tickets Z / Ventes** et filtre
   « Afficher les tickets Z de ».
7. Caisse oubliée : le gérant / responsable la voit sous « Caisses ouvertes par les autres personnes » et peut la
   clôturer à sa place. Il n'y a plus de fermeture à minuit par défaut (SOP 76) : une caissière peut travailler
   après minuit et ferme sa caisse elle-même.
8. Sortir des espèces d'un tiroir (dépense, remboursement d'un retour) : la personne de la caisse, ou un responsable
   qui choisit « Tiroir de quelle caisse ? ». L'auteur de la sortie reste tracé.
9. En multi-Hub, la page Clôtures se filtre par Hub.

Une vente d'une session clôturée ne peut plus être modifiée ; une erreur se corrige par un avoir / une annulation tracée.
Restaurant : le serveur qui encaisse une addition le fait sur SA caisse (bouton « Ouvrir la caisse » dans la Salle).

**Ventes** : une personne qui tient une caisse voit d'abord « Mes ventes » (onglet « Tout le monde » pour le reste).
Cocher plusieurs ventes (ou la case du haut) affiche leur total et le reste à encaisser, et permet de les exporter.

**Tableau de bord** (gérant, responsable) : bloc « Caissières et caissiers » : qui est en caisse en ce moment (depuis
quand, sur quelle caisse, montant en cours), nombre de ventes et montant de chaque personne sur la période, classement
(1 ★ = celle qui a le plus vendu). Fonction `activite_caissiers`.

## Factures en cours (2026-10-11)
« Mettre en attente » s'appelle désormais **Facture en cours** : le client continue de consommer, sa facture reste
ouverte avec un nom (Table 4, M. Mavoungou ; sans nom : « Facture 1 », « Facture 2 »…). Une **bande** toujours visible
en haut de la caisse montre chaque facture : nom, montant, depuis combien de temps (vert < 1 h, orange ≥ 1 h,
rouge ≥ 3 h). Toucher la carte reprend la facture. Le bouton « Factures en cours » porte une pastille rouge. Le tableau
de bord du gérant ajoute une colonne « Factures en cours » par personne.

## Verrouillage sans activité (migration `20261011000129`)
Si personne ne touche l'écran pendant **15 minutes** (Paramètres › Réglages des modules › Clôture › « Verrouiller la
caisse… », 0 = jamais) et que la personne a SA caisse ouverte : préavis d'une minute, puis le compte se déconnecte
(« Caisse verrouillée »). **La caisse reste ouverte** : la même personne la retrouve en se reconnectant ; une collègue
qui arrive se connecte avec son propre compte et ouvre sa propre caisse.

## Servi par (facultatif)
À l'encaissement, champ « Servi par » : nom du serveur (Alex…). Noms proposés : Paramètres › Réglages des modules ›
Caisse › « Serveurs » (séparés par des virgules) + derniers noms utilisés sur l'appareil. Le nom s'imprime sur le reçu
et s'affiche dans Ventes. Correction : la personne qui a vendu, ou un responsable (`indiquer_serveur_vente`).
