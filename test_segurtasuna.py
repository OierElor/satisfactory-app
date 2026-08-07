"""Segurtasun-inbarianteen probak.

Aurkitutako ahultasun bakoitzeko proba bat. Helburua ez da estaldura osoa,
baizik eta konponduta dauden akatsak oharkabean ez itzultzea.

    python3 -m unittest test_segurtasuna -v

Mendekotasunik ez du behar: Python-en `unittest` eta Flask-en test bezeroa.
"""

import io
import json
import os
import shutil
import sqlite3
import tempfile
import unittest

# Aplikazioa inportatu AURRETIK bideratu behar dira ingurune-aldagaiak:
# `app`-ek moduluaren mailan sortzen du eskema eta aplikatzen ditu migrazioak.
# Horrela probek ez dute inoiz factories.db erreala ukitzen.
_TMP = tempfile.mkdtemp(prefix='satisfactory-probak-')
os.environ['SATISFACTORY_DB'] = os.path.join(_TMP, 'proba.db')
os.environ['SATISFACTORY_BACKUPS'] = os.path.join(_TMP, 'kopiak')

import app as aplikazioa  # noqa: E402


def tearDownModule():
    shutil.rmtree(_TMP, ignore_errors=True)


ESKEMA_MINIMOA = """
    CREATE TABLE areas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
    );
    CREATE TABLE factories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        area_id INTEGER
    );
    CREATE TABLE materials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        unit TEXT, category TEXT, icon TEXT, color TEXT
    );
    CREATE TABLE factory_resources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        factory_id INTEGER NOT NULL,
        material_id INTEGER NOT NULL,
        amount_per_min REAL NOT NULL,
        type TEXT NOT NULL
    );
"""


class Oinarria(unittest.TestCase):
    """DB garbi bat proba bakoitzeko."""

    def setUp(self):
        if os.path.exists(aplikazioa.DB):
            os.remove(aplikazioa.DB)
        shutil.rmtree(aplikazioa.BACKUP_DIR, ignore_errors=True)
        aplikazioa.eskema_sortu()
        aplikazioa.app.config['TESTING'] = True
        self.bezeroa = aplikazioa.app.test_client()

    def fabrika_sortu(self, **gainidatzi):
        datuak = {'name': 'Proba', 'description': '', 'resources': []}
        datuak.update(gainidatzi)
        return self.bezeroa.post('/api/factories', json=datuak)

    def kopurua_zenbakizkoa_ez_direnak(self):
        conn = sqlite3.connect(aplikazioa.DB)
        try:
            return conn.execute("""
                SELECT COUNT(*) FROM factory_resources
                WHERE typeof(amount_per_min) NOT IN ('real','integer')
            """).fetchone()[0]
        finally:
            conn.close()

    def kopia_eraiki(self, kolorea='#E8A838', kopurua=30.0):
        """Igotzeko .db bat sortzen du, aukeran eduki kutsatuarekin."""
        bidea = os.path.join(_TMP, 'eraikia.db')
        if os.path.exists(bidea):
            os.remove(bidea)
        conn = sqlite3.connect(bidea)
        try:
            with conn:
                conn.executescript(ESKEMA_MINIMOA)
                conn.execute("INSERT INTO factories(name) VALUES('F')")
                conn.execute("INSERT INTO materials(name,color) VALUES('M',?)", (kolorea,))
                conn.execute(
                    "INSERT INTO factory_resources(factory_id,material_id,amount_per_min,type)"
                    " VALUES(1,1,?,'output')", (kopurua,))
        finally:
            conn.close()
        with open(bidea, 'rb') as f:
            return f.read()

    def kopia_igo(self, edukia, izena='kopia.db'):
        return self.bezeroa.post(
            '/api/backups/upload',
            data={'file': (io.BytesIO(edukia), izena)},
            content_type='multipart/form-data')


