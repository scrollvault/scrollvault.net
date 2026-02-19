#!/usr/bin/env node
/**
 * refresh-land-data.js — Queries Scryfall for current land cycle legalities
 * and Commander banlist, writes data/land-legality.json.
 *
 * Run: node scripts/refresh-land-data.js
 * No external dependencies (uses built-in https/fs).
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Cycle slug → one representative card name per cycle
const CYCLE_CARDS = {
  'original-duals':   'Tundra',
  'fetch-lands':      'Flooded Strand',
  'shock-lands':      'Hallowed Fountain',
  'fast-lands':       'Seachrome Coast',
  'check-lands':      'Glacial Fortress',
  'pain-lands':       'Adarkar Wastes',
  'slow-lands':       'Deserted Beach',
  'pathway-lands':    'Hengegate Pathway',
  'horizon-lands':    'Horizon Canopy',
  'filter-lands':     'Mystic Gate',
  'scry-lands':       'Temple of Enlightenment',
  'triomes':          'Savai Triome',
  'battle-lands':     'Prairie Stream',
  'reveal-lands':     'Port Town',
  'bounce-lands':     'Azorius Chancery',
  'creature-lands':   'Celestial Colonnade',
  'survey-lands':     'Meticulous Archive',
  'bond-lands':       'Sea of Clouds',
  'restless-lands':   'Restless Anchorage',
  'gain-lands':       'Tranquil Cove',
  'guildgates':       'Azorius Guildgate',
  'verge-lands':      'Floodfarm Verge',
  'haunt-lands':      'Abandoned Campground'
};

const FORMATS = ['standard', 'pioneer', 'modern', 'legacy', 'commander'];

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'ScrollVault/1.0 (scrollvault.net)', 'Accept': 'application/json' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchCycleLegalities() {
  const cycles = {};
  const slugs = Object.keys(CYCLE_CARDS);

  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    const cardName = CYCLE_CARDS[slug];
    const url = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`;

    process.stdout.write(`[${i + 1}/${slugs.length}] ${slug} (${cardName})... `);

    try {
      const card = await httpsGet(url);
      const legalities = {};
      for (const fmt of FORMATS) {
        legalities[fmt] = card.legalities[fmt] === 'legal';
      }
      cycles[slug] = legalities;
      console.log('OK');
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      // Default to false for all formats on failure
      const legalities = {};
      for (const fmt of FORMATS) legalities[fmt] = false;
      cycles[slug] = legalities;
    }

    // Respect Scryfall rate limit: 100ms between requests
    if (i < slugs.length - 1) await sleep(100);
  }

  return cycles;
}

async function fetchCommanderBanlist() {
  console.log('\nFetching Commander banlist...');
  const banned = [];
  let url = 'https://api.scryfall.com/cards/search?q=banned%3Acommander+-t%3Aconspiracy+-t%3Aante&unique=cards&order=name';

  while (url) {
    try {
      const result = await httpsGet(url);
      for (const card of result.data) {
        banned.push(card.name);
      }
      console.log(`  Fetched ${banned.length} banned cards so far...`);
      url = result.has_more ? result.next_page : null;
      if (url) await sleep(100);
    } catch (err) {
      console.log(`  Banlist fetch error: ${err.message}`);
      url = null;
    }
  }

  console.log(`Total banned cards: ${banned.length}`);
  return banned;
}

async function main() {
  console.log('=== ScrollVault Land Data Refresh ===\n');

  const cycles = await fetchCycleLegalities();
  const commanderBanned = await fetchCommanderBanlist();

  const output = {
    updated: new Date().toISOString().split('T')[0],
    cycles,
    commanderBanned
  };

  const outDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, 'land-legality.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nWritten to ${outPath}`);
  console.log(`Cycles: ${Object.keys(cycles).length}, Banned cards: ${commanderBanned.length}`);
  console.log(`Updated: ${output.updated}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
