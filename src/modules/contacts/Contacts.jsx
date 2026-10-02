import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDateHeure } from '../../noyau/format.js';
import { Badge, Bouton, Champ, Chargement, EnTete, Erreur, Modale, Onglets, Recherche, Vide } from '../../ui/composants.jsx';
import { BadgePaiement, DetailVente } from '../ventes/Ventes.jsx';

const TYPES = { client: 'Client', fournisseur: 'Fournisseur', les_deux: 'Client et fournisseur' };

function FormulaireContact({ contact, onFermer, onEnregistre }) {
  const { api, etablissement } = useEspace();
  const [valeurs, setValeurs] = useState({
    type: 'client', nom: '', societe: '', identifiant_fiscal: '', telephone: '', email: '', adresse: '', notes: '', actif: true,
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
      await api.rpc('enregistrer_contact', { p_etablissement_id: etablissement.id, p_contact: { ...valeurs, id: contact?.id } });
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
            {Object.entries(TYPES).map(([id, libelle]) => <option key={id} value={id}>{libelle}</option>)}
          </select>
        </Champ>
        <Champ libelle="Nom ou raison sociale"><input value={valeurs.nom} onChange={changer('nom')} required autoFocus /></Champ>
        <div className="grille-champs">
          <Champ libelle="Téléphone"><input type="tel" value={valeurs.telephone} onChange={changer('telephone')} /></Champ>
          <Champ libelle="E-mail"><input type="email" value={valeurs.email} onChange={changer('email')} /></Champ>
        </div>
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

function FicheContact({ contact, ventes, onFermer, onModifier, onChange }) {
  const { montant, peut } = useEspace();
  const [vente, setVente] = useState(null);
  const siennes = ventes.filter((v) => v.contact_id === contact.id);
  const du = siennes.filter((v) => v.statut === 'validee').reduce((s, v) => s + v.total - v.montant_paye, 0);
  if (vente) return <DetailVente venteId={vente} onFermer={() => setVente(null)} onChange={onChange} />;
  return (
    <Modale
      titre={contact.nom}
      onFermer={onFermer}
      large
      pied={peut('contacts.gerer') && <Bouton onClick={onModifier}>Modifier</Bouton>}
    >
      <div className="fiche">
        <div className="fiche-infos">
          <Badge>{TYPES[contact.type]}</Badge>
          {contact.telephone && <span>{contact.telephone}</span>}
          {contact.email && <span>{contact.email}</span>}
          {contact.adresse && <span>{contact.adresse}</span>}
        </div>
        {contact.notes && <p className="texte-doux">{contact.notes}</p>}
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

export default function Contacts() {
  const { api, etablissement, montant, peut, notifier } = useEspace();
  const etab = etablissement.id;
  const [vue, setVue] = useState('tous');
  const [recherche, setRecherche] = useState('');
  const [edition, setEdition] = useState(null);
  const [fiche, setFiche] = useState(null);
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [contacts, ventes] = await Promise.all([
      api.lire('contacts', { eq: { etablissement_id: etab }, ordre: ['nom'] }),
      peut('ventes.lire') ? api.lire('ventes', { eq: { etablissement_id: etab }, ordre: ['cree_le', 'desc'] }) : [],
    ]);
    return { contacts, ventes: ventes.filter((v) => v.contact_id) };
  }, [etab]);

  const soldes = {};
  for (const v of donnees?.ventes ?? []) {
    if (v.statut === 'validee') soldes[v.contact_id] = (soldes[v.contact_id] ?? 0) + v.total - v.montant_paye;
  }
  const texte = recherche.trim().toLowerCase();
  const contacts = (donnees?.contacts ?? []).filter((c) => {
    if (vue === 'clients' && c.type === 'fournisseur') return false;
    if (vue === 'fournisseurs' && c.type === 'client') return false;
    if (vue === 'credit' && !(soldes[c.id] > 0)) return false;
    return !texte || c.nom.toLowerCase().includes(texte) || (c.telephone ?? '').includes(texte);
  });
  const totalDu = Object.values(soldes).reduce((s, n) => s + n, 0);

  return (
    <div className="page">
      <EnTete titre="Contacts" sousTitre={totalDu > 0 ? `${montant(totalDu)} à encaisser auprès des clients` : 'Clients et fournisseurs de l’établissement'}>
        {peut('contacts.gerer') && <Bouton variante="principal" icone="plus" onClick={() => setEdition({})}>Nouveau contact</Bouton>}
      </EnTete>
      <div className="filtres">
        <Onglets onglets={[['tous', 'Tous'], ['clients', 'Clients'], ['fournisseurs', 'Fournisseurs'], ['credit', 'Avec un solde dû']]} actif={vue} onChange={setVue} />
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
                  <td><strong>{c.nom}</strong></td>
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
