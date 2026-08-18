from flask import Flask, jsonify, request, send_from_directory, send_file
import sqlite3, os, re, math
from collections import Counter
from datetime import datetime

# Aplikazioa localhost-erako tresna bat da, autentifikaziorik gabe. Horregatik
# EZ da CORS gaitzen: hori gabe, nabigatzaileak beste jatorri batetik datozen
# eskaerak blokeatzen ditu, eta bisitatzen duzun edozein webgunek ezin ditu
# zure datuak irakurri edo ezabatu. Frontendak jatorri bera erabiltzen du.
app = Flask(__name__, static_folder='static')
app.config['MAX_CONTENT_LENGTH'] = 64 * 1024 * 1024

OINARRIA = os.path.dirname(os.path.abspath(__file__))
DB = os.environ.get('SATISFACTORY_DB') or os.path.join(OINARRIA, 'factories.db')
BACKUP_DIR = os.environ.get('SATISFACTORY_BACKUPS') or os.path.join(OINARRIA, 'backups')
BACKUP_RE = re.compile(r'\Akopia-\d{8}-\d{6}(-(auto|igoera))?(-\d+)?\.db\Z')
BEHARREZKO_TAULAK = {'factories', 'materials', 'factory_resources'}
GEHIENEZ_KOPIAK = 50

KOLORE_RE = re.compile(r'\A#[0-9A-Fa-f]{6}\Z')

# Sarreren mugak. Zerbitzaria da agintaria: frontendak ere egiaztatzen du,
# baina APIa zuzenean deitu daiteke.
GEHIENEZ_IZENA = 200
GEHIENEZ_DESKRIBAPENA = 1000
GEHIENEZ_BALIABIDEAK = 200
GEHIENEZ_KOPURUA = 1_000_000

SEGURTASUN_GOIBURUAK = {
    # script-src-ek 'unsafe-inline' behar du: frontendak inline onclick-ak
    # erabiltzen ditu. Beraz CSPk ez du XSS exekuzioa blokeatzen — escape-a da
    # horretarako defentsa. CSPk datuak kanpora ateratzea eragozten du
    # (connect-src/img-src 'self') eta iframe/base trikimailuak.
    'Content-Security-Policy': (
        "default-src 'self'; "
        "script-src 'self' https://cdnjs.cloudflare.com 'unsafe-inline'; "
        "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; "
        "font-src https://fonts.gstatic.com; "
        "img-src 'self' data:; "
        "connect-src 'self'; "
        "object-src 'none'; "
        "base-uri 'none'; "
        "frame-ancestors 'none'; "
        "form-action 'none'"
    ),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
}

@app.after_request
def segurtasun_goiburuak_gehitu(erantzuna):
    for izena, balioa in SEGURTASUN_GOIBURUAK.items():
        erantzuna.headers.setdefault(izena, balioa)
    return erantzuna

def get_db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

# ---------- Sarreren balioztatzea ----------

class SarreraOkerra(Exception):
    """Bezeroaren datuak baliogabeak dira; 400 batekin erantzuten da."""

def testua_balioztatu(balioa, eremua, gehienez, nahitaezkoa=True):
    if balioa is None:
        balioa = ''
    if not isinstance(balioa, str):
        raise SarreraOkerra('%s testu bat izan behar da' % eremua)
    balioa = balioa.strip()
    if nahitaezkoa and not balioa:
        raise SarreraOkerra('%s nahitaezkoa da' % eremua)
    if len(balioa) > gehienez:
        raise SarreraOkerra('%s luzeegia da (gehienez %d karaktere)' % (eremua, gehienez))
    return balioa

def kopurua_balioztatu(balioa):
    """Zenbaki finitu positibo bat itzultzen du.

    SQLite-k REAL zutabe batean testua onartzen du, eta hori frontendera
    iristen da gero. Hemen geldiarazten dugu.
    """
    if isinstance(balioa, bool) or not isinstance(balioa, (int, float)):
        raise SarreraOkerra('Kopurua zenbaki bat izan behar da')
    balioa = float(balioa)
    if not math.isfinite(balioa):
        raise SarreraOkerra('Kopurua zenbaki finitu bat izan behar da')
    if not 0 < balioa <= GEHIENEZ_KOPURUA:
        raise SarreraOkerra('Kopurua 0 eta %d artean egon behar da' % GEHIENEZ_KOPURUA)
    return balioa

