/* ══════════════════════════════════════════
   Monte Carlo Mana Base Simulation Worker
   ScrollVault — scrollvault.net
   ══════════════════════════════════════════
   Message Protocol:
   In:  { type:'simulate', deck:{size, spells:[], lands:[]}, params:{iterations, progressInterval} }
   Out: { type:'progress', iteration, total }
   Out: { type:'complete', results:{ perCard:[{name,mv,pips,castRate}], iterations, elapsed } }
*/

self.onmessage = function(e) {
    if (e.data.type === 'simulate') {
        var result = runSimulation(e.data.deck, e.data.params);
        self.postMessage({ type: 'complete', results: result });
    }
};

function runSimulation(deck, params) {
    var iterations = params.iterations || 50000;
    var progressInterval = params.progressInterval || 5000;
    var startTime = Date.now();

    // Build deck array: expand all cards by quantity
    var deckArray = [];
    var spellIndex = {}; // name -> index in tracking arrays
    var spellNames = [];
    var spellMVs = [];
    var spellPips = []; // [{W:n,U:n,...}]
    var spellHits = [];
    var spellTrials = [];
    var idx = 0;

    for (var s = 0; s < deck.spells.length; s++) {
        var spell = deck.spells[s];
        if (spellIndex[spell.name] === undefined) {
            spellIndex[spell.name] = idx;
            spellNames.push(spell.name);
            spellMVs.push(spell.mv);
            spellPips.push(spell.pips);
            spellHits.push(0);
            spellTrials.push(0);
            idx++;
        }
        for (var q = 0; q < spell.qty; q++) {
            deckArray.push({ type: 'spell', spellIdx: spellIndex[spell.name], mv: spell.mv });
        }
    }

    for (var l = 0; l < deck.lands.length; l++) {
        var land = deck.lands[l];
        for (var q = 0; q < land.qty; q++) {
            deckArray.push({ type: 'land', produces: land.produces });
        }
    }

    var deckLen = deckArray.length;
    if (deckLen < 7) {
        return { perCard: [], iterations: 0, elapsed: 0 };
    }

    // Pre-compute which spells exist at each MV (1-7) for fast lookup
    var spellsByMV = {};
    for (var i = 0; i < spellNames.length; i++) {
        var mv = spellMVs[i];
        if (mv >= 1 && mv <= 7) {
            if (!spellsByMV[mv]) spellsByMV[mv] = [];
            spellsByMV[mv].push(i);
        }
    }

    // Main simulation loop
    for (var iter = 0; iter < iterations; iter++) {
        // Fisher-Yates shuffle
        shuffle(deckArray);

        // London Mulligan
        var handSize = londonMulligan(deckArray);

        // hand = deckArray[0..handSize-1], library starts at handSize
        var libraryIdx = handSize;

        // Track played lands (accumulate produces)
        var sourceCounts = { W: 0, U: 0, B: 0, R: 0, G: 0 };
        var totalLandsPlayed = 0;

        // Track which spells we've already checked castability for (one check per spell per game)
        var spellChecked = new Uint8Array(spellNames.length);

        // Simulate turns 1-7
        for (var turn = 1; turn <= 7; turn++) {
            // Draw a card on turn 2+
            if (turn >= 2 && libraryIdx < deckLen) {
                handSize++;
                libraryIdx++;
            }

            // Play a land: find best land in hand to play
            // Simple: play first unplayed land found in hand
            // We count ALL lands in hand as playable sources (simplification matching Karsten)
            // Actually: play one land per turn, but count all lands in hand as available sources
            // Correct approach: lands in hand up to turn count are "played"
            var landsInHand = 0;
            for (var h = 0; h < Math.min(handSize, libraryIdx); h++) {
                if (deckArray[h].type === 'land') {
                    landsInHand++;
                }
            }

            // Played lands = min(lands in hand, turn number)
            totalLandsPlayed = Math.min(landsInHand, turn);

            // Count color sources from the first totalLandsPlayed lands in hand
            sourceCounts.W = 0; sourceCounts.U = 0; sourceCounts.B = 0;
            sourceCounts.R = 0; sourceCounts.G = 0;
            var landsProcessed = 0;
            for (var h = 0; h < Math.min(handSize, libraryIdx); h++) {
                if (deckArray[h].type === 'land') {
                    var produces = deckArray[h].produces;
                    for (var p = 0; p < produces.length; p++) {
                        var col = produces[p];
                        if (sourceCounts[col] !== undefined) {
                            sourceCounts[col]++;
                        }
                    }
                    landsProcessed++;
                    if (landsProcessed >= totalLandsPlayed) break;
                }
            }

            // Check castability for each unique spell with MV == turn
            var spellsAtMV = spellsByMV[turn];
            if (spellsAtMV) {
                for (var si = 0; si < spellsAtMV.length; si++) {
                    var sIdx = spellsAtMV[si];
                    if (spellChecked[sIdx]) continue;
                    spellChecked[sIdx] = 1;
                    spellTrials[sIdx]++;

                    // Check: total lands >= MV AND sources[color] >= pips[color] for each color
                    var castable = totalLandsPlayed >= spellMVs[sIdx];
                    if (castable) {
                        var pips = spellPips[sIdx];
                        for (var col in pips) {
                            if (pips[col] > 0 && sourceCounts[col] < pips[col]) {
                                castable = false;
                                break;
                            }
                        }
                    }
                    if (castable) {
                        spellHits[sIdx]++;
                    }
                }
            }
        }

        // Report progress
        if ((iter + 1) % progressInterval === 0) {
            self.postMessage({ type: 'progress', iteration: iter + 1, total: iterations });
        }
    }

    // Build results
    var perCard = [];
    for (var i = 0; i < spellNames.length; i++) {
        perCard.push({
            name: spellNames[i],
            mv: spellMVs[i],
            pips: spellPips[i],
            castRate: spellTrials[i] > 0 ? spellHits[i] / spellTrials[i] : 0
        });
    }

    // Sort by MV ascending, then by name
    perCard.sort(function(a, b) {
        if (a.mv !== b.mv) return a.mv - b.mv;
        return a.name.localeCompare(b.name);
    });

    return {
        perCard: perCard,
        iterations: iterations,
        elapsed: Date.now() - startTime
    };
}

