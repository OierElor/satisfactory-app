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
const ALDAKETA_KONTAGAILUA_KLABEA = 'satisfactory_aldaketa_kontagailua';

/* Azken esportaziotik zenbat mutazio (sortu/editatu/ezabatu) egin diren.
 * `js/api.js`-k handitzen du mutazio arrakastatsu bakoitzean.
 *
 * Fitxa anitzeko kasua: azkenak irabazten du (last-write-wins), ez dago
 * fitxen arteko mezularitzarik (BroadcastChannel gehitzea gehiegizkoa
 * litzateke tamaina honetako aplikazio pertsonal batentzat). */
function aldaketaKontagailuaHanditu() {
  const uneko = parseInt(localStorage.getItem(ALDAKETA_KONTAGAILUA_KLABEA), 10) || 0;
  localStorage.setItem(ALDAKETA_KONTAGAILUA_KLABEA, String(uneko + 1));
}

function aldaketaKontagailuaBerrezarri() {
  localStorage.setItem(ALDAKETA_KONTAGAILUA_KLABEA, '0');
}

function aldaketaKontagailua() {
  return parseInt(localStorage.getItem(ALDAKETA_KONTAGAILUA_KLABEA), 10) || 0;
}
const ESPORTAZIO_HISTORIA_KLABEA = 'satisfactory_esportazio_historia';
const ESPORTAZIO_HISTORIA_GEHIENEZ = 20;

/* Esportazio bakoitzaren erregistro txiki bat gordetzen du (data + kopuruak
   soilik, ez edukia — hori bikoiztea eta biltegia puztea izango litzateke).
   Esportazio guztiak erregistratzen dira, isilekoak barne: hau historiko
   deskriptibo bat da, ez "sinkronizatu gabe" seinale bat (ikus aldaketa-
   kontagailua, isilekoek EZ dutena berrezartzen). */
function esportazioHistorianGehitu(dok, izena) {
  let historia = [];
  try {
    historia = JSON.parse(localStorage.getItem(ESPORTAZIO_HISTORIA_KLABEA)) || [];
    if (!Array.isArray(historia)) historia = [];
  } catch (e) { historia = []; }
  historia.push({
    data: dok.esportazio_data,
    izena,
    fabrikak: dok.factories.length,
    materialak: dok.materials.length,
    eremuak: dok.areas.length,
    baliabideak: dok.factory_resources.length,
  });
  historia = historia.slice(-ESPORTAZIO_HISTORIA_GEHIENEZ);
  localStorage.setItem(ESPORTAZIO_HISTORIA_KLABEA, JSON.stringify(historia));
}

function esportazioHistoria() {
  try {
    const historia = JSON.parse(localStorage.getItem(ESPORTAZIO_HISTORIA_KLABEA));
    return Array.isArray(historia) ? historia.slice().reverse() : [];
  } catch (e) {
    return [];
  }
}

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

/* Uneko egoera JSON gisa deskargatu edo partekatu. `isilean` erabiltzen da
   inportatu aurreko babes-kopia automatikorako: kasu horretan beti deskarga
   soila da, ez baita egokia partekatze-menua ustekabean irekitzea segurtasun-
   ekintza automatiko baten erdian. Erabiltzaileak berak eskatutako
   esportazioan bakarrik saiatzen da Web Share bidez (telefonoan, partekatze-
   menua zuzenean irekitzeko: WhatsApp, Bluetooth, Nearby Share...); onartzen
   ez badu edo huts eginez gero, deskarga arruntera jotzen du. */