def baliabideak_balioztatu(baliabideak):
    if baliabideak is None:
        return []
    if not isinstance(baliabideak, list):
        raise SarreraOkerra('Baliabideak zerrenda bat izan behar dira')
    if len(baliabideak) > GEHIENEZ_BALIABIDEAK:
        raise SarreraOkerra('Baliabide gehiegi (gehienez %d)' % GEHIENEZ_BALIABIDEAK)
    garbiak = []
    for res in baliabideak:
        if not isinstance(res, dict):
            raise SarreraOkerra('Baliabide bakoitza objektu bat izan behar da')
        mota = res.get('type')
        if mota not in ('input', 'output'):
            raise SarreraOkerra('Baliabidearen mota "input" edo "output" izan behar da')
        garbiak.append({
            'material': testua_balioztatu(res.get('material'), 'Materialaren izena', GEHIENEZ_IZENA),
            'amount': kopurua_balioztatu(res.get('amount')),
            'type': mota,
        })
    return garbiak

@app.errorhandler(SarreraOkerra)
def sarrera_okerra_kudeatu(errorea):
    return jsonify({'error': str(errorea)}), 400

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/api/factories', methods=['GET'])
def get_factories():
    db = get_db()
    factories = db.execute("""
        SELECT f.*, a.name AS area_name
        FROM factories f LEFT JOIN areas a ON f.area_id = a.id
        ORDER BY a.name IS NULL, a.name, f.name
    """).fetchall()
    result = []
    for f in factories:
        fdict = dict(f)
        inputs = db.execute("""
            SELECT m.name, m.unit, m.category, fr.amount_per_min
            FROM factory_resources fr JOIN materials m ON fr.material_id=m.id
            WHERE fr.factory_id=? AND fr.type='input'
        """, (f['id'],)).fetchall()
        outputs = db.execute("""
            SELECT m.name, m.unit, m.category, fr.amount_per_min
            FROM factory_resources fr JOIN materials m ON fr.material_id=m.id
            WHERE fr.factory_id=? AND fr.type='output'
        """, (f['id'],)).fetchall()
        fdict['inputs'] = [dict(r) for r in inputs]
        fdict['outputs'] = [dict(r) for r in outputs]
        result.append(fdict)
    db.close()
    return jsonify(result)

def eremua_baliozkoa(db, area_id):
    """area_id None edo existitzen den eremu bat den egiaztatzen du."""
    if area_id is None:
        return True
    if isinstance(area_id, bool) or not isinstance(area_id, int):
        raise SarreraOkerra('Eremuaren identifikatzailea zenbaki oso bat izan behar da')
    return bool(db.execute("SELECT 1 FROM areas WHERE id=?", (area_id,)).fetchone())

def baliabideak_idatzi(db, fid, baliabideak):
    """Fabrikaren baliabideak ordezkatzen ditu; material berriak sortuz behar bada.

    `baliabideak` jada `baliabideak_balioztatu`-tik pasatuta egon behar da.
    """
    db.execute("DELETE FROM factory_resources WHERE factory_id=?", (fid,))
    for res in baliabideak:
        mat = db.execute("SELECT id FROM materials WHERE name=? COLLATE NOCASE", (res['material'],)).fetchone()
        if not mat:
            db.execute("INSERT INTO materials(name,unit,category,icon) VALUES(?,?,?,?)",
                       (res['material'], 'un/min', 'solid', 'box'))
            mat = db.execute("SELECT id FROM materials WHERE name=?", (res['material'],)).fetchone()
        db.execute("INSERT INTO factory_resources(factory_id,material_id,amount_per_min,type) VALUES(?,?,?,?)",
                   (fid, mat['id'], res['amount'], res['type']))

