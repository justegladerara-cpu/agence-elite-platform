export const utilisateurDemo = { nom: 'Ariane M.', role: 'Gérante' };
export const etablissementsDemo = [
  { id: 'demo-brazzaville', nom: 'Maison Élite — Brazzaville', ville: 'Brazzaville', statut: 'actif', modules: ['etablissement', 'membres', 'tableau_de_bord'] },
  { id: 'demo-pointe-noire', nom: 'Maison Élite — Pointe-Noire', ville: 'Pointe-Noire', statut: 'actif', modules: ['etablissement', 'tableau_de_bord'] },
];
export const membreDemo = { actif: true, permissions: ['etablissement.lire', 'etablissement.modifier', 'membres.lire', 'membres.gerer', 'tableau_de_bord.lire'], permissionsAjustees: {} };
export const clientsDemo = [
  { nom: 'Maison Élite SARL', etablissements: 2, statut: 'Actif' },
  { nom: 'Groupe Horizon', etablissements: 1, statut: 'Suspendu' },
];
export const equipeDemo = [
  { nom: 'Ariane M.', initiales: 'AM', role: 'Gérante', statut: 'Active' },
  { nom: 'Chris O.', initiales: 'CO', role: 'Responsable', statut: 'Actif' },
  { nom: 'Malia K.', initiales: 'MK', role: 'Comptable', statut: 'Invitée' },
];
