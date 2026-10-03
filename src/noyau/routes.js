import { useCallback, useEffect, useState } from 'react';

// Routes en « hash » : #/chemin/segment?cle=valeur. Le chemin complet est conservé (sous-pages).
export function lireRoute() {
  return window.location.hash.replace(/^#\/?/, '').split('?')[0];
}

export function lireParametres() {
  return new URLSearchParams(window.location.hash.split('?')[1] ?? '');
}

export function lireRequete() {
  return window.location.hash.split('?')[1] ?? '';
}

export function useRoute() {
  const [route, setRoute] = useState(lireRoute);
  const [requete, setRequete] = useState(lireRequete);
  useEffect(() => {
    const ecouter = () => { setRoute(lireRoute()); setRequete(lireRequete()); };
    window.addEventListener('hashchange', ecouter);
    return () => window.removeEventListener('hashchange', ecouter);
  }, []);
  const naviguer = useCallback((id) => {
    window.location.hash = `/${id}`;
  }, []);
  return [route, naviguer, requete];
}

export const lien = (chemin) => `#/${chemin}`;
