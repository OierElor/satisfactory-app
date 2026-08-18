/* Esportazioa eta inportazioa: datuak gailuen artean mugitzeko bidea.
 *
 * Zerbitzaria zegoenean, kopiak `.db` fitxategiak ziren diskoan. Orain JSON
 * fitxategi bat deskargatzen/irakurtzen da. Horrek bi helburu betetzen ditu:
 * segurtasun-kopia izatea eta ordenagailua↔mugikorra trukea.
 *
 * INPORTAZIOA DA KONFIANTZA-MUGA. Zerbitzaririk gabe, balioztatzeak ez du
 * eskaerarik geldiarazten; kanpotik datorren gauza bakarra fitxategi hau da.
 * Beraz hemen zorrotz egiaztatzen da dena, `kopia_baliozkoa`-k `.db` igoerekin
 * egiten zuen bezala: egitura, erregistro bakoitza, eta erreferentzien osotasuna.
 */

const AZKEN_ESPORTAZIOA_KLABEA = 'satisfactory_azken_esportazioa';

/* Fitxategi-izena: kopia-YYYYMMDD-HHMMSS.json, zerbitzariaren patroiari eutsiz. */
function kopiaIzena() {
  const d = new Date();
  const bi = (n) => String(n).padStart(2, '0');
  return (
    'kopia-' + d.getFullYear() + bi(d.getMonth() + 1) + bi(d.getDate()) +
    '-' + bi(d.getHours()) + bi(d.getMinutes()) + bi(d.getSeconds()) + '.json'
  );
}

