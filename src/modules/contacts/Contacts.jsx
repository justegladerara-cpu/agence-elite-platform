import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { lireParametres } from '../../noyau/routes.js';
import { dateLocale, formatDateHeure } from '../../noyau/format.js';
import { exporterCsv } from '../../ui/communs.jsx';
import { Badge, Bouton, Champ, Chargement, EnTete, Erreur, Modale, Onglets, Recherche, Vide } from '../../ui/composants.jsx';
import { SOURCES } from '../crm/commun.js';
import { BadgePaiement, DetailVente } from '../ventes/Ventes.jsx';
import { RendezVousLies } from '../agenda/RendezVousLies.jsx';
import { AlerteSimilaires, CoordonneesConfirmees, Interlocuteurs } from './Interlocuteurs.jsx';
import { ActionsDonneesPersonnelles } from './DonneesPersonnelles.jsx';

const TYPES = { client: 'Client', prospect: 'Prospect', fournisseur: 'Fournisseur', les_deux: 'Client et fournisseur' };
const CHAMPS = ['type', 'nom', 'societe', 'identifiant_fiscal', 'telephone', 'email', 'adresse', 'notes', 'actif'];

function FormulaireContact({ contact, onFermer, onEnregistre }) {
  const { api, etablissement, moduleActif } = useEspace();
  const crm = moduleActif('crm_pipeline');
  const [valeurs, setValeurs] = useState({
    type: 'client', nom: '', societe: '', identifiant_fiscal: '', telephone: '', email: '', adresse: '', notes: '', actif: true, source: '',
    ...(contact ? Object.fromEntries(Object.entries(contact).map(([k, v]) => [k, v ?? ''])) : {}),
  });
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const changer = (champ) => (e) => setValeurs((v) => ({ ...v, [champ]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const enregistrer = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      const p = Object.fromEntries([...CHAMPS, ...(crm ? ['source'] : [])].map((k) => [k, valeurs[k]]));
      await api.rpc('enregistrer_contact', { p_etablissement_id: etablissement.id, p_contact: { ...p, id: contact?.id } });
      onEnregistre(contact ? 'Contact modifié' : 'Contact créé');
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  return (
    <Modale titre={contact ? 'Modifier le contact' : 'Nouveau contact'} onFermer={onFermer}>
      <form className="formulaire" onSubmit={enregistrer}>
        <Champ libelle="Type">
          <select value={valeurs.type} onChange={changer('type')}>
            {Object.entries(TYPES).filter(([id]) => crm || id !== 'prospect' || valeurs.type === 'prospect').map(([id, libelle]) => <option key={id} value={id}>{libelle}</option>)}
          </select>
        </Champ>
        {crm && (
          <Champ libelle="Origine du contact">
            <select value={valeurs.source} onChange={changer('source')}>
              <option value="">— Non précisée</option>
              {Object.entries(SOURCES).map(([id, libelle]) => <option key={id} value={id}>{libelle}</option>)}
            </select>
          </Champ>
        )}
        <Champ libelle="Nom ou raison sociale"><input value={valeurs.nom} onChange={changer('nom')} required autoFocus /></Champ>
        <div className="grille-champs">
          <Champ libelle="Téléphone"><input type="tel" value={valeurs.telephone} onChange={changer('telephone')} /></Champ>
          <Champ libelle="E-mail"><input type="email" value={valeurs.email} onChange={changer('email')} /></Champ>
        </div>
        {!contact && <AlerteSimilaires nom={valeurs.nom} telephone={valeurs.telephone} email={valeurs.email} />}
        <Champ libelle="Adresse"><input value={valeurs.adresse} onChange={changer('adresse')} /></Champ>
        <div className="grille-champs">
          <Champ libelle="Société (facturation)"><input value={valeurs.societe} onChange={changer('societe')} maxLength={120} /></Champ>
          <Champ libelle="NIU / identifiant fiscal"><input value={valeurs.identifiant_fiscal} onChange={changer('identifiant_fiscal')} maxLength={40} /></Champ>
        </div>
        <Champ libelle="Notes"><textarea rows={2} value={valeurs.notes} onChange={changer('notes')} /></Champ>
        {contact && (
          <label className="case"><input type="checkbox" checked={valeurs.actif} onChange={changer('actif')} /> Contact actif</label>
        )}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={chargement}>Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function FicheContact({ contact, ventes, onFermer, onModifier, onChange, naviguer }) {
  const { montant, peut, moduleActif } = useEspace();
  const [vente, setVente] = useState(null);
  const siennes = ventes.filter((v) => v.contact_id === contact.id);
  const du = siennes.filter((v) => v.statut === 'validee').reduce((s, v) => s + v.total - v.montant_paye, 0);
  if (vente) return <DetailVente venteId={vente} onFermer={() => setVente(null)} onChange={onChange} />;
  return (
    <Modale
      titre={contact.nom}
      onFermer={onFermer}
      large
      pied={(
        <>
          <ActionsDonneesPersonnelles contact={contact} onChange={() => { onChange?.(); onFermer(); }} />
          {peut('contacts.gerer') && !contact.anonymise_le && <Bouton onClick={onModifier}>Modifier</Bouton>}
        </>
      )}
    >
      <div className="fiche">
        <div className="fiche-infos">
          <Badge>{TYPES[contact.type]}</Badge>
          {contact.anonymise_le && <Badge ton="orange">Anonymisé</Badge>}
          {contact.telephone && <span>{contact.telephone}</span>}
          {contact.email && <span>{contact.email}</span>}
          {contact.adresse && <span>{contact.adresse}</span>}
        </div>
        {contact.societe && <p><strong>{contact.societe}</strong>{contact.identifiant_fiscal ? ` · NIU ${contact.identifiant_fiscal}` : ''}</p>}
        {contact.source && <p className="texte-doux">Origine : {SOURCES[contact.source]}</p>}
        {contact.notes && <p className="texte-doux">{contact.notes}</p>}
        <CoordonneesConfirmees contact={contact} onChange={onChange} />
        {contact.type !== 'client' || contact.societe ? <Interlocuteurs contactId={contact.id} /> : null}
        {moduleActif('crm_pipeline') && peut('crm_pipeline.lire') && contact.type !== 'fournisseur' && naviguer && (
          <button type="button" className="lien" onClick={() => naviguer(`crm/contact/${contact.id}`)}>Voir les opportunités et activités</button>
        )}
        {contact.type !== 'fournisseur' && <RendezVousLies contactId={contact.id} naviguer={naviguer} />}
        {peut('ventes.lire') && (
          <>
            <div className="titre-ligne">
              <h3>Achats ({siennes.length})</h3>
              {du > 0 && <Badge ton="orange">Doit {montant(du)}</Badge>}
            </div>
            {!siennes.length && <p className="texte-doux">Aucun achat enregistré.</p>}
            {siennes.length > 0 && (
              <table className="tableau cliquable">
                <tbody>
                  {siennes.map((v) => (
                    <tr key={v.id} onClick={() => setVente(v.id)}>
                      <td><strong>{v.numero}</strong></td>
                      <td>{formatDateHeure(v.cree_le)}</td>
                      <td className="nombre">{montant(v.total)}</td>
                      <td><BadgePaiement vente={v} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </Modale>
  );
}

export default function Contacts({ naviguer, sousRoute }) {
  const { api, etablissement, montant, peut, notifier, moduleActif } = useEspace();
  const etab = etablissement.id;
  const [vue, setVue] = useState('tous');
  const [recherche, setRecherche] = useState('');
  // ?nouveau=1 : ouvre directement le formulaire de création.
  const [edition, setEdition] = useState(() => (peut('contacts.gerer') && lireParametres().get('nouveau') === '1' ? {} : null));
  const [fiche, setFiche] = useState(null);
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [contacts, ventes] = await Promise.all([
      api.lire('contacts', { eq: { etablissement_id: etab }, ordre: ['nom'] }),
      peut('ventes.lire') ? api.lire('ventes', { eq: { etablissement_id: etab }, ordre: ['cree_le', 'desc'] }) : [],
    ]);
    // Lien direct « contacts/<id> » : ouvre la fiche.
    const cible = sousRoute && contacts.find((c) => c.id === sousRoute);
    if (cible) setFiche(cible);
    return { contacts, ventes: ventes.filter((v) => v.contact_id) };
  }, [etab, sousRoute]);

  const soldes = {};
  for (const v of donnees?.ventes ?? []) {
    if (v.statut === 'validee') soldes[v.contact_id] = (soldes[v.contact_id] ?? 0) + v.total - v.montant_paye;
  }
  const texte = recherche.trim().toLowerCase();
  const contacts = (donnees?.contacts ?? []).filter((c) => {
    if (vue === 'clients' && !['client', 'les_deux'].includes(c.type)) return false;
    if (vue === 'prospects' && c.type !== 'prospect') return false;
    if (vue === 'fournisseurs' && !['fournisseur', 'les_deux'].includes(c.type)) return false;
    if (vue === 'credit' && !(soldes[c.id] > 0)) return false;
    return !texte || c.nom.toLowerCase().includes(texte) || (c.telephone ?? '').includes(texte);
  });
  const totalDu = Object.values(soldes).reduce((s, n) => s + n, 0);

  return (
    <div className="page">
      <EnTete titre="Contacts" sousTitre={totalDu > 0 ? `${montant(totalDu)} à encaisser auprès des clients` : 'Clients et fournisseurs de l’établissement'}>
        {contacts.length > 0 && (
          <Bouton icone="telecharger" onClick={() => exporterCsv(`contacts-${dateLocale()}.csv`, [
            { libelle: 'Nom', valeur: (c) => c.nom },
            { libelle: 'Société', valeur: (c) => c.societe ?? '' },
            { libelle: 'Type', valeur: (c) => TYPES[c.type] ?? c.type },
            { libelle: 'Téléphone', valeur: (c) => c.telephone ?? '' },
            { libelle: 'E-mail', valeur: (c) => c.email ?? '' },
            { libelle: 'Solde dû', valeur: (c) => soldes[c.id] ?? 0 },
            { libelle: 'Actif', valeur: (c) => (c.actif ? 'oui' : 'non') },
          ], contacts)}>Exporter</Bouton>
        )}
        {peut('contacts.gerer') && <Bouton variante="principal" icone="plus" onClick={() => setEdition({})}>Nouveau contact</Bouton>}
      </EnTete>
      <div className="filtres">
        <Onglets
          onglets={[['tous', 'Tous'], ['clients', 'Clients'], ...(moduleActif('crm_pipeline') ? [['prospects', 'Prospects']] : []), ['fournisseurs', 'Fournisseurs'], ['credit', 'Avec un solde dû']]}
          actif={vue}
          onChange={setVue}
        />
        <Recherche valeur={recherche} onChange={setRecherche} placeholder="Nom ou téléphone" />
      </div>
      {chargement && !donnees && <Chargement />}
      <Erreur message={erreur} />
      {donnees && !contacts.length && <Vide titre="Aucun contact" />}
      {contacts.length > 0 && (
        <div className="tableau-conteneur">
          <table className="tableau cliquable">
            <thead><tr><th>Nom</th><th>Type</th><th>Téléphone</th><th className="nombre">Solde dû</th></tr></thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} onClick={() => setFiche(c)} className={c.actif ? '' : 'inactif'}>
                  <td><strong>{c.nom}</strong>{c.societe && <small className="texte-doux bloc">{c.societe}</small>}</td>
                  <td>{TYPES[c.type]}</td>
                  <td>{c.telephone ?? '—'}</td>
                  <td className="nombre">{soldes[c.id] > 0 ? <span className="texte-alerte">{montant(soldes[c.id])}</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {fiche && (
        <FicheContact
          contact={fiche}
          ventes={donnees.ventes}
          onFermer={() => setFiche(null)}
          onModifier={() => {
            setEdition({ contact: fiche });
            setFiche(null);
          }}
          onChange={recharger}
          naviguer={naviguer}
        />
      )}
      {edition && (
        <FormulaireContact
          contact={edition.contact}
          onFermer={() => setEdition(null)}
          onEnregistre={(message) => {
            setEdition(null);
            notifier(message);
            recharger();
          }}
        />
      )}
    </div>
  );
}
