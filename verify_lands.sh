#!/usr/bin/env bash
OUT_DIR="/home/degenai/scrollvault/verification"
mkdir -p "$OUT_DIR"
TS=$(date +%Y-%m-%d)
OUTFILE="$OUT_DIR/land_legality_$TS.csv"

> "$OUTFILE"
echo "Pair,Type,Name,Standard,Pioneer,Modern,Legacy,Commander,Issue" > "$OUTFILE"

check_and_emit() {
  local pair=$1 type=$2 name=$3
  if [[ -z "$name" ]]; then
    echo "$pair,$type,,,N/A (no such cycle)" >> "$OUTFILE"
    return
  fi
  local resp
  resp=$(curl -s -H "User-Agent: ScrollVaultVerifier/1.0" --retry 2 --retry-delay 1 "https://api.scryfall.com/cards/named?exact=$name")
  if echo "$resp" | jq -e '.object == "card"' >/dev/null 2>&1; then
    std=$(echo "$resp" | jq -r '.legalities.standard // "?"')
    pio=$(echo "$resp" | jq -r '.legalities.pioneer // "?"')
    mod=$(echo "$resp" | jq -r '.legalities.modern // "?"')
    leg=$(echo "$resp" | jq -r '.legalities.legacy // "?"')
    cmd=$(echo "$resp" | jq -r '.legalities.commander // "?"')
    echo "$pair,$type,$name,$std,$pio,$mod,$leg,$cmd," >> "$OUTFILE"
  else
    echo "$pair,$type,$name,ERROR,ERROR,ERROR,ERROR,ERROR,CARD NOT FOUND" >> "$OUTFILE"
  fi
}

# WU
check_and_emit WU shock "Hallowed Fountain"
check_and_emit WU fetch "Flooded Strand"
check_and_emit WU original "Tundra"
check_and_emit WU fast "Seachrome Coast"
check_and_emit WU check "Glacial Fortress"
check_and_emit WU pain "Adarkar Wastes"
# WB
check_and_emit WB shock "Godless Shrine"
check_and_emit WB fetch "Marsh Flats"
check_and_emit WB original "Scrubland"
check_and_emit WB fast "Concealed Courtyard"
check_and_emit WB check "Isolated Chapel"
check_and_emit WB pain "Caves of Koilos"
# WR
check_and_emit WR shock "Sacred Foundry"
check_and_emit WR fetch "Arid Mesa"
check_and_emit WR original "Plateau"
check_and_emit WR fast "Inspiring Vantage"
check_and_emit WR check "Clifftop Retreat"
check_and_emit WR pain "Battlefield Forge"
# WG
check_and_emit WG shock "Temple Garden"
check_and_emit WG fetch "Windswept Heath"
check_and_emit WG original "Savannah"
check_and_emit WG fast "Botanical Sanctum"
check_and_emit WG check "Sunpetal Grove"
check_and_emit WG pain "Brushland"
# UB
check_and_emit UB shock "Watery Grave"
check_and_emit UB fetch "Polluted Delta"
check_and_emit UB original "Underground Sea"
check_and_emit UB fast "Darkslick Shores"
check_and_emit UB check "Drowned Catacomb"
check_and_emit UB pain "Underground River"
# UR
check_and_emit UR shock "Steam Vents"
check_and_emit UR fetch "Scalding Tarn"
check_and_emit UR original "Volcanic Island"
check_and_emit UR fast "Spirebluff Canal"
check_and_emit UR check "Sulfur Falls"
check_and_emit UR pain "Shivan Reef"
# UG
check_and_emit UG shock "Breeding Pool"
check_and_emit UG fetch "Misty Rainforest"
check_and_emit UG original "Tropical Island"
check_and_emit UG fast ""
check_and_emit UG check "Hinterland Harbor"
check_and_emit UG pain "Yavimaya Coast"
# BR
check_and_emit BR shock "Blood Crypt"
check_and_emit BR fetch "Bloodstained Mire"
check_and_emit BR original "Badlands"
check_and_emit BR fast "Blackcleave Cliffs"
check_and_emit BR check "Dragonskull Summit"
check_and_emit BR pain "Sulfurous Springs"
# BG
check_and_emit BG shock "Overgrown Tomb"
check_and_emit BG fetch "Verdant Catacombs"
check_and_emit BG original "Bayou"
check_and_emit BG fast "Blooming Marsh"
check_and_emit BG check "Woodland Cemetery"
check_and_emit BG pain "Llanowar Wastes"
# RG
check_and_emit RG shock "Stomping Ground"
check_and_emit RG fetch "Wooded Foothills"
check_and_emit RG original "Taiga"
check_and_emit RG fast "Copperline Gorge"
check_and_emit RG check "Rootbound Crag"
check_and_emit RG pain "Karplusan Forest"

echo "Verification complete: $OUTFILE"
