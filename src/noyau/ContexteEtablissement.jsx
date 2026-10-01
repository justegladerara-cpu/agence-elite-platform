import React from 'react';
import { createContext, useContext, useMemo, useState } from 'react';
const Contexte = createContext(null);
export function FournisseurEtablissement({ etablissements, children }) {
  const [id, definirId] = useState(etablissements[0]?.id ?? null);
  const valeur = useMemo(() => ({ etablissement: etablissements.find((e) => e.id === id) ?? null, definirId }), [etablissements, id]);
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}
export function useEtablissement() {
  const valeur = useContext(Contexte);
  if (!valeur) throw new Error('Contexte établissement absent');
  return valeur;
}
export function SelecteurEtablissement({ etablissements }) {
  const { etablissement, definirId } = useEtablissement();
  return <label>Établissement <select aria-label="Établissement" value={etablissement?.id ?? ''} onChange={(e) => definirId(e.target.value)}>{etablissements.map((item) => <option key={item.id} value={item.id}>{item.nom}</option>)}</select></label>;
}
