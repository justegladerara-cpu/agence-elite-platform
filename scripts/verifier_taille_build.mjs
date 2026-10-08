import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const dossier = process.argv[2] ?? 'dist/assets';
const limite = 500_000;
let depassement = false;
for (const nom of (await readdir(dossier)).filter((n) => n.endsWith('.js')).sort()) {
  const { size } = await stat(join(dossier, nom));
  if (size > limite) {
    console.error(`${nom} : ${size} octets, limite ${limite}`);
    depassement = true;
  }
}
if (depassement) process.exitCode = 1;
else console.log(`Paquets JS : tous inférieurs ou égaux à ${limite} octets.`);
