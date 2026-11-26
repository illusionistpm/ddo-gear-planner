# What to slot next: how good are the suggestions, and what would be better

## Summary

Two premises, both from how people actually build: **total value per affix
is what matters** ("big numbers", not how evenly an affix's bonus types are
covered), and **every endgame build wears one minor artifact**. The
simulation scores builds by total value and makes each policy choose exactly
one artifact. (An earlier version of this note scored "share of bonus types
covered" instead and recommended scoring each type on its own. Under total
value that recommendation is worse than what's live, so it's gone.)

- **The suspicion is right.** From an empty level 28-34 build, Speed is in
  16-17% of each slot's top 20 suggestions (artifacts left out), **about 3.8×
  its share among all the candidates**. Concealment (15-19%, 3.5-4.4×) and
  Constitution (18-19%, about 2.5×) follow the same pattern. Speed comes from
  a level-8 Topaz that fits any Yellow, Green or Orange slot, or from a Blue
  Sapphire, and endgame items in every slot have those augment slots.
- **The objective is fine; the scorer just can't see augments.** The live
  scorer already adds up total value per affix: each affix is worth its weight
  in total, and a bonus type counts for its share of the affix. What's wrong is
  how it credits *sources*:
  1. **It doesn't know a need can go in an augment.** A Speed item gets full
     credit even though Speed will cost an augment slot almost anywhere, and
     an artifact's Yellow slot all but guarantees one.
  2. **It gives a candidate's augment slots no value.** Only its built-in
     affixes count.
  3. **Scarcity can only raise a weight** (×1 to ×2.2), never lower one.
  4. **Set bonuses barely count:** just a nudge when a set is the only source
     of an uncovered need.
  5. **It doesn't treat the artifact as a given.** It compares artifacts with
     ordinary items slot by slot. The Healer profile, following its top picks,
     ended up with no artifact at all.
- **What fixing that is worth, measured.** I simulated a player filling 12
  slots (all but weapon, offhand and quiver) of a level 28-34 build from the
  top suggestion, with one artifact, then filling every augment slot for the
  most total value. The table shows total value as a share of every tracked
  need at its best:

  | Profile | live | total value, augment-aware | same, planning for the artifact |
  |---|---|---|---|
  | Melee (Basic + Melee + Str) | 53.4% | 57.9% | 56.8% |
  | Ranged (Basic + Ranged + Dex) | 51.4% | 56.7% | 56.4% |
  | Fire caster | 52.9% | 57.0% | 57.0% |
  | Healer | 50.2% | 54.6% | 56.7% |
  | **average** | **52.0%** | **56.6%** | **56.7%** |

  Same objective as the live scorer, about +4.7 points. Planning for the
  artifact means counting an empty Blue + Green + Yellow artifact as already
  equipped until the real one is chosen. It doesn't add total value on
  average, but it's steadier (Healer +2.1), and it's what takes Speed out of
  the top 20: down to 1.1-1.5× its base rate, from 3.8×.
- **Augments do over a third of the work.** In the live scorer's finished
  builds, the items alone reach 33-38% total value and filling the augment
  slots brings that to 50-53%. The suggestions ignore augments entirely, and
  players fill them by hand.
- **An expert agrees, by his own measure.** Lominal's build guide ranks
  effects by tier. Scored by his tiers, the augment-aware scorer beats the
  live one on all six test profiles, by about 11 points (59.9% → 70.6%). His
  "is it augmentable" calls match the data on 100 of 100 effects. His "is it
  hard to find" calls match the planner's scarcity measure on only 49, but an
  item count matches 92. Details under "Checking against an expert".
- **Sun/Moon or sets is a real fork**, and the data makes it sharp. None of
  the 264 endgame items with a Sun or Moon slot belongs to a set. A Sun item
  can only go in Armor, Cloak, Helm, Goggles or Trinket, and a Moon item only
  in Bracers, Necklace, Boots, Belt or Gloves. So gems alone give at most 5
  Artifact and 5 Profane picks. A good set plus gems in the gem slots it leaves
  free covers more tracked Artifact bonus types (8-11). But sets take up the
  same slots, Artifact sets often sit in Moon slots, and set items are older
  (ML 29-31 against 33-34). An expert's guide (below) says gems usually win
  now, and that 2-3 Lunar gems are typically all a build wants. That trade-off
  is what a "guide me" step should settle.

## How the current scorer works

`getScore(item)` adds, for each of the item's tracked affixes:

```
improvement / bestValueForAffix * affixWeight * scarcity
```

- `bestValueForAffix` sums the best value of **every** bonus type of the affix,
  so each affix is worth `affixWeight` in total. Attributes count 4, tactical
  and spell DCs count 3, booleans count 0.5, and everything else counts 1.
- `scarcity` (`AffixAvailabilityService`) is ×2.2 for a need only one open
  slot can carry, ×1.9 for two, ×1.5 augment-only, ×1.35 for 3-4 slots, and ×1
  otherwise.

Rough numbers at level 28-34:

| A candidate carrying | its score from that | why |
|---|---|---|
| Speed (Enhancement 30) | **1.0** | only bonus type, so the whole point |
| Concealment (Enhancement 25) | **1.0** | only bonus type |
| Insight Dodge 7 (Goggles only) | 0.44 | 7 of ~35 Dodge, × 2.2 scarcity |
| Insight Doublestrike 8 (Belt, Ring) | 0.33 | 8 of ~46, × 1.9 |
| Insight Constitution 7 (Cloak, Necklace) | 1.48 | attribute weight 4, × 1.9 |

