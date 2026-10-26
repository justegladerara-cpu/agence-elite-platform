import React, { lazy, Suspense, useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDateHeure } from '../../noyau/format.js';
import { Chargement, Erreur, Recherche, Squelette } from '../../ui/composants.jsx';
import { ModaleZ } from '../cloture/Clotures.jsx';
import { DetailVente } from '../ventes/Ventes.jsx';
import { ajouterJours, analysesApprofondies, heureLocale, soireeDe } from './analyse.js';
import { lireMoyens, moyenDuPaiement } from './moyens.js';
import { Barre, Courbe, EnteteXp, Panneau, Segments, Tuile, Verdict } from './communs.jsx';

// Centre des ventes (nouvelle version The Dream) : un seul écran. La soirée ticket par ticket avec ses chiffres et
// ses analyses, les tickets Z, toutes les ventes (recherche, retours, export) et les rapports. Un toucher sur une
// vente ouvre son ticket sur place.
const Ventes = lazy(() => import('../ventes/Ventes.jsx'));
const ZEtRapports = lazy(() => import('../cloture/ZEtRapports.jsx'));

const VUES = [['soiree', 'La soirée'], ['toutes', 'Toutes les ventes'], ['z', 'Tickets Z'], ['rapports', 'Rapports']];

export default function CentreVentes({ naviguer, sousRoute }) {
  const { etablissement } = useEspace();
  const demande = (sousRoute ?? '').split('/')[0];
  const [vue, setVue] = useState(VUES.some(([id]) => id === demande) ? demande : 'soiree');
  const changer = (v) => {
    setVue(v);
    naviguer(v === 'soiree' ? 'centre-ventes' : `centre-ventes/${v}`);
  };
  return (
    <div className="xp-page">
      <EnteteXp surtitre={etablissement.nom} titre="Centre des ventes"
        sousTitre="Chaque ticket, chaque fermeture de caisse et les rapports, au même endroit. Touchez une vente pour voir son ticket.">
        <Segments libelle="Vue" valeur={vue} onChange={changer} options={VUES} />
      </EnteteXp>
      {vue === 'soiree' && <Soiree />}
      {vue === 'toutes' && (
        <Suspense fallback={<Squelette lignes={8} />}><Ventes integre /></Suspense>
      )}
      {vue === 'z' && <TicketsZ />}
      {vue === 'rapports' && (
        <Suspense fallback={<Squelette lignes={8} />}><ZEtRapports naviguer={naviguer} exclure={['z']} /></Suspense>
      )}
    </div>
  );
}

const csv = (lignes) => lignes.map((l) => l.map((v) => {
  const t = v == null ? '' : String(v);
  return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}).join(';')).join('\n');

function enregistrerFichier(blob, nom) {
  const adresse = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = adresse;
  lien.download = nom;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(adresse), 2000);
}

function exporter(nom, lignes) {
  enregistrerFichier(new Blob([`﻿${csv(lignes)}`], { type: 'text/csv;charset=utf-8' }), `${nom}-${new Date().toISOString().slice(0, 10)}.csv`);
}

