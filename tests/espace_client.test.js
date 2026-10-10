import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Lot P : espace client par lien sécurisé. Droits côté équipe, gestes du client sans compte (devis, livrables,
// messages, dépôts, téléchargements), traces, limites, révocation, isolation et anonymisation.
let db;
let sa;
let gerant;
let commercial;
let collab;
let lecteur;
let autreGerant;
let etab;
let autreEtab;
let client;
let fournisseur;
let autreClient;
let acces;
let jeton;
let devisA;
let devisB;
let devisBrouillon;
let projet;

const pdf = 'data:application/pdf;base64,JVBERi0xLjQK';
const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const anonyme = async (sql, params = []) => commeRole(db, 'anon', null, async (tx) => (await tx.query(sql, params)).rows);
const portail = async (j = jeton) => Object.values((await anonyme('select portail_ouvrir($1)', [j]))[0])[0];
const json = (v) => JSON.stringify(v);
const devis = async (contact, envoyer = true) => {
  const id = await valeur(gerant, 'select enregistrer_document_vente($1, $2::jsonb)', [etab, json({
    type: 'devis', contact_id: contact, objet: 'Refonte', lignes: [{ libelle: 'Atelier', quantite: 1, prix_unitaire: 50000, taux_tva: 0 }],
  })]);
  if (envoyer) await comme(gerant, "select changer_statut_devis($1, 'envoye')", [id]);
  return id;
};
const notifications = async (user) => (await valeur(user, 'select mes_notifications()')).liste.map((n) => n.titre);

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@ec.test');
  gerant = await utilisateur('gerant@ec.test');
  commercial = await utilisateur('commercial@ec.test');
  collab = await utilisateur('collab@ec.test');
  lecteur = await utilisateur('lecteur@ec.test');
  autreGerant = await utilisateur('autre@ec.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Agence Portail')");
  const c2 = await valeur(sa, "select creer_client('Concurrent Portail')");
  etab = await valeur(sa, "select creer_etablissement($1, 'services', 'Agence Portail')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'services', 'Concurrent Portail')", [c2]);
  for (const e of [etab, autreEtab]) {
    await comme(sa, "select accorder_module($1, 'portail_client', true)", [e]);
    await comme(sa, "select definir_module_etablissement($1, 'portail_client', true)", [e]);
  }
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'commercial'), ($1, $4, 'collaborateur'), ($1, $5, 'lecteur'), ($6, $7, 'gerant')`,
    [etab, gerant, commercial, collab, lecteur, autreEtab, autreGerant]
  );
  client = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Mme Client', societe: 'Hôtel Client', type: 'client' })]);
  fournisseur = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Grossiste', type: 'fournisseur' })]);
  autreClient = await valeur(autreGerant, 'select enregistrer_contact($1, $2::jsonb)', [autreEtab, json({ nom: 'Client concurrent', type: 'client' })]);
  devisA = await devis(client);
  devisB = await devis(client);
  devisBrouillon = await devis(client, false);
  projet = await valeur(gerant, 'select enregistrer_projet($1, $2::jsonb)', [etab, json({ nom: 'Site de l’hôtel', contact_id: client })]);
  await valeur(gerant, 'select enregistrer_tache_projet($1, $2::jsonb)', [etab, json({ projet_id: projet, titre: 'Maquettes' })]);
});

afterAll(async () => db.close());

describe('côté équipe : liens d’accès', () => {
  test('création réservée à qui gère l’espace client ; client actif seulement ; seule l’empreinte est gardée', async () => {
    for (const u of [lecteur, collab, autreGerant]) {
      await expect(comme(u, 'select creer_acces_portail($1, $2)', [etab, client])).rejects.toThrow(/Permission refusée/);
    }
    await expect(comme(gerant, 'select creer_acces_portail($1, $2)', [etab, fournisseur])).rejects.toThrow(/client ou un prospect/);
    await expect(comme(gerant, 'select creer_acces_portail($1, $2)', [etab, autreClient])).rejects.toThrow(/Contact introuvable/);
    await expect(comme(gerant, "select creer_acces_portail($1, $2, 'X', 0)", [etab, client])).rejects.toThrow(/entre 1 et 365/);
    const r = await valeur(commercial, "select creer_acces_portail($1, $2, 'Mme Client, direction')", [etab, client]);
    expect(r.jeton).toMatch(/^[0-9a-f]{64}$/);
    acces = r.id;
    jeton = r.jeton;
    const ligne = (await db.query('select * from portail_acces where id = $1', [acces])).rows[0];
    expect(ligne.jeton_empreinte).not.toBe(jeton);
    expect(Math.round((new Date(ligne.expire_le) - new Date(ligne.cree_le)) / 86400000)).toBe(30);
    await expect(comme(gerant, 'select jeton_empreinte from portail_acces')).rejects.toThrow(/permission denied/);
    expect((await comme(lecteur, 'select libelle from portail_acces')).map((x) => x.libelle)).toEqual(['Mme Client, direction']);
    expect(await comme(autreGerant, 'select id from portail_acces')).toEqual([]);
  });
});

describe('côté client : ouvrir son espace', () => {
  test('lien inconnu refusé sans dire pourquoi ; le client voit ses devis envoyés, pas les brouillons ni les projets non partagés', async () => {
    await expect(portail('0'.repeat(64))).rejects.toThrow(/n'existe pas ou a expiré/);
    await expect(portail('pas-un-jeton')).rejects.toThrow(/n'existe pas ou a expiré/);
    const p = await portail();
    expect(p.contact).toEqual({ nom: 'Mme Client', societe: 'Hôtel Client' });
    expect(p.emetteur.nom).toBe('Agence Portail');
    expect(p.documents.map((d) => d.id).sort()).toEqual([devisA, devisB].sort());
    expect(p.documents[0].lignes[0]).toMatchObject({ libelle: 'Atelier', quantite: 1 });
    expect(p.projets).toEqual([]);
    await portail();
    const ouvertures = (await db.query("select count(*)::int n from portail_evenements where acces_id = $1 and type = 'ouverture'", [acces])).rows[0].n;
    expect(ouvertures).toBe(1); // une trace par heure, pas par chargement
    expect((await db.query('select ouvertures from portail_acces where id = $1', [acces])).rows[0].ouvertures).toBe(2);
  });

  test('accusé de réception d’un document, une fois ; document d’un autre ou brouillon : introuvable', async () => {
    await anonyme('select portail_document_vu($1, $2)', [jeton, devisA]);
    await anonyme('select portail_document_vu($1, $2)', [jeton, devisA]);
    expect((await db.query("select count(*)::int n from portail_evenements where type = 'document_vu' and objet_id = $1", [devisA])).rows[0].n).toBe(1);
    expect((await portail()).documents.find((d) => d.id === devisA).vu_le).toBeTruthy();
    await expect(anonyme('select portail_document_vu($1, $2)', [jeton, devisBrouillon])).rejects.toThrow(/Document introuvable/);
  });
});

describe('côté client : répondre à un devis', () => {
  test('accepter exige un nom ; le devis passe « accepté », l’équipe est prévenue ; une seule réponse', async () => {
    await expect(anonyme("select portail_repondre_devis($1, $2, 'accepte', ' ')", [jeton, devisA])).rejects.toThrow(/Écrivez votre nom/);
    await expect(anonyme("select portail_repondre_devis($1, $2, 'payer')", [jeton, devisA])).rejects.toThrow(/Réponse inconnue/);
    await expect(anonyme("select portail_repondre_devis($1, $2, 'accepte', 'Mme Client')", [jeton, devisBrouillon])).rejects.toThrow(/introuvable/);
    await anonyme("select portail_repondre_devis($1, $2, 'accepte', 'Mme Client', 'Bon pour accord')", [jeton, devisA]);
    expect((await db.query('select statut from documents_vente where id = $1', [devisA])).rows[0].statut).toBe('accepte');
    expect((await db.query("select nom_signataire, note from portail_evenements where type = 'devis_accepte' and objet_id = $1", [devisA])).rows[0])
      .toEqual({ nom_signataire: 'Mme Client', note: 'Bon pour accord' });
    expect(await notifications(gerant)).toContain(`Devis accepté en ligne : ${(await db.query('select numero from documents_vente where id = $1', [devisA])).rows[0].numero}`);
    await expect(anonyme("select portail_repondre_devis($1, $2, 'refuse')", [jeton, devisA])).rejects.toThrow(/déjà reçu une réponse/);
  });

  test('demander une modification exige le détail, garde le devis envoyé et crée un message', async () => {
    await expect(anonyme("select portail_repondre_devis($1, $2, 'modification')", [jeton, devisB])).rejects.toThrow(/modifier/);
    await anonyme("select portail_repondre_devis($1, $2, 'modification', null, 'Ajouter une page Réservations')", [jeton, devisB]);
    expect((await db.query('select statut from documents_vente where id = $1', [devisB])).rows[0].statut).toBe('envoye');
    expect((await comme(lecteur, "select texte from portail_messages where auteur = 'client' and objet_id = $1", [devisB]))).toEqual([{ texte: 'Ajouter une page Réservations' }]);
    await anonyme("select portail_repondre_devis($1, $2, 'refuse')", [jeton, devisB]);
    expect((await db.query('select statut from documents_vente where id = $1', [devisB])).rows[0].statut).toBe('refuse');
  });
});

describe('projets partagés et livrables', () => {
  test('partager exige de gérer les projets ; le client voit l’avancement puis valide ou fait corriger un livrable', async () => {
    await expect(comme(commercial, 'select partager_projet_client($1, true)', [projet])).rejects.toThrow(/Permission refusée/);
    const livrable = await valeur(gerant, 'select enregistrer_livrable($1, $2::jsonb)', [etab, json({ projet_id: projet, titre: 'Maquettes écrans' })]);
    await valeur(gerant, "select soumettre_livrable($1, 'Première proposition')", [livrable]);
    await expect(anonyme("select portail_decider_livrable($1, $2, 'valide', 'Mme Client')", [jeton, livrable])).rejects.toThrow(/Livrable introuvable/);
    await comme(gerant, 'select partager_projet_client($1, true)', [projet]);
    const [p] = (await portail()).projets;
    expect(p).toMatchObject({ nom: 'Site de l’hôtel', avancement: 0, taches: [{ titre: 'Maquettes', statut: 'a_faire' }] });
    expect(p.livrables[0]).toMatchObject({ titre: 'Maquettes écrans', statut: 'soumis', version: 1, note: 'Première proposition' });
    await expect(anonyme("select portail_decider_livrable($1, $2, 'a_corriger', 'Mme Client')", [jeton, livrable])).rejects.toThrow(/corriger/);
    await anonyme("select portail_decider_livrable($1, $2, 'a_corriger', 'Mme Client', 'Logo plus grand')", [jeton, livrable]);
    expect((await db.query('select statut from projet_livrables where id = $1', [livrable])).rows[0].statut).toBe('a_corriger');
    expect((await db.query('select decide_par, decide_par_nom from projet_livrable_versions where livrable_id = $1', [livrable])).rows[0])
      .toEqual({ decide_par: null, decide_par_nom: 'Client : Mme Client' });
    expect((await db.query("select titre, assigne_a from projet_taches where livrable_id = $1", [livrable])).rows[0]).toEqual({ titre: 'Correction : Maquettes écrans (V1)', assigne_a: gerant });
    expect(await notifications(gerant)).toContain('Correction demandée par le client : Maquettes écrans');
  });
});

describe('messages et fichiers', () => {
  test('le client écrit, l’équipe lit et répond ; le message de l’équipe apparaît dans l’espace', async () => {
    await expect(anonyme("select portail_envoyer_message($1, '  ')", [jeton])).rejects.toThrow(/vide/);
    await expect(anonyme("select portail_envoyer_message($1, 'X', 'projet', $2)", [jeton, devisA])).rejects.toThrow(/Projet introuvable/);
    await anonyme("select portail_envoyer_message($1, 'Quand commence le chantier ?', 'projet', $2)", [jeton, projet]);
    expect(await notifications(commercial)).toContain('Message de Hôtel Client');
    await expect(comme(lecteur, "select repondre_client_portail($1, $2, 'Lundi')", [etab, client])).rejects.toThrow(/Permission refusée/);
    await comme(commercial, "select repondre_client_portail($1, $2, 'Lundi prochain.', 'projet', $3)", [etab, client, projet]);
    expect((await db.query("select count(*)::int n from portail_messages where auteur = 'client' and lu_le is null")).rows[0].n).toBe(0);
    expect((await portail()).messages.map((m) => [m.auteur, m.texte]).slice(-2)).toEqual([['client', 'Quand commence le chantier ?'], ['equipe', 'Lundi prochain.']]);
  });

  test('dépôt : type contrôlé, contenu lisible seulement par la fonction dédiée, 10 dépôts par jour', async () => {
    await expect(anonyme("select portail_deposer_fichier($1, 'x.exe', 'data:application/x-msdownload;base64,AAAA')", [jeton])).rejects.toThrow(/non accepté/);
    await expect(anonyme("select portail_deposer_fichier($1, '../x.pdf', $2)", [jeton, pdf])).rejects.toThrow(/Nom de fichier invalide/);
    await anonyme("select portail_deposer_fichier($1, 'Plan.pdf', $2, 'Plan du rez-de-chaussée')", [jeton, pdf]);
    const [d] = await comme(lecteur, 'select id, nom, type_mime, taille, statut from portail_depots');
    expect(d).toMatchObject({ nom: 'Plan.pdf', type_mime: 'application/pdf', statut: 'recu' });
    await expect(comme(gerant, 'select contenu from portail_depots')).rejects.toThrow(/permission denied/);
    expect((await valeur(lecteur, 'select telecharger_depot_portail($1)', [d.id])).contenu).toBe(pdf);
    await expect(comme(autreGerant, 'select telecharger_depot_portail($1)', [d.id])).rejects.toThrow(/introuvable/);
    await expect(comme(collab, 'select traiter_depot_portail($1)', [d.id])).rejects.toThrow(/Permission refusée/);
    await comme(gerant, 'select traiter_depot_portail($1)', [d.id]);
    for (let i = 0; i < 9; i += 1) await anonyme("select portail_deposer_fichier($1, 'Photo.pdf', $2)", [jeton, pdf]);
    await expect(anonyme("select portail_deposer_fichier($1, 'Encore.pdf', $2)", [jeton, pdf])).rejects.toThrow(/Trop de demandes/);
    expect((await portail()).depots.length).toBe(10);
  });

  test('pièce jointe d’un devis : téléchargeable si non confidentielle', async () => {
    const piece = await valeur(gerant, 'select ajouter_piece_jointe($1, $2::jsonb)', [etab, json({ objet_type: 'document_vente', objet_id: devisA, nom: 'Plan.pdf', contenu: pdf })]);
    const secret = await valeur(gerant, 'select ajouter_piece_jointe($1, $2::jsonb)', [etab, json({ objet_type: 'document_vente', objet_id: devisA, nom: 'Marge.pdf', contenu: pdf, confidentiel: true })]);
    expect((await portail()).documents.find((x) => x.id === devisA).pieces.map((x) => x.nom)).toEqual(['Plan.pdf']);
    expect((await anonyme('select portail_telecharger($1, $2) r', [jeton, piece]))[0].r.contenu).toBe(pdf);
    await expect(anonyme('select portail_telecharger($1, $2)', [jeton, secret])).rejects.toThrow(/introuvable/);
  });
});

describe('fin d’un accès et isolation', () => {
  test('un lien révoqué, un contact désactivé ou un module coupé ferment l’espace ; l’empreinte d’un autre établissement ne sert à rien', async () => {
    const autre = await valeur(autreGerant, 'select creer_acces_portail($1, $2)', [autreEtab, autreClient]);
    expect((await portail(autre.jeton)).documents).toEqual([]);
    await expect(anonyme("select portail_repondre_devis($1, $2, 'accepte', 'Pirate')", [autre.jeton, devisB])).rejects.toThrow(/introuvable/);
    await expect(anonyme('select portail_document_vu($1, $2)', [autre.jeton, devisA])).rejects.toThrow(/introuvable/);
    await comme(sa, "select definir_module_etablissement($1, 'portail_client', false)", [autreEtab]);
    await expect(portail(autre.jeton)).rejects.toThrow(/n'existe pas ou a expiré/);
    await expect(comme(autreGerant, 'select revoquer_acces_portail($1)', [acces])).rejects.toThrow(/Permission refusée/);
    await comme(gerant, 'select revoquer_acces_portail($1)', [acces]);
    await expect(portail()).rejects.toThrow(/n'existe pas ou a expiré/);
    await expect(db.query("update portail_messages set texte = 'falsifié'")).rejects.toThrow(/ne se modifie pas/);
    await expect(db.query('delete from portail_evenements')).rejects.toThrow();
  });

  test('anonymiser un contact efface ses messages, signatures et fichiers déposés, et ferme son espace', async () => {
    const k = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'M. Départ', type: 'prospect' })]);
    const a = await valeur(gerant, 'select creer_acces_portail($1, $2)', [etab, k]);
    await anonyme("select portail_envoyer_message($1, 'Mon numéro : 06 000 00 00')", [a.jeton]);
    await anonyme("select portail_deposer_fichier($1, 'Pièce d’identité.pdf', $2)", [a.jeton, pdf]);
    await comme(gerant, "select anonymiser_contact($1, 'Demande du 10/10')", [k]);
    expect((await db.query('select texte from portail_messages where contact_id = $1', [k])).rows[0].texte).not.toMatch(/06/);
    expect((await db.query('select nom, contenu from portail_depots where contact_id = $1', [k])).rows[0]).toMatchObject({ contenu: null });
    expect((await db.query('select nom from portail_depots where contact_id = $1', [k])).rows[0].nom).not.toMatch(/identité/);
    await expect(portail(a.jeton)).rejects.toThrow(/n'existe pas ou a expiré/);
  });

  test('tableau de bord : domaine « Espace client » visible avec le droit de lecture', async () => {
    expect((await valeur(lecteur, 'select cockpit_domaines($1)', [etab])).map((d) => d.id)).toContain('portail');
    const c = await valeur(gerant, "select cockpit_portail($1, current_date - 30, current_date)", [etab]);
    expect(c.kpis.find((x) => x.cle === 'acceptes').valeur).toBe(1);
    expect(c.attention.find((x) => x.cle === 'depots').nombre).toBe(10);
    await expect(comme(autreGerant, "select cockpit_portail($1, current_date - 30, current_date)", [etab])).rejects.toThrow(/Permission refusée/);
  });
});
