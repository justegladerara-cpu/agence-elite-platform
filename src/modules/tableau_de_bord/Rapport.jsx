// Rapport des ventes en plusieurs pages A4 (demande de Juste, 2026-10-23 : d'abord une page, puis « mieux organisé et
// détaillé en plusieurs pages ») : du jour, de la semaine, du mois ou dates choisies. L'écran montre la page telle qu'elle sera imprimée ; « Télécharger le PDF » ouvre l'impression du navigateur
// (« Enregistrer au format PDF »), comme les factures et les relevés. Les chiffres viennent de analyse_commerce.
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { nomUtilisateur, useEspace } from '../../noyau/espace.jsx';
import { dateLocale, formatQuantite } from '../../noyau/format.js';
import { Bouton, Champ, Erreur, PageHeader, Squelette } from '../../ui/composants.jsx';
import { jourDeService } from '../cloture/rapportDuSoir.js';
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
  const jour = jourDeService(espace.reglagesFonctions);
  const [choix, setChoix] = useState({ jour, mois: jour.slice(0, 7), du: jour, au: jour });
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
      <PageHeader titre="Rapport des ventes" sousTitre="Plusieurs pages A4, rangées par sujet : à imprimer, à garder en PDF ou à envoyer par WhatsApp"
        actions={<>
          <Bouton icone="retour" onClick={() => naviguer('tableau-de-bord')}>Tableau de bord</Bouton>
          <Bouton icone="telecharger" variante="principal" disabled={!a} onClick={() => setImpression(true)}>Télécharger le PDF</Bouton>
        </>} />
      <div className="carte rapport-choix">
        <div className="cockpit-periodes" role="tablist" aria-label="Quel rapport">
          {TYPES_RAPPORT.map(([id, libelle]) => (
            <button key={id} type="button" role="tab" aria-selected={type === id} className={type === id ? 'actif' : ''} onClick={() => choisirType(id)}>{libelle}</button>
          ))}
        </div>
        <div className="rapport-dates">
          {(type === 'jour' || type === 'semaine') && (
            <Champ libelle={type === 'jour' ? 'Jour' : 'Un jour de la semaine voulue'}><input type="date" value={choix.jour} onChange={(e) => e.target.value && changer({ jour: e.target.value })} /></Champ>
          )}
          {type === 'mois' && <Champ libelle="Mois"><input type="month" value={choix.mois} onChange={(e) => e.target.value && changer({ mois: e.target.value })} /></Champ>}
          {type === 'libre' && (
            <>
              <Champ libelle="Depuis le"><input type="date" value={choix.du} max={choix.au} onChange={(e) => e.target.value && changer({ du: e.target.value })} /></Champ>
              <Champ libelle="Jusqu’au"><input type="date" value={choix.au} min={choix.du} onChange={(e) => e.target.value && changer({ au: e.target.value })} /></Champ>
            </>
          )}
        </div>
        <p className="texte-faible">Pour avoir le fichier PDF : appuyez sur « Télécharger le PDF », puis choisissez « Enregistrer au format PDF ». Vous pouvez ensuite l’envoyer par WhatsApp ou par e-mail.</p>
      </div>
      <Erreur message={erreur} />
      {chargement && !a && <Squelette lignes={8} />}
      {a && (
        <div className="rapport-apercu">
          <PagesRapport a={a} type={type} du={du} au={au} fin={fin} espace={espace} auteur={nomUtilisateur(utilisateur)} />
        </div>
      )}
      {a && impression && createPortal(
        <div className="rapport-zone"><PagesRapport a={a} type={type} du={du} au={au} fin={fin} espace={espace} auteur={nomUtilisateur(utilisateur)} /></div>,
        document.body
      )}
    </div>
  );
}

// Mini-graphique : par heure pour un jour, par jour jusqu'à 45 jours, par semaine au-delà. Le plus haut est en couleur.
function parSemaine(jours) {
  const semaines = [];
  jours.forEach((j, i) => {
    if (i % 7 === 0) semaines.push({ libelle: `${j.jour.slice(8, 10)}/${j.jour.slice(5, 7)}`, valeur: 0, tickets: 0, nom: `semaine du ${j.jour.slice(8, 10)}/${j.jour.slice(5, 7)}` });
    semaines[semaines.length - 1].valeur += j.chiffre;
    semaines[semaines.length - 1].tickets += j.tickets;
  });
  return semaines;
}