// La soirée : tuiles à pictogrammes, courbe heure par heure, analyses automatiques, puis les tickets un par un.
function Soiree() {
  const { api, etablissement, montant, reglagesFonctions, peut } = useEspace();
  const etab = etablissement.id;
  const fuseau = etablissement.fuseau || 'Africa/Brazzaville';
  const debut = Number(reglagesFonctions?.cloture?.debut_service ?? 8) || 8;
  const aujourdhui = soireeDe(new Date(), fuseau, debut);
  const [jour, setJour] = useState(aujourdhui);
  const [filtre, setFiltre] = useState('tout');
  const [texte, setTexte] = useState('');
  const [ticket, setTicket] = useState(null);
  const [panneau, setPanneau] = useState(null);
  const moyens = useMemo(() => lireMoyens(reglagesFonctions), [reglagesFonctions]);
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    // Soirée = du début de service ce jour-là au début de service le lendemain (heure du bar).
    const decalage = heureLocale(new Date(`${jour}T12:00:00Z`), fuseau).heure - 12;
    const de = new Date(Date.parse(`${jour}T${String(debut).padStart(2, '0')}:00:00Z`) - decalage * 3600000).toISOString();
    const a = new Date(Date.parse(de) + 86400000).toISOString();
    const [ventes, serveurs] = await Promise.all([
      api.lire('ventes', { eq: { etablissement_id: etab }, gte: { cree_le: de }, lte: { cree_le: a }, ordre: ['cree_le', 'desc'], limite: 1000 }),
      api.lire('serveurs_caisse', { eq: { etablissement_id: etab } }).catch(() => []),
    ]);
    const ids = ventes.map((v) => v.id);
    const paquets = [];
    for (let i = 0; i < ids.length; i += 80) paquets.push(ids.slice(i, i + 80));
    const [paiements, lignes] = await Promise.all([
      Promise.all(paquets.map((p) => api.lire('paiements', { dans: { vente_id: p }, limite: 3000 }).catch(() => []))).then((x) => x.flat()),
      Promise.all(paquets.map((p) => api.lire('lignes_vente', { dans: { vente_id: p }, limite: 5000 }).catch(() => []))).then((x) => x.flat()),
    ]);
    return { ventes, serveurs: Object.fromEntries(serveurs.map((s) => [s.id, s.prenom])), paiements, lignes };
  }, [etab, jour]);

  if (chargement && !donnees) return <Chargement texte="La soirée se rassemble…" />;
  if (erreur) return <Erreur message={erreur} />;
  const parVente = {};
  donnees.paiements.filter((p) => p.statut !== 'annule').forEach((p) => { (parVente[p.vente_id] ??= []).push(p); });
  const lignesParVente = {};
  donnees.lignes.forEach((l) => { (lignesParVente[l.vente_id] ??= []).push(l); });
  const lignes = donnees.ventes.map((v) => {
    const p = parVente[v.id] ?? [];
    const noms = [...new Set(p.map((x) => moyenDuPaiement(x, moyens).libelle))];
    return { ...v, moyens: noms, couleurs: p.map((x) => moyenDuPaiement(x, moyens).couleur), serveur: donnees.serveurs[v.serveur_id] ?? v.servi_par ?? '' };
  });
  const t = texte.trim().toLowerCase();
  const visibles = lignes.filter((v) => (filtre === 'tout'
    || (filtre === 'impaye' ? v.statut === 'validee' && Number(v.montant_paye) < Number(v.total)
      : filtre === 'annule' ? v.statut === 'annulee' : true))
    && (!t || [v.numero, v.serveur, ...v.moyens].join(' ').toLowerCase().includes(t)));
  const valides = lignes.filter((v) => v.statut === 'validee');
  const ca = valides.reduce((s, v) => s + Number(v.total), 0);
  const impayes = valides.filter((v) => Number(v.montant_paye) < Number(v.total));
  const annulees = lignes.filter((v) => v.statut === 'annulee');
  const panier = valides.length ? ca / valides.length : 0;
  const jours = [0, -1, -2, -3, -4, -5, -6].map((n) => ajouterJours(aujourdhui, n));

  // Chiffres construits à partir des ventes de la soirée (mêmes données que la liste, aucune répétition).
  const idsValides = new Set(valides.map((v) => v.id));
  const parArticle = {};
  donnees.lignes.filter((l) => idsValides.has(l.vente_id)).forEach((l) => {
    const x = (parArticle[l.article_id] ??= { id: l.article_id, nom: l.libelle, qte: 0, ca: 0, marge: 0, avecCout: true });
    x.qte += Number(l.quantite || 0);
    x.ca += Number(l.total || 0);
    if (l.cout_unitaire == null) x.avecCout = false;
    else x.marge += Number(l.total || 0) - Number(l.cout_unitaire) * Number(l.quantite || 0);
  });
  const produits = Object.values(parArticle).map((x) => ({ ...x, marge: x.avecCout ? x.marge : null })).sort((a, b) => b.ca - a.ca);
  const parServeur = {};
  valides.forEach((v) => {
    const cle = v.serveur_id ?? 'aucun';
    const x = (parServeur[cle] ??= { id: v.serveur_id ?? null, prenom: donnees.serveurs[v.serveur_id] ?? 'Sans serveur', nb: 0, ca: 0 });
    x.nb += 1;
    x.ca += Number(v.total || 0);
  });
  const serveurs = Object.values(parServeur).map((x) => ({ ...x, panier: x.nb ? x.ca / x.nb : 0 })).sort((a, b) => b.ca - a.ca);
  const parHeure = new Array(24).fill(0);
  valides.forEach((v) => { parHeure[(heureLocale(v.cree_le, fuseau).heure - debut + 24) % 24] += Number(v.total || 0); });
  const parMoyen = {};
  donnees.paiements.filter((p) => p.statut !== 'annule' && idsValides.has(p.vente_id)).forEach((p) => {
    const m = moyenDuPaiement(p, moyens);
    const x = (parMoyen[m.cle] ??= { cle: m.cle, libelle: m.libelle, couleur: m.couleur, montant: 0, nb: 0 });
    x.montant += Number(p.montant || 0);
    x.nb += 1;
  });
  const totalPaye = Object.values(parMoyen).reduce((s, m) => s + m.montant, 0);
  const moyensPayes = Object.values(parMoyen).map((m) => ({ ...m, part: totalPaye ? m.montant / totalPaye : 0 })).sort((a, b) => b.montant - a.montant);
  const resteDu = impayes.reduce((s, v) => s + Number(v.total) - Number(v.montant_paye), 0);
  const margeConnue = produits.filter((p) => p.marge != null);
  const caAvecCout = margeConnue.reduce((s, p) => s + p.ca, 0);
  const marge = margeConnue.reduce((s, p) => s + p.marge, 0);
  const resume = {
    ca, ventes: valides.length, panier, marge, tauxMarge: caAvecCout ? marge / caAvecCout : null,
    partCouverte: ca ? caAvecCout / ca : 0, annulations: annulees.length,
    montantAnnule: annulees.reduce((s, v) => s + Number(v.total), 0), resteDu, soirees: 1,
  };
  const analyses = analysesApprofondies({
    r: { heures: [[jour, debut, valides.length, ca]] }, t: resume, produits, serveurs, moyens: moyensPayes,
    montant, debut, du: jour, au: jour,
  });
  const maxProduit = Math.max(1, ...produits.map((p) => p.ca));
  const maxServeur = Math.max(1, ...serveurs.map((s) => s.ca));

  return (
    <>
      <Segments libelle="Soirée" valeur={jour} onChange={setJour}
        options={jours.map((j, i) => [j, i === 0 ? 'Ce soir' : i === 1 ? 'Hier' : new Date(`${j}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })])} />
      <div className="xp-grille">
        <Tuile icone="graphique" titre="Total vendu" valeur={montant(ca)} pourquoi={`${valides.length} ticket${valides.length > 1 ? 's' : ''} sur la soirée.`}
          conseil="Voir ce qui s’est vendu" onClick={() => setPanneau('produits')} />
        <Tuile icone="panier" titre="Dépense moyenne par client" valeur={montant(Math.round(panier))}
          pourquoi="Ce que laisse une table en moyenne." conseil="Voir par serveur" onClick={() => setPanneau('serveurs')} />
        <Tuile icone="ventes" titre="Tickets" valeur={valides.length} onClick={() => setFiltre('tout')}
          pourquoi="Un ticket = une table ou un client servi." />
        <Tuile icone="cible" titre="Ce qui vous reste (marge)" valeur={resume.tauxMarge == null ? '—' : montant(Math.round(marge))}
          verdict={resume.tauxMarge == null ? { ton: 'neutre', texte: 'prix d’achat manquants' } : { ton: resume.tauxMarge >= 0.5 ? 'bon' : resume.tauxMarge >= 0.3 ? 'vigilance' : 'mauvais', texte: `${Math.round(resume.tauxMarge * 100)} %` }}
          pourquoi={`Calculée sur ${Math.round(resume.partCouverte * 100)} % des ventes.`} />
        <Tuile icone="horloge" titre="À encaisser" valeur={montant(resteDu)}
          verdict={{ ton: resteDu ? 'vigilance' : 'bon', texte: resteDu ? `${impayes.length} ticket${impayes.length > 1 ? 's' : ''}` : 'tout payé' }}
          pourquoi="Servi mais pas encore payé." conseil={resteDu ? 'Voir lesquels' : undefined} onClick={resteDu ? () => setFiltre('impaye') : undefined} />
        <Tuile icone="fermer" titre="Annulés" valeur={annulees.length}
          verdict={{ ton: annulees.length ? 'vigilance' : 'bon', texte: annulees.length ? montant(resume.montantAnnule) : 'aucun' }}
          pourquoi={annulees.length ? 'Chaque annulation doit avoir une raison.' : 'Aucune vente annulée.'}
          conseil={annulees.length ? 'Voir lesquels' : undefined} onClick={annulees.length ? () => setFiltre('annule') : undefined} />
      </div>

      {ca > 0 && (
        <section className="xp-carte xp-section">
          <h2 className="xp-section-titre">Heure par heure</h2>
          <Courbe series={[{ nom: 'Ce soir', points: parHeure.slice(0, 20), couleur: 'var(--accent)', remplie: true }]}
            etiquettes={[0, 4, 8, 12, 16, 19].map((i) => `${(i + debut) % 24} h`)} hauteur={120} />
        </section>
      )}

      <div className="xp-deux">
        <section className="xp-carte xp-section">
          <h2 className="xp-section-titre">Ce qui s’est vendu <button type="button" className="lien" onClick={() => setPanneau('produits')}>Tout voir</button></h2>
          <div className="xp-barres">
            {produits.slice(0, 7).map((p) => (
              <Barre key={p.id} libelle={p.nom} valeur={montant(p.ca)} part={p.ca / maxProduit}
                detail={`${p.qte} vendu${p.qte > 1 ? 's' : ''}${p.marge != null ? ` · rapporte ${montant(Math.round(p.marge))}` : ''}`} />
            ))}
            {!produits.length && <p className="texte-doux">Aucune vente sur la soirée.</p>}
          </div>
        </section>
        <section className="xp-carte xp-section">
          <h2 className="xp-section-titre">Moyens de paiement</h2>
          <div className="xp-barres">
            {moyensPayes.map((m) => (
              <Barre key={m.cle} libelle={m.libelle} valeur={montant(m.montant)} part={m.part} couleur={m.couleur}
                detail={`${Math.round(m.part * 100)} % · ${m.nb} paiement${m.nb > 1 ? 's' : ''}`} />
            ))}
            {!moyensPayes.length && <p className="texte-doux">Aucun paiement sur la soirée.</p>}
          </div>
        </section>
      </div>

      {serveurs.length > 0 && (
        <section className="xp-carte xp-section">
          <h2 className="xp-section-titre">Par serveur</h2>
          <div className="xp-barres">
            {serveurs.map((s) => (
              <Barre key={s.id ?? 'aucun'} libelle={s.prenom} valeur={montant(s.ca)} part={s.ca / maxServeur}
                detail={`${s.nb} ticket${s.nb > 1 ? 's' : ''} · dépense moyenne ${montant(Math.round(s.panier))}`} />
            ))}
          </div>
        </section>
      )}

      {analyses.length > 0 && (
        <section className="xp-section">
          <h2 className="xp-section-titre">Analyses automatiques <small>ce que dit la soirée</small></h2>
          <div className="xp-grille large">
            {analyses.map((x) => (
              <Tuile key={x.titre} className={`xp-reco ${x.ton}`} titre={x.titre} pourquoi={x.texte} conseil={x.conseil}
                verdict={{ ton: x.ton, texte: x.ton === 'bon' ? 'Bien' : x.ton === 'mauvais' ? 'À corriger' : x.ton === 'vigilance' ? 'À surveiller' : 'Info' }} />
            ))}
          </div>
        </section>
      )}

      <section className="xp-section">
        <h2 className="xp-section-titre">
          Les tickets <small>touchez un ticket pour l’ouvrir</small>
          <Segments libelle="Filtre" valeur={filtre} onChange={setFiltre}
            options={[['tout', 'Tous'], ['impaye', 'À encaisser'], ['annule', 'Annulés']]} />
        </h2>
        <div className="xp-entete" style={{ alignItems: 'center' }}>
          <div style={{ minWidth: 240, flex: '0 1 340px' }}><Recherche valeur={texte} onChange={setTexte} placeholder="Numéro, serveur, MTN…" /></div>
          {peut('ventes.lire') && (
            <button type="button" className="lien" onClick={() => exporter(`tickets-${jour}`, [['Numéro', 'Heure', 'Total', 'Payé', 'Statut', 'Serveur', 'Moyens'],
              ...visibles.map((v) => [v.numero, formatDateHeure(v.cree_le), v.total, v.montant_paye, v.statut, v.serveur, v.moyens.join(' + ')])])}>Exporter pour Excel</button>
          )}
        </div>
        <div className="xp-liste">
          {visibles.map((v) => {
            const l = lignesParVente[v.id] ?? [];
            return (
              <button type="button" key={v.id} className="xp-ligne cliquable" onClick={() => setTicket(v.id)}>
                <span style={{ display: 'flex', gap: 3 }}>{v.couleurs.slice(0, 3).map((c, i) => <i key={i} style={{ width: 10, height: 10, borderRadius: 5, background: c }} />)}</span>
                <span className="xp-ligne-texte">
                  <strong>{v.numero} · {new Date(v.cree_le).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: fuseau })}</strong>
                  <small>{[v.serveur, l.slice(0, 2).map((x) => `${Number(x.quantite)} × ${x.libelle}`).join(', ') + (l.length > 2 ? ` +${l.length - 2}` : ''), v.moyens.join(' + ') || (v.statut === 'annulee' ? '' : 'pas encore payé')].filter(Boolean).join(' · ')}</small>
                </span>
                {v.statut === 'annulee' ? <Verdict ton="mauvais">annulé</Verdict>
                  : Number(v.montant_paye) < Number(v.total) ? <Verdict ton="vigilance">reste {montant(Number(v.total) - Number(v.montant_paye))}</Verdict> : null}
                <span className="xp-ligne-valeur">{montant(v.total)}</span>
              </button>
            );
          })}
          {!visibles.length && <div className="xp-ligne"><span className="texte-doux">Aucun ticket.</span></div>}
        </div>
      </section>

      {panneau && (
        <Panneau titre={panneau === 'produits' ? 'Tout ce qui s’est vendu' : 'Les serveurs de la soirée'} onFermer={() => setPanneau(null)}>
          {panneau === 'produits' ? (
            <div className="xp-liste">
              {produits.map((p) => (
                <div key={p.id} className="xp-ligne">
                  <span className="xp-ligne-texte"><strong>{p.nom}</strong><small>{p.qte} vendus{p.marge != null ? ` · rapporte ${montant(Math.round(p.marge))}` : ' · prix d’achat inconnu'}</small></span>
                  <span className="xp-ligne-valeur">{montant(p.ca)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="xp-liste">
              {serveurs.map((s) => (
                <div key={s.id ?? 'aucun'} className="xp-ligne">
                  <span className="xp-ligne-texte"><strong>{s.prenom}</strong><small>{s.nb} ticket{s.nb > 1 ? 's' : ''} · dépense moyenne {montant(Math.round(s.panier))}</small></span>
                  <span className="xp-ligne-valeur">{montant(s.ca)}</span>
                </div>
              ))}
            </div>
          )}
        </Panneau>
      )}
      {ticket && <DetailVente venteId={ticket} onFermer={() => setTicket(null)} onChange={recharger} />}
    </>
  );
}

function TicketsZ() {
  const { api, etablissement, montant } = useEspace();
  const [ouvert, setOuvert] = useState(null);
  const { donnees, chargement, erreur, recharger } = useDonnees(() => api.rpc('tickets_z', { p_etablissement_id: etablissement.id, p_limite: 200 }), [etablissement.id]);
  if (chargement && !donnees) return <Chargement />;
  if (erreur) return <Erreur message={erreur} />;
  const z = donnees ?? [];
  const manques = z.filter((x) => x.ecart != null && Number(x.ecart) < 0);
  return (
    <>
      <div className="xp-grille">
        <Tuile icone="cloture" titre="Tickets Z" valeur={z.length} pourquoi="Une fermeture de caisse = un ticket Z." />
        <Tuile icone="alerte" titre="Avec un manque" valeur={manques.length}
          verdict={{ ton: manques.length ? 'mauvais' : 'bon', texte: manques.length ? montant(manques.reduce((s, x) => s + Number(x.ecart), 0)) : 'aucun' }}
          pourquoi="Les espèces comptées étaient en dessous de ce qui était attendu." />
      </div>
      <div className="xp-entete">
        <span />
        <button type="button" className="lien" onClick={() => exporter('tickets-z', [['Numéro', 'Caissière', 'Ouverte', 'Fermée', 'Ventes', 'Nombre', 'Espèces attendues', 'Espèces comptées', 'Écart'],
          ...z.map((x) => [x.numero, x.caissier, formatDateHeure(x.ouverte_le), formatDateHeure(x.cloturee_le), x.total_ventes, x.nombre_ventes, x.especes_attendues, x.especes_comptees, x.ecart])])}>Exporter pour Excel</button>
      </div>
      <div className="xp-grille">
        {z.map((x) => (
          <Tuile key={x.id} icone="cloture" titre={`${x.numero} · ${x.caissier ?? ''}`} valeur={montant(x.total_ventes)} onClick={() => setOuvert(x)}
            verdict={x.ecart == null ? { ton: 'neutre', texte: 'à compter' } : Number(x.ecart) === 0 ? { ton: 'bon', texte: 'juste' } : { ton: Number(x.ecart) < 0 ? 'mauvais' : 'vigilance', texte: montant(x.ecart) }}
            pourquoi={`${x.nombre_ventes} ventes · ${formatDateHeure(x.cloturee_le)}`} conseil="Ouvrir le ticket" />
        ))}
      </div>
      {ouvert && <ModaleZ z={ouvert} onFermer={() => setOuvert(null)} onCompte={() => recharger()} />}
    </>
  );
}
