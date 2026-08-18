#!/usr/bin/env bash
# Portea egiaztatu: Flask eta biltegi lokala alderatu, hutsetik.
#
#   tresnak/alderatu.sh
#
# Aldi bakoitzean datu-base kopia berri bat erabiltzen du, eta JSONa handik
# sortzen du: horrela bi aldeak beti egoera beretik abiatzen dira. Hori gabe,
# aurreko exekuzioaren mutazioek hurrengoa faltsuki huts eginaraziko lukete.
#
# Zure `factories.db` erreala EZ da inoiz ukitzen: kopia bat erabiltzen da.

set -euo pipefail

OINARRIA="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LANTOKIA="$(mktemp -d -t satisfactory-alderatu-XXXXXX)"
FLASK_PID=""

garbitu() {
  [ -n "$FLASK_PID" ] && kill "$FLASK_PID" 2>/dev/null || true
  rm -rf "$LANTOKIA"
}
trap garbitu EXIT

if [ ! -f "$OINARRIA/app.py" ]; then
  echo "app.py ez dago: Flask bertsioa kenduta dago, alderaketak ez du zentzurik." >&2
  exit 1
fi

# 5000 portua libre egon behar da. Beste zerbitzari bat martxan badago, gureak
# ezingo du portua hartu, eta probek ISILEAN beste datu-base baten kontra joko
# lukete — zure datu errealen kontra, akaso. Hobe da hemen gelditzea.
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:5000/api/factories 2>/dev/null; then
  echo "ERROREA: 5000 portuan zerbitzari bat dago jada martxan." >&2
  echo "Gelditu ezazu probak exekutatu aurretik:" >&2
  echo "    pkill -f 'python3 app.py'" >&2
  exit 1
fi

cp "$OINARRIA/factories.db" "$LANTOKIA/proba.db"

echo "Flask abiarazten…"
SATISFACTORY_DB="$LANTOKIA/proba.db" \
SATISFACTORY_BACKUPS="$LANTOKIA/kopiak" \
  python3 "$OINARRIA/app.py" > "$LANTOKIA/flask.log" 2>&1 &
FLASK_PID=$!

for i in $(seq 1 40); do
  if curl -sf -o /dev/null http://127.0.0.1:5000/api/factories 2>/dev/null; then break; fi
  sleep 0.25
  if [ "$i" = 40 ]; then
    echo "Flask ez da abiarazi:" >&2
    tail -20 "$LANTOKIA/flask.log" >&2
    exit 1
  fi
done

# JSONa Flask-ek jada prestatutako datu-basetik: bi aldeak berdin hasten dira.
python3 "$OINARRIA/tresnak/migratu.py" "$LANTOKIA/proba.db" "$LANTOKIA/datuak.json" > /dev/null

DATUAK_JSON="$LANTOKIA/datuak.json" deno run --allow-read --allow-net --allow-env \
  "$OINARRIA/tresnak/alderatu.js"
