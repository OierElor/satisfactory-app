/* Proba funtzionalak.
 *
 * `test_segurtasuna.py` eta `test_funtzionala.py` fitxategien ordezkoa. Zerbitzaria
 * kentzean, hango probetatik erdiak zentzurik gabe geratu dira (CSP goiburuak,
 * path traversal, SQLiteren integrity check): ez dago zerbitzaririk erasotzeko.
 * Hemen daudenak logika propioa egiaztatzen dutenak dira.
 *
 * Bi lekutan exekutatzen da:
 *   probak.html nabigatzailean irekita
 *   deno run --allow-read tresnak/probak-deno.js
 */

const PROBAK = [];
function proba(izena, funtzioa) {
  PROBAK.push({ izena, funtzioa });
}

function berdinak(lortua, espero, oharra) {
  const a = JSON.stringify(lortua);
  const b = JSON.stringify(espero);
  if (a !== b) {
    throw new Error((oharra ? oharra + ': ' : '') + 'lortua ' + a + ', espero zen ' + b);
  }
}

/* Eragiketa batek zehazki egoera eta mezu hau ematen duela egiaztatzen du. */
async function egoera(bidea, aukerak, esperoEgoera, esperoMezua) {
  const r = await eskaera(bidea, aukerak);
  const gorputza = await r.json();
  if (r.status !== esperoEgoera) {
    throw new Error('egoera ' + r.status + ', espero zen ' + esperoEgoera +
      ' (' + JSON.stringify(gorputza) + ')');
  }
  if (esperoMezua !== undefined && gorputza.error !== esperoMezua) {
    throw new Error('mezua "' + gorputza.error + '", espero zen "' + esperoMezua + '"');
  }
  return gorputza;
}

const json = (o) => ({ method: 'POST', body: JSON.stringify(o) });
const putJson = (o) => ({ method: 'PUT', body: JSON.stringify(o) });

function garbitu() {
  localStorage.removeItem(BILTEGI_KLABEA);
  localStorage.removeItem(ALDAKETA_KONTAGAILUA_KLABEA);
}

// ---------- Balioztatzea ----------

proba('izenik gabe 400 ematen du', async () => {
  garbitu();
  await egoera('/api/factories', json({ name: '', resources: [] }), 400, 'Izena nahitaezkoa da');
  await egoera('/api/factories', json({ resources: [] }), 400, 'Izena nahitaezkoa da');
});

proba('izen luzeegia 400 ematen du', async () => {
  garbitu();
  await egoera('/api/factories', json({ name: 'x'.repeat(201), resources: [] }), 400,
    'Izena luzeegia da (gehienez 200 karaktere)');
});

proba('izena testua izan behar da', async () => {
  garbitu();
  await egoera('/api/factories', json({ name: 123, resources: [] }), 400, 'Izena testu bat izan behar da');
});

proba('kopuru okerrak baztertzen dira', async () => {
  garbitu();
  const kasuak = [
    ['5', 'Kopurua zenbaki bat izan behar da'],
    [true, 'Kopurua zenbaki bat izan behar da'],
    [0, 'Kopurua 0 eta 1000000 artean egon behar da'],
    [-5, 'Kopurua 0 eta 1000000 artean egon behar da'],
    [1e12, 'Kopurua 0 eta 1000000 artean egon behar da'],
  ];
  for (const [kop, mezua] of kasuak) {
    await egoera('/api/factories',
      json({ name: 'P', resources: [{ material: 'M', amount: kop, type: 'output' }] }), 400, mezua);
  }
});

proba('baliabide mota okerra baztertzen da', async () => {
  garbitu();
  await egoera('/api/factories',
    json({ name: 'P', resources: [{ material: 'M', amount: 5, type: 'DROP TABLE' }] }), 400,
    'Baliabidearen mota "input" edo "output" izan behar da');
});

proba('baliabide gehiegi baztertzen dira', async () => {
  garbitu();
  const gehiegi = Array.from({ length: 201 }, (_, i) => ({ material: 'M' + i, amount: 1, type: 'output' }));
  await egoera('/api/factories', json({ name: 'P', resources: gehiegi }), 400,
    'Baliabide gehiegi (gehienez 200)');
});

