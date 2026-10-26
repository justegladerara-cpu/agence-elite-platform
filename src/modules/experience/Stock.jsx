import React, { lazy, Suspense, useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatQuantite } from '../../noyau/format.js';
import { Bouton, Champ, Chargement, Erreur, Modale, Recherche, Squelette } from '../../ui/composants.jsx';
import { ajouterJours, joursRestants, soireeDe } from './analyse.js';
import { EnteteXp, Panneau, Segments, Tuile } from './communs.jsx';

// Stock (nouvelle version The Dream) : une seule page, rangée par catégorie. Ce qui manque d'abord, puis ce qui va
// manquer, puis le reste. « Soirées » = combien de temps le stock tient au rythme des 4 dernières semaines. Un
// toucher sur un article ouvre son détail et ses gestes. Les mouvements, réceptions et inventaires sont ici aussi.
const AncienStock = lazy(() => import('../stock/Stock.jsx'));

const ACTIONS = {
  recu: { titre: 'Reçu', aide: 'Combien d’unités sont arrivées ?', type: 'entree' },
  compte: { titre: 'Compté', aide: 'Combien en avez-vous compté en vrai ?', type: 'inventaire' },
  perte: { titre: 'Perte', aide: 'Combien sont perdus ?', type: 'ajustement' },
};
const RAISONS = ['Cassé', 'Périmé', 'Bu par le personnel', 'Disparu', 'Autre'];
const RANG = { vide: 0, bas: 1, ok: 2 };

