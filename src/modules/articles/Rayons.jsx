import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { dateLocale, formatQuantite } from '../../noyau/format.js';
import { Badge, Icone } from '../../ui/composants.jsx';
import { VignetteArticle } from '../caisse/Caisse.jsx';
import { rangerParRayon, SANS_RAYON } from './rayons.js';

// Articles rangés par rayon (Juste, 2026-10-24) : un cadre par catégorie, les plus vendus des 30 derniers jours en
// premier (étoile = top 3 du rayon). On glisse un article d'un rayon à l'autre pour changer sa catégorie
// (deplacer_articles_categorie, droit articles.categories). Sur tablette : toucher l'article, la catégorie se change dans sa fiche.
export function useVentes30Jours() {
  const { api, etablissement, peut } = useEspace();
  const { donnees } = useDonnees(async () => {
    if (!peut('ventes.lire')) return {};
    const r = await api.rpc('analyse_commerce', { p_etablissement_id: etablissement.id, p_du: dateLocale(-29), p_au: dateLocale(0), p_filtres: {} }).catch(() => null);
    return Object.fromEntries((r?.articles ?? []).map((a) => [a.id, { quantite: a.quantite, chiffre: a.chiffre }]));
  }, [etablissement.id]);
  return donnees ?? {};
}

export function TableauRayons({ articles, categories, stock, onOuvrir, onDeplacer, cacherVides = false }) {
  const { montant, peut } = useEspace();
  const ventes = useVentes30Jours();
  const [glisse, setGlisse] = useState(null);
  const [survol, setSurvol] = useState(null);
  const peutDeplacer = peut('articles.categories') && Boolean(onDeplacer);
  const rayons = rangerParRayon(articles, categories, ventes).filter((r) => !cacherVides || r.articles.length > 0);
  const deposer = (rayon) => {
    setSurvol(null);
    const a = articles.find((x) => x.id === glisse);
    setGlisse(null);
    if (!a || (a.categorie_id ?? SANS_RAYON) === rayon.id) return;
    onDeplacer(a, rayon.id === SANS_RAYON ? null : rayon.id, rayon.nom);
  };
  return (
    <>
      {peutDeplacer && <p className="texte-doux aide-selection"><Icone nom="transfert" taille={14} /> Glissez un article sur un autre rayon pour le changer de catégorie. L’étoile montre les 3 qui se vendent le plus (30 derniers jours).</p>}
      <div className="rayons">
        {rayons.map((r) => (
          <section
            key={r.id}
            className={`carte rayon ${survol === r.id ? 'survol' : ''}`}
            aria-label={r.nom}
            onDragOver={peutDeplacer ? (e) => { e.preventDefault(); setSurvol(r.id); } : undefined}
            onDragLeave={peutDeplacer ? () => setSurvol((s) => (s === r.id ? null : s)) : undefined}
            onDrop={peutDeplacer ? (e) => { e.preventDefault(); deposer(r); } : undefined}
          >
            <div className="rayon-tete">
              <h2>{r.nom}</h2>
              <span className="onglet-compteur">{r.articles.length}</span>
              {r.chiffre > 0 && <small className="texte-doux">{montant(r.chiffre)} en 30 j</small>}
            </div>
            {r.articles.length === 0 && <p className="texte-doux rayon-vide">Aucun article. Glissez-en un ici.</p>}
            <div className="rayon-articles">
              {r.articles.map((a) => {
                const q = stock[a.id];
                const meilleur = r.meilleurs.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={`rayon-article ${glisse === a.id ? 'glisse' : ''}`}
                    draggable={peutDeplacer}
                    onDragStart={(e) => { setGlisse(a.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(a.id)); }}
                    onDragEnd={() => { setGlisse(null); setSurvol(null); }}
                    onClick={() => onOuvrir?.(a)}
                    title={a.nom}
                  >
                    <VignetteArticle article={a} taille="petite" />
                    <span className="rayon-article-texte">
                      <strong>{a.nom}{a.variante ? ` — ${a.variante}` : ''}</strong>
                      <small>
                        {montant(a.prix_vente)}
                        {a.suivi_stock && q != null && <> · <span className={Number(q) <= Number(a.stock_minimum ?? 0) ? 'texte-alerte' : ''}>stock {formatQuantite(q, a.unite)}</span></>}
                        {a.vendu > 0 && <> · {formatQuantite(a.vendu)} vendu(s)</>}
                      </small>
                    </span>
                    {meilleur && <span className="rayon-etoile" aria-label="Parmi les plus vendus"><Icone nom="etoile" taille={14} /></span>}
                    {!a.suivi_stock && <Badge>Sans stock</Badge>}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
