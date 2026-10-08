import { useState } from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { Bouton, Champ, Erreur, Modale } from '../../ui/composants.jsx';
import { SOURCES, ajouterJours, aujourdhui, nuits } from './commun.js';

// Nouvelle réservation ou modification (tant que le client n'est pas arrivé).
export function ModaleReservation({ reservation, types, chambres, contacts, initial, onFermer, onFait }) {
  const { api, etablissement, montant } = useEspace();
  const [v, setV] = useState(() => ({
    contact_id: '', nom_client: '', telephone: '', type_id: types[0]?.id ?? '', chambre_id: '', arrivee: aujourdhui(),
    depart: ajouterJours(aujourdhui(), 1), adultes: '1', enfants: '0', tarif_nuit: '', source: 'direct', note: '',
    ...(initial ?? {}),
    ...(reservation ? Object.fromEntries(Object.entries(reservation).map(([k, x]) => [k, x == null ? '' : String(x)])) : {}),
  }));
  const [erreur, setErreur] = useState('');
  const changer = (c) => (e) => setV((x) => ({ ...x, [c]: e.target.value, ...(c === 'type_id' ? { chambre_id: '', tarif_nuit: '' } : {}) }));
  const type = types.find((t) => t.id === v.type_id);
  const tarif = v.tarif_nuit === '' ? Number(type?.tarif_nuit ?? 0) : Number(v.tarif_nuit);
  const n = nuits(v.arrivee, v.depart);
  const valider = async (e) => {
    e.preventDefault();
    try {
      const champs = ['contact_id', 'nom_client', 'telephone', 'type_id', 'chambre_id', 'arrivee', 'depart', 'adultes', 'enfants', 'tarif_nuit', 'source', 'note'];
      const id = await api.rpc('enregistrer_reservation_hotel', {
        p_etablissement_id: etablissement.id, p: { id: reservation?.id, ...Object.fromEntries(champs.map((k) => [k, v[k]])) },
      });
      onFait(id);
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={reservation ? `Modifier ${reservation.numero}` : 'Nouvelle réservation'} onFermer={onFermer} large>
      <form className="formulaire" onSubmit={valider}>
        <div className="grille-champs">
          <Champ libelle="Client enregistré">
            <select value={v.contact_id} onChange={changer('contact_id')}>
              <option value="">— Client de passage</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.societe ? `${c.societe} (${c.nom})` : c.nom}</option>)}
            </select>
          </Champ>
          <Champ libelle="Nom du client" aide={v.contact_id ? 'Vide : celui de la fiche.' : 'Obligatoire.'}>
            <input value={v.nom_client} onChange={changer('nom_client')} maxLength={160} required={!v.contact_id} autoFocus />
          </Champ>
          <Champ libelle="Téléphone"><input type="tel" value={v.telephone} onChange={changer('telephone')} maxLength={40} /></Champ>
          <Champ libelle="Origine">
            <select value={v.source} onChange={changer('source')}>{Object.entries(SOURCES).map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
          </Champ>
          <Champ libelle="Arrivée"><input type="date" value={v.arrivee} onChange={changer('arrivee')} required /></Champ>
          <Champ libelle="Départ"><input type="date" value={v.depart} min={ajouterJours(v.arrivee, 1)} onChange={changer('depart')} required /></Champ>
          <Champ libelle="Type de chambre">
            <select value={v.type_id} onChange={changer('type_id')} required>
              {types.map((t) => <option key={t.id} value={t.id}>{t.nom} · {montant(t.tarif_nuit)} / nuit · {t.capacite} pers.</option>)}
            </select>
          </Champ>
          <Champ libelle="Chambre" aide="Facultatif : attribuée au plus tard à l’arrivée.">
            <select value={v.chambre_id} onChange={changer('chambre_id')}>
              <option value="">— À attribuer</option>
              {chambres.filter((c) => c.type_id === v.type_id && c.actif).map((c) => <option key={c.id} value={c.id}>{c.numero}</option>)}
            </select>
          </Champ>
          <Champ libelle="Adultes"><input type="number" min="1" max="20" value={v.adultes} onChange={changer('adultes')} /></Champ>
          <Champ libelle="Enfants"><input type="number" min="0" max="20" value={v.enfants} onChange={changer('enfants')} /></Champ>
          <Champ libelle="Tarif de la nuit" aide="Vide : tarif du type de chambre.">
            <input type="number" min="0" step="any" value={v.tarif_nuit} placeholder={String(type?.tarif_nuit ?? '')} onChange={changer('tarif_nuit')} />
          </Champ>
        </div>
        <Champ libelle="Note"><textarea rows={2} value={v.note} onChange={changer('note')} maxLength={1000} placeholder="Heure d’arrivée, demande particulière…" /></Champ>
        <p className="encart">{n} nuit(s) · {montant(n * tarif)} d’hébergement</p>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

export function ModalePrestation({ articles, onFermer, onValider }) {
  const { montant } = useEspace();
  const [v, setV] = useState({ article_id: '', libelle: '', quantite: '1', prix_unitaire: '' });
  const [erreur, setErreur] = useState('');
  const article = articles.find((a) => a.id === v.article_id);
  const valider = async (e) => {
    e.preventDefault();
    try {
      await onValider(v);
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre="Ajouter une prestation" onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <Champ libelle="Article (minibar, restaurant, blanchisserie…)">
          <select value={v.article_id} onChange={(e) => setV({ ...v, article_id: e.target.value })}>
            <option value="">— Prestation libre</option>
            {articles.map((a) => <option key={a.id} value={a.id}>{a.nom} · {montant(a.prix_vente)}</option>)}
          </select>
        </Champ>
        <div className="grille-champs">
          <Champ libelle="Libellé"><input value={v.libelle} placeholder={article?.nom ?? 'Ex. Transfert aéroport'} required={!article} onChange={(e) => setV({ ...v, libelle: e.target.value })} maxLength={200} /></Champ>
          <Champ libelle="Quantité"><input type="number" min="0" step="any" value={v.quantite} onChange={(e) => setV({ ...v, quantite: e.target.value })} required /></Champ>
          <Champ libelle="Prix unitaire"><input type="number" min="0" step="any" value={v.prix_unitaire} placeholder={article ? String(article.prix_vente) : ''} required={!article} onChange={(e) => setV({ ...v, prix_unitaire: e.target.value })} /></Champ>
        </div>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Ajouter</Bouton>
        </div>
      </form>
    </Modale>
  );
}
