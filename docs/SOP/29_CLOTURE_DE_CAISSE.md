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
   (« Tenue par »). **Terminer et me déconnecter** ferme la session de travail. Le gérant / responsable a aussi
   **Envoyer le rapport du soir** : résumé de la journée envoyé au patron sur WhatsApp (SOP 86).
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

## Connexion : « Tu continues ? » (2026-10-12)
Quand une personne se connecte et que SA caisse est encore ouverte, un grand pop-up s'affiche au centre :
« Bonjour Awa 👋 — Ta caisse est ouverte depuis 18 h 05 · 12 ventes · 85 000 FCFA. Tu continues à travailler ? »
- **Oui, je continue** : le pop-up se ferme.
- **Non, fermer ma caisse** : comptage du tiroir puis ticket Z dans la même fenêtre, puis « Terminer et me déconnecter ».
- **Ce n'est pas moi** : déconnexion immédiate, la caisse reste ouverte ; la collègue se connecte avec son compte.

Une seule fois par connexion (pas à chaque page ; un rechargement de la page ne le remontre pas). Le prénom vient du
nom du compte, sinon du début de l'adresse e-mail. Plusieurs caisses ouvertes : la plus récente est proposée.

## Verrouillage sans activité (migrations `20261011000129` et `20261012000132`)
Si personne ne touche l'écran pendant **15 minutes** (Paramètres › Réglages des modules › Clôture › « Verrouiller la
caisse… », 0 = jamais) et que la personne a SA caisse ouverte : pop-up « Awa, tu es toujours là ? » avec les mêmes
trois boutons et un compte à rebours visible « Déconnexion automatique dans 4:59 ». Le temps laissé pour répondre se
règle dans Clôture › « Temps laissé pour répondre… » (**5 minutes** par défaut, 0 = déconnexion directe).
- Un mouvement de souris ne ferme pas le pop-up : il faut cliquer un bouton.
- Le compte à rebours part de l'heure de la dernière activité : il reste juste même si l'onglet était en arrière-plan.
- Plusieurs onglets : répondre dans l'un ferme la question dans les autres.
- Sans réponse : le compte se déconnecte (« Caisse verrouillée »). **La caisse reste ouverte** : la même personne la
  retrouve en se reconnectant ; une collègue qui arrive se connecte avec son propre compte et ouvre sa propre caisse.
- Pas de caisse ouverte à son nom : rien ne s'affiche.

Code : `src/modules/caisse/VerrouCaisse.jsx` (pop-ups) et `src/modules/caisse/verrouCaisse.js` (calculs, testés dans
`tests/presence_caisse.test.js`).

## Servi par (facultatif)
À l'encaissement, champ « Servi par » : nom du serveur (Alex…). Noms proposés : Paramètres › Réglages des modules ›
Caisse › « Serveurs » (séparés par des virgules) + derniers noms utilisés sur l'appareil. Le nom s'imprime sur le reçu
et s'affiche dans Ventes. Correction : la personne qui a vendu, ou un responsable (`indiquer_serveur_vente`).

## Caisse sans internet (2026-10-13)
Pendant une coupure, la caisse garde les ventes sur l'appareil et les envoie au retour de la connexion. Tant qu'une vente
de SA caisse attend sur l'appareil, la clôture (ticket Z) est bloquée avec un message. Voir [SOP 87](87_CAISSE_SANS_INTERNET.md).
