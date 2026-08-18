/* Alderaketa-tresna: Flask vs biltegi lokala.
 *
 * Portea zuzena den egiaztatzeko sarea. Flask martxan dagoela, GET endpoint
 * guztien erantzunak eskatzen ditu, eta datu berberekin kargatutako biltegi
 * lokalarenekin alderatzen ditu, `JSON.stringify` bidez. Berdin-berdinak izan
 * behar dute; bestela portean akatsen bat dago.
 *
 *   python3 app.py &                       # Flask 5000 portuan
 *   python3 tresnak/migratu.py             # datuak.json sortu
 *   deno run --allow-read --allow-net tresnak/alderatu.js
 *
 * Mutazioak ere probatzen ditu: sekuentzia bat aplikatzen du bi aldeetan eta
 * ondorengo GET erantzunak alderatzen ditu.
 */

const OINARRIA = new URL('..', import.meta.url).pathname;
const FLASK = 'http://127.0.0.1:5000';

// ---------- Nabigatzailearen ingurunea imitatu ----------

const biltegia = new Map();
globalThis.localStorage = {
  getItem: (k) => (biltegia.has(k) ? biltegia.get(k) : null),
  setItem: (k, b) => biltegia.set(k, String(b)),
  removeItem: (k) => biltegia.delete(k),
};

// Nabigatzailean <script> etiketek esparru lexiko globala partekatzen dute;
// Deno-ren eval-ak, ordea, dei bakoitza isolatzen du. Fitxategiak elkarrekin
// kateatzen ditugu, `class`/`const` deklarazioak elkarri ikusgai izan dakizkien.
const iturriak = [];
for (const izena of ['balioztatu', 'biltegia', 'api']) {
  iturriak.push(await Deno.readTextFile(`${OINARRIA}js/${izena}.js`));
}
(0, eval)(iturriak.join('\n;\n'));

// ---------- Datuak kargatu ----------

// `alderatu.sh`-k aldi bakoitzeko JSON fresko bat pasatzen du; bestela
// errepositorioko `datuak.json` erabiltzen da (zaharkituta egon daiteke).
const jsonBidea = Deno.env.get('DATUAK_JSON') || `${OINARRIA}datuak.json`;
const hasierakoak = await Deno.readTextFile(jsonBidea);
localStorage.setItem('satisfactory_datuak_v1', hasierakoak);

// ---------- Alderaketa ----------

let akatsak = 0;
let egiaztapenak = 0;

/* Flask-ek (jsonify) gakoak alfabetikoki ordenatuta itzultzen ditu; guk SQLeko
 * zutabeen ordenan eraikitzen ditugu. JSON objektuetan gakoen ordena ez da
 * esanguratsua eta frontendak izenez irakurtzen ditu, beraz bi aldeak forma
 * kanoniko batera eramaten ditugu alderatu aurretik. */
function kanoniko(balioa) {
  if (Array.isArray(balioa)) return balioa.map(kanoniko);
  if (balioa && typeof balioa === 'object') {
    return Object.fromEntries(
      Object.keys(balioa).sort().map((k) => [k, kanoniko(balioa[k])])
    );
  }
  return balioa;
}

function alderatu(izena, flaskDatuak, tokikoDatuak) {
  egiaztapenak++;
  const a = JSON.stringify(kanoniko(flaskDatuak));
  const b = JSON.stringify(kanoniko(tokikoDatuak));
  if (a === b) {
    console.log(`  ✓ ${izena}`);
    return true;
  }
  akatsak++;
  console.log(`  ✗ ${izena}`);
  // Lehen desberdintasuna non dagoen erakutsi, itsu ez ibiltzeko.
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      const hasi = Math.max(0, i - 90);
      console.log(`      flask : …${a.slice(hasi, i + 90)}`);
      console.log(`      tokiko: …${b.slice(hasi, i + 90)}`);
      break;
    }
  }
  return false;
}

async function flaskGet(bidea) {
  const r = await fetch(FLASK + bidea);
  return await r.json();
}

async function tokikoGet(bidea) {
  const r = await eskaera(bidea, { method: 'GET' });
  return await r.json();
}

const GETAK = ['/api/factories', '/api/materials', '/api/areas', '/api/summary'];

console.log('\nGET endpointak (hasierako datuak):');
for (const bidea of GETAK) {
  alderatu(bidea, await flaskGet(bidea), await tokikoGet(bidea));
}

// ---------- Mutazioak ----------

