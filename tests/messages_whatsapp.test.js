import { describe, expect, test } from 'vitest';
import {
  liensGroupe, lienWhatsApp, messageRappelClient, messageRelanceFactures, numeroWhatsApp, personnaliserMessage, tonRelance,
} from '../src/noyau/messagesWhatsapp.js';
import { libelleDepense, MOTIFS_DEPENSE, motifParId } from '../src/modules/depenses/motifs.js';
import { regrouperCreances } from '../src/modules/paiements/dettes.js';
import { regrouperDettesFournisseurs } from '../src/modules/achats/commun.js';
import { contactsPourEnvoi, nomOuTelephone } from '../src/modules/contacts/envoiGroupe.js';

const montant = (n) => `${n} F`;

describe('liens WhatsApp', () => {
  test('numéro : international gardé, local du Congo complété, trop court refusé', () => {
    expect(numeroWhatsApp('+242 06 123 45 67')).toBe('242061234567');
    expect(numeroWhatsApp('00242 06 123 45 67')).toBe('242061234567');
    expect(numeroWhatsApp('06 123 45 67')).toBe('242061234567');
    expect(numeroWhatsApp('06.123.45.67', '237')).toBe('237061234567');
    expect(numeroWhatsApp('12 34')).toBe('');
    expect(numeroWhatsApp(null)).toBe('');
  });

  test('lien prérempli encodé, sans numéro : WhatsApp demande le destinataire', () => {
    expect(lienWhatsApp('06 123 45 67', 'Bonjour & merci')).toBe('https://wa.me/242061234567?text=Bonjour%20%26%20merci');
    expect(lienWhatsApp('', 'Salut')).toBe('https://wa.me/?text=Salut');
  });
});

describe('textes de relance', () => {
  test('ton selon le retard : rappel, doux (J+7), ferme (J+15), très ferme (> 60 j)', () => {
    expect([-3, 0, 7, 14, 15, 60, 61].map(tonRelance)).toEqual(['rappel', 'rappel', 'doux', 'doux', 'ferme', 'ferme', 'tres_ferme']);
  });

  test('facture à J+7 polie, à J+15 plus ferme, total et signature', () => {
    const doux = messageRelanceFactures({ nom: 'Mme Test', factures: [{ numero: 'FA-1', reste: 5000, jours: 7 }], montant, emetteur: 'Boutique Démo' });
    expect(doux).toMatch(/^Bonjour Mme Test, sauf erreur de notre part, la facture suivante est arrivée à échéance/);
    expect(doux).toMatch(/- FA-1 : 5000 F \(en retard de 7 j\)/);
    expect(doux).toMatch(/Cordialement, Boutique Démo$/);
    const ferme = messageRelanceFactures({ nom: 'M. Test', factures: [{ numero: 'FA-2', reste: 1000, jours: 20 }, { numero: 'FA-3', reste: 500, jours: 3 }], montant });
    expect(ferme).toMatch(/pas encore reçu le règlement des factures suivantes/);
    expect(ferme).toMatch(/Total : 1500 F\./);
    expect(ferme).toMatch(/dès aujourd’hui/);
  });

  test('rappel de dette client : amical au début, plus ferme après 15 jours', () => {
    const amical = messageRappelClient({ nom: 'Awa', total: 12000, montant, depuis: '01/10/2026', jours: 5, emetteur: 'Boutique Démo' });
    expect(amical).toBe('Bonjour Awa,\nPetit rappel amical : il reste 12000 F à régler pour vos achats (depuis le 01/10/2026).\n'
      + 'Vous pouvez passer régler quand cela vous arrange, ou nous dire quand c’est possible.\nMerci, Boutique Démo');
    const ferme = messageRappelClient({ nom: '', total: 3000, montant, jours: 40 });
    expect(ferme).toMatch(/^Bonjour,\nNous revenons vers vous au sujet de la somme de 3000 F/);
    expect(ferme).toMatch(/Merci beaucoup\.$/);
  });

  test('message à plusieurs : {nom} remplacé, un lien par contact joignable', () => {
    expect(personnaliserMessage('Bonjour {nom} !', { nom: 'Paul' })).toBe('Bonjour Paul !');
    expect(personnaliserMessage('Bonjour {NOM}', {})).toBe('Bonjour cher client');
    const { avec, sans } = liensGroupe([{ id: 'a', nom: 'Paul', telephone: '06 111 22 33' }, { id: 'b', nom: 'Sans', telephone: '' }], 'Promo {nom}');
    expect(avec).toEqual([{ contact: { id: 'a', nom: 'Paul', telephone: '06 111 22 33' }, url: 'https://wa.me/242061112233?text=Promo%20Paul' }]);
    expect(sans.map((c) => c.id)).toEqual(['b']);
  });
});

describe('J’ai payé une dépense', () => {
  test('chaque motif tombe dans une catégorie de dépense existante', () => {
    expect(MOTIFS_DEPENSE.map((m) => m.libelle)).toEqual(['Loyer', 'Transport', 'Électricité', 'Eau', 'Salaire', 'Marchandise', 'Téléphone / Internet', 'Réparation', 'Autre']);
    expect(motifParId('electricite').categorie).toBe('Énergie');
    expect(motifParId('reparation').categorie).toBe('Entretien');
    expect(motifParId('inconnu')).toBeNull();
  });

  test('libellé : le texte écrit, sinon le motif ; rien → vide', () => {
    expect(libelleDepense({ libelle: '  Taxi dépôt ', motif: 'transport' })).toBe('Taxi dépôt');
    expect(libelleDepense({ libelle: '', motif: 'loyer' })).toBe('Loyer');
    expect(libelleDepense({ libelle: '', motif: 'autre' })).toBe('Autre dépense');
    expect(libelleDepense({ libelle: '', motif: '' })).toBe('');
  });
});

