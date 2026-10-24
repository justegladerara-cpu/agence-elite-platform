// Analyses du Tableau de bord et rapport A4 : tout se calcule ici à partir de la réponse de analyse_commerce
// (migration 20261023000155). Fonctions pures, sans accès réseau ni à la page : testées dans tests/analyses.test.js.
import { formatMontant, MODES_PAIEMENT } from '../../noyau/format.js';

export const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export const JOURS_COURTS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// Une soirée se lit dans l'ordre : 6 h est la première heure de la journée, 5 h la dernière.
export const rangHeure = (h) => (Number(h) + 18) % 24;
export const heureDuRang = (r) => (Number(r) + 6) % 24;
const n = (x) => Number(x) || 0;
const pourcent = (v, p) => (p > 0 ? Math.round(((v - p) / p) * 100) : null);
// Seuil de marge : le coût d'achat doit être connu sur 80 % du chiffre (même règle que le tableau Commerce).
export const COUVERTURE_MARGE = 0.8;

function marge(t) {
  if (!t || t.marge == null || n(t.chiffre_lignes) <= 0) return null;
  return n(t.chiffre_cout_connu) / n(t.chiffre_lignes) >= COUVERTURE_MARGE ? n(t.marge) : null;
}

// Heures de la période dans l'ordre de la soirée, sans trou entre la première et la dernière heure vendue.
function heuresContinues(parHeure) {
  if (!parHeure.length) return [];
  const parRang = new Map(parHeure.map((h) => [rangHeure(h.heure), h]));
  const rangs = [...parRang.keys()];
  const liste = [];
  for (let r = Math.min(...rangs); r <= Math.max(...rangs); r += 1) {
    const h = parRang.get(r);
    liste.push({ heure: heureDuRang(r), rang: r, chiffre: n(h?.chiffre), tickets: n(h?.tickets), panier: h && n(h.tickets) ? Math.round(n(h.chiffre) / n(h.tickets)) : 0 });
  }
  return liste;
}

// Créneau creux : les 2 heures consécutives (dans les heures d'ouverture) qui font le moins de chiffre.
function creneauCreux(heures, total) {
  if (heures.length < 4 || total <= 0) return null;
  let meilleur = null;
  for (let i = 0; i + 1 < heures.length; i += 1) {
    const s = heures[i].chiffre + heures[i + 1].chiffre;
    if (!meilleur || s < meilleur.chiffre) meilleur = { de: heures[i].heure, a: (heures[i + 1].heure + 1) % 24, chiffre: s };
  }
  return { ...meilleur, part: Math.round((100 * meilleur.chiffre) / total) };
}

// Prévision de fin de service pour aujourd'hui : part du chiffre habituellement faite à cette heure-ci
// (moyenne des 4 mêmes jours de la semaine d'avant), et l'heure la plus forte qui reste à venir.
export function prevision(r, chiffre) {
  const p = r.periode ?? {};
  if (p.jours !== 1 || !p.en_cours || !p.maintenant) return null;
  const hist = (r.historique_meme_jour ?? []).map((h) => ({ rang: rangHeure(h.heure), heure: n(h.heure), chiffre: n(h.chiffre) }));
  const total = hist.reduce((s, h) => s + h.chiffre, 0);
  if (total <= 0) return null;
  const heure = Number(p.maintenant.slice(11, 13));
  const minutes = Number(p.maintenant.slice(14, 16));
  const rang = rangHeure(heure);
  const fait = hist.reduce((s, h) => s + (h.rang < rang ? h.chiffre : h.rang === rang ? (h.chiffre * minutes) / 60 : 0), 0);
  const part = fait / total;
  const aVenir = hist.filter((h) => h.rang > rang && h.chiffre > 0).sort((a, b) => b.chiffre - a.chiffre)[0] ?? null;
  return {
    habituel: Math.round(total),
    part: Math.round(part * 100),
    // Trop tôt (moins de 10 % du chiffre habituel fait) : la projection serait un faux chiffre, on montre l'habituel.
    fin: part >= 0.1 && chiffre > 0 ? Math.round(chiffre / part) : null,
    rush: aVenir ? { heure: aVenir.heure, chiffre: aVenir.chiffre } : null,
  };
}

