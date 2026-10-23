// Rapport d'activité sur UNE page A4 (demande de Juste, 2026-10-23) : journalier, hebdomadaire, mensuel ou période
// libre. L'écran montre la page telle qu'elle sera imprimée ; « Télécharger le PDF » ouvre l'impression du navigateur
// (« Enregistrer au format PDF »), comme les factures et les relevés. Les chiffres viennent de analyse_commerce.
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { nomUtilisateur, useEspace } from '../../noyau/espace.jsx';
import { dateLocale, formatQuantite } from '../../noyau/format.js';
import { Bouton, Champ, Erreur, PageHeader, Squelette } from '../../ui/composants.jsx';
import { dateRapportParDefaut } from '../cloture/rapportDuSoir.js';
import { bornesRapport, JOURS_COURTS, nomFichierRapport, titreRapport, TYPES_RAPPORT } from './analyses.js';
import { useAnalyse } from './Analyses.jsx';

const CLE = 'ae-rapport-choix';

function lireChoix() {
  try { return JSON.parse(localStorage.getItem(CLE) ?? 'null') ?? {}; } catch { return {}; }
}

export default function Rapport({ naviguer, filtres }) {
  const espace = useEspace();
  const { etablissement, utilisateur } = espace;
  const memoire = lireChoix();
  const [type, setType] = useState(TYPES_RAPPORT.some(([id]) => id === memoire.type) ? memoire.type : 'jour');
  const [choix, setChoix] = useState({ jour: dateRapportParDefaut(), mois: dateRapportParDefaut().slice(0, 7), du: dateRapportParDefaut(), au: dateRapportParDefaut() });
  const [impression, setImpression] = useState(false);
  const { du, au, fin } = bornesRapport(type, choix, dateLocale(0));
  const { a, chargement, erreur } = useAnalyse(du, au, filtres);
  const changer = (x) => setChoix((c) => ({ ...c, ...x }));
  const choisirType = (t) => { setType(t); try { localStorage.setItem(CLE, JSON.stringify({ type: t })); } catch { /* stockage indisponible */ } };
  const nom = etablissement.marque?.documents?.nom_commercial ?? etablissement.nom;

  useEffect(() => {
    if (!impression) return undefined;
    const titre = document.title;
    const fin2 = () => { document.body.classList.remove('impression-rapport'); document.title = titre; setImpression(false); };
    document.body.classList.add('impression-rapport');
    // Le titre de la page devient le nom proposé pour le fichier PDF.
    document.title = nomFichierRapport(type, du, au, nom);
    window.addEventListener('afterprint', fin2);
    const minuterie = setTimeout(() => { window.print(); if (!('onafterprint' in window)) fin2(); }, 80);
    return () => { clearTimeout(minuterie); window.removeEventListener('afterprint', fin2); document.body.classList.remove('impression-rapport'); document.title = titre; };
  }, [impression, type, du, au, nom]);

  return (
    <div className="page rapport-ecran">
      <PageHeader titre="Rapport d’activité" sousTitre="Une page A4 : à imprimer, à enregistrer en PDF, à envoyer au gérant"
        actions={<>
          <Bouton icone="retour" onClick={() => naviguer('tableau-de-bord')}>Tableau de bord</Bouton>
          <Bouton icone="telecharger" variante="principal" disabled={!a} onClick={() => setImpression(true)}>Télécharger le PDF</Bouton>
        </>} />
      <div className="carte rapport-choix">
        <div className="cockpit-periodes" role="tablist" aria-label="Type de rapport">
          {TYPES_RAPPORT.map(([id, libelle]) => (
            <button key={id} type="button" role="tab" aria-selected={type === id} className={type === id ? 'actif' : ''} onClick={() => choisirType(id)}>{libelle}</button>
          ))}
        </div>
        <div className="rapport-dates">
          {(type === 'jour' || type === 'semaine') && (
            <Champ libelle={type === 'jour' ? 'Jour' : 'Un jour de la semaine'}><input type="date" value={choix.jour} onChange={(e) => e.target.value && changer({ jour: e.target.value })} /></Champ>
          )}
          {type === 'mois' && <Champ libelle="Mois"><input type="month" value={choix.mois} onChange={(e) => e.target.value && changer({ mois: e.target.value })} /></Champ>}
          {type === 'libre' && (
            <>
              <Champ libelle="Du"><input type="date" value={choix.du} max={choix.au} onChange={(e) => e.target.value && changer({ du: e.target.value })} /></Champ>
              <Champ libelle="Au"><input type="date" value={choix.au} min={choix.du} onChange={(e) => e.target.value && changer({ au: e.target.value })} /></Champ>
            </>
          )}
        </div>
        <p className="texte-faible">Astuce : dans la fenêtre d’impression, choisissez « Enregistrer au format PDF ». Le fichier peut ensuite être envoyé par WhatsApp ou par e-mail.</p>
      </div>
      <Erreur message={erreur} />
      {chargement && !a && <Squelette lignes={8} />}
      {a && (
        <div className="rapport-apercu">
          <PageRapport a={a} type={type} du={du} au={au} fin={fin} espace={espace} auteur={nomUtilisateur(utilisateur)} />
        </div>
      )}
      {a && impression && createPortal(
        <div className="rapport-zone"><PageRapport a={a} type={type} du={du} au={au} fin={fin} espace={espace} auteur={nomUtilisateur(utilisateur)} /></div>,
        document.body
      )}
    </div>
  );
}

