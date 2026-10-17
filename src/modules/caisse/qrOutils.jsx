import React, { useEffect, useMemo, useState } from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { cheminFormes, planQr, svgQr, verifierLisibilite } from '../../noyau/qr.js';

// Outils communs aux QR codes (menu des tables et écran « QR codes ») : logo de l'établissement, image à l'écran,
// contrôle de lecture, téléchargement PNG / SVG et impression.

// Le logo est mis en adresse data: : le fichier SVG reste autonome et le PNG n'est pas bloqué par le navigateur.
async function logoEnDataUrl(adresse) {
  if (!adresse) return null;
  if (adresse.startsWith('data:image/')) return adresse;
  try {
    const reponse = await fetch(adresse, { mode: 'cors' });
    if (!reponse.ok) return null;
    const fichier = await reponse.blob();
    if (!fichier.type.startsWith('image/')) return null;
    return await new Promise((resoudre) => {
      const lecteur = new FileReader();
      lecteur.onload = () => resoudre(String(lecteur.result));
      lecteur.onerror = () => resoudre(null);
      lecteur.readAsDataURL(fichier);
    });
  } catch {
    // Adresse hors de la liste autorisée pour les appels (connect-src) : on passe par une image.
    return new Promise((resoudre) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        try {
          const toile = document.createElement('canvas');
          toile.width = Math.min(image.width, 512);
          toile.height = Math.round(image.height * (toile.width / image.width));
          toile.getContext('2d').drawImage(image, 0, 0, toile.width, toile.height);
          resoudre(toile.toDataURL('image/png'));
        } catch {
          resoudre(null);
        }
      };
      image.onerror = () => resoudre(null);
      image.src = adresse;
    });
  }
}

// Logo et couleur de l'établissement ouvert (Paramètres › Entreprise).
export function useApparenceQr() {
  const { etablissement } = useEspace();
  const adresse = etablissement.identite?.logo_url || etablissement.marque?.documents?.logo_url || '';
  const [logo, setLogo] = useState(() => (adresse.startsWith('data:image/') ? adresse : null));
  useEffect(() => {
    let actif = true;
    logoEnDataUrl(adresse).then((l) => actif && setLogo(l));
    return () => {
      actif = false;
    };
  }, [adresse]);
  return { logo, couleur: etablissement.identite?.couleur_principale || '', logoAbsent: !adresse, logoIllisible: Boolean(adresse) && !logo };
}

