import React, { lazy, Suspense } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { Badge, Bouton, EmptyState, Erreur, Icone, PageHeader, Squelette } from '../../ui/composants.jsx';
import { widgetsAccessibles } from '../index.js';
import { dateLocale } from '../../noyau/format.js';
import { dateRapportParDefaut } from '../cloture/rapportDuSoir.js';
import { BandeauDirect, VueEquipe, VueProduits, VueVentes } from './Analyses.jsx';
import { Activite, ActionsRapides, ASurveiller, BarrePeriode, Graphique, GrilleKpis, Kpi, libellePeriode, ListeCockpit, useFiltresCockpit } from './cockpit.jsx';
import { DOMAINES } from './domaines.js';

const Rapport = lazy(() => import('./Rapport.jsx'));

// Onglets d'analyse (2026-10-23) : présents dès que l'utilisateur voit le domaine Commerce (ventes.lire).
const ANALYSES = [
  ['ventes', 'Ventes', 'ventes', VueVentes],
  ['produits', 'Produits et clients', 'articles', VueProduits],
  ['equipe', 'Personnel', 'membres', VueEquipe],
];

// Tableau de bord : vue d'ensemble de l'établissement (#/tableau-de-bord), onglets d'analyse des ventes
// (#/tableau-de-bord/ventes, produits, equipe), rapport A4 (#/tableau-de-bord/rapport) et un tableau par
// domaine (#/tableau-de-bord/<domaine>). Tout vient des fonctions cockpit_* et analyse_commerce de la base,
// qui n'agrègent que les modules actifs et autorisés (docs/TABLEAUX_DE_BORD.md).
export default function TableauDeBord({ naviguer, sousRoute }) {
  const { api, etablissement, peut } = useEspace();
  const domaine = (sousRoute ?? '').split('/')[0] || null;
  const f = useFiltresCockpit();
  const { donnees: domaines, erreur: erreurDomaines } = useDonnees(
    () => api.rpc('cockpit_domaines', { p_etablissement_id: etablissement.id }),
    [etablissement.id]
  );
  const analyses = Boolean(domaines?.some((d) => d.id === 'commerce'));
  const connu = domaine && domaines?.some((d) => d.id === domaine);
  const analyse = analyses ? ANALYSES.find(([id]) => id === domaine) : null;
  // Le rapport est pour le patron (qui voit toutes les caisses) ; la caissière a son ticket Z (demande de Juste, 2026-10-23).
  if (analyses && domaine === 'rapport' && peut('cloture.cloturer')) {
    return <Suspense fallback={<Squelette lignes={8} />}><Rapport naviguer={naviguer} filtres={f.filtres} /></Suspense>;
  }
  const actif = analyse ? domaine : connu ? domaine : null;
  return (
    <div className="page cockpit">
      <Erreur message={erreurDomaines} />
      {domaines && (domaines.length > 1 || analyses) && <OngletsDomaines domaines={domaines} actif={actif} analyses={analyses} naviguer={naviguer} />}
      {domaines && analyse && <VueAnalyse onglet={analyse} f={f} naviguer={naviguer} />}
      {domaines && !analyse && (connu
        ? <VueDomaine domaine={domaine} titre={domaines.find((d) => d.id === domaine).titre} f={f} naviguer={naviguer} />
        : <VueGlobale domaines={domaines} f={f} naviguer={naviguer} jour={analyses ? dateRapportParDefaut() : null} />)}
      {!domaines && !erreurDomaines && <Squelette lignes={6} />}
    </div>
  );
}

function BoutonRapport({ naviguer }) {
  const { peut } = useEspace();
  if (!peut('cloture.cloturer')) {
    return peut('caisse.utiliser') ? <Bouton icone="cloture" variante="principal" onClick={() => naviguer('clotures')}>Mon ticket Z</Bouton> : null;
  }
  return <Bouton icone="telecharger" onClick={() => naviguer('tableau-de-bord/rapport')}>Télécharger le rapport</Bouton>;
}

