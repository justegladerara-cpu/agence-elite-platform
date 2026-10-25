import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDateHeure } from '../../noyau/format.js';
import { Bouton, Chargement, Erreur } from '../../ui/composants.jsx';
import { ImageQr, telechargerSvg } from '../caisse/qrOutils.jsx';
import { Barre, EnteteXp, LienAncien, Segments, Tuile } from './communs.jsx';

// QR et avis (nouvelle version The Dream) : le QR « Menu The Dream » en grand (scans du jour, de la semaine, heure de
// pointe) et la boîte à suggestions. Aucun client n'est suivi : on compte des scans et on lit des avis anonymes.
export default function QrAvis({ naviguer }) {
  const { api, etablissement, peut, notifier } = useEspace();
  const etab = etablissement.id;
  const [filtre, setFiltre] = useState('nouveaux');
  const [lues, setLues] = useState({});
  const { donnees, chargement, erreur } = useDonnees(async () => {
    const [codes, stats, avis] = await Promise.all([
      api.lire('qr_codes', { eq: { etablissement_id: etab }, ordre: ['cree_le'] }),
      api.rpc('statistiques_qr', { p_etablissement_id: etab }).catch(() => null),
      api.lire('suggestions_clients', { eq: { etablissement_id: etab }, ordre: ['cree_le', 'desc'], limite: 300 }).catch(() => []),
    ]);
    const menu = codes.find((q) => q.actif && /menu/i.test(q.nom)) ?? codes.find((q) => q.actif) ?? null;
    return { menu, stats, avis, statsMenu: stats?.codes?.find((c) => c.id === menu?.id) ?? null };
  }, [etab]);
  if (chargement && !donnees) return <Chargement />;
  if (erreur) return <Erreur message={erreur} />;
  const { menu, stats, statsMenu } = donnees;
  const origine = `${window.location.origin}${window.location.pathname}`;
  const lienQr = menu ? `${origine}#/q/${menu.jeton}` : null;
  const lienAvis = menu ? `${origine}#/avis/${menu.jeton}` : null;
  const avis = donnees.avis.map((a) => ({ ...a, lue: a.lue || lues[a.id] }));
  const visibles = avis.filter((a) => filtre === 'tous' || (filtre === 'nouveaux' ? !a.lue : a.note <= 2));
  const moyenne = avis.length ? avis.reduce((s, a) => s + a.note, 0) / avis.length : null;
  const sujets = {};
  avis.forEach((a) => (a.sujets ?? []).forEach((s) => { sujets[s] = (sujets[s] ?? 0) + 1; }));
  const sujetsTries = Object.entries(sujets).sort((a, b) => b[1] - a[1]);
  const pic = stats?.heures?.length ? stats.heures.reduce((m, h) => (h.scans > m.scans ? h : m), stats.heures[0]) : null;
  const marquer = async (a) => {
    setLues((l) => ({ ...l, [a.id]: true }));
    await api.rpc('marquer_suggestion_lue', { p_suggestion_id: a.id }).catch((err) => notifier(err.message, 'erreur'));
  };
  const copier = async (texte) => {
    try {
      await navigator.clipboard.writeText(texte);
      notifier('Lien copié');
    } catch {
      notifier(texte);
    }
  };

  return (
    <div className="xp-page">
      <EnteteXp surtitre={etablissement.nom} titre="QR et avis" sousTitre="Un seul QR pour tout le bar. Les clients ouvrent le menu ; ceux qui veulent laissent une note, sans nom ni numéro.">
        <LienAncien page="qr-codes" naviguer={naviguer} texte="Tous les QR codes : écran complet" />
      </EnteteXp>

      <div className="xp-deux">
        <section className="xp-carte xp-section xp-tuile or" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20, alignItems: 'center' }}>
          {menu ? (
            <>
              <div style={{ width: 180, background: '#fff', padding: 10, borderRadius: 14 }}><ImageQr texte={lienQr} libelle={menu.nom} /></div>
              <div className="xp-section" style={{ flex: '1 1 220px' }}>
                <span className="xp-surtitre">QR principal</span>
                <h2 className="xp-titre" style={{ fontSize: 26 }}>{menu.nom}</h2>
                <div className="xp-grille etroite">
                  <Tuile titre="Aujourd’hui" valeur={statsMenu?.aujourdhui ?? 0} unite="scans" />
                  <Tuile titre="7 jours" valeur={statsMenu?.sept_jours ?? 0} unite="scans" />
                  <Tuile titre="Depuis le début" valeur={statsMenu?.total ?? 0} unite="scans" />
                </div>
                {pic && pic.scans > 0 && <small className="texte-doux">Les clients scannent surtout vers {pic.heure} h : c’est là que le menu doit être à jour.</small>}
                <span className="xp-reco-actions">
                  <button type="button" onClick={() => telechargerSvg(lienQr, menu.nom)}>Télécharger le QR</button>
                  <button type="button" onClick={() => copier(lienAvis)}>Copier le lien des avis</button>
                </span>
              </div>
            </>
          ) : (
            <div className="xp-section">
              <strong>Pas encore de QR « Menu The Dream »</strong>
              <Bouton variante="principal" onClick={() => naviguer('qr-codes')}>Le créer</Bouton>
            </div>
          )}
        </section>
        <section className="xp-carte xp-section">
          <h2 className="xp-section-titre">Ce que disent les clients</h2>
          <Tuile titre="Note moyenne" valeur={moyenne == null ? '—' : `${moyenne.toFixed(1)} / 5`}
            verdict={moyenne == null ? undefined : { ton: moyenne >= 4 ? 'bon' : moyenne >= 3 ? 'attention' : 'mauvais', texte: `${avis.length} avis` }}
            pourquoi={avis.filter((a) => !a.lue).length ? `${avis.filter((a) => !a.lue).length} avis pas encore lus.` : 'Tous les avis sont lus.'} />
          <div className="xp-barres">
            {sujetsTries.slice(0, 5).map(([s, n]) => <Barre key={s} libelle={s} valeur={`${n} fois`} part={n / Math.max(1, sujetsTries[0][1])} />)}
          </div>
        </section>
      </div>

      <section className="xp-section">
        <h2 className="xp-section-titre">
          Les avis
          <Segments libelle="Filtre" valeur={filtre} onChange={setFiltre} options={[['nouveaux', 'Pas lus'], ['mauvais', 'Mauvais'], ['tous', 'Tous']]} />
        </h2>
        <div className="xp-liste">
          {visibles.map((a) => (
            <div key={a.id} className="xp-ligne">
              <span className={`xp-verdict ${a.note >= 4 ? 'bon' : a.note === 3 ? 'attention' : 'mauvais'}`}>{a.note} ★</span>
              <span className="xp-ligne-texte">
                <strong>{a.message || 'Sans commentaire'}</strong>
                <small>{(a.sujets ?? []).join(' · ')}{a.sujets?.length ? ' · ' : ''}{formatDateHeure(a.cree_le)}</small>
              </span>
              {!a.lue && peut('cloture.cloturer') && <button type="button" className="lien" onClick={() => marquer(a)}>Lu</button>}
            </div>
          ))}
          {!visibles.length && <div className="xp-ligne"><span className="texte-doux">Rien ici pour le moment.</span></div>}
        </div>
      </section>
    </div>
  );
}