function series(a, type) {
  if (type === 'jour' || a.periode.jours === 1) return { titre: 'Ventes heure par heure', points: a.heures.map((h) => ({ libelle: `${h.heure}h`, valeur: h.chiffre, nom: `${h.heure} h` })) };
  if (a.jours.length <= 45) {
    return {
      titre: 'Ventes jour par jour',
      points: a.jours.map((j) => {
        const d = new Date(`${j.jour}T12:00:00`);
        return { libelle: a.jours.length <= 8 ? JOURS_COURTS[(d.getDay() + 6) % 7] : j.jour.slice(8, 10), valeur: j.chiffre, nom: d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' }) };
      }),
    };
  }
  return { titre: 'Ventes semaine par semaine', points: parSemaine(a.jours) };
}

export function MiniGraphique({ points, montant, hauteur = 118 }) {
  const largeur = 330;
  const max = Math.max(...points.map((p) => p.valeur), 0);
  if (!points.length || max <= 0) return <p className="rapport-vide">Aucune vente sur ces dates.</p>;
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
      <p className="rapport-legende">Le plus haut : <strong>{pic.nom}</strong> ({montant(pic.valeur)})</p>
    </>
  );
}

function Variation({ k }) {
  if (k.variation == null) return <span className="rapport-var neutre">—</span>;
  return <span className={`rapport-var ${k.favorable === true ? 'bon' : k.favorable === false ? 'mauvais' : 'neutre'}`}>{k.variation > 0 ? '▲' : k.variation < 0 ? '▼' : '='} {k.variation > 0 ? '+' : k.variation < 0 ? '−' : ''}{Math.abs(k.variation)} %</span>;
}

const finiDans = (l) => (l.joursRestants == null ? '—' : l.epuise ? 'plus de stock' : l.joursRestants === 0 ? 'avant demain' : l.joursRestants > 90 ? 'plus de 90 j' : `${l.joursRestants} j`);

// Une feuille A4 : en-tête (complet sur la page 1, réduit ensuite), contenu, pied avec le numéro de page.
function Feuille({ numero, total, titre, entete, nom, titreRapport: titreR, a, espace, children }) {
  const { etablissement } = espace;
  return (
    <article className="rapport-a4" aria-label={`Rapport page ${numero} sur ${total}`}>
      {numero === 1 ? entete : (
        <header className="rapport-tete reduite">
          <strong>{nom}</strong>
          <span>{titreR}</span>
        </header>
      )}
      <h2 className="rapport-page-titre"><span>{numero}</span> {titre}</h2>
      {children}
      <footer className="rapport-pied">
        <span>{a.periode.comparable ? `Les flèches ▲▼ comparent ${a.periode.comparaison} (du ${new Date(`${a.periode.du_precedent}T12:00:00`).toLocaleDateString('fr-FR')} au ${new Date(`${a.periode.au_precedent}T12:00:00`).toLocaleDateString('fr-FR')}).` : 'Pas de comparaison : il n’y a pas assez de ventes avant pour comparer.'} Les ventes faites après minuit comptent pour le jour où la caisse a été ouverte.</span>
        <span>{etablissement.marque?.nom_logiciel ?? 'Agence Elite'} · page {numero}/{total}</span>
      </footer>
    </article>
  );
}

