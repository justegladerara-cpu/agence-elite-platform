import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { formatMontant } from './format.js';

const ContexteEspace = createContext(null);
const CLE_ETABLISSEMENT = 'ae-etablissement-actif';

function lireChoix() {
  try {
    return localStorage.getItem(CLE_ETABLISSEMENT);
  } catch {
    return null;
  }
}

function memoriserChoix(id) {
  try {
    localStorage.setItem(CLE_ETABLISSEMENT, id);
  } catch {
    // Préférence non mémorisée.
  }
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
    return {
      api,
      contexte,
      editeur: contexte.editeur === 'super_admin',
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
  }, [api, contexte, etablissements, etablissement, notifier, onRecharger, onDeconnexion]);

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
