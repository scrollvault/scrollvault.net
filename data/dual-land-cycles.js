/**
 * Comprehensive MTG Dual Land Cycle Data
 * Covers Pioneer, Modern, Legacy, and Commander
 *
 * Color pair keys use WUBRG ordering:
 *   WU, WB, WR, WG, UB, UR, UG, BR, BG, RG
 *
 * Sources: Scryfall, MTG Wiki, official card databases
 * Generated: 2026-02-16
 */

const DUAL_LAND_CYCLES = {

  // =========================================================================
  // PIONEER-LEGAL CYCLES (also legal in Modern, Legacy, Commander)
  // =========================================================================

  shockLands: {
    name: 'Shock Lands',
    condition: 'Enters tapped unless you pay 2 life. Has basic land types (fetchable).',
    sets: 'Ravnica block, Return to Ravnica block, Guilds of Ravnica / Ravnica Allegiance',
    format: 'Pioneer+',
    complete: true,
    cards: {
      WU: 'Hallowed Fountain',
      WB: 'Godless Shrine',
      WR: 'Sacred Foundry',
      WG: 'Temple Garden',
      UB: 'Watery Grave',
      UR: 'Steam Vents',
      UG: 'Breeding Pool',
      BR: 'Blood Crypt',
      BG: 'Overgrown Tomb',
      RG: 'Stomping Ground'
    }
  },

  checkLands: {
    name: 'Check Lands',
    condition: 'Enters tapped unless you control a land with a matching basic land type.',
    sets: 'Magic 2010+ (allied), Innistrad / Dominaria (enemy)',
    format: 'Pioneer+',
    complete: true,
    cards: {
      WU: 'Glacial Fortress',
      WB: 'Isolated Chapel',
      WR: 'Clifftop Retreat',
      WG: 'Sunpetal Grove',
      UB: 'Drowned Catacomb',
      UR: 'Sulfur Falls',
      UG: 'Hinterland Harbor',
      BR: 'Dragonskull Summit',
      BG: 'Woodland Cemetery',
      RG: 'Rootbound Crag'
    }
  },

  pathwayLands: {
    name: 'Pathway Lands',
    condition: 'Modal double-faced card. Choose which side to play (enters untapped). Not a dual land once in play.',
    sets: 'Zendikar Rising (6), Kaldheim (4)',
    format: 'Pioneer+',
    complete: true,
    cards: {
      WU: 'Hengegate Pathway // Mistgate Pathway',
      WB: 'Brightclimb Pathway // Grimclimb Pathway',
      WR: 'Needleverge Pathway // Pillarverge Pathway',
      WG: 'Branchloft Pathway // Boulderloft Pathway',
      UB: 'Clearwater Pathway // Murkwater Pathway',
      UR: 'Riverglide Pathway // Lavaglide Pathway',
      UG: 'Barkchannel Pathway // Tidechannel Pathway',
      BR: 'Blightstep Pathway // Searstep Pathway',
      BG: 'Darkbore Pathway // Slitherbore Pathway',
      RG: 'Cragcrown Pathway // Timbercrown Pathway'
    }
  },

  revealLands: {
    name: 'Reveal Lands (Show Lands)',
    condition: 'Enters tapped unless you reveal a matching basic land type from your hand.',
    sets: 'Shadows over Innistrad (allied), Strixhaven (enemy)',
    format: 'Pioneer+',
    complete: true,
    cards: {
      WU: 'Port Town',
      WB: 'Shineshadow Snarl',
      WR: 'Furycalm Snarl',
      WG: 'Fortified Village',
      UB: 'Choked Estuary',
      UR: 'Frostboil Snarl',
      UG: 'Vineglimmer Snarl',
      BR: 'Foreboding Ruins',
      BG: 'Necroblossom Snarl',
      RG: 'Game Trail'
    }
  },

  slowLands: {
    name: 'Slow Lands',
    condition: 'Enters tapped unless you control two or more other lands.',
    sets: 'Innistrad: Midnight Hunt (allied), Innistrad: Crimson Vow (enemy)',
    format: 'Pioneer+',
    complete: true,
    cards: {
      WU: 'Deserted Beach',
      WB: 'Shattered Sanctum',
      WR: 'Sundown Pass',
      WG: 'Overgrown Farmland',
      UB: 'Shipwreck Marsh',
      UR: 'Stormcarved Coast',
      UG: 'Dreamroot Cascade',
      BR: 'Haunted Ridge',
      BG: 'Deathcap Glade',
      RG: 'Rockfall Vale'
    }
  },

  painLands: {
    name: 'Pain Lands',
    condition: 'Enters untapped. Taps for colorless free, or taps for a color and deals 1 damage to you.',
    sets: 'Ice Age (allied), Apocalypse (enemy), reprinted in many core sets and Dominaria United',
    format: 'Pioneer+',
    complete: true,
    cards: {
      WU: 'Adarkar Wastes',
      WB: 'Caves of Koilos',
      WR: 'Battlefield Forge',
      WG: 'Brushland',
      UB: 'Underground River',
      UR: 'Shivan Reef',
      UG: 'Yavimaya Coast',
      BR: 'Sulfurous Springs',
      BG: 'Llanowar Wastes',
      RG: 'Karplusan Forest'
    }
  },

  scryLands: {
    name: 'Scry Lands (Temples)',
    condition: 'Always enters tapped. Scry 1 when it enters.',
    sets: 'Theros block, M20, M21',
    format: 'Pioneer+',
    complete: true,
    cards: {
      WU: 'Temple of Enlightenment',
      WB: 'Temple of Silence',
      WR: 'Temple of Triumph',
      WG: 'Temple of Plenty',
      UB: 'Temple of Deceit',
      UR: 'Temple of Epiphany',
      UG: 'Temple of Mystery',
      BR: 'Temple of Malice',
      BG: 'Temple of Malady',
      RG: 'Temple of Abandon'
    }
  },

  surveilLands: {
    name: 'Surveil Lands',
    condition: 'Always enters tapped. Surveil 1 when it enters. Has basic land types (fetchable).',
    sets: 'Murders at Karlov Manor',
    format: 'Pioneer+',
    complete: true,
    cards: {
      WU: 'Meticulous Archive',       // Plains Island
      WB: 'Shadowy Backstreet',       // Plains Swamp
      WR: 'Elegant Parlor',           // Mountain Plains
      WG: 'Lush Portico',             // Forest Plains
      UB: 'Undercity Sewers',         // Island Swamp
      UR: 'Thundering Falls',         // Island Mountain
      UG: 'Hedge Maze',               // Forest Island
      BR: 'Raucous Theater',          // Swamp Mountain
      BG: 'Underground Mortuary',     // Swamp Forest
      RG: 'Commercial District'       // Mountain Forest
    }
  },

  creatureLandsRestless: {
    name: 'Restless Creature Lands',
    condition: 'Enters tapped. Taps for one of two colors. Can activate to become a creature until end of turn.',
    sets: 'Wilds of Eldraine (enemy), The Lost Caverns of Ixalan (allied)',
    format: 'Pioneer+',
    complete: true,
    cards: {
      WU: 'Restless Anchorage',
      WB: 'Restless Fortress',
      WR: 'Restless Bivouac',
      WG: 'Restless Prairie',
      UB: 'Restless Reef',
      UR: 'Restless Spire',
      UG: 'Restless Vinestalk',
      BR: 'Restless Vents',
      BG: 'Restless Cottage',
      RG: 'Restless Ridgeline'
    }
  },

  // =========================================================================
  // MODERN-LEGAL CYCLES (not Pioneer-legal, also legal in Legacy/Commander)
  // =========================================================================

  fetchLands: {
    name: 'Fetch Lands',
    condition: 'Pay 1 life, sacrifice: search for a land with one of two basic land types. Enters untapped.',
    sets: 'Onslaught (allied), Zendikar (enemy), reprinted in Khans of Tarkir, Modern Horizons 2, etc.',
    format: 'Modern+',
    complete: true,
    cards: {
      WU: 'Flooded Strand',           // Plains or Island
      WB: 'Marsh Flats',              // Plains or Swamp
      WR: 'Arid Mesa',                // Mountain or Plains
      WG: 'Windswept Heath',          // Forest or Plains
      UB: 'Polluted Delta',           // Island or Swamp
      UR: 'Scalding Tarn',            // Island or Mountain
      UG: 'Misty Rainforest',         // Forest or Island
      BR: 'Bloodstained Mire',        // Swamp or Mountain
      BG: 'Verdant Catacombs',        // Swamp or Forest
      RG: 'Wooded Foothills'          // Mountain or Forest
    }
  },

  fastLands: {
    name: 'Fast Lands',
    condition: 'Enters tapped unless you control two or fewer other lands.',
    sets: 'Scars of Mirrodin (allied), Kaladesh (enemy)',
    format: 'Modern+',
    complete: true,
    cards: {
      WU: 'Seachrome Coast',
      WB: 'Concealed Courtyard',
      WR: 'Inspiring Vantage',
      WG: 'Razorverge Thicket',
      UB: 'Darkslick Shores',
      UR: 'Spirebluff Canal',
      UG: 'Botanical Sanctum',
      BR: 'Blackcleave Cliffs',
      BG: 'Blooming Marsh',
      RG: 'Copperline Gorge'
    }
  },

  horizonLands: {
    name: 'Horizon Lands (Canopy Lands)',
    condition: 'Taps for one of two colors (deals 1 damage). Pay 1 life, tap, sacrifice: draw a card.',
    sets: 'Future Sight (Horizon Canopy), Modern Horizons (enemy cycle)',
    format: 'Modern+',
    complete: false,
    note: 'Only 6 cards exist. The original Horizon Canopy (GW) plus 5 enemy-colored from Modern Horizons. No allied cycle beyond GW.',
    cards: {
      WB: 'Silent Clearing',
      WG: 'Horizon Canopy',
      UR: 'Fiery Islet',
      UG: 'Waterlogged Grove',
      BR: null,
      BG: 'Nurturing Peatland',
      RG: null,
      WU: null,
      UB: null,
      WR: 'Sunbaked Canyon'
    }
  },

  filterLands: {
    name: 'Filter Lands',
    condition: 'Taps for colorless. Or pay {1} of either color to produce two mana in any combo of those colors.',
    sets: 'Shadowmoor (allied), Eventide (enemy)',
    format: 'Modern+',
    complete: true,
    cards: {
      WU: 'Mystic Gate',
      WB: 'Fetid Heath',
      WR: 'Rugged Prairie',
      WG: 'Wooded Bastion',
      UB: 'Sunken Ruins',
      UR: 'Cascade Bluffs',
      UG: 'Flooded Grove',
      BR: 'Graven Cairns',
      BG: 'Twilight Mire',
      RG: 'Fire-Lit Thicket'
    }
  },

  creatureLandsWorldwake: {
    name: 'Worldwake / BFZ Creature Lands',
    condition: 'Enters tapped. Taps for one of two colors. Can activate to become a creature.',
    sets: 'Worldwake (allied), Battle for Zendikar / Oath of the Gatewatch (enemy)',
    format: 'Modern+',
    complete: true,
    cards: {
      WU: 'Celestial Colonnade',
      WB: 'Shambling Vent',
      WR: 'Needle Spires',
      WG: 'Stirring Wildwood',
      UB: 'Creeping Tar Pit',
      UR: 'Wandering Fumarole',
      UG: 'Lumbering Falls',
      BR: 'Lavaclaw Reaches',
      BG: 'Hissing Quagmire',
      RG: 'Raging Ravine'
    }
  },

  battleLands: {
    name: 'Battle Lands (Tango Lands)',
    condition: 'Enters tapped unless you control two or more basic lands. Has basic land types (fetchable).',
    sets: 'Battle for Zendikar (allied only)',
    format: 'Modern+',
    complete: false,
    note: 'Only 5 allied-color lands exist. Enemy cycle has not been completed in Standard-legal sets.',
    cards: {
      WU: 'Prairie Stream',
      WB: null,
      WR: null,
      WG: 'Canopy Vista',
      UB: 'Sunken Hollow',
      UR: null,
      UG: null,
      BR: 'Smoldering Marsh',
      BG: null,
      RG: 'Cinder Glade'
    }
  },

  // =========================================================================
  // LEGACY-ONLY CYCLES (not Modern-legal)
  // =========================================================================

  originalDualLands: {
    name: 'Original Dual Lands (ABUR Duals)',
    condition: 'Enters untapped. No drawback. Has two basic land types (fetchable). On the Reserved List.',
    sets: 'Alpha, Beta, Unlimited, Revised',
    format: 'Legacy/Vintage/Commander only',
    complete: true,
    cards: {
      WU: 'Tundra',
      WB: 'Scrubland',
      WR: 'Plateau',
      WG: 'Savannah',
      UB: 'Underground Sea',
      UR: 'Volcanic Island',
      UG: 'Tropical Island',
      BR: 'Badlands',
      BG: 'Bayou',
      RG: 'Taiga'
    }
  },

  // =========================================================================
  // COMMANDER STAPLES (not format-restricted but designed for multiplayer)
  // =========================================================================

  bondLands: {
    name: 'Bond Lands (Battlebond Lands / Crowd Lands)',
    condition: 'Enters tapped unless you have two or more opponents. Excellent in Commander, useless in 1v1.',
    sets: 'Battlebond (allied), Commander Legends (enemy)',
    format: 'Legacy/Commander (not Modern or Pioneer legal)',
    complete: true,
    cards: {
      WU: 'Sea of Clouds',
      WB: 'Vault of Champions',
      WR: 'Spectator Seating',
      WG: 'Bountiful Promenade',
      UB: 'Morphic Pool',
      UR: 'Training Center',
      UG: 'Rejuvenating Springs',
      BR: 'Luxury Suite',
      BG: 'Undergrowth Stadium',
      RG: 'Spire Garden'
    }
  },

  commanderUtilityLands: {
    name: 'Commander Utility Lands',
    condition: 'Various. These produce any color or multiple colors with Commander-specific conditions.',
    sets: 'Various Commander products',
    format: 'Commander',
    complete: false,
    note: 'Key multicolor lands for Commander that are not part of a 10-card dual cycle.',
    cards: {
      WUBRG: 'Command Tower',          // Taps for any color in your commander identity
      WUBRG_2: 'Exotic Orchard',       // Taps for any color an opponent could produce
      WUBRG_3: 'Path of Ancestry',     // Taps for colors in commander identity, scry 1 on creature cast
      WUBRG_4: 'Arcane Signet',        // (Artifact, not land, but essential mana fixer)
    }
  },

  // =========================================================================
  // TRIOME LANDS (3-color, for Commander and other formats)
  // =========================================================================

  triomesIkoria: {
    name: 'Ikoria Triomes (Wedge Colors)',
    condition: 'Always enters tapped. Has three basic land types (fetchable). Cycling {3}.',
    sets: 'Ikoria: Lair of Behemoths',
    format: 'Pioneer+',
    complete: true,
    note: 'Covers all 5 wedge (enemy-pair-centered) color combinations.',
    cards: {
      WBG: { name: 'Indatha Triome',  types: 'Plains Swamp Forest' },
      URG: { name: 'Ketria Triome',   types: 'Forest Island Mountain' },
      WUR: { name: 'Raugrin Triome',  types: 'Island Mountain Plains' },
      RWB: { name: 'Savai Triome',    types: 'Mountain Plains Swamp' },
      BUG: { name: 'Zagoth Triome',   types: 'Swamp Forest Island' }
    }
  },

  triomesCapenna: {
    name: 'New Capenna Triomes (Shard Colors)',
    condition: 'Always enters tapped. Has three basic land types (fetchable). Cycling {3}.',
    sets: 'Streets of New Capenna',
    format: 'Pioneer+',
    complete: true,
    note: 'Covers all 5 shard (allied-pair-centered) color combinations.',
    cards: {
      WUB: { name: "Raffine's Tower",           types: 'Plains Island Swamp' },
      UBR: { name: "Xander's Lounge",           types: 'Island Swamp Mountain' },
      BRG: { name: "Ziatora's Proving Ground",  types: 'Swamp Mountain Forest' },
      RGW: { name: "Jetmir's Garden",           types: 'Mountain Forest Plains' },
      GWU: { name: "Spara's Headquarters",      types: 'Forest Plains Island' }
    }
  }
};

