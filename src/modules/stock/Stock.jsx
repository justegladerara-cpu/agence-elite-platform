import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDateHeure, formatQuantite } from '../../noyau/format.js';
import { Badge, Bouton, Champ, Chargement, EnTete, Erreur, Modale, Onglets, Recherche, Vide } from '../../ui/composants.jsx';

const TYPES = {
  entree: ['Entrée', 'vert'],
  sortie_vente: ['Vente', 'neutre'],
  retour_annulation: ['Retour (annulation)', 'orange'],
  ajustement: ['Ajustement', 'orange'],
  inventaire: ['Inventaire', 'bleu'],
};

const ACTIONS = {
  entree: { titre: 'Entrée de stock', libelle: 'Quantité reçue', aide: 'Réception fournisseur, retour…' },
  ajustement: { titre: 'Ajustement', libelle: 'Quantité à ajouter (ou retirer avec un signe −)', aide: 'Casse, perte, erreur… Le motif est obligatoire.' },
  inventaire: { titre: 'Inventaire', libelle: 'Quantité comptée en rayon', aide: 'L’écart avec le stock théorique est enregistré.' },
};

function ModaleMouvement({ article, type, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [quantite, setQuantite] = useState('');
  const [motif, setMotif] = useState('');
  const [cout, setCout] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const config = ACTIONS[type];
  const valider = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      const nouveau = await api.rpc('ajuster_stock', {
        p_etablissement_id: etablissement.id,
        p_article_id: article.article_id,
        p_type: type,
        p_quantite: Number(quantite),
        p_motif: motif || null,
        p_cout_unitaire: cout === '' ? null : Number(cout),
      });
      onFait(`${article.nom} : ${formatQuantite(nouveau, article.unite)} en stock`);
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  return (
    <Modale titre={`${config.titre} · ${article.nom}`} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <p className="texte-doux">Stock actuel : <strong>{formatQuantite(article.quantite, article.unite)}</strong></p>
        <Champ libelle={config.libelle} aide={config.aide}>
          <input type="number" step="any" inputMode="decimal" value={quantite} onChange={(e) => setQuantite(e.target.value)} required autoFocus />
        </Champ>
        {type === 'entree' && (
          <Champ libelle="Coût unitaire d’achat (facultatif)"><input type="number" min="0" step="any" value={cout} onChange={(e) => setCout(e.target.value)} /></Champ>
        )}
        <Champ libelle={type === 'ajustement' ? 'Motif' : 'Motif (facultatif)'}>
          <input value={motif} onChange={(e) => setMotif(e.target.value)} required={type === 'ajustement'} />
        </Champ>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={chargement}>Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

export default function Stock() {
  const { api, etablissement, peut, notifier } = useEspace();
  const etab = etablissement.id;
  const [vue, setVue] = useState('niveaux');
  const [recherche, setRecherche] = useState('');
  const [action, setAction] = useState(null);
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [tous, mouvements] = await Promise.all([
      api.lire('stock_articles', { eq: { etablissement_id: etab }, ordre: ['nom'] }),
      api.lire('mouvements_stock', { eq: { etablissement_id: etab }, ordre: ['id', 'desc'], limite: 300 }),
    ]);
    return { tous, niveaux: tous.filter((a) => a.suivi_stock && a.actif), mouvements };
  }, [etab]);

  const texte = recherche.trim().toLowerCase();
  const niveaux = (donnees?.niveaux ?? []).filter((n) => !texte || n.nom.toLowerCase().includes(texte) || (n.reference ?? '').toLowerCase().includes(texte));
  const noms = Object.fromEntries((donnees?.tous ?? []).map((n) => [n.article_id, n]));
  const bas = niveaux.filter((n) => n.quantite <= n.stock_minimum).length;

  return (
    <div className="page">
      <EnTete titre="Stock" sousTitre={bas ? `${bas} article(s) à réapprovisionner` : 'Tous les niveaux sont corrects'} />
      <div className="filtres">
        <Onglets onglets={[['niveaux', 'Niveaux'], ['mouvements', 'Mouvements']]} actif={vue} onChange={setVue} />
        {vue === 'niveaux' && <Recherche valeur={recherche} onChange={setRecherche} placeholder="Article" />}
      </div>
      {chargement && !donnees && <Chargement />}
      <Erreur message={erreur} />
      {donnees && vue === 'niveaux' && (niveaux.length ? (
        <div className="tableau-conteneur">
          <table className="tableau">
            <thead><tr><th>Article</th><th className="nombre">En stock</th><th className="nombre">Alerte</th><th>État</th>{peut('stock.ajuster') && <th />}</tr></thead>
            <tbody>
              {niveaux.map((n) => (
                <tr key={n.article_id}>
                  <td><strong>{n.nom}</strong>{n.reference && <small className="texte-doux bloc">{n.reference}</small>}</td>
                  <td className="nombre"><strong>{formatQuantite(n.quantite, n.unite)}</strong></td>
                  <td className="nombre">{formatQuantite(n.stock_minimum)}</td>
                  <td>{n.quantite <= 0 ? <Badge ton="rouge">Épuisé</Badge> : n.quantite <= n.stock_minimum ? <Badge ton="orange">Bas</Badge> : <Badge ton="vert">OK</Badge>}</td>
                  {peut('stock.ajuster') && (
                    <td className="actions-ligne">
                      <Bouton onClick={() => setAction({ type: 'entree', article: n })}>Entrée</Bouton>
                      <Bouton onClick={() => setAction({ type: 'ajustement', article: n })}>Ajuster</Bouton>
                      <Bouton onClick={() => setAction({ type: 'inventaire', article: n })}>Inventaire</Bouton>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Vide titre="Aucun article suivi en stock" />)}
      {donnees && vue === 'mouvements' && (donnees.mouvements.length ? (
        <div className="tableau-conteneur">
          <table className="tableau">
            <thead><tr><th>Date</th><th>Article</th><th>Type</th><th className="nombre">Quantité</th><th>Motif</th></tr></thead>
            <tbody>
              {donnees.mouvements.map((m) => (
                <tr key={m.id}>
                  <td>{formatDateHeure(m.cree_le)}</td>
                  <td>{noms[m.article_id]?.nom ?? '—'}</td>
                  <td><Badge ton={TYPES[m.type][1]}>{TYPES[m.type][0]}</Badge></td>
                  <td className={`nombre ${m.quantite < 0 ? 'texte-alerte' : 'texte-vert'}`}>{m.quantite > 0 ? '+' : ''}{formatQuantite(m.quantite)}</td>
                  <td>{m.motif ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Vide titre="Aucun mouvement" />)}
      {action && (
        <ModaleMouvement
          article={action.article}
          type={action.type}
          onFermer={() => setAction(null)}
          onFait={(message) => {
            setAction(null);
            notifier(message);
            recharger();
          }}
        />
      )}
    </div>
  );
}
