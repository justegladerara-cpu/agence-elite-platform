import SiteWeb from './SiteWeb.jsx';

export default {
  module: 'site_web',
  pages: [
    { id: 'siteweb', libelle: 'Site web', icone: 'globe', groupe: 'Relations', ordre: 30, permission: 'site_web.lire', composant: SiteWeb },
  ],
  widgets: [],
};
