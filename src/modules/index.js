// Registre des écrans. Une page n'apparaît que si son module est actif pour
// l'établissement et que l'utilisateur a la permission de lecture.
import Articles from './articles/Articles.jsx';
import Caisse from './caisse/Caisse.jsx';
import Clotures from './cloture/Clotures.jsx';
import Contacts from './contacts/Contacts.jsx';
import Depenses from './depenses/Depenses.jsx';
import Equipe from './etablissement/Equipe.jsx';
import MiseEnService from './etablissement/MiseEnService.jsx';
import Parametres from './etablissement/Parametres.jsx';
import Stock from './stock/Stock.jsx';
import TableauDeBord from './tableau_de_bord/TableauDeBord.jsx';
import Ventes from './ventes/Ventes.jsx';

export const PAGES = [
  { id: 'tableau-de-bord', libelle: 'Tableau de bord', icone: 'tableau', module: 'tableau_de_bord', permission: 'tableau_de_bord.lire', composant: TableauDeBord },
  { id: 'caisse', libelle: 'Caisse', icone: 'caisse', module: 'caisse', permission: 'caisse.utiliser', composant: Caisse, pleinEcran: true },
  { id: 'ventes', libelle: 'Ventes', icone: 'ventes', module: 'ventes', permission: 'ventes.lire', composant: Ventes },
  { id: 'articles', libelle: 'Articles', icone: 'articles', module: 'articles', permission: 'articles.lire', composant: Articles },
  { id: 'stock', libelle: 'Stock', icone: 'stock', module: 'stock', permission: 'stock.lire', composant: Stock },
  { id: 'clotures', libelle: 'Clôtures', icone: 'cloture', module: 'cloture', permission: 'cloture.lire', composant: Clotures },
  { id: 'contacts', libelle: 'Contacts', icone: 'contacts', module: 'contacts', permission: 'contacts.lire', composant: Contacts },
  { id: 'depenses', libelle: 'Dépenses', icone: 'depenses', module: 'depenses', permission: 'depenses.lire', composant: Depenses },
  { id: 'equipe', libelle: 'Équipe', icone: 'membres', module: 'membres', permission: 'membres.lire', composant: Equipe },
  { id: 'mise-en-service', libelle: 'Mise en service', icone: 'fusee', module: 'etablissement', permission: 'etablissement.modifier', composant: MiseEnService, horsMenuSi: (e) => Boolean(e.mis_en_service_le) },
  { id: 'parametres', libelle: 'Paramètres', icone: 'parametres', module: 'etablissement', permission: 'etablissement.lire', composant: Parametres },
];

export function pagesAccessibles({ moduleActif, peut }) {
  return PAGES.filter((p) => moduleActif(p.module) && peut(p.permission));
}

// Pages affichées dans le menu (certaines disparaissent une fois inutiles).
export function pagesDuMenu(espace) {
  return pagesAccessibles(espace).filter((p) => !p.horsMenuSi?.(espace.etablissement));
}
