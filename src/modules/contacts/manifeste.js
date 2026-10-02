import Contacts from './Contacts.jsx';

export default {
  module: 'contacts',
  pages: [
    { id: 'contacts', libelle: 'Contacts', icone: 'contacts', groupe: 'Relations', ordre: 10, permission: 'contacts.lire', composant: Contacts },
  ],
  widgets: [],
};