class CorsEtaGoiburuak(Oinarria):
    """K1, K10 — jatorri arteko sarbidea eta segurtasun-goiburuak."""

    def test_cors_goibururik_ez(self):
        """Kanpoko webgune batek ezin ditu erantzunak irakurri."""
        for bidea in ('/api/factories', '/api/materials', '/api/areas', '/api/summary'):
            erantzuna = self.bezeroa.get(bidea, headers={'Origin': 'https://evil.example'})
            self.assertNotIn('Access-Control-Allow-Origin', erantzuna.headers,
                             '%s CORS goiburua itzultzen ari da' % bidea)

    def test_cors_preflight_ez_da_onartzen(self):
        """DELETE baten preflight-ak ez du baimenik eman behar."""
        erantzuna = self.bezeroa.options('/api/factories/1', headers={
            'Origin': 'https://evil.example',
            'Access-Control-Request-Method': 'DELETE',
        })
        self.assertNotIn('Access-Control-Allow-Origin', erantzuna.headers)
        self.assertNotIn('Access-Control-Allow-Methods', erantzuna.headers)

    def test_segurtasun_goiburuak(self):
        erantzuna = self.bezeroa.get('/api/factories')
        self.assertEqual(erantzuna.headers.get('X-Content-Type-Options'), 'nosniff')
        csp = erantzuna.headers.get('Content-Security-Policy', '')
        self.assertIn("frame-ancestors 'none'", csp)
        self.assertIn("connect-src 'self'", csp)
        self.assertIn("object-src 'none'", csp)


class SarrerenBalioztatzea(Oinarria):
    """K3, K6 — bezeroaren datuak ezin dira zuzenean DBra iritsi."""

    def test_kopurua_testua_400(self):
        """XSS karga bat `amount`-en: SQLite-k testua onartuko luke."""
        karga = '<img src=x onerror=alert(1)>'
        erantzuna = self.fabrika_sortu(resources=[
            {'material': 'M', 'amount': karga, 'type': 'output'}])
        self.assertEqual(erantzuna.status_code, 400)
        self.assertEqual(self.kopurua_zenbakizkoa_ez_direnak(), 0)

    def test_kopurua_atributu_ihesa_400(self):
        karga = '" autofocus onfocus=alert(1) x="'
        erantzuna = self.fabrika_sortu(resources=[
            {'material': 'M', 'amount': karga, 'type': 'output'}])
        self.assertEqual(erantzuna.status_code, 400)
        self.assertEqual(self.kopurua_zenbakizkoa_ez_direnak(), 0)

    def test_kopurua_infinitua_400(self):
        for karga in ('Infinity', '-Infinity', 'NaN'):
            gorputza = '{"name":"P","resources":[{"material":"M","amount":%s,"type":"output"}]}' % karga
            erantzuna = self.bezeroa.post('/api/factories', data=gorputza,
                                          content_type='application/json')
            self.assertEqual(erantzuna.status_code, 400, karga)

    def test_kopurua_zero_edo_negatiboa_400(self):
        for kop in (0, -5, -0.1):
            erantzuna = self.fabrika_sortu(resources=[
                {'material': 'M', 'amount': kop, 'type': 'output'}])
            self.assertEqual(erantzuna.status_code, 400, kop)

    def test_kopurua_handiegia_400(self):
        erantzuna = self.fabrika_sortu(resources=[
            {'material': 'M', 'amount': 1e12, 'type': 'output'}])
        self.assertEqual(erantzuna.status_code, 400)

    def test_mota_okerra_400(self):
        """500 bat izan beharrean (CHECK constraint), 400 garbia."""
        erantzuna = self.fabrika_sortu(resources=[
            {'material': 'M', 'amount': 10, 'type': 'DROP TABLE'}])
        self.assertEqual(erantzuna.status_code, 400)

    def test_izen_luzeegia_400(self):
        erantzuna = self.fabrika_sortu(name='x' * (aplikazioa.GEHIENEZ_IZENA + 1))
        self.assertEqual(erantzuna.status_code, 400)

    def test_deskribapen_luzeegia_400(self):
        erantzuna = self.fabrika_sortu(description='x' * (aplikazioa.GEHIENEZ_DESKRIBAPENA + 1))
        self.assertEqual(erantzuna.status_code, 400)

    def test_baliabide_gehiegi_400(self):
        gehiegi = [{'material': 'M%d' % i, 'amount': 1, 'type': 'output'}
                   for i in range(aplikazioa.GEHIENEZ_BALIABIDEAK + 1)]
        erantzuna = self.fabrika_sortu(resources=gehiegi)
        self.assertEqual(erantzuna.status_code, 400)

    def test_izenik_gabe_400(self):
        for izena in (None, '', '   ', 123, {'a': 1}):
            erantzuna = self.fabrika_sortu(name=izena)
            self.assertEqual(erantzuna.status_code, 400, izena)

    def test_area_id_okerra_400(self):
        for aid in ('bat', {'a': 1}, [1], True):
            erantzuna = self.fabrika_sortu(area_id=aid)
            self.assertEqual(erantzuna.status_code, 400, aid)

    def test_kolore_baliogabea_400(self):
        self.fabrika_sortu(resources=[{'material': 'M', 'amount': 10, 'type': 'output'}])
        mid = self.bezeroa.get('/api/materials').get_json()[0]['id']
        for kolorea in ('gorria', 'red;}</style><script>alert(1)</script>', '#GGGGGG', '#FFF', 123):
            erantzuna = self.bezeroa.put('/api/materials/%d' % mid, json={'color': kolorea})
            self.assertEqual(erantzuna.status_code, 400, kolorea)

    def test_datu_baliozkoak_onartzen_dira(self):
        """Kontrol positiboa: balioztatzeak ez du dena baztertzen."""
        erantzuna = self.fabrika_sortu(name='Burdin Galdategia', resources=[
            {'material': 'Iron Ore', 'amount': 30, 'type': 'input'},
            {'material': 'Iron Ingot', 'amount': 30.5, 'type': 'output'}])
        self.assertEqual(erantzuna.status_code, 201)
        fabrikak = self.bezeroa.get('/api/factories').get_json()
        self.assertEqual(len(fabrikak), 1)
        self.assertEqual(fabrikak[0]['inputs'][0]['amount_per_min'], 30)
        mid = self.bezeroa.get('/api/materials').get_json()[0]['id']
        self.assertEqual(
            self.bezeroa.put('/api/materials/%d' % mid, json={'color': '#38B4E8'}).status_code, 200)


