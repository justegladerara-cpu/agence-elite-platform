# SOP 29 · Clôturer sa caisse (ticket Z)

**Une caisse par personne** (depuis le 2026-10-11, migration `20261011000128`) : chaque caissière se connecte avec son
propre compte, ouvre SA caisse, vend sur SA caisse et clôture SON ticket Z. Deux caissières peuvent travailler en même
temps sur le même point de vente : leurs ventes, encaissements et tickets Z restent séparés. Personne ne vend ni
n'encaisse sur la caisse d'une autre personne. Il n'y a plus de ticket X : seulement un ticket Z en fin de session.

1. **Caisse › Fermeture de caisse** (bouton dans l'écran de vente, ou page **Clôtures**) : « Ma caisse » affiche mes ventes, mes encaissements et les espèces
   attendues dans mon tiroir.
2. Si un bandeau indique des **ventes en attente**, les reprendre (encaisser) ou les abandonner depuis la Caisse
   (bouton « En attente ») avant de clôturer. Chaque personne ne voit que ses propres ventes en attente.
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
   clôturer à sa place. Sinon la fermeture automatique de fin de journée la ferme (SOP 76) ; la personne de la caisse
   (ou un responsable) compte ensuite ses espèces.
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