function kpi(cle, libelle, valeur, precedent, format, detail) {
  return { cle, libelle, valeur, precedent: precedent ?? null, format, detail: detail ?? null, variation: valeur == null || precedent == null ? null : pourcent(n(valeur), n(precedent)) };
}

// Phrases de comparaison renvoyées par analyse_commerce, dites en mots simples.
const COMPARAISONS = {
  'vs il y a 7 jours, même heure': 'par rapport au même jour la semaine passée, à la même heure',
  'vs même jour, semaine d’avant': 'par rapport au même jour la semaine passée',
  'vs période d’avant, même moment': 'par rapport aux mêmes jours juste avant',
  'vs période précédente': 'par rapport aux mêmes jours juste avant',
};
export const comparaisonSimple = (texte) => COMPARAISONS[texte] ?? texte ?? '';

const nbr = (x) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n(x)).replace(/ | /g, ' ');

export function construireAnalyse(r) {
  const devise = r.devise ?? 'XAF';
  const m = (x) => formatMontant(x, devise);
  const periode = { ...(r.periode ?? {}), comparaison: comparaisonSimple(r.periode?.comparaison) };
  const t = r.totaux ?? {};
  const p = r.precedent ?? null;
  const chiffre = n(t.chiffre);
  const tickets = n(t.tickets);
  const panier = tickets ? Math.round(chiffre / tickets) : 0;
  const panierP = p && n(p.tickets) ? Math.round(n(p.chiffre) / n(p.tickets)) : null;
  const margeV = marge(t);
  const margeP = p ? marge(p) : null;
  const couverture = n(t.chiffre_lignes) > 0 ? n(t.chiffre_cout_connu) / n(t.chiffre_lignes) : null;

  const kpis = [
    kpi('chiffre', 'Total des ventes', chiffre, p && n(p.chiffre), 'montant'),
    kpi('tickets', 'Nombre de ventes', tickets, p && n(p.tickets), 'nombre', tickets ? `${nbr(n(t.articles) / tickets)} produit(s) par vente` : null),
    kpi('panier', 'Dépense moyenne par client', panier, panierP, 'montant'),
    kpi('marge', 'Bénéfice sur les produits', margeV, margeV != null ? margeP : null, 'montant',
      margeV == null ? (n(t.chiffre_lignes) > 0 ? 'Pas calculé : prix d’achat manquants' : null) : `Soit ${Math.round((100 * margeV) / Math.max(1, n(t.chiffre_cout_connu)))} % du prix d’achat`),
    kpi('remises', 'Réductions données', n(t.remises), p && n(p.remises), 'montant'),
    kpi('annulations', 'Ventes annulées', n(t.annulations), p && n(p.annulations), 'nombre', n(t.annulations) ? m(t.annulations_montant) : null),
  ];
  for (const k of kpis) k.favorable = k.variation == null || k.variation === 0 ? null : (k.variation > 0) !== ['remises', 'annulations'].includes(k.cle);

  // Quand ça se vend.
  const heures = heuresContinues(r.par_heure ?? []);
  const vendues = heures.filter((h) => h.chiffre > 0);
  const meilleureHeure = vendues.length ? vendues.reduce((a, b) => (b.chiffre > a.chiffre ? b : a)) : null;
  const pireHeure = vendues.length > 2 ? vendues.reduce((a, b) => (b.chiffre < a.chiffre ? b : a)) : null;
  const creux = creneauCreux(heures, chiffre);
  const jours = (r.par_jour ?? []).map((j) => ({ jour: j.jour, chiffre: n(j.chiffre), tickets: n(j.tickets) }));
  const joursPasses = jours.filter((j) => j.jour <= (r.periode?.aujourdhui ?? j.jour));
  const moyenneJour = joursPasses.length ? Math.round(joursPasses.reduce((s, j) => s + j.chiffre, 0) / joursPasses.length) : 0;
  const record = jours.length > 1 ? jours.reduce((a, b) => (b.chiffre > a.chiffre ? b : a)) : null;
  const semaine = (r.jours_semaine ?? []).filter((d) => n(d.jours) > 0)
    .map((d) => ({ jour_semaine: n(d.jour_semaine), nom: JOURS[n(d.jour_semaine) - 1], moyenne: Math.round(n(d.chiffre) / n(d.jours)), chiffre: n(d.chiffre), jours: n(d.jours) }));
  const assezDeJours = (r.periode?.jours ?? 0) >= 7;
  const avecVentes = semaine.filter((d) => d.chiffre > 0);
  const meilleurJour = assezDeJours && avecVentes.length ? avecVentes.reduce((a, b) => (b.moyenne > a.moyenne ? b : a)) : null;
  const pireJour = assezDeJours && avecVentes.length > 2 ? avecVentes.reduce((a, b) => (b.moyenne < a.moyenne ? b : a)) : null;
  const moy = (liste) => { const j = liste.reduce((s, d) => s + d.jours, 0); return j ? Math.round(liste.reduce((s, d) => s + d.chiffre, 0) / j) : null; };
  const weekEnd = assezDeJours ? { weekend: moy(semaine.filter((d) => d.jour_semaine >= 5)), semaine: moy(semaine.filter((d) => d.jour_semaine < 5)) } : null;
  // Effet fin de mois (jour de paie) : du 25 au 5 contre le reste, sur 2 mois ou plus.
  let finDeMois = null;
  if (joursPasses.length >= 56) {
    const dj = (j) => Number(j.jour.slice(8, 10));
    const autour = joursPasses.filter((j) => dj(j) >= 25 || dj(j) <= 5);
    const reste = joursPasses.filter((j) => dj(j) < 25 && dj(j) > 5);
    const a = autour.reduce((s, j) => s + j.chiffre, 0) / Math.max(1, autour.length);
    const b = reste.reduce((s, j) => s + j.chiffre, 0) / Math.max(1, reste.length);
    if (b > 0) finDeMois = { autour: Math.round(a), reste: Math.round(b), ecart: pourcent(a, b) };
  }
  const grille = (r.grille ?? []).map((g) => ({ jour_semaine: n(g.jour_semaine), heure: n(g.heure), rang: rangHeure(g.heure), chiffre: n(g.chiffre), tickets: n(g.tickets) }));
  const meilleureCase = grille.length && assezDeJours ? grille.reduce((a, b) => (b.chiffre > a.chiffre ? b : a)) : null;

  // Ce qui se vend.
  const articles = (r.articles ?? []).map((a) => {
    const rythme = a.vendu_30j == null ? null : n(a.vendu_30j) / 30;
    const epuise = a.stock != null && n(a.stock) <= 0;
    const joursRestants = a.stock == null ? null : epuise ? 0 : !rythme ? null : Math.floor(n(a.stock) / rythme);
    return { ...a, epuise, quantite: n(a.quantite), chiffre: n(a.chiffre), marge: a.marge == null ? null : n(a.marge), stock: a.stock == null ? null : n(a.stock), part: chiffre ? Math.round((100 * n(a.chiffre)) / chiffre) : 0, joursRestants, aCommander: joursRestants != null && joursRestants <= 3 };
  });
  const top = articles.slice(0, 10);
  const topQuantite = [...articles].sort((a, b) => b.quantite - a.quantite).slice(0, 10);
  const flop = articles.length > 10 ? [...articles].sort((a, b) => a.chiffre - b.chiffre || a.quantite - b.quantite).slice(0, 5) : [];
  const rentables = articles.filter((a) => a.marge != null).sort((a, b) => b.marge - a.marge).slice(0, 5);
  const ruptures = articles.filter((a) => a.aCommander).sort((a, b) => a.joursRestants - b.joursRestants);
  const paiements = (r.paiements ?? []).map((x) => ({ ...x, libelle: MODES_PAIEMENT[x.mode] ?? x.mode, montant: n(x.montant) }));
  const totalPaiements = paiements.reduce((s, x) => s + x.montant, 0);
  for (const x of paiements) x.part = totalPaiements ? Math.round((100 * x.montant) / totalPaiements) : 0;

  // Équipe.
  const equipe = (r.equipe ?? []).map((e) => ({ ...e, chiffre: n(e.chiffre), tickets: n(e.tickets), panier: n(e.tickets) ? Math.round(n(e.chiffre) / n(e.tickets)) : 0, ecart: e.ecart == null ? null : n(e.ecart) }));
  const annulations = r.annulations ?? [];
  const tardives = annulations.filter((a) => a.tardive);

  // Ticket Z consolidé.
  const z = r.ticket_z ?? {};
  const ticketZ = {
    brutes: chiffre + n(t.remises), remises: n(t.remises), annulations: n(t.annulations_montant), nombreAnnulations: n(t.annulations),
    nettes: chiffre, remboursements: n(z.remboursements), encaisse: t.encaisse == null ? null : n(t.encaisse), credit: n(t.credit_periode),
    paiements, nombreZ: n(z.nombre), especesAttendues: z.especes_attendues == null ? null : n(z.especes_attendues),
    especesComptees: z.especes_comptees == null ? null : n(z.especes_comptees), ecart: z.ecart == null ? null : n(z.ecart), ecarts: n(z.ecarts),
  };

  // Argent : coût des produits vendus seulement si la marge est calculable.
  const depenses = t.depenses == null ? null : n(t.depenses);
  const resultat = margeV != null && depenses != null ? margeV - depenses : null;

  const prev = prevision(r, chiffre);
  const varCa = kpis[0].variation;

  // Points d'attention, du plus important au moins important ; le rapport en garde 3.
  const points = [];
  if (ruptures.length) {
    const a = ruptures[0];
    points.push({ niveau: 'critique', texte: a.epuise ? `${a.libelle} : plus de stock.` : a.joursRestants === 0 ? `${a.libelle} sera fini avant demain si ça continue comme ça.` : `${a.libelle} sera fini dans ${a.joursRestants} jour${a.joursRestants > 1 ? 's' : ''} si ça continue comme ça.`, route: 'stock?etat=bas' });
  }
  if (ticketZ.ecart != null && ticketZ.ecart !== 0) points.push({ niveau: 'alerte', texte: `Caisse : ${ticketZ.ecart < 0 ? `il manque ${m(-ticketZ.ecart)}` : `${m(ticketZ.ecart)} en trop`} (${ticketZ.ecarts} fermeture${ticketZ.ecarts > 1 ? 's' : ''} de caisse).`, route: 'clotures' });
  if (tardives.length) {
    const noms = [...new Set(tardives.map((a) => a.par).filter(Boolean))].slice(0, 2).join(', ');
    points.push({ niveau: 'alerte', texte: `${tardives.length} vente${tardives.length > 1 ? 's' : ''} annulée${tardives.length > 1 ? 's' : ''} plus de 30 min après${noms ? ` (${noms})` : ''}.`, route: 'ventes?statut=annulee' });
  }
  if (varCa != null && varCa <= -15) points.push({ niveau: 'alerte', texte: `Les ventes baissent de ${-varCa} % ${periode.comparaison}.`.replace(/ \./, '.'), route: 'ventes' });
  if (margeV == null && n(t.chiffre_lignes) > 0) points.push({ niveau: 'info', texte: `Bénéfice pas calculé : il manque le prix d’achat de beaucoup de produits (connu pour ${Math.floor(100 * (couverture ?? 0))} % des ventes seulement).`, route: 'articles' });
  if (r.stock && n(r.stock.dormants_valeur) > 0) points.push({ niveau: 'info', texte: `${m(r.stock.dormants_valeur)} bloqués dans ${r.stock.dormants} produit(s) qui ne se vendent pas.`, route: 'stock' });
  if (creux && creux.part <= 6) points.push({ niveau: 'info', texte: `Entre ${creux.de} h et ${creux.a} h, on vend très peu : seulement ${creux.part} % des ventes.`, route: null });
  if (varCa != null && varCa >= 10) points.push({ niveau: 'bon', texte: `Bonne nouvelle : les ventes montent de ${varCa} %.`, route: null });
  if (!points.length && chiffre > 0) points.push({ niveau: 'bon', texte: 'Tout va bien, rien de bizarre.', route: null });

  // Résumé en une phrase.
  const morceaux = [`${m(chiffre)} de ventes`];
  if (varCa != null) morceaux[0] += ` (${varCa > 0 ? '+' : varCa < 0 ? '−' : ''}${Math.abs(varCa)} %)`;
  morceaux.push(`${tickets} client${tickets > 1 ? 's' : ''} servi${tickets > 1 ? 's' : ''}, ${m(panier)} par client en moyenne`);
  if (meilleurJour && (r.periode?.jours ?? 0) > 1) morceaux.push(`le ${meilleurJour.nom.toLowerCase()} est le meilleur jour`);
  if (meilleureHeure) morceaux.push(`vous vendez le plus à ${meilleureHeure.heure} h`);
  if (n(t.annulations)) morceaux.push(`${n(t.annulations)} vente${n(t.annulations) > 1 ? 's' : ''} annulée${n(t.annulations) > 1 ? 's' : ''}`);
  const resume = chiffre > 0 || tickets > 0 ? `${morceaux.join(', ')}.` : 'Aucune vente sur ces dates.';

  return {
    devise, periode, portee: r.portee ?? {}, kpis, resume, attention: points.slice(0, 3), attentionToutes: points,
    encaisse: t.encaisse == null ? null : n(t.encaisse), encaisseP: p?.encaisse == null ? null : n(p.encaisse),
    articlesParTicket: tickets ? n(t.articles) / tickets : 0, clientsIdentifies: n(t.clients_identifies),
    heures, meilleureHeure, pireHeure, creux, jours, moyenneJour, record, semaine, meilleurJour, pireJour, weekEnd, finDeMois, grille, meilleureCase,
    articles, top, topQuantite, flop, rentables, ruptures, nombreArticles: n(r.nombre_articles_vendus),
    categories: (r.categories ?? []).map((c) => ({ ...c, chiffre: n(c.chiffre), part: chiffre ? Math.round((100 * n(c.chiffre)) / chiffre) : 0 })),
    paiements, paires: r.paires ?? [], starParHeure: (r.star_par_heure ?? []).map((s) => ({ ...s, heure: n(s.heure) })), clients: r.clients ?? [],
    equipe, annulations, tardives, ticketZ, stock: r.stock ?? null, depenses, depensesCategories: r.depenses_categories ?? [], resultat,
    margeCalculee: margeV != null, credits: r.credits ?? null, prevision: prev,
  };
}