class KopienSegurtasuna(Oinarria):
    """K4, K5, K7 — kopiak kanpoko datuak dira."""

    def test_path_traversal_blokeatuta(self):
        izenak = [
            '../../../etc/passwd',
            '..%2f..%2fetc%2fpasswd',
            'kopia-20260101-000000.db\n',
            'kopia-20260101-000000.db\nx',
            '.env',
            'factories.db',
        ]
        for izena in izenak:
            for bidea in ('/api/backups/%s/download', '/api/backups/%s'):
                erantzuna = self.bezeroa.get(bidea % izena) if 'download' in bidea \
                    else self.bezeroa.delete(bidea % izena)
                self.assertNotEqual(erantzuna.status_code, 200,
                                    '%s onartu egin da: %r' % (bidea, izena))

    def test_ez_sqlite_baztertuta(self):
        erantzuna = self.kopia_igo(b'hau ez da datu-base bat')
        self.assertEqual(erantzuna.status_code, 400)

    def test_taulak_falta_baztertuta(self):
        bidea = os.path.join(_TMP, 'hutsa.db')
        sqlite3.connect(bidea).close()
        with open(bidea, 'rb') as f:
            self.assertEqual(self.kopia_igo(f.read()).status_code, 400)

    def test_kolore_kutsatua_baztertuta(self):
        """K4: prestatutako .db batek ezin du HTML injektatu."""
        karga = 'red"></div><img src=x onerror=alert(1)><div style="'
        erantzuna = self.kopia_igo(self.kopia_eraiki(kolorea=karga))
        self.assertEqual(erantzuna.status_code, 400)
        self.assertIn('kolore', erantzuna.get_json()['error'].lower())

    def test_kopurua_kutsatua_baztertuta(self):
        erantzuna = self.kopia_igo(self.kopia_eraiki(kopurua='<script>alert(1)</script>'))
        self.assertEqual(erantzuna.status_code, 400)

    def test_kopia_garbia_onartzen_da(self):
        """Kontrol positiboa: kopia baliozko batek pasa behar du."""
        erantzuna = self.kopia_igo(self.kopia_eraiki())
        self.assertEqual(erantzuna.status_code, 201)
        izena = erantzuna.get_json()['name']
        self.assertTrue(aplikazioa.BACKUP_RE.match(izena), izena)

    def test_zerrendak_izen_baliozkoak_soilik(self):
        """K5: eskuz jarritako fitxategi arriskutsu bat ez da zerrendatzen."""
        aplikazioa.kopien_karpeta()
        # Fitxategi-izen batek ezin du '/' eduki, baina "'" bai — nahikoa da
        # onclick="kopiaEzabatu('...')" barruko JS katetik ihes egiteko.
        izen_gaiztoa = "x'); alert(1); z.db"
        with open(os.path.join(aplikazioa.BACKUP_DIR, izen_gaiztoa), 'wb') as f:
            f.write(b'edozer')
        izenak = [k['name'] for k in self.bezeroa.get('/api/backups').get_json()]
        self.assertNotIn(izen_gaiztoa, izenak)
        for izena in izenak:
            self.assertTrue(aplikazioa.BACKUP_RE.match(izena), izena)


