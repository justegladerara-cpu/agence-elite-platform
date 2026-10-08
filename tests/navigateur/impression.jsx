import { createRoot } from 'react-dom/client';
import { FournisseurEspace } from '../../src/noyau/espace.jsx';
import { ModaleRecu } from '../../src/modules/recus/Recu.jsx';
import DocumentVente from '../../src/modules/facturation/Document.jsx';
import '../../src/styles.css';

const etablissement = { id: 'etablissement-fictif', nom: 'Établissement fictif', devise: 'XAF', permissions: [], modules: [], hubs: [], ecriture: true };
const recu = {
  etablissement,
  vente: { numero: 'FICTIF-T001', cree_le: '2026-10-08T10:00:00Z', statut: 'validee', total: 1200, montant_paye: 1200, remise: 0 },
  lignes: [{ libelle: 'Article entièrement fictif', quantite: 2, prix_unitaire: 600, total: 1200, remise: 0 }],
  paiements: [{ mode: 'especes', montant: 1200, statut: 'valide' }],
  documents: { nom_commercial: 'Entreprise fictive', adresse: 'Adresse inventée', mentions: 'Document de test sans valeur.' },
};
const complet = {
  document: { id: 'document-fictif', type: 'facture', statut: 'emise', numero: 'FICTIF-F001', date_document: '2026-10-08', cree_le: '2026-10-08T10:00:00Z', total_ht: 1200, total_tva: 0, total_ttc: 1200 },
  lignes: [{ id: 'ligne-fictive', libelle: 'Article entièrement fictif', quantite: 2, prix_unitaire: 600, total_ht: 1200, remise: 0, taux_tva: 0 }],
  contact: { nom: 'Client fictif' }, identite: { documents: recu.documents }, devise: 'XAF', parametres: {}, vente: null, paiements: [], derives: [],
};
const api = {
  rpc: async (nom) => {
    if (nom === 'recu_vente') return recu;
    if (nom === 'document_vente_complet') return complet;
    throw new Error(`RPC inattendue : ${nom}`);
  },
  lire: async () => [],
};
const contexte = { etablissements: [etablissement], utilisateur: { id: 'profil-fictif', nom: 'Profil fictif' } };
const type = new URLSearchParams(location.search).get('type');
createRoot(document.getElementById('root')).render(
  <FournisseurEspace api={api} contexte={contexte}>
    {type === 'a4' ? <DocumentVente documentId="document-fictif" naviguer={() => {}} />
      : <ModaleRecu venteId="vente-fictive" onFermer={() => {}} />}
  </FournisseurEspace>
);
