// Contacts : petites règles pures (testées dans tests/messages_whatsapp.test.js).

// Création rapide : un client peut n'avoir qu'un numéro de téléphone ; son nom devient alors ce numéro
// (la base exige un nom non vide). '' si ni nom ni téléphone.
export function nomOuTelephone({ nom, telephone }) {
  return String(nom ?? '').trim() || String(telephone ?? '').trim();
}

// Filtres du « Message à plusieurs clients » (les contacts n'ont pas d'étiquettes : on filtre par type et par dette).
export const FILTRES_ENVOI = [
  ['clients', 'Clients'],
  ['credit', 'Qui me doivent de l’argent'],
  ['fournisseurs', 'Fournisseurs'],
  ['tous', 'Tous'],
];

// Contacts proposés pour un envoi groupé : actifs, non anonymisés, selon le filtre et la recherche (nom ou téléphone).
export function contactsPourEnvoi(contacts, { filtre = 'clients', soldes = {}, recherche = '' } = {}) {
  const texte = String(recherche).trim().toLowerCase();
  return contacts.filter((c) => {
    if (!c.actif || c.anonymise_le) return false;
    if (filtre === 'clients' && !['client', 'les_deux', 'prospect'].includes(c.type)) return false;
    if (filtre === 'fournisseurs' && !['fournisseur', 'les_deux'].includes(c.type)) return false;
    if (filtre === 'credit' && !(soldes[c.id] > 0)) return false;
    return !texte || String(c.nom).toLowerCase().includes(texte) || String(c.telephone ?? '').includes(texte);
  });
}
