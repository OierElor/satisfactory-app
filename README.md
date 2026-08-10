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
├── requirements.txt
├── test_segurtasuna.py
├── factories.db          ← aukerazkoa: ez badago, hutsetik sortzen da
└── static/
    └── index.html
```

### 2. Dependentziak instalatu

```bash
sudo apt install python3-flask -y
```

Flask da mendekotasun bakarra (ikus `requirements.txt`). Lehen `flask-cors` ere behar zen; jada ez — ikus [Segurtasuna](#segurtasuna).

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
   - **Eremua** — fabrika zein eremutan dagoen (aukerazkoa; **Ezarpenak** fitxan kudeatzen dira)
   - **Deskribapena** — azalpen laburra (aukerazkoa)
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
Erregistratutako fabrika guztiak txarteletan erakusten ditu, eremuka ordenatuta. Txartel bakoitzak erakusten du:
- Goiko kolore-marra — **bertan gastatzen diren materialek definitzen dute**, edo ezer gastatzen ez badu, ekoizten dituenek (ikus [Fabrikaren kolorea](#fabrikaren-kolorea))
- Eremuaren bereizgarria, esleituta badago
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

### Ezarpenak
Bi atal ditu:

- **Eremuak** — fabrikak antolatzeko eremuak sortu, izena aldatu eta ezabatu. Eremu bat ezabatzean bertako fabrikak **ez dira galtzen**, eremurik gabe geratzen dira.
- **Materialen Koloreak** — material bakoitzari kolore bat esleitu (klik bakarrean; `×` laukiak kolorea kentzen du). Erabiltzen ez diren materialak hemen ezaba daitezke, zerrenda garbi mantentzeko.

### Segurtasun Kopiak
Datu-basearen kopiak sortu, deskargatu, igo eta berreskuratzeko fitxa. Ikusi [Segurtasun kopiak](#segurtasun-kopiak) atala.

---

## Fabrikaren kolorea

Fabrikaren kolorea ez da eskuz aukeratzen: **bertan gastatzen diren materialetatik kalkulatzen da**.

Txartelaren goiko marra banda batzuetan zatitzen da, fabrikak kontsumitzen duen material bakoitzeko bat, kantitatearen proportzioan. Adibidez, 30 `Iron Ingot` eta 10 `Screws` kontsumitzen dituen fabrika batek marraren %75 lehenaren kolorez eta %25 bigarrenarenaz izango du.

**Ezer gastatzen ez duen fabrikak ekoizten duenaren kolorea hartzen du.** Meatzeek, ur-ponpek eta oraindik sarrerak erregistratu gabe dituzten fabrikek horrela kolorea izaten jarraitzen dute, marra gris hutsa erakutsi beharrean.

- Materialaren kolorea **Ezarpenak → Materialen Koloreak** atalean esleitzen da.
- Kolorerik esleitu gabeko materialak grisez agertzen dira — horrela zer falta den begi bistan geratzen da.
- Ez sarrerarik ez irteerarik ez duen fabrika bakarrik geratzen da guztiz gris.
- **Laburpen Orokorra**-ko pasteltxo-grafikoak kolore bakarra behar duenez, kantitate handieneko materialarena erabiltzen du.

---

## Datu-basea

`factories.db` fitxategia SQLite datu-base bat da. Lau taula ditu:

- **factories** — fabrika bakoitzaren informazioa (izena, deskribapena, eremua)
- **materials** — material guztiak (burdina, kobrea, plastikoa...) bakoitzaren kolorearekin
- **factory_resources** — fabrika eta materialen arteko loturak, kopuruarekin eta motarekin (input/output)
- **areas** — fabrikak antolatzeko eremuak

Datu-basea `app.py`-rekin batera egon behar da beti.

Eskema abiaraztean automatikoki eguneratzen da. Bertsio zaharrago batetik (`tier` eta `color` zutabeak zituenetik) datorren datu-base bat irekitzean:

1. `-auto` etiketadun segurtasun kopia bat sortzen da lehenik.
2. Fabrika bakoitzaren kolore zaharra bere ekoizpen-materialei esleitzen zaie, itxura mantentzeko.
3. `tier` eta `color` zutabeak kentzen dira eta `areas` taula sortzen da.

Gauza bera gertatzen da kopia zahar bat berreskuratzean.

---

## Segurtasun kopiak

**"Segurtasun Kopiak"** fitxan datu-base osoaren kopiak kudea daitezke. Kopiak `backups/` karpetan gordetzen dira, `kopia-YYYYMMDD-HHMMSS.db` formatuan (karpeta automatikoki sortzen da).

| Ekintza | Azalpena |
|---------|----------|
| **+ Kopia Berria** | Uneko datu-basearen kopia sortzen du (SQLite-ren backup APIarekin, koherentzia bermatuta) |
| **Fitxategitik Igo** | Kanpoko `.db` fitxategi bat kopia gisa gehitzen du (balioztatu egiten da) |
| **Deskargatu** | Kopia zure ordenagailura jaisten du |
| **Berreskuratu** | Kopiaren datuak uneko datu-basean ezartzen ditu |
| **Ezabatu** | Kopia betiko ezabatzen du |

> **Garrantzitsua:** berreskuratzeak uneko datu **guztiak** ordezkatzen ditu. Aurretik `-auto` etiketadun kopia bat sortzen da automatikoki, atzera egin ahal izateko.

Balioztatzea: igotako edo berreskuratutako fitxategiak SQLite datu-base oso bat izan behar du (`integrity_check`) eta hiru taulak (`factories`, `materials`, `factory_resources`) eduki behar ditu. Bestela eragiketa bertan behera geratzen da.

Kopiak eskuz ere kudea daitezke — `backups/` karpetako fitxategiak beste disko batera kopiatzea nahikoa da.

---

## Segurtasuna

### Mehatxu-eredua

Aplikazioa **ordenagailu bakarrean, erabiltzaile bakarrarentzat** dago pentsatuta. Ez du autentifikaziorik eta `127.0.0.1`-en soilik entzuten du — hau da, zure ordenagailuak bakarrik iritsi dezake.

> **Garrantzitsua:** ez aldatu `host='127.0.0.1'` balioa `'0.0.0.0'`-ra autentifikazioa gehitu gabe. Hori eginez gero, zure sareko edonork datu guztiak irakurri, aldatu eta ezaba ditzake, inolako oztoporik gabe.

### Hartutako neurriak

| Neurria | Zergatik |
|---|---|
| **CORS gaituta EZ** | Lehen `CORS(app)` zegoen eta edozein jatorri onartzen zuen. Horrek esan nahi zuen bisitatzen zenuen **edozein webgunek** zure datuak irakurri edo fabrikak ezabatu zitzakeela `fetch` sinple batekin. Orain nabigatzaileak halako eskaerak blokeatzen ditu. Frontendak jatorri bera erabiltzen duenez, ez du CORSik behar. |
| **Debug modua itzalita** | `debug=True`-k Werkzeug-en kontsola interaktiboa gaitzen du: errore batekin edonork Python kodea exekuta dezake. Garapenerako: `SATISFACTORY_DEBUG=1 python3 app.py` |
| **Sarreren balioztatzea** | SQLite-k testua onartzen du zenbaki-zutabe batean. Balioztatu gabe, `amount` eremuan HTML bidal zitekeen eta gero orrian exekutatu (XSS). Orain zerbitzariak zenbaki finituak soilik onartzen ditu, eta izen/zerrenden luzerak mugatzen ditu. |
| **Kopien edukia egiaztatzea** | Igotako `.db` bat kanpoko datua da. Lehen taulen izenak baino ez ziren egiaztatzen; orain koloreak eta kopuruak ere bai, prestatutako kopia batek koderik injektatu ez dezan. |
| **HTML escape osoa** | Frontendak balio guztiak escapatzen ditu orrian txertatu aurretik, zenbakiak barne. |
| **Segurtasun-goiburuak** | CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy`. CSPk datuak kanpora ateratzea eta orria iframe batean sartzea eragozten du. |
| **Chart.js SRI-rekin** | `integrity` hash batekin kargatzen da: CDNa arriskatuz gero, nabigatzaileak fitxategia baztertzen du. |
| **Kopien muga** | Gehienez 50 kopia; `-auto` zaharrenak automatikoki kentzen dira diskoa ez betetzeko. |

### Probak exekutatu

Aldaketak egin ondoren, egiaztatu ez dela ezer hautsi:

```bash
python3 -m unittest test_segurtasuna -v
```

25 proba dira, konpondutako arazo bakoitzeko bat. Datu-base erreala **ez dute inoiz ukitzen**: aldi baterako karpeta bat erabiltzen dute.

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