@app.route('/api/factories', methods=['POST'])
def create_factory():
    data = request.json or {}
    izena = testua_balioztatu(data.get('name'), 'Izena', GEHIENEZ_IZENA)
    deskribapena = testua_balioztatu(data.get('description'), 'Deskribapena',
                                     GEHIENEZ_DESKRIBAPENA, nahitaezkoa=False)
    baliabideak = baliabideak_balioztatu(data.get('resources'))
    db = get_db()
    try:
        if not eremua_baliozkoa(db, data.get('area_id')):
            return jsonify({'error': 'Eremua ez da aurkitu'}), 400
        if db.execute("SELECT 1 FROM factories WHERE name=? COLLATE NOCASE", (izena,)).fetchone():
            return jsonify({'error': '"%s" fabrika badago jada' % izena}), 409
        cur = db.execute("INSERT INTO factories(name,description,area_id) VALUES(?,?,?)",
                         (izena, deskribapena, data.get('area_id')))
        fid = cur.lastrowid
        baliabideak_idatzi(db, fid, baliabideak)
        db.commit()
    finally:
        db.close()
    return jsonify({'id': fid}), 201

@app.route('/api/factories/<int:fid>', methods=['PUT'])
def update_factory(fid):
    data = request.json or {}
    izena = testua_balioztatu(data.get('name'), 'Izena', GEHIENEZ_IZENA)
    deskribapena = testua_balioztatu(data.get('description'), 'Deskribapena',
                                     GEHIENEZ_DESKRIBAPENA, nahitaezkoa=False)
    baliabideak = baliabideak_balioztatu(data.get('resources'))
    db = get_db()
    try:
        if not db.execute("SELECT 1 FROM factories WHERE id=?", (fid,)).fetchone():
            return jsonify({'error': 'Fabrika ez da aurkitu'}), 404
        if not eremua_baliozkoa(db, data.get('area_id')):
            return jsonify({'error': 'Eremua ez da aurkitu'}), 400
        if db.execute("SELECT 1 FROM factories WHERE name=? COLLATE NOCASE AND id!=?", (izena, fid)).fetchone():
            return jsonify({'error': '"%s" fabrika badago jada' % izena}), 409
        db.execute("UPDATE factories SET name=?,description=?,area_id=? WHERE id=?",
                   (izena, deskribapena, data.get('area_id'), fid))
        baliabideak_idatzi(db, fid, baliabideak)
        db.commit()
    finally:
        db.close()
    return jsonify({'ok': True})

@app.route('/api/factories/<int:fid>', methods=['DELETE'])
def delete_factory(fid):
    db = get_db()
    try:
        cur = db.execute("DELETE FROM factories WHERE id=?", (fid,))
        db.commit()
    finally:
        db.close()
    if not cur.rowcount:
        return jsonify({'error': 'Fabrika ez da aurkitu'}), 404
    return jsonify({'ok': True})

@app.route('/api/materials', methods=['GET'])
def get_materials():
    db = get_db()
    mats = db.execute("""
        SELECT m.*, COUNT(DISTINCT fr.factory_id) AS usage_count
        FROM materials m LEFT JOIN factory_resources fr ON fr.material_id = m.id
        GROUP BY m.id
        ORDER BY m.name
    """).fetchall()
    db.close()
    return jsonify([dict(m) for m in mats])

@app.route('/api/materials/<int:mid>', methods=['PUT'])
def update_material(mid):
    """Materialaren kolorea esleitzen edo kentzen du (color: null)."""
    kolorea = (request.json or {}).get('color')
    if kolorea is not None and not (isinstance(kolorea, str) and KOLORE_RE.match(kolorea)):
        return jsonify({'error': 'Kolorea ez da baliozko #RRGGBB balio bat'}), 400
    db = get_db()
    try:
        cur = db.execute("UPDATE materials SET color=? WHERE id=?", (kolorea, mid))
        db.commit()
    finally:
        db.close()
    if not cur.rowcount:
        return jsonify({'error': 'Materiala ez da aurkitu'}), 404
    return jsonify({'ok': True})

@app.route('/api/materials/<int:mid>', methods=['DELETE'])
def delete_material(mid):
    """Erabilita ez dagoen materiala bakarrik ezabatzen du."""
    db = get_db()
    try:
        mat = db.execute("SELECT name FROM materials WHERE id=?", (mid,)).fetchone()
        if not mat:
            return jsonify({'error': 'Materiala ez da aurkitu'}), 404
        erabilerak = db.execute(
            "SELECT COUNT(DISTINCT factory_id) FROM factory_resources WHERE material_id=?", (mid,)
        ).fetchone()[0]
        if erabilerak:
            return jsonify({
                'error': '"%s" %d fabrikatan erabiltzen da; ezin da ezabatu' % (mat['name'], erabilerak),
                'usage_count': erabilerak,
            }), 409
        db.execute("DELETE FROM materials WHERE id=?", (mid,))
        db.commit()
    finally:
        db.close()
    return jsonify({'ok': True})

