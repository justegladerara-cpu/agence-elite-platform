// Espace Agence Elite : pages routées sous #/editeur/…
import React from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { EmptyState } from '../../ui/composants.jsx';
import AdressesEditeur from './AdressesEditeur.jsx';
import { ListeClients, PageClient } from './ClientsEditeur.jsx';
import ComptesEditeur from './ComptesEditeur.jsx';
import CrmEditeur from './CrmEditeur.jsx';
import CopieArticlesEditeur from './CopieArticlesEditeur.jsx';
import { PageEtablissementEditeur } from './EtablissementEditeur.jsx';
import HubsEditeur from './HubsEditeur.jsx';
import ModulesEditeur from './ModulesEditeur.jsx';
import OffresEditeur from './OffresEditeur.jsx';
import PartnersEditeur from './PartnersEditeur.jsx';
import SitesEditeur from './SitesEditeur.jsx';
import IdentiteEditeur from './PagesAuthEditeur.jsx';
import TableauEditeur from './TableauEditeur.jsx';

// Menu de l'espace Agence Elite (le rôle Admin n'a ni tarifs ni administrateurs : la base le refuse aussi).
// Depuis le 2026-10-18, l'administration se fait dans le CRM (crm.agence-elite.fr › Plateforme) : le menu ne montre plus
// qu'« Administration (CRM) ». Les autres écrans (secours: true) restent ouverts par lien direct, depuis la boîte à
// outils du CRM ou la liste « Accès de secours », au cas où le CRM serait indisponible.
export const MENU_EDITEUR = [
  { id: 'editeur', libelle: 'Administration (CRM)', icone: 'clients' },
  { id: 'editeur/tableau', libelle: 'Tableau de bord', icone: 'tableau', secours: true },
  { id: 'editeur/clients', libelle: 'Clients', icone: 'clients', secours: true },
  { id: 'editeur/hubs', libelle: 'Hubs', icone: 'hub', secours: true },
  { id: 'editeur/modules', libelle: 'Catalogue', icone: 'modules', secours: true },
  { id: 'editeur/comptes', libelle: 'Comptes', icone: 'comptes', secours: true },
  { id: 'editeur/offres', libelle: 'Offres et prix', icone: 'offres', secours: true },
  { id: 'editeur/partenaires', libelle: 'Elite Partners', icone: 'etoile', secours: true },
  { id: 'editeur/identite', libelle: 'Identité et apparence', icone: 'cle', secours: true },
  { id: 'editeur/adresses', libelle: 'Adresses web', icone: 'globe', superAdmin: true, secours: true },
  { id: 'editeur/sites', libelle: 'Sites clients', icone: 'dossier', superAdmin: true, secours: true },
  { id: 'editeur/crm', libelle: 'CRM Agence Elite', icone: 'clients', superAdmin: true, secours: true },
  { id: 'editeur/copie-articles', libelle: 'Copier des articles', icone: 'articles', superAdmin: true, secours: true },
];

// Page d'accueil de l'espace Agence Elite : renvoi vers le CRM, et les écrans de secours
function AdministrationDansLeCrm() {
  const { roleEditeur } = useEspace();
  const ecrans = MENU_EDITEUR.filter((m) => m.secours && (!m.superAdmin || roleEditeur === 'super_admin') && m.id !== 'editeur/crm');
  return (
    <>
      <CrmEditeur accueil />
      <div className="page">
        <details className="acces-secours">
          <summary>Accès de secours (si le CRM est indisponible)</summary>
          <ul>
            {ecrans.map((m) => (
              <li key={m.id}><a href={`#/${m.id}`}>{m.libelle}</a></li>
            ))}
          </ul>
        </details>
      </div>
    </>
  );
}

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
      return <AdministrationDansLeCrm />;
    case 'tableau':
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
    case 'crm':
      return <CrmEditeur />;
    case 'copie-articles':
      return <CopieArticlesEditeur />;
    case 'identite':
      return <IdentiteEditeur route={route} naviguer={naviguer} />;
    default:
      return <EmptyState titre="Page introuvable" texte="Revenez au tableau de bord Agence Elite." />;
  }
}
