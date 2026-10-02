# Processus client : de l'offre à la mise en service

Tout se fait dans l'application, sans développement. Deux personnes interviennent :
**Agence Elite** (compte super administrateur, menu « Agence Elite ») et le
**responsable** du client (rôle Gérant).

| # | Étape | Qui | Où dans l'application | Résultat |
|---|---|---|---|---|
| 1 | Offre | Agence Elite | Agence Elite → **Offres et prix** | Offre choisie (Commerce Caisse ou Commerce Complet), prix à jour |
| 2 | Client | Agence Elite | Agence Elite → **Clients → Nouveau client** | Fiche client (nom, pays, devise, contact) |
| 3 | Établissement | Agence Elite | Fiche client → **Nouvel établissement** | Établissement Commerce créé, essai de 30 jours ouvert automatiquement |
| 4 | Licence | Agence Elite | Fiche établissement → **Licence → Attribuer une licence** | Formule (acquisition, mensuel, annuel), échéance, montant (case « inclure la mise en service » pour la première licence), référence de paiement |
| 5 | Responsable | Agence Elite | Fiche établissement → **Équipe → Inviter une personne** (rôle Gérant) | Message d'invitation à copier dans WhatsApp, SMS ou e-mail |
| 6 | Configuration | Responsable | **Paramètres** : nom commercial, adresse, téléphone, logo, caisses | Reçus au nom du client |
| 7 | Équipe | Responsable | **Équipe → Inviter une personne** ; droits ajustables par personne | Caissiers, comptable, etc. |
| 8 | Import articles | Responsable ou Agence Elite (en support) | **Articles → Importer** ; modèle : `docs/modele_import_articles.csv` | Catalogue et stock de départ, tout ou rien, ligne fautive indiquée |
| 9 | Formation | Agence Elite | Voir `docs/GUIDE_UTILISATEUR.md` (1 h sur place ou en visio) | Chaque rôle sait faire ses gestes |
| 10 | Mise en service | Responsable | **Mise en service** : liste de 9 étapes, puis **Déclarer la mise en service** | Date de mise en service visible dans l'espace Agence Elite |
| 11 | Support | Agence Elite | Fiche établissement → **Support → Ouvrir une session support** (motif obligatoire, 8 h, lecture seule, tracée) | Aide sans toucher aux données du client. Le **contrat de support** est séparé : Fiche établissement → **Licence → Ajouter le support** (montant et référence tracés) |

## Règles à connaître

- **Licence** : sans licence valide, l'établissement passe en lecture seule (rien
  n'est perdu). Échéance dépassée : 7 jours de grâce, avec un bandeau d'alerte.
  L'onglet **Échéances** liste les renouvellements à venir.
- **Modules** : une offre couvre une liste de modules ; un module en plus se vend
  à part (« Modules vendus en plus » dans la licence). Un module non couvert ne
  peut pas être activé.
- **Invitation** : la personne se connecte (ou crée son compte) avec l'adresse
  invitée, puis clique **Rejoindre**. Valable 7 jours, annulable.
- **Dirigeant du client** : Fiche client → Dirigeants → Inviter. Il voit tous les
  établissements du client, en lecture seule.
- **Suspension** : Fiche établissement → Licence → **Suspendre** (motif obligatoire),
  puis **Réactiver** au paiement. Tout est dans l'historique.

## Liste de contrôle pour chaque nouveau client

- [ ] Prix de l'offre vérifiés
- [ ] Client et établissement créés
- [ ] Licence attribuée avec la référence du paiement
- [ ] Responsable invité, a rejoint
- [ ] Identité, logo et caisses renseignés
- [ ] Articles importés, stock de départ contrôlé
- [ ] Équipe invitée, droits vérifiés
- [ ] Formation faite (guide remis)
- [ ] Première vente test puis mise en service déclarée
- [ ] Échéance notée pour le renouvellement

## Pilote réalisé

Un client fictif (« Groupe Fictif Pilote ») et deux établissements fictifs ont
déroulé tout le processus : `tests/pilote.test.js` (licence mensuelle et annuelle,
équipes, import, ventes, mise en service, isolation complète, dirigeant, suspension
d'un seul établissement). Le parcours navigateur `scripts/parcours_editeur.cjs`
refait les mêmes gestes à l'écran.
