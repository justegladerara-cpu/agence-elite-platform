import React, { useEffect, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatQuantite, MODES_PAIEMENT } from '../../noyau/format.js';
import { Badge, Bouton, Champ, Chargement, EnTete, Erreur, Section, StatCard } from '../../ui/composants.jsx';
import { BandeauNouveau } from '../../ui/Nouveau.jsx';
import { dateEnLettres, heureDebutService, jourDeService, ecartEnMots, lienRapportWhatsApp, texteRapportDuSoir } from './rapportDuSoir.js';
import { useAnalyse } from '../tableau_de_bord/Analyses.jsx';
import { MiniGraphique } from '../tableau_de_bord/Rapport.jsx';
import { conseils } from '../tableau_de_bord/analyses.js';

const heureDe = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
// Heure d'une vente, avec « (le lendemain) » pour une vente après minuit (service 24 h sur 24).
const heureDuService = (iso, date) => {
  const d = new Date(iso);
  const jour = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return jour > date ? `${heureDe(iso)} (le lendemain)` : heureDe(iso);
};

// La journée en détail (Juste, 2026-10-24) : à quelle heure les clients viennent, la plus grosse vente, le premier et
// le dernier client, ce qu'il faut surveiller et des conseils. Chiffres : analyse_commerce + ventes du jour de service.
function useJournee(date) {
  const { api, etablissement, reglagesFonctions } = useEspace();
  const debut = heureDebutService(reglagesFonctions);
  const lendemain = new Date(`${date}T12:00:00`);
  lendemain.setDate(lendemain.getDate() + 1);
  const deux = (n) => String(n).padStart(2, '0');
  const du = new Date(`${date}T${deux(debut)}:00:00`).toISOString();
  const au = new Date(`${lendemain.getFullYear()}-${deux(lendemain.getMonth() + 1)}-${deux(lendemain.getDate())}T${deux(debut)}:00:00`).toISOString();
  const { a } = useAnalyse(date, date);
  const { donnees: ventes } = useDonnees(async () => {
    const base = { eq: { etablissement_id: etablissement.id, statut: 'validee' }, gte: { cree_le: du }, lte: { cree_le: au }, limite: 1, colonnes: ['id', 'numero', 'total', 'cree_le'] };
    const [grosse, premiere, derniere] = await Promise.all([
      api.lire('ventes', { ...base, ordre: ['total', 'desc'] }).catch(() => []),
      api.lire('ventes', { ...base, ordre: ['cree_le'] }).catch(() => []),
      api.lire('ventes', { ...base, ordre: ['cree_le', 'desc'] }).catch(() => []),
    ]);
    return { grosse: grosse[0] ?? null, premiere: premiere[0] ?? null, derniere: derniere[0] ?? null };
  }, [etablissement.id, du, au]);
  return { a, ventes };
}