async function datuakEsportatu(isilean) {
  const dok = dokumentuaKargatu();
  dok.esportazio_data = new Date().toISOString();
  const izena = kopiaIzena();
  const edukia = JSON.stringify(dok, null, 2);

  let partekatuta = false;
  if (!isilean && navigator.share && navigator.canShare) {
    try {
      const fitxategia = new File([edukia], izena, { type: 'application/json' });
      if (navigator.canShare({ files: [fitxategia] })) {
        await navigator.share({ files: [fitxategia], title: izena });
        partekatuta = true;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') { partekatuta = true; } // erabiltzaileak bertan behera utzi du, ez erakutsi deskarga
      // beste edozein errore: deskarga arruntera jo
    }
  }
  if (!partekatuta) {
    fitxategiaDeskargatu(izena, edukia, 'application/json');
  }

  localStorage.setItem(AZKEN_ESPORTAZIOA_KLABEA, dok.esportazio_data);
  esportazioHistorianGehitu(dok, izena);
  if (!isilean) {
    // Babeskopia isilak (inportazio aurrekoa) ez du kontagailua garbitzen:
    // ez du erabiltzailearen sinkronizazio-ekintza islatzen.
    aldaketaKontagailuaBerrezarri();
    aldaketakErrendatu();
    kopiakErrendatu();
    if (!partekatuta) alert('Esportatuta: ' + izena);
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

// ---------- Bat-egitea ----------

/* Bi dokumentu batzen ditu, daturik isilean ezabatu gabe.
 *
 * Identitatea taula bakoitzeko modu desberdinean erabakitzen da:
 *  - Fabrikak/eremuak: `id`+`created_at` (aldaezina) da benetako identitatea.
 *    id bera badute baina `created_at` desberdina, bi gailuk independenteki
 *    sortutako erregistro DESBERDINAK dira (talka ustekabekoa) — inportatutakoa
 *    id berri batekin berrizendatzen da.
 *  - Materialak: `baliabideakIdatzi`-k jada erabiltzen duen logika bera,
 *    izenez (maiuskulak/minuskulak bereizi gabe) identifikatzen dira, ez id-z.
 *
 * Erregistro bat alde batean bakarrik badago (lokalean edo inportatutakoan),
 * mantendu egiten da beti — ez dago "tonbatik" ezabatzeak antzemateko;
 * erabiltzaileak eskuz ezabatu behar ditu nahi ez dituenak. Bi aldeetan
 * erregistro bera aurkitzen denean, `eguneratze_data` berriena irabazten da.
 *
 * `factory_resources`-ek ez dute identitate propiorik: fabrika bat "bere"
 * gisa antzematen denean (id+created_at bat), fabrika horren baliabide
 * multzo OSOA hartzen da irabazlearen aldetik (berriena den fabrika-
 * bertsioarena), ez bien batura — bestela ezin litzateke inoiz baliabide bat
 * ezabatu editatze batean, beti biek "gehitu" besterik ez luketelako egingo. */
function dokumentuakBatu(unekoaJatorrizkoa, inportatuaJatorrizkoa) {
  // `hurrengo_id` beti benetako id maximoen gainetik dagoela bermatu:
  // inportatutako fitxategi batek balio hori faltan edo zaharkituta izan
  // dezake, eta hori fidatuz gero id-talkak sor litezke.
  const unekoa = hurrengoIdNormalizatu(unekoaJatorrizkoa);
  const inportatua = hurrengoIdNormalizatu(inportatuaJatorrizkoa);
  const hId = {
    areas: Math.max(unekoa.hurrengo_id.areas, inportatua.hurrengo_id.areas),
    factories: Math.max(unekoa.hurrengo_id.factories, inportatua.hurrengo_id.factories),
    materials: Math.max(unekoa.hurrengo_id.materials, inportatua.hurrengo_id.materials),
    factory_resources: Math.max(unekoa.hurrengo_id.factory_resources, inportatua.hurrengo_id.factory_resources),
  };
  const idBerria = (taula) => hId[taula]++;
  const berriagoa = (a, b) => (a || '') > (b || ''); // a berriagoa da b baino

  // ---- Eremuak (id+created_at identitatea) ----
  const dok = { bertsioa: 1, hurrengo_id: hId, areas: [], factories: [], materials: [], factory_resources: [] };
  dok.areas = unekoa.areas.map((e) => ({ ...e }));
  const eremuMapa = new Map(); // inportatutako id -> azken id
  for (const inp of inportatua.areas) {
    const lok = unekoa.areas.find((e) => e.id === inp.id);
    if (lok && lok.created_at === inp.created_at) {
      eremuMapa.set(inp.id, inp.id);
      if (berriagoa(inp.eguneratze_data, lok.eguneratze_data)) {
        Object.assign(dok.areas.find((e) => e.id === inp.id), inp);
      }
    } else if (lok) {
      const berria = idBerria('areas');
      eremuMapa.set(inp.id, berria);
      dok.areas.push({ ...inp, id: berria });
    } else {
      eremuMapa.set(inp.id, inp.id);
      dok.areas.push({ ...inp });
    }
  }

  // ---- Fabrikak (id+created_at identitatea) ----
  dok.factories = unekoa.factories.map((f) => ({ ...f }));
  const fabrikaMapa = new Map();
  const fabrikaIrabazlea = new Map(); // azken fabrika-id -> 'lokala' | 'inportatua' (baliabideentzat)
  for (const inp0 of inportatua.factories) {
    const inp = { ...inp0, area_id: inp0.area_id == null ? null : (eremuMapa.get(inp0.area_id) ?? inp0.area_id) };
    const lok = unekoa.factories.find((f) => f.id === inp0.id);
    if (lok && lok.created_at === inp0.created_at) {
      fabrikaMapa.set(inp0.id, inp0.id);
      if (berriagoa(inp.eguneratze_data, lok.eguneratze_data)) {
        Object.assign(dok.factories.find((f) => f.id === inp0.id), inp);
        fabrikaIrabazlea.set(inp0.id, 'inportatua');
      } else {
        fabrikaIrabazlea.set(inp0.id, 'lokala');
      }
    } else if (lok) {
      const berria = idBerria('factories');
      fabrikaMapa.set(inp0.id, berria);
      dok.factories.push({ ...inp, id: berria });
    } else {
      fabrikaMapa.set(inp0.id, inp0.id);
      dok.factories.push({ ...inp });
    }
  }

  // ---- Materialak (izen-identitatea, COLLATE NOCASE bezala) ----
  dok.materials = unekoa.materials.map((m) => ({ ...m }));
  const materialMapa = new Map();
  for (const inp of inportatua.materials) {
    const lok = dok.materials.find((m) => nocase(m.name) === nocase(inp.name));
    if (lok) {
      materialMapa.set(inp.id, lok.id);
      if (berriagoa(inp.eguneratze_data, lok.eguneratze_data)) {
        Object.assign(lok, inp, { id: lok.id });
      }
    } else if (dok.materials.some((m) => m.id === inp.id)) {
      // Izenez ez dator bat, baina id-a lokalean erabilita dago: talka.
      const berria = idBerria('materials');
      materialMapa.set(inp.id, berria);
      dok.materials.push({ ...inp, id: berria });
    } else {
      materialMapa.set(inp.id, inp.id);
      dok.materials.push({ ...inp });
    }
  }

  // ---- Baliabideak: fabrika irabazlearen arabera, ez bien batura ----
  let frId = hId.factory_resources;
  for (const r of unekoa.factory_resources) {
    if (fabrikaIrabazlea.get(r.factory_id) === 'inportatua') continue; // inportatutakoak ordezkatuko du
    dok.factory_resources.push({ ...r, id: frId++ });
  }
  for (const r of inportatua.factory_resources) {
    const azkenFabrikaId = fabrikaMapa.get(r.factory_id);
    const azkenMaterialId = materialMapa.get(r.material_id);
    if (azkenFabrikaId == null || azkenMaterialId == null) continue; // erreferentzia hautsia
    if (fabrikaIrabazlea.get(azkenFabrikaId) === 'lokala') continue; // lokalak irabazi du fabrika honentzat
    dok.factory_resources.push({
      id: frId++,
      factory_id: azkenFabrikaId,
      material_id: azkenMaterialId,
      amount_per_min: r.amount_per_min,
      type: r.type,
    });
  }
  hId.factory_resources = frId;

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
  const bilduaBadago = unekoa.factories.length || unekoa.materials.length;

  const bateratu = confirm(
    'Fitxategiaren edukia:\n' +
    '  ' + dok.factories.length + ' fabrika, ' + dok.materials.length + ' material, ' +
    dok.areas.length + ' eremu\n' +
    '  Esportazio-data: ' + data + '\n\n' +
    'Oraingo datuak:\n' +
    '  ' + unekoa.factories.length + ' fabrika, ' + unekoa.materials.length + ' material, ' +
    unekoa.areas.length + ' eremu\n\n' +
    'BAT EGINGO DA: erregistro bakoitzeko berriena mantenduko da, ez da isilean ezer ezabatuko.\n' +
    'Aurretik uneko egoera automatikoki deskargatuko da.\n\n' +
    'OK: bat egin (gomendatua) — Utzi: beste aukera bat ikusi'
  );

  let emaitza;
  if (bateratu) {
    emaitza = dokumentuakBatu(unekoa, dok);
  } else {
    const ordezkatu = confirm(
      'Horren ordez, DATU GUZTIAK ORDEZKATU nahi dituzu erabat?\n\n' +
      'Oraingo datuak (' + unekoa.factories.length + ' fabrika...) betiko GALDUKO dira,\n' +
      'fitxategikoen (' + dok.factories.length + ' fabrika...) alde.\n' +
      'Aurretik uneko egoera automatikoki deskargatuko da.\n\nJarraitu ordezkapenarekin?'
    );
    if (!ordezkatu) return;
    emaitza = dok;
  }

  // Babes-kopia automatikoa: berreskuratzeak zerbitzarian egiten zuen bezala.
  if (bilduaBadago) {
    await datuakEsportatu(true);
  }

  dokumentuaGorde(emaitza);
  // Inportazioak berak "sinkronizatu" du gailu hau: aldaketa-kontagailua
  // garbitu, esportatu izan ez arren. `...Kargatu()` funtzioek beren kabuz
  // deitzen dute `aldaketakErrendatu()`.
  aldaketaKontagailuaBerrezarri();
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