describe('Qui me doit ? / À qui je dois ?', () => {
  test('créances par client : ventes et factures non soldées, plus ancienne en tête, sans nom à la fin', () => {
    const ventes = [
      { id: 'v1', numero: 'V-1', contact_id: 'a', total: 10000, montant_paye: 4000, statut: 'validee', cree_le: '2026-10-01T10:00:00Z' },
      { id: 'v2', numero: 'V-2', contact_id: 'a', total: '5000', montant_paye: '0', statut: 'validee', cree_le: new Date('2026-09-20T08:00:00Z') },
      { id: 'v3', numero: 'V-3', contact_id: 'b', total: 3000, montant_paye: 0, statut: 'validee', cree_le: '2026-09-01T08:00:00Z' },
      { id: 'v4', numero: 'V-4', contact_id: 'b', total: 3000, montant_paye: 3000, statut: 'validee', cree_le: '2026-08-01T08:00:00Z' },
      { id: 'v5', numero: 'V-5', contact_id: 'c', total: 3000, montant_paye: 0, statut: 'annulee', cree_le: '2026-08-01T08:00:00Z' },
      { id: 'v6', numero: 'V-6', contact_id: null, total: 800, montant_paye: 0, statut: 'validee', cree_le: '2026-07-01T08:00:00Z' },
    ];
    const groupes = regrouperCreances(ventes, { v3: { id: 'd3', numero: 'FA-3', echeance: '2026-10-01' } }, '2026-10-11');
    expect(groupes.map((g) => g.contact_id)).toEqual(['b', 'a', null]);
    expect(groupes[0]).toMatchObject({ total: 3000, plus_ancienne: '2026-09-01', jours: 10 });
    expect(groupes[0].lignes[0]).toMatchObject({ numero: 'FA-3', document_id: 'd3', echeance: '2026-10-01' });
    expect(groupes[1]).toMatchObject({ total: 11000, plus_ancienne: '2026-09-20', jours: 21 });
    expect(groupes[1].lignes.map((l) => l.vente_id)).toEqual(['v2', 'v1']);
  });

  test('dettes fournisseurs : reçu non payé, retards d’abord, échéance la plus proche', () => {
    const commandes = [
      { id: 'c1', numero: 'BC-1', fournisseur_id: 'f1', statut: 'recue', montant_recu: 50000, montant_paye: 20000, echeance: '2026-11-01' },
      { id: 'c2', numero: 'BC-2', fournisseur_id: 'f2', statut: 'partielle', montant_recu: 10000, montant_paye: 0, echeance: '2026-10-01' },
      { id: 'c3', numero: 'BC-3', fournisseur_id: 'f2', statut: 'recue', montant_recu: 4000, montant_paye: 0, echeance: null },
      { id: 'c4', numero: 'BC-4', fournisseur_id: 'f3', statut: 'recue', montant_recu: 9000, montant_paye: 9000, echeance: '2026-09-01' },
      { id: 'c5', numero: 'BC-5', fournisseur_id: 'f3', statut: 'annulee', montant_recu: 9000, montant_paye: 0, echeance: '2026-09-01' },
    ];
    const groupes = regrouperDettesFournisseurs(commandes, '2026-10-11');
    expect(groupes.map((g) => g.fournisseur_id)).toEqual(['f2', 'f1']);
    expect(groupes[0]).toMatchObject({ total: 14000, en_retard: 10000, prochaine_echeance: '2026-10-01' });
    expect(groupes[0].commandes.map((c) => c.numero)).toEqual(['BC-2', 'BC-3']);
    expect(groupes[1]).toMatchObject({ total: 30000, en_retard: 0, prochaine_echeance: '2026-11-01' });
  });
});

describe('contacts', () => {
  test('client avec seulement un numéro : le nom reprend le téléphone', () => {
    expect(nomOuTelephone({ nom: '  ', telephone: ' 06 123 45 67 ' })).toBe('06 123 45 67');
    expect(nomOuTelephone({ nom: 'Awa', telephone: '06' })).toBe('Awa');
    expect(nomOuTelephone({ nom: '', telephone: '' })).toBe('');
  });

  test('envoi groupé : actifs, non anonymisés, filtrés par type, dette et recherche', () => {
    const contacts = [
      { id: 'a', nom: 'Awa', type: 'client', actif: true, telephone: '061' },
      { id: 'b', nom: 'Bob', type: 'fournisseur', actif: true },
      { id: 'c', nom: 'Céline', type: 'les_deux', actif: true },
      { id: 'd', nom: 'Dan', type: 'client', actif: false },
      { id: 'e', nom: 'Anonyme', type: 'client', actif: true, anonymise_le: '2026-01-01' },
    ];
    expect(contactsPourEnvoi(contacts).map((c) => c.id)).toEqual(['a', 'c']);
    expect(contactsPourEnvoi(contacts, { filtre: 'fournisseurs' }).map((c) => c.id)).toEqual(['b', 'c']);
    expect(contactsPourEnvoi(contacts, { filtre: 'credit', soldes: { c: 100 } }).map((c) => c.id)).toEqual(['c']);
    expect(contactsPourEnvoi(contacts, { filtre: 'tous', recherche: '061' }).map((c) => c.id)).toEqual(['a']);
  });
});
