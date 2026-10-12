import React, { useEffect, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDateHeure } from '../../noyau/format.js';
import { Badge, Bouton, EmptyState, Erreur, ModaleMotif, PageHeader, Squelette } from '../../ui/composants.jsx';
import { mesCaisses } from './mesCaisses.js';
import './menu-qr.css';

const RAFRAICHIR_MS = 15000;

// Minutes écoulées depuis l'envoi d'une commande (« à l'instant », « 4 min », « 1 h 05 »).
export function attente(cree_le, maintenant = Date.now()) {
  const min = Math.max(0, Math.floor((maintenant - new Date(cree_le).getTime()) / 60000));
  if (min < 1) return 'à l’instant';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

// Commandes envoyées depuis les QR codes des tables. Accepter = facture en cours de MA caisse (ou commande de la table
// avec le module Salle). Rafraîchi toutes les 15 secondes.
export function ListeCommandesQr({ session, onPris }) {
  const { api, etablissement, utilisateur, montant, notifier, peut, moduleActif } = useEspace();
  const etab = etablissement.id;
  const [version, setVersion] = useState(0);
  const { donnees, chargement, erreur } = useDonnees(async () => {
    const [nouvelles, traitees, emplacements, sessions] = await Promise.all([
      api.lire('commandes_qr', { eq: { etablissement_id: etab, statut: 'nouvelle' }, ordre: ['cree_le'] }),
      api.lire('commandes_qr', { eq: { etablissement_id: etab }, ordre: ['cree_le', 'desc'], limite: 15 }),
      api.lire('emplacements_qr', { eq: { etablissement_id: etab } }),
      session ? Promise.resolve([session]) : api.lire('sessions_caisse', { eq: { etablissement_id: etab, statut: 'ouverte' } }).catch(() => []),
    ]);
    return {
      nouvelles, traitees: traitees.filter((c) => c.statut !== 'nouvelle'),
      emplacements: Object.fromEntries(emplacements.map((e) => [e.id, e])),
      sessions: session ? [session] : mesCaisses(sessions, utilisateur),
    };
  }, [etab, version, session?.id]);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      setMaintenant(Date.now());
      if (document.visibilityState !== 'hidden') setVersion((v) => v + 1);
    }, RAFRAICHIR_MS);
    return () => clearInterval(t);
  }, []);
  const [refus, setRefus] = useState(null);
  const [enCours, setEnCours] = useState(null);
  const [erreurAction, setErreurAction] = useState('');
  if (chargement && !donnees) return <Squelette />;
  if (erreur) return <Erreur message={erreur} />;

  const accepter = async (c, cible) => {
    setEnCours(c.id);
    setErreurAction('');
    try {
      const caisse = donnees.sessions.find((s) => s.hub_id === c.hub_id);
      await api.rpc('accepter_commande_qr', { p_commande_id: c.id, p_cible: cible, p_session_id: cible === 'caisse' ? caisse?.id ?? null : null });
      const nom = donnees.emplacements[c.emplacement_id]?.libelle ?? 'table';
      notifier(cible === 'caisse' ? `${c.numero} : facture en cours « ${nom} » dans votre caisse` : `${c.numero} : ajoutée à la commande de ${nom}`);
      setVersion((v) => v + 1);
      onPris?.();
    } catch (err) {
      setErreurAction(err.message);
    } finally {
      setEnCours(null);
    }
  };

  return (
    <div className="commandes-qr">
      <Erreur message={erreurAction} />
      {!donnees.nouvelles.length && <EmptyState icone="table" titre="Aucune commande en attente" texte="Les commandes envoyées depuis les QR codes des tables arrivent ici." />}
      {donnees.nouvelles.map((c) => {
        const e = donnees.emplacements[c.emplacement_id];
        const caisse = donnees.sessions.find((s) => s.hub_id === c.hub_id);
        const salle = e?.table_id && moduleActif('restaurant_salle') && peut('restaurant_salle.servir');
        return (
          <article key={c.id} className="carte-commande-qr">
            <header>
              <strong>{e?.libelle ?? 'Table'}</strong>
              <span className="texte-doux">{c.numero} · {attente(c.cree_le, maintenant)}</span>
              <Badge ton="orange">nouvelle</Badge>
            </header>
            <ul>
              {c.lignes.map((l) => <li key={l.article_id}><strong>{l.quantite} ×</strong> {l.nom}{l.note ? <em className="texte-doux"> · {l.note}</em> : ''}</li>)}
            </ul>
            {(c.nom_client || c.note || c.couverts) && (
              <p className="texte-doux">{[c.nom_client, c.couverts ? `${c.couverts} personne(s)` : null, c.note].filter(Boolean).join(' · ')}</p>
            )}
            <footer>
              <strong>{montant(c.total)}</strong>
              <span className="actions-ligne">
                {peut('caisse.utiliser') && (
                  <Bouton variante={salle ? 'secondaire' : 'principal'} chargement={enCours === c.id} disabled={!caisse} onClick={() => accepter(c, 'caisse')}
                    title={caisse ? undefined : 'Ouvrez votre caisse pour prendre la commande'}>
                    {caisse ? 'Prendre en caisse' : 'Ouvrez votre caisse'}
                  </Bouton>
                )}
                {salle && <Bouton variante="principal" chargement={enCours === c.id} onClick={() => accepter(c, 'salle')}>Envoyer sur la table</Bouton>}
                <Bouton onClick={() => setRefus(c)}>Refuser</Bouton>
              </span>
            </footer>
          </article>
        );
      })}
      {donnees.traitees.length > 0 && (
        <details className="commandes-qr-historique">
          <summary>Dernières commandes traitées</summary>
          <ul>
            {donnees.traitees.map((c) => (
              <li key={c.id}>
                {formatDateHeure(c.cree_le)} · {donnees.emplacements[c.emplacement_id]?.libelle} · {c.numero} · {montant(c.total)} ·{' '}
                {c.statut === 'acceptee' ? <Badge ton="vert">acceptée</Badge> : <Badge ton="rouge">refusée</Badge>}
                {c.motif_refus ? ` ${c.motif_refus}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
      {refus && (
        <ModaleMotif
          titre={`Refuser ${refus.numero}`}
          texte="Le client voit ce motif sur son téléphone (ex. « plus de poulet », « cuisine fermée »)."
          libelleAction="Refuser la commande"
          onValider={async (motif) => {
            await api.rpc('refuser_commande_qr', { p_commande_id: refus.id, p_motif: motif });
            notifier(`${refus.numero} refusée`);
            setVersion((v) => v + 1);
          }}
          onFermer={() => setRefus(null)}
        />
      )}
    </div>
  );
}

export default function CommandesQr({ naviguer }) {
  const { peut } = useEspace();
  return (
    <div className="page">
      <PageHeader
        titre="Commandes des tables"
        sousTitre="Commandes envoyées par les clients depuis le QR code de leur table. Rien n’est encaissé ni sorti du stock avant la caisse."
        actions={(
          <>
            {peut('caisse.utiliser') && <Bouton icone="caisse" onClick={() => naviguer('caisse')}>Ouvrir la caisse</Bouton>}
            {peut('caisse.menu_qr') && <Bouton onClick={() => naviguer('menu-qr')}>Réglages du menu QR</Bouton>}
          </>
        )}
      />
      <ListeCommandesQr />
    </div>
  );
}
