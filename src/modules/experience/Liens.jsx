import React, { useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { Chargement, Erreur } from '../../ui/composants.jsx';
import { EnteteXp, PhotoServeur, Segments, Tuile } from './communs.jsx';

// Liens (nouvelle version The Dream) : qui vend quoi. Chaque serveur est relié aux produits qu'il vend ; l'épaisseur
// du trait = l'argent. Toucher un nom éclaire ses liens. Calcul sur les tickets récents (1 000 au plus).
const PERIODES = [['7', '7 jours'], ['30', '30 jours']];

export function calculerLiens(ventes, lignes, articles, serveurs) {
  const parVente = Object.fromEntries(ventes.map((v) => [v.id, v.serveur_id]));
  const duos = {};
  const totS = {};
  const totP = {};
  lignes.forEach((l) => {
    const s = parVente[l.vente_id];
    if (!s || !l.article_id) return;
    const montant = Number(l.total) || 0;
    const cle = `${s}|${l.article_id}`;
    duos[cle] = (duos[cle] ?? 0) + montant;
    totS[s] = (totS[s] ?? 0) + montant;
    totP[l.article_id] = (totP[l.article_id] ?? 0) + montant;
  });
  const listeS = Object.entries(totS).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, v]) => ({ id, nom: serveurs[id]?.prenom ?? 'Serveur', photo: serveurs[id]?.photo_url, v }));
  const listeP = Object.entries(totP).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id, v]) => ({ id, nom: articles[id]?.nom ?? 'Article', v }));
  const garderS = new Set(listeS.map((x) => x.id));
  const garderP = new Set(listeP.map((x) => x.id));
  const liens = Object.entries(duos).map(([cle, v]) => {
    const [s, p] = cle.split('|');
    return { s, p, v };
  }).filter((l) => garderS.has(l.s) && garderP.has(l.p)).sort((a, b) => b.v - a.v);
  // Duo remarquable : un serveur qui vend un produit bien plus que sa part habituelle.
  const total = Object.values(totS).reduce((a, b) => a + b, 0) || 1;
  const remarquables = liens.map((l) => {
    const attendu = (totS[l.s] / total) * totP[l.p];
    return { ...l, force: attendu ? l.v / attendu : 0 };
  }).filter((l) => l.force > 1.4 && l.v > total * 0.01).sort((a, b) => b.force - a.force).slice(0, 4);
  return { serveurs: listeS, produits: listeP, liens, remarquables };
}

