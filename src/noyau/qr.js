import qrcode from 'qrcode-generator';

// QR code en SVG (aucun service extérieur : l'image est fabriquée dans le navigateur).
export function svgQr(texte, { marge = 2 } = {}) {
  const qr = qrcode(0, 'M');
  qr.addData(String(texte));
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: marge, scalable: true });
}

// Adresse publique du menu d'une table : même site que l'écran ouvert (sous-domaine du client compris).
export function lienMenu(jeton, origine = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '') {
  return `${origine}#/menu/${jeton}`;
}
