// Chiffrement des clés d'intégration (AES-GCM 256, WebCrypto). La clé maîtresse INTEGRATIONS_CLE (32 octets en base64)
// vit seulement dans les variables chiffrées du projet Cloudflare : ni la base, ni le dépôt, ni l'interface ne la voient.
const b64 = (octets) => btoa(String.fromCharCode(...new Uint8Array(octets)));
const deB64 = (texte) => Uint8Array.from(atob(texte), (c) => c.charCodeAt(0));

export function cleValide(env) {
  try {
    return deB64(env?.INTEGRATIONS_CLE ?? '').length === 32;
  } catch {
    return false;
  }
}

async function cle(env) {
  if (!cleValide(env)) throw new Error('Clé de chiffrement des intégrations absente ou invalide (INTEGRATIONS_CLE)');
  return crypto.subtle.importKey('raw', deB64(env.INTEGRATIONS_CLE), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

// Format stocké : « v1:<iv base64>:<texte chiffré base64> ». Le préfixe permettra de changer d'algorithme.
export async function chiffrer(texte, env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const chiffre = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cle(env), new TextEncoder().encode(String(texte)));
  return `v1:${b64(iv)}:${b64(chiffre)}`;
}

export async function dechiffrer(stocke, env) {
  const [version, iv, donnees] = String(stocke ?? '').split(':');
  if (version !== 'v1' || !iv || !donnees) throw new Error('Clé enregistrée illisible : ressaisissez-la');
  try {
    const clair = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(iv) }, await cle(env), deB64(donnees));
    return new TextDecoder().decode(clair);
  } catch {
    throw new Error('Clé enregistrée illisible : ressaisissez-la');
  }
}

export function secretAleatoire() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (o) => o.toString(16).padStart(2, '0')).join('');
}
