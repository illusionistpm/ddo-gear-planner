# What to slot next: how good are the suggestions, and what would be better

## Summary

- **The suspicion is right.** From an empty level 28-34 build, Speed turns up
  in 18% of each slot's top 20 suggestions, **about 4× its share among all the
  candidates**. Concealment (14-18%, 3.6-4.7×) and Constitution (20%, 2.6×)
  follow the same pattern. Under the alternative scorer below, Speed drops to
  about its base rate (5%, 1.0×). All three can go almost anywhere. Speed
  comes from a level-8 Topaz that fits any Yellow, Green or Orange slot, or
  from a Blue Sapphire, and every equipment slot has endgame items with those
  slots. Concealment is on items in 11 of the 13 slots. Enhancement
  Constitution is a Colorless Diamond.
- **There are four causes in `EquippedService.getScore`, and they add up.**
  1. Each tracked affix is worth one point, split across its bonus types by
     value. An affix with a single bonus type (Speed, Concealment, the boolean
     immunities) puts the whole point on one easy source, while an affix with
     five types spreads it thin.
  2. Scarcity can only raise a weight (×1 to ×2.2), never lower it, so a need
     that an augment can cover almost anywhere scores the same as an ordinary
     one.
  3. A candidate's empty augment slots and crafting systems are worth nothing.
     Only its built-in affixes count.
  4. Set bonuses barely count: just a nudge when a set is the only source of an
     uncovered need.
- **What it costs, measured.** I simulated a player filling 12 slots (all but
  weapon, offhand and quiver) of a level 28-34 build, taking the top
  suggestion each time, then filling every augment slot. Across four tracked
  profiles the live scorer meets **39-41%** of tracked needs. Scoring each
  need on its own, counting augments, and discounting needs an augment covers
  anywhere meets **44-51%** with the same slots, about +8 points on average.
  Judged by the live scorer's *own* value-weighted objective, the
  augment-aware version of it still does better (49-54% → 55-56%), so this
  isn't just a different definition of "good".

  | Profile | live | per-need, augment-aware + discount | same, half crafting credit |
  |---|---|---|---|
  | Melee (Basic + Melee + Str) | 39.5% | 43.8% | 42.7% |
  | Ranged (Basic + Ranged + Dex) | 41.4% | 47.3% | 47.3% |
  | Fire caster | 40.4% | 49.1% | 50.3% |
  | Healer | 39.0% | 51.2% | 50.0% |
- **Augments do almost half the work.** In the live scorer's finished builds,
  the items alone meet 21-25% of tracked needs, and filling the augment slots
  brings that to 39-41%. The suggestions ignore augments entirely, and players
  fill them by hand.
- **Sun/Moon or sets is a real fork**, and the data makes it sharp. None of
  the 264 endgame items with a Sun or Moon slot belongs to a set. A Sun item
  can only go in Armor, Cloak, Helm, Goggles or Trinket, and a Moon item only
  in Bracers, Necklace, Boots, Belt or Gloves. So gems alone give at most 5
  Artifact and 5 Profane picks. A good set plus gems in the gem slots it leaves
  free gives 8-11 tracked Artifact needs (see the table below). But sets take
  up the same slots, Artifact sets often sit in Moon slots, and set items are
  older (ML 29-31 against 33-34). That trade-off is what a "guide me" step
  should settle.

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

The level-8 Topaz of Striding covers Speed in almost any slot, yet an item
with Speed scores **three times** an item with Insight Doublestrike, which
only Belts and Rings carry.

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

## Artifact and Profane: gems or sets?

These are tracked Artifact/Profane needs met by the best options, for the four
test profiles (`tools/build-stats/artifact-profane-strategies.py`). The count
is set bonuses plus gems in the gem slots the set doesn't occupy, with set
pieces placed in non-gem slots first.

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

## Proposals

### 1. Scorer v2 (measured above; ready to build)

- **Score each tracked need on its own.** A need counts for the fraction of its
  best value the candidate adds, times an affix weight. An affix should no
  longer be one point split thinly across its bonus types.
- **Discount floating needs.** Lower the weight (×0.35 in the simulation) when
  an augment at ¾ of best or more fits at least four of the slots still open.
  This is the "you can put Speed anywhere" rule.
- **Count augment slots, at partial credit.** Credit a candidate's empty
  crafting slots with what they could add after the build's own open augment
  slots have been used. Full credit over-rates augment-rich items early, when
  every later item will bring slots too. Under full credit, minor artifacts
  with Blue + Green + Yellow slots take 27-43% of the top 20, even though only
  one can be worn. Half credit cuts that to 18-39% and finishes builds about as
  well (within a point either way). The right answer is probably to credit only
  augment needs beyond what the remaining open slots can be expected to bring,
  and to collapse artifacts in the list.