# ---------- Eremuak ----------

@app.route('/api/areas', methods=['GET'])
def get_areas():
    db = get_db()
    eremuak = db.execute("""
        SELECT a.*, COUNT(f.id) AS factory_count
        FROM areas a LEFT JOIN factories f ON f.area_id = a.id
        GROUP BY a.id
        ORDER BY a.name
    """).fetchall()
    db.close()
    return jsonify([dict(e) for e in eremuak])

@app.route('/api/areas', methods=['POST'])
def create_area():
    izena = testua_balioztatu((request.json or {}).get('name'), 'Izena', GEHIENEZ_IZENA)
    db = get_db()
    try:
        cur = db.execute("INSERT INTO areas(name) VALUES(?)", (izena,))
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({'error': '"%s" eremua badago jada' % izena}), 409
    finally:
        db.close()
    return jsonify({'id': cur.lastrowid, 'name': izena}), 201

@app.route('/api/areas/<int:aid>', methods=['PUT'])
def update_area(aid):
    izena = testua_balioztatu((request.json or {}).get('name'), 'Izena', GEHIENEZ_IZENA)
    db = get_db()
    try:
        cur = db.execute("UPDATE areas SET name=? WHERE id=?", (izena, aid))
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({'error': '"%s" eremua badago jada' % izena}), 409
    finally:
        db.close()
    if not cur.rowcount:
        return jsonify({'error': 'Eremua ez da aurkitu'}), 404
    return jsonify({'ok': True})

@app.route('/api/areas/<int:aid>', methods=['DELETE'])
def delete_area(aid):
    """Eremua ezabatzen du; bertako fabrikak eremurik gabe geratzen dira."""
    db = get_db()
    try:
        cur = db.execute("DELETE FROM areas WHERE id=?", (aid,))
        db.commit()
    finally:
        db.close()
    if not cur.rowcount:
        return jsonify({'error': 'Eremua ez da aurkitu'}), 404
    return jsonify({'ok': True})

@app.route('/api/summary', methods=['GET'])
def get_summary():
    db = get_db()
    rows = db.execute("""
        SELECT m.name, m.unit,
               SUM(CASE WHEN fr.type='input' THEN fr.amount_per_min ELSE 0 END) as total_input,
               SUM(CASE WHEN fr.type='output' THEN fr.amount_per_min ELSE 0 END) as total_output
        FROM factory_resources fr
        JOIN materials m ON fr.material_id=m.id
        GROUP BY m.id
        HAVING total_input>0 OR total_output>0
        ORDER BY total_output DESC
    """).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])

# ---------- Segurtasun kopiak ----------

def kopien_karpeta():
    os.makedirs(BACKUP_DIR, exist_ok=True)
    return BACKUP_DIR

def kopia_izena(etiketa=''):
    """Data-orduan oinarritutako izen bakarra sortzen du."""
    oinarria = 'kopia-' + datetime.now().strftime('%Y%m%d-%H%M%S')
    if etiketa:
        oinarria += '-' + etiketa
    izena, n = oinarria + '.db', 1
    while os.path.exists(os.path.join(kopien_karpeta(), izena)):
        izena = '%s-%d.db' % (oinarria, n)
        n += 1
    return izena

def kopia_bidea(izena):
    """Izena balioztatu eta bide osoa itzuli; bestela None."""
    if not BACKUP_RE.match(izena or ''):
        return None
    bidea = os.path.join(kopien_karpeta(), izena)
    if os.path.dirname(os.path.abspath(bidea)) != os.path.abspath(kopien_karpeta()):
        return None
    return bidea

def kopia_datuak(izena):
    bidea = os.path.join(kopien_karpeta(), izena)
    st = os.stat(bidea)
    return {
        'name': izena,
        'size': st.st_size,
        'created': datetime.fromtimestamp(st.st_mtime).isoformat(timespec='seconds'),
        'auto': '-auto' in izena,
        'uploaded': '-igoera' in izena,
    }

def kopia_izenak():
    """Karpetako kopia baliozkoen izenak, berrienak lehenik."""
    return sorted((f for f in os.listdir(kopien_karpeta()) if BACKUP_RE.match(f)), reverse=True)

