#!/bin/bash
# Prepare a HeyGen video kit for a ScrollVault article
# Usage: ./heygen-generate.sh <post-slug>
#
# Produces a ready-to-use video kit for HeyGen Web Studio:
# 1. Loads post from posts.json, extracts + downloads card art from Scryfall
# 2. Calls videoscript agent to write a 30-60s script with scene breakdown
# 3. Normalizes output (enforces word limits, avatar alternation, sentence boundaries)
# 4. Outputs a video-kit text file with scene-by-scene instructions + card art paths
#
# The kit goes to: videos/<slug>/README.txt (with card art images alongside)
# You then open HeyGen Web Studio and build the video using the kit.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$BASE_DIR/data"
VIDEOS_DIR="$BASE_DIR/videos"
POSTS_FILE="$DATA_DIR/posts.json"
TRACKING_FILE="$DATA_DIR/heygen-posted.json"
ENV_FILE="/home/degenai/.openclaw/.env"
OPENCLAW_BIN="/usr/bin/openclaw"
LOG_DIR="$BASE_DIR/logs"

SLUG="${1:?Usage: heygen-generate.sh <post-slug>}"

# Each video gets its own directory with card art + instructions
KIT_DIR="$VIDEOS_DIR/$SLUG"
CARD_ART_DIR="$KIT_DIR/card-art"

mkdir -p "$CARD_ART_DIR" "$LOG_DIR" "$DATA_DIR/drafts"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_FILE="$LOG_DIR/heygen-${TIMESTAMP}.log"

log() {
    echo "[$(date '+%H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

export GOG_KEYRING_PASSWORD=moltbot

# ── STEP 1: Load post data & extract cards ──
log "=== HeyGen Video Kit: $SLUG ==="

POST_DATA=$(node -e "
const fs = require('fs');
const posts = JSON.parse(fs.readFileSync('$POSTS_FILE', 'utf8')).posts;
const post = posts.find(p => p.slug === '$SLUG');
if (!post) { console.error('Post not found: $SLUG'); process.exit(1); }

const seen = new Set();
const cards = (post._cards || []).filter(c => {
    if (!c || c.not_found || seen.has(c.name)) return false;
    if (!c.art_crop && !c.normal) return false;
    seen.add(c.name);
    return true;
});

console.log(JSON.stringify({
    title: post.title,
    slug: post.slug,
    category: post.category,
    excerpt: post.excerpt,
    body: post.body,
    cards: cards.map(c => ({ name: c.name, art_crop: c.art_crop, normal: c.normal }))
}));
" 2>/dev/null) || { log "ERROR: Failed to load post '$SLUG'"; exit 1; }

POST_TITLE=$(echo "$POST_DATA" | jq -r '.title')
CARD_COUNT=$(echo "$POST_DATA" | jq '.cards | length')
log "Post: $POST_TITLE ($CARD_COUNT unique cards with art)"

if [ "$CARD_COUNT" -eq 0 ]; then
    log "ERROR: No cards with art found — cannot generate video without card images"
    exit 1
fi

# ── STEP 2: Download card art from Scryfall ──
log "--- Downloading card art from Scryfall ---"

DOWNLOAD_RESULT=$(node -e "
const fs = require('fs');
const https = require('https');
const path = require('path');
const postData = JSON.parse(process.argv[1]);
const artDir = process.argv[2];

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, { headers: { 'User-Agent': 'ScrollVault/1.0' } }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                https.get(res.headers.location, { headers: { 'User-Agent': 'ScrollVault/1.0' } }, (res2) => {
                    if (res2.statusCode !== 200) { reject(new Error('Redirect HTTP ' + res2.statusCode)); return; }
                    res2.pipe(file);
                    file.on('finish', () => { file.close(); resolve(true); });
                }).on('error', reject);
                return;
            }
            if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); return; }
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(true); });
        }).on('error', reject);
    });
}

(async () => {
    const localFiles = {};
    for (const card of postData.cards) {
        const sourceUrl = card.normal || card.art_crop;
        if (!sourceUrl) continue;

        const safeName = card.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+\$/, '');
        const filename = safeName + '.jpg';
        const localPath = path.join(artDir, filename);

        if (!fs.existsSync(localPath) || fs.statSync(localPath).size < 1000) {
            try {
                await downloadFile(sourceUrl, localPath);
                const size = fs.statSync(localPath).size;
                if (size < 1000) {
                    console.error('WARNING: File too small for ' + card.name + ' — skipping');
                    continue;
                }
                console.error('Downloaded: ' + card.name + ' (' + size + ' bytes)');
            } catch (e) {
                console.error('FAILED: ' + card.name + ': ' + e.message);
                continue;
            }
        } else {
            console.error('Cached: ' + card.name);
        }

        localFiles[card.name] = filename;
    }
    console.log(JSON.stringify(localFiles));
})();
" "$POST_DATA" "$CARD_ART_DIR" 2>&1) || { log "ERROR: Card art download failed"; exit 1; }

