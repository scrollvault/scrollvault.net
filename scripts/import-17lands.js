#!/usr/bin/env node
/**
 * import-17lands.js — Import 17Lands GIH win-rate data into draft data files
 *
 * Fetches card ratings from 17Lands for each set in sets.json,
 * converts GIH WR (Game in Hand Win Rate) to a 0-5 rating scale,
 * and merges into existing draft data JSON files.
 *
 * Cards without 17Lands data keep their heuristic ratings.
 *
 * Usage: node scripts/import-17lands.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, '..', 'draft', 'data');
const SETS_FILE = path.join(DATA_DIR, 'sets.json');
const API_DELAY = 300; // ms between 17Lands requests

// Sets where 17Lands has data, and the best format to query
const FORMAT_MAP = {
    ecl: 'PremierDraft',
    fin: 'PremierDraft',
    tdm: 'PremierDraft',
    fdn: 'PremierDraft',
    mh3: 'PremierDraft',
    otj: 'PremierDraft',
    dsk: 'QuickDraft',
    mkm: 'PremierDraft',
    // These don't have data — skip
    // dft, blb, inr, acr, rvr, eoe
};

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; ScrollVault/1.0)',
                'Accept': 'application/json'
            }
        }, (res) => {
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

/**
 * Convert 17Lands GIH WR (0.45 - 0.65 typical range) to 0-5 rating scale
 *
 * Mapping:
 *   40% → 0.5 (unplayable)
 *   48% → 2.0 (filler)
 *   52% → 2.7 (average playable)
 *   55% → 3.5 (good)
 *   58% → 4.0 (great)
 *   60% → 4.5 (bomb)
 *   62%+ → 5.0 (format-defining)
 */
function gihWrToRating(wr) {
    if (wr === null || wr === undefined) return null;
    // Linear scale: rating = (wr - 0.40) * 20, clamped to [0.5, 5.0]
    const rating = (wr - 0.40) * 20;
    return Math.round(Math.max(0.5, Math.min(5.0, rating)) * 10) / 10;
}

async function main() {
    console.log('17Lands Data Import for ScrollVault Draft Simulator');
    console.log('===================================================\n');

    const sets = JSON.parse(fs.readFileSync(SETS_FILE, 'utf8'));
    let totalUpdated = 0;
    let totalSets = 0;

    for (const setInfo of sets) {
        const code = setInfo.set_code;
        const format = FORMAT_MAP[code];

        if (!format) {
            console.log(`${code.toUpperCase()} — No 17Lands data available, keeping heuristic ratings`);
            continue;
        }

        // Load existing set data
        const setFile = path.join(DATA_DIR, `${code}.json`);
        if (!fs.existsSync(setFile)) {
            console.log(`${code.toUpperCase()} — Set file not found, skipping`);
            continue;
        }

        const setData = JSON.parse(fs.readFileSync(setFile, 'utf8'));

        // Fetch 17Lands data
        const apiUrl = `https://www.17lands.com/card_ratings/data?expansion=${code.toUpperCase()}&format=${format}`;
        console.log(`${code.toUpperCase()} — Fetching from 17Lands (${format})...`);

        await sleep(API_DELAY);
        let landsData;
        try {
            landsData = await fetchJSON(apiUrl);
        } catch (e) {
            console.log(`  Error: ${e.message}, skipping`);
            continue;
        }

        // Build lookup by card name
        const wrLookup = {};
        let cardsWithData = 0;
        landsData.forEach(card => {
            if (card.ever_drawn_win_rate !== null && card.ever_drawn_win_rate !== undefined) {
                wrLookup[card.name] = {
                    gih_wr: card.ever_drawn_win_rate,
                    oh_wr: card.opening_hand_win_rate,
                    avg_taken: card.avg_seen,
                    game_count: card.ever_drawn_game_count || 0
                };
                cardsWithData++;
            }
        });

        console.log(`  ${cardsWithData} cards with GIH WR data`);

        if (cardsWithData === 0) {
            console.log(`  No usable data, skipping`);
            continue;
        }

        // Merge into set data
        let updated = 0;
        let kept = 0;

        for (const rarity of ['common', 'uncommon', 'rare', 'mythic']) {
            if (!setData.cards[rarity]) continue;
            setData.cards[rarity].forEach(card => {
                const lookup = wrLookup[card.name];
                if (lookup && lookup.game_count >= 100) {
                    // Enough games for statistical significance
                    const newRating = gihWrToRating(lookup.gih_wr);
                    if (newRating !== null) {
                        card.rating = newRating;
                        card.gih_wr = Math.round(lookup.gih_wr * 1000) / 10; // e.g. 55.2
                        updated++;
                    }
                } else if (lookup && lookup.game_count >= 20) {
                    // Some data, blend with heuristic
                    const dataRating = gihWrToRating(lookup.gih_wr);
                    if (dataRating !== null) {
                        card.rating = Math.round((card.rating * 0.3 + dataRating * 0.7) * 10) / 10;
                        card.gih_wr = Math.round(lookup.gih_wr * 1000) / 10;
                        updated++;
                    }
                } else {
                    kept++;
                }
            });
        }

        // Write updated set data
        fs.writeFileSync(setFile, JSON.stringify(setData));
        const fileSize = (fs.statSync(setFile).size / 1024).toFixed(0);
        console.log(`  Updated ${updated} cards, kept ${kept} heuristic ratings (${fileSize}KB)`);
        totalUpdated += updated;
        totalSets++;
    }

    console.log(`\nDone! Updated ${totalUpdated} card ratings across ${totalSets} sets.`);
    console.log('Ratings now use 17Lands GIH Win Rate where available.');
}

main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