def kopia_zaharrak_kendu():
    """Mugatik gorako `-auto` kopia zaharrenak ezabatzen ditu.

    Eskuzko eta igotako kopiak inoiz ez dira automatikoki ezabatzen: horiek
    erabiltzaileak nahita sortu ditu. Mugarik gabe, kopia bakoitzak DB osoa
    kopiatzen duenez, diskoa bete daiteke.
    """
    izenak = kopia_izenak()
    soberakina = len(izenak) - GEHIENEZ_KOPIAK
    if soberakina <= 0:
        return
    for izena in [i for i in reversed(izenak) if '-auto' in i][:soberakina]:
        try:
            os.remove(os.path.join(kopien_karpeta(), izena))
        except OSError:
            pass

def kopia_sortu(etiketa=''):
    """SQLite-ren backup APIa erabiliz kopia koherentea sortzen du."""
    kopia_zaharrak_kendu()
    izena = kopia_izena(etiketa)
    bidea = os.path.join(kopien_karpeta(), izena)
    jatorria = sqlite3.connect(DB)
    helburua = sqlite3.connect(bidea)
    try:
        with helburua:
            jatorria.backup(helburua)
    finally:
        helburua.close()
        jatorria.close()
    return kopia_datuak(izena)

def edukia_baliozkoa(conn):
    """Datuak frontendera bidaltzeko seguruak diren egiaztatzen du.

    Kopia bat kanpotik dator eta edozein eduki izan dezake. Kolorea eta
    kopurua zuzenean HTMLan txertatzen dira, beraz hemen egiaztatzen ditugu:
    bestela prestatutako .db batek kodea injektatu lezake berreskuratzean.
    """
    zutabe_izenak = zutabeak(conn, 'materials')
    if 'color' in zutabe_izenak:
        for (kolorea,) in conn.execute("SELECT color FROM materials WHERE color IS NOT NULL"):
            if not (isinstance(kolorea, str) and KOLORE_RE.match(kolorea)):
                return False, 'Kopiak kolore baliogabe bat du: %r' % (kolorea,)
    okerrak = conn.execute("""
        SELECT COUNT(*) FROM factory_resources
        WHERE typeof(amount_per_min) NOT IN ('real','integer')
    """).fetchone()[0]
    if okerrak:
        return False, 'Kopiak zenbakizkoa ez den %d kopuru du' % okerrak
    return True, None

def kopia_baliozkoa(bidea):
    """Fitxategia SQLite datu-base oso bat den, beharrezko taulak dituen eta
    edukia segurua den egiaztatzen du."""
    try:
        conn = sqlite3.connect('file:%s?mode=ro' % bidea, uri=True)
        try:
            if conn.execute("PRAGMA integrity_check").fetchone()[0] != 'ok':
                return False, 'Fitxategia hondatuta dago (integrity_check)'
            taulak = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            falta = BEHARREZKO_TAULAK - taulak
            if falta:
                return False, 'Taula hauek falta dira: ' + ', '.join(sorted(falta))
            return edukia_baliozkoa(conn)
        finally:
            conn.close()
    except sqlite3.DatabaseError:
        return False, 'Fitxategia ez da baliozko SQLite datu-base bat'

@app.route('/api/backups', methods=['GET'])
def list_backups():
    # BACKUP_RE bidez iragazten dugu, deskargatzeak eta ezabatzeak bezala:
    # horrela zerrendatutako izen guztiak [a-z0-9-]+.db dira, eta ezin dute
    # frontendeko JS katetik ihes egin.
    return jsonify([kopia_datuak(i) for i in kopia_izenak()])

@app.route('/api/backups', methods=['POST'])
def create_backup():
    eskuzkoak = [i for i in kopia_izenak() if '-auto' not in i]
    if len(eskuzkoak) >= GEHIENEZ_KOPIAK:
        return jsonify({
            'error': 'Kopia gehiegi (%d). Ezabatu batzuk berri bat sortu aurretik.' % len(eskuzkoak)
        }), 409
    return jsonify(kopia_sortu()), 201

@app.route('/api/backups/<name>/download', methods=['GET'])
def download_backup(name):
    bidea = kopia_bidea(name)
    if not bidea or not os.path.exists(bidea):
        return jsonify({'error': 'Kopia ez da aurkitu'}), 404
    return send_file(bidea, as_attachment=True, download_name=name)

