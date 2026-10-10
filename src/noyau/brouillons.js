import { useEffect, useRef, useState } from 'react';
import { useEspace } from './espace.jsx';

// Brouillons automatiques : un formulaire en cours est gardé sur l'appareil (par personne et par établissement)
// et proposé à la réouverture. Rien n'est envoyé au serveur. Effacé à l'enregistrement, à la déconnexion
// ou après 7 jours.
const PREFIXE = 'ae-brouillon:';
export const DUREE_BROUILLON_MS = 7 * 24 * 3600 * 1000;

export function cleBrouillon(utilisateur, etablissement, formulaire) {
  return `${PREFIXE}${utilisateur ?? 'anonyme'}:${etablissement ?? '-'}:${formulaire}`;
}

const memeContenu = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sans = (valeurs, exclure) => Object.fromEntries(Object.entries(valeurs ?? {}).filter(([k]) => !exclure.includes(k)));

export function lireBrouillon(stockage, cle, maintenant = Date.now()) {
  try {
    const brut = stockage?.getItem(cle);
    if (!brut) return null;
    const b = JSON.parse(brut);
    if (!b || typeof b !== 'object' || !b.valeurs || maintenant - Number(b.le) > DUREE_BROUILLON_MS) {
      stockage.removeItem(cle);
      return null;
    }
    return b;
  } catch {
    return null;
  }
}

// Renvoie 'ok', 'plein' (quota dépassé : stockage du téléphone plein) ou 'indisponible'.
export function ecrireBrouillon(stockage, cle, valeurs, version = null, maintenant = Date.now()) {
  if (!stockage) return 'indisponible';
  try {
    stockage.setItem(cle, JSON.stringify({ le: maintenant, version, valeurs }));
    return 'ok';
  } catch (err) {
    return /quota/i.test(`${err?.name} ${err?.message}`) || err?.code === 22 ? 'plein' : 'indisponible';
  }
}

export function effacerBrouillons(stockage, utilisateur = null) {
  if (!stockage) return;
  const cles = [];
  for (let i = 0; i < stockage.length; i += 1) {
    const cle = stockage.key(i);
    if (cle?.startsWith(PREFIXE) && (!utilisateur || cle.startsWith(`${PREFIXE}${utilisateur}:`))) cles.push(cle);
  }
  cles.forEach((cle) => stockage.removeItem(cle));
}

function stockageLocal() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// valeurs/setValeurs : l'état du formulaire. pret : faux tant que le formulaire n'a pas ses valeurs de départ.
// version : identifiant de la version enregistrée de l'objet modifié (ex. modifie_le) ; si elle a changé depuis
// le brouillon, le brouillon n'est pas appliqué tout seul (état « conflit »).
export function useBrouillon(formulaire, valeurs, setValeurs, { exclure = [], pret = true, version = null } = {}) {
  const { utilisateur, etablissement } = useEspace();
  const cle = cleBrouillon(utilisateur?.id, etablissement?.id, formulaire);
  const depart = useRef(null);
  const [etat, setEtat] = useState({ restaure: null, conflit: null, stockage: 'ok' });
  const minuterie = useRef(null);
  useEffect(() => {
    if (!pret || depart.current) return;
    depart.current = sans(valeurs, exclure);
    const b = lireBrouillon(stockageLocal(), cle);
    if (!b || memeContenu(b.valeurs, depart.current)) return;
    if (version != null && b.version != null && String(b.version) !== String(version)) {
      setEtat((x) => ({ ...x, conflit: b }));
      return;
    }
    setValeurs((v) => ({ ...v, ...b.valeurs }));
    setEtat((x) => ({ ...x, restaure: new Date(Number(b.le)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pret, cle]);
  useEffect(() => {
    if (!pret || !depart.current || etat.conflit) return undefined;
    clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => {
      const stockage = stockageLocal();
      const actuel = sans(valeurs, exclure);
      if (memeContenu(actuel, depart.current)) {
        try { stockage?.removeItem(cle); } catch { /* stockage indisponible */ }
        return;
      }
      const r = ecrireBrouillon(stockage, cle, actuel, version);
      setEtat((x) => (x.stockage === r ? x : { ...x, stockage: r }));
    }, 600);
    return () => clearTimeout(minuterie.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valeurs, pret, cle, etat.conflit]);
  const effacer = () => {
    clearTimeout(minuterie.current);
    try { stockageLocal()?.removeItem(cle); } catch { /* stockage indisponible */ }
    setEtat((x) => ({ ...x, restaure: null, conflit: null }));
  };
  const abandonner = () => {
    if (depart.current) setValeurs((v) => ({ ...v, ...depart.current }));
    effacer();
  };
  const reprendre = () => {
    if (etat.conflit) setValeurs((v) => ({ ...v, ...etat.conflit.valeurs }));
    setEtat((x) => ({ ...x, restaure: x.conflit ? new Date(Number(x.conflit.le)) : x.restaure, conflit: null }));
  };
  return { ...etat, effacer, abandonner, reprendre };
}
