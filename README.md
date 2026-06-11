# 🏭 Satisfactory — Fabrika Kudeatzailea

Zure Satisfactory-ko fabriken kontsumoa eta ekoizpena kudeatzeko tresna. Fabrika bakoitzak erabiltzen eta sortzen dituen materialak erregistratu, eta grafikoki ikusi zure ekoizpen-kateak.

---

## Aurrebaldintza

- Python 3.8 edo berriagoa
- pip

Debian/Ubuntu-n egiaztatzeko:
```bash
python3 --version
```

---

## Instalazioa

### 1. Fitxategiak deskargatu

Ziurtatu karpeta-egitura hau duzula:

```
satisfactory-app/
├── app.py
├── factories.db
└── static/
    └── index.html
```

### 2. Dependentziak instalatu

```bash
sudo apt install python3-pip python3-flask -y
pip3 install flask-cors --break-system-packages
```

### 3. Aplikazioa abiarazi

```bash
cd satisfactory-app
python3 app.py
```

Terminalean honelako zerbait ikusi beharko duzu:

```
* Running on http://127.0.0.1:5000
```

### 4. Nabigatzailean ireki

```
http://localhost:5000
```

Hori da dena. Aplikazioa prest dago erabiltzeko.

> Gelditzeko `Ctrl+C` sakatu terminalean.

---

## Erabilera

### Fabrika berria sortu

1. Goiko eskuineko **"+ Fabrika Berria"** botoia sakatu
2. Bete formularioa:
   - **Izena** — fabrikaren izena (adib. "Burdin Galdategia")
   - **Maila** — fabrikaren Tier maila (1etik 8ra)
   - **Deskribapena** — azalpen laburra (aukerazkoa)
   - **Kolorea** — identifikazio-kolorea
3. Materialak gehitu:
   - **"+ Material gehitu"** sakatu material bakoitzarentzat
   - Izena idatzi (adib. "Burdina")
   - Kopurua sartu minutuko (adib. `30`)
   - Mota hautatu: **Kontsum.** (sartzen dena) edo **Ekoizp.** (ateratzen dena)
4. **"Gorde"** sakatu

### Fabrika editatu edo ezabatu

Fabrika-txartelaren beheko eskuinean:
- **"Editatu"** — datuak aldatzeko
- **"Ezabatu"** — fabrika ezabatzeko (berrespena eskatuko du)

---

## Fitxen azalpena

### Fabrikak
Erregistratutako fabrika guztiak txarteletan erakusten ditu. Txartel bakoitzak erakusten du:
- Kontsumoa (gorriz) — fabrikak behar dituen materialak minutuko
- Ekoizpena (berdez) — fabrikak sortzen dituen materialak minutuko

### Laburpen Orokorra
Estatistika globalak eta hiru grafiko:
- **Ekoizpena Fabrikako** — pasteltxo-grafikoa fabrika bakoitzaren ekoizpen-proportzioarekin
- **Material Ekoiztuenak** — barra-grafikoa top 10 materialak
- **Saldo Garbia** — material bakoitzaren balantzea (berdea = soberakina, gorria = defizita)

### Materialak
Taula zehatza material guztiekin:

| Zutabea | Azalpena |
|---------|----------|
| Kontsumoa | Fabrika guztien artean minutuko kontsumoa |
| Ekoizpena | Fabrika guztien artean minutuko ekoizpena |
| Saldo Garbia | Ekoizpena minus Kontsumoa |
| Fluxua | Barra bisualak proportzioa ikusteko |

---

## Datu-basea

`factories.db` fitxategia SQLite datu-base bat da. Hiru taula ditu:

- **factories** — fabrika bakoitzaren informazioa (izena, maila, kolorea...)
- **materials** — material guztiak (burdina, kobrea, plastikoa...)
- **factory_resources** — fabrika eta materialen arteko loturak, kopuruarekin eta motarekin (input/output)

Datu-basea `app.py`-rekin batera egon behar da beti.

---

## Arazoak konpontzea

**"Address already in use" errorea**
```bash
# 5000 portua erabiltzen duen prozesua gelditu
sudo fuser -k 5000/tcp
python3 app.py
```

**Webguneak ez du erantzuten**
- Egiaztatu terminala irekita dagoela eta `app.py` exekutatzen ari dela
- Nabigatzailean `http://localhost:5000` idatzi (ez `https`)

**Fabrikak ez dira gordetzen**
- Egiaztatu `factories.db` fitxategia `app.py`-rekin karpeta berean dagoela
- Terminaleko errore-mezuak irakurri diagnostikorako