/* Bi aldeetan eragiketa bera aplikatu eta emaitza alderatu. */
async function mutazioa(izena, bidea, aukerak) {
  const flaskErantzuna = await fetch(FLASK + bidea, {
    method: aukerak.method,
    headers: { 'Content-Type': 'application/json' },
    body: aukerak.body,
  });
  const flaskGorputza = await flaskErantzuna.json();

  const tokikoErantzuna = await eskaera(bidea, aukerak);
  const tokikoGorputza = await tokikoErantzuna.json();

  egiaztapenak++;
  const berdin =
    flaskErantzuna.status === tokikoErantzuna.status &&
    JSON.stringify(kanoniko(flaskGorputza)) === JSON.stringify(kanoniko(tokikoGorputza));
  if (berdin) {
    console.log(`  ✓ ${izena} (${flaskErantzuna.status})`);
  } else {
    akatsak++;
    console.log(`  ✗ ${izena}`);
    console.log(`      flask : ${flaskErantzuna.status} ${JSON.stringify(flaskGorputza)}`);
    console.log(`      tokiko: ${tokikoErantzuna.status} ${JSON.stringify(tokikoGorputza)}`);
  }
  return flaskGorputza;
}

const json = (o) => JSON.stringify(o);

console.log('\nMutazioak:');

// Sorrera arrunta, material berri batekin eta lehendik dagoen batekin.
const sortua = await mutazioa('POST fabrika berria', '/api/factories', {
  method: 'POST',
  body: json({
    name: 'Alderaketa Proba',
    description: 'tresnak/alderatu.js-ek sortua',
    resources: [
      { material: 'Iron Ore', amount: 60, type: 'input' },
      { material: 'Alderaketa Material Berria', amount: 30, type: 'output' },
    ],
  }),
});

// Izen bikoiztua: 409 izan behar da, maiuskulak/minuskulak bereizi gabe.
await mutazioa('POST izen bikoiztua (409)', '/api/factories', {
  method: 'POST',
  body: json({ name: 'alderaketa proba', description: '', resources: [] }),
});

// Balioztatze-erroreak.
await mutazioa('POST izenik gabe (400)', '/api/factories', {
  method: 'POST',
  body: json({ name: '', resources: [] }),
});
await mutazioa('POST kopuru negatiboa (400)', '/api/factories', {
  method: 'POST',
  body: json({ name: 'X', resources: [{ material: 'M', amount: -5, type: 'output' }] }),
});
await mutazioa('POST mota okerra (400)', '/api/factories', {
  method: 'POST',
  body: json({ name: 'X', resources: [{ material: 'M', amount: 5, type: 'bad' }] }),
});
await mutazioa('POST eremu ezezaguna (400)', '/api/factories', {
  method: 'POST',
  body: json({ name: 'Y', resources: [], area_id: 99999 }),
});

// Sorrerak funtzionatu behar du. Huts eginez gero (adib. izena jada existitzen
// delako), ondorengo probak saltatuko lirateke ISILEAN, eta emaitza berdea
// izango litzateke ezer probatu gabe. Hobe ozen huts egin.
if (!sortua || !sortua.id) {
  akatsak++;
  console.log('  ✗ sorrerak ez du id-rik itzuli: ondorengo probak ezin dira exekutatu');
  console.log('      erantzuna: ' + JSON.stringify(sortua));
}

// Eguneraketa: baliabideak ordezkatu eta material lehendik dagoena berrerabili
// letra larri/xeheak alde batera utzita.
if (sortua && sortua.id) {
  await mutazioa('PUT fabrika eguneratu', `/api/factories/${sortua.id}`, {
    method: 'PUT',
    body: json({
      name: 'Alderaketa Proba Aldatua',
      description: '',
      resources: [{ material: 'iron ore', amount: 15, type: 'input' }],
    }),
  });
}

await mutazioa('PUT fabrika ezezaguna (404)', '/api/factories/999999', {
  method: 'PUT',
  body: json({ name: 'Z', description: '', resources: [] }),
});

// Eremuak.
const eremua = await mutazioa('POST eremu berria', '/api/areas', {
  method: 'POST',
  body: json({ name: 'Alderaketa Eremua' }),
});
await mutazioa('POST eremu bikoiztua (409)', '/api/areas', {
  method: 'POST',
  body: json({ name: 'Alderaketa Eremua' }),
});

console.log('\nGET endpointak (mutazioen ondoren):');
for (const bidea of GETAK) {
  alderatu(bidea, await flaskGet(bidea), await tokikoGet(bidea));
}

// ---------- Garbiketa ----------

console.log('\nGarbiketa:');
if (sortua && sortua.id) {
  await mutazioa('DELETE fabrika', `/api/factories/${sortua.id}`, { method: 'DELETE' });
}
if (eremua && eremua.id) {
  await mutazioa('DELETE eremua', `/api/areas/${eremua.id}`, { method: 'DELETE' });
}

console.log('\nGET endpointak (garbiketaren ondoren):');
for (const bidea of GETAK) {
  alderatu(bidea, await flaskGet(bidea), await tokikoGet(bidea));
}

console.log(`\n${egiaztapenak} egiaztapen, ${akatsak} akats\n`);
Deno.exit(akatsak ? 1 : 0);
