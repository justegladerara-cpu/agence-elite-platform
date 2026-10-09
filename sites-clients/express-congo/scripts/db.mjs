import { DatabaseSync } from "node:sqlite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
const command = process.argv[2];
if (process.env.APP_ENV === "production")
  throw new Error("Les outils locaux ne doivent pas viser la production.");
const path = resolve(process.env.LOCAL_DATABASE_PATH || ".data/demo.db");
await mkdir(dirname(path), { recursive: true });
if (command === "migrate") {
  const file = await readFile("database/001-foundation.sql", "utf8");
  const result = spawnSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "ec_local",
      "-d",
      "express_congo",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: file, encoding: "utf8" },
  );
  if (result.error)
    throw new Error(
      "Docker indisponible. La migration PostgreSQL reste non exécutée.",
    );
  console.log(result.stdout);
  if (result.status) throw new Error(result.stderr);
  process.exit(0);
}
const database = new DatabaseSync(path);
database.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
if (command === "reset") {
  database.exec("PRAGMA writable_schema=OFF;");
  for (const table of [
    "assignments",
    "entities",
    "user_sessions",
    "auth_tokens",
    "demo_users",
    "documents",
    "audit",
    "quotes",
    "editorial",
    "rate_limits",
    "sessions",
  ])
    database.exec(`DROP TABLE IF EXISTS ${table}`);
  console.log(
    "Base locale de démonstration remise à zéro. Relancer le serveur pour reconstruire le schéma.",
  );
} else if (command === "seed") {
  database.exec(
    "CREATE TABLE IF NOT EXISTS editorial (slug TEXT PRIMARY KEY,title TEXT NOT NULL,body TEXT NOT NULL,truth_status TEXT NOT NULL DEFAULT 'PROPOSÉ',version INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL)",
  );
  database
    .prepare("INSERT OR REPLACE INTO editorial VALUES(?,?,?,?,?,?)")
    .run(
      "/actualites",
      "Exemple éditorial fictif",
      "Cette annonce est uniquement un exemple de démonstration. Aucun départ réel n’est annoncé.",
      "PROPOSÉ",
      1,
      "2026-10-08T07:00:00.000Z",
    );
  console.log("Jeu fictif déterministe chargé.");
  database.exec(
    "CREATE TABLE IF NOT EXISTS entities(id TEXT PRIMARY KEY,kind TEXT NOT NULL,owner TEXT NOT NULL,agency TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,payload TEXT NOT NULL,created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS assignments(parcel_id TEXT PRIMARY KEY REFERENCES entities(id),shipment_id TEXT NOT NULL REFERENCES entities(id));",
  );
  const put = database.prepare(
    "INSERT OR IGNORE INTO entities VALUES(?,?,?,?,1,?,?)",
  );
  const shipment = "00000000-0000-4000-8000-000000000001",
    parcel = "00000000-0000-4000-8000-000000000002",
    event = "00000000-0000-4000-8000-000000000003",
    date = "2026-10-08T07:00:00.000Z";
  const measures = {
    length: "60",
    width: "40",
    height: "40",
    weight: "12",
    quantity: "3",
    unit: "cm",
  };
  put.run(
    shipment,
    "shipment",
    "client-demo-a",
    "paris",
    JSON.stringify({
      service: "maritime",
      route: "FR-CG",
      destination: "Brazzaville",
      status: "recu-en-agence",
      reference: "DEMO-EC-EXEMPLE-001",
      departure: null,
    }),
    date,
  );
  put.run(
    parcel,
    "parcel",
    "client-demo-a",
    "paris",
    JSON.stringify({
      reference: "DEMO-P-EXEMPLE-001",
      shipmentId: shipment,
      description: "Trois cartons fictifs",
      declared: measures,
      controlled: measures,
      reserves: "Exemple de démonstration",
      priceReviewRequired: false,
      priceReviewApproved: false,
    }),
    date,
  );
  put.run(
    event,
    "event",
    "client-demo-a",
    "paris",
    JSON.stringify({
      shipmentId: shipment,
      status: "recu-en-agence",
      location: "Agence fictive",
      occurredAt: date,
      author: "admin-demo",
      source: "demo-seed",
      public: false,
      reason: "Jeu fictif",
      corrects: null,
    }),
    date,
  );
  database
    .prepare("INSERT OR IGNORE INTO assignments VALUES(?,?)")
    .run(parcel, shipment);
} else if (command === "backup") {
  await mkdir(".backups", { recursive: true });
  const file = resolve(".backups/demo.sqlite");
  database.prepare("VACUUM INTO ?").run(file);
  console.log("Sauvegarde SQLite créée : " + file);
} else if (command === "restore") {
  const backupPath = process.argv[3];
  if (!backupPath)
    throw new Error(
      "Indiquez le chemin de sauvegarde. Arrêtez le serveur avant restauration.",
    );
  const bytes = await readFile(resolve(backupPath));
  database.close();
  await writeFile(path, bytes);
  const check = new DatabaseSync(path);
  if (check.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
    throw new Error("Sauvegarde invalide");
  check.close();
  console.log(
    "Restauration locale et intégrité vérifiées. Les pièces en BLOB sont incluses.",
  );
  process.exit(0);
} else
  throw new Error("Commande attendue : reset, migrate, seed, backup, restore");
database.close();
