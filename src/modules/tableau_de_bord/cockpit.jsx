// Briques communes des tableaux de bord : période, filtres, indicateurs cliquables,
// « À surveiller », graphiques, listes, activité, actions rapides.
import React, { useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDate, formatDateHeure, formatMontantCourt, MODES_PAIEMENT } from '../../noyau/format.js';
import { Bouton, ChiffreCle, GraphiqueBarres, Icone } from '../../ui/composants.jsx';
import { NombreAnime } from '../../motion/NombreAnime.jsx';
import { actionsDomaine, bornesPeriode, PERIODES, variation } from './domaines.js';

const CLE_PERIODE = 'ae-cockpit-periode';

function lireMemoire() {
  try { return JSON.parse(localStorage.getItem(CLE_PERIODE) ?? 'null') ?? {}; } catch { return {}; }
}

// Période + filtres (Hub, caisse, collaborateur), mémorisés sur l'appareil.
export function useFiltresCockpit() {
  const { hub, multiHub } = useEspace();
  const memoire = useMemo(lireMemoire, []);
  const [periode, setPeriode] = useState(PERIODES.some(([id]) => id === memoire.periode) ? memoire.periode : 'jour');
  const [perso, setPerso] = useState(memoire.perso ?? {});
  const [hubId, setHubId] = useState(multiHub ? hub?.id ?? '' : '');
  const [caisseId, setCaisseId] = useState('');
  const [utilisateurId, setUtilisateurId] = useState('');
  const { du, au } = bornesPeriode(periode, perso);
  const memoriser = (p, x) => { try { localStorage.setItem(CLE_PERIODE, JSON.stringify({ periode: p, perso: x })); } catch { /* stockage indisponible */ } };
  const filtres = {};
  if (hubId) filtres.hub_id = hubId;
  if (caisseId) filtres.caisse_id = caisseId;
  if (utilisateurId) filtres.utilisateur_id = utilisateurId;
  return {
    periode, du, au, perso, filtres, hubId, caisseId, utilisateurId,
    cle: `${du}|${au}|${hubId}|${caisseId}|${utilisateurId}`,
    choisirPeriode: (p) => { setPeriode(p); memoriser(p, perso); },
    choisirPerso: (x) => { const v = { ...perso, ...x }; setPerso(v); memoriser('perso', v); },
    setHubId, setCaisseId, setUtilisateurId,
  };
}

export function BarrePeriode({ f, filtresAvances = true }) {
  const { api, etablissement, hubs, multiHub } = useEspace();
  const [ouvert, setOuvert] = useState(Boolean(f.caisseId || f.utilisateurId));
  const { donnees: options } = useDonnees(
    () => (filtresAvances ? api.rpc('cockpit_options', { p_etablissement_id: etablissement.id }) : Promise.resolve(null)),
    [etablissement.id, filtresAvances]
  );
  const caisses = (options?.caisses ?? []).filter((c) => !f.hubId || !c.hub_id || c.hub_id === f.hubId);
  const avances = filtresAvances && (caisses.length > 1 || (options?.collaborateurs ?? []).length > 1);
  const actifs = [f.caisseId, f.utilisateurId].filter(Boolean).length;
  return (
    <div className="cockpit-barre">
      <div className="cockpit-periodes" role="tablist" aria-label="Période">
        {PERIODES.map(([id, libelle]) => (
          <button key={id} type="button" role="tab" aria-selected={f.periode === id} className={f.periode === id ? 'actif' : ''} onClick={() => f.choisirPeriode(id)}>
            {libelle}
          </button>
        ))}
      </div>
      <div className="cockpit-filtres">
        {f.periode === 'perso' && (
          <span className="cockpit-dates">
            <label>Du <input type="date" value={f.du} max={f.au} onChange={(e) => e.target.value && f.choisirPerso({ du: e.target.value })} /></label>
            <label>au <input type="date" value={f.au} min={f.du} onChange={(e) => e.target.value && f.choisirPerso({ au: e.target.value })} /></label>
          </span>
        )}
        {f.periode !== 'perso' && <span className="cockpit-plage texte-doux">{f.du === f.au ? formatDate(f.du) : `${formatDate(f.du)} → ${formatDate(f.au)}`}</span>}
        {multiHub && (
          <select aria-label="Hub" value={f.hubId} onChange={(e) => { f.setHubId(e.target.value); f.setCaisseId(''); }}>
            <option value="">Tous les Hubs</option>
            {hubs.map((h) => <option key={h.id} value={h.id}>{h.nom}</option>)}
          </select>
        )}
        {avances && (
          <Bouton icone="recherche" onClick={() => setOuvert(!ouvert)} aria-expanded={ouvert}>
            Filtres{actifs ? ` (${actifs})` : ''}
          </Bouton>
        )}
      </div>
      {avances && ouvert && (
        <div className="cockpit-filtres-avances">
          {caisses.length > 1 && (
            <select aria-label="Caisse" value={f.caisseId} onChange={(e) => f.setCaisseId(e.target.value)}>
              <option value="">Toutes les caisses</option>
              {caisses.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          )}
          {(options?.collaborateurs ?? []).length > 1 && (
            <select aria-label="Collaborateur" value={f.utilisateurId} onChange={(e) => f.setUtilisateurId(e.target.value)}>
              <option value="">Tous les collaborateurs</option>
              {options.collaborateurs.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          )}
          {actifs > 0 && <Bouton icone="fermer" onClick={() => { f.setCaisseId(''); f.setUtilisateurId(''); }}>Effacer</Bouton>}
        </div>
      )}
    </div>
  );
}

const nombreFr = (n, max = 1) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: max }).format(Number(n) || 0).replace(/ | /g, ' ');