export default function Stock({ naviguer }) {
  const { api, etablissement, hubs, hub, peut, notifier, reglagesFonctions } = useEspace();
  const etab = etablissement.id;
  const hubsStock = (hub ? [hub] : hubs).filter((h) => h.capacite_stock);
  const [hubId, setHubId] = useState(hubsStock[0]?.id);
  const [filtre, setFiltre] = useState('tout');
  const [texte, setTexte] = useState('');
  const [action, setAction] = useState(null);
  const [detail, setDetail] = useState(null);
  const [mouvements, setMouvements] = useState(false);
  const debut = Number(reglagesFonctions?.cloture?.debut_service ?? 8) || 8;
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const aujourdhui = soireeDe(new Date(), etablissement.fuseau || 'Africa/Brazzaville', debut);
    const [articles, categories, stock, pilotage] = await Promise.all([
      api.lire('articles', { eq: { etablissement_id: etab, actif: true, suivi_stock: true }, ordre: ['nom'] }),
      api.lire('categories_articles', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }).catch(() => []),
      api.lire('stock_hubs', { eq: { etablissement_id: etab } }),
      peut('cloture.cloturer') ? api.rpc('pilotage_bar', { p_etablissement_id: etab, p_du: ajouterJours(aujourdhui, -27), p_au: aujourdhui }).catch(() => null) : null,
    ]);
    const vendus = {};
    const soirees = new Set();
    (pilotage?.produits ?? []).forEach(([jour, id, qte]) => { vendus[id] = (vendus[id] ?? 0) + Number(qte); soirees.add(jour); });
    (pilotage?.heures ?? []).forEach(([jour]) => soirees.add(jour));
    return { articles, categories, stock, vendus, soirees: soirees.size };
  }, [etab]);
  const quantites = useMemo(() => {
    const q = {};
    (donnees?.stock ?? []).filter((s) => s.hub_id === hubId).forEach((s) => { q[s.article_id] = Number(s.quantite); });
    return q;
  }, [donnees, hubId]);

  if (chargement && !donnees) return <Chargement />;
  if (erreur) return <Erreur message={erreur} />;
  const nomCategorie = Object.fromEntries((donnees.categories ?? []).map((c) => [c.id, c.nom]));
  const liste = donnees.articles.map((a) => {
    const q = quantites[a.id] ?? 0;
    const jours = joursRestants(q, donnees.vendus[a.id] ?? 0, donnees.soirees);
    const etat = q <= 0 ? 'vide' : (jours != null && jours < 2) || q <= Number(a.stock_minimum || 0) ? 'bas' : 'ok';
    return { ...a, q, jours, etat, categorie: nomCategorie[a.categorie_id] ?? 'Sans catégorie' };
  });
  const t = texte.trim().toLowerCase();
  const visibles = liste.filter((a) => (filtre === 'tout' || a.etat === filtre || (filtre === 'bas' && a.etat === 'vide')) && (!t || a.nom.toLowerCase().includes(t)));
  const bas = liste.filter((a) => a.etat !== 'ok');
  const peutAjuster = peut('stock.ajuster');

  // Groupé par catégorie ; dans chaque catégorie, ce qui manque d'abord ; les catégories les plus en tension en premier.
  const groupes = {};
  visibles.forEach((a) => { (groupes[a.categorie] ??= []).push(a); });
  const categoriesTriees = Object.entries(groupes)
    .map(([nom, items]) => ({
      nom,
      items: items.sort((a, b) => RANG[a.etat] - RANG[b.etat] || (a.jours ?? 999) - (b.jours ?? 999) || a.nom.localeCompare(b.nom, 'fr')),
      tension: items.filter((a) => a.etat !== 'ok').length,
    }))
    .sort((a, b) => b.tension - a.tension || a.nom.localeCompare(b.nom, 'fr'));

  return (
    <div className="xp-page">
      <EnteteXp surtitre={etablissement.nom} titre="Stock"
        sousTitre="Rangé par catégorie, ce qui manque d’abord. « Soirées » = combien de soirées le stock tiendra. Touchez un article pour son détail et ses gestes.">
        {hubsStock.length > 1 && <Segments libelle="Espace" valeur={hubId} onChange={setHubId} options={hubsStock.map((h) => [h.id, h.nom])} />}
      </EnteteXp>
      <div className="xp-grille">
        <Tuile icone="inventaire" titre="Articles suivis" valeur={liste.length} onClick={() => setFiltre('tout')} pourquoi="Comptés à chaque vente." />
        <Tuile icone="alerte" titre="Vont manquer" valeur={bas.length} onClick={() => setFiltre(filtre === 'bas' ? 'tout' : 'bas')}
          verdict={{ ton: bas.length ? 'mauvais' : 'bon', texte: bas.length ? 'à commander' : 'tout va bien' }}
          pourquoi={bas.length ? bas.slice(0, 3).map((a) => a.nom).join(', ') : 'Aucun article sous son minimum.'}
          conseil={bas.length ? 'Préparer la commande au dépôt' : undefined} />
      </div>
      <div className="xp-entete" style={{ alignItems: 'center' }}>
        <Segments libelle="Filtre" valeur={filtre} onChange={setFiltre} options={[['tout', 'Tout'], ['bas', 'À commander'], ['ok', 'Bien fournis']]} />
        <div style={{ minWidth: 220, flex: '0 1 320px' }}><Recherche valeur={texte} onChange={setTexte} placeholder="Chercher un article" /></div>
      </div>

      {categoriesTriees.map((cat) => (
        <section key={cat.nom} className="xp-section">
          <h2 className="xp-section-titre">{cat.nom} <small>{cat.tension ? `${cat.tension} à surveiller` : `${cat.items.length} article${cat.items.length > 1 ? 's' : ''}`}</small></h2>
          <div className="xp-produits">
            {cat.items.map((a) => {
              const part = a.jours == null ? (a.q > 0 ? 0.6 : 0) : Math.min(1, a.jours / 7);
              const couleur = a.etat === 'ok' ? 'var(--vert)' : a.etat === 'bas' ? 'var(--orange)' : 'var(--rouge)';
              return (
                <button type="button" key={a.id} className="xp-produit xp-produit-cliquable" onClick={() => setDetail(a)}>
                  <div className="xp-produit-corps">
                    <strong>{a.nom}</strong>
                    <span className="xp-produit-prix">
                      <span className="prix" style={{ fontSize: 26 }}>{formatQuantite(a.q, a.unite)}</span>
                      <span className={`xp-verdict ${a.etat === 'ok' ? 'bon' : a.etat === 'bas' ? 'vigilance' : 'mauvais'}`}>
                        {a.q <= 0 ? 'épuisé' : a.jours == null ? 'pas vendu récemment' : a.jours < 1 ? 'moins d’une soirée' : `${Math.floor(a.jours)} soirée${a.jours >= 2 ? 's' : ''}`}
                      </span>
                    </span>
                    <span className="xp-jauge"><span style={{ width: `${part * 100}%`, background: couleur }} /></span>
                    <small className="texte-doux">{Number(a.stock_minimum) > 0 ? `Minimum : ${a.stock_minimum} ${a.unite && a.unite !== 'unité' ? a.unite : ''}`.trim() : 'Pas de minimum'} · touchez pour le détail</small>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {!visibles.length && <p className="texte-doux">Aucun article ne correspond.</p>}

      <section className="xp-section">
        <h2 className="xp-section-titre">
          Mouvements, réceptions et inventaires
          <button type="button" className="lien" onClick={() => setMouvements((x) => !x)}>{mouvements ? 'Masquer' : 'Afficher'}</button>
        </h2>
        {mouvements && (
          <Suspense fallback={<Squelette lignes={6} />}>
            <AncienStock naviguer={naviguer} integre />
          </Suspense>
        )}
      </section>

      {detail && (
        <Panneau titre={detail.nom} onFermer={() => setDetail(null)}>
          <div className="xp-grille etroite">
            <Tuile icone="inventaire" titre="En stock" valeur={formatQuantite(detail.q, detail.unite)}
              verdict={{ ton: detail.etat === 'ok' ? 'bon' : detail.etat === 'bas' ? 'vigilance' : 'mauvais', texte: detail.etat === 'vide' ? 'épuisé' : detail.etat === 'bas' ? 'bas' : 'correct' }} />
            <Tuile icone="horloge" titre="Tient encore" valeur={detail.jours == null ? '—' : detail.jours < 1 ? '< 1 soirée' : `${Math.floor(detail.jours)} soirée${detail.jours >= 2 ? 's' : ''}`} />
            <Tuile icone="graphique" titre="Vendu (4 semaines)" valeur={donnees.vendus[detail.id] ? formatQuantite(Math.round(donnees.vendus[detail.id]), detail.unite) : '—'} />
          </div>
          <p className="texte-doux">{Number(detail.stock_minimum) > 0 ? `On recommande de garder au moins ${detail.stock_minimum} ${detail.unite && detail.unite !== 'unité' ? detail.unite : ''}.`.trim() : 'Aucun minimum réglé pour cet article.'}</p>
          {peutAjuster && hubId ? (
            <div className="xp-stock-actions">
              <button type="button" onClick={() => setAction({ article: detail, cle: 'recu' })}>+ Reçu</button>
              <button type="button" onClick={() => setAction({ article: detail, cle: 'compte' })}>Compté</button>
              <button type="button" onClick={() => setAction({ article: detail, cle: 'perte' })}>− Perte</button>
            </div>
          ) : <p className="texte-faible">Vous pouvez regarder le stock. Seul un responsable peut le corriger.</p>}
        </Panneau>
      )}
      {action && (
        <ModaleAction action={action} hubId={hubId} onFermer={() => setAction(null)}
          onFait={(texteFait) => { setAction(null); setDetail(null); notifier(texteFait); recharger(); }} />
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
    return undefined;
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
