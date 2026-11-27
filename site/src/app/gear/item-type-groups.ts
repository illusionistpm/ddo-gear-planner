import itemTypesList from '@data/item-types.json';

const itemTypes = itemTypesList as Record<string, { attributes: ReadonlyArray<string> }>;

/** Every item type carrying all of `attributes` ("one-handed" and "melee", say), in the data's order. */
export function typesWithAttributes(attributes: ReadonlyArray<string>): string[] {
  return Object.keys(itemTypes).filter(type => {
    const own = itemTypes[type]?.attributes ?? [];
    return attributes.every(attribute => own.includes(attribute));
  });
}

/** A named set of item types offered as one choice. */
export interface ItemTypeFamily {
  label: string;
  types: string[];
}

export const ALL_WEAPON_TYPES = typesWithAttributes(['weapon']);
export const MELEE_WEAPON_TYPES = typesWithAttributes(['melee']);
export const RANGED_WEAPON_TYPES = [...typesWithAttributes(['ranged']), ...typesWithAttributes(['thrown'])];
export const OFFHAND_TYPES = typesWithAttributes(['offhand']);
export const ARMOR_TYPES = typesWithAttributes(['armor']);

/** Warforged and Bladeforged wear these, and nothing else in the Armor slot; nobody else can. */
export const DOCENT_TYPE = 'Docents';
/** Lightest first, as players think of them. */
export const BODY_ARMOR_TYPES = ['Cloth armor', 'Light armor', 'Medium armor', 'Heavy armor']
  .filter(type => ARMOR_TYPES.includes(type));

/**
 * The weapons a character needs a feat (or a class) to use well. The data doesn't mark them,
 * so they're listed here. Rune Arms are exotic too, but they're offhands.
 */
export const EXOTIC_WEAPON_TYPES = ['Bastard Swords', 'Dwarven War Axes', 'Kamas', 'Khopeshes', 'Kukris',
  'Great Crossbows', 'Repeating Light Crossbows', 'Repeating Heavy Crossbows', 'Shurikens']
  .filter(type => ALL_WEAPON_TYPES.includes(type));

const notExotic = (types: string[]) => types.filter(type => !EXOTIC_WEAPON_TYPES.includes(type));
const exoticAmong = (types: string[]) => EXOTIC_WEAPON_TYPES.filter(type => types.includes(type));

/** Melee weapons as players pick them: one-handed, two-handed, and the exotics that take a feat. */
export const MELEE_WEAPON_FAMILIES: ItemTypeFamily[] = [
  { label: 'One-handed', types: notExotic(typesWithAttributes(['one-handed', 'melee'])) },
  { label: 'Two-handed', types: notExotic(typesWithAttributes(['two-handed', 'melee'])) },
  { label: 'Exotic', types: exoticAmong(MELEE_WEAPON_TYPES) }
].filter(family => family.types.length > 0);

const ranged = typesWithAttributes(['ranged']);

export const RANGED_WEAPON_FAMILIES: ItemTypeFamily[] = [
  { label: 'Bows', types: notExotic(ranged.filter(type => type.endsWith('Bows'))) },
  { label: 'Crossbows', types: notExotic(ranged.filter(type => type.endsWith('Crossbows'))) },
  { label: 'Thrown', types: notExotic(typesWithAttributes(['thrown'])) },
  { label: 'Exotic', types: exoticAmong(RANGED_WEAPON_TYPES) }
].filter(family => family.types.length > 0);

/** Weapon types a character holds in both hands: they leave the offhand empty. */
export const TWO_HANDED_WEAPON_TYPES = typesWithAttributes(['two-handed']);

const shields = OFFHAND_TYPES.filter(type => /shields|Bucklers/.test(type));

export const OFFHAND_FAMILIES: ItemTypeFamily[] = [
  { label: 'Shields', types: shields },
  { label: 'Orbs', types: OFFHAND_TYPES.filter(type => type === 'Orbs') },
  { label: 'Rune Arms', types: OFFHAND_TYPES.filter(type => type === 'Rune Arms') }
];
