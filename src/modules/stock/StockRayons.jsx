import React, { useState } from 'react';
import { formatQuantite } from '../../noyau/format.js';
import { Badge, Bouton, EmptyState, Recherche } from '../../ui/composants.jsx';
import { formatEnCasiers } from './quantites.js';

const ETATS = [['', 'Tout'], ['epuise', 'Épuisés'], ['bas', 'À commander'], ['ok', 'Bon']];
const etatDe = (n) => (n.quantite <= 0 ? 'epuise' : n.quantite <= n.stock_minimum ? 'bas' : 'ok');
const ORDRE = { epuise: 0, bas: 1, ok: 2 };

// Stock rangé par rayon (Juste, 2026-10-24) : un petit tableau par catégorie, les articles épuisés puis « à
// commander » en haut de chaque rayon. Mêmes chiffres que la liste (quantiteHub).
export function StockRayons({ niveaux, categories, etatInitial = '', onRetirer }) {
  const [texte, setTexte] = useState('');
  const [etat, setEtat] = useState(etatInitial);
  const t = texte.trim().toLowerCase();
  const filtres = niveaux.filter((n) => (!t || `${n.nom} ${n.reference ?? ''}`.toLowerCase().includes(t))
    && (!etat || (etat === 'bas' ? etatDe(n) !== 'ok' : etatDe(n) === etat)));
  const rayons = [...(categories ?? []).map((c) => ({ id: c.id, nom: c.nom })), { id: null, nom: 'Sans rayon' }]
    .map((r) => ({ ...r, lignes: filtres.filter((n) => (n.categorie_id ?? null) === r.id || (r.id === null && !categories.some((c) => c.id === n.categorie_id))) }))
    .filter((r) => r.lignes.length > 0)
    .map((r) => ({ ...r, lignes: [...r.lignes].sort((a, b) => ORDRE[etatDe(a)] - ORDRE[etatDe(b)] || a.nom.localeCompare(b.nom, 'fr')) }));
  return (
    <>
      <div className="filtres">
        <Recherche valeur={texte} onChange={setTexte} placeholder="Article ou référence" />
        <div className="bascule-affichage" role="group" aria-label="État du stock">
          {ETATS.map(([id, libelle]) => (
            <button key={id || 'tout'} type="button" className={etat === id ? 'actif' : ''} aria-pressed={etat === id} onClick={() => setEtat(id)}>{libelle}</button>
          ))}
        </div>
      </div>
      {rayons.length === 0 && <EmptyState icone="stock" titre={niveaux.length ? 'Aucun article ne correspond' : 'Aucun article suivi en stock'} />}
      <div className="stock-rayons">
        {rayons.map((r) => {
          const epuises = r.lignes.filter((n) => etatDe(n) === 'epuise').length;
          const bas = r.lignes.filter((n) => etatDe(n) === 'bas').length;
          return (
            <section key={r.id ?? 'sans'} className="carte stock-rayon">
              <div className="titre-ligne">
                <h2>{r.nom}</h2>
                <span className="stock-rayon-resume">
                  {epuises > 0 && <Badge ton="rouge">{epuises} épuisé(s)</Badge>}
                  {bas > 0 && <Badge ton="orange">{bas} à commander</Badge>}
                  {!epuises && !bas && <Badge ton="vert">Tout est bon</Badge>}
                </span>
              </div>
              <div className="tableau-conteneur">
                <table className="tableau stock-rayon-tableau">
                  <thead><tr><th>Article</th><th className="nombre">En stock</th><th className="nombre">Alerte</th><th>État</th>{onRetirer && <th />}</tr></thead>
                  <tbody>
                    {r.lignes.map((n) => {
                      const e = etatDe(n);
                      return (
                        <tr key={n.id} className={`stock-${e}`}>
                          <td><strong>{n.nom}</strong>{n.reference && <small className="texte-doux bloc">{n.reference}</small>}</td>
                          <td className="nombre" data-label="En stock"><strong>{formatEnCasiers(n.quantite, n)}</strong></td>
                          <td className="nombre" data-label="Alerte">{formatQuantite(n.stock_minimum)}</td>
                          <td data-label="État">{e === 'epuise' ? <Badge ton="rouge">Épuisé</Badge> : e === 'bas' ? <Badge ton="orange">À commander</Badge> : <Badge ton="vert">Bon</Badge>}</td>
                          {onRetirer && <td className="cellule-actions"><Bouton onClick={() => onRetirer(n)}>Retirer</Bouton></td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
