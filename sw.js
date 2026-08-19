/* Service worker-a: aplikazioa offline erabiltzeko.
 *
 * Aplikazioaren azala (HTML, JS, letra-tipoak, Chart.js) cachean gordetzen du
 * instalatzean. Datuek ez dute zerikusirik honekin: localStorage-en daude, eta
 * cachea hustzeak ez ditu ukitzen.
 *
 * BERTSIOA aldatu behar da azaleko fitxategiren bat aldatzen den bakoitzean;
 * bestela nabigatzaileak zaharra emango du betiko.
 */

const BERTSIOA = 'v3';
const CACHE_IZENA = 'fabrikak-' + BERTSIOA;

const AZALA = [
  '.',
  'index.html',
  'manifest.webmanifest',
  'js/balioztatu.js',
  'js/biltegia.js',
  'js/api.js',
  'js/kopiak.js',
  'bendor/chart.umd.js',
  'bendor/letrak.css',
  'bendor/letrak/Rajdhani-400-latin.woff2',
  'bendor/letrak/Rajdhani-400-latin-ext.woff2',
  'bendor/letrak/Rajdhani-500-latin.woff2',
  'bendor/letrak/Rajdhani-500-latin-ext.woff2',
  'bendor/letrak/Rajdhani-600-latin.woff2',
  'bendor/letrak/Rajdhani-600-latin-ext.woff2',
  'bendor/letrak/Rajdhani-700-latin.woff2',
  'bendor/letrak/Rajdhani-700-latin-ext.woff2',
  'bendor/letrak/ShareTechMono-400-latin.woff2',
  'bendor/letrak/Exo2-var-latin.woff2',
  'bendor/letrak/Exo2-var-latin-ext.woff2',
  'ikonoak/ikonoa.svg',
  'ikonoak/ikonoa-192.png',
  'ikonoak/ikonoa-512.png',
];

self.addEventListener('install', (gertaera) => {
  gertaera.waitUntil(
    caches.open(CACHE_IZENA)
      .then((cachea) => cachea.addAll(AZALA))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (gertaera) => {
  // Bertsio zaharren cacheak kendu: bestela diskoa pilatzen joango litzateke.
  gertaera.waitUntil(
    caches.keys()
      .then((izenak) => Promise.all(
        izenak.filter((i) => i.startsWith('fabrikak-') && i !== CACHE_IZENA)
              .map((i) => caches.delete(i))
      ))
      .then(() => self.clients.claim())
  );
});

/* Cachea lehenik: aplikazioa berehala kargatzen da eta sarerik gabe dabil.
 * Eguneraketak BERTSIOA aldatuz iristen dira, ez sareko galderen bidez. */
self.addEventListener('fetch', (gertaera) => {
  const eskaera = gertaera.request;
  if (eskaera.method !== 'GET') return;

  gertaera.respondWith(
    caches.match(eskaera).then((erantzuna) => {
      if (erantzuna) return erantzuna;
      return fetch(eskaera).then((sarekoa) => {
        // Jatorri berekoak bakarrik gorde; kanpokorik ez dago, baina badaezpada.
        if (sarekoa.ok && new URL(eskaera.url).origin === self.location.origin) {
          const kopia = sarekoa.clone();
          caches.open(CACHE_IZENA).then((cachea) => cachea.put(eskaera, kopia));
        }
        return sarekoa;
      });
    })
  );
});
