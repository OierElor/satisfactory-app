/* Probak Deno-n exekutatzeko biltzailea.
 *
 *   deno run --allow-read tresnak/probak-deno.js
 *
 * Nabigatzailean `probak.html` erabiltzen da; hemen berdin-berdinak diren
 * probak exekutatzen dira kontsolatik, aldaketa bakoitzean azkar egiaztatzeko.
 */

const OINARRIA = new URL('..', import.meta.url).pathname;

// Nabigatzailearen localStorage-a imitatu.
const biltegia = new Map();
globalThis.localStorage = {
  getItem: (k) => (biltegia.has(k) ? biltegia.get(k) : null),
  setItem: (k, b) => biltegia.set(k, String(b)),
  removeItem: (k) => biltegia.delete(k),
};

// <script> etiketek esparru lexiko globala partekatzen dute nabigatzailean;
// Deno-ren eval-ak dei bakoitza isolatzen du, beraz elkarrekin kateatzen ditugu.
const iturriak = [];
for (const izena of ['balioztatu', 'biltegia', 'api', 'kopiak', 'probak']) {
  iturriak.push(await Deno.readTextFile(`${OINARRIA}js/${izena}.js`));
}
(0, eval)(iturriak.join('\n;\n'));

const emaitza = await probakExekutatu((ondo, izena, mezua) => {
  console.log(ondo ? `  ✓ ${izena}` : `  ✗ ${izena}\n      ${mezua}`);
});

console.log(`\n${emaitza.ondo}/${emaitza.guztira} proba ondo\n`);
Deno.exit(emaitza.akatsak.length ? 1 : 0);