export function useFormat() {
  const { montant } = useEspace();
  return (valeur, format) => {
    if (valeur == null) return '—';
    if (format === 'montant') return montant(valeur);
    if (format === 'pourcent') return `${nombreFr(valeur, 0)} %`;
    if (format === 'heures') return `${nombreFr(valeur)} h`;
    return nombreFr(valeur, 2);
  };
}

// Libellé court de la période d'un indicateur (« Aujourd'hui », « 01/10 → 21/10 »).
export function libellePeriode(f) {
  if (!f) return null;
  const nom = PERIODES.find(([id]) => id === f.periode)?.[1];
  if (f.periode !== 'perso' && nom) return nom;
  return f.du === f.au ? formatDate(f.du) : `${formatDate(f.du)} → ${formatDate(f.au)}`;
}

// Carte d'indicateur : titre, valeur (jamais coupée, unité comprise), période, évolution et son sens.
// Une valeur absente (calcul indisponible) s'affiche « Indisponible », jamais « 0 ».
export function Kpi({ kpi, naviguer, mis_en_avant, periode }) {
  const formater = useFormat();
  const { devise } = useEspace();
  const v = variation(kpi);
  const Balise = kpi.route ? 'button' : 'div';
  const indisponible = kpi.valeur == null;
  const complet = indisponible ? null : formater(kpi.valeur, kpi.format);
  const sens = v ? (v.favorable === true ? 'favorable' : v.favorable === false ? 'défavorable' : 'stable') : null;
  return (
    <Balise
      type={kpi.route ? 'button' : undefined}
      className={`kpi ${kpi.ton ? `kpi-${kpi.ton}` : ''} ${kpi.route ? 'cliquable' : ''} ${mis_en_avant ? 'fort' : ''} ${indisponible ? 'kpi-indisponible' : ''}`}
      onClick={kpi.route ? () => naviguer(kpi.route) : undefined}
      title={kpi.route ? 'Voir le détail' : undefined}
    >
      <span className="kpi-tete">
        <span className="kpi-libelle">{kpi.libelle}</span>
        {periode && <span className="kpi-periode">{periode}</span>}
      </span>
      {indisponible ? (
        <strong className="kpi-valeur"><span className="kpi-absent"><Icone nom="alerte" taille={16} /> Indisponible</span></strong>
      ) : (
        <ChiffreCle as="strong" className="kpi-valeur" title={complet} court={kpi.format === 'montant' && Math.abs(Number(kpi.valeur)) >= 100_000 ? formatMontantCourt(kpi.valeur, devise) : null}>
          <NombreAnime valeur={kpi.valeur} format={(x) => formater(x, kpi.format)} />
        </ChiffreCle>
      )}
      {v && (
        <span className={`kpi-variation ${v.favorable === true ? 'bon' : v.favorable === false ? 'mauvais' : ''}`}>
          <span aria-hidden="true">{v.pourcent > 0 ? '▲' : v.pourcent < 0 ? '▼' : '='}</span>
          {' '}{v.pourcent > 0 ? '+' : v.pourcent < 0 ? '−' : ''}{Math.abs(v.pourcent)} % <small>{kpi.comparaison ?? 'vs période précédente'}</small>
          <span className="lecteur-ecran">, évolution {sens}</span>
        </span>
      )}
      {indisponible && <small className="kpi-detail">Le calcul n’a pas pu se faire. Réessayez plus tard.</small>}
      {kpi.detail && <small className="kpi-detail">{kpi.detail}</small>}
    </Balise>
  );
}

