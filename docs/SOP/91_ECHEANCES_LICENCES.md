# SOP 91 — Échéances et renouvellement des licences (Elite License Guard, 2026-10-21)

**Qui :** équipe Agence Elite (CRM), gérants des clients, partenaires Elite Partners. Détail : [`LICENSE_GUARD.md`](../LICENSE_GUARD.md).
Migration `20261021000151_elite_license_guard.sql`.

## Règles
1. Une licence échue **ne bloque jamais la caisse** : vente, encaissement, ticket Z, ventes hors ligne continuent.
   Seule une suspension manuelle (licence, établissement, client) bloque.
2. Une alerte, une demande ou une simulation ne crée **jamais** de paiement, de facture ni de renouvellement.
3. Le renouvellement se fait seulement avec la référence d'un paiement reçu : CRM › fiche client › **Encaisser**
   (ou `renouveler_licence` dans l'espace éditeur).
4. Prix : ceux des offres, réglés dans l'espace éditeur. Jamais dans le code.

## Chaque matin (automatique)
07:00 UTC : la tâche `alerter-echeances-licences` envoie les alertes du jour (J-30, J-15, J-7, J-3, J-1, J, J+1, J+3,
J+7 par défaut), une seule fois par palier.

## Équipe Agence Elite (CRM › Clients logiciel › Échéances)
1. Onglet **À traiter** : licences à J-7 ou moins, en délai de grâce ou expirées. Appeler le client (ou son partenaire).
2. Paiement reçu → **Encaisser** sur la fiche client (prolonge la licence et note le paiement dans le CRM).
3. Onglet **Demandes** : passer « En cours » quand le client est rappelé ; « Traitée » seulement après l'encaissement
   (la base refuse sinon) ; « Abandonnée » avec un motif.
4. **Simulation** : voir ce qui partira demain matin, sans rien envoyer.
5. **Réglages** (super admin) : paliers, prévenir le partenaire, à partir de quand prévenir l'équipe, tout couper.

## Gérant du client (SaaS › Paramètres › Mon abonnement)
1. Voir l'état, l'échéance, la fin du délai de grâce, l'historique.
2. **Demander le renouvellement** : formule souhaitée, téléphone, message. Une seule demande ouverte à la fois.
3. Payer Agence Elite ou son partenaire ; l'échéance change dès que le paiement est enregistré.

## Partenaire (espace partenaire › Renouvellements)
Voir les échéances de ses clients et les appeler. Le partenaire ne renouvelle pas lui-même.

## En cas de problème
- Plus aucune alerte : réglage « actif » coupé ? tâche présente (`select jobname from cron.job`) ?
- Un client dit que sa caisse est bloquée : vérifier la suspension manuelle (licence, établissement, client) dans la
  fiche ; une simple échéance dépassée ne bloque pas la caisse.