function Journee({ a, ventes, date }) {
  const { montant } = useEspace();
  if (!a) return null;
  const idees = conseils(a, montant);
  const points = (a.heures ?? []).map((h) => ({ libelle: `${h.heure}h`, valeur: h.chiffre, nom: `${h.heure} h` }));
  return (
    <>
      <Section titre="Quand les clients viennent" sousTitre="Ventes heure par heure. La barre en couleur : le moment le plus fort.">
        <div className="rapport-soir-graphique"><MiniGraphique points={points} montant={montant} hauteur={130} /></div>
        <div className="grille-stats rapport-soir-moments">
          {a.meilleureHeure && <StatCard icone="horloge" libelle="Heure la plus forte" valeur={`${a.meilleureHeure.heure} h – ${(a.meilleureHeure.heure + 1) % 24} h`} detail={`${montant(a.meilleureHeure.chiffre)} · ${a.meilleureHeure.tickets} vente(s)`} />}
          {ventes?.grosse && <StatCard icone="etoile" libelle="Plus grosse vente" valeur={montant(ventes.grosse.total)} detail={`à ${heureDuService(ventes.grosse.cree_le, date)} · ${ventes.grosse.numero}`} />}
          {ventes?.premiere && <StatCard icone="activite" libelle="Premier client" valeur={heureDe(ventes.premiere.cree_le)} detail={montant(ventes.premiere.total)} />}
          {ventes?.derniere && <StatCard icone="activite" libelle="Dernier client" valeur={heureDe(ventes.derniere.cree_le)} detail={`${montant(ventes.derniere.total)}${heureDuService(ventes.derniere.cree_le, date).includes('lendemain') ? ' · le lendemain' : ''}`} />}
          {a.creux && <StatCard icone="horloge" libelle="Heures calmes" valeur={`${a.creux.de} h – ${a.creux.a} h`} detail={`seulement ${a.creux.part} % des ventes`} />}
          {a.kpis?.[2]?.valeur != null && <StatCard icone="panier" libelle="Dépense par client" valeur={montant(a.kpis[2].valeur)} detail="en moyenne" />}
        </div>
      </Section>
      <div className="deux-colonnes">
        <Section titre="À surveiller">
          <ul className="rapport-soir-liste">
            {(a.attentionToutes ?? []).slice(0, 6).map((p) => <li key={p.texte} className={`niveau-${p.niveau}`}>{p.texte}</li>)}
          </ul>
        </Section>
        <Section titre="Nos conseils">
          {idees.length ? (
            <ol className="rapport-soir-liste conseils">{idees.map((c) => <li key={c}>{c}</li>)}</ol>
          ) : <p className="texte-doux">Pas encore assez de ventes pour donner des conseils.</p>}
        </Section>
      </div>
      {a.categories?.length > 0 && (
        <Section titre="Ventes par rayon">
          <div className="rapport-soir-rayons">
            {a.categories.slice(0, 8).map((c) => (
              <div key={c.libelle ?? 'autre'} className="rapport-soir-rayon">
                <span>{c.libelle || 'Sans rayon'}</span>
                <span className="rapport-soir-jauge" aria-hidden="true"><span style={{ width: `${Math.max(3, c.part)}%` }} /></span>
                <strong>{montant(c.chiffre)}</strong>
                <small className="texte-doux">{c.part} %</small>
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

// Fin du bandeau « Nouveau » de cet écran (72 h environ).
export const NOUVEAU_RAPPORT_SOIR_JUSQUA = '2026-10-16T12:00:00Z';

// Rapport du soir (migration 20261017000137, fonction rapport_du_soir) : le résumé de la journée en gros blocs, puis
// « Envoyer au patron sur WhatsApp » (lien wa.me, rien ne part tout seul) ou « Copier le texte ».
export default function RapportDuSoir() {
  const { api, etablissement, devise, montant, notifier, peut, reglagesFonctions } = useEspace();
  const etab = etablissement.id;
  const [date, setDate] = useState(() => jourDeService(reglagesFonctions));
  // Numéro tapé à l'écran ; null = celui enregistré (réglage du module Clôture).
  const [numeroSaisi, setNumero] = useState(null);
  const [enregistrement, setEnregistrement] = useState(false);
  const [copie, setCopie] = useState(false);
  const { donnees: rapport, chargement, erreur, recharger } = useDonnees(
    () => api.rpc('rapport_du_soir', { p_etablissement_id: etab, p_date: date || null }),
    [etab, date]
  );
  const { a: analyse, ventes: journee } = useJournee(date || jourDeService(reglagesFonctions));
  const numero = numeroSaisi ?? rapport?.whatsapp_patron ?? '';
  useEffect(() => setCopie(false), [rapport, numero]);

  // Le texte WhatsApp reçoit aussi le moment fort, la plus grosse vente et 3 conseils.
  const complet = rapport ? {
    ...rapport, devise: rapport.devise ?? devise,
    heure_forte: analyse?.meilleureHeure ? { heure: analyse.meilleureHeure.heure, montant: analyse.meilleureHeure.chiffre } : null,
    plus_grosse_vente: journee?.grosse ? { montant: journee.grosse.total, heure: heureDuService(journee.grosse.cree_le, date || jourDeService(reglagesFonctions)) } : null,
    conseils: analyse ? conseils(analyse, montant).slice(0, 3) : [],
  } : null;
  const texte = complet ? texteRapportDuSoir(complet) : '';
  const lien = complet ? lienRapportWhatsApp(complet, numero) : '';

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(true);
      notifier('Texte du rapport copié : collez-le dans WhatsApp');
    } catch {
      notifier('Copie impossible : sélectionnez le texte ci-dessous et copiez-le', 'erreur');
    }
  };

  // Le numéro est un réglage du module Clôture : on garde les autres réglages tels quels.
  const enregistrerNumero = async () => {
    setEnregistrement(true);
    try {
      const actuels = await api.lire('etablissement_parametres', { eq: { etablissement_id: etab, module_id: 'cloture' } });
      await api.rpc('enregistrer_parametres_module', {
        p_etablissement_id: etab, p_module_id: 'cloture', p_data: { ...(actuels[0]?.data ?? {}), whatsapp_patron: numero.trim() },
      });
      notifier('Numéro WhatsApp du patron enregistré');
      setNumero(null);
      recharger();
    } catch (e) {
      notifier(e.message, 'erreur');
    } finally {
      setEnregistrement(false);
    }
  };

  const clotures = rapport?.clotures ?? {};
  const ecart = Number(clotures.ecart || 0);
  return (
    <div className="page rapport-soir">
      <BandeauNouveau jusqua={NOUVEAU_RAPPORT_SOIR_JUSQUA}>
        Rapport du soir : le résumé de la journée, prêt à envoyer au patron sur WhatsApp en un geste.
      </BandeauNouveau>
      <EnTete titre="Rapport du soir" sousTitre={date ? `Journée du ${dateEnLettres(date)}` : 'Résumé de la journée'}>
        <Champ libelle="Date du rapport" className="rapport-soir-date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Champ>
      </EnTete>

      {erreur && <Erreur message={erreur} />}
      {chargement && !rapport && <Chargement />}
      {rapport && (
        <>
          <div className="grille-stats rapport-soir-blocs">
            <StatCard icone="ventes" libelle="Ventes" valeur={montant(rapport.total_ventes)}
              detail={`${rapport.nombre_tickets} ticket(s)`} note={Number(rapport.credit) > 0 ? `dont crédit : ${montant(rapport.credit)}` : undefined} />
            <StatCard icone="depenses" libelle="Dépenses" valeur={montant(rapport.depenses?.montant)} detail={`${rapport.depenses?.nombre ?? 0} dépense(s)`} />
            <StatCard icone="cloture" libelle="Écart de caisse" ton={ecart < 0 ? 'alerte' : undefined}
              valeur={Number(clotures.nombre) > 0 ? ecartEnMots(ecart, rapport.devise ?? devise) : '—'}
              detail={Number(clotures.nombre) > 0 ? `${clotures.nombre} ticket(s) Z` : 'aucun ticket Z ce jour'}
              note={Number(clotures.a_compter) > 0 ? `${clotures.a_compter} à compter` : undefined} />
            <StatCard icone="caisse" libelle="Caisses encore ouvertes" valeur={String(rapport.caisses_ouvertes ?? 0)}
              ton={Number(rapport.caisses_ouvertes) > 0 ? 'attention' : undefined}
              detail={Number(rapport.caisses_ouvertes) > 0 ? 'à fermer avec un ticket Z' : 'tout est fermé'} />
            <StatCard icone="moins" libelle="Remises" valeur={montant(rapport.total_remises)} />
            <StatCard icone="fermer" libelle="Annulations" valeur={String(rapport.annulations?.nombre ?? 0)} detail={montant(rapport.annulations?.montant)}
              note={Number(rapport.retours?.nombre) > 0 ? `retours : ${rapport.retours.nombre} · ${montant(rapport.retours.montant)}` : undefined} />
          </div>

          <Journee a={analyse} ventes={journee} date={date || jourDeService(reglagesFonctions)} />

          <div className="deux-colonnes">
            <Section titre="Encaissé par mode">
              {rapport.encaissements?.length ? (
                <dl className="details">
                  {rapport.encaissements.map((e) => <div key={e.mode}><dt>{MODES_PAIEMENT[e.mode] ?? e.mode}</dt><dd><strong>{montant(e.montant)}</strong></dd></div>)}
                </dl>
              ) : <p className="texte-doux">Aucun encaissement ce jour.</p>}
            </Section>
            <Section titre="Top 5 des articles">
              {rapport.top_articles?.length ? (
                <ol className="rapport-soir-top">
                  {rapport.top_articles.map((a) => (
                    <li key={a.libelle}><span>{a.libelle}</span> <small className="texte-doux">× {formatQuantite(a.quantite)}</small> <strong>{montant(a.total)}</strong></li>
                  ))}
                </ol>
              ) : <p className="texte-doux">Aucun article vendu ce jour.</p>}
            </Section>
          </div>

          <Section titre="Par caissière / caissier">
            {rapport.caissiers?.length ? (
              <div className="tableau-conteneur">
                <table className="tableau">
                  <thead><tr><th>Personne</th><th className="nombre">Ventes</th><th className="nombre">Montant</th></tr></thead>
                  <tbody>
                    {rapport.caissiers.map((c) => (
                      <tr key={c.id ?? c.nom}><td><strong>{c.nom}</strong></td><td className="nombre">{c.nombre_ventes}</td><td className="nombre"><strong>{montant(c.total_ventes)}</strong></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="texte-doux">Aucune vente ce jour.</p>}
            {clotures.liste?.length > 0 && (
              <p className="texte-doux">
                Tickets Z : {clotures.liste.map((z) => `${z.numero} (${z.caissier ?? '—'} : ${z.a_compter ? 'espèces à compter' : ecartEnMots(z.ecart, rapport.devise ?? devise)})`).join(' · ')}
              </p>
            )}
          </Section>

          <Section titre="Envoyer au patron" sousTitre="WhatsApp s’ouvre avec le texte prêt : relisez puis appuyez sur Envoyer.">
            <div className="pile">
              <div className="rapport-soir-numero">
                <Champ libelle="Numéro WhatsApp du patron" aide="Vide : WhatsApp vous demandera à qui envoyer.">
                  <input type="tel" value={numero} placeholder="06 123 45 67" onChange={(e) => setNumero(e.target.value)} />
                </Champ>
                {peut('etablissement.modifier') && numero.trim() !== (rapport.whatsapp_patron ?? '') && (
                  <Bouton onClick={enregistrerNumero} chargement={enregistrement}>Enregistrer le numéro</Bouton>
                )}
              </div>
              <div className="actions">
                <a className="bouton principal" href={lien} target="_blank" rel="noopener noreferrer">Envoyer au patron sur WhatsApp</a>
                <Bouton icone="document" onClick={copier}>{copie ? 'Texte copié' : 'Copier le texte'}</Bouton>
                {Number(rapport.caisses_ouvertes) > 0 && <Badge ton="attention">{rapport.caisses_ouvertes} caisse(s) encore ouverte(s)</Badge>}
              </div>
              <Champ libelle="Texte du rapport">
                <textarea readOnly rows={14} value={texte} onFocus={(e) => e.target.select()} />
              </Champ>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
