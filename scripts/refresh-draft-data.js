#!/usr/bin/env node
/**
 * refresh-draft-data.js — Update draft data for new sets
 *
 * Queries Scryfall for recent draftable sets not already in sets.json,
 * fetches booster-legal cards, assigns base ratings, and writes
 * pre-cached JSON files for the draft and sealed simulators.
 *
 * Usage: node scripts/refresh-draft-data.js
 *
 * Run weekly via OpenClaw cron alongside refresh-land-data.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, '..', 'draft', 'data');
const SETS_FILE = path.join(DATA_DIR, 'sets.json');
const SCRYFALL_DELAY = 120; // ms between requests (Scryfall asks for 50-100ms)

// ── HTTP helper ──
function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        const get = url.startsWith('https') ? https.get : require('http').get;
        get(url, { headers: { 'User-Agent': 'ScrollVault-DraftRefresh/1.0' } }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                return fetchJSON(res.headers.location).then(resolve, reject);
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ── Rating assignment ──
function assignRating(card) {
    // Base rating by rarity
    const rarityBase = { mythic: 4.5, rare: 4.0, uncommon: 3.0, common: 2.0 };
    let rating = rarityBase[card.rarity] || 2.0;

    const tl = (card.type_line || '').toLowerCase();
    const oracle = (card.oracle_text || '').toLowerCase();

    // Creatures get a bump (limited is creature-centric)
    if (tl.includes('creature')) rating += 0.3;

    // Removal spells are premium
    if (oracle.includes('destroy target') || oracle.includes('exile target') ||
        oracle.match(/deals?\s+\d+\s+damage\s+to\s+(target|any)/)) {
        rating += 0.5;
    }

    // Evasion keywords
    if (oracle.includes('flying')) rating += 0.2;
    if (oracle.includes('menace')) rating += 0.15;
    if (oracle.includes('trample')) rating += 0.1;

    // Card draw
    if (oracle.includes('draw a card') || oracle.includes('draw two')) rating += 0.2;

    // Uncommon variance by type
    if (card.rarity === 'uncommon') {
        if (tl.includes('creature')) rating += 0.2;
        else if (tl.includes('enchantment') || tl.includes('artifact')) rating += 0.1;
    }

    // Common variance by CMC (cheap creatures slightly better in limited)
    if (card.rarity === 'common' && tl.includes('creature')) {
        const cmc = card.cmc || 0;
        if (cmc <= 3) rating += 0.2;
        else if (cmc >= 6) rating -= 0.2;
    }

    return Math.round(rating * 10) / 10; // 1 decimal
}

function getCardImage(card) {
    if (card.image_uris && card.image_uris.small) return card.image_uris.small;
    if (card.card_faces && card.card_faces[0] && card.card_faces[0].image_uris) {
        return card.card_faces[0].image_uris.small;
    }
    return '';
}

function getCardImageNormal(card) {
    if (card.image_uris && card.image_uris.normal) return card.image_uris.normal;
    if (card.card_faces && card.card_faces[0] && card.card_faces[0].image_uris) {
        return card.card_faces[0].image_uris.normal;
    }
    return '';
}

function getCardColors(card) {
    if (card.colors && card.colors.length) return card.colors;
    if (card.card_faces) {
        const merged = new Set();
        card.card_faces.forEach(f => (f.colors || []).forEach(c => merged.add(c)));
        if (merged.size) return [...merged];
    }
    return card.color_identity || [];
}

// ── Main ──
async function main() {
    console.log('Loading existing sets.json...');
    let existingSets = [];
    try {
        existingSets = JSON.parse(fs.readFileSync(SETS_FILE, 'utf8'));
    } catch (e) {
        console.log('No existing sets.json found, starting fresh.');
    }
    const existingCodes = new Set(existingSets.map(s => s.set_code));

    console.log('Fetching Scryfall set list...');
    const setsResp = await fetchJSON('https://api.scryfall.com/sets');
    const validTypes = new Set(['core', 'expansion', 'draft_innovation', 'masters']);

    const candidates = setsResp.data.filter(s =>
        validTypes.has(s.set_type) &&
        !s.digital &&
        s.card_count > 50 &&
        !existingCodes.has(s.code) &&
        new Date(s.released_at) <= new Date() // Only released sets
    ).sort((a, b) => new Date(b.released_at) - new Date(a.released_at));

    if (candidates.length === 0) {
        console.log('No new sets to add. All up to date!');
        return;
    }

    console.log(`Found ${candidates.length} new set(s): ${candidates.map(s => s.code).join(', ')}`);

    for (const set of candidates) {
        console.log(`\nProcessing ${set.name} (${set.code})...`);

        // Fetch all booster-legal cards
        let allCards = [];
        let url = `https://api.scryfall.com/cards/search?q=set:${set.code}+is:booster&order=set`;
        let page = 1;

        while (url) {
            console.log(`  Fetching page ${page}...`);
            await sleep(SCRYFALL_DELAY);
            try {
                const json = await fetchJSON(url);
                allCards = allCards.concat(json.data);
                if (json.has_more && json.next_page) {
                    url = json.next_page;
                    page++;
                } else {
                    url = null;
                }
            } catch (e) {
                console.error(`  Error fetching page ${page}: ${e.message}`);
                url = null;
            }
        }

        console.log(`  Got ${allCards.length} booster cards`);

        if (allCards.length < 50) {
            console.log(`  Skipping ${set.code} — too few cards`);
            continue;
        }

        // Filter basic lands
        const BASICS = new Set(['plains', 'island', 'swamp', 'mountain', 'forest',
            'snow-covered plains', 'snow-covered island', 'snow-covered swamp',
            'snow-covered mountain', 'snow-covered forest', 'wastes']);

        const nonBasic = allCards.filter(c => !BASICS.has(c.name.toLowerCase()));

        // Transform and categorize
        const cardsByRarity = { common: [], uncommon: [], rare: [], mythic: [] };

        nonBasic.forEach(raw => {
            const card = {
                name: raw.name,
                mana_cost: raw.mana_cost || '',
                cmc: raw.cmc || 0,
                type_line: raw.type_line || '',
                oracle_text: raw.oracle_text || '',
                colors: getCardColors(raw),
                rarity: raw.rarity,
                collector_number: raw.collector_number,
                power: raw.power || null,
                toughness: raw.toughness || null,
                loyalty: raw.loyalty || null,
                image_small: getCardImage(raw),
                image_normal: getCardImageNormal(raw),
                rating: 0
            };
            card.rating = assignRating(card);

            if (cardsByRarity[card.rarity]) {
                cardsByRarity[card.rarity].push(card);
            }
        });

        const setJson = {
            set_code: set.code,
            set_name: set.name,
            released_at: set.released_at,
            total_cards: nonBasic.length,
            cards: cardsByRarity
        };

        // Write set data file
        const outPath = path.join(DATA_DIR, `${set.code}.json`);
        fs.writeFileSync(outPath, JSON.stringify(setJson));
        console.log(`  Wrote ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(0)}KB)`);

        // Add to sets index
        existingSets.unshift({
            set_code: set.code,
            set_name: set.name,
            released_at: set.released_at,
            icon_uri: set.icon_svg_uri || '',
            card_count: nonBasic.length,
            pack_size: 14
        });
        existingCodes.add(set.code);
    }

    // Sort by release date (newest first)
    existingSets.sort((a, b) => new Date(b.released_at) - new Date(a.released_at));

    // Write updated sets.json
    fs.writeFileSync(SETS_FILE, JSON.stringify(existingSets, null, 2));
    console.log(`\nUpdated ${SETS_FILE} — ${existingSets.length} total sets`);
    console.log('Done!');
}

main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
