import React, { useState } from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { Badge, Bouton, DataTable, EmptyState, Modale } from '../../ui/composants.jsx';
import { balanceAgee, messageRelance, TRANCHES_RETARD } from './commun.js';

// Onglet « Retards » de Devis et factures : qui doit combien, depuis quand, et un message de relance prêt à envoyer.
// Aucun envoi automatique : le message se copie ou s'ouvre dans WhatsApp sur le téléphone de la personne.
function ModaleRelance({ client, ligne, onFermer }) {
  const { montant, etablissement } = useEspace();
  const [texte, setTexte] = useState(() => messageRelance({
    nom: client?.nom ?? '', factures: ligne.factures, montant, emetteur: etablissement.identite?.nom_commercial ?? etablissement.nom,
  }));
  const [copie, setCopie] = useState(false);
  const telephone = (client?.telephone ?? '').replace(/[^\d]/g, '');
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(true);
    } catch {
      setCopie(false);
    }
  };
  return (
    <Modale titre={`Relancer ${client?.societe || client?.nom || ''}`} onFermer={onFermer} pied={(
      <>
        {telephone && <a className="bouton" href={`https://wa.me/${telephone}?text=${encodeURIComponent(texte)}`} target="_blank" rel="noreferrer">Ouvrir dans WhatsApp</a>}
        <Bouton variante="principal" icone="document" onClick={copier}>{copie ? 'Copié' : 'Copier le message'}</Bouton>
      </>
    )}>
      <label className="champ">
        <span>Message (modifiable)</span>
        <textarea rows={10} value={texte} onChange={(e) => { setTexte(e.target.value); setCopie(false); }} />
      </label>
      {!telephone && <p className="texte-doux">Aucun téléphone sur la fiche du contact : copiez le message pour l’envoyer par e-mail ou SMS.</p>}
    </Modale>
  );
}

export default function BalanceAgee({ documents, ventes, contacts, aujourdhui, naviguer, contestees }) {
  const { montant } = useEspace();
  const [relance, setRelance] = useState(null);
  const lignes = balanceAgee(documents, ventes, aujourdhui, contestees);
  // Une facture contestée reste due mais ne se relance pas tant que la contestation est ouverte.
  const aRelancer = (l) => l.factures.filter((f) => !f.contestee);
  const nom = (l) => contacts[l.contact_id]?.societe || contacts[l.contact_id]?.nom || '—';
  const total = (k) => lignes.reduce((s, l) => s + l.tranches[k], 0);
  return (
    <>
      <div className="grille-stats balance-totaux">
        {TRANCHES_RETARD.map(([k, libelle]) => (
          <div key={k} className={`indicateur ${k !== 'a_echoir' && total(k) > 0 ? 'texte-alerte' : ''}`}>
            <span className="indicateur-libelle">{libelle}</span><strong>{montant(total(k))}</strong>
          </div>
        ))}
      </div>
      <DataTable
        titreExport="balance-agee"
        colonnes={[
          { id: 'client', libelle: 'Client', tri: nom, rendu: (l) => <strong>{nom(l)}</strong> },
          ...TRANCHES_RETARD.map(([k, libelle]) => ({
            id: k, libelle, classe: 'nombre', tri: (l) => l.tranches[k],
            rendu: (l) => (l.tranches[k] > 0 ? <span className={k === 'a_echoir' ? '' : 'texte-alerte'}>{montant(l.tranches[k])}</span> : '—'),
          })),
          { id: 'total', libelle: 'Total dû', classe: 'nombre', tri: (l) => l.total, rendu: (l) => <strong>{montant(l.total)}</strong> },
          { id: 'retard', libelle: 'Retard max.', classe: 'nombre', tri: (l) => l.retard_max, rendu: (l) => (l.retard_max > 0 ? `${l.retard_max} j` : '—') },
          { id: 'contestee', libelle: 'Contesté', classe: 'nombre', tri: (l) => l.factures.filter((f) => f.contestee).length,
            rendu: (l) => (l.factures.some((f) => f.contestee) ? <Badge ton="orange">{montant(l.factures.filter((f) => f.contestee).reduce((s, f) => s + f.reste, 0))}</Badge> : '—'),
            exporter: (l) => l.factures.filter((f) => f.contestee).reduce((s, f) => s + f.reste, 0) },
          { id: 'actions', libelle: '', exporter: false, rendu: (l) => (aRelancer(l).length
            ? <button type="button" className="lien" onClick={(e) => { e.stopPropagation(); setRelance({ ...l, factures: aRelancer(l) }); }}>Relancer</button>
            : <span className="texte-doux">Contestée</span>) },
        ]}
        lignes={lignes}
        rechercher={nom}
        placeholder="Client"
        triInitial={{ id: 'retard', sens: 'desc' }}
        onLigne={(l) => naviguer(`factures/${l.factures[0].id}`)}
        vide={<EmptyState titre="Aucune facture impayée" icone="facture" texte="Toutes les factures émises sont réglées." />}
      />
      {relance && <ModaleRelance client={contacts[relance.contact_id]} ligne={relance} onFermer={() => setRelance(null)} />}
    </>
  );
}
