/* API bideratzailea.
 *
 * Frontendak `fetch(API + '/api/...')` erabiltzen zuen 15 lekutan, eta guztiek
 * patroi bera: `res.ok` egiaztatu, `await res.json()`, eta errorea `.error`-etik
 * hartu. Zerbitzaria kentzean, dei-gune guztiak berridatzi beharrean, kontratu
 * bera betetzen duen funtzio bat jartzen dugu tartean.
 *
 * Horrela errendatze-kodea eta errore-maneiua ukitu gabe geratzen dira: 700
 * lerroko portea eta 15 dei-guneren berridazketa ez dira aldi berean egiten.
 *
 * `window.fetch` EZ da ordezkatzen: service worker-arekin eta baliabide
 * lokalen karguarekin talka egingo luke.
 */

/* Kontsolan eskaerak ikusteko (Network fitxa galtzen dugu bidean). */
const API_DEBUG = false;

/* `Response`-ren ordezkoa. Frontendak lau gauza baino ez ditu erabiltzen. */
class Erantzuna {
  constructor(egoera, gorputza) {
    this.status = egoera;
    this.ok = egoera >= 200 && egoera < 300;
    this._gorputza = gorputza;
  }
  async json() {
    return this._gorputza;
  }
}

/* Bide-ereduak, zehatzenetik orokorrenera. */
const BIDEAK = [
  ['GET', /^\/api\/factories$/, () => fabrikakZerrendatu()],
  ['POST', /^\/api\/factories$/, (m, gorputza) => [fabrikaSortu(gorputza), 201]],
  ['PUT', /^\/api\/factories\/(\d+)$/, (m, gorputza) => fabrikaEguneratu(Number(m[1]), gorputza)],
  ['DELETE', /^\/api\/factories\/(\d+)$/, (m) => fabrikaEzabatu(Number(m[1]))],

  ['GET', /^\/api\/materials$/, () => materialakZerrendatu()],
  ['PUT', /^\/api\/materials\/(\d+)$/, (m, gorputza) => materialaEguneratu(Number(m[1]), gorputza)],
  ['DELETE', /^\/api\/materials\/(\d+)$/, (m) => materialaEzabatu(Number(m[1]))],

  ['GET', /^\/api\/areas$/, () => eremuakZerrendatu()],
  ['POST', /^\/api\/areas$/, (m, gorputza) => [eremuaSortu(gorputza), 201]],
  ['PUT', /^\/api\/areas\/(\d+)$/, (m, gorputza) => eremuaEguneratu(Number(m[1]), gorputza)],
  ['DELETE', /^\/api\/areas\/(\d+)$/, (m) => eremuaEzabatu(Number(m[1]))],

  ['GET', /^\/api\/summary$/, () => laburpena()],
];

/* `fetch`-en ordezkoa. Bide bat bilatu, domeinu-funtzioa deitu, eta emaitza
 * `Erantzuna` batean bildu. Domeinu-funtzioek `ApiErrorea` jaurtitzen dute;
 * hemen HTTP egoera bihurtzen dira, zerbitzariak egiten zuen bezala. */
async function eskaera(bidea, aukerak) {
  const metodoa = (aukerak && aukerak.method) || 'GET';
  const gorputza = aukerak && aukerak.body ? JSON.parse(aukerak.body) : {};

  for (const [m, eredua, kudeatzailea] of BIDEAK) {
    if (m !== metodoa) continue;
    const bat = bidea.match(eredua);
    if (!bat) continue;

    try {
      const emaitza = kudeatzailea(bat, gorputza);
      // Kudeatzaileak [datuak, egoera] itzul dezake sorrera-kasuetarako (201).
      const [datuak, egoera] = Array.isArray(emaitza) && emaitza.length === 2 && typeof emaitza[1] === 'number'
        ? emaitza
        : [emaitza, 200];
      if (API_DEBUG) console.debug('[api]', metodoa, bidea, '→', egoera);
      // Mutazio arrakastatsu bakoitzak "esportatu gabeko aldaketa" bat
      // eransten du kontagailura (ikus js/kopiak.js). Puntu bakarra da
      // eskaera-mota guztiek zeharkatzen dutena, beraz ez da domeinu-
      // funtzio bakoitzean sakabanatu behar.
      if (metodoa !== 'GET' && egoera >= 200 && egoera < 300) aldaketaKontagailuaHanditu();
      return new Erantzuna(egoera, datuak);
    } catch (e) {
      if (e instanceof ApiErrorea) {
        if (API_DEBUG) console.debug('[api]', metodoa, bidea, '→', e.egoera, e.message);
        return new Erantzuna(e.egoera, { error: e.message, ...(e.gehigarriak || {}) });
      }
      throw e; // Programazio-akatsak ez dira ezkutatu behar.
    }
  }

  return new Erantzuna(404, { error: 'Bidea ez da aurkitu: ' + metodoa + ' ' + bidea });
}