class KopienMugak(Oinarria):
    """K6 — mugak diskoa betetzea eragozten dute, baina datuak galdu gabe."""

    def kopia_faltsua(self, izena):
        aplikazioa.kopien_karpeta()
        with open(os.path.join(aplikazioa.BACKUP_DIR, izena), 'wb') as f:
            f.write(b'x')

    def test_eskuzko_kopiak_ez_dira_inoiz_ezabatzen(self):
        """Erabiltzaileak nahita sortutakoak ukiezinak dira."""
        eskuzkoak = ['kopia-2026010%d-000000.db' % i for i in range(1, 6)]
        for izena in eskuzkoak:
            self.kopia_faltsua(izena)
        for i in range(60):
            self.kopia_faltsua('kopia-20250101-%06d-auto.db' % i)

        aplikazioa.kopia_zaharrak_kendu()

        geratzen = set(os.listdir(aplikazioa.BACKUP_DIR))
        for izena in eskuzkoak:
            self.assertIn(izena, geratzen, 'eskuzko kopia bat ezabatu da: %s' % izena)

    def test_auto_zaharrenak_kentzen_dira(self):
        for i in range(60):
            self.kopia_faltsua('kopia-20250101-%06d-auto.db' % i)
        aplikazioa.kopia_zaharrak_kendu()
        geratzen = sorted(os.listdir(aplikazioa.BACKUP_DIR))
        self.assertLessEqual(len(geratzen), aplikazioa.GEHIENEZ_KOPIAK)
        # Berrienak gorde behar dira, ez zaharrenak.
        self.assertIn('kopia-20250101-000059-auto.db', geratzen)
        self.assertNotIn('kopia-20250101-000000-auto.db', geratzen)

    def test_muga_azpian_ez_da_ezer_ezabatzen(self):
        for i in range(3):
            self.kopia_faltsua('kopia-20250101-00000%d-auto.db' % i)
        aplikazioa.kopia_zaharrak_kendu()
        self.assertEqual(len(os.listdir(aplikazioa.BACKUP_DIR)), 3)

    def test_eskuzko_muga_gaindituz_gero_409(self):
        for i in range(aplikazioa.GEHIENEZ_KOPIAK):
            self.kopia_faltsua('kopia-2025010%d-%06d.db' % (i % 9 + 1, i))
        self.assertEqual(self.bezeroa.post('/api/backups').status_code, 409)


class EskemaEtaAbioa(Oinarria):
    """K11 — hutsetik instalatzeak funtzionatu behar du."""

    def test_eskema_hutsetik_sortzen_da(self):
        os.remove(aplikazioa.DB)
        aplikazioa.eskema_sortu()
        conn = sqlite3.connect(aplikazioa.DB)
        try:
            taulak = {r[0] for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'")}
        finally:
            conn.close()
        self.assertTrue(aplikazioa.TAULA_IZENAK <= taulak, taulak)
        self.assertEqual(self.bezeroa.get('/api/factories').status_code, 200)

    def test_zutabeak_zerrenda_zuria(self):
        """K8: taula-izen arbitrario bat ez da SQLra iristen."""
        conn = sqlite3.connect(aplikazioa.DB)
        try:
            with self.assertRaises(ValueError):
                aplikazioa.zutabeak(conn, 'factories); DROP TABLE factories;--')
        finally:
            conn.close()


if __name__ == '__main__':
    unittest.main(verbosity=2)