Under total value these per-affix shares are right: 30 Speed is all of
Speed, and 8 Insight Doublestrike is a small part of Doublestrike. What's
wrong is that the item gets that credit at all. The level-8 Topaz of Striding
covers Speed in almost any slot, and the build's artifact will almost
certainly have a Yellow slot for it. So an item's Speed adds almost nothing
that wasn't coming anyway, yet it scores three times an item with Insight
Doublestrike, which only Belts and Rings carry.

Two more gaps:

- **Augment slots score zero.** `Item.getActiveAffixes` adds a crafting slot
  only once something is selected in it, and a suggested candidate has nothing
  selected. A Lamordia-style item with Sun + Green + Colorless slots competes on
  its three built-in affixes alone, and so do Slaver's, Lost Purpose,
  Dinosaur Bone and the Ravenloft crafted items.
- **Set bonuses.** `_getTotalValueForAffixTestingItem` never includes them.
  Only `_getSetCoverageNudge` sees sets, and only when a set is the sole
  source of an uncovered need.

## What the game data says (level 28-34)

Each tracked bonus type falls into one of these groups. The full table comes
from `tools/build-stats/affix-sources.py`; these are representative rows.

| Class | Meaning | Examples |
|---|---|---|
| **Floating** | an augment at ¾ of best or more fits a slot colour that endgame items offer in all 13 slots | Speed (Yellow/Blue), Enhancement Sheltering & Healing Amp (Blue), Enhancement attributes (Colorless), Deadly Competence, Doublestrike Enhancement, Armor-Piercing Enhancement, Wizardry Enhancement (Yellow), Feather Falling, Deathblock, Immunity to Fear/Blindness, Heroic Inspiration |
| **Sun / Moon gem** | from a gem in one of 5 slots, or from a set | Artifact & Profane: Melee/Ranged Power, Doublestrike, Sheltering, Healing Amp, attributes, absorption |
| **Slot-bound** | 1-2 item slots, no augment | Insight Dodge (Goggles), Insight Constitution (Cloak, Necklace), Insight Doublestrike (Belt, Ring), Insight False Life (Gloves), Insight absorptions (Helm), Quality Doublestrike (Cloak, Goggles) |
| **Limited** | 3-4 item slots | Equipment Healing Amp, Quality Fortification, Insight Wizardry/Spellcraft/Spell Pen, Undying |
| **Set-only** | no item or augment carries it | Quality Melee Power, Artifact Fortification/False Life/saves, Exceptional Deadly/Accuracy |

Where augment slots exist on endgame items (count of items, by slot):

- Colorless, Blue, Yellow: every slot.
- Green: every slot except Weapon.
- Red, Purple, Orange: Weapon and Offhand only.
- Sun: Armor 83, Cloak 36, Helm 33, Goggles 19, Trinket 17 - nowhere else.
- Moon: Bracers 17, Necklace 16, Boots 15, Belt 14, Gloves 14 - nowhere else.

## Scorer v2 in the app (built 2026-11-25)

The suggestion drawer now scores candidates with
`EquippedService.getSuggestionScorer(slot)`
(`site/src/app/planner/suggestion-scorer.ts`):

- **Total value per affix, as before.** It works from the planner's own
  values (`valuesForAffixType`), so filigree, non-gear entries, compound
  affixes and ignored bonus types count as they do everywhere else.
- **Augment-aware.** The build's empty crafting slots are filled first, and a
  candidate's own empty crafting slots count for what they could add.
- **Set-granting crafting counts.** Lost Purpose, Slaver's set bonuses and set
  augments count for the set bonus the extra piece would unlock.
- **Planned artifact.** Until a minor artifact is equipped, one with Blue,
  Green and Yellow slots is assumed.
- **Utility effects count for a quarter.** Concealment, Immunity to Fear,
  Heroic Inspiration, Undying, Feather Falling and Incorporeality: builds
  seldom fill them, and Lominal leaves them out.
- The scarcity multiplier and set nudge of the old `getScore` are gone.
  `getScore` stays only as the harness's baseline.

Two things the prework found before this was trusted:

- **Set-granting crafting was being ignored.** The first harness version gave
  nothing for it, so Lost Purpose items like the Legendary University helms
  looked worthless. That was most of why the new scorer ranked players' own
  helms worse than the live one.
- **Set options crowded out real gains.** Colorless set augments are merged
  into the Yellow and other coloured lists. Ranking them ahead of real gains
  hid the Topaz of Striding. The scorer shortlists ordinary options by real
  gain and keeps set options apart.

**Results, on the real code path:**

| Check | Live | v2 |
|---|---|---|
| Saved builds, 1,316 slots: MRR / player's item in top 20 / average rank | 0.29 / 61% / 117 | **0.31 / 72% / 47** |
| Time per drawer (build scorer + score every candidate), average / worst | 129 ms / 1,928 ms | **92 ms / 932 ms** |
| Simulation, level 28-34, total value (4 profiles, average) | 51.9% | **57.7%** |
| Simulation, level 28-34, Lominal's tiers (Melee / Ranged / Healer) | 60 / 57 / 53% | **66 / 68 / 69%** |
| Simulation, level 15-20, total value | 45.3% | **47.8%** |
| Speed in the top 20 (share, against its base rate) | 16-17%, ~3.8× | **6-7%, 1.3-1.4×** |

