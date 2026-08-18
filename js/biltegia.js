/* Datuen biltegia eta domeinu-eragiketak.
 *
 * `app.py`-ren SQL kontsulten porte zuzena. Datu guztiak JSON dokumentu bakar
 * batean gordetzen dira localStorage-en. Datu-multzoa txikia da (~16 KB, 47
 * fabrika) eta aplikazioak dena memorian kargatzen zuen jada, beraz dokumentu
 * bakarra nahikoa da; IndexedDB-k konplexutasuna gehituko luke irabazirik gabe.
 *
 * INBARIANTEA: eragiketa batek ez du `await`-ik erabiltzen. JS hari bakarrekoa
 * denez eta `setItem` atomikoa denez, `kargatu → aldatu → gorde` sekuentzia
 * ezin da beste idazketa batekin tartekatu. Ez gehitu `await`-ik funtzio hauen
 * barruan: hori eginez gero, bi eragiketak dokumentu bera irakur lezakete eta
 * bata bestearen gainean idatzi.
 *
 * Taulak lauak dira (baliabideak ez daude fabriken barruan kabiatuta), SQL
 * jatorrizkoaren egitura bera izateko: `usage_count`, laburpena eta ezabaketen
 * kaskada 1:1 portatzen dira, eta array-aren ordenak SQLiteren rowid ordena
 * erreproduzitzen du (kontsultek ez zuten ORDER BY-rik baliabideentzat).
 */

const BILTEGI_KLABEA = 'satisfactory_datuak_v1';
const TAULAK = ['areas', 'factories', 'materials', 'factory_resources'];

function dokumentuHutsa() {
  return {
    bertsioa: 1,
    esportazio_data: null,
    hurrengo_id: { areas: 1, factories: 1, materials: 1, factory_resources: 1 },
    areas: [],
    factories: [],
    materials: [],
    factory_resources: [],
  };
}

function dokumentuaKargatu() {
  const gordeta = localStorage.getItem(BILTEGI_KLABEA);
  if (!gordeta) return dokumentuHutsa();
  try {
    const dok = JSON.parse(gordeta);
    // Egitura osatugabe batek ez du aplikazioa hondatu behar: falta dena bete.
    const oinarria = dokumentuHutsa();
    for (const taula of TAULAK) {
      if (!Array.isArray(dok[taula])) dok[taula] = [];
      oinarria.hurrengo_id[taula] = Math.max(
        dok.hurrengo_id && dok.hurrengo_id[taula] ? dok.hurrengo_id[taula] : 1,
        ...dok[taula].map((e) => (e.id || 0) + 1)
      );
    }
    dok.hurrengo_id = oinarria.hurrengo_id;
    return dok;
  } catch (e) {
    // Hondatutako JSON bat isilean ez ordezkatu: erabiltzaileak jakin behar du.
    throw new ApiErrorea(500, 'Gordetako datuak ezin dira irakurri (JSON hondatua)');
  }
}

function dokumentuaGorde(dok) {
  try {
    localStorage.setItem(BILTEGI_KLABEA, JSON.stringify(dok));
  } catch (e) {
    if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
      throw new ApiErrorea(507, 'Biltegia beteta dago; esportatu eta garbitu datuak');
    }
    throw e;
  }
}

function hurrengoId(dok, taula) {
  const id = dok.hurrengo_id[taula];
  dok.hurrengo_id[taula] = id + 1;
  return id;
}

/* SQLiteren CURRENT_TIMESTAMP formatua: 'YYYY-MM-DD HH:MM:SS' UTCn. */
function oraingoData() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

// ---------- Fabrikak ----------

function fabrikakZerrendatu() {
  const dok = dokumentuaKargatu();
  const eremuIzenak = new Map(dok.areas.map((e) => [e.id, e.name]));
  const materialakId = new Map(dok.materials.map((m) => [m.id, m]));

  const bihurtu = (r) => {
    const m = materialakId.get(r.material_id) || {};
    // Gakoen ordena SQLeko zutabeen ordena bera da: erantzunak alderatzeko
    // JSON.stringify erabiltzen dugu, eta hor ordenak axola du.
    return { name: m.name, unit: m.unit, category: m.category, amount_per_min: r.amount_per_min };
  };

  const emaitza = dok.factories.map((f) => {
    const area_name = f.area_id == null ? null : eremuIzenak.get(f.area_id) ?? null;
    const baliabideak = dok.factory_resources.filter((r) => r.factory_id === f.id);
    return {
      id: f.id,
      name: f.name,
      description: f.description,
      area_id: f.area_id,
      created_at: f.created_at,
      area_name,
      inputs: baliabideak.filter((r) => r.type === 'input').map(bihurtu),
      outputs: baliabideak.filter((r) => r.type === 'output').map(bihurtu),
    };
  });

  // ORDER BY a.name IS NULL, a.name, f.name — eremurik gabekoak azkenean.
  emaitza.sort((a, b) =>
    kmp(a.area_name === null ? 1 : 0, b.area_name === null ? 1 : 0) ||
    kmp(a.area_name ?? '', b.area_name ?? '') ||
    kmp(a.name, b.name)
  );
  return emaitza;
}

