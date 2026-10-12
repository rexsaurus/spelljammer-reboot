# Behavioral requirements from the guides (our words, with citations)

Sources we use only as behavioral references. No text from them is copied here.
- **SW-CH**: StrategyWiki, "Spelljammer: Pirates of Realmspace/Chosen hero" (sections named below)
- **SW-BK**: StrategyWiki, ".../Bloodthirsty killer"
- **SW-WT**: StrategyWiki, ".../Walkthrough" (overview)
- **MAN**: archive.org manual scan (ship-stat terms only so far)
- **SCRIBD**: the guide Rex shared on Scribd. It sits behind a login, so we haven't read it yet.

The decompiled code wins when it conflicts with a guide. Every conflict is logged in the last table.

| ID | Requirement | Source | Implemented in | Test |
|---|---|---|---|---|
| R1 | Play has three phases: trade for money, then gear up and capture a better ship, then the main quest | SW-WT | overall loop | — |
| R2 | The Waterdeep envoy appears at whatever port you dock at once the party is experienced (about level 7) | SW-CH "Eldacar's visit" | quest.onDock | W1–W2 |
| R3 | Later, a ship with Clive's messenger appears in normal travel. Close in and hail it (white flag) to get 1,000 gp and a summons to Clive's Den | SW-CH "Clive's intelligence" | quest.rollEncounter/hail, COMBAT NEGOT | W3–W4 |
| R4 | An audience with Clive at Clive's Den (Garden) marks the citadel under "other points of interest" | SW-CH "Clive's intelligence" | quest.clive, nav POIs | W5–W6 |
| R5 | The citadel has no weapons and ship weapons do nothing to it. Close in and board with the grapple | SW-CH "The Dwarven Citadel"; SF3 string confirms | combat opts.citadel | W7 |
| R6 | Citadel garrison: about six stacks of five skeletons, a similar number of zombie stacks, about six revenants, and one lich | SW-CH "The Dwarven Citadel" | quest.CITADEL_GARRISON | W8 |
| R7 | Only magic weapons or spells hurt revenants and the lich | SW-CH "The Dwarven Citadel" | boarding.NEEDS_MAGIC | W9 |
| R8 | Turn undead stops skeletons and zombies but not revenants or the lich | SW-CH "The Dwarven Citadel"; OTC strings | boarding.turnUndead | W10 |
| R9 | The citadel has two areas joined by a teleporter tile | SW-CH "The Dwarven Citadel" | **todo** (citadel map not identified yet; DNG*.OML candidates) | — |
| R10 | Winning gives the sceptre; Clive then marks a Neogi gathering | SW-CH "Spying on the Neogi" | quest.citadelBoarded/clive | W12–W14 |
| R11 | Hailing the gathering uses the sceptre automatically and sends you to a raid rendezvous; there the Neogi captain reveals the mothership without a fight | SW-CH "Spying on the Neogi" | quest.hail | W15–W16 |
| R12 | Final battles: four deathspiders (they start friendly), then a mindspider (about 100 hull), then the mothership (several hundred hull) | SW-CH "The final battle" | quest.CHAIN, combat holdFire | W17 |
| R13 | Weapons can target Weapons instead of Hull, which enables hit-and-run | SW-CH "The final battle" | combat target | game.test |
| R14 | Destroying the mothership plays the ending, pays about 10,000 gp, and play continues afterward | SW-CH "Ending" | quest.chainBattle/finishEnding, ending screen | W19–W20 |
| R15 | Shipyard hull prices: Galleon 50k, Squidship 45k, Greek warship 45k, Mindspider 35k, Tradesman 15k, Dragonfly 5k. You start in a galleon | SW-BK "Get a better ship" | hulls.js | crew.test |
| R16 | Some hulls can only be captured: Shou Lung trader, Hammership, Man-o-war, Nautiloid, Deathspider | SW-BK | boarding prize capture (partial) | — |
| R17 | Pubs offer about 12 "destroy ship X near Y" jobs that pay roughly 1,000–10,000 gp; one needs several kills | SW-BK "Text transcript" | **todo** (TAV "inquire about work"; job text loads at runtime from game files) | — |
| R18 | Temples heal the crew. Clive's Den has no temple, and the Mingabwe healer is limited | SW-BK "Get a better ship" | TPL heal (port differences todo) | — |
| R19 | Repairs cost less at Umberguard and more at Waterdeep. Hissta sells weapons only | SW-BK "Enhance your final ship" | **todo** (per-port price factors) | — |

## Discrepancies (code wins)
| Topic | Guide | Code / data | Resolution |
|---|---|---|---|
| "Flying pyramid" (Rex's memory) | — | No pyramid or necromancer anywhere in the game data. The undead/lich stronghold is the dwarven citadel | Treat as the citadel step (stages 3→4) |
| Hull names | The guide says the menus swap "Dragonfly" and "Greek warship" | ITM item names 205/206 as shipped | Keep the original labels |
| Main-quest stage numbering | Guide steps A–I | SF3 counter DS:6AF4 has values 0–9 | Our stages 0–9 are mapped to guide steps. Exact per-value semantics wait on decompiling 0x7204b/0x22323/0x67fc8 |
| Envoy trigger | "Level 7 appears sufficient" | Not yet located in SF3 | Level ≥ 7 until the code is read |
