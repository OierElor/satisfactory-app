"""Funtzio-probak.

`test_segurtasuna.py`-k segurtasun-inbarianteak probatzen ditu; hemen
funtzionalitatearen zuzentasuna probatzen da: agregazioak, ezabaketen
eraginak, kopien berreskuratze-bidea, eta azken hobekuntzen portaera
(fabrika-izen bikoiztuen antzematea, material-izenen normalizazioa,
datu-basearen indizeak).

    python3 -m unittest test_funtzionala -v

Mendekotasunik ez du behar: Python-en `unittest` eta Flask-en test bezeroa.
"""

import os
import shutil
import sqlite3
import tempfile
import unittest

_TMP = tempfile.mkdtemp(prefix='satisfactory-probak-funtz-')
os.environ['SATISFACTORY_DB'] = os.path.join(_TMP, 'proba.db')
os.environ['SATISFACTORY_BACKUPS'] = os.path.join(_TMP, 'kopiak')

import app as aplikazioa  # noqa: E402


def tearDownModule():
    shutil.rmtree(_TMP, ignore_errors=True)


class Oinarria(unittest.TestCase):
    """DB garbi bat proba bakoitzeko."""

    def setUp(self):
        # Beste test-fitxategi batekin batera exekutatzean (biek `app` modulu
        # bera partekatzen dute), lehenengoaren tearDownModule-k aldi baterako
        # karpeta ezabatu dezake honek oraindik erabili aurretik.
        os.makedirs(os.path.dirname(aplikazioa.DB), exist_ok=True)
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


class LaburpenaZuzena(Oinarria):
    """/api/summary-k baliabideen batura zuzen kalkulatu behar du."""

    def test_kontsumoa_eta_ekoizpena_batzen_dira(self):
        self.fabrika_sortu(name='Meategia', resources=[
            {'material': 'Iron Ore', 'amount': 60, 'type': 'output'},
        ])
        self.fabrika_sortu(name='Galdategia', resources=[
            {'material': 'Iron Ore', 'amount': 30, 'type': 'input'},
            {'material': 'Iron Ore', 'amount': 15, 'type': 'input'},
            {'material': 'Iron Ingot', 'amount': 30, 'type': 'output'},
        ])
        laburpena = {m['name']: m for m in self.bezeroa.get('/api/summary').get_json()}
        self.assertEqual(laburpena['Iron Ore']['total_output'], 60)
        self.assertEqual(laburpena['Iron Ore']['total_input'], 45)
        self.assertEqual(laburpena['Iron Ingot']['total_output'], 30)
        self.assertEqual(laburpena['Iron Ingot']['total_input'], 0)


class EremuenEzabaketa(Oinarria):
    """Eremu bat ezabatzean, bertako fabrikak ez dira ezabatu behar."""

    def test_fabrika_eremurik_gabe_geratzen_da(self):
        eid = self.bezeroa.post('/api/areas', json={'name': 'Ekialdea'}).get_json()['id']
        fid = self.fabrika_sortu(name='F1', area_id=eid).get_json()['id']

        erantzuna = self.bezeroa.delete('/api/areas/%d' % eid)
        self.assertEqual(erantzuna.status_code, 200)

        fabrikak = self.bezeroa.get('/api/factories').get_json()
        self.assertEqual(len(fabrikak), 1)
        self.assertEqual(fabrikak[0]['id'], fid)
        self.assertIsNone(fabrikak[0]['area_id'])


