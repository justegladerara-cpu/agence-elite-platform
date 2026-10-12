import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { Bouton, Modale } from '../../ui/composants.jsx';
import { lireCoupures, ModaleZ, SessionOuverte } from '../cloture/Clotures.jsx';
import { mesCaisses } from './mesCaisses.js';
import {
  accueilDejaVu, caisseLaPlusRecente, CLE_ACTIVITE, EVENEMENT_CAISSE_FERMEE, compteARebours, delaiReponse, delaiVerrouillage, etatPresence,
  heureOuverture, noterAccueilVu, prenomCaisse, resteAvantDeconnexion,
} from './verrouCaisse.js';

const EVENEMENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'];

const stockageSession = () => { try { return window.sessionStorage; } catch { return null; } };

// Monté dans toute l'application. Seulement si la personne a SA caisse ouverte :
// - à la connexion, « Tu continues ? » (une fois par connexion) ;
// - après le délai sans activité (Paramètres › Clôture), « Tu es toujours là ? » avec un compte à rebours, puis
//   déconnexion. La caisse reste ouverte. Un mouvement de souris ne ferme pas la question : il faut cliquer un bouton.
export default function VerrouCaisse() {
  const { api, etablissement, utilisateur, peut, deconnecter, montant } = useEspace();
  const actif = Boolean(etablissement && peut('caisse.utiliser') && deconnecter);
  const [reglages, setReglages] = useState(null);
  // question : { type: 'accueil' | 'presence', session, apercu, etape: 'question' | 'fermeture' } ; z : ticket Z édité.
  const [question, setQuestion] = useState(null);
  const [z, setZ] = useState(null);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const derniere = useRef(Date.now());
  const questionRef = useRef(null);
  questionRef.current = question;

  const toucher = useCallback(() => {
    derniere.current = Date.now();
    try { window.localStorage.setItem(CLE_ACTIVITE, String(derniere.current)); } catch { /* stockage indisponible */ }
  }, []);

  const maCaisse = useCallback(async () => {
    const sessions = await api.lire('sessions_caisse', { eq: { etablissement_id: etablissement.id, statut: 'ouverte' } });
    const session = caisseLaPlusRecente(mesCaisses(sessions, utilisateur));
    if (!session) return null;
    const [apercu, attentes] = await Promise.all([
      api.rpc('apercu_cloture', { p_session_id: session.id }).catch(() => null),
      api.lire('ventes_en_attente', { eq: { session_caisse_id: session.id, statut: 'en_attente' } }).catch(() => []),
    ]);
    return { session, apercu, attentes: attentes?.length ?? 0 };
  }, [api, etablissement?.id, utilisateur]);

  useEffect(() => {
    if (!actif) return undefined;
    let annule = false;
    api.lire('etablissement_parametres', { eq: { etablissement_id: etablissement.id, module_id: 'cloture' } })
      .catch(() => [])
      .then((lignes) => {
        const data = lignes?.[0]?.data ?? null;
        if (!annule) setReglages({ delai: delaiVerrouillage(data), reponse: delaiReponse(data), coupures: lireCoupures(data?.coupures) });
      });
    return () => { annule = true; };
  }, [actif, api, etablissement?.id]);

  // « Tu continues ? » à la connexion.
  useEffect(() => {
    if (!actif || !utilisateur?.id || accueilDejaVu(stockageSession(), utilisateur.id)) return undefined;
    let annule = false;
    maCaisse().then((trouvee) => {
      if (annule) return;
      noterAccueilVu(stockageSession(), utilisateur.id);
      if (trouvee && !questionRef.current) setQuestion({ type: 'accueil', etape: 'question', ...trouvee });
    }).catch(() => { /* réseau coupé : pas de question */ });
    return () => { annule = true; };
  }, [actif, utilisateur?.id, maCaisse]);

  // « Tu es toujours là ? » après le délai sans activité.
  const delai = reglages?.delai ?? 0;
  const reponse = reglages?.reponse ?? 0;
  useEffect(() => {
    if (!actif || !delai) return undefined;
    derniere.current = Date.now();
    const bouger = () => {
      // Pendant la question, seul un bouton y répond.
      if (questionRef.current?.type === 'presence' && questionRef.current.etape === 'question') return;
      toucher();
    };
    // Réponse dans un autre onglet : la question se ferme ici aussi.
    const autreOnglet = (e) => {
      if (e.key !== CLE_ACTIVITE || !e.newValue) return;
      derniere.current = Math.max(derniere.current, Number(e.newValue) || 0);
      if (questionRef.current?.type === 'presence' && questionRef.current.etape === 'question') setQuestion(null);
    };
    EVENEMENTS.forEach((e) => window.addEventListener(e, bouger, { passive: true }));
    window.addEventListener('storage', autreOnglet);
    let verification = false;
    const minuterie = setInterval(async () => {
      const t = Date.now();
      const etat = etatPresence(derniere.current, t, delai, reponse);
      const enQuestion = questionRef.current?.type === 'presence';
      if (enQuestion) {
        setMaintenant(t);
        if (questionRef.current.etape === 'question') {
          if (etat === 'deconnecter') deconnecter('verrouillee');
        } else if (etat !== 'actif') {
          // Parti pendant le comptage : la question revient, avec son compte à rebours.
          setQuestion({ ...questionRef.current, etape: 'question' });
        }
        return;
      }
      if (etat === 'actif' || verification) return;
      verification = true;
      try {
        // Seulement si la personne a une caisse ouverte avec son compte.
        const trouvee = await maCaisse();
        if (!trouvee) {
          derniere.current = Date.now();
          return;
        }
        if (etatPresence(derniere.current, Date.now(), delai, reponse) === 'deconnecter') deconnecter('verrouillee');
        else {
          setMaintenant(Date.now());
          setQuestion({ type: 'presence', etape: 'question', ...trouvee });
        }
      } catch {
        /* réseau coupé : on réessaie au prochain tour */
      } finally {
        verification = false;
      }
    }, 1000);
    return () => {
      clearInterval(minuterie);
      EVENEMENTS.forEach((e) => window.removeEventListener(e, bouger));
      window.removeEventListener('storage', autreOnglet);
    };
  }, [actif, delai, reponse, maCaisse, deconnecter, toucher]);

  const continuer = () => {
    toucher();
    setQuestion(null);
  };

  if (z) {
    return (
      <ModaleZ
        key={z.id}
        z={z}
        deconnexion
        onFermer={() => {
          setZ(null);
          window.dispatchEvent(new Event(EVENEMENT_CAISSE_FERMEE));
        }}
      />
    );
  }
  if (!question) return null;
  const { session, apercu } = question;

  if (question.etape === 'fermeture') {
    return (
      <Modale titre="Fermeture de caisse" onFermer={() => { toucher(); setQuestion({ ...question, etape: 'question' }); }}>
        <SessionOuverte
          session={session}
          coupures={reglages?.coupures ?? []}
          attentes={question.attentes ?? 0}
          onCloturee={(ticket) => {
            setQuestion(null);
            setZ(ticket);
          }}
        />
      </Modale>
    );
  }

  const prenom = prenomCaisse(utilisateur);
  const presence = question.type === 'presence';
  const reste = resteAvantDeconnexion(derniere.current, maintenant, delai, reponse);
  const resume = [
    `Ta caisse est ouverte depuis ${heureOuverture(apercu?.ouverte_le ?? session.ouverte_le)}`,
    apercu && `${apercu.nombre_ventes} vente${apercu.nombre_ventes > 1 ? 's' : ''}`,
    apercu && montant(apercu.total_ventes),
  ].filter(Boolean).join(' · ');
  return (
    <Modale titre={presence ? `${prenom ? `${prenom}, tu` : 'Tu'} es toujours là ?` : `Bonjour${prenom ? ` ${prenom}` : ''} 👋`}>
      <div className="presence-caisse">
        <p className="presence-resume">{resume}.</p>
        {presence ? (
          <>
            <p>Personne n’a touché l’écran depuis {delai} minute{delai > 1 ? 's' : ''}.</p>
            <p className="presence-rebours" role="timer" aria-live="off">Déconnexion automatique dans <strong>{compteARebours(reste)}</strong></p>
          </>
        ) : <p className="presence-question">Tu continues à travailler ?</p>}
        <div className="presence-actions">
          <Bouton variante="principal grand" onClick={continuer}>Oui, je continue</Bouton>
          <Bouton variante="secondaire grand" onClick={() => { toucher(); setQuestion({ ...question, etape: 'fermeture' }); }}>Non, fermer ma caisse</Bouton>
          <Bouton variante="secondaire grand" onClick={() => deconnecter('autre')}>Ce n’est pas moi</Bouton>
        </div>
        <p className="texte-doux">« Ce n’est pas moi » déconnecte ce compte : ta caisse reste ouverte et l’autre personne se connecte avec son propre compte.</p>
      </div>
    </Modale>
  );
}