LOCAL_FILES_MAP=$(echo "$DOWNLOAD_RESULT" | tail -1)
echo "$DOWNLOAD_RESULT" | head -n -1 | while read -r line; do log "  $line"; done

DOWNLOADED_COUNT=$(echo "$LOCAL_FILES_MAP" | jq 'length')
log "Downloaded: $DOWNLOADED_COUNT card art files to $CARD_ART_DIR"

if [ "$DOWNLOADED_COUNT" -eq 0 ]; then
    log "ERROR: No card art could be downloaded — aborting"
    exit 1
fi

# ── STEP 2b: Create 1080x1920 composite backgrounds ──
log "--- Creating video backgrounds (1080x1920) ---"
BG_DIR="$KIT_DIR/backgrounds"
mkdir -p "$BG_DIR"

BG_FILES_MAP=$(node -e "
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const fileMap = JSON.parse(process.argv[1]);
const cardDir = process.argv[2];
const bgDir = process.argv[3];
const bgFiles = {};
for (const [name, filename] of Object.entries(fileMap)) {
    const src = path.join(cardDir, filename);
    const bgName = filename.replace('.jpg', '-bg.jpg');
    const dest = path.join(bgDir, bgName);
    try {
        execSync('convert -size 1080x1920 xc:\"#0d0d1a\" \"' + src + '\" -resize 850x1185 -gravity Center -geometry +0-150 -composite \"' + dest + '\"');
        const size = fs.statSync(dest).size;
        console.error('Composite: ' + name + ' (' + size + ' bytes)');
        bgFiles[name] = bgName;
    } catch(e) {
        console.error('FAILED composite: ' + name + ': ' + e.message);
    }
}
console.log(JSON.stringify(bgFiles));
" "$LOCAL_FILES_MAP" "$CARD_ART_DIR" "$BG_DIR" 2>&1)

BG_MAP=$(echo "$BG_FILES_MAP" | tail -1)
echo "$BG_FILES_MAP" | head -n -1 | while read -r line; do log "  $line"; done

BG_COUNT=$(echo "$BG_MAP" | jq 'length')
log "Created: $BG_COUNT composite backgrounds"

if [ "$BG_COUNT" -eq 0 ]; then
    log "ERROR: No backgrounds could be created — aborting"
    exit 1
fi

# ── STEP 3: Generate video script via openclaw agent ──
log "--- Generating video script ---"

CARD_NAMES_FOR_AGENT=$(echo "$LOCAL_FILES_MAP" | jq -r 'keys[] | "- \(.)"')

SCRIPT_PROMPT="Write a video script for this Magic: The Gathering article. Return ONLY valid JSON.

IMPORTANT: You MUST use ONLY cards from the AVAILABLE CARDS list below. These are the ONLY card images we have. Do NOT reference any card not on this list. Do NOT invent card names.

AVAILABLE CARDS:
$CARD_NAMES_FOR_AGENT

ARTICLE DATA:
Title: $POST_TITLE
Category: $(echo "$POST_DATA" | jq -r '.category')
Excerpt: $(echo "$POST_DATA" | jq -r '.excerpt')

ARTICLE BODY:
$(echo "$POST_DATA" | jq -r '.body' | sed 's/<[^>]*>//g' | head -c 3000)"

SCRIPT_RESULT=$($OPENCLAW_BIN agent \
    --agent videoscript \
    --session-id "heygen-script-${SLUG}" \
    --thinking low \
    --timeout 180 \
    -m "$SCRIPT_PROMPT" 2>&1) || { log "ERROR: Videoscript agent failed"; exit 1; }

# Strip openclaw log noise
VIDEO_SCRIPT=$(echo "$SCRIPT_RESULT" | sed '/^\[.*\] Attempt [0-9]/d' | sed '/^[0-9]\{3\} Provider returned/d' | sed '/^{"error":/d')

# ── STEP 4: Parse + normalize the script ──
log "--- Normalizing video script ---"

VIDEO_JSON_RAW=$(node -e "
let raw = process.argv[1];

// Strip markdown code fences
raw = raw.replace(/\`\`\`json\s*/gi, '').replace(/\`\`\`\s*/g, '');

// Find the outermost JSON object
const start = raw.indexOf('{');
const end = raw.lastIndexOf('}');
if (start === -1 || end === -1) { console.error('No JSON object found'); process.exit(1); }
const jsonStr = raw.substring(start, end + 1);
const parsed = JSON.parse(jsonStr);

// Normalize: convert 'sections' to 'scenes' if model used wrong format
if (!parsed.scenes && parsed.sections) {
    parsed.scenes = parsed.sections.filter(s => s.card_visual || s.card_name).map(s => ({
        text: s.narration || s.text || '',
        card_name: s.card_visual || s.card_name || '',
        show_avatar: s.show_avatar !== undefined ? s.show_avatar : true,
        duration_estimate: s.duration_estimate || 10
    }));
    if (!parsed.hook) {
        const firstText = parsed.scenes[0]?.text || '';
        parsed.hook = firstText.split('.')[0].substring(0, 50);
    }
}

// Normalize scene fields
if (parsed.scenes) {
    parsed.scenes = parsed.scenes.map(s => ({
        text: s.text || s.narration || s.input_text || '',
        card_name: s.card_name || s.card_visual || '',
        show_avatar: s.show_avatar !== undefined ? s.show_avatar : true,
        duration_estimate: s.duration_estimate || 10
    }));
}

if (!parsed.scenes || parsed.scenes.length === 0) {
    console.error('No scenes found after normalization');
    process.exit(1);
}

// Truncate at sentence boundaries
function truncateAtSentence(text, maxWords) {
    const words = text.split(/\s+/);
    if (words.length <= maxWords) return text;
    const chunk = words.slice(0, maxWords).join(' ');
    const lastEnd = Math.max(chunk.lastIndexOf('. '), chunk.lastIndexOf('! '), chunk.lastIndexOf('? '));
    if (lastEnd > chunk.length * 0.4) return chunk.substring(0, lastEnd + 1).trim();
    const trimmed = chunk.replace(/[^.!?]*\$/, '').trim();
    if (trimmed.length > chunk.length * 0.4) return trimmed;
    return words.slice(0, maxWords).join(' ').replace(/[,;:\s]+\$/, '') + '.';
}

// Max 5 scenes
if (parsed.scenes.length > 5) parsed.scenes = parsed.scenes.slice(0, 5);

// Truncate each scene to ~35 words at sentence boundaries
parsed.scenes.forEach(s => { s.text = truncateAtSentence(s.text, 35); });

// Enforce 150 word max
let totalWords = parsed.scenes.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
while (totalWords > 150 && parsed.scenes.length > 3) {
    parsed.scenes.splice(parsed.scenes.length - 2, 1);
    totalWords = parsed.scenes.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
}
if (totalWords > 150) {
    const longest = parsed.scenes.reduce((a, b) => a.text.split(/\s+/).length > b.text.split(/\s+/).length ? a : b);
    longest.text = truncateAtSentence(longest.text, 25);
}

// Enforce show_avatar alternation
const hasFalse = parsed.scenes.some(s => s.show_avatar === false);
if (!hasFalse && parsed.scenes.length >= 3) {
    for (let i = 1; i < parsed.scenes.length - 1; i++) { parsed.scenes[i].show_avatar = false; }
} else if (!hasFalse && parsed.scenes.length === 2) {
    parsed.scenes[1].show_avatar = false;
}

// Rebuild script + durations
parsed.script = parsed.scenes.map(s => s.text).join(' ');
if (!parsed.hook) parsed.hook = parsed.scenes[0].text.split('.')[0].substring(0, 50);
parsed.scenes.forEach(s => {
    const wc = s.text.split(/\s+/).length;
    s.duration_estimate = Math.max(5, Math.round(wc / 2.5));
});
parsed.duration_estimate = parsed.scenes.reduce((sum, s) => sum + s.duration_estimate, 0);

console.error('Normalized: ' + parsed.scenes.length + ' scenes, ' + parsed.script.split(/\s+/).length + ' words, ~' + parsed.duration_estimate + 's');
parsed.scenes.forEach((s, i) => {
    console.error('  Scene ' + (i+1) + ': ' + s.text.split(/\s+/).length + 'w, avatar=' + s.show_avatar + ', card=\"' + s.card_name + '\"');
});

console.log(JSON.stringify(parsed));
" "$VIDEO_SCRIPT" 2>&1)

VIDEO_JSON=$(echo "$VIDEO_JSON_RAW" | tail -1)
echo "$VIDEO_JSON_RAW" | head -n -1 | while read -r line; do log "  $line"; done

echo "$VIDEO_JSON" | jq . > /dev/null 2>&1 || { log "ERROR: Could not parse video script JSON"; log "Raw output: $VIDEO_SCRIPT"; exit 1; }

SCENE_COUNT=$(echo "$VIDEO_JSON" | jq '.scenes | length')
TOTAL_WORDS=$(echo "$VIDEO_JSON" | jq -r '.script' | wc -w | tr -d ' ')
DURATION=$(echo "$VIDEO_JSON" | jq '.duration_estimate')
log "Script ready: $SCENE_COUNT scenes, $TOTAL_WORDS words, ~${DURATION}s"

# Save raw script JSON
echo "$VIDEO_JSON" | jq . > "$KIT_DIR/script.json"

# ── STEP 5: Build the video kit README ──
log "--- Building video kit ---"

# Resolve background filenames for each scene
KIT_README=$(node -e "
const script = JSON.parse(process.argv[1]);
const bgMap = JSON.parse(process.argv[2]);
const slug = process.argv[3];

const cardNames = Object.keys(bgMap);

function findBg(cardName) {
    let f = bgMap[cardName];
    if (f) return f;
    let key = cardNames.find(k => k.toLowerCase() === cardName.toLowerCase());
    if (key) return bgMap[key];
    key = cardNames.find(k =>
        k.toLowerCase().includes(cardName.toLowerCase()) ||
        cardName.toLowerCase().includes(k.toLowerCase())
    );
    if (key) return bgMap[key];
    return null;
}

let out = '';
out += '========================================\n';
out += 'HEYGEN WEB STUDIO KIT\n';
out += '========================================\n';
out += '\n';
out += script.scenes.length + ' scenes | ~' + script.duration_estimate + ' seconds | ' + script.script.split(/\s+/).length + ' words\n';
out += '\n';
out += 'SETUP\n';
out += '-----\n';
out += '1. Go to heygen.com -> Create Video -> Custom Avatar\n';
out += '2. Format: 9:16 (1080x1920) portrait\n';
out += '3. Speed: 1.1x\n';
out += '4. Captions: ON\n';
out += '\n';
out += 'AVATAR SETTINGS (avatar scenes only)\n';
out += '-----\n';
out += '- Style: circle\n';
out += '- Scale: 40%\n';
out += '- Position: center-bottom (offset x: 0.0, y: 0.30)\n';
out += '- Matting: ON\n';
out += '- On no-avatar scenes: REMOVE avatar entirely for full card view\n';
out += '\n';
out += 'BACKGROUND IMAGES\n';
out += '-----\n';
out += 'Full card faces on dark 1080x1920 canvas in backgrounds/ folder.\n';
out += '\n';

script.scenes.forEach((scene, i) => {
    const bgFile = findBg(scene.card_name) || (cardNames[i] ? bgMap[cardNames[i]] : bgMap[cardNames[0]]);
    const words = scene.text.split(/\s+/).length;

    out += '\n';
    out += '========================================\n';
    out += 'SCENE ' + (i + 1) + ' of ' + script.scenes.length + ' — ' + scene.card_name + '\n';
    out += '========================================\n';
    out += 'Background: backgrounds/' + bgFile + '\n';
    out += 'Avatar: ' + (scene.show_avatar ? 'YES — circle, center-bottom' : 'NONE — remove avatar, full card visible') + '\n';
    out += '~' + scene.duration_estimate + ' seconds\n';
    out += '\n';
    out += 'VOICE TEXT:\n';
    out += scene.text + '\n';
});

out += '\n\n';
out += '========================================\n';
out += 'FULL SCRIPT\n';
out += '========================================\n';
out += '\n';
out += script.script + '\n';

console.log(out);
" "$VIDEO_JSON" "$BG_MAP" "$SLUG" 2>/dev/null) || { log "ERROR: Failed to build video kit"; exit 1; }

echo "$KIT_README" > "$KIT_DIR/README.txt"

# ── STEP 6: Update tracking ──
log "--- Updating tracking ---"

node -e "
const fs = require('fs');
const f = '$TRACKING_FILE';
if (!fs.existsSync(f)) fs.writeFileSync(f, '{\"videos\":[]}');
const d = JSON.parse(fs.readFileSync(f, 'utf8'));
if (!d.videos.find(v => v.slug === '$SLUG')) {
    d.videos.push({
        slug: '$SLUG',
        date: '$(date +%Y-%m-%d)',
        kit_path: 'videos/$SLUG/',
        status: 'kit_ready'
    });
    fs.writeFileSync(f, JSON.stringify(d, null, 2));
}
" 2>/dev/null || log "WARNING: Failed to update tracking file"

log ""
log "=== VIDEO KIT READY ==="
log "Kit location: $KIT_DIR/"
log "Instructions: $KIT_DIR/README.txt"
log "Backgrounds:  $KIT_DIR/backgrounds/"
log "Card art:     $KIT_DIR/card-art/"
log "Script JSON:  $KIT_DIR/script.json"
log ""
log "Open HeyGen Web Studio, create a new 9:16 video, and follow README.txt scene by scene."