// --- Rapport : types et périodes ---------------------------------------------------------------------------

export const TYPES_RAPPORT = [['jour', 'Du jour'], ['semaine', 'De la semaine'], ['mois', 'Du mois'], ['libre', 'Choisir les dates']];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const date = (s) => new Date(`${s}T12:00:00`);

// Bornes du rapport : le jour choisi, la semaine (lundi → dimanche) qui contient le jour choisi, le mois choisi
// (« AAAA-MM »), ou la période libre. Une période qui finit dans le futur s'arrête aujourd'hui.
export function bornesRapport(type, choix = {}, aujourdhui = iso(new Date())) {
  const borne = (au) => (au > aujourdhui ? aujourdhui : au);
  if (type === 'semaine') {
    const d = date(choix.jour || aujourdhui);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const lundi = iso(d);
    d.setDate(d.getDate() + 6);
    return { du: lundi, au: borne(iso(d)), fin: iso(d) };
  }
  if (type === 'mois') {
    const [a, mo] = (choix.mois || aujourdhui.slice(0, 7)).split('-').map(Number);
    const fin = iso(new Date(a, mo, 0, 12));
    return { du: iso(new Date(a, mo - 1, 1, 12)), au: borne(fin), fin };
  }
  if (type === 'libre') {
    const du = choix.du || aujourdhui;
    const au = choix.au || aujourdhui;
    return du <= au ? { du, au: borne(au), fin: au } : { du: au, au: borne(du), fin: du };
  }
  const j = choix.jour || aujourdhui;
  return { du: j, au: j, fin: j };
}