@app.route('/api/backups/<name>', methods=['DELETE'])
def delete_backup(name):
    bidea = kopia_bidea(name)
    if not bidea or not os.path.exists(bidea):
        return jsonify({'error': 'Kopia ez da aurkitu'}), 404
    os.remove(bidea)
    return jsonify({'ok': True})

@app.route('/api/backups/<name>/restore', methods=['POST'])
def restore_backup(name):
    bidea = kopia_bidea(name)
    if not bidea or not os.path.exists(bidea):
        return jsonify({'error': 'Kopia ez da aurkitu'}), 404
    ondo, errorea = kopia_baliozkoa(bidea)
    if not ondo:
        return jsonify({'error': errorea}), 400

    # Uneko egoeraren babes-kopia, berreskuratzea desegin ahal izateko
    segurtasunekoa = kopia_sortu('auto')

    jatorria = sqlite3.connect(bidea)
    helburua = sqlite3.connect(DB)
    try:
        with helburua:
            jatorria.backup(helburua)
    finally:
        helburua.close()
        jatorria.close()

    # Kopia zaharrek eskema zaharra izan dezakete; eguneratu berreskuratu ondoren.
    migrazioak_aplikatu()
    eskema_sortu()
    return jsonify({'ok': True, 'safety_backup': segurtasunekoa['name']})

@app.route('/api/backups/upload', methods=['POST'])
def upload_backup():
    fitxategia = request.files.get('file')
    if not fitxategia or not fitxategia.filename:
        return jsonify({'error': 'Ez da fitxategirik bidali'}), 400

    izena = kopia_izena('igoera')
    bidea = os.path.join(kopien_karpeta(), izena)
    fitxategia.save(bidea)

    ondo, errorea = kopia_baliozkoa(bidea)
    if not ondo:
        os.remove(bidea)
        return jsonify({'error': errorea}), 400
    return jsonify(kopia_datuak(izena)), 201

# ---------- Migrazioak ----------

RGB_RE = re.compile(r'^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)')

def kolorea_hexara(balioa):
    """'rgb(232, 168, 56)' → '#E8A838'. Ezagutzen ez bada, None."""
    balioa = (balioa or '').strip()
    if KOLORE_RE.match(balioa):
        return balioa.upper()
    bat = RGB_RE.match(balioa)
    if bat:
        return '#%02X%02X%02X' % tuple(int(g) for g in bat.groups())
    return None

TAULA_IZENAK = {'factories', 'materials', 'factory_resources', 'areas'}

def zutabeak(conn, taula):
    # PRAGMA-k ez du parametrorik onartzen, beraz kateatu behar da. Zerrenda
    # zuriak bermatzen du kanpoko baliorik ez dela inoiz hona iristen.
    if taula not in TAULA_IZENAK:
        raise ValueError('Taula ezezaguna: %r' % (taula,))
    return {r[1] for r in conn.execute("PRAGMA table_info(%s)" % taula)}

def koloreak_materialetara(conn):
    """Fabrika bakoitzaren kolorea bere output materialei esleitzen die.

    Kolorea eskuz aukeratzen zenean, praktikan produkzio-kate bakoitzak bere
    kolorea zuen. Horrela migrazioaren ondoren itxura berdintsua mantentzen da.
    """
    errenkadak = conn.execute("""
        SELECT fr.material_id, f.color
        FROM factory_resources fr JOIN factories f ON f.id = fr.factory_id
        WHERE fr.type = 'output'
    """).fetchall()
    bozkak = {}
    for material_id, kolorea in errenkadak:
        hexa = kolorea_hexara(kolorea)
        if hexa:
            bozkak.setdefault(material_id, Counter())[hexa] += 1
    for material_id, kontagailua in bozkak.items():
        conn.execute("UPDATE materials SET color=? WHERE id=? AND color IS NULL",
                     (kontagailua.most_common(1)[0][0], material_id))