proba('kolore okerra baztertzen da', async () => {
  garbitu();
  await eskaera('/api/factories', json({ name: 'P', resources: [{ material: 'M', amount: 5, type: 'output' }] }));
  const mat = (await (await eskaera('/api/materials')).json())[0];
  for (const kolorea of ['gorria', '#GGGGGG', '#FFF', 123, '<script>']) {
    await egoera('/api/materials/' + mat.id, putJson({ color: kolorea }), 400,
      'Kolorea ez da baliozko #RRGGBB balio bat');
  }
  // null-ek kolorea kentzen du, ez da errorea.
  await egoera('/api/materials/' + mat.id, putJson({ color: null }), 200);
});

// ---------- Domeinu-logika ----------

proba('fabrika-izen bikoiztua 409, letra larriak alde batera', async () => {
  garbitu();
  await egoera('/api/factories', json({ name: 'Galdategia', resources: [] }), 201);
  await egoera('/api/factories', json({ name: 'galdategia', resources: [] }), 409,
    '"galdategia" fabrika badago jada');
});

proba('fabrika bere izenarekin eguneratzeak ez du 409 ematen', async () => {
  garbitu();
  const { id } = await egoera('/api/factories', json({ name: 'A', resources: [] }), 201);
  await egoera('/api/factories/' + id, putJson({ name: 'A', description: 'berria', resources: [] }), 200);
});

proba('material-izenak letra larriak alde batera parekatzen dira', async () => {
  garbitu();
  await eskaera('/api/factories', json({ name: 'F1', resources: [{ material: 'Iron Ore', amount: 10, type: 'output' }] }));
  await eskaera('/api/factories', json({ name: 'F2', resources: [{ material: 'iron ore', amount: 5, type: 'input' }] }));
  const materialak = await (await eskaera('/api/materials')).json();
  berdinak(materialak.length, 1, 'material bakarra egon behar da');
  berdinak(materialak[0].name, 'Iron Ore', 'lehen izena mantendu behar da');
});

proba('eremua ezabatzeak fabrikak ez ditu ezabatzen', async () => {
  garbitu();
  const eremua = await egoera('/api/areas', json({ name: 'Ekialdea' }), 201);
  const { id } = await egoera('/api/factories', json({ name: 'F', resources: [], area_id: eremua.id }), 201);
  await egoera('/api/areas/' + eremua.id, { method: 'DELETE' }, 200);
  const fabrikak = await (await eskaera('/api/factories')).json();
  berdinak(fabrikak.length, 1);
  berdinak(fabrikak[0].id, id);
  berdinak(fabrikak[0].area_id, null, 'eremurik gabe geratu behar da');
});

proba('fabrika ezabatzeak bere baliabideak eramaten ditu', async () => {
  garbitu();
  const { id } = await egoera('/api/factories',
    json({ name: 'F', resources: [{ material: 'M', amount: 10, type: 'output' }] }), 201);
  await egoera('/api/factories/' + id, { method: 'DELETE' }, 200);
  berdinak((await (await eskaera('/api/summary')).json()).length, 0, 'laburpena hutsik egon behar da');
  // Materiala geratzen da, baina erabili gabe: orain ezabatu daiteke.
  const mat = (await (await eskaera('/api/materials')).json())[0];
  berdinak(mat.usage_count, 0);
  await egoera('/api/materials/' + mat.id, { method: 'DELETE' }, 200);
});

proba('erabiltzen den materiala ezin da ezabatu', async () => {
  garbitu();
  await eskaera('/api/factories', json({ name: 'F', resources: [{ material: 'Coal', amount: 10, type: 'input' }] }));
  const mat = (await (await eskaera('/api/materials')).json())[0];
  const gorputza = await egoera('/api/materials/' + mat.id, { method: 'DELETE' }, 409,
    '"Coal" 1 fabrikatan erabiltzen da; ezin da ezabatu');
  berdinak(gorputza.usage_count, 1);
});

proba('laburpenak kontsumoa eta ekoizpena batzen ditu', async () => {
  garbitu();
  await eskaera('/api/factories', json({ name: 'Meategia', resources: [{ material: 'Iron Ore', amount: 60, type: 'output' }] }));
  await eskaera('/api/factories', json({ name: 'Galdategia', resources: [
    { material: 'Iron Ore', amount: 30, type: 'input' },
    { material: 'Iron Ore', amount: 15, type: 'input' },
    { material: 'Iron Ingot', amount: 30, type: 'output' },
  ] }));
  const laburpena = Object.fromEntries((await (await eskaera('/api/summary')).json()).map((m) => [m.name, m]));
  berdinak(laburpena['Iron Ore'].total_output, 60);
  berdinak(laburpena['Iron Ore'].total_input, 45);
  berdinak(laburpena['Iron Ingot'].total_input, 0);
});

