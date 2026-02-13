#!/usr/bin/env node
// fetch-set-data.js — Fetch card data from Scryfall for draft simulator
// Usage: node fetch-set-data.js <set_code>  (e.g., node fetch-set-data.js ecl)

const https = require('https');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'draft', 'data');
const RATE_LIMIT_MS = 120; // Scryfall asks for 50-100ms between requests

const RARITY_RATINGS = { mythic: 5.0, rare: 4.0, uncommon: 2.5, common: 1.5 };

function fetch(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'MoltsMTGDraftSim/1.0 (scrollvault.net)', 'Accept': 'application/json' }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function extractCard(card) {
  // Handle double-faced cards
  const faces = card.card_faces || null;
  const front = faces ? faces[0] : card;
  const imageUris = front.image_uris || card.image_uris || {};

  return {
    name: card.name,
    mana_cost: front.mana_cost || '',
    cmc: card.cmc || 0,
    type_line: card.type_line || front.type_line || '',
    oracle_text: front.oracle_text || '',
    colors: front.colors || card.colors || [],
    color_identity: card.color_identity || [],
    rarity: card.rarity,
    power: front.power || null,
    toughness: front.toughness || null,
    loyalty: front.loyalty || null,
    keywords: card.keywords || [],
    image_small: imageUris.small || '',
    image_normal: imageUris.normal || '',
    rating: RARITY_RATINGS[card.rarity] || 1.5,
    collector_number: card.collector_number,
    // For DFCs, include back face image
    back_image: faces && faces[1] ? (faces[1].image_uris || {}).small || '' : null
  };
}

async function fetchSetInfo(setCode) {
  console.log(`Fetching set info for '${setCode}'...`);
  const setData = await fetch(`https://api.scryfall.com/sets/${setCode}`);
  return {
    set_code: setData.code,
    set_name: setData.name,
    released_at: setData.released_at,
    icon_uri: setData.icon_svg_uri,
    set_type: setData.set_type
  };
}

async function fetchCards(setCode) {
  const cards = [];
  let url = `https://api.scryfall.com/cards/search?q=set%3A${setCode}+is%3Abooster&order=set`;
  let page = 1;

  while (url) {
    console.log(`  Fetching page ${page}...`);
    const data = await fetch(url);
    for (const card of data.data) {
      cards.push(extractCard(card));
    }
    console.log(`  Got ${data.data.length} cards (${cards.length} total)`);

    if (data.has_more && data.next_page) {
      url = data.next_page;
      page++;
      await sleep(RATE_LIMIT_MS);
    } else {
      url = null;
    }
  }

  return cards;
}

function categorizeByRarity(cards) {
  const result = { common: [], uncommon: [], rare: [], mythic: [] };
  for (const card of cards) {
    const bucket = result[card.rarity];
    if (bucket) bucket.push(card);
  }
  return result;
}

async function main() {
  const setCode = process.argv[2];
  if (!setCode) {
    console.error('Usage: node fetch-set-data.js <set_code>');
    console.error('Example: node fetch-set-data.js ecl');
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Fetch set metadata
  const setInfo = await fetchSetInfo(setCode);
  console.log(`Set: ${setInfo.set_name} (${setInfo.set_code}), released ${setInfo.released_at}`);

  // Fetch all booster cards
  const cards = await fetchCards(setCode);
  console.log(`Total booster cards: ${cards.length}`);

  // Categorize by rarity
  const byRarity = categorizeByRarity(cards);
  console.log(`  Commons: ${byRarity.common.length}`);
  console.log(`  Uncommons: ${byRarity.uncommon.length}`);
  console.log(`  Rares: ${byRarity.rare.length}`);
  console.log(`  Mythics: ${byRarity.mythic.length}`);

  // Determine pack size based on release date (Play Boosters from 2024+)
  const releaseYear = parseInt(setInfo.released_at.split('-')[0]);
  const packSize = releaseYear >= 2024 ? 14 : 15;

  // Write set data
  const output = {
    set_code: setInfo.set_code,
    set_name: setInfo.set_name,
    released_at: setInfo.released_at,
    icon_uri: setInfo.icon_uri,
    pack_size: packSize,
    card_count: cards.length,
    cards: byRarity
  };

  const outFile = path.join(OUTPUT_DIR, `${setCode}.json`);
  fs.writeFileSync(outFile, JSON.stringify(output));
  const sizeMB = (fs.statSync(outFile).size / 1024 / 1024).toFixed(2);
  console.log(`Written to ${outFile} (${sizeMB} MB)`);

  // Update sets manifest
  const manifestFile = path.join(OUTPUT_DIR, 'sets.json');
  let manifest = [];
  if (fs.existsSync(manifestFile)) {
    try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch (e) { manifest = []; }
  }

  // Remove existing entry for this set, add updated one
  manifest = manifest.filter(s => s.set_code !== setCode);
  manifest.push({
    set_code: setInfo.set_code,
    set_name: setInfo.set_name,
    released_at: setInfo.released_at,
    icon_uri: setInfo.icon_uri,
    card_count: cards.length,
    pack_size: packSize
  });

  // Sort by release date descending
  manifest.sort((a, b) => b.released_at.localeCompare(a.released_at));
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
  console.log(`Manifest updated (${manifest.length} sets)`);
  console.log('Done!');
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
