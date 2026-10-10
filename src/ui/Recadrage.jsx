import React, { useEffect, useRef, useState } from 'react';
import { Bouton, Erreur } from './composants.jsx';

// Recadrage d'une photo (scan d'un justificatif, d'un document ; lot G2) : zone réglable à la souris, au doigt ou au
// clavier (flèches sur les poignées), rotation par quart de tour. Tout se fait sur l'appareil ; seule l'image
// recadrée et réduite est envoyée.

export const ZONE_ENTIERE = { x: 0, y: 0, l: 1, h: 1 };
const borne = (v, min, max) => Math.min(max, Math.max(min, v));

// Déplace une poignée (hg, hd, bg, bd) ou toute la zone (centre) de dx, dy (fractions de l'image).
export function ajusterZone(zone, poignee, dx, dy, min = 0.08) {
  let { x, y, l, h } = zone;
  if (poignee === 'centre') {
    return { x: borne(x + dx, 0, 1 - l), y: borne(y + dy, 0, 1 - h), l, h };
  }
  const droite = x + l;
  const bas = y + h;
  if (poignee === 'hg' || poignee === 'bg') x = borne(x + dx, 0, droite - min);
  if (poignee === 'hg' || poignee === 'hd') y = borne(y + dy, 0, bas - min);
  const nouvelleDroite = poignee === 'hd' || poignee === 'bd' ? borne(droite + dx, x + min, 1) : droite;
  const nouveauBas = poignee === 'bg' || poignee === 'bd' ? borne(bas + dy, y + min, 1) : bas;
  l = nouvelleDroite - x;
  h = nouveauBas - y;
  return { x, y, l, h };
}

// Rectangle en pixels de la zone, et dimensions de sortie (côté le plus long ≤ taille).
export function rectangleSortie(zone, largeur, hauteur, taille) {
  const sx = Math.round(zone.x * largeur);
  const sy = Math.round(zone.y * hauteur);
  const sl = Math.max(1, Math.round(zone.l * largeur));
  const sh = Math.max(1, Math.round(zone.h * hauteur));
  const echelle = Math.min(1, taille / Math.max(sl, sh));
  return { sx, sy, sl, sh, l: Math.max(1, Math.round(sl * echelle)), h: Math.max(1, Math.round(sh * echelle)) };
}

const charger = (source) => new Promise((resoudre, rejeter) => {
  const image = new Image();
  image.onload = () => resoudre(image);
  image.onerror = () => rejeter(new Error('Image illisible'));
  image.src = source;
});

// Quart de tour à droite : nouvelle image (data URL, qualité conservée).
export async function pivoterImage(source) {
  const image = await charger(source);
  const canvas = document.createElement('canvas');
  canvas.width = image.height;
  canvas.height = image.width;
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(image, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.92);
}

export async function recadrerImage(source, zone, taille = 1000) {
  const image = await charger(source);
  const r = rectangleSortie(zone, image.width, image.height, taille);
  const canvas = document.createElement('canvas');
  canvas.width = r.l;
  canvas.height = r.h;
  canvas.getContext('2d').drawImage(image, r.sx, r.sy, r.sl, r.sh, 0, 0, r.l, r.h);
  return canvas.toDataURL('image/jpeg', 0.78);
}

const POIGNEES = [['hg', 'Coin haut gauche'], ['hd', 'Coin haut droit'], ['bg', 'Coin bas gauche'], ['bd', 'Coin bas droit']];
const PAS = 0.02;
const FLECHES = { ArrowLeft: [-PAS, 0], ArrowRight: [PAS, 0], ArrowUp: [0, -PAS], ArrowDown: [0, PAS] };

export function Recadrage({ source, taille = 1000, onValider, onAnnuler }) {
  const [image, setImage] = useState(source);
  const [zone, setZone] = useState(ZONE_ENTIERE);
  const [erreur, setErreur] = useState('');
  const [travail, setTravail] = useState(false);
  const cadre = useRef(null);
  const glisse = useRef(null);
  useEffect(() => { setImage(source); setZone(ZONE_ENTIERE); }, [source]);

  const debut = (poignee) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    glisse.current = { poignee, x: e.clientX, y: e.clientY };
  };
  const bouge = (e) => {
    const g = glisse.current;
    const boite = cadre.current?.getBoundingClientRect();
    if (!g || !boite?.width) return;
    const dx = (e.clientX - g.x) / boite.width;
    const dy = (e.clientY - g.y) / boite.height;
    glisse.current = { ...g, x: e.clientX, y: e.clientY };
    setZone((z) => ajusterZone(z, g.poignee, dx, dy));
  };
  const fin = () => { glisse.current = null; };
  const clavier = (poignee) => (e) => {
    const f = FLECHES[e.key];
    if (!f) return;
    e.preventDefault();
    setZone((z) => ajusterZone(z, poignee, f[0], f[1]));
  };
  const agir = async (fn) => {
    setErreur('');
    setTravail(true);
    try {
      await fn();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setTravail(false);
    }
  };
  const pc = (v) => `${(v * 100).toFixed(2)}%`;
  return (
    <div className="recadrage pile" role="group" aria-label="Recadrer la photo">
      <p className="texte-doux">Faites glisser les coins (ou utilisez les flèches du clavier) pour ne garder que le document.</p>
      <div className="recadrage-cadre" ref={cadre} onPointerMove={bouge} onPointerUp={fin} onPointerCancel={fin}>
        <img src={image} alt="Photo à recadrer" draggable={false} />
        <div className="recadrage-zone" style={{ left: pc(zone.x), top: pc(zone.y), width: pc(zone.l), height: pc(zone.h) }}
          onPointerDown={debut('centre')} onKeyDown={clavier('centre')} tabIndex={0} role="button" aria-label="Zone gardée (déplacer)">
          {POIGNEES.map(([id, libelle]) => (
            <span key={id} className={`recadrage-poignee ${id}`} role="button" tabIndex={0} aria-label={libelle}
              onPointerDown={debut(id)} onKeyDown={clavier(id)} />
          ))}
        </div>
      </div>
      <p className="texte-doux" aria-live="polite">Zone gardée : {Math.round(zone.l * 100)} % × {Math.round(zone.h * 100)} % de la photo.</p>
      <Erreur message={erreur} />
      <div className="actions">
        <Bouton type="button" onClick={onAnnuler} disabled={travail}>Annuler</Bouton>
        <Bouton type="button" onClick={() => setZone(ZONE_ENTIERE)} disabled={travail}>Tout garder</Bouton>
        <Bouton type="button" disabled={travail}
          onClick={() => agir(async () => { setImage(await pivoterImage(image)); setZone(ZONE_ENTIERE); })}>Pivoter</Bouton>
        <Bouton type="button" variante="principal" chargement={travail}
          onClick={() => agir(async () => onValider(await recadrerImage(image, zone, taille)))}>Valider le recadrage</Bouton>
      </div>
    </div>
  );
}
