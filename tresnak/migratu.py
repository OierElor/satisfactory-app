"""factories.db → JSON: behin bakarrik exekutatzeko migrazio-tresna.

PWA bertsioak nabigatzailean gordetzen ditu datuak, JSON dokumentu bakar
batean. Script honek SQLiteko datu-base zaharra formatu horretara pasatzen du,
inportatzeko prest.

    python3 tresnak/migratu.py                    # factories.db → datuak.json
    python3 tresnak/migratu.py sarrera.db irteera.json

Datu-basea **ez du inoiz aldatzen**: irakurketa hutsezko konexioa erabiltzen du.

Taulen ordena mantentzen da (`ORDER BY id`), SQLiteren rowid ordena baita
zerbitzariak `ORDER BY`-rik gabeko kontsultetan itzultzen zuena — frontendak
baliabideak sartze-ordenan erakusten ditu, eta hori errespetatu behar da.
"""

import json
import os
import sqlite3
import sys
from datetime import datetime, timezone

TAULAK = ('areas', 'factories', 'materials', 'factory_resources')

# Esportazioaren formatu-bertsioa. Inportatzaileak hau begiratzen du:
# etorkizuneko aldaketek migrazio-bide bat behar dute, ez isilpeko hausturarik.
BERTSIOA = 1


def dokumentua_eraiki(db_bidea):
    """Datu-basea irakurri eta PWAren JSON dokumentua itzultzen du."""
    konexioa = sqlite3.connect('file:%s?mode=ro' % db_bidea, uri=True)
    konexioa.row_factory = sqlite3.Row
    try:
        dokumentua = {
            'bertsioa': BERTSIOA,
            'esportazio_data': datetime.now(timezone.utc).isoformat(),
            'hurrengo_id': {},
        }

        for taula in TAULAK:
            errenkadak = konexioa.execute(
                'SELECT * FROM %s ORDER BY id' % taula).fetchall()
            dokumentua[taula] = [dict(e) for e in errenkadak]

        # AUTOINCREMENT emulatzeko: hurrengo ida beti sekuentziaren gainetik.
        # `sqlite_sequence`-k ezabatutako errenkaden idak ere gogoratzen ditu,
        # eta hori nahita mantentzen dugu: idak ez dira inoiz berrerabiltzen.
        sekuentziak = dict(konexioa.execute(
            'SELECT name, seq FROM sqlite_sequence').fetchall())
        for taula in TAULAK:
            gehienezkoa = max(
                [e['id'] for e in dokumentua[taula]] + [sekuentziak.get(taula, 0)])
            dokumentua['hurrengo_id'][taula] = gehienezkoa + 1

        return dokumentua
    finally:
        konexioa.close()


def main(argumentuak):
    oinarria = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sarrera = argumentuak[0] if argumentuak else os.path.join(oinarria, 'factories.db')
    irteera = argumentuak[1] if len(argumentuak) > 1 else os.path.join(oinarria, 'datuak.json')

    if not os.path.exists(sarrera):
        print('Ez da aurkitu: %s' % sarrera, file=sys.stderr)
        return 1

    dokumentua = dokumentua_eraiki(sarrera)
    with open(irteera, 'w', encoding='utf-8') as f:
        json.dump(dokumentua, f, ensure_ascii=False, indent=2)

    print('Sortuta: %s' % irteera)
    for taula in TAULAK:
        print('  %-18s %4d errenkada (hurrengo id: %d)'
              % (taula, len(dokumentua[taula]), dokumentua['hurrengo_id'][taula]))
    print('  %-18s %d KB' % ('tamaina', os.path.getsize(irteera) // 1024))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