proba('fabrikak eremuz eta izenez ordenatzen dira, eremurik gabekoak azkenean', async () => {
  garbitu();
  const b = await egoera('/api/areas', json({ name: 'B eremua' }), 201);
  const a = await egoera('/api/areas', json({ name: 'A eremua' }), 201);
  await eskaera('/api/factories', json({ name: 'Eremurik gabea', resources: [] }));
  await eskaera('/api/factories', json({ name: 'Zeta', resources: [], area_id: a.id }));
  await eskaera('/api/factories', json({ name: 'Alfa', resources: [], area_id: a.id }));
  await eskaera('/api/factories', json({ name: 'Beta', resources: [], area_id: b.id }));
  const izenak = (await (await eskaera('/api/factories')).json()).map((f) => f.name);
  berdinak(izenak, ['Alfa', 'Zeta', 'Beta', 'Eremurik gabea']);
});

proba('idak ez dira berrerabiltzen', async () => {
  garbitu();
  const lehena = await egoera('/api/factories', json({ name: 'Lehena', resources: [] }), 201);
  await egoera('/api/factories/' + lehena.id, { method: 'DELETE' }, 200);
  const bigarrena = await egoera('/api/factories', json({ name: 'Bigarrena', resources: [] }), 201);
  if (bigarrena.id === lehena.id) throw new Error('id berrerabili da: ' + bigarrena.id);
});

proba('bide ezezagunak 404 ematen du', async () => {
  garbitu();
  await egoera('/api/ezezaguna', { method: 'GET' }, 404);
  await egoera('/api/factories/999999', putJson({ name: 'X', resources: [] }), 404, 'Fabrika ez da aurkitu');
  await egoera('/api/materials/999999', { method: 'DELETE' }, 404, 'Materiala ez da aurkitu');
  await egoera('/api/areas/999999', { method: 'DELETE' }, 404, 'Eremua ez da aurkitu');
});

// ---------- Inportazioaren balioztatzea (konfiantza-muga) ----------

proba('inportazioak egitura okerra baztertzen du', () => {
  const okerrak = [
    [null, 'Fitxategiak ez du datu-egitura egokia'],
    [[], 'Fitxategiak ez du datu-egitura egokia'],
    [{ bertsioa: 99 }, 'Bertsio ezezaguna: 99 (1 espero zen)'],
    [{ bertsioa: 1 }, '"areas" zerrenda falta da edo okerra da'],
  ];
  for (const [dok, mezua] of okerrak) {
    let jaurti = null;
    try { dokumentuaBalioztatu(dok); } catch (e) { jaurti = e.message; }
    berdinak(jaurti, mezua);
  }
});

proba('inportazioak erreferentzia hautsiak baztertzen ditu', () => {
  const oinarria = () => ({
    bertsioa: 1, areas: [], factories: [], materials: [], factory_resources: [],
  });

  // Existitzen ez den eremua aipatzen duen fabrika.
  let dok = oinarria();
  dok.factories.push({ id: 1, name: 'F', description: '', area_id: 7 });
  let jaurti = null;
  try { dokumentuaBalioztatu(dok); } catch (e) { jaurti = e.message; }
  berdinak(jaurti, '"F" fabrikak existitzen ez den eremu bat du');

  // Existitzen ez den fabrika aipatzen duen baliabidea.
  dok = oinarria();
  dok.factory_resources.push({ id: 1, factory_id: 9, material_id: 1, amount_per_min: 5, type: 'input' });
  jaurti = null;
  try { dokumentuaBalioztatu(dok); } catch (e) { jaurti = e.message; }
  berdinak(jaurti, 'Baliabide batek existitzen ez den fabrika bat aipatzen du');
});

proba('inportazioak kopuru kutsatuak baztertzen ditu', () => {
  const dok = {
    bertsioa: 1, areas: [], materials: [{ id: 1, name: 'M', color: null }],
    factories: [{ id: 1, name: 'F', description: '', area_id: null }],
    factory_resources: [{ id: 1, factory_id: 1, material_id: 1, amount_per_min: '<script>alert(1)</script>', type: 'input' }],
  };
  let jaurti = null;
  try { dokumentuaBalioztatu(dok); } catch (e) { jaurti = e.message; }
  berdinak(jaurti, 'Kopurua zenbaki bat izan behar da');
});

