# Rapport final de professionnalisation — 2026-10-03

Ce rapport décrit uniquement ce qui est réellement présent dans le dépôt. « Commercialisable avec limitations » signifie
qu'un client peut utiliser le workflow principal, mais que la vente doit annoncer les limites indiquées. Aucune intégration
externe (paiement, SMS, e-mail de campagne, domaine, paie réglementaire) n'est présentée comme disponible.

## Corrections transversales

- Les 19 parcours de la base locale et des démonstrations métier s'exécutent de nouveau : le délai des hooks de préparation
  tient compte de la reconstruction des migrations.
- Le parcours Playwright retourne désormais un échec au processus si une étape ou la console échoue. La CI visite aussi les
  écrans de tous les domaines et conserve le pilote sur un Supabase local réel.
- Le pilote Supabase lance deux ventes concurrentes du dernier article et exige une seule réussite et un stock final nul.
- Les dépendances ont été actualisées jusqu'aux versions sans vulnérabilité connue par `npm audit` au jour du rapport.
- L'audit couvre maintenant les dépendances de modules, droits de rôles, types de pièces jointes, identité plateforme et
  profils. Le contenu des fichiers et des notifications n'est volontairement pas dupliqué dans le journal.
- Toutes les listes basées sur `DataTable` ont une recherche réinitialisable et un rendu mobile en fiches. Les modales
  placent le focus, le gardent dans le dialogue et le rendent au bouton d'origine.

## État par module

