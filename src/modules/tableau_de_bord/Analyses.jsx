import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDate, MODES_PAIEMENT } from '../../noyau/format.js';
import { Erreur, Icone, PageHeader, Squelette } from '../../ui/composants.jsx';
import { BarrePeriode, Graphique, Kpi } from './cockpit.jsx';
import { aRetenir, JOURS_COURTS, parHeure, plageHeures } from './analyses.js';

// Tableau « Analyses » (#/tableau-de-bord/analyses) : ce qu'il faut retenir en phrases simples, les grands chiffres,
// les ventes jour par jour comparées à la période d'avant, les heures et jours forts, les articles, catégories,
// vendeurs, clients, modes de paiement, dépenses et articles qui dorment. Un seul appel : analyse_ventes.
export default function Analyses({ f, naviguer }) {
  const { api, etablissement, montant } = useEspace();
  const { donnees: a, chargement, erreur } = useDonnees(
    () => api.rpc('analyse_ventes', { p_etablissement_id: etablissement.id, p_du: f.du, p_au: f.au, p_hub_id: f.hubId || null }),
    [etablissement.id, f.du, f.au, f.hubId]
  );
  const t = a?.totaux;
  const tauxMarge = t && Number(t.chiffre_cout_connu) > 0 ? Math.round((100 * Number(t.marge)) / Number(t.chiffre_cout_connu)) : null;
  const panierAvant = t && Number(t.nombre_precedent) > 0 ? Number(t.chiffre_precedent) / Number(t.nombre_precedent) : null;
  return (
    <>
      <PageHeader titre="Analyses" sousTitre="Vos chiffres expliqués simplement : ce qui marche, ce qui ne marche pas, quoi faire." />
      <BarrePeriode f={f} filtresAvances={false} />
      {f.du === f.au && <p className="texte-doux cockpit-note">Astuce : choisissez « 30 jours » ou « Ce mois » pour des analyses plus parlantes.</p>}
      {chargement && !a && <Squelette lignes={8} />}
      <Erreur message={erreur} />
      {a && (
        <div className="analyses">
          <ARetenir phrases={aRetenir(a, montant)} />
          <div className="kpis">
            <Kpi kpi={{ cle: 'chiffre_affaires', libelle: 'Chiffre d’affaires', valeur: t.chiffre, precedent: t.chiffre_precedent, format: 'montant', route: `ventes?du=${a.du}&au=${a.au}` }} naviguer={naviguer} mis_en_avant />
            <Kpi kpi={{ cle: 'ventes', libelle: 'Ventes', valeur: t.nombre, precedent: t.nombre_precedent, format: 'nombre', detail: `${Number(t.articles_vendus).toLocaleString('fr-FR')} article(s) vendu(s)` }} naviguer={naviguer} />
            <Kpi kpi={{ cle: 'panier', libelle: 'Panier moyen', valeur: t.panier_moyen, precedent: panierAvant, format: 'montant' }} naviguer={naviguer} />
            {tauxMarge != null && <Kpi kpi={{ cle: 'marge', libelle: 'Marge', valeur: t.marge, format: 'montant', detail: `environ ${tauxMarge} % du prix de vente` }} naviguer={naviguer} />}
            {t.encaisse != null && <Kpi kpi={{ cle: 'encaisse', libelle: 'Argent reçu', valeur: t.encaisse, format: 'montant' }} naviguer={naviguer} />}
            {t.depenses != null && <Kpi kpi={{ cle: 'depenses', libelle: 'Dépenses', valeur: t.depenses, format: 'montant', route: 'depenses' }} naviguer={naviguer} />}
            {Number(t.reste_du) > 0 && <Kpi kpi={{ cle: 'reste', libelle: 'Pas encore payé', valeur: t.reste_du, format: 'montant', ton: 'attention', route: 'qui-me-doit' }} naviguer={naviguer} />}
          </div>
          {a.par_jour.length > 1 && <CourbeJours jours={a.par_jour} montant={montant} />}
          <CarteHeures parHeureJour={a.par_heure} montant={montant} />
          <div className="cockpit-colonnes analyses-colonnes">
            <Graphique g={{ cle: 'articles', titre: 'Articles qui rapportent le plus', type: 'repartition', format: 'montant', points: a.articles.slice(0, 10).map((x) => ({ libelle: x.libelle, valeur: x.chiffre })) }} naviguer={naviguer} />
            <Graphique g={{ cle: 'categories', titre: 'Par catégorie', type: 'repartition', format: 'montant', points: a.categories.map((x) => ({ libelle: x.libelle, valeur: x.chiffre })) }} naviguer={naviguer} />
            {a.vendeurs.length > 1 && <Graphique g={{ cle: 'vendeurs', titre: 'Par vendeur', type: 'repartition', format: 'montant', points: a.vendeurs.map((x) => ({ libelle: x.libelle, valeur: x.chiffre })) }} naviguer={naviguer} />}
            <Graphique g={{ cle: 'modes', titre: 'Comment les clients paient', type: 'repartition', format: 'montant', points: (a.modes ?? []).map((x) => ({ libelle: MODES_PAIEMENT[x.mode] ?? x.mode, valeur: x.montant })) }} naviguer={naviguer} />
            {a.clients.length > 0 && <ListeSimple titre="Meilleurs clients" route="contacts" naviguer={naviguer} lignes={a.clients.map((c) => ({ libelle: c.libelle, detail: `${c.nombre} achat(s)${Number(c.reste_du) > 0 ? ` · doit encore ${montant(c.reste_du)}` : ''}`, valeur: montant(c.chiffre) }))} />}
            {(a.depenses ?? []).length > 0 && <Graphique g={{ cle: 'depenses', titre: 'Où part l’argent (dépenses)', type: 'repartition', format: 'montant', points: a.depenses.map((x) => ({ libelle: x.libelle, valeur: x.montant })) }} naviguer={naviguer} />}
            {(a.dormants ?? []).length > 0 && <ListeSimple titre="En stock, mais pas vendus sur la période" route="stock" naviguer={naviguer} lignes={a.dormants.map((d) => ({ libelle: d.libelle, detail: `${Number(d.quantite).toLocaleString('fr-FR')} en stock`, valeur: Number(d.valeur) > 0 ? montant(d.valeur) : '' }))} />}
          </div>
          <TableauArticles articles={a.articles} montant={montant} />
        </div>
      )}
    </>
  );
}

