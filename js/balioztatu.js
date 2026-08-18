/* Sarreren balioztatzea.
 *
 * `app.py`-ren arauen porte zehatza. Mezuak hitzez hitz mantentzen dira:
 * erabiltzaileak lehen ikusten zituenak dira, eta probek ere horiek egiaztatzen
 * dituzte.
 *
 * Zerbitzaria zegoenean hau zen konfiantza-muga. Orain, zerbitzaririk gabe,
 * balioztatze hau erabiltzailearen laguntza da batez ere — benetako muga
 * inportazioa da (ikus kopiak.js), kanpoko fitxategi bat baita.
 */

const GEHIENEZ_IZENA = 200;
const GEHIENEZ_DESKRIBAPENA = 1000;
const GEHIENEZ_BALIABIDEAK = 200;
const GEHIENEZ_KOPURUA = 1000000;

const KOLORE_RE = /^#[0-9A-Fa-f]{6}$/;

/* Zerbitzariaren HTTP erantzunen baliokidea: egoera-kodea daraman errorea. */
class ApiErrorea extends Error {
  constructor(egoera, mezua, gehigarriak) {
    super(mezua);
    this.name = 'ApiErrorea';
    this.egoera = egoera;
    this.gehigarriak = gehigarriak || null;
  }
}

/* Sarrera okerra: beti 400, `SarreraOkerra`-k bezala. */
function sarreraOkerra(mezua) {
  return new ApiErrorea(400, mezua);
}

function testuaBalioztatu(balioa, eremua, gehienez, nahitaezkoa = true) {
  if (balioa === null || balioa === undefined) balioa = '';
  if (typeof balioa !== 'string') {
    throw sarreraOkerra(eremua + ' testu bat izan behar da');
  }
  balioa = balioa.trim();
  if (nahitaezkoa && !balioa) {
    throw sarreraOkerra(eremua + ' nahitaezkoa da');
  }
  if (balioa.length > gehienez) {
    throw sarreraOkerra(eremua + ' luzeegia da (gehienez ' + gehienez + ' karaktere)');
  }
  return balioa;
}

/* Zenbaki finitu positiboa.
 *
 * Python-en `isinstance(balioa, bool)` egiaztapenak booleanoak baztertzen ditu
 * zenbaki gisa pasa ez daitezen; JSn `typeof true === 'boolean'` denez, hori
 * doan dator. Testu-kateak ere baztertzen dira: ez da bihurketarik egiten.
 */
function kopuruaBalioztatu(balioa) {
  if (typeof balioa !== 'number') {
    throw sarreraOkerra('Kopurua zenbaki bat izan behar da');
  }
  if (!Number.isFinite(balioa)) {
    throw sarreraOkerra('Kopurua zenbaki finitu bat izan behar da');
  }
  if (!(balioa > 0 && balioa <= GEHIENEZ_KOPURUA)) {
    throw sarreraOkerra('Kopurua 0 eta ' + GEHIENEZ_KOPURUA + ' artean egon behar da');
  }
  return balioa;
}

function baliabideakBalioztatu(baliabideak) {
  if (baliabideak === null || baliabideak === undefined) return [];
  if (!Array.isArray(baliabideak)) {
    throw sarreraOkerra('Baliabideak zerrenda bat izan behar dira');
  }
  if (baliabideak.length > GEHIENEZ_BALIABIDEAK) {
    throw sarreraOkerra('Baliabide gehiegi (gehienez ' + GEHIENEZ_BALIABIDEAK + ')');
  }
  const garbiak = [];
  for (const res of baliabideak) {
    // Arrayak ere `object` dira JSn; Python-en `isinstance(res, dict)`-ek
    // baztertu egiten zituen, beraz esplizituki baztertzen ditugu.
    if (res === null || typeof res !== 'object' || Array.isArray(res)) {
      throw sarreraOkerra('Baliabide bakoitza objektu bat izan behar da');
    }
    const mota = res.type;
    if (mota !== 'input' && mota !== 'output') {
      throw sarreraOkerra('Baliabidearen mota "input" edo "output" izan behar da');
    }
    garbiak.push({
      material: testuaBalioztatu(res.material, 'Materialaren izena', GEHIENEZ_IZENA),
      amount: kopuruaBalioztatu(res.amount),
      type: mota,
    });
  }
  return garbiak;
}

/* SQLiteren BINARY collation: kode-unitateka alderatzen du, ez hizkuntzaren
   arauen arabera. `localeCompare` erabiliz gero ordena aldatuko litzateke
   (adib. letra larriak eta azentudunak beste toki batean agertuko lirateke). */
function kmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/* SQLiteren COLLATE NOCASE: ASCII hutsa da. `toLowerCase()`-k Unicode osoa
   bihurtzen du, eta horrek SQLitek bereizten dituen izenak parekatuko lituzke
   (adib. turkierazko İ). Portea fidela izan dadin, ASCII soilik. */
function nocase(testua) {
  return String(testua).replace(/[A-Z]/g, (c) => c.toLowerCase());
}
