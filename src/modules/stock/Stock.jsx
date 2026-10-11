import React, { useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { lireParametres } from '../../noyau/routes.js';
import { formatDateHeure, formatQuantite } from '../../noyau/format.js';
import { Badge, Bouton, Champ, DataTable, EmptyState, Erreur, Modale, PageHeader, Squelette, Tabs } from '../../ui/composants.jsx';
import SaisieStock from './SaisieStock.jsx';
import Peremptions from './Peremptions.jsx';
import { formatEnCasiers, quantiteHub } from './quantites.js';
import { lireVueStock, RAISONS_RETRAIT, valeurPerte } from './pertes.js';
import './stock.css';

export { quantiteHub };

export const TYPES_MOUVEMENT = {
  entree: ['Entrée', 'vert'],
  sortie_vente: ['Vente', 'neutre'],
  retour_annulation: ['Retour (annulation)', 'orange'],
  ajustement: ['Ajustement', 'orange'],
  inventaire: ['Inventaire', 'bleu'],
  transfert_sortie: ['Transfert (envoi)', 'bleu'],
  transfert_entree: ['Transfert (réception)', 'bleu'],
  transfert_annulation: ['Transfert annulé', 'orange'],
  retour_partiel: ['Retour client', 'orange'],
  production_sortie: ['Fabrication (composant)', 'bleu'],
  production_entree: ['Fabrication (produit fini)', 'vert'],
};

const ACTIONS = {
  retrait: { titre: 'Retirer du stock', libelle: 'Quantité retirée', aide: 'Casse, perte, produit périmé, consommation… La raison est obligatoire.' },
};

// « J'ai perdu / cassé / périmé » : on choisit d'abord l'article, puis la fenêtre « Retirer du stock » s'ouvre.
function ChoixPerte({ articles, quantiteDe, onChoisir, onFermer }) {
  const [texte, setTexte] = useState('');
  const t = texte.trim().toLowerCase();
  const visibles = articles.filter((a) => !t || a.nom.toLowerCase().includes(t) || (a.reference ?? '').toLowerCase().includes(t) || (a.code_barres ?? '') === texte.trim()).slice(0, 60);
  return (
    <Modale titre="J’ai perdu / cassé / périmé" onFermer={onFermer}>
      <div className="formulaire">
        <Champ libelle="Quel article ?" aide="Tapez le nom, la référence ou scannez le code-barres.">
          <input type="search" value={texte} onChange={(e) => setTexte(e.target.value)} autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter' && visibles.length === 1) { e.preventDefault(); onChoisir(visibles[0]); } }} />
        </Champ>
        <div className="choix-perte-liste" role="list">
          {visibles.map((a) => (
            <button key={a.id} type="button" role="listitem" onClick={() => onChoisir(a)}>
              <strong>{a.nom}</strong><span className="texte-doux">{formatEnCasiers(quantiteDe(a.id), a)} en stock</span>
            </button>
          ))}
        </div>
        {!visibles.length && <p className="texte-doux">Aucun article suivi en stock ne correspond.</p>}
      </div>
    </Modale>
  );
}

// Stock par Hub, calculé à partir des mouvements (vue stock_hubs, filtrée par la base selon les Hubs autorisés).
export function useStockHubs() {
  const { api, etablissement } = useEspace();
  const etab = etablissement.id;
  return useDonnees(async () => {
    const [articles, lignes] = await Promise.all([
      api.lire('articles', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }),
      api.lire('stock_hubs', { eq: { etablissement_id: etab } }),
    ]);
    const parArticle = {};
    for (const l of lignes) (parArticle[l.article_id] ??= {})[l.hub_id] = Number(l.quantite);
    return { articles, suivis: articles.filter((a) => a.suivi_stock), parArticle };
  }, [etab]);
}

