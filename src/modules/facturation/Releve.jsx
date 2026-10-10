import React, { useEffect, useMemo, useState } from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { formatDate } from '../../noyau/format.js';
import { Bouton, Champ, EmptyState, Erreur, Squelette } from '../../ui/composants.jsx';
import { exporterCsv } from '../../ui/communs.jsx';

// Onglet « Relevé client » : tout ce que le client a acheté et payé sur une période, avec le solde d'ouverture
// et le solde à la fin. Imprimable pour être remis ou envoyé au client.
export default function ReleveClient({ contacts, documents, aujourdhui }) {
  const { api, etablissement, montant } = useEspace();
  // Clients proposés : ceux qui ont au moins une facture émise, les plus récents d'abord.
  const clients = useMemo(() => {
    const vus = new Map();
    for (const d of documents) if (d.type === 'facture' && d.statut !== 'brouillon' && !vus.has(d.contact_id) && contacts[d.contact_id]) vus.set(d.contact_id, contacts[d.contact_id]);
    return [...vus.entries()].map(([id, c]) => ({ id, nom: c.societe || c.nom })).sort((a, b) => a.nom.localeCompare(b.nom));
  }, [contacts, documents]);
  const [contactId, setContactId] = useState('');
  const [du, setDu] = useState(`${aujourdhui.slice(0, 4)}-01-01`);
  const [au, setAu] = useState(aujourdhui);
  const [releve, setReleve] = useState(null);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const [impression, setImpression] = useState(false);
  useEffect(() => {
    if (!contactId || !du || !au) {
      setReleve(null);
      return undefined;
    }
    let actif = true;
    setChargement(true);
    setErreur('');
    api.rpc('releve_client', { p_etablissement_id: etablissement.id, p_contact_id: contactId, p_du: du, p_au: au })
      .then((r) => actif && setReleve(r))
      .catch((err) => actif && (setReleve(null), setErreur(err.message)))
      .finally(() => actif && setChargement(false));
    return () => { actif = false; };
  }, [api, etablissement.id, contactId, du, au]);
  useEffect(() => {
    if (!impression) return undefined;
    const fin = () => { document.body.classList.remove('impression-liste'); setImpression(false); };
    document.body.classList.add('impression-liste');
    window.addEventListener('afterprint', fin);
    const minuterie = setTimeout(() => { window.print(); if (!('onafterprint' in window)) fin(); }, 50);
    return () => { clearTimeout(minuterie); window.removeEventListener('afterprint', fin); document.body.classList.remove('impression-liste'); };
  }, [impression]);
  if (!clients.length) return <EmptyState titre="Aucun client facturé" icone="facture" texte="Le relevé se fait pour un client qui a au moins une facture émise." />;
  const nombre = (n) => String(n).replace('.', ',');
  let solde = Number(releve?.solde_ouverture ?? 0);
  const lignes = (releve?.lignes ?? []).map((l) => {
    solde = Math.round((solde + Number(l.debit) - Number(l.credit)) * 100) / 100;
    return { ...l, solde };
  });
  const nom = releve ? (releve.contact.societe || releve.contact.nom) : '';
  return (
    <div className="pile">
      <div className="grille-champs">
        <Champ libelle="Client">
          <select value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">— Choisir un client</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </Champ>
        <Champ libelle="Du"><input type="date" value={du} max={au} onChange={(e) => setDu(e.target.value)} /></Champ>
        <Champ libelle="Au"><input type="date" value={au} min={du} onChange={(e) => setAu(e.target.value)} /></Champ>
      </div>
      <Erreur message={erreur} />
      {chargement && !releve && <Squelette lignes={4} />}
      {releve && (
        <>
          <div className="groupe-boutons">
            <Bouton icone="imprimer" onClick={() => setImpression(true)}>Imprimer le relevé</Bouton>
            <Bouton icone="telecharger" onClick={() => exporterCsv(`releve-${nom}.csv`, [
              { libelle: 'Date', valeur: (l) => l.date }, { libelle: 'Libellé', valeur: (l) => l.libelle },
              { libelle: 'Débit', valeur: (l) => nombre(l.debit) }, { libelle: 'Crédit', valeur: (l) => nombre(l.credit) }, { libelle: 'Solde', valeur: (l) => nombre(l.solde) },
            ], lignes)}>Exporter</Bouton>
          </div>
          <div className="a-imprimer">
            <h2 className="titre-impression">Relevé de compte · {nom} · {etablissement.identite?.nom_commercial ?? etablissement.nom}</h2>
            <p className="texte-doux">Du {formatDate(releve.du)} au {formatDate(releve.au)}{releve.contact.telephone ? ` · ${releve.contact.telephone}` : ''}</p>
            <div className="tableau-conteneur">
              <table className="tableau">
                <thead><tr><th>Date</th><th>Libellé</th><th className="nombre">Débit</th><th className="nombre">Crédit</th><th className="nombre">Solde</th></tr></thead>
                <tbody>
                  <tr><td>{formatDate(releve.du)}</td><td><em>Solde d’ouverture</em></td><td /><td /><td className="nombre">{montant(releve.solde_ouverture)}</td></tr>
                  {lignes.map((l, i) => (
                    <tr key={i}>
                      <td>{formatDate(l.date)}</td><td>{l.libelle}</td>
                      <td className="nombre">{Number(l.debit) ? montant(l.debit) : ''}</td>
                      <td className="nombre">{Number(l.credit) ? montant(l.credit) : ''}</td>
                      <td className="nombre">{montant(l.solde)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td /><td><strong>Totaux de la période</strong></td>
                    <td className="nombre"><strong>{montant(releve.total_debit)}</strong></td>
                    <td className="nombre"><strong>{montant(releve.total_credit)}</strong></td>
                    <td className="nombre"><strong>{montant(releve.solde_cloture)}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              <strong>{Number(releve.solde_cloture) > 0 ? `Reste dû au ${formatDate(releve.au)} : ${montant(releve.solde_cloture)}` : Number(releve.solde_cloture) < 0 ? `Le client a ${montant(-releve.solde_cloture)} d’avance` : 'Compte soldé'}</strong>
              {Number(releve.credits_disponibles) > 0 && <> · Crédit client disponible (trop-perçu) : {montant(releve.credits_disponibles)}</>}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
