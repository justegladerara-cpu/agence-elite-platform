// Signature des webhooks : en-tête « X-AE-Signature: t=<secondes>,v1=<hmac hex> », HMAC-SHA256 de « <t>.<corps> ».
// Refus si la signature est fausse ou si l'horodatage a plus de 5 minutes (rejeu).
const hex = (octets) => Array.from(new Uint8Array(octets), (o) => o.toString(16).padStart(2, '0')).join('');

async function hmac(secret, message) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(message)));
}

function egaux(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signer(secret, corps, maintenant = Date.now()) {
  const t = Math.floor(maintenant / 1000);
  return `t=${t},v1=${await hmac(secret, `${t}.${corps}`)}`;
}

export async function verifierSignature(secret, corps, entete, maintenant = Date.now(), toleranceS = 300) {
  const parties = Object.fromEntries(String(entete ?? '').split(',').map((p) => p.trim().split('=')));
  const t = Number(parties.t);
  if (!Number.isInteger(t) || !/^[0-9a-f]{64}$/.test(parties.v1 ?? '')) return { ok: false, raison: 'Signature absente ou mal formée' };
  if (Math.abs(maintenant / 1000 - t) > toleranceS) return { ok: false, raison: 'Signature expirée (rejeu refusé)' };
  if (!egaux(await hmac(secret, `${t}.${corps}`), parties.v1)) return { ok: false, raison: 'Signature invalide' };
  return { ok: true };
}