proba('inportazioak kolore kutsatuak baztertzen ditu', () => {
  const dok = {
    bertsioa: 1, areas: [], factories: [], factory_resources: [],
    materials: [{ id: 1, name: 'M', color: 'red"></div><img src=x onerror=alert(1)>' }],
  };
  let jaurti = null;
  try { dokumentuaBalioztatu(dok); } catch (e) { jaurti = e.message; }
  berdinak(jaurti, '"M" materialaren kolorea ez da baliozkoa');
});

proba('esportatu-inportatu itzuliak datuak mantentzen ditu', () => {
  garbitu();
  const dok = dokumentuaKargatu();
  dok.areas.push({ id: 1, name: 'Eremua', created_at: '2026-01-01 00:00:00' });
  dok.factories.push({ id: 1, name: 'F', description: 'd', area_id: 1, created_at: '2026-01-01 00:00:00' });
  dok.materials.push({ id: 1, name: 'M', unit: 'un/min', category: 'solid', icon: 'box', color: '#E8A838' });
  dok.factory_resources.push({ id: 1, factory_id: 1, material_id: 1, amount_per_min: 12.5, type: 'output' });
  dokumentuaGorde(dok);

  const esportatua = JSON.parse(JSON.stringify(dokumentuaKargatu()));
  garbitu();
  dokumentuaGorde(dokumentuaBalioztatu(esportatua));

  const berreskuratua = dokumentuaKargatu();
  for (const taula of TAULAK) {
    berdinak(berreskuratua[taula], esportatua[taula], taula);
  }
});

// ---------- Bat-egitea (dokumentuakBatu) ----------

function dokBatuHutsa() {
  return { bertsioa: 1, hurrengo_id: { areas: 1, factories: 1, materials: 1, factory_resources: 1 },
           areas: [], factories: [], materials: [], factory_resources: [] };
}

proba('erregistro bera: eguneratze_data berriena irabazten da', () => {
  const unekoa = dokBatuHutsa();
  unekoa.factories.push({ id: 1, name: 'Zaharra', description: '', area_id: null,
    created_at: '2026-01-01 00:00:00', eguneratze_data: '2026-01-01 00:00:00' });
  unekoa.hurrengo_id.factories = 2;

  const inportatua = dokBatuHutsa();
  inportatua.factories.push({ id: 1, name: 'Berria', description: '', area_id: null,
    created_at: '2026-01-01 00:00:00', eguneratze_data: '2026-01-02 00:00:00' });
  inportatua.hurrengo_id.factories = 2;

  const emaitza = dokumentuakBatu(unekoa, inportatua);
  berdinak(emaitza.factories.length, 1);
  berdinak(emaitza.factories[0].name, 'Berria');
  berdinak(emaitza.factories[0].id, 1);
});

proba('erregistro bera: lokala berriagoa bada, lokalak irabazten du', () => {
  const unekoa = dokBatuHutsa();
  unekoa.factories.push({ id: 1, name: 'Lokal-berria', description: '', area_id: null,
    created_at: '2026-01-01 00:00:00', eguneratze_data: '2026-01-05 00:00:00' });
  unekoa.hurrengo_id.factories = 2;

  const inportatua = dokBatuHutsa();
  inportatua.factories.push({ id: 1, name: 'Inportatu-zaharra', description: '', area_id: null,
    created_at: '2026-01-01 00:00:00', eguneratze_data: '2026-01-02 00:00:00' });
  inportatua.hurrengo_id.factories = 2;

  const emaitza = dokumentuakBatu(unekoa, inportatua);
  berdinak(emaitza.factories.length, 1);
  berdinak(emaitza.factories[0].name, 'Lokal-berria');
});

