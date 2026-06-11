from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import sqlite3, os

app = Flask(__name__, static_folder='static')
CORS(app)
DB = os.path.join(os.path.dirname(__file__), 'factories.db')

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

if __name__ == '__main__':
    app.run(debug=True, port=5000)
