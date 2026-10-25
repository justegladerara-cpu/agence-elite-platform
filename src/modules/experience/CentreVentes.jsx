import React, { useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDateHeure } from '../../noyau/format.js';
import { Chargement, Erreur, Recherche } from '../../ui/composants.jsx';
import { ModaleZ } from '../cloture/Clotures.jsx';
import { ajouterJours, heureLocale, soireeDe } from './analyse.js';
import { lireMoyens, moyenDuPaiement } from './moyens.js';
import { EnteteXp, LienAncien, Segments, Tuile } from './communs.jsx';

// Centre des ventes (nouvelle version The Dream) : la soirée ticket par ticket (moyen, serveur, statut) et les
// tickets Z en tuiles, avec l'export pour Excel.
export default function CentreVentes({ naviguer, sousRoute }) {
  const [vue, setVue] = useState(sousRoute === 'z' ? 'z' : 'ventes');
  return (
    <div className="xp-page">
      <EnteteXp titre="Centre des ventes" sousTitre="Chaque ticket de la soirée, et chaque fermeture de caisse.">
        <Segments libelle="Vue" valeur={vue} onChange={(v) => { setVue(v); naviguer(v === 'z' ? 'centre-ventes/z' : 'centre-ventes'); }}
          options={[['ventes', 'Tickets'], ['z', 'Tickets Z']]} />
        <LienAncien page={vue === 'z' ? 'z-et-rapports' : 'ventes'} naviguer={naviguer} />
      </EnteteXp>
      {vue === 'z' ? <TicketsZ /> : <Tickets naviguer={naviguer} />}
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

function Tickets({ naviguer }) {
  const { api, etablissement, montant, reglagesFonctions } = useEspace();
  const etab = etablissement.id;
  const fuseau = etablissement.fuseau || 'Africa/Brazzaville';
  const debut = Number(reglagesFonctions?.cloture?.debut_service ?? 8) || 8;
  const aujourdhui = soireeDe(new Date(), fuseau, debut);
  const [jour, setJour] = useState(aujourdhui);
  const [filtre, setFiltre] = useState('tout');
  const [texte, setTexte] = useState('');
  const moyens = useMemo(() => lireMoyens(reglagesFonctions), [reglagesFonctions]);
  const { donnees, chargement, erreur } = useDonnees(async () => {
    // Soirée = du début de service ce jour-là au début de service le lendemain (heure du bar).
    const decalage = (() => {
      const h = heureLocale(new Date(`${jour}T12:00:00Z`), fuseau).heure;
      return h - 12;
    })();
    const de = new Date(Date.parse(`${jour}T${String(debut).padStart(2, '0')}:00:00Z`) - decalage * 3600000).toISOString();
    const a = new Date(Date.parse(de) + 86400000).toISOString();
    const [ventes, serveurs] = await Promise.all([
      api.lire('ventes', { eq: { etablissement_id: etab }, gte: { cree_le: de }, lte: { cree_le: a }, ordre: ['cree_le', 'desc'], limite: 1000 }),
      api.lire('serveurs_caisse', { eq: { etablissement_id: etab } }).catch(() => []),
    ]);
    const ids = ventes.map((v) => v.id);
    const paiements = ids.length ? await api.lire('paiements', { dans: { vente_id: ids }, limite: 3000 }).catch(() => []) : [];
    return { ventes, serveurs: Object.fromEntries(serveurs.map((s) => [s.id, s.prenom])), paiements };
  }, [etab, jour]);
  if (chargement && !donnees) return <Chargement />;
  if (erreur) return <Erreur message={erreur} />;
  const parVente = {};
  donnees.paiements.filter((p) => p.statut !== 'annule').forEach((p) => { (parVente[p.vente_id] ??= []).push(p); });
  const lignes = donnees.ventes.map((v) => {
    const p = parVente[v.id] ?? [];
    const noms = [...new Set(p.map((x) => moyenDuPaiement(x, moyens).libelle))];
    return { ...v, moyens: noms, couleurs: p.map((x) => moyenDuPaiement(x, moyens).couleur), serveur: donnees.serveurs[v.serveur_id] ?? v.servi_par ?? '' };
  });
  const t = texte.trim().toLowerCase();
  const visibles = lignes.filter((v) => (filtre === 'tout' || (filtre === 'impaye' ? v.statut === 'validee' && Number(v.montant_paye) < Number(v.total) : v.statut === 'annulee'))
    && (!t || [v.numero, v.serveur, ...v.moyens].join(' ').toLowerCase().includes(t)));
  const valides = lignes.filter((v) => v.statut === 'validee');
  const ca = valides.reduce((s, v) => s + Number(v.total), 0);
  const impayes = valides.filter((v) => Number(v.montant_paye) < Number(v.total));
  const annulees = lignes.filter((v) => v.statut === 'annulee');
  const jours = [0, -1, -2, -3, -4, -5, -6].map((n) => ajouterJours(aujourdhui, n));
  return (
    <>
      <Segments libelle="Soirée" valeur={jour} onChange={setJour}
        options={jours.map((j, i) => [j, i === 0 ? 'Ce soir' : i === 1 ? 'Hier' : new Date(`${j}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })])} />
      <div className="xp-grille">
        <Tuile icone="ventes" titre="Tickets" valeur={valides.length} pourquoi={`${montant(ca)} encaissés ou à encaisser`} onClick={() => setFiltre('tout')} />
        <Tuile icone="horloge" titre="À encaisser" valeur={impayes.length} verdict={{ ton: impayes.length ? 'vigilance' : 'bon', texte: impayes.length ? montant(impayes.reduce((s, v) => s + Number(v.total) - Number(v.montant_paye), 0)) : 'tout payé' }}
          onClick={() => setFiltre('impaye')} conseil={impayes.length ? 'Voir lesquels' : undefined} />
        <Tuile icone="fermer" titre="Annulés" valeur={annulees.length} verdict={{ ton: annulees.length ? 'vigilance' : 'bon', texte: annulees.length ? montant(annulees.reduce((s, v) => s + Number(v.total), 0)) : 'aucun' }}
          onClick={() => setFiltre('annule')} conseil={annulees.length ? 'Voir lesquels' : undefined} />
      </div>
      <div className="xp-entete" style={{ alignItems: 'center' }}>
        <div style={{ minWidth: 240, flex: '0 1 340px' }}><Recherche valeur={texte} onChange={setTexte} placeholder="Numéro, serveur, MTN…" /></div>
        <button type="button" className="lien" onClick={() => exporter(`tickets-${jour}`, [['Numéro', 'Heure', 'Total', 'Payé', 'Statut', 'Serveur', 'Moyens'],
          ...visibles.map((v) => [v.numero, formatDateHeure(v.cree_le), v.total, v.montant_paye, v.statut, v.serveur, v.moyens.join(' + ')])])}>Exporter pour Excel</button>
      </div>
      <div className="xp-liste">
        {visibles.map((v) => (
          <button type="button" key={v.id} className="xp-ligne cliquable" onClick={() => naviguer(`ventes/${v.id}`)}>
            <span style={{ display: 'flex', gap: 3 }}>{v.couleurs.slice(0, 3).map((c, i) => <i key={i} style={{ width: 10, height: 10, borderRadius: 5, background: c }} />)}</span>
            <span className="xp-ligne-texte">
              <strong>{v.numero} · {new Date(v.cree_le).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: fuseau })}</strong>
              <small>{[v.serveur, v.moyens.join(' + ') || (v.statut === 'annulee' ? '' : 'pas encore payé')].filter(Boolean).join(' · ')}</small>
            </span>
            {v.statut === 'annulee' ? <span className="xp-verdict mauvais">annulé</span>
              : Number(v.montant_paye) < Number(v.total) ? <span className="xp-verdict vigilance">reste {montant(Number(v.total) - Number(v.montant_paye))}</span> : null}
            <span className="xp-ligne-valeur">{montant(v.total)}</span>
          </button>
        ))}
        {!visibles.length && <div className="xp-ligne"><span className="texte-doux">Aucun ticket.</span></div>}
      </div>
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