By slot, it puts the player's item in the top 20 more often everywhere except
Helm (57% against 64%), where its average rank is still better (30 against
40). Weapons stay poor under both (24%), since they're chosen by type.

The ranking without utility weighting was 0.28 / 69% / 49. With it,
simulated total value drops a little (it counts Concealment fully), but
players' own choices favour it.

**Artifacts listed apart (built 2026-11-25).** The drawer now shows the best
three minor artifacts for the slot in their own section, with a line saying
a build wears one, in whichever slot suits it. The main list ranks only
ordinary items. The section is hidden while another slot holds an artifact
(the drawer already leaves those out) and while searching. For a melee
build's Trinket slot the main list now starts with Legendary Heartshard, the
Trinket most saved endgame builds wear.

**Follow-ups (built 2026-11-25):**

- **Max Filigree Slots now counts** in the score whenever the planner tracks
  it (Minor Artifact levels). Without it, Epic Voice of the Master (one
  filigree slot, Heroic Inspiration, Good Luck, Speed) ranked second among
  Trinket artifacts. It's a fine level-20 item that no capped build wears.
  The Trinket artifacts are now The Hydra's Heart, Demogorgon's Reign and
  Perfected Bloodstone.
- **Suggestions show their crafting filled in.** The scorer reports the
  options it counted for each empty crafting slot, and the drawer shows and
  equips the item with those selected. A Dinosaur Bone Belt shows Claw: MRR,
  Fang: Deception, Scale: Constitution and so on, not seven "Empty" rows. A
  note above the list says these are suggestions.
- **"Show N more artifacts"** after the first three. The main list pages 20
  at a time with master's "Show 20 more", and artifacts are kept out of it.

**Weapons (built 2026-11-26).** On an empty build with levels 1-34, the
Weapon and Offhand suggestions were all Legendary Alchemical (ML29), every
weapon type tied at 3.10 for a melee profile. The best ML34 weapon
(Legendary Calamitous) scored 2.06, and the first weapon of ML32 or more ranked
22nd. Two causes:

- **The scorer broke the item's crafting rules.** A Legendary Alchemical item
  lists Green, Orange and Purple augment slots, but each is opened by one Tier
  3 option, and Tier 3 must take Tier 1's or Tier 2's element. The UI applied
  both rules and the scorer applied neither, so every Alchemical item scored
  for three augment slots it can't have, and casters got a Fire / Earth /
  Water spread no one can craft. `CraftingRules` now applies both, in the
  scorer and in the harness's `fillCrafting`. Alchemical drops to 2.06. The
  harness's other slots score the same before and after (melee / ranged /
  fire / healer: 56.8 / 55.2 / 57.1 / 58.2%; the drift from the 57.7% above
  is the game data's).
- **No affix carries a weapon's [W].** It's most of what separates an
  endgame weapon from an older one (Long Swords: 4.8 at ML29, 5.8-6.3 at
  ML34), so a weapon scored only as a stat stick. `items.json` now has each
  weapon's `damage` (W and dice) and, where it isn't its type's, its
  `critical` profile. Item descriptions show both. For a build that tracks
  Melee or Ranged Power, Doublestrike or Doubleshot, the scorer adds
  `weaponDiceCredit`. It takes one [W] at a 1d8+2's 6.5 average, that damage
  as 2 attribute points per point of damage, at Strength's weight: about 0.8
  per [W]. The die is fixed, not the weapon's own, so a falchion doesn't
  always beat a rapier. Weapon type is the build's choice.

With both, a melee build's weapon list starts Legendary Thirteen (ML31, seven
augment slots), Legendary Mirage (ML30, Seeker, Deception, a set), then The
Bloody End and Legendary Calamitous (ML34). Alchemical is about 10th. Casters'
weapons are unchanged by the [W] credit, and the ML29 Cauldron staves (142
Fire Spell Power plus 71 Insight) still rank near the top on their stats.

The [W] weight is derived, not fitted. The harness skips weapons, and the
saved builds (the leave-one-out check) haven't been re-run for this. Their
weapon ranks (top 20 in 24%) are the measure to check it against.

**Not built yet:**

- (Since built.) **Crafting pickers in the drawer.** Each suggestion's crafting
  slots use the planner's crafting option picker, with the suggested pick
  selected. The picker builds its list only when opened, and the drawer opens
  as fast as the read-only version did (about 350-460 ms against 310-430 ms in
  development mode). Changes edit the drawer's copy of the item, which Equip
  then equips. They never touch the gear database's shared item.
- **A build-wide "your artifact" view** across slots. Scoring
every slot costs about 90 ms each, so it would need to run in the background
rather than when a drawer opens. The tracked Max Filigree Slots row already
lists every artifact, so this probably fits best as a step in the build-goals
setup ("pick your artifact").

## The minor artifact

There are 91 minor artifacts at level 28-34, in every slot but Weapon,
Offhand and Armor (Rings 18, Necklace 14, Bracers 11, Boots 10, Trinket 9,
Goggles 8, Gloves 8, Helm 7, Belt 5, Cloak 1). 80 of them carry Blue + Green
+ Yellow augment slots. Since one is a given, that changes the calculation in
three ways:

- **It's a build-wide choice, like the weapon.** The question is never "this
  artifact or that ordinary item for my Ring", but "which artifact, and so
  which slot". The simulation picks it by the gain of swapping each artifact
  into its slot of a draft build, then refills the other slots around it.
  Rings won most often, then Goggles and Necklaces (The Autumn Equinox, Sigil
  of the Triumvirate, Syne, Legendary Agony's Eyes, Breath of Vitality).
- **It's guaranteed augment capacity.** A Blue, a Green and a Yellow slot are
  coming whatever else the player picks, so any need one of those can carry at
  its best (Speed, Enhancement Sheltering, Healing Amp, Deadly, Doublestrike,
  Feather Falling...) is close to free from the start. Counting a planned
  artifact makes the scorer see that before the artifact is chosen.
- **Suggestions should list artifacts separately.** Ranked together with
  ordinary items, three-slot artifacts take a large share of every slot's
  top 20, although only one can be worn. A separate "your artifact" list
  across all slots (with the slot each would take), plus each slot's ordinary
  items ranked among themselves, is both more honest and more useful.

## Artifact and Profane: gems or sets?

**Read this table as an upper bound for sets.** It counts tracked
Artifact/Profane bonus types, not their value, and it ignores what the set's
slots could otherwise hold. The expert check below suggests gems usually
win: Lominal writes that since Solar gems arrived, "item sets have been a lot
less relevant". He also says Lunar gems are "almost always more efficient, as
you typically only need 2-3, and want at most 4". A total-value ranking of the
gems reproduces that (see "Checking against an expert").

These are tracked Artifact/Profane bonus types covered by the best options, for
the four test profiles (`tools/build-stats/artifact-profane-strategies.py`).
The count is set bonuses plus gems in the gem slots the set doesn't occupy,
with set pieces placed in non-gem slots first.

| Profile | Artifact: gems only | best Artifact set + gems | Profane: gems only | best Profane set + gems |
|---|---|---|---|---|
| Melee | 5 of 19 possible | Saltmarsh Explorer 5pc: 6 + 5 = 11; Guardian of the Gates 3pc: 6 + 3 = 9; Vulkoor's Might 2pc: 4 + 5 = 9 | 5 of 8 | Dread Isle's Curse 5pc: 6 + 2 = 8; Might of the Abishai: 5 + 3 = 8 |
| Ranged | 5 of 19 | Saltmarsh 11; Guardian 9; Vulkoor's Might 9 | 5 of 8 | Dread Isle's Curse 8 |
| Fire caster | 5 of 19 | Saltmarsh 11; Guardian 9; Desert's Burning Sun 2pc: 3 + 5 = 8 | 5 of 8 | Might of the Abishai: 6 + 2 = 8 |
| Healer | 5 of 19 | Saltmarsh 11; Guardian 9; Menechtarun Scavenger 2pc: 3 + 5 = 8 | 5 of 8 | Might of the Abishai: 5 + 3 = 8 |

Three things the table leaves out, and the reason the answer has to be worked
out per build rather than written as a rule:

- **The two choices share slots.** Saltmarsh's 5 pieces go outside the Sun
  slots, which mostly means Moon slots and Rings. Vulkoor's Might sits on
  Bracers and Gloves, both Moon slots. Every Profane set needs 3-5 of the Moon
  slots.
- **Item quality.** Gem items are ML 33-34 and carry Colorless + Green slots.
  Most set items are ML 29-31.
- **Values.** Set Artifact values mostly equal the gem's (Melee Power 15,
  Sheltering 30), but some sets give less (Potency 15 against 25).

## Checking against an expert

Lominal's build guide ("Gearing at cap", Lominal's Endgame Builds) gives, for
melee DPS, ranged DPS and healers, the effects worth chasing in three tiers
(critical, strong, filler). It colours each one by whether it's hard to find
and whether it can be augmented. I transcribed it into
`tools/build-stats/lominal-priorities.json`, mapping each effect onto the
planner's affix and bonus type, and checked it against the data and the
simulation.

**His rule for judging an item is the scorer's job description.** He writes:
"How hard is it to find the stats from this item on other items, and how
flexible is the item in what stats it can have? ... How many good stats does
it give?" Augment-awareness answers the first question, augment slots the
second, and total value the third.

**Augmentable: the data agrees with him on all 100 mapped entries.** Effects
he marks as augmentable have an augment at 7/10 of their best value or more,
and the others don't. (`tools/build-stats/expert-check.py`.)

**Hard to find: the planner measures it the wrong way.** The planner's
scarcity (`AffixAvailabilityService`) counts *slots* that can carry an
effect. That agrees with his "rare" calls on only 49 of 100 entries. Counting
*items* instead (25 or fewer endgame items carrying it at 7/10 of best, or
3 or fewer slots) agrees on 92.

- Insightful Doublestrike, for example, is on 17 items, spread over 10 slots.
  The planner calls it common; he calls it rare, and the item count agrees
  with him.
- The thresholds are fitted to about 55 distinct effects, so take the exact
  numbers loosely. The direction is clear, though.
- The 8 mismatches left are mostly borderline. Fortification bypass is on 45
  items but he calls it rare. Insightful Sheltering is on 51-55 items, many of
  them older content. Doubleshot is on 18 items, which he calls common.

**Lunar gems: total value reproduces his advice, but only without the ×4
attribute weight.** Ranked by the share of each affix's total a gem gives,
the melee Lunar gems come out:

- Profane Melee Power 0.24
- Physical Sheltering 0.23
- Magical Sheltering 0.20
- then a drop: Deadly 0.12, Strength 0.11, Constitution 0.10

That's "2-3, at most 4". Healers show the same shape: Physical and Magical
Sheltering on top, then a drop. With the live scorer's weights, attributes
count four times, and Lunar Strength and Constitution (+4) jump to the top
(0.41-0.42), which he clearly wouldn't do. Solar gems for melee rank
Elemental Absorption first (four absorbs in one gem, and he lists absorbs as
critical and rare), then Fortification Bypass, Doublestrike, Melee Power and
the two Sheltering gems.

**He thinks in targets for some effects.** Melee builds want about 310%
Fortification against the newest content, and ranged builds about 220%. The
Fortification types' best values add up to about 308 (Enhancement 162,
Insight 81, Quality 40, Artifact 25). So melee needs every type, and ranged
needs only Enhancement and Insight, which matches his tiers: Quality
Fortification is critical for melee and filler for ranged. Value past a
target is worth nothing. Per-affix targets would be a natural refinement of
total value. One caution: his numbers include non-gear sources the planner
doesn't map (enhancements, epic destinies, feats), so the gear share of a
target like 310% is smaller than it looks. The same goes for any other value
he quotes. A target in the planner has to count the build's non-gear entries,
or be set lower to cover gear only.

**Trance covers Insight Deadly, and sometimes Accuracy and tactics.** He
leaves those types out because every DPS build carries a trance, which gives
more than gear. Every trance gives the damage bonus (Insight Deadly), but
only some give Accuracy and tactics DCs. The planner's Melee and Ranged
bundles already add a Trance non-gear entry for Insight Deadly. The rest
depends on which trance the build uses, so build setup should ask (see
Guide me).

**Under his priorities, in the simulation:** the harness scores finished builds against
his tiers too: each listed bonus type's share of its best value, times 3, 2
or 1 for its tier. An effect named without a type counts its main type, and,
as an assumption, its Artifact and Profane types too. Six profiles: the three
bundle profiles, and three that track exactly his lists. In each, a player
fills a level 28-34 build with one artifact.

| Profile | live | augment-aware, planned artifact | same, flat weights | flat weights + item-count scarcity |
|---|---|---|---|---|
| Melee (bundles) | 59.3% | 64.8% | 61.2% | 69.1% |
| Ranged (bundles) | 57.7% | 70.8% | 66.0% | 69.4% |
| Healer (bundles) | 52.4% | 67.8% | 67.7% | 68.1% |
| Lominal melee | 61.4% | 67.6% | 69.5% | 68.2% |
| Lominal ranged | 61.5% | 74.2% | 71.3% | 70.3% |
| Lominal healer | 67.0% | 78.3% | 82.0% | 81.9% |
| **average** | **59.9%** | **70.6%** | **69.6%** | **71.2%** |

None of these scorers knows his tiers, and augment-awareness still raises
his score by about 11 points on every profile. That is the strongest evidence
here that v2 is right. The other two changes are second-order in the
simulation:

- **Flat weights** come out about a point worse on average and win on half
  the profiles. Where the ×4 attribute weight demonstrably goes wrong is
  choosing Lunar gems (above).
- **Item-count scarcity** adds about a point on average.

Both are worth keeping for the reasons above, but neither is proven by this.

## Proposals

### 1. Scorer v2 (measured above; ready to build)

Keep the live scorer's objective (total value per affix, times the affix
weight) and change how it credits sources:

- **Augment-aware.** Fill the build's own empty augment slots first (greedily,
  for total value), then score a candidate by what it adds on top. A need the
  build can already cover in an open augment slot stops counting for a
  candidate that carries it natively. Credit a candidate's own empty augment
  slots with what they would add.
- **Plan for the artifact.** Until one is equipped, count an empty Blue +
  Green + Yellow artifact as already worn. Score artifact candidates without
  that stand-in, since one would replace it.
- **Artifacts in their own list,** ranked across slots by what swapping them in
  gains, as described above.
- **Set bonuses.** Credit the marginal value of the tier a piece unlocks,
  scaled by whether the set can still reach its threshold
  (`isSetReachable` already exists). Not in the simulation yet.
- **Rethink the ×4 attribute weight.** Total value already counts an
  attribute by its share of the attribute's total. With ×4 on top, a +4
  Profane Strength gem outranks Profane Melee Power, which contradicts expert
  advice (see "Checking against an expert"). The simulation runs a flat-weight
  variant.
- **Measure scarcity by items, not slots.** Count the endgame items carrying a
  need near its best value, as described in "Checking against an expert".
  This feeds the score and the scarcity view alike.
- **Role presets with tiers.** A "Melee DPS" bundle could carry an expert's
  tiers (critical / strong / filler) as per-type weights, not just a list of
  affixes to track. That also says which bonus types to leave alone: Insight
  Deadly comes from trance.

Tried and not worth it under total value: a hand-tuned discount for
"floating" needs (×0.35) and half credit for a candidate's augment slots.
Each moved the average by under a point, and both brought Concealment's
inflation back. Augment-awareness plus the planned artifact does the
discount's job from the data.

The harness (`site/src/app/suggestion-eval/`) runs every variant, so the
remaining choices (affix weights, the normaliser) can be tuned against the
simulation and, once the export is run, against what players actually chose.

### 2. "Fill this slot next"