- **Count set bonuses.** Credit the marginal value of the tier a piece unlocks,
  scaled by whether the set can still reach its threshold
  (`isSetReachable` already exists).

The harness (`site/src/app/suggestion-eval/`) runs every variant, so the
weights can be tuned against the simulation and, once the export is run,
against what players actually chose.

### 2. "Fill this slot next"

The scarcity view groups needs by how few slots remain. Turning that around
answers "what next": for each open slot, list the needs it is one of the last
sources of. For example, "Goggles: the only source of Insight Dodge; one of two
for Quality Doublestrike." Rank the open slots by that and badge the top one on
the equipment grid. Everything it needs is already in
`AffixAvailabilityService.getRemainingAvailability`; this is a regrouping, not
new analysis.

### 3. Say how a need can be filled, in the scarcity view

Add the classes above to the scarcity grouping, especially **floating**: "Speed
- any Yellow, Green or Orange slot (Topaz of Striding)". That tells people
directly not to spend an item slot on it. For a Sun/Moon need, say "one of
your 5 Sun gems, or a set".

### 4. "Fill my augments"

Augments carry almost half of what a finished build covers (21-25% of
needs from items alone, 39-41% once augments are filled). The harness's greedy
augment fill (`fillCrafting` in `build-model.ts`) is already a one-click
feature: for every empty augment slot on equipped gear,
pick the gem that covers the most uncovered tracked need. Today players do this
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
3. **Artifact and Profane.** "How will you get Artifact bonuses?" Offer *Sun
   gems*, *one set (+ gems in the rest)*, *both*, each scored against the
   tracked list (as in the table above) with the slots it uses. Ask the same
   for Profane, then show the joint plan, because the two compete for Moon
   slots. Choosing a set fixes its slots, and choosing gems marks those slots
   "Sun item wanted", which narrows those slots' suggestions to items with
   that slot.
4. **Slot-bound picks.** Walk the slots from proposal 2 in order: "Goggles
   carry your only Insight Dodge - choose one of these 3."
5. **The rest.** Scorer v2 suggestions for the remaining slots.
6. **Augments.** Run "Fill my augments" (proposal 4), then show what's still
   uncovered and why (set-only, eliminated by earlier choices).

### 6. Later: a whole-build optimizer

The headroom check started from the best greedy build for the Melee profile,
swapped one item at a time, and refilled augments after each swap. It went
from 43.8% to **48.1%** of needs met, about as far beyond v2 as v2 is beyond
the live scorer (39.5%). So a greedy scorer, however well tuned, leaves a
real amount on the table, because a slot's best item depends on what the
other slots end up holding. A small optimizer in a Web Worker could propose
two or three complete builds, and slot suggestions would then be "what the
good complete builds put here". It should come after v2 and "Fill my augments", since it
needs the same pieces. The harness's local search is a starting point,
though at about 20 minutes per profile it needs to be much faster first:
evaluate swaps incrementally instead of refilling every crafting slot each
time.

## The real-build data

`tools/build-stats/` exports the saved builds and share links (owners
pseudonymised; no emails or ids), and `real-builds.spec.ts` turns them into an
aggregate report. It covers:

- **What people track.** This also tests whether the four test profiles are
  representative.
- **Where finished builds get each covered need**: item / augment colour / Sun /
  Moon / other crafting / set. This calibrates the floating discount: if 80% of
  covered Speed comes from augments, the discount is right.
- **Needs people track but rarely cover.** These are the real gaps to point the
  guide at.
- **The Artifact/Profane strategies** players use.
- **Leave-one-out ranking.** Empty each slot of a finished build and see where
  the player's own item ranks under each scorer (hit@1/5/20, MRR, per slot).
  This is the closest thing to an accuracy measure. It flatters the live
  scorer, though, since some players picked from its list.

See `tools/build-stats/README.md` for how to run it.

## Caveats on the simulation

- Every tracked bonus type counts the same in "needs met", including small
  ones (Festive +2, Exceptional +1). That favours the per-need scorers, which
  optimise for exactly that. On the live scorer's value-weighted objective they
  score a little *below* the live scorer (47-53% against 49-54%). What holds
  under both measures is the augment-aware change: keeping the live
  objective but counting augments beats the live scorer on needs met (41-44%
  against 39-41%) *and* on its own objective (55-56% against 49-54%). How
  much small bonus types should count is the open question, and the real-build
  data (which bonus types players bother to cover) is the way to settle it.
- Weapon, Offhand and Quiver are left out. Those are chosen for the weapon,
  not for affixes.
- Augment filling is greedy and ignores cross-slot crafting rules, so finished
  builds are slightly optimistic for every policy alike.
- Four profiles, all at level 28-34. The real-build export is what will say
  whether they're typical.
