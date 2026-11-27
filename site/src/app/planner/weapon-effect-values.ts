/**
 * What effects that only weapons carry are worth to the suggestion scorer, as a share of a build's
 * damage. No goal tracks them, yet they are most of why an endgame build picks one weapon over
 * another (docs/suggestions-analysis.md, "Weapon effects"). The scorer counts them, for builds they
 * apply to, at the same rate per % of damage as a weapon's [W] (see weaponEffectCredit).
 *
 * The rules the values follow, from a player's review (2026-11-27):
 *
 *  - Fixed damage ("6d6 fire damage on hit") doesn't scale with anything, so it's worth nothing at
 *    endgame. Nor are DCs under 100, damage-reduction bypasses, or damage on vorpal hits (Overwhelming
 *    Incineration averages ~5 a swing; Utter Disintegration ~20). Those effects aren't listed.
 *  - Keen and Impact are worth nothing: they don't stack with Improved Critical, which endgame builds have.
 *  - The large, non-scaling damage over time of the Dripping with Magma family is worth having.
 *  - Crowd control is irreplaceable: DC 100 or more, or no save at all.
 *  - Improved Destruction's stacks (-1 AC, -1% Fortification, up to 15, one a second) come to about
 *    15 Armor-Piercing and 15 Accuracy over a fight; Destruction (one every three seconds) to 2/3 of that.
 *  - Legendary Green Steel's effects are worth a lot: Slime 10%, Ash 20% of magical damage, Vacuum
 *    20% of any, Dust 35% of physical. Vulnerable is Vacuum's effect.
 *
 * Effects a goal can track (Dripping with Magma, Alchemical attunements) aren't here: the goal counts them.
 */

/** Which builds an effect helps: weapon damage, spell damage, or both. */
export type WeaponEffectKind = 'physical' | 'magical' | 'any';

export interface WeaponEffectValue {
  /** Worth this % of the build's damage. */
  percent: number;
  /**
   * Or worth these bonuses to tracked affixes, on a channel of their own (a debuff on the target stacks
   * with the build's bonuses), in place of `percent`.
   */
  asAffixes?: ReadonlyArray<{ name: string; value: number }>;
  kind: WeaponEffectKind;
  /** Effects in one group don't stack: a build gains the group's best once. Defaults to the effect's own name. */
  group?: string;
}

const crowdControl: WeaponEffectValue = { percent: 8, kind: 'physical' };
const largeDamageOverTime: WeaponEffectValue = { percent: 5, kind: 'any' };
const vulnerable: WeaponEffectValue = { percent: 20, kind: 'any', group: 'Vulnerable' };
/** +0.5[W], at the reference die (6.5) per [W] on a ~100 damage hit. Vorpals don't stack. */
const halfW: WeaponEffectValue = { percent: 3.25, kind: 'physical', group: 'Vorpal' };

export const WEAPON_EFFECT_VALUES: ReadonlyMap<string, WeaponEffectValue> = new Map<string, WeaponEffectValue>([
  // Legendary Green Steel.
  ['Legendary Dust', { percent: 35, kind: 'physical' }],
  ['Legendary Ash', { percent: 20, kind: 'magical' }],
  ['Legendary Vacuum', vulnerable],
  ['Legendary Slime', { percent: 10, kind: 'any' }],
  // Vulnerable stacks on hit.
  ['Frostbite', vulnerable],
  ['Flamebitten', vulnerable],
  ['Fire Vulnerability', vulnerable],
  ['Cold Vulnerability', vulnerable],
  ['3rd Degree Burns', vulnerable],

  // Armor Destruction stacks on the target.
  ['Improved Destruction', { percent: 0, kind: 'physical', group: 'Armor Destruction',
    asAffixes: [{ name: 'Armor-Piercing', value: 15 }, { name: 'Accuracy', value: 15 }] }],
  ['Destruction', { percent: 0, kind: 'physical', group: 'Armor Destruction',
    asAffixes: [{ name: 'Armor-Piercing', value: 10 }, { name: 'Accuracy', value: 10 }] }],

  // +1 critical multiplier on a 19 or 20.
  ['Blunt Trauma', { percent: 5, kind: 'physical', group: 'critical multiplier' }],
  ['Serrated', { percent: 5, kind: 'physical', group: 'critical multiplier' }],
  ['Elasticity', { percent: 5, kind: 'physical', group: 'critical multiplier' }],

  // +0.5[W].
  ['Vorpal', halfW],
  ['Greater Vorpal', halfW],
  ['Superior Vorpal', halfW],
  ['Sovereign Vorpal', halfW],

  // Large damage over time.
  ['Lingering Acidic Burn', largeDamageOverTime],
  ['Rippling Energy', largeDamageOverTime],
  ['Rupturing Echo', largeDamageOverTime],
  ['Lightning Lash', largeDamageOverTime],
  ['Bitter Frostbite', largeDamageOverTime],
  ['Grip of Venom', largeDamageOverTime],
  ['Revel in Blood (Piercing)', largeDamageOverTime],
  ['Revel in Blood (Slashing)', largeDamageOverTime],
  ['Revel in Blood (Bludgeoning)', largeDamageOverTime],
  ['Revel in Blood (Magic)', largeDamageOverTime],

  // Crowd control: DC 100 or more.
  ['Legendary Paralysis', crowdControl],
  ['Legendary Stone Prison', crowdControl],
  ['Legendary Freezing Ice', crowdControl],
  ['Legendary Slay Living', crowdControl],
  ['Legendary Slowburst', crowdControl],
  ['Legendary Telekinetic', crowdControl],
  ['Legendary Sirocco', crowdControl],
  ['Legendary Goldcurse', crowdControl],
  // Crowd control with no save.
  ['Guardbreaking', crowdControl],
  ['Felling the Oak', crowdControl],
  ['Legendary Blinding Embers', crowdControl],
  ['Greater Sunburst', crowdControl],
  ['Earthgrab', crowdControl],
  ['Legendary Earthgrab Guard', crowdControl],
  ['Brilliance of the Shattered Sun', { ...crowdControl, kind: 'any' }],
]);