proba('id bera baina created_at desberdina: talka, biak mantentzen dira', () => {
  const unekoa = dokBatuHutsa();
  unekoa.factories.push({ id: 1, name: 'LokalFabrika', description: '', area_id: null,
    created_at: '2026-01-01 00:00:00', eguneratze_data: '2026-01-01 00:00:00' });
  unekoa.hurrengo_id.factories = 2;

  const inportatua = dokBatuHutsa();
  inportatua.factories.push({ id: 1, name: 'InportatuFabrika', description: '', area_id: null,
    created_at: '2026-02-01 00:00:00', eguneratze_data: '2026-02-01 00:00:00' });
  inportatua.hurrengo_id.factories = 2;

  const emaitza = dokumentuakBatu(unekoa, inportatua);
  berdinak(emaitza.factories.length, 2, 'bi fabrika desberdin izan behar dira');
  const izenak = emaitza.factories.map(f => f.name).sort();
  berdinak(izenak, ['InportatuFabrika', 'LokalFabrika']);
  // Berrizendatutako fabrikak id librea izan behar du, lokalarekin talkarik gabe.
  const berrizendatua = emaitza.factories.find(f => f.name === 'InportatuFabrika');
  berdinak(berrizendatua.id !== 1, true);
  berdinak(emaitza.hurrengo_id.factories > berrizendatua.id, true);
});

proba('lokalean bakarrik edo inportatuan bakarrik dagoen erregistroa mantentzen da', () => {
  const unekoa = dokBatuHutsa();
  unekoa.factories.push({ id: 1, name: 'Lokala', description: '', area_id: null,
    created_at: '2026-01-01 00:00:00', eguneratze_data: '2026-01-01 00:00:00' });
  unekoa.hurrengo_id.factories = 2;

  const inportatua = dokBatuHutsa();
  inportatua.factories.push({ id: 7, name: 'Inportatu-berria', description: '', area_id: null,
    created_at: '2026-03-01 00:00:00', eguneratze_data: '2026-03-01 00:00:00' });
  inportatua.hurrengo_id.factories = 8;

  const emaitza = dokumentuakBatu(unekoa, inportatua);
  berdinak(emaitza.factories.length, 2);
  const izenak = emaitza.factories.map(f => f.name).sort();
  berdinak(izenak, ['Inportatu-berria', 'Lokala']);
});

proba('materialak izenez batzen dira, id-ez ez, letra larriak alde batera', () => {
  const unekoa = dokBatuHutsa();
  unekoa.materials.push({ id: 1, name: 'Coal', unit: 'un/min', category: 'solid', icon: 'box', color: null,
    eguneratze_data: '2026-01-01 00:00:00' });
  unekoa.hurrengo_id.materials = 2;

  const inportatua = dokBatuHutsa();
  inportatua.materials.push({ id: 99, name: 'coal', unit: 'un/min', category: 'solid', icon: 'box', color: '#E8A838',
    eguneratze_data: '2026-01-02 00:00:00' });
  inportatua.hurrengo_id.materials = 100;
  inportatua.factories.push({ id: 5, name: 'F-inportatua', description: '', area_id: null,
    created_at: '2026-01-01 00:00:00', eguneratze_data: '2026-01-01 00:00:00' });
  inportatua.hurrengo_id.factories = 6;
  inportatua.factory_resources.push({ id: 1, factory_id: 5, material_id: 99, amount_per_min: 10, type: 'input' });
  inportatua.hurrengo_id.factory_resources = 2;

  const emaitza = dokumentuakBatu(unekoa, inportatua);
  berdinak(emaitza.materials.length, 1, 'material bakarra, izen bera dutelako');
  berdinak(emaitza.materials[0].id, 1, 'lokalaren id-a mantendu behar da');
  berdinak(emaitza.materials[0].color, '#E8A838', 'inportatutakoa berriagoa zen, kolorea eguneratu behar da');
  // Baliabideak lokalaren material-id-ra birmapatuta egon behar dira.
  berdinak(emaitza.factory_resources.length, 1);
  berdinak(emaitza.factory_resources[0].material_id, 1);
});

