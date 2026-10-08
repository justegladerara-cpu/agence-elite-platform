// Registre des modules côté écran. Chaque module déclare dans son manifeste :
// - ses pages (menu dynamique : une page n'apparaît que si son module est actif et la permission accordée) ;
// - ses widgets de tableau de bord (même règle).
// Ajouter un module = créer son dossier + son manifeste, puis l'ajouter à MANIFESTES (docs/SOP/02_CREER_UN_MODULE.md).
// La base reste la seule frontière de sécurité : ce registre ne fait que masquer ce qui n'est pas utilisable.
import abonnements from './abonnements/manifeste.js';
import achats from './achats/manifeste.js';
import agenda from './agenda/manifeste.js';
import articles from './articles/manifeste.js';
import caisse from './caisse/manifeste.js';
import cloture from './cloture/manifeste.js';
import contacts from './contacts/manifeste.js';
import crm from './crm/manifeste.js';
import depenses from './depenses/manifeste.js';
import documents from './documents/manifeste.js';
import { boutique as ecommerceBoutique } from './ecommerce/manifeste.js';
import etablissement from './etablissement/manifeste.js';
import { biens as immoBiens, locations as immoLocations, maintenance as immoMaintenance } from './immobilier/manifeste.js';
import { chambres as hotelChambres, reservations as hotelReservations } from './hotel/manifeste.js';
import facturation from './facturation/manifeste.js';
import membres from './etablissement/manifeste_membres.js';
import paiements from './paiements/manifeste.js';
import rapports from './rapports/manifeste.js';
import fidelite from './fidelite/manifeste.js';
import projets from './projets/manifeste.js';
import { cuisine as restaurantCuisine, salle as restaurantSalle } from './restaurant/manifeste.js';
import rh from './rh/manifeste.js';
import siteWeb from './site_web/manifeste.js';
import stock from './stock/manifeste.js';
import support from './support/manifeste.js';
import tableauDeBord from './tableau_de_bord/manifeste.js';
import ventes from './ventes/manifeste.js';

export const MANIFESTES = [tableauDeBord, rapports, restaurantSalle, restaurantCuisine, hotelReservations, hotelChambres, immoLocations, immoBiens, immoMaintenance, ecommerceBoutique, caisse, ventes, paiements, cloture, facturation, abonnements, articles, stock, achats, crm, contacts, agenda, support, fidelite, siteWeb, depenses, rh, projets, documents, etablissement, membres];

// Ordre des groupes du menu ; un groupe inconnu déclaré par un nouveau module s'ajoute à la fin.
export const GROUPES = ['Pilotage', 'Immobilier', 'Vente', 'Catalogue et stock', 'Relations', 'Ressources humaines', 'Organisation'];

const rangGroupe = (g) => (GROUPES.includes(g) ? GROUPES.indexOf(g) : GROUPES.length);

export const PAGES = MANIFESTES
  .flatMap((m) => m.pages.map((p) => ({ ...p, module: p.module ?? m.module })))
  .sort((a, b) => rangGroupe(a.groupe) - rangGroupe(b.groupe) || (a.ordre ?? 99) - (b.ordre ?? 99));

export const WIDGETS = MANIFESTES
  .flatMap((m) => (m.widgets ?? []).map((w) => ({ ...w, module: w.module ?? m.module })))
  .sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99));

export function pagesAccessibles({ moduleActif, peut }) {
  return PAGES.filter((p) => moduleActif(p.module) && peut(p.permission));
}

// Pages affichées dans le menu (certaines disparaissent une fois inutiles).
export function pagesDuMenu(espace) {
  return pagesAccessibles(espace).filter((p) => !p.horsMenuSi?.(espace.etablissement, espace));
}

export function groupesDuMenu(pages) {
  return [...new Set(pages.map((p) => p.groupe))].sort((a, b) => rangGroupe(a) - rangGroupe(b));
}

// Widgets visibles pour cette personne, dans cette zone du tableau de bord.
export function widgetsAccessibles(espace, zone, contexte) {
  return WIDGETS.filter((w) => w.zone === zone
    && espace.moduleActif(w.module)
    && (!w.permission || espace.peut(w.permission))
    && (!w.visible || w.visible({ ...contexte, espace })));
}