function fitxategiaDeskargatu(izena, edukia, mota) {
  const blob = new Blob([edukia], { type: mota });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = izena;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* Uneko egoera JSON gisa deskargatu. `isilean` erabiltzen da inportatu aurreko
   babes-kopia automatikorako, non ez den mezurik erakusten. */
function datuakEsportatu(isilean) {
  const dok = dokumentuaKargatu();
  dok.esportazio_data = new Date().toISOString();
  const izena = kopiaIzena();
  fitxategiaDeskargatu(izena, JSON.stringify(dok, null, 2), 'application/json');
  localStorage.setItem(AZKEN_ESPORTAZIOA_KLABEA, dok.esportazio_data);
  if (!isilean) {
    kopiakErrendatu();
    alert('Esportatuta: ' + izena);
  }
  return izena;
}

// ---------- Inportazioaren balioztatzea ----------

function zenbakiOsoa(balioa) {
  return typeof balioa === 'number' && Number.isInteger(balioa);
}

/* Dokumentu oso bat egiaztatzen du. Errore-mezuak zehatzak dira: fitxategi bat
   baztertzen bada, erabiltzaileak zergatik jakin behar du. */
function dokumentuaBalioztatu(dok) {
  if (!dok || typeof dok !== 'object' || Array.isArray(dok)) {
    throw sarreraOkerra('Fitxategiak ez du datu-egitura egokia');
  }
  if (dok.bertsioa !== 1) {
    throw sarreraOkerra('Bertsio ezezaguna: ' + dok.bertsioa + ' (1 espero zen)');
  }
  for (const taula of TAULAK) {
    if (!Array.isArray(dok[taula])) {
      throw sarreraOkerra('"' + taula + '" zerrenda falta da edo okerra da');
    }
  }

  const eremuIdak = new Set();
  for (const e of dok.areas) {
    if (!zenbakiOsoa(e.id)) throw sarreraOkerra('Eremu baten id-a okerra da');
    testuaBalioztatu(e.name, 'Izena', GEHIENEZ_IZENA);
    eremuIdak.add(e.id);
  }

  const materialIdak = new Set();
  for (const m of dok.materials) {
    if (!zenbakiOsoa(m.id)) throw sarreraOkerra('Material baten id-a okerra da');
    testuaBalioztatu(m.name, 'Materialaren izena', GEHIENEZ_IZENA);
    if (m.color !== null && m.color !== undefined &&
        !(typeof m.color === 'string' && KOLORE_RE.test(m.color))) {
      throw sarreraOkerra('"' + m.name + '" materialaren kolorea ez da baliozkoa');
    }
    materialIdak.add(m.id);
  }

  const fabrikaIdak = new Set();
  for (const f of dok.factories) {
    if (!zenbakiOsoa(f.id)) throw sarreraOkerra('Fabrika baten id-a okerra da');
    testuaBalioztatu(f.name, 'Izena', GEHIENEZ_IZENA);
    testuaBalioztatu(f.description, 'Deskribapena', GEHIENEZ_DESKRIBAPENA, false);
    if (f.area_id !== null && f.area_id !== undefined) {
      if (!zenbakiOsoa(f.area_id) || !eremuIdak.has(f.area_id)) {
        throw sarreraOkerra('"' + f.name + '" fabrikak existitzen ez den eremu bat du');
      }
    }
    fabrikaIdak.add(f.id);
  }

  for (const r of dok.factory_resources) {
    if (!zenbakiOsoa(r.id)) throw sarreraOkerra('Baliabide baten id-a okerra da');
    if (!fabrikaIdak.has(r.factory_id)) {
      throw sarreraOkerra('Baliabide batek existitzen ez den fabrika bat aipatzen du');
    }
    if (!materialIdak.has(r.material_id)) {
      throw sarreraOkerra('Baliabide batek existitzen ez den materiala aipatzen du');
    }
    // Kopuruak zenbaki finituak izan behar dira: hori zen `.db` igoeretan
    // egiaztatzen zen gauza bera (testua zenbaki-zutabe batean).
    kopuruaBalioztatu(r.amount_per_min);
    if (r.type !== 'input' && r.type !== 'output') {
      throw sarreraOkerra('Baliabide baten mota okerra da: ' + r.type);
    }
  }

  return dok;
}

async function datuakInportatu(input) {
  const fitxategia = input.files[0];
  input.value = '';
  if (!fitxategia) return;

  let dok;
  try {
    dok = dokumentuaBalioztatu(JSON.parse(await fitxategia.text()));
  } catch (e) {
    alert('Errorea: ' + (e instanceof ApiErrorea || e instanceof Error ? e.message : 'fitxategia ezin da irakurri'));
    return;
  }

  const unekoa = dokumentuaKargatu();
  const data = dok.esportazio_data ? new Date(dok.esportazio_data).toLocaleString('eu') : 'ezezaguna';
  const berretsi = confirm(
    'Fitxategiaren edukia:\n' +
    '  ' + dok.factories.length + ' fabrika, ' + dok.materials.length + ' material, ' +
    dok.areas.length + ' eremu\n' +
    '  Esportazio-data: ' + data + '\n\n' +
    'Oraingo datuak:\n' +
    '  ' + unekoa.factories.length + ' fabrika, ' + unekoa.materials.length + ' material, ' +
    unekoa.areas.length + ' eremu\n\n' +
    'INPORTAZIOAK DENA ORDEZKATZEN DU. Ez da bat-egiterik egiten.\n' +
    'Aurretik uneko egoera automatikoki deskargatuko da.\n\nJarraitu?'
  );
  if (!berretsi) return;

  // Babes-kopia automatikoa: berreskuratzeak zerbitzarian egiten zuen bezala.
  if (unekoa.factories.length || unekoa.materials.length) {
    datuakEsportatu(true);
  }

  dokumentuaGorde(dok);
  await eremuakKargatu();
  await materialakKargatu();
  await fabrikakKargatu();
  kopiakErrendatu();
  alert('Datuak inportatuta.');
}

// ---------- Biltegiaren egoera ----------

/* Nabigatzaileari datuak ez ezabatzeko eskatzen dio. Onartuz gero, "nabigazio-
   datuak garbitu" ekintzak ez du biltegia hustuko presio automatikoagatik. */
async function iraunkortasunaEskatu() {
  if (!navigator.storage || !navigator.storage.persist) return null;
  if (await navigator.storage.persisted()) return true;
  return await navigator.storage.persist();
}

async function biltegiEgoera() {
  const dok = dokumentuaKargatu();
  const azkena = localStorage.getItem(AZKEN_ESPORTAZIOA_KLABEA);
  let iraunkorra = null;
  if (navigator.storage && navigator.storage.persisted) {
    iraunkorra = await navigator.storage.persisted();
  }
  return {
    fabrikak: dok.factories.length,
    materialak: dok.materials.length,
    eremuak: dok.areas.length,
    baliabideak: dok.factory_resources.length,
    tamaina: new Blob([JSON.stringify(dok)]).size,
    azkenEsportazioa: azkena,
    egunak: azkena ? Math.floor((Date.now() - new Date(azkena)) / 86400000) : null,
    iraunkorra,
  };
}