/* Fabrikaren baliabideak ordezkatzen ditu, material berriak sortuz behar bada.
 * `baliabideak` jada balioztatuta egon behar da. */
function baliabideakIdatzi(dok, fid, baliabideak) {
  dok.factory_resources = dok.factory_resources.filter((r) => r.factory_id !== fid);
  for (const res of baliabideak) {
    // Bilaketa maiuskulak/minuskulak bereizi gabe: "iron ore"-k lehendik
    // dagoen "Iron Ore" berrerabiltzen du, bikoiztu beharrean.
    let mat = dok.materials.find((m) => nocase(m.name) === nocase(res.material));
    if (!mat) {
      mat = {
        id: hurrengoId(dok, 'materials'),
        name: res.material,
        unit: 'un/min',
        category: 'solid',
        icon: 'box',
        color: null,
      };
      dok.materials.push(mat);
    }
    dok.factory_resources.push({
      id: hurrengoId(dok, 'factory_resources'),
      factory_id: fid,
      material_id: mat.id,
      amount_per_min: res.amount,
      type: res.type,
    });
  }
}

function eremuaBaliozkoa(dok, area_id) {
  if (area_id === null || area_id === undefined) return true;
  if (typeof area_id !== 'number' || !Number.isInteger(area_id)) {
    throw sarreraOkerra('Eremuaren identifikatzailea zenbaki oso bat izan behar da');
  }
  return dok.areas.some((e) => e.id === area_id);
}

function fabrikaSortu(datuak) {
  const izena = testuaBalioztatu(datuak.name, 'Izena', GEHIENEZ_IZENA);
  const deskribapena = testuaBalioztatu(datuak.description, 'Deskribapena', GEHIENEZ_DESKRIBAPENA, false);
  const baliabideak = baliabideakBalioztatu(datuak.resources);
  const dok = dokumentuaKargatu();

  const area_id = datuak.area_id ?? null;
  if (!eremuaBaliozkoa(dok, area_id)) throw new ApiErrorea(400, 'Eremua ez da aurkitu');
  if (dok.factories.some((f) => nocase(f.name) === nocase(izena))) {
    throw new ApiErrorea(409, '"' + izena + '" fabrika badago jada');
  }

  const fid = hurrengoId(dok, 'factories');
  dok.factories.push({
    id: fid,
    name: izena,
    description: deskribapena,
    area_id,
    created_at: oraingoData(),
  });
  baliabideakIdatzi(dok, fid, baliabideak);
  dokumentuaGorde(dok);
  return { id: fid };
}

function fabrikaEguneratu(fid, datuak) {
  const izena = testuaBalioztatu(datuak.name, 'Izena', GEHIENEZ_IZENA);
  const deskribapena = testuaBalioztatu(datuak.description, 'Deskribapena', GEHIENEZ_DESKRIBAPENA, false);
  const baliabideak = baliabideakBalioztatu(datuak.resources);
  const dok = dokumentuaKargatu();

  const fabrika = dok.factories.find((f) => f.id === fid);
  if (!fabrika) throw new ApiErrorea(404, 'Fabrika ez da aurkitu');

  const area_id = datuak.area_id ?? null;
  if (!eremuaBaliozkoa(dok, area_id)) throw new ApiErrorea(400, 'Eremua ez da aurkitu');
  if (dok.factories.some((f) => f.id !== fid && nocase(f.name) === nocase(izena))) {
    throw new ApiErrorea(409, '"' + izena + '" fabrika badago jada');
  }

  fabrika.name = izena;
  fabrika.description = deskribapena;
  fabrika.area_id = area_id;
  baliabideakIdatzi(dok, fid, baliabideak);
  dokumentuaGorde(dok);
  return { ok: true };
}

function fabrikaEzabatu(fid) {
  const dok = dokumentuaKargatu();
  const hasieran = dok.factories.length;
  dok.factories = dok.factories.filter((f) => f.id !== fid);
  if (dok.factories.length === hasieran) throw new ApiErrorea(404, 'Fabrika ez da aurkitu');
  // ON DELETE CASCADE: baliabideak fabrikarekin batera joaten dira.
  dok.factory_resources = dok.factory_resources.filter((r) => r.factory_id !== fid);
  dokumentuaGorde(dok);
  return { ok: true };
}

// ---------- Materialak ----------

function materialErabilerak(dok, mid) {
  const fabrikak = new Set(
    dok.factory_resources.filter((r) => r.material_id === mid).map((r) => r.factory_id)
  );
  return fabrikak.size; // COUNT(DISTINCT factory_id)
}

