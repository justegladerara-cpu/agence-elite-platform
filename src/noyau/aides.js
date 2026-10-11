// Petites bulles d'aide : une phrase simple par écran, qui dit à quoi il sert.
// Fermée une fois, elle ne revient plus sur cet appareil (localStorage).
export const AIDES = {
  accueil: 'Ici, vous choisissez ce que vous voulez faire. Les gros boutons mènent directement au bon écran.',
  caisse: 'Ici, vous vendez : touchez un article pour le mettre dans le panier, puis « Encaisser ».',
  ventes: 'Ici, vous retrouvez toutes vos ventes. Vous pouvez réimprimer un reçu ou enregistrer un retour.',
  clotures: 'Ici, vous fermez votre caisse : comptez vos billets, le logiciel compare avec ce qu’il attendait.',
  'qui-me-doit': 'Ici, vous voyez les clients qui vous doivent de l’argent et vous pouvez leur envoyer un rappel.',
  'a-qui-je-dois': 'Ici, vous voyez ce que vous devez à vos fournisseurs et quand le payer.',
  articles: 'Ici, vous créez vos articles : un nom et un prix suffisent pour commencer.',
  stock: 'Ici, vous enregistrez ce que vous avez reçu, ce que vous avez perdu, et vous comptez votre stock.',
  achats: 'Ici, vous voyez ce qu’il faut commander et vous préparez vos commandes aux fournisseurs.',
  depenses: 'Ici, vous notez l’argent sorti pour le magasin : loyer, transport, électricité…',
  contacts: 'Ici, vous gardez vos clients et vos fournisseurs. Un numéro de téléphone suffit.',
  factures: 'Ici, vous faites vos devis et vos factures, et vous suivez qui a payé.',
  'tableau-de-bord': 'Ici, vous voyez vos chiffres : ventes, argent encaissé, dépenses et stock.',
};

const CLE = 'aides-fermees';

export function aidesFermees() {
  try {
    return JSON.parse(window.localStorage.getItem(CLE) ?? '[]');
  } catch {
    return [];
  }
}

export function fermerAide(id) {
  try {
    const fermees = new Set(aidesFermees());
    fermees.add(id);
    window.localStorage.setItem(CLE, JSON.stringify([...fermees]));
  } catch {
    // Sans stockage, la bulle reviendra à la prochaine ouverture : sans gravité.
  }
}