// =========================================================================
// HELPER: Color pair display names
// =========================================================================
const COLOR_PAIR_NAMES = {
  WU: { name: 'Azorius',   colors: 'White/Blue' },
  WB: { name: 'Orzhov',    colors: 'White/Black' },
  WR: { name: 'Boros',     colors: 'White/Red' },
  WG: { name: 'Selesnya',  colors: 'White/Green' },
  UB: { name: 'Dimir',     colors: 'Blue/Black' },
  UR: { name: 'Izzet',     colors: 'Blue/Red' },
  UG: { name: 'Simic',     colors: 'Blue/Green' },
  BR: { name: 'Rakdos',    colors: 'Black/Red' },
  BG: { name: 'Golgari',   colors: 'Black/Green' },
  RG: { name: 'Gruul',     colors: 'Red/Green' }
};

const THREE_COLOR_NAMES = {
  // Shards (allied)
  WUB: { name: 'Esper',    colors: 'White/Blue/Black' },
  UBR: { name: 'Grixis',   colors: 'Blue/Black/Red' },
  BRG: { name: 'Jund',     colors: 'Black/Red/Green' },
  RGW: { name: 'Naya',     colors: 'Red/Green/White' },
  GWU: { name: 'Bant',     colors: 'Green/White/Blue' },
  // Wedges (enemy)
  WBG: { name: 'Abzan',    colors: 'White/Black/Green' },
  URG: { name: 'Temur',    colors: 'Blue/Red/Green' },
  WUR: { name: 'Jeskai',   colors: 'White/Blue/Red' },
  RWB: { name: 'Mardu',    colors: 'Red/White/Black' },
  BUG: { name: 'Sultai',   colors: 'Black/Blue/Green' }
};

// =========================================================================
// FORMAT AVAILABILITY SUMMARY
// =========================================================================
const FORMAT_LAND_CYCLES = {
  pioneer: [
    'shockLands', 'checkLands', 'pathwayLands', 'revealLands',
    'slowLands', 'painLands', 'scryLands', 'surveilLands',
    'creatureLandsRestless', 'triomesIkoria', 'triomesCapenna'
  ],
  modern: [
    // All Pioneer cycles plus:
    'fetchLands', 'fastLands', 'horizonLands', 'filterLands',
    'creatureLandsWorldwake', 'battleLands'
  ],
  legacy: [
    // All Modern cycles plus:
    'originalDualLands'
  ],
  commander: [
    // All of the above plus:
    'bondLands', 'commanderUtilityLands'
  ]
};

// Export for Node.js / build systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DUAL_LAND_CYCLES,
    COLOR_PAIR_NAMES,
    THREE_COLOR_NAMES,
    FORMAT_LAND_CYCLES
  };
}