function ARetenir({ phrases }) {
  if (!phrases.length) return null;
  const icone = { bon: 'coche', alerte: 'alerte', info: 'message' };
  return (
    <section className="carte analyses-retenir" aria-label="Ce qu’il faut retenir">
      <h2>Ce qu’il faut retenir</h2>
      <ul>
        {phrases.map((p) => (
          <li key={p.texte} className={`retenir-${p.ton}`}>
            <span className="retenir-pastille" aria-hidden="true"><Icone nom={icone[p.ton] ?? 'message'} taille={14} /></span>
            <span>{p.texte}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ListeSimple({ titre, route, naviguer, lignes }) {
  return (
    <section className="carte">
      <div className="titre-ligne">
        <h2>{titre}</h2>
        {route && <button type="button" className="lien" onClick={() => naviguer(route)}>Tout voir</button>}
      </div>
      <ul className="cockpit-liste">
        {lignes.map((l, i) => (
          <li key={`${l.libelle}-${i}`}>
            <div className="analyses-ligne">
              <span><strong>{l.libelle}</strong>{l.detail && <small>{l.detail}</small>}</span>
              {l.valeur && <span className="cockpit-liste-valeur">{l.valeur}</span>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Ventes par jour : la période choisie (trait plein) et la période d'avant (pointillés gris), sur le même axe.
function CourbeJours({ jours, montant }) {
  const [survol, setSurvol] = useState(null);
  const L = 720;
  const H = 220;
  const m = { haut: 14, bas: 28, gauche: 56, droite: 12 };
  const zl = L - m.gauche - m.droite;
  const zh = H - m.haut - m.bas;
  const max = Math.max(...jours.map((j) => Math.max(Number(j.chiffre), Number(j.chiffre_precedent))), 0);
  if (max <= 0) return null;
  const plafond = arrondiHaut(max);
  const x = (i) => m.gauche + (jours.length === 1 ? zl / 2 : (i * zl) / (jours.length - 1));
  const y = (v) => m.haut + zh - (Number(v) / plafond) * zh;
  const trace = (cle) => jours.map((j, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(j[cle]).toFixed(1)}`).join(' ');
  const pasEtiquette = Math.max(1, Math.ceil(jours.length / 8));
  const compact = (v) => (v >= 1e6 ? `${(v / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M` : v >= 1e3 ? `${Math.round(v / 1e3)} k` : String(Math.round(v)));
  const j = survol != null ? jours[survol] : null;
  return (
    <section className="carte">
      <div className="titre-ligne">
        <h2>Ventes jour par jour</h2>
        <span className="analyses-legende">
          <span><i className="trait-plein" aria-hidden="true" /> Cette période</span>
          <span><i className="trait-pointille" aria-hidden="true" /> Période d’avant</span>
        </span>
      </div>
      <div className="analyses-courbe">
        <svg viewBox={`0 0 ${L} ${H}`} role="img" aria-label="Ventes jour par jour, comparées à la période d’avant" onMouseLeave={() => setSurvol(null)}>
          {[0, plafond / 2, plafond].map((g) => (
            <g key={g}>
              <line x1={m.gauche} x2={L - m.droite} y1={y(g)} y2={y(g)} className="graphique-grille" />
              <text x={m.gauche - 6} y={y(g) + 4} textAnchor="end" className="graphique-texte">{compact(g)}</text>
            </g>
          ))}
          {jours.map((jj, i) => ((i % pasEtiquette === 0 && jours.length - 1 - i >= pasEtiquette / 2) || i === jours.length - 1) && (
            <text key={jj.jour} x={x(i)} y={H - 8} textAnchor="middle" className="graphique-texte">{jj.jour.slice(8, 10)}/{jj.jour.slice(5, 7)}</text>
          ))}
          <path d={trace('chiffre_precedent')} className="courbe-precedente" />
          <path d={trace('chiffre')} className="courbe-actuelle" />
          {survol != null && (
            <>
              <line x1={x(survol)} x2={x(survol)} y1={m.haut} y2={m.haut + zh} className="courbe-repere" />
              <circle cx={x(survol)} cy={y(j.chiffre)} r="5" className="courbe-point" />
            </>
          )}
          {jours.map((jj, i) => (
            <rect key={`zone-${jj.jour}`} x={x(i) - zl / jours.length / 2} y={m.haut} width={Math.max(zl / jours.length, 6)} height={zh}
              fill="transparent" onMouseEnter={() => setSurvol(i)} onFocus={() => setSurvol(i)} tabIndex={-1}>
              <title>{`${formatDate(jj.jour)} : ${montant(jj.chiffre)} (${jj.nombre} vente(s)) · période d’avant : ${montant(jj.chiffre_precedent)}`}</title>
            </rect>
          ))}
        </svg>
        {j && (
          <div className="analyses-bulle" style={{ left: `${(100 * x(survol)) / L}%` }} role="status">
            <strong>{formatDate(j.jour)}</strong>
            <span>{montant(j.chiffre)} · {j.nombre} vente(s)</span>
            <small>Période d’avant : {montant(j.chiffre_precedent)}</small>
          </div>
        )}
      </div>
    </section>
  );
}

function arrondiHaut(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p) * p;
}

// Carte des heures : une case par jour de la semaine et par heure ; plus c'est foncé, plus on vend.
function CarteHeures({ parHeureJour, montant }) {
  const [survol, setSurvol] = useState(null);
  if (!parHeureJour.length) return null;
  const [debut, fin] = plageHeures(parHeure(parHeureJour));
  const heures = Array.from({ length: fin - debut + 1 }, (_, i) => debut + i);
  const cases = {};
  for (const c of parHeureJour) cases[`${c.jour_semaine}-${c.heure}`] = c;
  const max = Math.max(...parHeureJour.map((c) => Number(c.chiffre)), 0);
  const niveau = (v) => (v > 0 ? Math.min(5, Math.ceil((5 * Number(v)) / max)) : 0);
  const c = survol ? cases[survol] : null;
  return (
    <section className="carte">
      <div className="titre-ligne">
        <h2>Quand vous vendez le plus</h2>
        <span className="analyses-legende">
          Moins {[1, 2, 3, 4, 5].map((nv) => <i key={nv} className={`case-chaleur n${nv}`} aria-hidden="true" />)} Plus
        </span>
      </div>
      <div className="carte-chaleur-defile">
        <table className="carte-chaleur" aria-label="Chiffre d’affaires par jour de la semaine et par heure">
          <thead>
            <tr><th scope="col"><span className="visuellement-cache">Jour</span></th>{heures.map((h) => <th key={h} scope="col">{h} h</th>)}</tr>
          </thead>
          <tbody>
            {JOURS_COURTS.map((nom, i) => (
              <tr key={nom}>
                <th scope="row">{nom}</th>
                {heures.map((h) => {
                  const cle = `${i + 1}-${h}`;
                  const v = cases[cle];
                  return (
                    <td key={h} className={`case-chaleur n${niveau(v?.chiffre)}`} onMouseEnter={() => setSurvol(cle)} onMouseLeave={() => setSurvol(null)}
                      title={`${nom} ${h} h : ${v ? `${montant(v.chiffre)} (${v.nombre} vente(s))` : 'aucune vente'}`}>
                      <span className="visuellement-cache">{v ? montant(v.chiffre) : '0'}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="texte-doux analyses-bas">
        {c ? `${JOURS_COURTS[Number(c.jour_semaine) - 1]} ${c.heure} h : ${montant(c.chiffre)} en ${c.nombre} vente(s).` : 'Passez sur une case pour voir le détail.'}
      </p>
    </section>
  );
}

function TableauArticles({ articles, montant }) {
  if (!articles.length) return null;
  return (
    <section className="carte">
      <div className="titre-ligne"><h2>Détail des articles les plus vendus</h2></div>
      <div className="table-defile">
        <table className="tableau">
          <thead>
            <tr><th>Article</th><th className="nombre">Quantité</th><th className="nombre">Chiffre</th><th className="nombre">Marge</th></tr>
          </thead>
          <tbody>
            {articles.map((x) => (
              <tr key={x.libelle}>
                <td>{x.libelle}</td>
                <td className="nombre">{Number(x.quantite).toLocaleString('fr-FR')}</td>
                <td className="nombre">{montant(x.chiffre)}</td>
                <td className="nombre">{x.marge == null ? <span className="texte-faible">coût inconnu</span> : montant(x.marge)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// Vue d'ensemble : les trois phrases les plus utiles, avec un lien vers les analyses complètes.
export function ApercuAnalyses({ f, naviguer }) {
  const { api, etablissement, montant } = useEspace();
  const { donnees: a } = useDonnees(
    () => api.rpc('analyse_ventes', { p_etablissement_id: etablissement.id, p_du: f.du, p_au: f.au, p_hub_id: f.hubId || null }).catch(() => null),
    [etablissement.id, f.du, f.au, f.hubId]
  );
  const phrases = a ? aRetenir(a, montant).slice(0, 3) : [];
  if (!phrases.length || !(Number(a.totaux.nombre) > 0)) return null;
  return (
    <div className="analyses-apercu">
      <ARetenir phrases={phrases} />
      <button type="button" className="lien" onClick={() => naviguer('tableau-de-bord/analyses')}>Voir toutes les analyses (heures, jours, articles, clients…)</button>
    </div>
  );
}
