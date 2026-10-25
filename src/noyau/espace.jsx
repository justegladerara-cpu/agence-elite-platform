import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { fonctionActive } from './fonctions.js';
import { formatMontant } from './format.js';
import { caisseContinue, finLicence, licenceCoupee, peutEcrire } from './continuite.js';

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

  // Heure de fin précise de la licence : à cette heure, l'écran repasse en consultation seule et les comptes ouverts
  // sont déconnectés (une seule fois : à la reconnexion, la base répond déjà « consultation seule »).
  const [coupure, setCoupure] = useState(() => licenceCoupee(etablissement));
  const fin = finLicence(etablissement);
  const deconnecter = useRef(onDeconnexion);
  useEffect(() => {
    deconnecter.current = onDeconnexion;
  });
  useEffect(() => {
    setCoupure(licenceCoupee(etablissement));
    if (fin == null || Date.now() >= fin) return undefined;
    let minuterie;
    const attendre = () => {
      const reste = fin - Date.now();
      if (reste <= 0) {
        setCoupure(true);
        deconnecter.current?.();
        return;
      }
      // setTimeout est limité à ~24,8 jours ; on revérifie au plus toutes les heures.
      minuterie = setTimeout(attendre, Math.min(reste, 3600000));
    };
    attendre();
    return () => clearTimeout(minuterie);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etablissement?.id, fin]);

  // Fonctions allumées ou éteintes (Paramètres > Applications) : relues à chaque changement d'établissement.
  const [reglagesFonctions, setReglagesFonctions] = useState({});
  // Vrai une fois les réglages lus (la nouvelle version de The Dream en dépend pour ses pages).
  const [reglagesPrets, setReglagesPrets] = useState(false);
  const lireFonctions = useCallback(() => {
    if (!etablissement?.id || !api?.lire) {
      setReglagesPrets(true);
      return Promise.resolve();
    }
    return api.lire('etablissement_parametres', { eq: { etablissement_id: etablissement.id } })
      .then((lignes) => setReglagesFonctions(Object.fromEntries((lignes ?? []).map((l) => [l.module_id, l.data ?? {}]))))
      .catch(() => {})
      .finally(() => setReglagesPrets(true));
  }, [api, etablissement?.id]);
  useEffect(() => {
    setReglagesFonctions({});
    setReglagesPrets(false);
    lireFonctions();
  }, [lireFonctions]);
  // Enregistre une partie des réglages d'un module (les autres clés sont gardées) et met l'écran à jour tout de suite.
  const enregistrerReglages = useCallback(async (moduleId, modification) => {
    const actuel = reglagesFonctions[moduleId] ?? {};
    const data = { ...actuel, ...modification };
    await api.rpc('enregistrer_parametres_module', { p_etablissement_id: etablissement.id, p_module_id: moduleId, p_data: data });
    setReglagesFonctions((r) => ({ ...r, [moduleId]: data }));
    return data;
  }, [api, etablissement?.id, reglagesFonctions]);

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
      // Fiche employé liée au compte dans cet établissement (module RH), sinon null.
      employeId: etablissement?.employe_id ?? null,
      etablissements,
      etablissement,
      devise,
      // Licence échue (date seulement) : la caisse et les encaissements continuent (Elite License Guard).
      peut: (permission) => peutEcrire(etablissement, permission) && permissions.has(permission),
      caisseContinue: caisseContinue(etablissement),
      licenceCoupee: coupure,
      // Permission du rôle, même quand l'écriture est coupée (ex. : demander le renouvellement d'une licence expirée).
      aLaPermission: (permission) => permissions.has(permission),
      moduleActif: (module) => modules.has(module),
      reglagesFonctions,
      reglagesPrets,
      enregistrerReglages,
      // Nouvelle version (The Dream, 2026-10-25) : allumée établissement par établissement, rien ne change ailleurs.
      nouvelleVersion: reglagesFonctions.etablissement?.nouvelle_version === true,
      fonctionActive: (id) => fonctionActive(reglagesFonctions, id),
      relireFonctions: lireFonctions,
      montant: (n) => formatMontant(n, devise),
      choisirEtablissement: (id) => {
        memoriserChoix(id);
        setIdActif(id);
      },
      notifier,
      recharger: onRecharger,
      deconnecter: onDeconnexion,
    };
  }, [api, contexte, etablissements, etablissement, hubChoisi, notifier, onRecharger, onDeconnexion, coupure, reglagesFonctions, reglagesPrets, lireFonctions, enregistrerReglages]);

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
