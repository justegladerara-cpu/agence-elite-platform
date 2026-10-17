// Happy hour (prix réduits selon l'heure) : règles pures, sans accès à la base, testées dans
// tests/offerts_happyhour_pourboires.test.js. Même règle que public.pourcentage_happy_hour (migration 20261017000135).
// L'heure est celle de l'appareil de la caisse (il est dans l'établissement).

// 1 = lundi … 7 = dimanche (comme dans la base).
export const JOURS = [
  { id: 1, court: 'Lun', nom: 'lundi' },
  { id: 2, court: 'Mar', nom: 'mardi' },
  { id: 3, court: 'Mer', nom: 'mercredi' },
  { id: 4, court: 'Jeu', nom: 'jeudi' },
  { id: 5, court: 'Ven', nom: 'vendredi' },
  { id: 6, court: 'Sam', nom: 'samedi' },
  { id: 7, court: 'Dim', nom: 'dimanche' },
];

// « 18:00 » ou « 18:00:00 » → minutes depuis minuit ; null si illisible.
export function minutesDe(heure) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(heure ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mn = Number(m[2]);
  if (h > 23 || mn > 59) return null;
  return h * 60 + mn;
}

// « 18:00:00 » → « 18:00 ».
export const heureCourte = (heure) => String(heure ?? '').slice(0, 5);

// Jour (1 à 7, lundi = 1) et minutes d'une date, à l'heure locale de l'appareil.
export function momentDe(date) {
  const d = date instanceof Date ? date : new Date(date);
  return { jour: ((d.getDay() + 6) % 7) + 1, minutes: d.getHours() * 60 + d.getMinutes() };
}

// Le créneau est-il en cours ? Un créneau qui passe minuit (22:00 → 02:00) compte pour le jour où il commence :
// réglé le vendredi, il court du vendredi 22:00 au samedi 02:00.
export function creneauActif(creneau, date = new Date()) {
  if (!creneau || creneau.actif === false) return false;
  const debut = minutesDe(creneau.debut);
  const fin = minutesDe(creneau.fin);
  if (debut === null || fin === null || debut === fin) return false;
  const jours = (creneau.jours ?? []).map(Number);
  const { jour, minutes } = momentDe(date);
  if (debut < fin) return jours.includes(jour) && minutes >= debut && minutes < fin;
  const veille = ((jour + 5) % 7) + 1;
  return (jours.includes(jour) && minutes >= debut) || (jours.includes(veille) && minutes < fin);
}

// Le créneau vaut-il pour cet article ? Aucune catégorie choisie = tous les articles.
export function creneauConcerne(creneau, article) {
  const categories = creneau.categories ?? [];
  return categories.length === 0 || (article?.categorie_id != null && categories.includes(article.categorie_id));
}

// Pourcentage appliqué à un article maintenant (le plus fort des créneaux en cours), 0 sinon.
export function pourcentageArticle(creneaux, article, date = new Date()) {
  return (creneaux ?? []).reduce(
    (max, c) => (creneauActif(c, date) && creneauConcerne(c, article) ? Math.max(max, Number(c.pourcentage) || 0) : max),
    0
  );
}

// Créneau à annoncer dans le bandeau : le plus fort en cours (null si aucun).
export function happyHourEnCours(creneaux, date = new Date()) {
  const actifs = (creneaux ?? []).filter((c) => creneauActif(c, date));
  if (!actifs.length) return null;
  return actifs.reduce((a, b) => (Number(b.pourcentage) > Number(a.pourcentage) ? b : a));
}

// Texte du bandeau : « Happy hour : -20 % jusqu'à 20:00 » (+ le nom si ce n'est pas « Happy hour »).
export function texteBandeau(creneau) {
  if (!creneau) return '';
  const pct = String(Number(creneau.pourcentage)).replace('.', ',');
  const nom = creneau.nom && !/^happy hour$/i.test(creneau.nom.trim()) ? ` (${creneau.nom.trim()})` : '';
  return `Happy hour : -${pct} % jusqu’à ${heureCourte(creneau.fin)}${nom}`;
}

// Remise d'une ligne : prix × quantité × pourcentage, arrondie (0 décimale pour le FCFA, 2 sinon).
export function remiseHappyHour(prix, quantite, pourcentage, decimales = 0) {
  const brut = Number(prix) * Number(quantite);
  const pct = Number(pourcentage);
  if (!(brut > 0) || !(pct > 0)) return 0;
  const facteur = 10 ** decimales;
  return Math.min(Math.round((brut * Math.min(pct, 100) / 100) * facteur) / facteur, Math.round(brut * 100) / 100);
}

// Jours lisibles : « tous les jours », « du lundi au vendredi », « ven, sam ».
export function texteJours(jours) {
  const liste = [...new Set((jours ?? []).map(Number))].sort((a, b) => a - b);
  if (liste.length === 7) return 'tous les jours';
  if (liste.length >= 3 && liste.every((j, i) => i === 0 || j === liste[i - 1] + 1)) {
    return `du ${JOURS[liste[0] - 1].nom} au ${JOURS[liste[liste.length - 1] - 1].nom}`;
  }
  return liste.map((j) => JOURS[j - 1]?.court.toLowerCase()).filter(Boolean).join(', ');
}

// Contrôle du formulaire avant l'envoi (la base refait les mêmes contrôles) : message en français ou ''.
export function erreurCreneau(c) {
  if (!String(c.nom ?? '').trim()) return 'Donnez un nom au happy hour.';
  if (!(c.jours ?? []).length) return 'Choisissez au moins un jour.';
  const debut = minutesDe(c.debut);
  const fin = minutesDe(c.fin);
  if (debut === null || fin === null) return 'Indiquez l’heure de début et l’heure de fin.';
  if (debut === fin) return 'L’heure de fin doit être différente de l’heure de début.';
  const pct = Number(String(c.pourcentage ?? '').replace(',', '.'));
  if (!(pct > 0 && pct <= 100)) return 'Pourcentage entre 1 et 100.';
  return '';
}