| Module | État | Fonctionnalités réellement disponibles | Limites annoncées |
|---|---|---|---|
| Tableau de bord | **Commercialisable** | Périodes, portée Hub, KPI et widgets fournis dynamiquement par les applications autorisées | L'analyse avancée reste dans Rapports |
| Établissement | **Commercialisable** | Identité, paramètres, applications, Hubs, mise en service, personnalisation héritée | Domaine personnalisé manuel |
| Membres | **Commercialisable** | Comptes e-mail ou identifiant, invitations, rôles, permissions ajustées, portée Hub, mot de passe temporaire | Envoi d'invitation à copier sans fournisseur SMS/e-mail |
| Documents | **Commercialisable avec limitations** | Dossiers, pièces jointes, confidentialité et archivage | Stockage en base, pas d'antivirus externe ni de signature électronique |
| Articles | **Commercialisable** | Catalogue, catégories, prix, coût, image, code/référence, import CSV, suivi de stock | Pas de lots, séries ni unités composées |
| Contacts | **Commercialisable** | Clients/fournisseurs communs, coordonnées, historique utilisé par les autres modules | Fusion et dédoublonnage avancés absents |
| Caisse | **Commercialisable avec limitations** | Ouverture, panier, remises, multi-paiement, rendu monnaie, Hub et session | Pas de certification fiscale ni de périphérique TPE garanti |
| Ventes | **Commercialisable** | Tickets, crédit, paiements complémentaires, annulation, retours partiels `RET-…`, échanges par avoir, historique et stock | Aucun prestataire de remboursement externe |
| Paiements | **Commercialisable avec limitations** | Espèces, Mobile Money, carte, virement, chèque, remboursements et avoirs contrôlés | Saisie manuelle ; aucun prestataire en ligne |
| Reçus | **Commercialisable avec limitations** | Reçu imprimable avec identité héritée et détail du paiement | Pas de signature ou fiscalisation certifiée |
| Clôtures | **Commercialisable avec limitations** | Aperçu, encaissements, remboursements espèces, dépenses, comptage, écart et ticket Z définitif | Pas de comptage par dénomination |
| Dépenses | **Commercialisable avec limitations** | Catégories, caisse/Hub, modes, justificatifs et annulation | Pas de comptabilité générale ni rapprochement bancaire |
| Stock | **Commercialisable** | Ledger commun, stock par Hub, transferts, inventaires, seuils et valorisation | Lots, péremption et numéros de série absents |
| Facturation | **Commercialisable avec limitations** | Devis, facture, émission, échéance, paiement commun, avoir et impression A4 | Fiscalité spécifique et signature électronique non certifiées |
| Achats | **Commercialisable avec limitations** | Demande, commande, réception partielle, entrée en stock, dette et paiement fournisseur | Pas de rapprochement bancaire ni portail fournisseur |
| CRM | **Commercialisable avec limitations** | Prospects, pipeline configurable, opportunités, activités, relances et devis lié | Pas d'automatisation de campagne ou fournisseur e-mail |
| Projets | **Commercialisable avec limitations** | Projets, tâches, responsables, statuts, temps, synthèse et facturation du temps | Pas de diagramme de Gantt ni dépendances de tâches |
| RH Employés | **Commercialisable avec limitations** | Dossiers, organisation, contrats, données privées, documents, entrée/sortie et compte lié | Aucune paie réglementaire |
| RH Présences | **Commercialisable avec limitations** | Horaires, pointage, correction, planning et espace employé | Pas de badgeuse externe ni règles légales exhaustives |
| RH Congés | **Commercialisable avec limitations** | Demandes, décision, soldes, ajustements, jours fériés et calendrier | Droits légaux à configurer selon le pays |
| Restaurant Salle | **Commercialisable avec limitations** | Zones/tables, réservations avec conflits et arrivées, commandes, couverts, transfert, addition séparée, caisse et stock communs | Options et suppléments de menu avancés à enrichir |
| Restaurant Cuisine | **Commercialisable avec limitations** | Envoi par poste, à préparer, en préparation, prêt, servi et notification | Pas d'imprimante cuisine ni mesure SLA |
| Hôtel Réservations | **Commercialisable avec limitations** | Disponibilités, planning, réservation, check-in/out, prolongation, changement de chambre, prestations et facture | Pas de réservation publique ni channel manager |
| Hôtel Chambres | **Commercialisable avec limitations** | Types/tarifs, chambres, états, housekeeping et hors service | Tarification saisonnière avancée absente |
| Boutique en ligne | **Commercialisable avec limitations** | Catalogue/variantes, panier, coupons, livraison/retrait, suivi, commandes, retours et stock commun | Paiement en ligne absent ; paiement enregistré manuellement |
| Site web | **Commercialisable avec limitations** | Builder par blocs contrôlés, brouillon, aperçu, publication, navigation, SEO, formulaire et produits | Pas de code arbitraire, domaine personnalisé manuel, médias externes limités |
| Agenda | **Commercialisable avec limitations** | Planning, rendez-vous, conflits, états, personnes et facturation | Pas de réservation publique, récurrence ou rappel SMS/e-mail |
| Support | **Commercialisable avec limitations** | Tickets, priorités, délais, assignation, échanges, notes internes, résolution/réouverture | Pas de portail client ou passerelle e-mail |
| Abonnements | **Commercialisable avec limitations** | Formules, abonnés, périodicités, suspension/résiliation et facturation idempotente | Aucun prélèvement automatique |
| Rapports | **Commercialisable avec limitations** | Périodes, comparaison, CA, panier, marge, axes jour/article/catégorie/vendeur/client/Hub/origine/mode et CSV | Pas de BI personnalisée ou comptabilité analytique complète |
| Fidélité | **Commercialisable avec limitations** | Gains automatiques, solde, catalogue et attribution structurée des récompenses, lien vente possible et ajustement motivé | Expiration des points non définie |

## Vérification et production

La CI est la preuve attendue pour la reconstruction Supabase, le pilote API, le navigateur et la restauration. La production
ne doit recevoir les migrations `20261003000010_audit_configuration.sql` à `20261003000014_recompenses_fidelite.sql` (renumérotées à la fusion, voir DECISIONS) qu'après sauvegarde, simulation du workflow puis
confirmation selon les SOP 12 à 14. Ce rapport ne prétend pas que ce déploiement a déjà eu lieu.

## Limites externes restantes

1. Prestataire de paiement en ligne à choisir et contractualiser.
2. SMTP/SMS de production et consentement marketing à définir.
3. Règles de paie et conformité fiscale/sociale à valider pays par pays.
4. Domaine personnalisé et identité commerciale définitive à décider.
5. Antivirus, stockage objet et politique de rétention des documents à choisir avant forte volumétrie.