export default function Liens() {
  const { api, etablissement, montant } = useEspace();
  const etab = etablissement.id;
  const [jours, setJours] = useState('7');
  const [actif, setActif] = useState(null);
  const { donnees, chargement, erreur } = useDonnees(async () => {
    const depuis = new Date(Date.now() - Number(jours) * 86400000).toISOString();
    const [ventes, articles, serveurs] = await Promise.all([
      api.lire('ventes', { eq: { etablissement_id: etab, statut: 'validee' }, gte: { cree_le: depuis }, colonnes: ['id', 'serveur_id'], ordre: ['cree_le', 'desc'], limite: 1000 }),
      api.lire('articles', { eq: { etablissement_id: etab }, colonnes: ['id', 'nom'] }),
      api.lire('serveurs_caisse', { eq: { etablissement_id: etab } }),
    ]);
    const avecServeur = ventes.filter((v) => v.serveur_id);
    const lignes = [];
    for (let i = 0; i < avecServeur.length; i += 200) {
      const lot = avecServeur.slice(i, i + 200).map((v) => v.id);
      lignes.push(...await api.lire('lignes_vente', { dans: { vente_id: lot }, colonnes: ['vente_id', 'article_id', 'total'], limite: 5000 }));
    }
    return calculerLiens(avecServeur, lignes, Object.fromEntries(articles.map((a) => [a.id, a])), Object.fromEntries(serveurs.map((s) => [s.id, s])));
  }, [etab, jours]);

  const plan = useMemo(() => {
    if (!donnees) return null;
    const h = Math.max(donnees.serveurs.length, donnees.produits.length) * 46 + 40;
    const yS = (i) => 30 + i * ((h - 60) / Math.max(1, donnees.serveurs.length - 1 || 1));
    const yP = (i) => 30 + i * ((h - 60) / Math.max(1, donnees.produits.length - 1 || 1));
    const pos = {};
    donnees.serveurs.forEach((s, i) => { pos[`s${s.id}`] = [150, donnees.serveurs.length === 1 ? h / 2 : yS(i)]; });
    donnees.produits.forEach((p, i) => { pos[`p${p.id}`] = [650, donnees.produits.length === 1 ? h / 2 : yP(i)]; });
    const max = Math.max(1, ...donnees.liens.map((l) => l.v));
    return { h, pos, max };
  }, [donnees]);

  if (chargement && !donnees) return <Chargement />;
  if (erreur) return <Erreur message={erreur} />;
  const lie = (l) => !actif || actif === `s${l.s}` || actif === `p${l.p}`;
  const noeudLie = (cle) => !actif || actif === cle || donnees.liens.some((l) => lie(l) && (`s${l.s}` === cle || `p${l.p}` === cle));
  const nomS = (id) => donnees.serveurs.find((s) => s.id === id)?.nom;
  const nomP = (id) => donnees.produits.find((p) => p.id === id)?.nom;

  return (
    <div className="xp-page">
      <EnteteXp titre="Liens" sousTitre="Qui vend quoi. Plus le trait est épais, plus il y a d’argent entre ce serveur et ce produit. Touchez un nom pour l’isoler.">
        <Segments libelle="Période" valeur={jours} onChange={(v) => { setJours(v); setActif(null); }} options={PERIODES} />
      </EnteteXp>
      {donnees.remarquables.length > 0 && (
        <div className="xp-grille large">
          {donnees.remarquables.map((r) => (
            <Tuile key={`${r.s}${r.p}`} titre="Duo qui marche" valeur={`${nomS(r.s)} × ${nomP(r.p)}`}
              verdict={{ ton: 'bon', texte: `${r.force.toFixed(1).replace(".", ",")} fois plus que la moyenne` }}
              pourquoi={`${montant(Math.round(r.v))} vendus. ${nomS(r.s)} vend ce produit bien plus que les autres.`}
              conseil={`Demandez à ${nomS(r.s)} sa façon de le proposer, et partagez l’astuce avec l’équipe.`} />
          ))}
        </div>
      )}
      <section className="xp-carte" style={{ overflowX: 'auto' }}>
        {donnees.liens.length ? (
          <svg className="xp-graphe" viewBox={`0 0 800 ${plan.h}`} role="img" aria-label="Liens entre serveurs et produits">
            {donnees.liens.map((l) => {
              const [x1, y1] = plan.pos[`s${l.s}`];
              const [x2, y2] = plan.pos[`p${l.p}`];
              return (
                <path key={`${l.s}${l.p}`} className={`lien-trait ${lie(l) ? '' : 'attenue'}`} strokeWidth={1 + (l.v / plan.max) * 9}
                  d={`M${x1 + 18},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2 - 10},${y2}`}>
                  <title>{`${nomS(l.s)} → ${nomP(l.p)} : ${montant(Math.round(l.v))}`}</title>
                </path>
              );
            })}
            {donnees.serveurs.map((s) => {
              const [x, y] = plan.pos[`s${s.id}`];
              const cle = `s${s.id}`;
              return (
                <g key={cle} className={`noeud serveur ${actif === cle ? 'actif' : ''} ${noeudLie(cle) ? '' : 'attenue'}`} transform={`translate(${x},${y})`}
                  onClick={() => setActif(actif === cle ? null : cle)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setActif(actif === cle ? null : cle)}>
                  <circle r="16" />
                  <text x="-24" y="4" textAnchor="end">{s.nom}</text>
                </g>
              );
            })}
            {donnees.produits.map((p) => {
              const [x, y] = plan.pos[`p${p.id}`];
              const cle = `p${p.id}`;
              return (
                <g key={cle} className={`noeud produit ${actif === cle ? 'actif' : ''} ${noeudLie(cle) ? '' : 'attenue'}`} transform={`translate(${x},${y})`}
                  onClick={() => setActif(actif === cle ? null : cle)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setActif(actif === cle ? null : cle)}>
                  <circle r="9" />
                  <text x="16" y="4">{p.nom}</text>
                </g>
              );
            })}
          </svg>
        ) : <p className="texte-doux">Pas assez de ventes avec un serveur noté sur la période.</p>}
      </section>
      {actif && (
        <section className="xp-carte xp-section">
          <h2 className="xp-section-titre">{actif.startsWith('s') ? nomS(actif.slice(1)) : nomP(actif.slice(1))}</h2>
          <div className="xp-liste">
            {donnees.liens.filter(lie).slice(0, 10).map((l) => (
              <div key={`${l.s}${l.p}`} className="xp-ligne">
                {actif.startsWith('p') && <PhotoServeur prenom={nomS(l.s)} photo={donnees.serveurs.find((s) => s.id === l.s)?.photo} taille={32} />}
                <span className="xp-ligne-texte"><strong>{actif.startsWith('s') ? nomP(l.p) : nomS(l.s)}</strong></span>
                <span className="xp-ligne-valeur">{montant(Math.round(l.v))}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