class KopienBerreskuratzeBideZoriontsua(Oinarria):
    """Kopia sortu, deskargatu eta berreskuratzeko bide arrunta."""

    def test_deskarga_eta_berreskuratzea(self):
        self.fabrika_sortu(name='Jatorrizkoa', resources=[
            {'material': 'M', 'amount': 10, 'type': 'output'}])
        kopia = self.bezeroa.post('/api/backups').get_json()
        izena = kopia['name']

        deskarga = self.bezeroa.get('/api/backups/%s/download' % izena)
        self.assertEqual(deskarga.status_code, 200)
        self.assertTrue(deskarga.data.startswith(b'SQLite format 3'))

        self.fabrika_sortu(name='Berria')
        self.assertEqual(len(self.bezeroa.get('/api/factories').get_json()), 2)

        berreskuratu = self.bezeroa.post('/api/backups/%s/restore' % izena)
        self.assertEqual(berreskuratu.status_code, 200)
        self.assertIn('safety_backup', berreskuratu.get_json())

        fabrikak = self.bezeroa.get('/api/factories').get_json()
        self.assertEqual(len(fabrikak), 1)
        self.assertEqual(fabrikak[0]['name'], 'Jatorrizkoa')


class FabrikaIzenBikoiztuak(Oinarria):
    """Fabrika-izenak ezin dira bikoiztu, materialek/eremuek bezala."""

    def test_izen_bikoiztua_409_sorreran(self):
        self.assertEqual(self.fabrika_sortu(name='Galdategia').status_code, 201)
        erantzuna = self.fabrika_sortu(name='galdategia')
        self.assertEqual(erantzuna.status_code, 409)

    def test_izen_bikoiztua_409_eguneratzean(self):
        self.fabrika_sortu(name='A')
        bid = self.fabrika_sortu(name='B').get_json()['id']
        erantzuna = self.bezeroa.put('/api/factories/%d' % bid, json={
            'name': 'a', 'description': '', 'resources': []})
        self.assertEqual(erantzuna.status_code, 409)

    def test_izen_bera_mantentzea_onartzen_da(self):
        """Fabrika bere izen berarekin eguneratzeak ez du 409 eman behar."""
        fid = self.fabrika_sortu(name='A').get_json()['id']
        erantzuna = self.bezeroa.put('/api/factories/%d' % fid, json={
            'name': 'A', 'description': 'Deskribapen berria', 'resources': []})
        self.assertEqual(erantzuna.status_code, 200)


class MaterialIzenenNormalizazioa(Oinarria):
    """Letra larri/xeheek ez dute material bikoiztu bat sortu behar."""

    def test_letra_larri_xeheak_material_bera_dira(self):
        self.fabrika_sortu(name='F1', resources=[
            {'material': 'Iron Ore', 'amount': 10, 'type': 'output'}])
        self.fabrika_sortu(name='F2', resources=[
            {'material': 'iron ore', 'amount': 5, 'type': 'input'}])

        materialak = self.bezeroa.get('/api/materials').get_json()
        self.assertEqual(len(materialak), 1)
        self.assertEqual(materialak[0]['name'], 'Iron Ore')

        laburpena = self.bezeroa.get('/api/summary').get_json()
        self.assertEqual(len(laburpena), 1)
        self.assertEqual(laburpena[0]['total_output'], 10)
        self.assertEqual(laburpena[0]['total_input'], 5)


class DatuBasearenIndizeak(Oinarria):
    """K11-en jarraipena: indizeak idempoteak izan behar dira."""

    def _indize_izenak(self, conn, taula):
        return {r[1] for r in conn.execute("PRAGMA index_list(%s)" % taula).fetchall()}

    def test_indizeak_behin_bakarrik_sortzen_dira(self):
        aplikazioa.eskema_sortu()
        aplikazioa.eskema_sortu()
        conn = sqlite3.connect(aplikazioa.DB)
        try:
            fr_indizeak = self._indize_izenak(conn, 'factory_resources')
            f_indizeak = self._indize_izenak(conn, 'factories')
        finally:
            conn.close()
        self.assertIn('idx_factory_resources_factory_id', fr_indizeak)
        self.assertIn('idx_factory_resources_material_id', fr_indizeak)
        self.assertIn('idx_factories_area_id', f_indizeak)


if __name__ == '__main__':
    unittest.main(verbosity=2)
