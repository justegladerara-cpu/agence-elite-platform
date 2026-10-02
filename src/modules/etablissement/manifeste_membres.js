// Socle « Membres » : l'équipe et ses droits.
import Equipe from './Equipe.jsx';

export default {
  module: 'membres',
  pages: [
    { id: 'equipe', libelle: 'Équipe', icone: 'membres', groupe: 'Organisation', ordre: 20, permission: 'membres.lire', composant: Equipe },
  ],
  widgets: [],
};
