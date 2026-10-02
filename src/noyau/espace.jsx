import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { formatMontant } from './format.js';

const ContexteEspace = createContext(null);
const CLE_ETABLISSEMENT = 'ae-etablissement-actif';
const CLE_HUB = 'ae-hub-actif';

function lireChoix(cle = CLE_ETABLISSEMENT) {
  try {
    return localStorage.getItem(cle);
  } catch {
    return null;
  }
}

function memoriserChoix(id, cle = CLE_ETABLISSEMENT) {
  try {
    if (id) localStorage.setItem(cle, id);
    else localStorage.removeItem(cle);
  } catch {
    // Préférence non mémorisée.
  }
}

// Hub actif : choisi automatiquement s'il n'y a qu'un Hub (le petit commerce ne voit jamais de choix).
// null = vue consolidée de tous les Hubs autorisés.
function hubInitial(etablissement) {
  const hubs = (etablissement?.hubs ?? []).filter((h) => h.actif);
  if (hubs.length === 1) return hubs[0].id;
  const memorise = lireChoix(`${CLE_HUB}-${etablissement?.id}`);
  return hubs.some((h) => h.id === memorise) ? memorise : null;
}

export function FournisseurEspace({ api, contexte, onRecharger, onDeconnexion, children }) {
  const etablissements = contexte.etablissements;
  const [idActif, setIdActif] = useState(() => {
    const memorise = lireChoix();
    return etablissements.some((e) => e.id === memorise) ? memorise : etablissements[0]?.id;
  });
  const [messages, setMessages] = useState([]);
  const compteur = useRef(0);
  const etablissement = etablissements.find((e) => e.id === idActif) ?? etablissements[0];
  const [hubChoisi, setHubChoisi] = useState(() => hubInitial(etablissement));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setHubChoisi(hubInitial(etablissement)), [etablissement?.id]);

  const notifier = useCallback((texte, ton = 'succes') => {
    compteur.current += 1;
    const id = compteur.current;
    setMessages((liste) => [...liste, { id, texte, ton }]);
    setTimeout(() => setMessages((liste) => liste.filter((m) => m.id !== id)), 4200);
  }, []);

  const valeur = useMemo(() => {
    const permissions = new Set(etablissement?.permissions ?? []);
    const modules = new Set(etablissement?.modules ?? []);
    const devise = etablissement?.devise ?? 'XAF';
    const hubs = (etablissement?.hubs ?? []).filter((h) => h.actif);
    const hub = hubs.find((h) => h.id === hubChoisi) ?? (hubs.length === 1 ? hubs[0] : null);
    return {
      api,
      contexte,
      editeur: ['super_admin', 'admin'].includes(contexte.editeur),
      roleEditeur: contexte.editeur,
      compte: contexte.compte,
      // Hubs autorisés de l'établissement ; « multiHub » faux = aucune notion de Hub à l'écran.
      hubs,
      hub,
      multiHub: hubs.length > 1,
      choisirHub: (id) => {
        memoriserChoix(id, `${CLE_HUB}-${etablissement?.id}`);
        setHubChoisi(id);
      },
      utilisateur: contexte.utilisateur,
      etablissements,
      etablissement,
      devise,
      peut: (permission) => Boolean(etablissement?.ecriture || permission.endsWith('.lire')) && permissions.has(permission),
      moduleActif: (module) => modules.has(module),
      montant: (n) => formatMontant(n, devise),
      choisirEtablissement: (id) => {
        memoriserChoix(id);
        setIdActif(id);
      },
      notifier,
      recharger: onRecharger,
      deconnecter: onDeconnexion,
    };
  }, [api, contexte, etablissements, etablissement, hubChoisi, notifier, onRecharger, onDeconnexion]);

  return (
    <ContexteEspace.Provider value={valeur}>
      {children}
      <div className="notifications" aria-live="polite">
        {messages.map((m) => <div key={m.id} className={`notification ${m.ton}`}>{m.texte}</div>)}
      </div>
    </ContexteEspace.Provider>
  );
}

export function useEspace() {
  const valeur = useContext(ContexteEspace);
  if (!valeur) throw new Error('Espace absent');
  return valeur;
}

// Charge des données et se recharge quand les dépendances changent.
export function useDonnees(charger, dependances) {
  const [etat, setEtat] = useState({ donnees: null, chargement: true, erreur: '' });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let actif = true;
    setEtat((e) => ({ ...e, chargement: true, erreur: '' }));
    charger()
      .then((donnees) => actif && setEtat({ donnees, chargement: false, erreur: '' }))
      .catch((erreur) => actif && setEtat({ donnees: null, chargement: false, erreur: erreur.message }));
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependances, version]);
  return { ...etat, recharger: () => setVersion((v) => v + 1) };
}

// Nom affiché d'une personne : son profil réel (jamais un nom codé en dur).
export function nomUtilisateur(u, defaut) {
  return u?.nom_affiche || u?.nom || [u?.prenom, u?.nom_famille].filter(Boolean).join(' ') || (defaut ?? u?.email ?? '');
}
