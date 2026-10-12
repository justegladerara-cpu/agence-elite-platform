import React, { useState } from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { Bouton, Champ, Erreur, Modale } from '../../ui/composants.jsx';

// Déploiement multi-établissements : reprendre le catalogue d'un autre établissement du même client (catégories,
// articles, prix, casiers). Jamais le stock ni les ventes. Toujours un aperçu avant d'écrire.
export default function CopierCatalogue({ onFermer, onFait }) {
  const { api, etablissement, etablissements } = useEspace();
  const autres = etablissements.filter((e) => e.id !== etablissement.id && (!etablissement.client_id || e.client_id === etablissement.client_id));
  const [source, setSource] = useState(autres[0]?.id ?? '');
  const [majPrix, setMajPrix] = useState(false);
  const [apercu, setApercu] = useState(null);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const lancer = async (simulation) => {
    setChargement(true);
    setErreur('');
    try {
      const r = await api.rpc('copier_catalogue', { p_source: source, p_cible: etablissement.id, p_maj_prix: majPrix, p_simulation: simulation });
      if (simulation) {
        setApercu(r);
        setChargement(false);
      } else {
        onFait(`Catalogue de « ${r.source} » copié : ${r.articles_crees} article(s), ${r.categories_creees} catégorie(s)${r.prix_mis_a_jour ? `, ${r.prix_mis_a_jour} prix mis à jour` : ''}`);
      }
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  return (
    <Modale titre="Copier le catalogue d’un autre établissement" onFermer={onFermer}>
      <div className="formulaire">
        <p className="texte-doux">
          Pour ouvrir une deuxième adresse sans tout ressaisir : catégories, articles, prix, coûts et casiers sont repris dans
          « {etablissement.nom} ». Le stock, les ventes et les fournisseurs ne sont jamais copiés. Les articles déjà présents sont gardés.
        </p>
        {!autres.length ? <p className="encart">Aucun autre établissement de ce client n’est accessible avec votre compte.</p> : (
          <>
            <Champ libelle="Copier depuis">
              <select value={source} onChange={(e) => { setSource(e.target.value); setApercu(null); }}>
                {autres.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </select>
            </Champ>
            <label className="case-a-cocher">
              <input type="checkbox" checked={majPrix} onChange={(e) => { setMajPrix(e.target.checked); setApercu(null); }} />
              <span>Mettre aussi les prix des articles déjà présents au niveau de l’autre établissement</span>
            </label>
            {apercu && (
              <p className="encart" role="status">
                Vers « {apercu.cible} » : {apercu.articles_crees} article(s) à créer, {apercu.categories_creees} catégorie(s) à créer,
                {' '}{apercu.articles_deja_presents} déjà présent(s){majPrix ? `, ${apercu.prix_mis_a_jour} prix à changer` : ''}.
              </p>
            )}
          </>
        )}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton onClick={onFermer}>Annuler</Bouton>
          {autres.length > 0 && !apercu && <Bouton variante="principal" chargement={chargement} disabled={!source} onClick={() => lancer(true)}>Voir ce qui sera copié</Bouton>}
          {apercu && <Bouton variante="principal" chargement={chargement} disabled={!apercu.articles_crees && !apercu.categories_creees && !apercu.prix_mis_a_jour} onClick={() => lancer(false)}>Copier</Bouton>}
        </div>
      </div>
    </Modale>
  );
}