// Mini-graphique : par heure pour un jour, par jour jusqu'à 45 jours, par semaine au-delà. La pointe est en couleur.
function series(a, type) {
  if (type === 'jour' || a.periode.jours === 1) return { titre: 'Chiffre d’affaires par heure', points: a.heures.map((h) => ({ libelle: `${h.heure}h`, valeur: h.chiffre, nom: `${h.heure} h` })) };
  if (a.jours.length <= 45) {
    return {
      titre: 'Chiffre d’affaires par jour',
      points: a.jours.map((j) => {
        const d = new Date(`${j.jour}T12:00:00`);
        return { libelle: a.jours.length <= 8 ? JOURS_COURTS[(d.getDay() + 6) % 7] : j.jour.slice(8, 10), valeur: j.chiffre, nom: d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' }) };
      }),
    };
  }
  const semaines = [];
  a.jours.forEach((j, i) => {
    if (i % 7 === 0) semaines.push({ libelle: `${j.jour.slice(8, 10)}/${j.jour.slice(5, 7)}`, valeur: 0, nom: `semaine du ${j.jour.slice(8, 10)}/${j.jour.slice(5, 7)}` });
    semaines[semaines.length - 1].valeur += j.chiffre;
  });
  return { titre: 'Chiffre d’affaires par semaine', points: semaines };
}

function MiniGraphique({ points, montant }) {
  const largeur = 330;
  const hauteur = 118;
  const max = Math.max(...points.map((p) => p.valeur), 0);
  if (!points.length || max <= 0) return <p className="rapport-vide">Aucune vente sur la période.</p>;
  const pas = largeur / points.length;
  const barre = Math.max(2, Math.min(pas - 3, 26));
  const pic = points.reduce((x, y) => (y.valeur > x.valeur ? y : x));
  const tous = Math.max(1, Math.ceil(18 / pas));
  return (
    <>
      <svg className="rapport-graphique" viewBox={`0 0 ${largeur} ${hauteur + 14}`} role="img" aria-label={points.map((p) => `${p.nom} ${montant(p.valeur)}`).join(', ')}>
        <line x1="0" x2={largeur} y1={hauteur} y2={hauteur} className="rapport-axe" />
        {points.map((p, i) => {
          const h = (p.valeur / max) * (hauteur - 6);
          return (
            <g key={`${p.libelle}-${i}`}>
              <rect x={i * pas + (pas - barre) / 2} y={hauteur - h} width={barre} height={Math.max(h, p.valeur > 0 ? 1 : 0)} rx="2" className={p === pic ? 'pic' : ''} />
              {(i % tous === 0 || p === pic) && <text x={i * pas + pas / 2} y={hauteur + 11} textAnchor="middle">{p.libelle}</text>}
            </g>
          );
        })}
      </svg>
      <p className="rapport-legende">Pointe : <strong>{pic.nom}</strong> ({montant(pic.valeur)})</p>
    </>
  );
}

function Variation({ k }) {
  if (k.variation == null) return <span className="rapport-var neutre">—</span>;
  return <span className={`rapport-var ${k.favorable === true ? 'bon' : k.favorable === false ? 'mauvais' : 'neutre'}`}>{k.variation > 0 ? '▲' : k.variation < 0 ? '▼' : '='} {k.variation > 0 ? '+' : k.variation < 0 ? '−' : ''}{Math.abs(k.variation)} %</span>;
}

export function PageRapport({ a, type, du, au, fin, espace, auteur, edition = new Date() }) {
  const { etablissement, montant } = espace;
  const doc = etablissement.marque?.documents ?? {};
  const logo = etablissement.identite?.logo_url || doc.logo_url || etablissement.marque?.logo_url || null;
  const nom = doc.nom_commercial ?? etablissement.nom;
  const z = a.ticketZ;
  const g = series(a, type);
  const valeur = (k) => (k.valeur == null ? 'Non calculé' : k.format === 'montant' ? montant(k.valeur) : formatQuantite(k.valeur));
  const ecart = (e) => (e == null ? '—' : e === 0 ? 'aucun' : e < 0 ? `manque ${montant(-e)}` : `${montant(e)} en trop`);
  const q = (x) => formatQuantite(x);
  const top = a.top.slice(0, 8);
  const equipe = a.equipe.slice(0, 8);
  return (
    <article className="rapport-a4" aria-label="Rapport A4">
      <header className="rapport-tete">
        <div className="rapport-identite">
          {logo ? <img src={logo} alt="" className="rapport-logo" /> : <span className="rapport-logo-texte">{nom.slice(0, 2).toUpperCase()}</span>}
          <div>
            <strong className="rapport-nom">{nom}</strong>
            {(doc.adresse || doc.telephone) && <span>{[doc.adresse, doc.telephone && `Tél. ${doc.telephone}`].filter(Boolean).join(' · ')}</span>}
          </div>
        </div>
        <div className="rapport-titre">
          <strong>{titreRapport(type, du, au, fin)}</strong>
          <span>Édité le {edition.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}{auteur ? ` par ${auteur}` : ''}</span>
          {au < fin && <span>Période en cours : chiffres arrêtés à aujourd’hui</span>}
          {!a.portee.tous && <span>Rapport personnel : {a.portee.personne ?? 'mes ventes'}</span>}
        </div>
      </header>

      <p className="rapport-resume">{a.resume}</p>

      <section className="rapport-kpis">
        {a.kpis.map((k) => (
          <div key={k.cle} className="rapport-kpi">
            <span className="rapport-kpi-libelle">{k.libelle}</span>
            <strong>{valeur(k)}</strong>
            <span className="rapport-kpi-pied"><Variation k={k} />{k.precedent != null && k.valeur != null && <small>avant : {k.format === 'montant' ? montant(k.precedent) : q(k.precedent)}</small>}</span>
          </div>
        ))}
      </section>

      <div className="rapport-deux">
        <section className="rapport-bloc">
          <h3>Ticket Z consolidé</h3>
          <table className="rapport-table rapport-z">
            <tbody>
              <tr><th>Ventes brutes</th><td>{montant(z.brutes)}</td></tr>
              <tr><th>Remises</th><td>− {montant(z.remises)}</td></tr>
              <tr className="fort"><th>Ventes nettes ({a.kpis[1].valeur} tickets)</th><td>{montant(z.nettes)}</td></tr>
              <tr><th>Annulations ({z.nombreAnnulations})</th><td>{montant(z.annulations)}</td></tr>
              {z.remboursements > 0 && <tr><th>Remboursements</th><td>{montant(z.remboursements)}</td></tr>}
              {z.paiements.map((p) => <tr key={p.mode} className="retrait"><th>{p.libelle}</th><td>{montant(p.montant)}</td></tr>)}
              {z.encaisse != null && <tr className="fort"><th>Encaissé</th><td>{montant(z.encaisse)}</td></tr>}
              {z.credit > 0 && <tr><th>Vendu à crédit (non soldé)</th><td>{montant(z.credit)}</td></tr>}
              {z.nombreZ > 0 ? (
                <>
                  <tr><th>Espèces attendues / comptées</th><td>{montant(z.especesAttendues)} / {montant(z.especesComptees)}</td></tr>
                  <tr className={z.ecart ? 'alerte' : ''}><th>Écart de caisse ({z.nombreZ} ticket{z.nombreZ > 1 ? 's' : ''} Z)</th><td>{ecart(z.ecart)}</td></tr>
                </>
              ) : <tr><th>Tickets Z</th><td>aucun tiré</td></tr>}
            </tbody>
          </table>
        </section>
        <section className="rapport-bloc">
          <h3>{g.titre}</h3>
          <MiniGraphique points={g.points} montant={montant} />
          <ul className="rapport-moments">
            {a.meilleureHeure && <li>Heure de pointe : <strong>{a.meilleureHeure.heure} h</strong> ({montant(a.meilleureHeure.chiffre)})</li>}
            {a.meilleurJour && type !== 'jour' && <li>Meilleur jour : <strong>{a.meilleurJour.nom.toLowerCase()}</strong> ({montant(a.meilleurJour.moyenne)} en moyenne)</li>}
            {a.creux && <li>Heures creuses : {a.creux.de} h – {a.creux.a} h ({a.creux.part} % du chiffre)</li>}
            {a.paiements.length > 0 && <li>Paiement le plus utilisé : {a.paiements[0].libelle} ({a.paiements[0].part} %)</li>}
          </ul>
        </section>
      </div>

      <div className="rapport-deux">
        <section className="rapport-bloc">
          <h3>Meilleures ventes</h3>
          <table className="rapport-table">
            <thead><tr><th>Produit</th><th>Qté</th><th>CA</th><th>Stock auj.</th><th>Rupture</th></tr></thead>
            <tbody>
              {top.map((l) => (
                <tr key={l.id ?? l.libelle} className={l.aCommander ? 'alerte' : ''}>
                  <th>{l.libelle}</th><td>{q(l.quantite)}</td><td>{montant(l.chiffre)}</td>
                  <td>{l.stock == null ? '—' : q(l.stock)}</td>
                  <td>{l.joursRestants == null ? '—' : l.epuise ? 'épuisé' : l.joursRestants === 0 ? '< 1 j' : l.joursRestants > 90 ? '> 90 j' : `${l.joursRestants} j`}</td>
                </tr>
              ))}
              {!top.length && <tr><td colSpan={5}>Aucune vente.</td></tr>}
            </tbody>
          </table>
          {a.flop.length > 0 && <p className="rapport-note">Moins vendus : {a.flop.slice(0, 3).map((l) => `${l.libelle} (${q(l.quantite)})`).join(', ')}.</p>}
        </section>
        <section className="rapport-bloc">
          <h3>Ventes par personne</h3>
          <table className="rapport-table rapport-serre">
            <thead><tr><th>Personne</th><th>Tickets</th><th>CA</th><th>Panier</th><th>Annul.</th><th>Écart</th></tr></thead>
            <tbody>
              {equipe.map((e) => (
                <tr key={e.id} className={e.ecart ? 'alerte' : ''}>
                  <th>{e.nom}</th><td>{e.tickets}</td><td>{montant(e.chiffre)}</td><td>{e.tickets ? montant(e.panier) : '—'}</td>
                  <td>{e.annulations || '—'}</td><td>{e.ecart == null ? '—' : e.ecart === 0 ? '0' : montant(e.ecart)}</td>
                </tr>
              ))}
              {!equipe.length && <tr><td colSpan={6}>Aucune vente.</td></tr>}
            </tbody>
          </table>
          {a.categories.length > 1 && <p className="rapport-note">Par catégorie : {a.categories.slice(0, 4).map((c) => `${c.libelle} ${c.part} %`).join(' · ')}.</p>}
        </section>
      </div>

      <div className="rapport-bas">
        <section className="rapport-bloc">
          <h3>Argent</h3>
          <table className="rapport-table rapport-z">
            <tbody>
              <tr><th>Ventes nettes</th><td>{montant(z.nettes)}</td></tr>
              <tr><th>Marge brute</th><td>{a.margeCalculee ? montant(a.kpis[3].valeur) : 'non calculé'}</td></tr>
              <tr><th>Dépenses</th><td>{a.depenses == null ? 'non suivi' : montant(a.depenses)}</td></tr>
              <tr className="fort"><th>Résultat simple</th><td>{a.resultat == null ? 'non calculé' : montant(a.resultat)}</td></tr>
              {a.credits && <tr><th>Crédits clients (toutes dates)</th><td>{montant(a.credits.montant)}</td></tr>}
              {a.stock && a.stock.dormants > 0 && <tr><th>Stock dormant ({a.stock.dormants})</th><td>{montant(a.stock.dormants_valeur)}</td></tr>}
            </tbody>
          </table>
          {!a.margeCalculee && <p className="rapport-note">Marge et résultat : prix d’achat manquants sur trop d’articles.</p>}
        </section>
        <section className="rapport-bloc rapport-attention">
          <h3>3 points d’attention</h3>
          <ol>
            {a.attention.map((p) => <li key={p.texte} className={`niveau-${p.niveau}`}>{p.texte}</li>)}
          </ol>
        </section>
      </div>

      <footer className="rapport-pied">
        <span>{a.periode.comparable ? `Flèches : ${a.periode.comparaison} (du ${new Date(`${a.periode.du_precedent}T12:00:00`).toLocaleDateString('fr-FR')} au ${new Date(`${a.periode.au_precedent}T12:00:00`).toLocaleDateString('fr-FR')}).` : 'Pas de comparaison : la période d’avant n’a pas assez de données.'} Un service compte pour le jour où la caisse a été ouverte.</span>
        <span>{espace.etablissement.marque?.nom_logiciel ?? 'Agence Elite'} · page 1/1</span>
      </footer>
    </article>
  );
}