The scarcity view groups needs by how few slots remain. Turning that around
answers "what next": for each open slot, list the needs it is one of the last
sources of. For example, "Goggles: the only source of Insight Dodge; one of two
for Quality Doublestrike." Rank the open slots by that and badge the top one on
the equipment grid. Everything it needs is already in
`AffixAvailabilityService.getRemainingAvailability`; this is a regrouping, not
new analysis.

### 3. Say how a need can be filled, in the scarcity view

Use the expert's four colours, which the data reproduces on 92 of 100
effects with an item count: easy and not an augment; easy and augmentable;
rare; rare but augmentable. Lead with **floating** needs: "Speed
- any Yellow, Green or Orange slot (Topaz of Striding)". That tells people
directly not to spend an item slot on it. For a Sun/Moon need, say "one of
your 5 Sun gems, or a set".

### 4. "Fill my augments"

Augments carry over a third of a finished build's total value (33-38% from
items alone, 50-53% once augments are filled). The harness's greedy
augment fill (`fillCrafting` in `build-model.ts`) is already a one-click
feature: for every empty augment slot on equipped gear,
pick the gem that adds the most total value. Today players do this
by hand, slot by slot. Add it as a button that proposes a set of gems to accept
or adjust. It needs the cross-slot crafting rules (one of each Slaver's affix,
and so on) that the harness skips.

### 5. Guide me

A short wizard on an empty or near-empty build, each step written to the
normal build state so the player can leave at any point:

1. **Goals.** Pick bundles (Basic, Melee, Caster + element...). This exists
   today.
2. **Weapon and offhand.** These come first because they're build-defining,
   and two-handers take the offhand away.
3. **Trance.** Ask whether the build's trance is a *full* trance (Deadly,
   Accuracy and tactics DCs) or a *partial* one (Deadly only), and for an
   estimated value. Default to 50% more than the best Competence Deadly
   available at the build's level range. A partial trance adds a non-gear
   Insight Deadly entry at that value; a full trance also adds Insight
   Accuracy and Insight tactics DC entries. The scorer then stops chasing
   those types on items.
4. **Extras.** Optional groups for effects only some builds use. A "melee
   extras" group would list the four Alchemical Attunements (Air, Earth, Fire,
   Water) and the other weapon-proc effects (Dripping with Magma, Enhanced
   Bloodrage, Relentless Fury). The saved builds show a quarter to a third of
   deliberate users removing these from the Melee bundle.
5. **Minor artifact.** The "your artifact" list: the best few across all
   slots, each with the slot it takes and what it brings.