export function PagesRapport({ a, type, du, au, fin, espace, auteur, edition = new Date() }) {
  const { etablissement, montant } = espace;
  const doc = etablissement.marque?.documents ?? {};
  const logo = etablissement.identite?.logo_url || doc.logo_url || etablissement.marque?.logo_url || null;
  const nom = doc.nom_commercial ?? etablissement.nom;
  const titre = titreRapport(type, du, au, fin);
  const z = a.ticketZ;
  const g = series(a, type);
  const valeur = (k) => (k.valeur == null ? 'Pas calculé' : k.format === 'montant' ? montant(k.valeur) : formatQuantite(k.valeur));
  const ecart = (e) => (e == null ? '—' : e === 0 ? 'rien' : e < 0 ? `il manque ${montant(-e)}` : `${montant(e)} en trop`);
  const q = (x) => formatQuantite(x);
  const vide = <p className="rapport-vide">Aucune vente sur ces dates.</p>;

  const entete = (
    <header className="rapport-tete">
      <div className="rapport-identite">
        {logo ? <img src={logo} alt="" className="rapport-logo" /> : <span className="rapport-logo-texte">{nom.slice(0, 2).toUpperCase()}</span>}
        <div>
          <strong className="rapport-nom">{nom}</strong>
          {(doc.adresse || doc.telephone) && <span>{[doc.adresse, doc.telephone && `Tél. ${doc.telephone}`].filter(Boolean).join(' · ')}</span>}
        </div>
      </div>
      <div className="rapport-titre">
        <strong>{titre}</strong>
        <span>Fait le {edition.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}{auteur ? ` par ${auteur}` : ''}</span>
        {au < fin && <span>Pas encore fini : chiffres jusqu’à aujourd’hui</span>}
        {!a.portee.tous && <span>Seulement les ventes de {a.portee.personne ?? 'moi'}</span>}
      </div>
    </header>
  );

  // Page 1 : l'essentiel.
  const essentiel = (
    <>
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
      <section className="rapport-bloc">
        <h3>{g.titre}</h3>
        <MiniGraphique points={g.points} montant={montant} hauteur={100} />
      </section>
      <div className="rapport-deux">
        <section className="rapport-bloc">
          <h3>Ce qu’il faut savoir</h3>
          <ul className="rapport-moments">
            {a.meilleureHeure && <li>Vous vendez le plus à <strong>{a.meilleureHeure.heure} h</strong> ({montant(a.meilleureHeure.chiffre)})</li>}
            {a.meilleurJour && type !== 'jour' && <li>Le meilleur jour : <strong>{a.meilleurJour.nom.toLowerCase()}</strong> ({montant(a.meilleurJour.moyenne)} en moyenne)</li>}
            {a.creux && <li>Heures calmes : {a.creux.de} h – {a.creux.a} h (seulement {a.creux.part} % des ventes)</li>}
            {a.paiements.length > 0 && <li>Les clients paient surtout en : <strong>{a.paiements[0].libelle}</strong> ({a.paiements[0].part} %)</li>}
            {a.top[0] && <li>Le produit qui rapporte le plus : <strong>{a.top[0].libelle}</strong> ({montant(a.top[0].chiffre)})</li>}
            {a.equipe[0] && a.equipe.length > 1 && <li>A le plus vendu : <strong>{a.equipe[0].nom}</strong> ({montant(a.equipe[0].chiffre)})</li>}
          </ul>
        </section>
        <section className="rapport-bloc rapport-attention">
          <h3>À surveiller</h3>
          <ol>
            {a.attentionToutes.slice(0, 5).map((p) => <li key={p.texte} className={`niveau-${p.niveau}`}>{p.texte}</li>)}
          </ol>
        </section>
      </div>
    </>
  );

  // Page 2 : quand vous vendez.
  const plusieursJours = a.jours.length > 1;
  const lignesJours = a.jours.length > 31 ? parSemaine(a.jours).map((s) => ({ nom: s.nom, chiffre: s.valeur, tickets: s.tickets }))
    : a.jours.map((j) => ({ nom: new Date(`${j.jour}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }), chiffre: j.chiffre, tickets: j.tickets }));
  const temps = (
    <>
      <div className="rapport-deux">
        <section className="rapport-bloc">
          <h3>Heure par heure</h3>
          {a.heures.length ? (
            <table className="rapport-table rapport-serre">
              <thead><tr><th>Heure</th><th>Ventes</th><th>Total</th><th>Par client</th></tr></thead>
              <tbody>
                {a.heures.map((h) => (
                  <tr key={h.heure} className={h === a.meilleureHeure ? 'fort' : ''}><th>{h.heure} h – {(h.heure + 1) % 24} h</th><td>{h.tickets || '—'}</td><td>{h.chiffre ? montant(h.chiffre) : '—'}</td><td>{h.tickets ? montant(h.panier) : '—'}</td></tr>
                ))}
              </tbody>
            </table>
          ) : vide}
        </section>
        <section className="rapport-bloc">
          {plusieursJours ? (
            <>
              <h3>{a.jours.length > 31 ? 'Semaine par semaine' : 'Jour par jour'}</h3>
              <table className="rapport-table rapport-serre">
                <thead><tr><th>{a.jours.length > 31 ? 'Semaine' : 'Jour'}</th><th>Ventes</th><th>Total</th></tr></thead>
                <tbody>
                  {lignesJours.map((j) => <tr key={j.nom} className={a.record && j.chiffre === a.record.chiffre ? 'fort' : ''}><th>{j.nom}</th><td>{j.tickets || '—'}</td><td>{j.chiffre ? montant(j.chiffre) : '—'}</td></tr>)}
                </tbody>
                <tfoot><tr className="fort"><th>Moyenne par jour</th><td></td><td>{montant(a.moyenneJour)}</td></tr></tfoot>
              </table>
            </>
          ) : (
            <>
              <h3>Comment les clients paient</h3>
              <TablePaiements a={a} montant={montant} />
            </>
          )}
          {a.semaine.length > 0 && a.periode.jours >= 7 && (
            <>
              <h3 className="rapport-sous">Selon le jour de la semaine (moyenne)</h3>
              <table className="rapport-table rapport-serre">
                <tbody>{a.semaine.map((d) => <tr key={d.jour_semaine} className={d === a.meilleurJour ? 'fort' : ''}><th>{d.nom}</th><td>{montant(d.moyenne)}</td></tr>)}</tbody>
              </table>
            </>
          )}
        </section>
      </div>
      <p className="rapport-note">En gras : le meilleur moment. Les heures calmes sont un bon moment pour ranger et remplir les rayons.</p>
    </>
  );

  // Page 3 : la caisse et l'argent.
  const caisse = (
    <div className="rapport-deux">
      <div className="rapport-colonne">
        <section className="rapport-bloc">
          <h3>Résumé de la caisse</h3>
          <table className="rapport-table rapport-z">
            <tbody>
              <tr><th>Total avant réductions</th><td>{montant(z.brutes)}</td></tr>
              <tr><th>Réductions données</th><td>− {montant(z.remises)}</td></tr>
              <tr className="fort"><th>Total des ventes ({a.kpis[1].valeur} ventes)</th><td>{montant(z.nettes)}</td></tr>
              <tr><th>Ventes annulées ({z.nombreAnnulations})</th><td>{montant(z.annulations)}</td></tr>
              {z.remboursements > 0 && <tr><th>Argent rendu aux clients</th><td>{montant(z.remboursements)}</td></tr>}
              {z.encaisse != null && <tr className="fort"><th>Argent reçu</th><td>{montant(z.encaisse)}</td></tr>}
              {z.credit > 0 && <tr><th>Vendu à crédit (pas encore payé)</th><td>{montant(z.credit)}</td></tr>}
              {z.nombreZ > 0 ? (
                <>
                  <tr><th>Caisses fermées</th><td>{z.nombreZ}</td></tr>
                  <tr><th>Espèces qu’il devait y avoir</th><td>{montant(z.especesAttendues)}</td></tr>
                  <tr><th>Espèces comptées</th><td>{montant(z.especesComptees)}</td></tr>
                  <tr className={z.ecart ? 'alerte' : ''}><th>Différence</th><td>{ecart(z.ecart)}</td></tr>
                </>
              ) : <tr><th>Caisses fermées</th><td>aucune</td></tr>}
            </tbody>
          </table>
        </section>
        <section className="rapport-bloc">
          <h3>Comment les clients paient</h3>
          <TablePaiements a={a} montant={montant} />
        </section>
      </div>
      <div className="rapport-colonne">
        <section className="rapport-bloc">
          <h3>Ce qu’il reste</h3>
          <table className="rapport-table rapport-z">
            <tbody>
              <tr><th>Total des ventes</th><td>{montant(z.nettes)}</td></tr>
              <tr><th>Bénéfice sur les produits</th><td>{a.margeCalculee ? montant(a.kpis[3].valeur) : 'pas calculé'}</td></tr>
              <tr><th>Dépenses</th><td>{a.depenses == null ? 'pas suivi' : `− ${montant(a.depenses)}`}</td></tr>
              <tr className="fort"><th>Ce qu’il reste</th><td>{a.resultat == null ? 'pas calculé' : montant(a.resultat)}</td></tr>
            </tbody>
          </table>
          <p className="rapport-note">{a.margeCalculee ? 'Bénéfice = prix de vente moins prix d’achat des produits vendus. Ce qu’il reste = bénéfice moins dépenses.' : 'Pas calculé : il manque le prix d’achat de trop de produits. Écrivez-le dans la fiche de chaque produit.'}</p>
        </section>
        {a.depensesCategories.length > 0 && (
          <section className="rapport-bloc">
            <h3>Dépenses par type</h3>
            <table className="rapport-table rapport-z">
              <tbody>{a.depensesCategories.map((d) => <tr key={d.libelle ?? 'autre'}><th>{d.libelle || 'Autre'}</th><td>{montant(d.montant)}</td></tr>)}</tbody>
            </table>
          </section>
        )}
        {(a.credits || (a.stock && a.stock.dormants > 0)) && (
          <section className="rapport-bloc">
            <h3>Argent pas encore rentré</h3>
            <table className="rapport-table rapport-z">
              <tbody>
                {a.credits && <tr><th>Ce que les clients doivent ({a.credits.nombre} vente{a.credits.nombre > 1 ? 's' : ''}, toutes dates)</th><td>{montant(a.credits.montant)}</td></tr>}
                {a.stock && a.stock.dormants > 0 && <tr><th>Bloqué dans des produits qui ne se vendent pas ({a.stock.dormants})</th><td>{montant(a.stock.dormants_valeur)}</td></tr>}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  );

  // Page 4 : les produits.
  const top = a.top.slice(0, 15);
  const produits = (
    <>
      <section className="rapport-bloc">
        <h3>Les produits qui rapportent le plus</h3>
        {top.length ? (
          <table className="rapport-table">
            <thead><tr><th>Produit</th><th>Vendus</th><th>Total</th><th>Part</th>{a.margeCalculee && <th>Bénéfice</th>}<th>En stock</th><th>Sera fini dans</th></tr></thead>
            <tbody>
              {top.map((l) => (
                <tr key={l.id ?? l.libelle} className={l.aCommander ? 'alerte' : ''}>
                  <th>{l.libelle}</th><td>{q(l.quantite)}</td><td>{montant(l.chiffre)}</td><td>{l.part} %</td>
                  {a.margeCalculee && <td>{l.marge == null ? '—' : montant(l.marge)}</td>}
                  <td>{l.stock == null ? '—' : q(l.stock)}</td><td>{finiDans(l)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : vide}
        <p className="rapport-note">En rouge : à commander vite. « Sera fini dans » = combien de jours il reste si vous vendez comme ces 30 derniers jours.</p>
      </section>
      <div className="rapport-deux">
        <div className="rapport-colonne">
          {a.ruptures.length > 0 && (
            <section className="rapport-bloc">
              <h3>À commander bientôt</h3>
              <table className="rapport-table rapport-serre">
                <tbody>{a.ruptures.slice(0, 8).map((l) => <tr key={l.id ?? l.libelle} className="alerte"><th>{l.libelle}</th><td>{q(l.stock)} en stock</td><td>{finiDans(l)}</td></tr>)}</tbody>
              </table>
            </section>
          )}
          {a.flop.length > 0 && (
            <section className="rapport-bloc">
              <h3>Les moins vendus</h3>
              <table className="rapport-table rapport-serre">
                <tbody>{a.flop.map((l) => <tr key={l.id ?? l.libelle}><th>{l.libelle}</th><td>{q(l.quantite)} vendu(s)</td><td>{montant(l.chiffre)}</td></tr>)}</tbody>
              </table>
            </section>
          )}
          {a.stock && a.stock.dormants_liste?.length > 0 && (
            <section className="rapport-bloc">
              <h3>Ne se vendent pas du tout</h3>
              <table className="rapport-table rapport-serre">
                <tbody>{a.stock.dormants_liste.slice(0, 6).map((l) => <tr key={l.libelle}><th>{l.libelle}</th><td>{q(l.quantite)} en stock</td><td>{l.valeur == null ? '—' : montant(l.valeur)}</td></tr>)}</tbody>
              </table>
            </section>
          )}
        </div>
        <div className="rapport-colonne">
          {a.categories.length > 0 && (
            <section className="rapport-bloc">
              <h3>Ventes par rayon</h3>
              <table className="rapport-table rapport-serre">
                <tbody>{a.categories.slice(0, 8).map((c) => <tr key={c.libelle ?? 'autre'}><th>{c.libelle || 'Sans rayon'}</th><td>{montant(c.chiffre)}</td><td>{c.part} %</td></tr>)}</tbody>
              </table>
            </section>
          )}
          {a.paires.length > 0 && (
            <section className="rapport-bloc">
              <h3>Souvent achetés ensemble</h3>
              <table className="rapport-table rapport-serre">
                <tbody>{a.paires.slice(0, 5).map((p) => <tr key={`${p.a}+${p.b}`}><th>{p.a} + {p.b}</th><td>{p.nombre} fois</td></tr>)}</tbody>
              </table>
              <p className="rapport-note">Idée : les vendre ensemble à un prix rond.</p>
            </section>
          )}
        </div>
      </div>
    </>
  );

  // Page 5 : le personnel et les clients.
  const personnel = (
    <>
      <section className="rapport-bloc">
        <h3>Ventes par personne</h3>
        {a.equipe.length ? (
          <table className="rapport-table">
            <thead><tr><th>Personne</th><th>Ventes</th><th>Total vendu</th><th>Par client</th><th>Réductions</th><th>Annulées</th><th>Caisses fermées</th><th>Différence caisse</th></tr></thead>
            <tbody>
              {a.equipe.slice(0, 15).map((e) => (
                <tr key={e.id} className={e.ecart ? 'alerte' : ''}>
                  <th>{e.nom}</th><td>{e.tickets}</td><td>{montant(e.chiffre)}</td><td>{e.tickets ? montant(e.panier) : '—'}</td>
                  <td>{Number(e.remises) ? montant(e.remises) : '—'}</td><td>{e.annulations || '—'}</td><td>{e.z || '—'}</td><td>{ecart(e.ecart)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : vide}
      </section>
      <div className="rapport-deux">
        <section className="rapport-bloc">
          <h3>Ventes annulées</h3>
          {a.annulations.length ? (
            <table className="rapport-table rapport-serre">
              <thead><tr><th>Vente</th><th>Par</th><th>Montant</th></tr></thead>
              <tbody>
                {a.annulations.slice(0, 12).map((x) => (
                  <tr key={x.numero} className={x.tardive ? 'alerte' : ''}>
                    <th>{x.numero}<small> · {new Date(x.quand).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}{x.motif ? ` · ${x.motif}` : ''}</small></th>
                    <td>{x.par ?? '—'}</td><td>{montant(x.montant)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="rapport-vide">Aucune vente annulée.</p>}
          {a.tardives.length > 0 && <p className="rapport-note">En rouge : annulée plus de 30 minutes après la vente. À vérifier avec la personne.</p>}
        </section>
        <section className="rapport-bloc">
          <h3>Meilleurs clients</h3>
          {a.clients.length ? (
            <table className="rapport-table rapport-serre">
              <thead><tr><th>Client</th><th>Achats</th><th>Total</th><th>Doit encore</th></tr></thead>
              <tbody>{a.clients.slice(0, 10).map((c) => <tr key={c.libelle}><th>{c.libelle}</th><td>{c.tickets}</td><td>{montant(c.chiffre)}</td><td>{Number(c.reste_du) > 0 ? montant(c.reste_du) : '—'}</td></tr>)}</tbody>
            </table>
          ) : <p className="rapport-vide">Aucun client enregistré sur les ventes. Mettez le nom du client à la caisse pour le voir ici.</p>}
        </section>
      </div>
    </>
  );

  const pages = [
    ['L’essentiel', essentiel],
    [type === 'jour' ? 'Quand vous vendez dans la journée' : 'Quand vous vendez', temps],
    ['La caisse et l’argent', caisse],
    ['Les produits', produits],
    [a.portee.tous ? 'Le personnel et les clients' : 'Mes ventes et les clients', personnel],
  ];
  return (
    <div className="rapport-pages">
      {pages.map(([t, contenu], i) => (
        <Feuille key={t} numero={i + 1} total={pages.length} titre={t} entete={entete} nom={nom} titreRapport={titre} a={a} espace={espace}>{contenu}</Feuille>
      ))}
    </div>
  );
}

function TablePaiements({ a, montant }) {
  if (!a.portee.paiements) return <p className="rapport-vide">Vous n’avez pas le droit de voir les paiements.</p>;
  if (!a.paiements.length) return <p className="rapport-vide">Aucun paiement.</p>;
  return (
    <table className="rapport-table rapport-z">
      <tbody>{a.paiements.map((p) => <tr key={p.mode}><th>{p.libelle}</th><td>{montant(p.montant)}</td><td>{p.part} %</td></tr>)}</tbody>
    </table>
  );
}