function OngletsDomaines({ domaines, actif, analyses, naviguer }) {
  return (
    <nav className="cockpit-onglets" aria-label="Tableaux de bord">
      <button type="button" className={!actif ? 'actif' : ''} aria-current={!actif ? 'page' : undefined} onClick={() => naviguer('tableau-de-bord')}>
        <Icone nom={analyses ? 'horloge' : 'tableau'} taille={15} /> {analyses ? 'Aujourd’hui' : 'Vue d’ensemble'}
      </button>
      {analyses && ANALYSES.map(([id, titre, icone]) => (
        <button key={id} type="button" className={actif === id ? 'actif' : ''} aria-current={actif === id ? 'page' : undefined} onClick={() => naviguer(`tableau-de-bord/${id}`)}>
          <Icone nom={icone} taille={15} /> {titre}
        </button>
      ))}
      {domaines.map((d) => (
        <button key={d.id} type="button" className={actif === d.id ? 'actif' : ''} aria-current={actif === d.id ? 'page' : undefined} onClick={() => naviguer(`tableau-de-bord/${d.id}`)}>
          <Icone nom={DOMAINES[d.id]?.icone ?? 'tableau'} taille={15} /> {analyses && d.id === 'commerce' ? 'Tous les chiffres' : d.titre}
        </button>
      ))}
    </nav>
  );
}

function VueAnalyse({ onglet: [, titre, , Vue], f, naviguer }) {
  const espace = useEspace();
  return (
    <>
      <PageHeader titre={titre} sousTitre={portee(espace, f)} actions={<BoutonRapport naviguer={naviguer} />} />
      <BarrePeriode f={f} />
      <Vue f={f} naviguer={naviguer} />
    </>
  );
}

function portee(espace, f) {
  const { multiHub, hubs, etablissement } = espace;
  const nom = etablissement.marque?.documents?.nom_commercial ?? etablissement.nom;
  if (!multiHub) return nom;
  return `${nom} · ${hubs.find((h) => h.id === f.hubId)?.nom ?? 'Tous les Hubs'}`;
}

// jour : onglet « Aujourd'hui » (tableau du service en cours, avant 6 h celui de la veille), sans choix de période.
function VueGlobale({ domaines, f: periode, naviguer, jour }) {
  const espace = useEspace();
  const f = jour ? { ...periode, periode: jour === dateLocale(0) ? 'jour' : 'perso', du: jour, au: jour, cle: `${jour}|${jour}|${JSON.stringify(periode.filtres)}` } : periode;
  const { api, etablissement } = espace;
  const { donnees: c, chargement, erreur } = useDonnees(
    () => api.rpc('cockpit_etablissement', { p_etablissement_id: etablissement.id, p_du: f.du, p_au: f.au, p_filtres: f.filtres }),
    [etablissement.id, f.cle]
  );
  const extras = c ? widgetsAccessibles(espace, 'section', { cockpit: c, du: f.du, au: f.au }) : [];
  // Un seul domaine (ex. un bar) : le bandeau montre ses indicateurs clés (jusqu'à 5) et la carte ne les répète pas.
  const seul = (c?.domaines ?? []).length === 1;
  const principaux = (c?.domaines ?? []).flatMap((d) => d.kpis.slice(0, seul ? 5 : 1).map((k) => ({ ...k, cle: `${d.id}.${k.cle}`, libelle: domaines.length > 1 ? `${k.libelle} · ${d.titre}` : k.libelle }))).slice(0, seul ? 5 : 4);
  return (
    <>
      <PageHeader titre="Tableau de bord" sousTitre={portee(espace, f)} actions={<>{jour && <BoutonRapport naviguer={naviguer} />}<ActionsRapides domaines={domaines.map((d) => d.id)} naviguer={naviguer} limite={jour ? 2 : 3} /></>} />
      <BarrePeriode f={f} sansPeriodes={Boolean(jour)} />
      {jour && <BandeauDirect du={jour} filtres={f.filtres} />}
      {chargement && !c && <Squelette lignes={6} />}
      <Erreur message={erreur} />
      {c && (
        <>
          {c.erreurs?.length > 0 && <p className="texte-doux">Certaines informations n’ont pas pu être chargées : {c.erreurs.join(', ')}.</p>}
          {domaines.length === 0 && <EmptyState icone="tableau" titre="Aucun indicateur pour vos applications" texte="Les indicateurs apparaissent avec les applications activées et vos droits." />}
          {principaux.length > 0 && <div className="kpis kpis-hero">{principaux.map((k, i) => <Kpi key={k.cle} kpi={k} naviguer={naviguer} mis_en_avant={i === 0} periode={libellePeriode(f)} />)}</div>}
          <div className="cockpit-grille">
            <ASurveiller elements={c.attention} naviguer={naviguer} avecModule={domaines.length > 1} />
            <Activite elements={c.activite} naviguer={naviguer} avecModule={domaines.length > 1} />
          </div>
          {c.tendance && <Graphique g={c.tendance} naviguer={naviguer} />}
          {c.domaines.length > 0 && (
            <div className="cockpit-domaines">
              {c.domaines.map((d) => (
                <section key={d.id} className="carte cockpit-domaine">
                  <div className="titre-ligne">
                    <h2><Icone nom={DOMAINES[d.id]?.icone ?? 'tableau'} taille={16} /> {d.titre}</h2>
                    {d.attention > 0 && <Badge ton="attention">{d.attention} à surveiller</Badge>}
                  </div>
                  {!seul && <GrilleKpis kpis={d.kpis} naviguer={naviguer} max={3} periode={libellePeriode(f)} />}
                  {!seul && d.kpis.length === 0 && <p className="texte-doux">Rien sur la période.</p>}
                  <Bouton icone="chevron" onClick={() => naviguer(`tableau-de-bord/${d.id}`)}>Tableau {d.titre}</Bouton>
                </section>
              ))}
            </div>
          )}
          {extras.map((w) => { const W = w.composant; return <Suspense key={w.id} fallback={null}><W cockpit={c} espace={espace} naviguer={naviguer} du={f.du} au={f.au} /></Suspense>; })}
        </>
      )}
    </>
  );
}