def eskema_sortu():
    """Falta diren taulak sortzen ditu, hutsetik instalatzeko.

    Lehen aplikazioak `factories.db` existitzen zela suposatzen zuen eta
    kraskatu egiten zen fitxategirik gabe.
    """
    conn = sqlite3.connect(DB)
    try:
        with conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS areas (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS factories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT,
                    area_id INTEGER REFERENCES areas(id) ON DELETE SET NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS materials (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    unit TEXT DEFAULT 'un/min',
                    category TEXT DEFAULT 'solid',
                    icon TEXT DEFAULT 'box',
                    color TEXT
                );
                CREATE TABLE IF NOT EXISTS factory_resources (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    factory_id INTEGER NOT NULL,
                    material_id INTEGER NOT NULL,
                    amount_per_min REAL NOT NULL,
                    type TEXT NOT NULL CHECK(type IN ("input","output")),
                    FOREIGN KEY(factory_id) REFERENCES factories(id) ON DELETE CASCADE,
                    FOREIGN KEY(material_id) REFERENCES materials(id)
                );
                CREATE INDEX IF NOT EXISTS idx_factory_resources_factory_id ON factory_resources(factory_id);
                CREATE INDEX IF NOT EXISTS idx_factory_resources_material_id ON factory_resources(material_id);
                CREATE INDEX IF NOT EXISTS idx_factories_area_id ON factories(area_id);
            """)
    finally:
        conn.close()

def migrazioak_aplikatu():
    """Eskema eguneratzen du: tier/color kendu, eremuak eta materialen koloreak gehitu.

    Idempotentea: abioan eta segurtasun kopia bat berreskuratu ondoren deitzen da.
    """
    conn = sqlite3.connect(DB)
    conn.isolation_level = None
    try:
        def taula_badago(izena):
            return bool(conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (izena,)).fetchone())

        # Datu-base hutsa edo berria: ez dago migratzeko ezer. `eskema_sortu`-k
        # arduratuko da taulak sortzeaz.
        if not taula_badago('factories'):
            return

        badago_areas = taula_badago('areas')
        badago_materials = taula_badago('materials')
        badago_kolorea = badago_materials and 'color' in zutabeak(conn, 'materials')
        fabrika_zutabeak = zutabeak(conn, 'factories')
        zaharrak = fabrika_zutabeak & {'tier', 'color'}
        if badago_areas and (badago_kolorea or not badago_materials) and not zaharrak:
            return

        kopia_sortu('auto')   # atzera egiteko bidea, ezer ukitu aurretik

        conn.execute("PRAGMA foreign_keys=OFF")
        if not badago_areas:
            conn.execute("""
                CREATE TABLE areas (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
        if badago_materials and not badago_kolorea:
            conn.execute("ALTER TABLE materials ADD COLUMN color TEXT")

        if not zaharrak:
            return

        if 'color' in fabrika_zutabeak:
            koloreak_materialetara(conn)

        # Taula berreraiki. factory_resources-ek ON DELETE CASCADE duenez, hau
        # foreign_keys=OFF gabe egiteak baliabide guztiak ezabatuko lituzke.
        conn.execute("PRAGMA legacy_alter_table=ON")
        conn.executescript("""
            BEGIN;
            CREATE TABLE factories_berria (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                area_id INTEGER REFERENCES areas(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            INSERT INTO factories_berria(id,name,description,area_id,created_at)
                SELECT id,name,description,NULL,created_at FROM factories;
            DROP TABLE factories;
            ALTER TABLE factories_berria RENAME TO factories;
            COMMIT;
        """)
        conn.execute("PRAGMA legacy_alter_table=OFF")

        hautsiak = conn.execute("PRAGMA foreign_key_check").fetchall()
        if hautsiak:
            raise RuntimeError('Migrazioak erreferentzia hautsiak utzi ditu: %r' % hautsiak)
    finally:
        conn.execute("PRAGMA foreign_keys=ON")
        conn.close()

# Ordena garrantzitsua da: migrazioak eskema zaharra espero du eta bere
# segurtasun kopia hartzen du ezer aldatu aurretik. Gero eskema_sortu-k falta
# den edozer betetzen du (datu-base guztiz berri bat, adibidez).
migrazioak_aplikatu()
eskema_sortu()

if __name__ == '__main__':
    # debug=True-k Werkzeug-en kontsola interaktiboa gaitzen du: kudeatu gabeko
    # errore batekin edonork kodea exekuta dezake. Garapenerako soilik:
    #   SATISFACTORY_DEBUG=1 python3 app.py
    app.run(debug=os.environ.get('SATISFACTORY_DEBUG') == '1',
            host='127.0.0.1', port=5000)
