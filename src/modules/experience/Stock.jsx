import React, { useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { Bouton, Champ, Chargement, Erreur, Modale, Recherche } from '../../ui/composants.jsx';
import { ajouterJours, joursRestants, soireeDe } from './analyse.js';
import { EnteteXp, LienAncien, Segments, Tuile } from './communs.jsx';

// Stock en tuiles (nouvelle version The Dream) : combien il en reste, pour combien de soirées, et trois gestes :
// « Reçu » (livraison), « Compté » (inventaire), « Perte » (casse, périmé, offert non noté…).
const ACTIONS = {
  recu: { titre: 'Reçu', aide: 'Combien d’unités sont arrivées ?', type: 'entree' },
  compte: { titre: 'Compté', aide: 'Combien en avez-vous compté en vrai ?', type: 'inventaire' },
  perte: { titre: 'Perte', aide: 'Combien sont perdus ?', type: 'ajustement' },
};
const RAISONS = ['Cassé', 'Périmé', 'Bu par le personnel', 'Disparu', 'Autre'];

export default function Stock({ naviguer }) {
  const { api, etablissement, hubs, hub, peut, notifier, reglagesFonctions } = useEspace();
  const etab = etablissement.id;
  const hubsStock = (hub ? [hub] : hubs).filter((h) => h.capacite_stock);
  const [hubId, setHubId] = useState(hubsStock[0]?.id);
  const [filtre, setFiltre] = useState('tout');
  const [texte, setTexte] = useState('');
  const [action, setAction] = useState(null);
  const debut = Number(reglagesFonctions?.cloture?.debut_service ?? 8) || 8;
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const aujourdhui = soireeDe(new Date(), etablissement.fuseau || 'Africa/Brazzaville', debut);
    const [articles, stock, pilotage] = await Promise.all([
      api.lire('articles', { eq: { etablissement_id: etab, actif: true, suivi_stock: true }, ordre: ['nom'] }),
      api.lire('stock_hubs', { eq: { etablissement_id: etab } }),
      // Ventes des 28 dernières soirées : pour dire « encore N soirées » (gérant seulement).
      peut('cloture.cloturer') ? api.rpc('pilotage_bar', { p_etablissement_id: etab, p_du: ajouterJours(aujourdhui, -27), p_au: aujourdhui }).catch(() => null) : null,
    ]);
    const vendus = {};
    const soirees = new Set();
    (pilotage?.produits ?? []).forEach(([jour, id, qte]) => { vendus[id] = (vendus[id] ?? 0) + Number(qte); soirees.add(jour); });
    (pilotage?.heures ?? []).forEach(([jour]) => soirees.add(jour));
    return { articles, stock, vendus, soirees: soirees.size };
  }, [etab]);
  const quantites = useMemo(() => {
    const q = {};
    (donnees?.stock ?? []).filter((s) => s.hub_id === hubId).forEach((s) => { q[s.article_id] = Number(s.quantite); });
    return q;
  }, [donnees, hubId]);

  if (chargement && !donnees) return <Chargement />;
  if (erreur) return <Erreur message={erreur} />;
  const liste = donnees.articles.map((a) => {
    const q = quantites[a.id] ?? 0;
    const jours = joursRestants(q, donnees.vendus[a.id] ?? 0, donnees.soirees);
    const etat = q <= 0 ? 'vide' : (jours != null && jours < 2) || q <= Number(a.stock_minimum || 0) ? 'bas' : 'ok';
    return { ...a, q, jours, etat };
  });
  const t = texte.trim().toLowerCase();
  const visibles = liste.filter((a) => (filtre === 'tout' || a.etat === filtre || (filtre === 'bas' && a.etat === 'vide')) && (!t || a.nom.toLowerCase().includes(t)))
    .sort((a, b) => (a.jours ?? 999) - (b.jours ?? 999));
  const bas = liste.filter((a) => a.etat !== 'ok');
  const peutAjuster = peut('stock.ajuster');

  return (
    <div className="xp-page">
      <EnteteXp surtitre={etablissement.nom} titre="Stock" sousTitre="Les articles qui vont manquer d’abord. « Soirées » = combien de soirées le stock tiendra, au rythme des 4 dernières semaines.">
        {hubsStock.length > 1 && <Segments libelle="Espace" valeur={hubId} onChange={setHubId} options={hubsStock.map((h) => [h.id, h.nom])} />}
        <LienAncien page="stock" naviguer={naviguer} texte="Mouvements, réceptions, inventaire : écran complet" />
      </EnteteXp>
      <div className="xp-grille">
        <Tuile icone="stock" titre="Articles suivis" valeur={liste.length} onClick={() => setFiltre('tout')} pourquoi="Comptés à chaque vente." />
        <Tuile icone="alerte" titre="Vont manquer" valeur={bas.length} onClick={() => setFiltre('bas')}
          verdict={{ ton: bas.length ? 'mauvais' : 'bon', texte: bas.length ? 'à commander' : 'tout va bien' }}
          pourquoi={bas.length ? bas.slice(0, 3).map((a) => a.nom).join(', ') : 'Aucun article sous son minimum.'}
          conseil={bas.length ? 'Préparer la commande au dépôt' : undefined} />
      </div>
      <div style={{ maxWidth: 360 }}><Recherche valeur={texte} onChange={setTexte} placeholder="Chercher un article" /></div>
      <div className="xp-produits">
        {visibles.map((a) => {
          const part = a.jours == null ? (a.q > 0 ? 0.6 : 0) : Math.min(1, a.jours / 7);
          const couleur = a.etat === 'ok' ? 'var(--vert)' : a.etat === 'bas' ? 'var(--orange)' : 'var(--rouge)';
          return (
            <div key={a.id} className="xp-produit">
              <div className="xp-produit-corps">
                <strong>{a.nom}</strong>
                <span className="xp-produit-prix">
                  <span className="prix" style={{ fontSize: 26 }}>{a.q}</span>
                  <span className={`xp-verdict ${a.etat === 'ok' ? 'bon' : a.etat === 'bas' ? 'attention' : 'mauvais'}`}>
                    {a.q <= 0 ? 'épuisé' : a.jours == null ? 'pas vendu récemment' : a.jours < 1 ? 'moins d’une soirée' : `${Math.floor(a.jours)} soirée${a.jours >= 2 ? 's' : ''}`}
                  </span>
                </span>
                <span className="xp-jauge"><span style={{ width: `${part * 100}%`, background: couleur }} /></span>
                <small className="texte-doux">{a.unite ?? 'unité'}{Number(a.stock_minimum) > 0 ? ` · minimum ${a.stock_minimum}` : ''}</small>
                {peutAjuster && hubId && (
                  <span className="xp-stock-actions">
                    <button type="button" onClick={() => setAction({ article: a, cle: 'recu' })}>+ Reçu</button>
                    <button type="button" onClick={() => setAction({ article: a, cle: 'compte' })}>Compté</button>
                    <button type="button" onClick={() => setAction({ article: a, cle: 'perte' })}>− Perte</button>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {action && (
        <ModaleAction action={action} hubId={hubId} onFermer={() => setAction(null)}
          onFait={(texteFait) => { setAction(null); notifier(texteFait); recharger(); }} />
      )}
    </div>
  );
}

function ModaleAction({ action, hubId, onFermer, onFait }) {
  const { api } = useEspace();
  const config = ACTIONS[action.cle];
  const a = action.article;
  const [quantite, setQuantite] = useState(action.cle === 'compte' ? String(a.q) : '1');
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const pas = (n) => setQuantite((q) => String(Math.max(0, (Number(q) || 0) + n)));
  const valider = async (e) => {
    e.preventDefault();
    setErreur('');
    const n = Number(String(quantite).replace(',', '.'));
    if (!(n >= 0) || (action.cle !== 'compte' && !(n > 0))) return setErreur('Indiquez une quantité.');
    if (action.cle === 'perte' && !motif) return setErreur('Choisissez la raison de la perte.');
    setEnvoi(true);
    try {
      const nouveau = await api.rpc('ajuster_stock_hub', {
        p_hub_id: hubId, p_article_id: a.id, p_type: config.type,
        p_quantite: action.cle === 'perte' ? -n : n,
        p_motif: action.cle === 'perte' ? motif : action.cle === 'recu' ? 'Livraison reçue' : 'Comptage',
        p_cout_unitaire: null,
      });
      onFait(`${a.nom} : ${nouveau} en stock`);
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  };
  return (
    <Modale titre={`${config.titre} · ${a.nom}`} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <p className="texte-doux">En stock maintenant : <strong>{a.q}</strong></p>
        <Champ libelle={config.aide}>
          <div className="xp-pm">
            <button type="button" onClick={() => pas(-1)} aria-label="Moins">−</button>
            <input className="xp-gros-champ" style={{ textAlign: 'center' }} inputMode="decimal" value={quantite} onChange={(e) => setQuantite(e.target.value)} autoFocus />
            <button type="button" onClick={() => pas(1)} aria-label="Plus">+</button>
          </div>
        </Champ>
        {action.cle === 'recu' && (
          <div className="puces">{[6, 12, 24].map((n) => <button key={n} type="button" onClick={() => setQuantite(String(n))}>{n} (casier)</button>)}</div>
        )}
        {action.cle === 'perte' && (
          <div className="puces" role="group" aria-label="Raison">
            {RAISONS.map((r) => <button key={r} type="button" className={motif === r ? 'actif' : ''} onClick={() => setMotif(r)}>{r}</button>)}
          </div>
        )}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={envoi}>Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}
