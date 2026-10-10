// Espace Agence Elite : pages routées sous #/editeur/…
import React from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { EmptyState } from '../../ui/composants.jsx';
import AdressesEditeur from './AdressesEditeur.jsx';
import { ListeClients, PageClient } from './ClientsEditeur.jsx';
import ComptesEditeur from './ComptesEditeur.jsx';
import { PageEtablissementEditeur } from './EtablissementEditeur.jsx';
import HubsEditeur from './HubsEditeur.jsx';
import ModulesEditeur from './ModulesEditeur.jsx';
import OffresEditeur from './OffresEditeur.jsx';
import PartnersEditeur from './PartnersEditeur.jsx';
import SitesEditeur from './SitesEditeur.jsx';
import IdentiteEditeur from './PagesAuthEditeur.jsx';
import TableauEditeur from './TableauEditeur.jsx';

// Menu de l'espace Agence Elite (le rôle Admin n'a ni tarifs ni administrateurs : la base le refuse aussi).
export const MENU_EDITEUR = [
  { id: 'editeur', libelle: 'Tableau de bord', icone: 'tableau' },
  { id: 'editeur/clients', libelle: 'Clients', icone: 'clients' },
  { id: 'editeur/hubs', libelle: 'Hubs', icone: 'hub' },
  { id: 'editeur/modules', libelle: 'Catalogue', icone: 'modules' },
  { id: 'editeur/comptes', libelle: 'Comptes', icone: 'comptes' },
  { id: 'editeur/offres', libelle: 'Offres et prix', icone: 'offres' },
  { id: 'editeur/partenaires', libelle: 'Elite Partners', icone: 'etoile' },
  { id: 'editeur/identite', libelle: 'Identité et apparence', icone: 'cle' },
  { id: 'editeur/adresses', libelle: 'Adresses web', icone: 'globe', superAdmin: true },
  { id: 'editeur/sites', libelle: 'Sites clients', icone: 'dossier', superAdmin: true },
];

export function routeEditeurActive(route) {
  const segments = route.split('/');
  if (segments[1] === 'etablissements') return 'editeur/clients';
  return segments.length > 1 ? `editeur/${segments[1]}` : 'editeur';
}

export default function EspaceEditeur({ route, naviguer }) {
  const { editeur } = useEspace();
  if (!editeur) return <EmptyState titre="Accès réservé à l’équipe Agence Elite" />;
  const [, section, id] = route.split('/');
  switch (section) {
    case undefined:
    case '':
      return <TableauEditeur naviguer={naviguer} />;
    case 'clients':
      return id ? <PageClient key={id} clientId={id} naviguer={naviguer} /> : <ListeClients naviguer={naviguer} />;
    case 'etablissements':
      return <PageEtablissementEditeur key={id} etablissementId={id} naviguer={naviguer} />;
    case 'hubs':
      return <HubsEditeur naviguer={naviguer} />;
    case 'modules':
      return <ModulesEditeur />;
    case 'comptes':
      return <ComptesEditeur />;
    case 'offres':
      return <OffresEditeur />;
    case 'partenaires':
      return <PartnersEditeur />;
    case 'adresses':
      return <AdressesEditeur key={id ?? ''} suggestion={id ?? ''} />;
    case 'sites':
      return <SitesEditeur key={id ?? ''} siteId={id} naviguer={naviguer} />;
    case 'identite':
      return <IdentiteEditeur route={route} naviguer={naviguer} />;
    default:
      return <EmptyState titre="Page introuvable" texte="Revenez au tableau de bord Agence Elite." />;
  }
}
