import { fileURLToPath } from 'node:url';
import { assertNoSharpInDist } from './no-sharp.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
await assertNoSharpInDist(root);
console.log('Geen Sharp/libvips-bestanden gevonden in de app-builds (hub, sportapp, sidequest, ecosystem).');
