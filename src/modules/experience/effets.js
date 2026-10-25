// Petits effets de la nouvelle version : coche verte et son léger après un encaissement, bip de présence.
// Aucun fichier son à télécharger (connexion lente au Congo) : les sons sont fabriqués par le navigateur.

let contexteAudio = null;

function audio() {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  try {
    contexteAudio ??= new Ctx();
    if (contexteAudio.state === 'suspended') contexteAudio.resume().catch(() => {});
    return contexteAudio;
  } catch {
    return null;
  }
}

function note(ctx, frequence, debut, duree, volume = 0.08, forme = 'sine') {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = forme;
  osc.frequency.value = frequence;
  gain.gain.setValueAtTime(0, ctx.currentTime + debut);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + debut + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + debut + duree);
  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime + debut);
  osc.stop(ctx.currentTime + debut + duree + 0.05);
}

// Deux notes claires et douces (« ding-ding ») : la vente est passée.
export function sonEncaisse() {
  const ctx = audio();
  if (!ctx) return;
  note(ctx, 1046.5, 0, 0.22);
  note(ctx, 1568, 0.09, 0.35);
}

// Bip de présence : trois petits bips, plus présents, pour la caissière qui s'est éloignée.
export function bipPresence() {
  const ctx = audio();
  if (!ctx) return;
  [0, 0.25, 0.5].forEach((t) => note(ctx, 880, t, 0.16, 0.12, 'triangle'));
}

const reduit = () => typeof window !== 'undefined'
  && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.animations === 'reduit');

// Grande coche verte au centre de l'écran, 0,9 s. Indépendante des écrans : elle reste visible pendant qu'ils changent.
export function cocheVerte(texte = 'Encaissé') {
  if (typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.className = 'xp-coche';
  el.setAttribute('role', 'status');
  el.innerHTML = `<div class="xp-coche-rond"><svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24" fill="none"/><path fill="none" d="M15 27l7 7 15-16"/></svg></div><strong></strong>`;
  el.querySelector('strong').textContent = texte;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('sortie'), reduit() ? 500 : 750);
  setTimeout(() => el.remove(), reduit() ? 700 : 1100);
}

export function celebrerEncaissement(texte) {
  cocheVerte(texte);
  sonEncaisse();
}
