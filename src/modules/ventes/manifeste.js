import Ventes from './Ventes.jsx';
import { ChiffreAffaires, Credits, MeilleuresVentes, VentesParJour } from './widgets.jsx';

export default {
  module: 'ventes',
  pages: [
    { id: 'ventes', libelle: 'Ventes', icone: 'ventes', groupe: 'Vente', ordre: 20, permission: 'ventes.lire', composant: Ventes },
  ],
  widgets: [
    { id: 'ventes.chiffre_affaires', zone: 'indicateur', ordre: 10, composant: ChiffreAffaires },
    { id: 'ventes.credits', zone: 'indicateur', ordre: 50, composant: Credits },
    { id: 'ventes.par_jour', zone: 'section', ordre: 20, visible: ({ periode }) => periode !== 'jour', composant: VentesParJour },
    { id: 'ventes.meilleures', zone: 'colonne', ordre: 10, composant: MeilleuresVentes },
  ],
};