const enLettres = (s, options) => date(s).toLocaleDateString('fr-FR', options);

export function titreRapport(type, du, au, fin = au) {
  if (type === 'jour') return `Rapport du jour · ${enLettres(du, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`;
  if (type === 'mois') return `Rapport du mois · ${enLettres(du, { month: 'long', year: 'numeric' })}`;
  const memeMois = du.slice(0, 7) === fin.slice(0, 7);
  const debut = enLettres(du, memeMois ? { day: 'numeric' } : { day: 'numeric', month: 'long' });
  const periode = `du ${debut} au ${enLettres(fin, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  return type === 'semaine' ? `Rapport de la semaine · ${periode}` : `Rapport · ${periode}`;
}

// Nom du fichier proposé à l'enregistrement en PDF (le titre de la page devient le nom du fichier).
export function nomFichierRapport(type, du, au, etablissement) {
  const nom = String(etablissement ?? 'rapport').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  return `rapport-${type === 'jour' ? 'journalier' : type === 'semaine' ? 'hebdomadaire' : type === 'mois' ? 'mensuel' : 'periode'}-${nom}-${du}${du === au ? '' : `_${au}`}`;
}

// Conseils simples tirés des chiffres (Juste, 2026-10-24 : « les recommandations »). a : construireAnalyse(...),
// m : montant formaté. 5 conseils au plus, du plus utile au moins utile ; aucun conseil sans ventes.
export function conseils(a, m) {
  if (!a || !(a.kpis?.[0]?.valeur > 0)) return [];
  const liste = [];
  const r0 = a.ruptures?.[0];
  if (r0) liste.push(`Commandez vite ${a.ruptures.slice(0, 3).map((x) => x.libelle).join(', ')} : ${a.ruptures.length > 1 ? 'ils seront finis' : 'il sera fini'} très bientôt.`);
  if (a.meilleureHeure) liste.push(`Le plus de monde vient vers ${a.meilleureHeure.heure} h : mettez le plus de personnel et de boissons fraîches prêtes avant cette heure.`);
  if (a.creux && a.creux.part <= 10) liste.push(`Entre ${a.creux.de} h et ${a.creux.a} h c’est calme : profitez-en pour ranger, remplir les frigos, ou faites une petite offre pour attirer du monde.`);
  if (a.top?.[0]) liste.push(`${a.top[0].libelle} rapporte le plus (${m(a.top[0].chiffre)}) : gardez-le toujours en stock et bien en vue.`);
  if (a.paires?.[0]) liste.push(`${a.paires[0].a} et ${a.paires[0].b} partent souvent ensemble : proposez les deux à un prix rond.`);
  if (a.tardives?.length) liste.push(`${a.tardives.length} vente(s) annulée(s) longtemps après : demandez pourquoi à la personne.`);
  if (a.ticketZ?.ecart != null && a.ticketZ.ecart < 0) liste.push(`Il manque ${m(-a.ticketZ.ecart)} dans la caisse : recomptez avec la caissière.`);
  if (a.credits?.montant > 0) liste.push(`Les clients doivent encore ${m(a.credits.montant)} : relancez-les sur WhatsApp (menu En attente de paiement).`);
  if (a.equipe?.length > 1) liste.push(`Bravo à ${a.equipe[0].nom}, qui a le plus vendu (${m(a.equipe[0].chiffre)}).`);
  return liste.slice(0, 5);
}