// QR code à l'écran (et à l'impression).
export function ImageQr({ texte, libelle, logo = null, style = {} }) {
  const cle = JSON.stringify(style ?? {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const svg = useMemo(() => svgQr(texte, { logo, style }), [texte, logo, cle]);
  // eslint-disable-next-line react/no-danger
  return <div className="image-qr" role="img" aria-label={`QR code ${libelle}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}

const chargerImage = (src) => new Promise((resoudre) => {
  const image = new Image();
  image.onload = () => resoudre(image);
  image.onerror = () => resoudre(null);
  image.src = src;
});

// Dessin sur une toile (canvas), à partir du même plan que le SVG. fondBlanc : pour le contrôle de lecture.
export async function dessinerToile(texte, { style = {}, logo = null, largeur = 1024, fondBlanc = false } = {}) {
  const plan = planQr(texte, { style, logo: Boolean(logo) });
  const echelle = largeur / plan.largeur;
  const toile = document.createElement('canvas');
  toile.width = largeur;
  toile.height = Math.round(plan.hauteur * echelle);
  const ctx = toile.getContext('2d');
  if (fondBlanc) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, toile.width, toile.height);
  }
  ctx.scale(echelle, echelle);
  const { qr } = plan;
  const remplir = (calque) => {
    if (!calque.degrade) return calque.couleur;
    const g = ctx.createLinearGradient(qr.x, qr.y, qr.x + qr.cote, qr.y + qr.cote);
    g.addColorStop(0, calque.couleur);
    g.addColorStop(1, calque.degrade);
    return g;
  };
  if (plan.cadre) {
    ctx.fillStyle = plan.cadre.couleur;
    ctx.fill(new Path2D(cheminFormes(plan.cadre.formes)), 'evenodd');
  }
  if (plan.fond) {
    ctx.fillStyle = plan.fond;
    ctx.fillRect(qr.x, qr.y, qr.cote, qr.cote);
  }
  for (const calque of [plan.modules, plan.yeux]) {
    ctx.fillStyle = remplir(calque);
    ctx.fill(new Path2D(cheminFormes(calque.formes)), 'evenodd');
  }
  const image = logo && plan.logo && await chargerImage(logo);
  if (image) {
    const { fond, image: zone } = plan.logo;
    ctx.fillStyle = plan.fond ?? '#ffffff';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(fond.x, fond.y, fond.cote, fond.cote, fond.rayon);
    else ctx.rect(fond.x, fond.y, fond.cote, fond.cote);
    ctx.fill();
    const rapport = Math.min(zone.cote / image.width, zone.cote / image.height);
    const l = image.width * rapport;
    const h = image.height * rapport;
    ctx.drawImage(image, zone.x + (zone.cote - l) / 2, zone.y + (zone.cote - h) / 2, l, h);
  }
  if (plan.cadre) {
    const c = plan.cadre;
    ctx.fillStyle = c.couleurTexte;
    ctx.font = `700 ${c.police}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.texte, c.x, c.y, c.largeurMax);
  }
  return toile;
}

// Contrôle avant téléchargement : règles de lisibilité, puis lecture réelle du dessin par jsQR (sans essai « couleurs
// inversées », comme beaucoup de téléphones). verifie : faux si le navigateur n'a pas pu faire la lecture.
export async function controlerQr(texte, { style = {}, logo = null } = {}) {
  const regles = verifierLisibilite(style, { logo: Boolean(logo), taille: planQr(texte, { logo: Boolean(logo) }).taille });
  const problemes = [...regles.problemes];
  let verifie = false;
  try {
    const { default: jsQR } = await import('jsqr');
    const toile = await dessinerToile(texte, { style, logo, largeur: 600, fondBlanc: true });
    const { data } = toile.getContext('2d').getImageData(0, 0, toile.width, toile.height);
    const lu = jsQR(data, toile.width, toile.height, { inversionAttempts: 'dontInvert' });
    verifie = true;
    if (lu?.data !== texte) problemes.push({ grave: true, texte: 'Ce QR code ne se lit pas : changez les couleurs, le style ou retirez le logo.' });
  } catch {
    // Navigateur sans canvas (tests) : seules les règles s'appliquent.
  }
  return { lisible: !problemes.some((p) => p.grave), problemes, verifie };
}

const nomFichier = (nom) => String(nom || 'qr-code').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'qr-code';

function enregistrerFichier(blob, nom) {
  const adresse = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = adresse;
  lien.download = nom;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(adresse), 1000);
}

// PNG en 512, 1024 ou 2048 px de large, dessiné forme par forme : net à l'impression.
export async function telechargerPng(texte, nom, { style = {}, logo = null, taille = 1024 } = {}) {
  const toile = await dessinerToile(texte, { style, logo, largeur: taille });
  const blob = await new Promise((resoudre) => toile.toBlob(resoudre, 'image/png'));
  if (!blob) throw new Error('Le navigateur n’a pas pu fabriquer l’image');
  enregistrerFichier(blob, `${nomFichier(nom)}-${taille}.png`);
}

export function telechargerSvg(texte, nom, { style = {}, logo = null } = {}) {
  enregistrerFichier(new Blob([svgQr(texte, { style, logo })], { type: 'image/svg+xml' }), `${nomFichier(nom)}.svg`);
}

// La feuille de QR codes ne s'imprime que pendant cet appel : la classe est retirée juste après,
// pour ne jamais gêner l'impression des reçus, tickets Z et factures.
export function imprimerQr() {
  const fin = () => { document.body.classList.remove('impression-qr'); window.removeEventListener('afterprint', fin); };
  document.body.classList.add('impression-qr');
  window.addEventListener('afterprint', fin);
  setTimeout(() => { window.print(); if (!('onafterprint' in window)) fin(); }, 50);
}
