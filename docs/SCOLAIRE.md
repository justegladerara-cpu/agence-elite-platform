# Scolarité (module M09, Bêta)

Migration `20261010000108_scolaire.sql`, écran `src/modules/scolaire/`, page `#/scolaire` (menu Relations, libellé
« Scolarité »), tableau de bord « Scolaire » (`cockpit_scolaire`), nouveau rôle **Secrétariat**, nouvelle catégorie
« Éducation ». Mode d'emploi : SOP 65. Proposé dans la solution Services (ou en complément par Agence Elite),
**jamais activé d'office**.

## Parcours
1. **Année scolaire** (`sco_annees`) : libellé, dates ; une seule année active à la fois.
2. **Classes** (`sco_classes`) : nom, niveau, nombre de places (facultatif), frais d'inscription et de scolarité.
   Aucun barème imposé. Changer les frais ne modifie pas les inscriptions déjà faites.
3. **Élèves** (`sco_eleves`) : matricule (automatique `EL-00001` ou saisi), nom, prénom, date de naissance,
   parent ou responsable (fiche Contacts).
4. **Inscription** (`sco_inscriptions`) : un élève, une classe, une année ; montant dû = frais de la classe ; remise
   seulement par un responsable, avec motif ; classe complète refusée.
5. **Paiements** (`sco_paiements`, reçu `RS-00001`) : jamais plus que le reste à payer ; définitifs.
6. **Fin d'inscription** : abandon ou transfert, avec motif ; la place se libère.

## Droits
| Droit | Rôles |
|---|---|
| `scolaire.lire` | gérant, responsable, secrétariat, comptable, lecteur |
| `scolaire.inscrire` | gérant, responsable, secrétariat |
| `scolaire.encaisser` | gérant, responsable, secrétariat, comptable |
| `scolaire.gerer` (années, classes, frais, remises, fins) | gérant, responsable |

## Réglage
« Jours après l'inscription avant de signaler un impayé » (30).

## Limites connues
- Les paiements de scolarité **n'entrent pas dans la caisse ni dans la clôture**.
- Pas d'échéancier par mois ou trimestre : un montant global et des paiements partiels.
- Pas de notes, bulletins, emploi du temps, présences des élèves ni cantine.
- Pas de reçu imprimable dédié (le numéro de reçu est donné à l'écran).
- Pas de passage automatique d'une année à l'autre (réinscrire chaque élève).