6. **Artifact and Profane bonuses.** "How will you get Artifact bonuses?" Offer *Sun
   gems*, *one set (+ gems in the rest)*, *both*, each scored against the
   tracked list (as in the table above) with the slots it uses. Ask the same
   for Profane, then show the joint plan, because the two compete for Moon
   slots (and with the artifact's slot). Choosing a set fixes its slots, and choosing gems marks those slots
   "Sun item wanted", which narrows those slots' suggestions to items with
   that slot.
7. **Slot-bound picks.** Walk the slots from proposal 2 in order: "Goggles
   carry your only Insight Dodge - choose one of these 3."
8. **The rest.** Scorer v2 suggestions for the remaining slots.
9. **Augments.** Run "Fill my augments" (proposal 4), then show what's still
   uncovered and why (set-only, eliminated by earlier choices).

### 6. Later: a whole-build optimizer

A headroom check (local search from the best greedy build for the Melee
profile, swapping one item at a time and refilling augments after each swap)
found as much again beyond the best greedy scorer as that scorer found
beyond the live one. That run used the earlier "bonus types covered" measure
and no artifact rule, and hasn't been redone under total value. The point
stands, though: a greedy scorer, however well tuned, leaves something on the
table, because a slot's best item depends on what the other slots end up
holding. A small optimizer in a Web Worker could propose two or three complete
builds, and slot suggestions would then be "what the good complete builds put
here". It should come after v2 and "Fill my augments", since it needs the same
pieces. The harness's local search (`SUGGESTION_EVAL_LOCAL_SEARCH`) is a
starting point, but at about 20 minutes per profile it needs to be much
faster first: evaluate swaps incrementally instead of refilling every crafting
slot each time.

## What the saved builds say

Exported from D1 on 2026-11-22 (`tools/build-stats/`): 653 saved builds from
208 players, plus 63 share links whose gear no saved build has. All 716
decode. Gear level is the median level of each build's equipped items. 519
builds are endgame (28+), 501 of those have 9 or more slots filled, from
168 players. Everything below is about those 501 unless it says otherwise.

**Sun and Moon gems.**

- 129 builds slot all 5 Sun and all 5 Moon gems, and 128 slot none at all,
  probably because augments aren't filled in the planner. The rest are
  mostly 4-5 of each.
- Players fill Moon slots more fully than Lominal recommends ("at most
  4"). Their most-used Lunar gems are Physical Protection (217), Melee Power
  (138), Constitution (127), Magical Protection (120) and Weapon Damage /
  Deadly (114). That's the same order the flat-weight total-value ranking
  gives (Melee Power, PRR, MRR, Deadly, then attributes), except that players
  take Constitution earlier.
- Most-used Solar gems: Physical Resistance Rating (110), Constitution (104),
  Doublestrike (102), Melee Power (85).

**Artifact and Profane strategy.** These are approximate builds per
strategy, from the 16 most common combinations, which cover about 430 of the
501.

| | Artifact | Profane |
|---|---|---|
| gems only | ~135 | ~285 (5 gems: ~165, 4: ~70, 3 or fewer: ~50) |
| gems and a set | ~165 | ~15 |
| set only | ~100 | ~50 |
| neither | ~30 | ~80 |

- Gems dominate Profane, as Lominal says. Profane sets in use are Forbidden
  Knowledge (40) and Dread Isle's Curse (26).
- Artifact is mixed. Most Artifact "sets" are small crafted set bonuses
  (Tough Shields 45, Imbued Infusion 44, Perfect Silence 25...) that give one
  Artifact bonus each. These sit alongside gems rather than replacing them.
  The bigger item sets in use are Eminence of Winter (33), Devils' Infernal
  Dance (28), Eminence of Autumn (18) and Saltmarsh Explorer (15).

**Where covered needs come from.** These are shares of the build's best
source, over finished endgame builds.

| Affix | Items | Augments | Sun/Moon | Other crafting / sets / non-gear |
|---|---|---|---|---|
| Speed | 49% | Yellow 36%, Blue 1% | - | upgradeable item 9%, non-gear 4% |
| Melee Power | - | Yellow 26% | Moon 30%, Sun 19% | Artifact set 16%, Profane set 7% |
| Doublestrike | 64% | Yellow 3% | Sun 15% | Artifact set 9%, Melancholic 6% |
| Deadly | 40% | Yellow 7% | Moon 13% | non-gear (trance) 20%, Dolorous 11% |
| Constitution | 29% | Colorless 15% | Moon 7% | Dolorous 7%, Melancholic 7% |
| Healing Amplification | 27% | Blue 20% | Moon 17%, Sun 9% | Artifact set 8% |
| Fortification | 95% | - | - | Melancholic 4% |

Players get Speed from items about half the time, even though a Topaz is
always available. Speed often rides along on items people want anyway, so
this doesn't settle whether item Speed is worth chasing. It does show the
planner isn't steering people to the augment.

**Coverage.** Enhancement-type needs are usually covered (75-92% of builds
that track them). The second bonus types are where builds fall short:
Insight, Quality, Artifact and Profane versions are covered by 16-68% of the
builds that track them. That is exactly where scarcity guidance matters
most.

**Leave-one-out: does each scorer rank the player's own item highly?** For
the first 100 finished endgame builds, each filled slot was emptied in turn,
and the slot's candidates were ranked by each scorer. That's 1,316 slots,
using each build's own filters.

| Scorer | MRR | player's item in top 20 | mean rank |
|---|---|---|---|
| live | 0.29 | 61% | 117 |
| total value, augment-aware, planned artifact | 0.28 | **68%** | **49** |
| flat weights + item-count scarcity | 0.26 | 66% | 49 |

Players' own choices land in the augment-aware scorer's top 20 more often
than in the live scorer's (68% against 61%), and much higher on average
(rank 49 against 117). That's despite the bias in the live scorer's favour:
some of these players picked from its list. The two are level at the very top
(MRR 0.29 against 0.28).

By slot, the augment-aware scorer puts the player's item in the top 20 more
often in Goggles (84% against 64%), Necklace (81% against 61%), the Rings
(79-80% against 63-66%), Gloves, Bracers, Boots, Belt and Armor. The live
scorer does better in Helm (64% against 46%), and has the edge on MRR in Belt
and Bracers. Weapons rank poorly under every scorer (top 20 in about a
quarter), as expected: they're chosen for weapon type.

Agreeing with players isn't the same as being right: players aren't always
optimal, and a scorer that copies them can't improve on them. But together
with the simulation, the expert's tiers and the gem advice, all four kinds
of evidence point the same way: count what augments can carry, plan for
the artifact, and keep total value as the objective.

## Bundles: what people drop, and what they add

`tools/build-stats/bundle-usage.py` compares every exported build's tracked
list with the bundles as they were when the build was created. It rebuilds
each bundle version from git history, so builds saved before the 2 November
expansion aren't faulted for lacking what it added. A build "adopts" a
bundle when it tracks at least 60% of the bundle's distinctive affixes, the
ones no other bundle has (Melee and Ranged share most of theirs). This covers
all 716 builds, every level.

**Dropped from bundles.** For the affixes added on 2 November, a build
created afterwards that lacks *all* of them most likely copied an older list.
A build that lacks *some* of them removed those deliberately.

| Bundle | Adopters with the new version | Kept all additions | Kept none (old list) | Dropped most often, by those who kept some |
|---|---|---|---|---|
| Basic | 190 | 120 | 31 | the five elemental absorbs (28-32 each), Incorporeality (21), Immunity to Fear (20) |
| Melee | 103 | 47 | 19 | Alchemical Earth Attunement (26), Dripping with Magma (24), Action Boost Charges (20), Enhanced Bloodrage (18) |
| Ranged | 50 | 23 | 5 | Dripping with Magma (16), Alchemical Earth Attunement (13), Incorporeal Bypass (13), Improved Deception (12) |

The core of each bundle is almost always kept (Basic's sheltering, Con,
False Life, Fortification, Dodge: 98-100%). Deception, added to Melee and
Ranged, is the clear success. 32-52% of adopters had added it by hand
before the bundle did, and almost none drop it. The weapon-proc booleans
(Alchemical Earth Attunement, Dripping with Magma, Enhanced Bloodrage) are
build-specific. A quarter to a third of deliberate users remove them, so they
might sit better in an optional "melee extras" group.

**Added beyond the bundles.** These are the most common, as a share of each
bundle's adopters, for affixes in no bundle:

| Bundle (adopters) | Most added |
|---|---|
| Basic (508) | Charisma 42%, Dexterity 39%, Wisdom 33%, Intelligence 31%, Strength 28%, Evocation Focus 25%, Stunning 20%, Enchantment Focus 13%, True Seeing 11% |
| Melee (280) | Strength 56%, Stunning 46%, Wisdom 44%, Dexterity 43%, Charisma 38%, Sundering 19%, Vertigo 18% |
| Ranged (119) | Dexterity 76%, Intelligence 32%, Sneak Attack Dice 24%, Greater Marksmanship 22% |
| Caster (294) | Evocation Focus 57%, Charisma 51%, Intelligence 50%, Enchantment Focus 38%, Necromancy Focus 30%, Spell Focus Mastery 21%, Universal Spell Lore 21%, Universal Spell Power 20%, Magical Efficiency 19% |
| Trapping (76) | Intelligence 80%, Dexterity 53%, Sneak Attack Dice 30% |
| Negative (97) | Intelligence 90%, Necromancy Focus 77%, Negative Amplification 58% |
| Fire / Cold / Electric / Sonic / Light | Evocation Focus 63-78%, plus the casting stat (Charisma 54-86% or Intelligence 40-51%) |

The gaps are consistent:

- **Main stat.** No bundle has one, and every role adds its own: Strength for
  melee, Dexterity for ranged (76%), the casting stat for casters,
  Intelligence for trapping (80%). A "main stat" choice beside the bundles
  would cover it.
- **Spell school DCs.** Evocation Focus for elemental nukers (57-78%),
  Necromancy Focus for Negative (77%), Enchantment Focus broadly. That could
  be a Spell DCs bundle with a school picker, or Evocation in the elemental
  bundles.
- **Tactics DCs** for melee: Stunning 46%, Sundering 19%, Vertigo 18%. Lominal
  lists "relevant tactics DC" as strong.
- Smaller ones: **Sneak Attack Dice** (ranged, trapping), **Negative
  Amplification** (Negative), **Spell Focus Mastery / Universal Spell Lore and
  Power / Magical Efficiency** (casters).
- **Two leftovers from bundle changes.** Ghostly (361 builds) and Parrying (471)
  are the most-tracked affixes in no bundle, mostly from before they were
  swapped for Incorporeality and Deathblock. Ghostly is a group that already
  counts as 10 Incorporeality, so tracking both is redundant.

**Tracked but rarely filled.** These are finished endgame builds that track
an affix, and how often they cover its best-covered bonus type at 3/4 of best
or more. Utility effects can also come from spells, feats and enhancements,
which the planner only sees if they're entered as non-gear, so low numbers
partly mean "covered elsewhere".

| Affix (in Basic) | Builds tracking | Covered |
|---|---|---|
| Sonic Absorption | 79 | ~1% |
| Immunity to Blindness | 314 | 8% |
| Concealment | 335 | 13% |
| Immunity to Fear | 80 | 16% |
| Heroic Inspiration | 309 | 22% |
| Undying | 126 | 24% |
| Feather Falling | 321 | 34% |
| Incorporeality | 89 | 34% |
| Freedom of Movement | 362 | 50% |

Compare 75-92% for Constitution, the Sheltering pair, False Life,
Fortification, Deadly and Accuracy. Concealment matters most here: it's in
almost every build's list, covered by 13% of them, and it's among the
affixes the live scorer inflates most in suggestions (3.5-4.7× its base
rate). Players aren't pursuing it, yet the planner pushes it on them. Low
weights, or an optional "utility" group, for these effects would make the
suggestions match what people actually fill.

### Changes made from this (2026-11-25)

- **Basic** drops Sonic Absorption and Immunity to Blindness: about 1% and 8%
  of the builds tracking them cover them.
- **Ranged** adds Sneak Attack Dice and Greater Marksmanship.
- **Caster** adds Magical Efficiency.

Saved builds keep their tracked lists as they are. A build that had the
Ranged or Caster bundle shows it unticked until the new affixes are added,
as happened with the 2 November expansion.

## Caveats on the simulation

- **Total value is normalised per affix by the sum of its bonus types' best
  values.** That's what the live scorer does. It isn't reachable in practice
  (no build gets every bonus type at its best), so the percentages are low in
  absolute terms. Only comparisons between policies mean anything. A better
  normaliser would be what good finished builds actually reach, and the
  real-build export can supply that.
- **The affix weights are the live scorer's** (attributes 4, DCs 3, booleans
  0.5, the rest 1), not tuned.
- Weapon, Offhand and Quiver are left out. Those are chosen for the weapon,
  not for affixes.
- Augment filling is greedy and ignores cross-slot crafting rules, so finished
  builds are slightly optimistic for every policy alike.
- Four profiles, all at level 28-34. The saved builds (above) track mostly
  the same affixes: Constitution, Sheltering, False Life, Fortification and
  Dodge top the list, then melee and caster stats.
- The harness still reports "needs met" (share of bonus types at 3/4 of best)
  as a secondary number. A per-type scorer wins on that measure but loses on
  total value, which is how that idea got dropped.
