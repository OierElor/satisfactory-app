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

/* Izen-talken egiaztapena.
 *
 * `index.html`-eko inline scripta AZKENA kargatzen da nabigatzailean, beraz
 * bere `function` deklarazioek izen bereko `js/*.js`-koak GAINIDAZTEN dituzte.
 * Hori gertatu zen behin: interfazeko `materialaEzabatu`-k biltegikoa ordezkatu
 * zuen, eta `eskaera()`-k ezabatzeko deitzean interfazeko funtziora itzultzen
 * zen — ezabaketak isilean huts egiten zuen, 200 OK itzuliz.
 *
 * Probek ez zuten hori antzematen: `probak.js`-ek ez du inline scripta
 * kargatzen. Beraz hemen egiaztatzen da, estatikoki. */
async function izenTalkakEgiaztatu() {
  const moduluIzenak = new Set();
  for (const izena of ['balioztatu', 'biltegia', 'api', 'kopiak']) {
    const iturria = await Deno.readTextFile(`${OINARRIA}js/${izena}.js`);
    for (const m of iturria.matchAll(/^\s*(?:async\s+)?function\s+([a-zA-Z_$][\w$]*)/gm)) {
      moduluIzenak.add(m[1]);
    }
  }

  const orria = await Deno.readTextFile(`${OINARRIA}index.html`);
  const inline = [...orria.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]).join('\n');

  const talkak = [];
  for (const m of inline.matchAll(/^\s*(?:async\s+)?function\s+([a-zA-Z_$][\w$]*)/gm)) {
    if (moduluIzenak.has(m[1])) talkak.push(m[1]);
  }

  if (talkak.length) {
    console.log('\n  ✗ IZEN-TALKAK index.html eta js/*.js artean:');
    for (const izena of [...new Set(talkak)].sort()) {
      console.log(`      ${izena}() — inline scriptak biltegiko funtzioa gainidazten du`);
    }
    console.log('      Berrizendatu interfazekoak (adib. "-tzeko" atzizkiarekin).');
    return false;
  }
  console.log('  ✓ izen-talkarik ez index.html eta js/*.js artean');
  return true;
}

const talkarikEz = await izenTalkakEgiaztatu();

const emaitza = await probakExekutatu((ondo, izena, mezua) => {
  console.log(ondo ? `  ✓ ${izena}` : `  ✗ ${izena}\n      ${mezua}`);
});

console.log(`\n${emaitza.ondo}/${emaitza.guztira} proba ondo\n`);
Deno.exit(emaitza.akatsak.length || !talkarikEz ? 1 : 0);