function materialakZerrendatu() {
  const dok = dokumentuaKargatu();
  const emaitza = dok.materials.map((m) => ({
    id: m.id,
    name: m.name,
    unit: m.unit,
    category: m.category,
    icon: m.icon,
    color: m.color,
    usage_count: materialErabilerak(dok, m.id),
  }));
  emaitza.sort((a, b) => kmp(a.name, b.name));
  return emaitza;
}

function materialaEguneratu(mid, datuak) {
  const kolorea = datuak.color ?? null;
  if (kolorea !== null && !(typeof kolorea === 'string' && KOLORE_RE.test(kolorea))) {
    throw new ApiErrorea(400, 'Kolorea ez da baliozko #RRGGBB balio bat');
  }
  const dok = dokumentuaKargatu();
  const materiala = dok.materials.find((m) => m.id === mid);
  if (!materiala) throw new ApiErrorea(404, 'Materiala ez da aurkitu');
  materiala.color = kolorea;
  dokumentuaGorde(dok);
  return { ok: true };
}

function materialaEzabatu(mid) {
  const dok = dokumentuaKargatu();
  const materiala = dok.materials.find((m) => m.id === mid);
  if (!materiala) throw new ApiErrorea(404, 'Materiala ez da aurkitu');
  const erabilerak = materialErabilerak(dok, mid);
  if (erabilerak) {
    throw new ApiErrorea(
      409,
      '"' + materiala.name + '" ' + erabilerak + ' fabrikatan erabiltzen da; ezin da ezabatu',
      { usage_count: erabilerak }
    );
  }
  dok.materials = dok.materials.filter((m) => m.id !== mid);
  dokumentuaGorde(dok);
  return { ok: true };
}

// ---------- Eremuak ----------

function eremuakZerrendatu() {
  const dok = dokumentuaKargatu();
  const emaitza = dok.areas.map((e) => ({
    id: e.id,
    name: e.name,
    created_at: e.created_at,
    factory_count: dok.factories.filter((f) => f.area_id === e.id).length,
  }));
  emaitza.sort((a, b) => kmp(a.name, b.name));
  return emaitza;
}

function eremuaSortu(datuak) {
  const izena = testuaBalioztatu(datuak.name, 'Izena', GEHIENEZ_IZENA);
  const dok = dokumentuaKargatu();
  // UNIQUE murrizketa maiuskulak/minuskulak BEREIZIZ (fabrikak ez bezala):
  // jatorrizko eskemak horrela zuen, eta portea fidela izan behar da.
  if (dok.areas.some((e) => e.name === izena)) {
    throw new ApiErrorea(409, '"' + izena + '" eremua badago jada');
  }
  const id = hurrengoId(dok, 'areas');
  dok.areas.push({ id, name: izena, created_at: oraingoData() });
  dokumentuaGorde(dok);
  return { id, name: izena };
}

function eremuaEguneratu(aid, datuak) {
  const izena = testuaBalioztatu(datuak.name, 'Izena', GEHIENEZ_IZENA);
  const dok = dokumentuaKargatu();
  if (dok.areas.some((e) => e.id !== aid && e.name === izena)) {
    throw new ApiErrorea(409, '"' + izena + '" eremua badago jada');
  }
  const eremua = dok.areas.find((e) => e.id === aid);
  if (!eremua) throw new ApiErrorea(404, 'Eremua ez da aurkitu');
  eremua.name = izena;
  dokumentuaGorde(dok);
  return { ok: true };
}

function eremuaEzabatu(aid) {
  const dok = dokumentuaKargatu();
  const hasieran = dok.areas.length;
  dok.areas = dok.areas.filter((e) => e.id !== aid);
  if (dok.areas.length === hasieran) throw new ApiErrorea(404, 'Eremua ez da aurkitu');
  // ON DELETE SET NULL: fabrikak ez dira ezabatzen, eremurik gabe geratzen dira.
  for (const f of dok.factories) {
    if (f.area_id === aid) f.area_id = null;
  }
  dokumentuaGorde(dok);
  return { ok: true };
}

// ---------- Laburpena ----------

function laburpena() {
  const dok = dokumentuaKargatu();
  const emaitza = [];
  for (const m of dok.materials) {
    const lerroak = dok.factory_resources.filter((r) => r.material_id === m.id);
    const total_input = lerroak
      .filter((r) => r.type === 'input')
      .reduce((a, r) => a + r.amount_per_min, 0);
    const total_output = lerroak
      .filter((r) => r.type === 'output')
      .reduce((a, r) => a + r.amount_per_min, 0);
    // HAVING total_input>0 OR total_output>0
    if (total_input > 0 || total_output > 0) {
      emaitza.push({ name: m.name, unit: m.unit, total_input, total_output });
    }
  }
  emaitza.sort((a, b) => kmp(b.total_output, a.total_output)); // ORDER BY total_output DESC
  return emaitza;
}