proba('fabrika baten baliabideak irabazlearenak dira, ez bien batura', () => {
  const unekoa = dokBatuHutsa();
  unekoa.factories.push({ id: 1, name: 'F', description: '', area_id: null,
    created_at: '2026-01-01 00:00:00', eguneratze_data: '2026-01-01 00:00:00' });
  unekoa.hurrengo_id.factories = 2;
  unekoa.materials.push({ id: 1, name: 'Iron Ore', unit: 'un/min', category: 'solid', icon: 'box', color: null,
    eguneratze_data: '2026-01-01 00:00:00' });
  unekoa.hurrengo_id.materials = 2;
  unekoa.factory_resources.push({ id: 1, factory_id: 1, material_id: 1, amount_per_min: 10, type: 'input' });
  unekoa.hurrengo_id.factory_resources = 2;

  const inportatua = dokBatuHutsa();
  inportatua.factories.push({ id: 1, name: 'F', description: '', area_id: null,
    created_at: '2026-01-01 00:00:00', eguneratze_data: '2026-01-02 00:00:00' }); // berriagoa
  inportatua.hurrengo_id.factories = 2;
  inportatua.materials.push({ id: 1, name: 'Copper Ore', unit: 'un/min', category: 'solid', icon: 'box', color: null,
    eguneratze_data: '2026-01-01 00:00:00' });
  inportatua.hurrengo_id.materials = 2;
  inportatua.factory_resources.push({ id: 1, factory_id: 1, material_id: 1, amount_per_min: 20, type: 'input' });
  inportatua.hurrengo_id.factory_resources = 2;

  const emaitza = dokumentuakBatu(unekoa, inportatua);
  berdinak(emaitza.factory_resources.length, 1, 'ez da bi baliabideen batura izan behar');
  berdinak(emaitza.factory_resources[0].amount_per_min, 20, 'inportatutako (berriagoaren) baliabidea izan behar du');
  const materialak = emaitza.materials.map(m => m.name).sort();
  berdinak(materialak, ['Copper Ore', 'Iron Ore'], 'bi materialak existitzen jarraitu behar dute, erabiltzen ez den arren');
});

proba('bat-egite ondoren hurrengo_id-ak ez du talkarik sortzen', () => {
  const unekoa = dokBatuHutsa();
  unekoa.factories.push({ id: 1, name: 'A', description: '', area_id: null,
    created_at: '2026-01-01 00:00:00', eguneratze_data: '2026-01-01 00:00:00' });
  unekoa.hurrengo_id.factories = 2;

  const inportatua = dokBatuHutsa();
  inportatua.factories.push({ id: 1, name: 'B', description: '', area_id: null,
    created_at: '2026-02-01 00:00:00', eguneratze_data: '2026-02-01 00:00:00' }); // talka
  inportatua.hurrengo_id.factories = 2;

  const emaitza = dokumentuakBatu(unekoa, inportatua);
  const idMax = Math.max(...emaitza.factories.map(f => f.id));
  berdinak(emaitza.hurrengo_id.factories > idMax, true);
});

// ---------- Aldaketa-kontagailua ----------

proba('mutazio arrakastatsuek kontagailua handitzen dute, irakurketek ez', async () => {
  garbitu();
  berdinak(aldaketaKontagailua(), 0);
  await eskaera('/api/factories', json({ name: 'F', resources: [] }));
  berdinak(aldaketaKontagailua(), 1);
  await eskaera('/api/factories'); // GET, ez du handitu behar
  berdinak(aldaketaKontagailua(), 1);
});

proba('400/404/409 erroreek ez dute kontagailua handitzen', async () => {
  garbitu();
  await eskaera('/api/factories', json({ name: '', resources: [] })); // 400
  await eskaera('/api/factories/999999', putJson({ name: 'X', resources: [] })); // 404
  berdinak(aldaketaKontagailua(), 0);
});

proba('kontagailua berrezartzeak zero balioa itzultzen du', async () => {
  garbitu();
  await eskaera('/api/factories', json({ name: 'F', resources: [] }));
  berdinak(aldaketaKontagailua(), 1);
  aldaketaKontagailuaBerrezarri();
  berdinak(aldaketaKontagailua(), 0);
});

// ---------- HTML ihes-egitea ----------

proba('esk()-ek HTML karaktereak ihes egiten ditu', () => {
  // `esk` interfazearen fitxategian dago; probak.html-ek kargatzen du.
  if (typeof esk !== 'function') return; // Deno-n ez dago interfazerik.
  berdinak(esk('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  berdinak(esk('" autofocus x="'), '&quot; autofocus x=&quot;');
  berdinak(esk("'"), '&#39;');
  berdinak(esk(null), '');
});

/* Probak exekutatu eta emaitzak itzuli. */
async function probakExekutatu(jakinarazi) {
  let ondo = 0;
  const akatsak = [];
  for (const { izena, funtzioa } of PROBAK) {
    try {
      await funtzioa();
      ondo++;
      jakinarazi(true, izena, null);
    } catch (e) {
      akatsak.push({ izena, mezua: e.message });
      jakinarazi(false, izena, e.message);
    }
  }
  garbitu();
  return { ondo, akatsak, guztira: PROBAK.length };
}
