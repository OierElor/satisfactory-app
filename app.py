from flask import Flask, jsonify, request, send_from_directory, send_file
from flask_cors import CORS
import sqlite3, os, re
from datetime import datetime

app = Flask(__name__, static_folder='static')
CORS(app)
app.config['MAX_CONTENT_LENGTH'] = 64 * 1024 * 1024
DB = os.path.join(os.path.dirname(__file__), 'factories.db')
BACKUP_DIR = os.path.join(os.path.dirname(__file__), 'backups')
BACKUP_RE = re.compile(r'^kopia-\d{8}-\d{6}(-(auto|igoera))?(-\d+)?\.db$')
BEHARREZKO_TAULAK = {'factories', 'materials', 'factory_resources'}

def get_db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/api/factories', methods=['GET'])
def get_factories():
    db = get_db()
    factories = db.execute("SELECT * FROM factories ORDER BY tier, name").fetchall()
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

@app.route('/api/factories', methods=['POST'])
def create_factory():
    data = request.json
    db = get_db()
    cur = db.execute(
        "INSERT INTO factories(name,description,tier,color) VALUES(?,?,?,?)",
        (data['name'], data.get('description',''), data.get('tier',1), data.get('color','#E8A838'))
    )
    fid = cur.lastrowid
    for res in data.get('resources', []):
        mat = db.execute("SELECT id FROM materials WHERE name=?", (res['material'],)).fetchone()
        if not mat:
            db.execute("INSERT INTO materials(name,unit,category,icon) VALUES(?,?,?,?)",
                       (res['material'], res.get('unit','un/min'), 'solid', 'box'))
            mat = db.execute("SELECT id FROM materials WHERE name=?", (res['material'],)).fetchone()
        db.execute("INSERT INTO factory_resources(factory_id,material_id,amount_per_min,type) VALUES(?,?,?,?)",
                   (fid, mat['id'], res['amount'], res['type']))
    db.commit()
    db.close()
    return jsonify({'id': fid}), 201

@app.route('/api/factories/<int:fid>', methods=['PUT'])
def update_factory(fid):
    data = request.json
    db = get_db()
    db.execute("UPDATE factories SET name=?,description=?,tier=?,color=? WHERE id=?",
               (data['name'], data.get('description',''), data.get('tier',1), data.get('color','#E8A838'), fid))
    db.execute("DELETE FROM factory_resources WHERE factory_id=?", (fid,))
    for res in data.get('resources', []):
        mat = db.execute("SELECT id FROM materials WHERE name=?", (res['material'],)).fetchone()
        if not mat:
            db.execute("INSERT INTO materials(name,unit,category,icon) VALUES(?,?,?,?)",
                       (res['material'], res.get('unit','un/min'), 'solid', 'box'))
            mat = db.execute("SELECT id FROM materials WHERE name=?", (res['material'],)).fetchone()
        db.execute("INSERT INTO factory_resources(factory_id,material_id,amount_per_min,type) VALUES(?,?,?,?)",
                   (fid, mat['id'], res['amount'], res['type']))
    db.commit()
    db.close()
    return jsonify({'ok': True})

@app.route('/api/factories/<int:fid>', methods=['DELETE'])
def delete_factory(fid):
    db = get_db()
    db.execute("DELETE FROM factories WHERE id=?", (fid,))
    db.commit()
    db.close()
    return jsonify({'ok': True})

@app.route('/api/materials', methods=['GET'])
def get_materials():
    db = get_db()
    mats = db.execute("SELECT * FROM materials ORDER BY category, name").fetchall()
    db.close()
    return jsonify([dict(m) for m in mats])

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

def kopia_sortu(etiketa=''):
    """SQLite-ren backup APIa erabiliz kopia koherentea sortzen du."""
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

def kopia_baliozkoa(bidea):
    """Fitxategia SQLite datu-base oso bat den eta beharrezko taulak dituen egiaztatzen du."""
    try:
        conn = sqlite3.connect('file:%s?mode=ro' % bidea, uri=True)
        try:
            if conn.execute("PRAGMA integrity_check").fetchone()[0] != 'ok':
                return False, 'Fitxategia hondatuta dago (integrity_check)'
            taulak = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            falta = BEHARREZKO_TAULAK - taulak
            if falta:
                return False, 'Taula hauek falta dira: ' + ', '.join(sorted(falta))
        finally:
            conn.close()
    except sqlite3.DatabaseError:
        return False, 'Fitxategia ez da baliozko SQLite datu-base bat'
    return True, None

@app.route('/api/backups', methods=['GET'])
def list_backups():
    izenak = sorted((f for f in os.listdir(kopien_karpeta()) if f.endswith('.db')), reverse=True)
    return jsonify([kopia_datuak(i) for i in izenak])

@app.route('/api/backups', methods=['POST'])
def create_backup():
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

if __name__ == '__main__':
    app.run(debug=True, port=5000)
