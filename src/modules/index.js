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
import Hubs from './hubs/Hubs.jsx';
import Stock from './stock/Stock.jsx';
import Transferts from './stock/Transferts.jsx';
import TableauDeBord from './tableau_de_bord/TableauDeBord.jsx';
import Ventes from './ventes/Ventes.jsx';

export const GROUPES = ['Pilotage', 'Vente', 'Catalogue et stock', 'Relations', 'Organisation'];

export const PAGES = [
  { id: 'tableau-de-bord', libelle: 'Tableau de bord', icone: 'tableau', groupe: 'Pilotage', module: 'tableau_de_bord', permission: 'tableau_de_bord.lire', composant: TableauDeBord },
  { id: 'caisse', libelle: 'Caisse', icone: 'caisse', groupe: 'Vente', module: 'caisse', permission: 'caisse.utiliser', composant: Caisse, pleinEcran: true },
  { id: 'ventes', libelle: 'Ventes', icone: 'ventes', groupe: 'Vente', module: 'ventes', permission: 'ventes.lire', composant: Ventes },
  { id: 'clotures', libelle: 'Clôtures', icone: 'cloture', groupe: 'Vente', module: 'cloture', permission: 'cloture.lire', composant: Clotures },
  { id: 'articles', libelle: 'Articles', icone: 'articles', groupe: 'Catalogue et stock', module: 'articles', permission: 'articles.lire', composant: Articles },
  { id: 'stock', libelle: 'Stock', icone: 'stock', groupe: 'Catalogue et stock', module: 'stock', permission: 'stock.lire', composant: Stock },
  // Les Transferts n'existent pour l'utilisateur que s'il voit plusieurs Hubs.
  { id: 'transferts', libelle: 'Transferts', icone: 'transfert', groupe: 'Catalogue et stock', module: 'stock', permission: 'stock.lire', composant: Transferts, horsMenuSi: (e, espace) => !espace?.multiHub },
  { id: 'contacts', libelle: 'Contacts', icone: 'contacts', groupe: 'Relations', module: 'contacts', permission: 'contacts.lire', composant: Contacts },
  { id: 'depenses', libelle: 'Dépenses', icone: 'depenses', groupe: 'Relations', module: 'depenses', permission: 'depenses.lire', composant: Depenses },
  // Un petit commerce à un seul Hub ne voit les Hubs que s'il peut en créer un.
  { id: 'hubs', libelle: 'Hubs', icone: 'hub', groupe: 'Organisation', module: 'etablissement', permission: 'etablissement.lire', composant: Hubs, horsMenuSi: (e, espace) => !espace?.multiHub && !espace?.peut('etablissement.gerer_hubs') },
  { id: 'equipe', libelle: 'Équipe', icone: 'membres', groupe: 'Organisation', module: 'membres', permission: 'membres.lire', composant: Equipe },
  { id: 'mise-en-service', libelle: 'Mise en service', icone: 'fusee', groupe: 'Organisation', module: 'etablissement', permission: 'etablissement.modifier', composant: MiseEnService, horsMenuSi: (e) => Boolean(e.mis_en_service_le) },
  { id: 'parametres', libelle: 'Paramètres', icone: 'parametres', groupe: 'Organisation', module: 'etablissement', permission: 'etablissement.lire', composant: Parametres },
];

export function pagesAccessibles({ moduleActif, peut }) {
  return PAGES.filter((p) => moduleActif(p.module) && peut(p.permission));
}

// Pages affichées dans le menu (certaines disparaissent une fois inutiles).
export function pagesDuMenu(espace) {
  return pagesAccessibles(espace).filter((p) => !p.horsMenuSi?.(espace.etablissement, espace));
}