function VueDomaine({ domaine, titre, f, naviguer }) {
  const espace = useEspace();
  const { api, etablissement } = espace;
  const { donnees: d, chargement, erreur } = useDonnees(
    () => api.rpc(`cockpit_${domaine}`, { p_etablissement_id: etablissement.id, p_du: f.du, p_au: f.au, p_filtres: f.filtres }),
    [etablissement.id, domaine, f.cle]
  );
  const vide = d && !d.kpis.length && !d.attention.length;
  return (
    <>
      <PageHeader titre={`Tableau ${titre}`} sousTitre={DOMAINES[domaine]?.sousTitre ?? portee(espace, f)} actions={<ActionsRapides domaines={[domaine]} naviguer={naviguer} limite={2} />} />
      <BarrePeriode f={f} filtresAvances={domaine === 'commerce'} />
      {chargement && !d && <Squelette lignes={6} />}
      <Erreur message={erreur} />
      {vide && <EmptyState icone="tableau" titre="Pas encore de données" texte="Les indicateurs apparaîtront dès les premières opérations." />}
      {d && !vide && (
        <>
          <GrilleKpis kpis={d.kpis} naviguer={naviguer} periode={libellePeriode(f)} />
          {d.periode && d.periode.comparable === false && d.periode.du_precedent && (
            <p className="texte-faible cockpit-note">Pas de comparaison : il n’y a pas assez de ventes avant pour comparer.</p>
          )}
          {d.periode?.regle_jour && <p className="texte-faible cockpit-note">{d.periode.regle_jour}</p>}
          <div className="cockpit-grille">
            <ASurveiller elements={d.attention} naviguer={naviguer} />
            <section className="carte">
              <div className="titre-ligne"><h2>Actions rapides</h2></div>
              <ActionsRapides domaines={[domaine]} naviguer={naviguer} />
            </section>
          </div>
          {d.graphiques.map((g) => <Graphique key={g.cle} g={g} naviguer={naviguer} />)}
          {(d.listes.length > 0 || d.activite.length > 0) && (
            <div className="cockpit-colonnes">
              {d.listes.map((l) => <ListeCockpit key={l.cle} liste={l} naviguer={naviguer} />)}
              <Activite elements={d.activite} naviguer={naviguer} />
            </div>
          )}
        </>
      )}
    </>
  );
}
