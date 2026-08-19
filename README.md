# 🏭 Satisfactory — Fabrika Kudeatzailea

Zure Satisfactory-ko fabriken kontsumoa eta ekoizpena kudeatzeko tresna. Fabrika bakoitzak erabiltzen eta sortzen dituen materialak erregistratu, eta grafikoki ikusi zure ekoizpen-kateak.

Aplikazioa **nabigatzailean bertan** exekutatzen da, zerbitzaririk gabe. Ordenagailuan zein mugikorrean erabil daiteke, eta offline ere bai.

---

## Aurrebaldintza

Bat ere ez. Nabigatzaile moderno bat besterik ez.

Lehen Python eta Flask behar ziren; jada ez — ikus [Arkitektura](#arkitektura).

---

## Erabiltzen hasi

### Mugikorrean (PWA gisa instalatuta)

1. Ireki aplikazioaren helbidea nabigatzailean.
2. Menuan, sakatu **"Hasierako pantailan gehitu"** (Chrome) edo **"Instalatu"**.
3. Aplikazio arrunt baten moduan irekiko da, eta offline funtzionatuko du.

### Ordenagailuan

Helbide bera ireki nabigatzailean. Instalatu ere egin daiteke (helbide-barrako instalazio-ikonoa).

Garapenerako, tokiko zerbitzari batekin:

```bash
python3 -m http.server 8000
```

Gero `http://localhost:8000` ireki. (Python-en liburutegi estandarra da; ez du ezer instalatu behar.)

> **Oharra:** ez ireki `index.html` fitxategia zuzenean (`file://`). Nabigatzaileek biltegiratzea mugatzen dute horrela, eta datuak gal litezke.

---

## Datuak non gordetzen dira

Gailu bakoitzeko nabigatzailean, ez zerbitzari batean. Horrek esan nahi du:

- **Gailu bakoitzak bere datuak ditu.** Ez dira automatikoki sinkronizatzen.
- **Esportatu aldizka.** "Segurtasun Kopiak" fitxan, **Esportatu JSON** botoiak fitxategi bat deskargatzen du (edo telefonoan zuzenean partekatzen du, nabigatzaileak onartzen badu). Hori da zure segurtasun-kopia.
- **Goiburuan badago abisu bat** ("N aldaketa esportatu gabe") azken esportaziotik zenbat aldaketa egin diren erakusten duena.
- **Gailuen artean mugitzeko:** esportatu batean, eta **Fitxategitik Inportatu** bestean.

> **Inportazioak bat egiten du, ez du dena ordezkatzen.** Erregistro bakoitzeko (fabrika, material, eremu) bertsio berriena mantentzen da; alde batean bakarrik dagoen erregistrorik ez da inoiz isilean ezabatzen. Nahi izanez gero, "dena ordezkatu" aukera ere badago, bigarren mailako aukera gisa. Inportatu aurretik uneko egoera automatikoki deskargatzen da, badaezpada.
>
> Nabigazio-datuak garbitzeak datuak ezaba ditzake. Aplikazioak biltegi iraunkorra eskatzen dio nabigatzaileari, eta egoera "Segurtasun Kopiak" fitxan erakusten du, esportazio-historiko batekin batera.

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
- **"Bikoiztu"** — antzeko fabrika bat azkar sortzeko, datu berberekin
- **"Ezabatu"** — fabrika ezabatzeko (berrespena eskatuko du)

Ezabatze bat (fabrika, material edo eremu) egin ondoren, behean "Desegin" botoi bat agertzen da segundo batzuetan — sakatuz, azken ezabatzea desegiten da.

---

## Fitxen azalpena

### Fabrikak
Erregistratutako fabrika guztiak txarteletan erakusten ditu, eremuka ordenatuta. Txartel bakoitzak erakusten du:
- Goiko kolore-marra — **bertan gastatzen diren materialek definitzen dute**, edo ezer gastatzen ez badu, ekoizten dituenek (ikus [Fabrikaren kolorea](#fabrikaren-kolorea))
- Eremuaren bereizgarria, esleituta badago
- Kontsumoa (gorriz) — fabrikak behar dituen materialak minutuko
- Ekoizpena (berdez) — fabrikak sortzen dituen materialak minutuko

### Laburpen Orokorra
Estatistika globalak, gabezien abisua (saldo negatiboko materialak badaude) eta lau grafiko:
- **Ekoizpena Fabrikako** — pasteltxo-grafikoa fabrika bakoitzaren ekoizpen-proportzioarekin
- **Material Ekoiztuenak** — barra-grafikoa top 10 materialak
- **Saldo Garbia** — material bakoitzaren balantzea (berdea = soberakina, gorria = defizita)
- **Eremuka Banaketa** — kontsumoa eta ekoizpena eremuka taldekatuta

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
Datuak JSON fitxategi batera esportatu (edo partekatu) eta handik inportatzeko fitxa. Biltegiaren egoera ere erakusten du: zenbat erregistro dauden, zenbat leku hartzen duten, azken esportaziotik zenbat denbora pasa den, eta nabigatzaileak datuak babestuta dituen. Azpian, esportazio-historiko bat (azken 20ak) erakusten da. Ikusi [Datuak non gordetzen diren](#datuak-non-gordetzen-dira).

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

## Arkitektura

Aplikazio osoa nabigatzailean exekutatzen da. Ez dago zerbitzaririk, ez datu-baserik diskoan.

```
index.html              interfazea (markup + estiloak)
js/balioztatu.js        sarreren balioztatzea
js/biltegia.js          datuak eta domeinu-eragiketak (localStorage)
js/api.js               bideratzailea: interfazea eta biltegia lotzen ditu
js/kopiak.js            esportazioa eta inportazioa
js/probak.js            proba funtzionalak
sw.js                   service worker-a (offline)
bendor/                 Chart.js eta letra-tipoak, lokalean
tresnak/migratu.py      SQLite datu-base zahar bat JSONera bihurtzeko tresna
```

Datuak `localStorage`-en JSON dokumentu bakar batean daude. Datu-multzoa txikia da (47 fabrikarekin ~16 KB), eta nabigatzailearen muga 5–10 MB, beraz tarte handia dago.

Lehen Flask + SQLite erabiltzen zen zerbitzari gisa. Logika JavaScriptera pasatu zen mugikorrean zerbitzaririk gabe erabili ahal izateko; portea Flask-en erantzunekin banan-banan alderatuta egiaztatu zen garatze-fasean.

---

## Segurtasuna

### Mehatxu-eredua

Aplikazioak ez du zerbitzaririk eta ez du daturik bidaltzen inora. Dena zure nabigatzailean geratzen da. Ez dago autentifikaziorik ez delako beharrezkoa: ez dago urrunetik atzitu daitekeen ezer.

Kanpotik datorren gauza bakarra **inportatzen den JSON fitxategia** da. Hori da konfiantza-muga.

### Hartutako neurriak

| Neurria | Zergatik |
|---|---|
| **Inportazioaren balioztatzea** | Fitxategi bat kanpoko datua da. Egitura, erregistro bakoitza eta erreferentzien osotasuna egiaztatzen dira: existitzen ez den fabrika aipatzen duen baliabide batek, edo kolore gisa HTML duen material batek, inportazioa bertan behera uzten dute. |
| **HTML escape osoa** | Interfazeak balio guztiak escapatzen ditu orrian txertatu aurretik, zenbakiak barne. |
| **CSP `<meta>` bidez** | `connect-src 'none'`: aplikazioak ezin du sarera ezer bidali. `object-src`, `base-uri`, `frame-ancestors` eta `form-action` ere itxita. |
| **Baliabide lokalak** | Chart.js eta letra-tipoak errepositorioan daude. CDN batek ezin du kodea aldatu, eta offline funtzionatzen du. |
| **Sarreren balioztatzea** | Zenbaki finituak soilik kopuruetan, eta izen/zerrenden luzerak mugatuta — zerbitzariak egiten zuen bezala. |

### Probak exekutatu

Nabigatzailean: **`probak.html`** ireki.

Kontsolatik (Deno behar du):

```bash
deno run --allow-read tresnak/probak-deno.js
```

33 proba dira: balioztatzea, domeinu-logika (ordenatzea, kaskadak, id-ak), inportazioaren egiaztapena, bat-egitea eta aldaketa-kontagailua. Zure datuak **ez dituzte inoiz ukitzen**: probek beren egoera erabiltzen dute eta amaitzean garbitzen dute.

---

## Arazoak konpontzea

**Datuak desagertu dira**
- Nabigazio-datuak garbitzeak biltegia hustu dezake. Berreskuratzeko: **Fitxategitik Inportatu** eta azken esportazioa hautatu.
- Prebenitzeko: esportatu aldizka. "Segurtasun Kopiak" fitxak azken esportaziotik zenbat denbora pasa den erakusten du.

**Beste gailuko datuak ez dira agertzen**
- Gailu bakoitzak bere datuak ditu; ez dira automatikoki sinkronizatzen. Esportatu batean eta inportatu bestean.
- Egiaztatu bi gailuetan **helbide bera** erabiltzen duzula. Helbide desberdinek biltegi desberdinak dituzte.

**Grafikoak ez dira agertzen**
- `bendor/chart.umd.js` faltako da. Egiaztatu errepositorio osoa deskargatu duzula.

**Aldaketak ez dira agertzen eguneratu ondoren**
- Service worker-ak bertsio zaharra gordeta dauka. `sw.js`-ko `BERTSIOA` aldatu behar da azaleko fitxategiak aldatzean.
- Bitartean: nabigatzailean orria berritu indarrez (Ctrl+Shift+R).

**`file://` bidez irekitzean ez dabil**
- Nabigatzaileek biltegiratzea eta service worker-ak mugatzen dituzte protokolo horretan. Erabili `python3 -m http.server 8000` edo lineako helbidea.
