import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { dateLocale, formatDate } from '../../noyau/format.js';
import { lienWhatsApp, messageRappelClient, numeroWhatsApp } from '../../noyau/messagesWhatsapp.js';
import { Bouton, Chargement, EmptyState, EnTete, Erreur, Modale, Recherche } from '../../ui/composants.jsx';
import { ModaleEncaissement } from '../ventes/Ventes.jsx';
import { regrouperCreances } from './dettes.js';
import './dettes.css';

// « Qui me doit ? » : les clients qui doivent encore de l'argent (ventes à crédit, payées en partie, factures non
// soldées), le total par client, depuis quand, un rappel WhatsApp prêt à envoyer et « Il a payé » qui ouvre
// l'encaissement déjà existant (vente) ou la facture. Rien n'est envoyé automatiquement.
export default function QuiMeDoit({ naviguer }) {
  const { api, etablissement, montant, peut, moduleActif, notifier, hub, multiHub } = useEspace();
  const etab = etablissement.id;
  const hubFiltre = multiHub ? hub?.id ?? null : null;
  const lireVentes = peut('ventes.lire');
  const voirFactures = moduleActif('facturation') && peut('facturation.lire');
  const [recherche, setRecherche] = useState('');
  const [paye, setPaye] = useState(null);
  const [encaissement, setEncaissement] = useState(null);
  const aujourdhui = dateLocale();
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    if (!lireVentes) return null;
    const [ventes, contacts, sessions] = await Promise.all([
      api.lire('ventes', {
        eq: { etablissement_id: etab, statut: 'validee', ...(hubFiltre ? { hub_id: hubFiltre } : {}) },
        dans: { statut_paiement: ['partielle', 'impayee'] },
        colonnes: ['id', 'numero', 'contact_id', 'total', 'montant_paye', 'statut', 'statut_paiement', 'origine', 'cree_le', 'hub_id'],
        ordre: ['cree_le', 'asc'], limite: 3000,
      }),
      peut('contacts.lire') ? api.lire('contacts', { eq: { etablissement_id: etab }, colonnes: ['id', 'nom', 'societe', 'telephone'] }).catch(() => []) : [],
      api.lire('sessions_caisse', { eq: { etablissement_id: etab, statut: 'ouverte' } }).catch(() => []),
    ]);
    const idsFactures = ventes.filter((v) => v.origine === 'facture').map((v) => v.id);
    // Par paquets de 100 : l'adresse de la requête reste courte même avec beaucoup de factures ouvertes.
    const paquets = [];
    for (let i = 0; voirFactures && i < idsFactures.length; i += 100) paquets.push(idsFactures.slice(i, i + 100));
    const documents = (await Promise.all(paquets.map((ids) => api.lire('documents_vente', {
      eq: { etablissement_id: etab, type: 'facture', statut: 'emise' }, dans: { vente_id: ids }, colonnes: ['id', 'vente_id', 'numero', 'echeance'],
    }).catch(() => [])))).flat();
    return {
      ventes,
      sessions,
      contacts: Object.fromEntries(contacts.map((c) => [c.id, c])),
      factures: Object.fromEntries(documents.map((d) => [d.vente_id, d])),
    };
  }, [etab, hubFiltre, lireVentes, voirFactures]);

  if (!lireVentes) {
    return (
      <div className="page">
        <EnTete titre="Qui me doit ?" />
        <EmptyState titre="Accès aux ventes nécessaire" texte="Demandez au gérant le droit de voir les ventes pour suivre ce que les clients doivent." />
      </div>
    );
  }

  const groupes = donnees ? regrouperCreances(donnees.ventes, donnees.factures, aujourdhui) : [];
  const nom = (g) => (g.contact_id ? (donnees.contacts[g.contact_id]?.societe || donnees.contacts[g.contact_id]?.nom || 'Client') : 'Ventes à crédit sans nom de client');
  const texte = recherche.trim().toLowerCase();
  const visibles = groupes.filter((g) => !texte || nom(g).toLowerCase().includes(texte) || (donnees.contacts[g.contact_id]?.telephone ?? '').includes(texte));
  const total = groupes.reduce((s, g) => s + g.total, 0);
  const emetteur = etablissement.identite?.nom_commercial ?? etablissement.nom;
  const encaisser = peut('paiements.encaisser');

  // « Il a payé » : une facture s'encaisse sur la facture (trop-perçu géré), une vente dans l'encaissement des ventes.
  const ouvrirPaiement = (ligne) => {
    if (ligne.document_id && voirFactures) {
      naviguer(`factures/${ligne.document_id}`);
      return;
    }
    const vente = donnees.ventes.find((v) => v.id === ligne.vente_id);
    setPaye(null);
    setEncaissement({ ...vente, total: Number(vente.total), montant_paye: Number(vente.montant_paye) });
  };
  const ilAPaye = (g) => {
    if (g.lignes.length === 1) ouvrirPaiement(g.lignes[0]);
    else setPaye(g);
  };

  return (
    <div className="page">
      <EnTete titre="Qui me doit ?" sousTitre={groupes.length ? `${montant(total)} à récupérer auprès de ${groupes.filter((g) => g.contact_id).length} client(s)` : 'Ce que les clients vous doivent encore'}>
        {groupes.length > 3 && <Recherche valeur={recherche} onChange={setRecherche} placeholder="Nom ou téléphone" />}
      </EnTete>
      {chargement && !donnees && <Chargement />}
      <Erreur message={erreur} />
      {donnees && !groupes.length && <EmptyState icone="coche" titre="Personne ne vous doit d’argent" texte="Toutes les ventes et factures sont payées." />}
      <div className="dettes-liste">
        {visibles.map((g) => {
          const contact = donnees.contacts[g.contact_id];
          const message = messageRappelClient({ nom: contact?.nom, total: g.total, montant, depuis: formatDate(g.plus_ancienne), jours: g.jours, emetteur });
          const telephone = numeroWhatsApp(contact?.telephone);
          return (
            <article key={g.contact_id ?? 'sans-nom'} className={`dette-carte ${g.jours > 30 ? 'ancienne' : ''}`}>
              <header className="dette-tete">
                <span>
                  <strong>{nom(g)}</strong>
                  <small className="texte-doux bloc">
                    Depuis le {formatDate(g.plus_ancienne)}{g.jours > 0 ? ` · ${g.jours} jour(s)` : ''}{contact?.telephone ? ` · ${contact.telephone}` : ''}
                  </small>
                </span>
                <strong className="dette-montant">{montant(g.total)}</strong>
              </header>
              <ul className="dette-lignes">
                {g.lignes.map((l) => (
                  <li key={l.vente_id}>
                    <span>{l.numero} · {formatDate(l.date)}{l.echeance ? ` · échéance ${formatDate(l.echeance)}` : ''}</span>
                    <span>{montant(l.reste)}</span>
                  </li>
                ))}
              </ul>
              <div className="dette-actions">
                {g.contact_id && (telephone
                  ? <a className="bouton" href={lienWhatsApp(contact.telephone, message)} target="_blank" rel="noreferrer">Rappeler sur WhatsApp</a>
                  : <span className="texte-doux">Pas de téléphone sur la fiche : <button type="button" className="lien" onClick={() => naviguer(`contacts/${g.contact_id}`)}>l’ajouter</button></span>)}
                {encaisser && <Bouton variante="principal" icone="coche" onClick={() => ilAPaye(g)}>Il a payé</Bouton>}
              </div>
            </article>
          );
        })}
      </div>
      {paye && (
        <Modale titre={`${nom(paye)} a payé`} onFermer={() => setPaye(null)}>
          <p className="texte-doux">Choisissez ce qu’il a réglé (le plus ancien en premier) :</p>
          <div className="liste-simple">
            {paye.lignes.map((l) => (
              <div key={l.vente_id} className="liste-ligne">
                <span><strong>{l.numero}</strong> · {montant(l.reste)}<small className="texte-doux bloc">{formatDate(l.date)}</small></span>
                <Bouton onClick={() => ouvrirPaiement(l)}>{l.document_id && voirFactures ? 'Ouvrir la facture' : 'Encaisser'}</Bouton>
              </div>
            ))}
          </div>
        </Modale>
      )}
      {encaissement && (
        <ModaleEncaissement
          vente={encaissement}
          sessions={donnees.sessions}
          onFermer={() => setEncaissement(null)}
          onFait={() => {
            setEncaissement(null);
            notifier('Paiement enregistré');
            recharger();
          }}
        />
      )}
    </div>
  );
}