function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
        var j = (Math.random() * (i + 1)) | 0;
        var tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
}

function londonMulligan(deckArray) {
    // Try hands of 7, 6, 5, 4
    for (var handSize = 7; handSize >= 4; handSize--) {
        var landCount = 0;
        for (var i = 0; i < handSize; i++) {
            if (deckArray[i].type === 'land') landCount++;
        }

        var keep = false;
        if (handSize === 7) keep = (landCount >= 2 && landCount <= 5);
        else if (handSize === 6) keep = (landCount >= 2 && landCount <= 4);
        else if (handSize === 5) keep = (landCount >= 1 && landCount <= 3);
        else keep = true; // always keep at 4

        if (keep) {
            // Bottom strategy: put back highest-MV non-land cards
            if (handSize < 7) {
                var toBottom = 7 - handSize;
                bottomHighMVCards(deckArray, 7, toBottom);
            }
            return handSize;
        }

        // Mulligan: re-shuffle for next attempt
        shuffle(deckArray);
    }

    return 4;
}

function bottomHighMVCards(deckArray, handWindow, count) {
    // Among the first `handWindow` cards, identify `count` non-land cards with highest MV
    // and move them to the end of the hand window (bottom of library)
    var nonLands = [];
    for (var i = 0; i < handWindow; i++) {
        if (deckArray[i].type === 'spell') {
            nonLands.push({ idx: i, mv: deckArray[i].mv });
        }
    }

    // Sort by MV descending
    nonLands.sort(function(a, b) { return b.mv - a.mv; });

    // Take the highest-MV ones and swap them to the end of the hand window
    var toMove = Math.min(count, nonLands.length);
    var moveIndices = [];
    for (var i = 0; i < toMove; i++) {
        moveIndices.push(nonLands[i].idx);
    }

    // If we don't have enough non-lands, also bottom some lands
    if (toMove < count) {
        for (var i = 0; i < handWindow && toMove < count; i++) {
            if (deckArray[i].type === 'land' && moveIndices.indexOf(i) === -1) {
                moveIndices.push(i);
                toMove++;
            }
        }
    }

    // Move the selected cards to the end of the deck (bottom of library)
    // Sort indices descending so removal doesn't shift earlier indices
    moveIndices.sort(function(a, b) { return b - a; });
    var removed = [];
    for (var i = 0; i < moveIndices.length; i++) {
        removed.push(deckArray.splice(moveIndices[i], 1)[0]);
    }
    // Push to end of deck
    for (var i = 0; i < removed.length; i++) {
        deckArray.push(removed[i]);
    }
}