function ModaleMouvement({ article, type, hubInitial, hubsStock, quantiteDe, onFermer, onFait }) {
  const { api, montant } = useEspace();
  const [hubId, setHubId] = useState(hubInitial ?? hubsStock[0]?.id);
  const [quantite, setQuantite] = useState('');
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const config = ACTIONS[type];
  const valider = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      const n = Number(String(quantite).replace(',', '.'));
      if (!(n > 0)) throw new Error('Indiquez une quantité supérieure à 0');
      const nouveau = await api.rpc('ajuster_stock_hub', {
        p_hub_id: hubId, p_article_id: article.id, p_type: 'ajustement', p_quantite: -n, p_motif: motif || null, p_cout_unitaire: null,
      });
      const perte = valeurPerte(n, article.cout_achat);
      onFait(`${article.nom} : ${formatQuantite(nouveau, article.unite)} en stock${hubsStock.length > 1 ? ` (${hubsStock.find((h) => h.id === hubId)?.nom})` : ''}${perte != null ? ` · perte de ${montant(perte)} au prix d’achat` : ''}`);
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  return (
    <Modale titre={`${config.titre} · ${article.nom}`} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        {hubsStock.length > 1 && (
          <Champ libelle="Hub">
            <select value={hubId} onChange={(e) => setHubId(e.target.value)}>
              {hubsStock.map((h) => <option key={h.id} value={h.id}>{h.nom}</option>)}
            </select>
          </Champ>
        )}
        <p className="texte-doux">Stock actuel : <strong>{formatEnCasiers(quantiteDe(hubId), article)}</strong></p>
        <Champ libelle={config.libelle} aide={config.aide}>
          <input inputMode="decimal" value={quantite} onChange={(e) => setQuantite(e.target.value)} required autoFocus />
        </Champ>
        <div className="puces puces-retour" role="group" aria-label="Raisons en un clic">
          {RAISONS_RETRAIT.map((r) => <button key={r} type="button" className={motif === r ? 'actif' : ''} onClick={() => setMotif(r)}>{r}</button>)}
        </div>
        <Champ libelle="Raison">
          <input value={motif} onChange={(e) => setMotif(e.target.value)} required placeholder="Ex. : cassé, périmé" />
        </Champ>
        {valeurPerte(String(quantite).replace(',', '.'), article.cout_achat) != null && (
          <p className="texte-doux">Valeur perdue au prix d’achat : <strong>{montant(valeurPerte(String(quantite).replace(',', '.'), article.cout_achat))}</strong></p>
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

function Inventaires({ hubsParId }) {
  const { api, etablissement, hub } = useEspace();
  const { donnees, chargement, erreur } = useDonnees(async () => {
    const [inventaires, lignes] = await Promise.all([
      api.lire('inventaires', { eq: { etablissement_id: etablissement.id, ...(hub ? { hub_id: hub.id } : {}) }, ordre: ['cree_le', 'desc'], limite: 100 }),
      api.lire('lignes_inventaire', { eq: { etablissement_id: etablissement.id } }),
    ]);
    return inventaires.map((i) => {
      const l = lignes.filter((x) => x.inventaire_id === i.id);
      return { ...i, articles: l.length, ecarts: l.filter((x) => Number(x.ecart) !== 0).length, lignes: l };
    });
  }, [etablissement.id, hub?.id]);
  const [ouvert, setOuvert] = useState(null);
  if (chargement && !donnees) return <Squelette />;
  return (
    <>
      <Erreur message={erreur} />
      <DataTable
        lignes={donnees}
        onLigne={setOuvert}
        vide={<EmptyState icone="inventaire" titre="Aucun inventaire" texte="Un inventaire compare le stock compté au stock calculé, Hub par Hub." />}
        colonnes={[
          { id: 'numero', libelle: 'Numéro', rendu: (i) => <strong>{i.numero}</strong> },
          { id: 'cree_le', libelle: 'Date', rendu: (i) => formatDateHeure(i.cree_le) },
          { id: 'hub', libelle: 'Hub', rendu: (i) => hubsParId[i.hub_id]?.nom ?? '—' },
          { id: 'articles', libelle: 'Articles', classe: 'nombre' },
          { id: 'ecarts', libelle: 'Écarts', classe: 'nombre', rendu: (i) => (i.ecarts ? <Badge ton="attention">{i.ecarts}</Badge> : 0) },
          { id: 'motif', libelle: 'Motif', rendu: (i) => i.motif ?? '' },
        ]}
      />
      {ouvert && (
        <Modale titre={`Inventaire ${ouvert.numero}`} onFermer={() => setOuvert(null)} large>
          <div className="tableau-conteneur">
            <table className="tableau">
              <thead><tr><th>Article</th><th className="nombre">Théorique</th><th className="nombre">Compté</th><th className="nombre">Écart</th></tr></thead>
              <tbody>
                {ouvert.lignes.map((l) => (
                  <tr key={l.id}>
                    <td>{l.libelle}</td>
                    <td className="nombre">{formatQuantite(l.quantite_theorique)}</td>
                    <td className="nombre">{formatQuantite(l.quantite_comptee)}</td>
                    <td className={`nombre ${l.ecart < 0 ? 'texte-alerte' : l.ecart > 0 ? 'texte-vert' : ''}`}>{l.ecart > 0 ? '+' : ''}{formatQuantite(l.ecart)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modale>
      )}
    </>
  );
}

export default function Stock({ naviguer }) {
  const { api, etablissement, peut, notifier, hubs, hub, multiHub, montant } = useEspace();
  const etab = etablissement.id;
  // Liens profonds : ?vue=mouvements|inventaires|peremptions, ?vue=inventaire (ouvre « Je compte mon stock »),
  // ?vue=reception (« J'ai reçu de la marchandise »), ?vue=perte (« J'ai perdu / cassé / périmé »).
  const [lien] = useState(() => lireVueStock(lireParametres().get('vue')));
  const [vue, setVue] = useState(lien.onglet);
  const [action, setAction] = useState(() => (
    lien.action && peut('stock.ajuster') && etablissement.ecriture ? { type: lien.action } : null
  ));
  const { donnees: categories } = useDonnees(
    () => api.lire('categories_articles', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }).catch(() => []),
    [etab]
  );
  const [version, setVersion] = useState(0);
  const { donnees, chargement, erreur, recharger } = useStockHubs();
  const { donnees: mouvements } = useDonnees(
    () => (vue === 'mouvements'
      ? api.lire('mouvements_stock', { eq: { etablissement_id: etab, ...(hub ? { hub_id: hub.id } : {}) }, ordre: ['id', 'desc'], limite: 300 })
      : Promise.resolve(null)),
    [etab, hub?.id, vue, version]
  );
  const hubsStock = hubs.filter((h) => h.capacite_stock);
  const visibles = hub ? [hub] : hubsStock;
  const hubsParId = Object.fromEntries(hubs.map((h) => [h.id, h]));
  const ajuster = peut('stock.ajuster') && etablissement.ecriture;
  const noms = useMemo(() => Object.fromEntries((donnees?.articles ?? []).map((a) => [a.id, a])), [donnees]);

  const niveaux = (donnees?.suivis ?? []).map((a) => {
    const quantite = quantiteHub(donnees, a.id, hub?.id, hubsStock);
    return { ...a, quantite, valeur: quantite * Number(a.cout_achat ?? 0) };
  });
  const bas = niveaux.filter((n) => n.quantite <= n.stock_minimum).length;
  const valeur = niveaux.reduce((s, n) => s + Math.max(n.valeur, 0), 0);
  const fait = (message) => {
    setAction(null);
    notifier(message);
    recharger();
    setVersion((v) => v + 1);
  };

  const onglets = [['niveaux', 'Niveaux']];
  if (multiHub && !hub) onglets.push(['par-hub', 'Par Hub']);
  onglets.push(['mouvements', 'Mouvements'], ['inventaires', 'Inventaires'], ['peremptions', 'Dates de péremption']);

  return (
    <div className="page">
      <PageHeader
        titre="Stock"
        sousTitre={`${multiHub ? (hub ? hub.nom : 'Tous les Hubs (consolidé)') : 'Stock du magasin'} · ${bas ? `${bas} article(s) à réapprovisionner` : 'tous les niveaux sont corrects'} · valeur d’achat ${montant(valeur)}`}
        actions={(
          <>
            {multiHub && peut('stock.transferer') && <Bouton icone="transfert" onClick={() => naviguer('transferts')}>Transférer</Bouton>}
            {ajuster && <Bouton onClick={() => setAction({ type: 'choix_perte' })} disabled={!donnees}>J’ai perdu / cassé / périmé</Bouton>}
            {ajuster && <Bouton icone="inventaire" onClick={() => setAction({ type: 'comptage' })} disabled={!donnees}>Je compte mon stock</Bouton>}
            {ajuster && <Bouton variante="principal" icone="plus" onClick={() => setAction({ type: 'reception' })} disabled={!donnees}>J’ai reçu de la marchandise</Bouton>}
          </>
        )}
      />
      <Tabs onglets={onglets} actif={vue} onChange={setVue} />
      <Erreur message={erreur} />
      {chargement && !donnees && <Squelette lignes={6} />}
      {donnees && vue === 'niveaux' && (
        <DataTable
          lignes={niveaux}
          rechercher={(n) => `${n.nom} ${n.reference ?? ''}`}
          placeholder="Article ou référence"
          triInitial={{ id: 'nom', sens: 'asc' }}
          parPage={50}
          filtres={[{ id: 'etat', libelle: 'État', options: [['bas', 'À réapprovisionner'], ['epuise', 'Épuisé']], appliquer: (n, v) => (v === 'epuise' ? n.quantite <= 0 : n.quantite <= n.stock_minimum) }]}
          vide={<EmptyState icone="stock" titre="Aucun article suivi en stock" />}
          colonnes={[
            { id: 'nom', libelle: 'Article', tri: (n) => n.nom, rendu: (n) => <><strong>{n.nom}</strong>{n.reference && <small className="texte-doux bloc">{n.reference}</small>}</> },
            { id: 'quantite', libelle: 'En stock', classe: 'nombre', tri: (n) => n.quantite, rendu: (n) => <strong>{formatEnCasiers(n.quantite, n)}</strong> },
            { id: 'stock_minimum', libelle: 'Alerte', classe: 'nombre', tri: (n) => n.stock_minimum, rendu: (n) => formatQuantite(n.stock_minimum) },
            { id: 'etat', libelle: 'État', tri: (n) => n.quantite - n.stock_minimum, rendu: (n) => (n.quantite <= 0 ? <Badge ton="rouge">Épuisé</Badge> : n.quantite <= n.stock_minimum ? <Badge ton="orange">Bas</Badge> : <Badge ton="vert">OK</Badge>) },
            ajuster && {
              id: 'actions', libelle: '', classe: 'cellule-actions',
              rendu: (n) => (
                <span className="actions-ligne">
                  <Bouton onClick={(e) => { e.stopPropagation(); setAction({ type: 'retrait', article: n }); }}>Retirer</Bouton>
                </span>
              ),
            },
          ].filter(Boolean)}
        />
      )}
      {donnees && vue === 'par-hub' && (
        <div className="tableau-conteneur">
          <table className="tableau">
            <thead>
              <tr><th>Article</th>{visibles.map((h) => <th key={h.id} className="nombre">{h.nom}</th>)}<th className="nombre">Total</th></tr>
            </thead>
            <tbody>
              {donnees.suivis.map((a) => (
                <tr key={a.id}>
                  <td><strong>{a.nom}</strong></td>
                  {visibles.map((h) => {
                    const q = quantiteHub(donnees, a.id, h.id, []);
                    return <td key={h.id} className={`nombre ${q <= 0 ? 'texte-faible' : ''}`}>{formatQuantite(q)}</td>;
                  })}
                  <td className="nombre"><strong>{formatEnCasiers(quantiteHub(donnees, a.id, null, visibles), a)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {vue === 'mouvements' && (!mouvements ? <Squelette /> : (
        <DataTable
          lignes={mouvements}
          parPage={50}
          rechercher={(m) => `${noms[m.article_id]?.nom ?? ''} ${m.motif ?? ''}`}
          placeholder="Article ou motif"
          filtres={[{ id: 'type', libelle: 'Type', options: Object.entries(TYPES_MOUVEMENT).map(([id, [l]]) => [id, l]), appliquer: (m, v) => m.type === v }]}
          vide={<EmptyState titre="Aucun mouvement" />}
          colonnes={[
            { id: 'cree_le', libelle: 'Date', rendu: (m) => formatDateHeure(m.cree_le) },
            { id: 'article', libelle: 'Article', rendu: (m) => noms[m.article_id]?.nom ?? '—' },
            multiHub && { id: 'hub', libelle: 'Hub', rendu: (m) => hubsParId[m.hub_id]?.nom ?? '—' },
            { id: 'type', libelle: 'Type', rendu: (m) => { const [l, t] = TYPES_MOUVEMENT[m.type] ?? [m.type, 'neutre']; return <Badge ton={t}>{l}</Badge>; } },
            { id: 'quantite', libelle: 'Quantité', classe: 'nombre', rendu: (m) => <span className={m.quantite < 0 ? 'texte-alerte' : 'texte-vert'}>{m.quantite > 0 ? '+' : ''}{formatQuantite(m.quantite)}</span> },
            { id: 'motif', libelle: 'Motif', rendu: (m) => m.motif ?? '' },
          ].filter(Boolean)}
        />
      ))}
      {vue === 'inventaires' && <Inventaires key={version} hubsParId={hubsParId} />}
      {donnees && vue === 'peremptions' && (
        <Peremptions articles={donnees.articles} hubsStock={hubsStock} hubInitial={hub?.id} ajuster={ajuster} onStockChange={() => { recharger(); setVersion((x) => x + 1); }} />
      )}
      {action?.type === 'choix_perte' && donnees && (
        <ChoixPerte
          articles={donnees.suivis}
          quantiteDe={(id) => quantiteHub(donnees, id, hub?.id, hubsStock)}
          onChoisir={(a) => setAction({ type: 'retrait', article: a })}
          onFermer={() => setAction(null)}
        />
      )}
      {action && ['reception', 'comptage'].includes(action.type) && donnees && (
        <SaisieStock
          mode={action.type}
          articles={[...donnees.articles].sort((x, y) => Number(y.suivi_stock) - Number(x.suivi_stock) || x.nom.localeCompare(y.nom, 'fr'))}
          donnees={donnees}
          hubsStock={hubsStock}
          hubInitial={hub?.id}
          categories={categories ?? []}
          onFermer={() => setAction(null)}
          onFait={fait}
        />
      )}
      {action?.type === 'retrait' && (
        <ModaleMouvement
          article={action.article}
          type={action.type}
          hubInitial={hub?.id}
          hubsStock={hubsStock}
          quantiteDe={(h) => quantiteHub(donnees, action.article.id, h, [])}
          onFermer={() => setAction(null)}
          onFait={fait}
        />
      )}
    </div>
  );
}