export function GrilleKpis({ kpis, naviguer, max, periode }) {
  const liste = max ? kpis.slice(0, max) : kpis;
  if (!liste.length) return null;
  return <div className="kpis">{liste.map((k) => <Kpi key={k.cle} kpi={k} naviguer={naviguer} periode={periode} />)}</div>;
}

const NIVEAUX = { critique: ['Urgent', 'alerte'], alerte: ['À traiter', 'alerte'], info: ['À noter', 'activite'] };

export function ASurveiller({ elements, naviguer, avecModule, titre = 'À surveiller' }) {
  const formater = useFormat();
  return (
    <section className="carte cockpit-attention">
      <div className="titre-ligne"><h2>{titre}</h2>{elements.length > 0 && <span className="onglet-compteur">{elements.length}</span>}</div>
      {elements.length === 0 ? (
        <p className="cockpit-rien"><Icone nom="coche" /> Rien à signaler sur vos applications.</p>
      ) : (
        <ul className="attention-liste">
          {elements.map((a) => (
            <li key={`${a.domaine ?? ''}-${a.cle}`}>
              <button type="button" className={`attention niveau-${a.niveau}`} onClick={a.route ? () => naviguer(a.route) : undefined} disabled={!a.route}>
                <span className="attention-icone"><Icone nom={NIVEAUX[a.niveau]?.[1] ?? 'alerte'} taille={16} /></span>
                <span className="attention-texte">
                  <strong>{a.titre}</strong>
                  <small>{[NIVEAUX[a.niveau]?.[0], avecModule && a.module, a.detail].filter(Boolean).join(' · ')}</small>
                </span>
                <span className="attention-nombre">{formater(a.nombre, 'nombre')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ActionsRapides({ domaines, naviguer, limite }) {
  const { peut } = useEspace();
  const vues = new Set();
  const actions = domaines.flatMap((d) => actionsDomaine(d, peut)).filter((a) => !vues.has(a.route) && vues.add(a.route));
  const liste = limite ? actions.filter((a) => a.principal).concat(actions.filter((a) => !a.principal)).slice(0, limite) : actions;
  if (!liste.length) return null;
  return (
    <div className="actions-rapides" aria-label="Actions rapides">
      {liste.map((a) => <Bouton key={a.route} icone={a.icone} variante={a.principal ? 'principal' : undefined} onClick={() => naviguer(a.route)}>{a.libelle}</Bouton>)}
    </div>
  );
}

function libellePoint(p) {
  return MODES_PAIEMENT[p.cle] ?? p.libelle;
}

export function Graphique({ g, naviguer }) {
  const formater = useFormat();
  const points = g.points ?? [];
  if (g.type === 'barres') {
    if (!points.some((p) => Number(p.valeur) > 0)) return null;
    return (
      <section className="carte">
        <div className="titre-ligne"><h2>{g.titre}</h2></div>
        <GraphiqueBarres
          donnees={points.map((p) => ({ libelle: p.libelle, valeur: Number(p.valeur), titre: `${p.libelle} : ${formater(p.valeur, g.format)}` }))}
          libelle={g.titre}
        />
      </section>
    );
  }
  if (g.type === 'grille') return <GrilleAffluence g={g} formater={formater} />;
  const total = points.reduce((s, p) => s + (Number(p.valeur) || 0), 0);
  if (total <= 0) return null;
  const max = Math.max(...points.map((p) => Number(p.valeur) || 0));
  return (
    <section className="carte">
      <div className="titre-ligne"><h2>{g.titre}</h2></div>
      <ul className="cockpit-repartition">
        {points.map((p) => (
          <li key={p.libelle}>
            <button type="button" className="repartition-ligne" onClick={p.route ? () => naviguer(p.route) : undefined} disabled={!p.route}>
              <span className="repartition-libelle">{libellePoint(p)}</span>
              <span className="repartition-valeur">{formater(p.valeur, g.format)} <small>{Math.round((100 * (Number(p.valeur) || 0)) / total)} %</small></span>
              <span className="repartition-barre" aria-hidden="true"><span style={{ width: `${Math.max(2, (100 * (Number(p.valeur) || 0)) / max)}%` }} /></span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Affluence jour × heure : une case par jour de la semaine et par heure, plus foncée quand on vend plus.
function GrilleAffluence({ g, formater }) {
  const points = g.points ?? [];
  const max = Math.max(0, ...points.map((p) => Number(p.valeur) || 0));
  if (max <= 0) return null;
  // Toutes les heures entre la première et la dernière vendue (rang 0 = 6 h), sans trou dans la grille.
  const rangs = points.map((p) => Number(p.rang));
  const colonnes = [];
  for (let r = Math.min(...rangs); r <= Math.max(...rangs); r += 1) colonnes.push([r, `${(r + 6) % 24} h`]);
  const valeurs = new Map(points.map((p) => [`${p.ligne}|${p.rang}`, Number(p.valeur) || 0]));
  return (
    <section className="carte">
      <div className="titre-ligne"><h2>{g.titre}</h2></div>
      <div className="cockpit-grille-affluence-conteneur">
        <table className="cockpit-affluence">
          <thead><tr><th scope="col"><span className="lecteur-ecran">Jour</span></th>{colonnes.map(([rang, nom]) => <th key={rang} scope="col">{nom.replace(' h', 'h')}</th>)}</tr></thead>
          <tbody>
            {(g.lignes ?? []).map((jour, i) => (
              <tr key={jour}>
                <th scope="row">{jour}</th>
                {colonnes.map(([rang, nom]) => {
                  const v = valeurs.get(`${i}|${rang}`) ?? 0;
                  return (
                    <td key={rang} title={`${jour} ${nom} : ${formater(v, g.format)}`} style={{ '--intensite': v > 0 ? 0.12 + 0.88 * (v / max) : 0 }}>
                      <span className="lecteur-ecran">{`${jour} ${nom} : ${formater(v, g.format)}`}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="texte-faible cockpit-note">Plus la case est foncée, plus le chiffre d’affaires de ce créneau est élevé (cumul sur la période).</p>
    </section>
  );
}

export function ListeCockpit({ liste, naviguer }) {
  const formater = useFormat();
  return (
    <section className="carte">
      <div className="titre-ligne">
        <h2>{liste.titre}</h2>
        {liste.route && <button type="button" className="lien" onClick={() => naviguer(liste.route)}>Tout voir</button>}
      </div>
      <ul className="cockpit-liste">
        {liste.lignes.map((l, i) => (
          <li key={`${l.libelle}-${i}`}>
            <button type="button" onClick={l.route ? () => naviguer(l.route) : undefined} disabled={!l.route}>
              <span><strong>{l.libelle}</strong>{l.detail && <small>{l.detail}</small>}</span>
              {l.valeur != null && <span className="cockpit-liste-valeur">{formater(l.valeur, l.format)}</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Activite({ elements, naviguer, avecModule }) {
  const formater = useFormat();
  if (!elements.length) return null;
  return (
    <section className="carte">
      <div className="titre-ligne"><h2>Activité récente</h2></div>
      <ul className="cockpit-liste activite">
        {elements.map((a, i) => (
          <li key={`${a.quand}-${i}`}>
            <button type="button" onClick={a.route ? () => naviguer(a.route) : undefined} disabled={!a.route}>
              <span>
                <strong>{a.titre}</strong>
                <small>{[formatDateHeure(a.quand), avecModule && a.module, a.detail].filter(Boolean).join(' · ')}</small>
              </span>
              {a.montant != null && <span className="cockpit-liste-valeur">{formater(a.montant, 'montant')}</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
