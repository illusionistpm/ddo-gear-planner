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
export const BODY_ARMOR_TYPES = ARMOR_TYPES.filter(type => type !== DOCENT_TYPE);

const light = typesWithAttributes(['light', 'melee']);

/** Melee weapons as players think of them: light, other one-handed, two-handed. */
export const MELEE_WEAPON_FAMILIES: ItemTypeFamily[] = [
  { label: 'Light', types: light },
  { label: 'One-handed', types: typesWithAttributes(['one-handed', 'melee']).filter(type => !light.includes(type)) },
  { label: 'Two-handed', types: typesWithAttributes(['two-handed', 'melee']) }
];

const ranged = typesWithAttributes(['ranged']);
const repeaters = ranged.filter(type => type.startsWith('Repeating'));

export const RANGED_WEAPON_FAMILIES: ItemTypeFamily[] = [
  { label: 'Bows', types: ranged.filter(type => type.endsWith('Bows')) },
  { label: 'Crossbows', types: ranged.filter(type => type.endsWith('Crossbows') && !repeaters.includes(type)) },
  { label: 'Repeaters', types: repeaters },
  { label: 'Thrown', types: typesWithAttributes(['thrown']) }
];

const shields = OFFHAND_TYPES.filter(type => /shields|Bucklers/.test(type));

export const OFFHAND_FAMILIES: ItemTypeFamily[] = [
  { label: 'Shields', types: shields },
  { label: 'Orbs', types: OFFHAND_TYPES.filter(type => type === 'Orbs') },
  { label: 'Rune Arms', types: OFFHAND_TYPES.filter(type => type === 'Rune Arms') }
];
