import type { ShoppingListView, ShoppingRow } from './shopping-list-types';

/**
 * The still-needed list as plain text, to paste into Discord or in-game mail.
 * Expects a view filtered to what's still needed; grouping by source reads best,
 * as it says which quests to run.
 */
export function formatShoppingListText(view: ShoppingListView, buildName: string | null): string {
  const name = buildName?.trim() || 'my build';
  const needed = view.total - view.acquired;
  if (needed === 0) {
    return `Nothing left to get for ${name}.`;
  }

  const lines = [`Still needed for ${name} (${needed}):`];
  for (const section of view.sections) {
    if (section.label) {
      lines.push('', `== ${section.label} ==`);
    }
    section.groups.forEach((group, index) => {
      if (index > 0 || !section.label) {
        lines.push('');
      }
      lines.push(group.raid ? `${group.label} (raid)` : group.label);
      if (group.header) {
        pushRow(lines, { ...group.header, children: group.rows }, '');
      } else {
        for (const row of group.rows) {
          pushRow(lines, row, '');
        }
      }
    });
  }
  return lines.join('\n');
}

function pushRow(lines: string[], row: ShoppingRow, indent: string): void {
  const missing = row.quantity - row.acquired;
  const notes: string[] = [];
  if (row.state === 'checked') {
    // Only listed for crafting still to do on it.
    notes.push('have it');
  } else if (row.entry.kind === 'gear' && row.entry.ml) {
    notes.push(`ML ${row.entry.ml}`);
  }
  if (row.entry.kind === 'augment') {
    notes.push('augment');
  }
  if (row.alsoFrom.length) {
    notes.push(`also from ${alsoFromText(row.alsoFrom.map(source => source.quest))}`);
  }
  if (row.entry.details.length) {
    notes.push(`roll: ${row.entry.details.join(', ')}`);
  }

  const count = missing > 1 ? ` x${missing}` : '';
  const system = row.entry.kind === 'step' && row.entry.system ? `${row.entry.system}: ` : '';
  lines.push(`${indent}- ${system}${row.entry.label}${count}${notes.length ? ` (${notes.join(', ')})` : ''}`);
  for (const child of row.children) {
    pushRow(lines, child, indent + '  ');
  }
}

/** Names a couple of other quests; past that, just how many, or the line runs on. */
function alsoFromText(quests: readonly string[]): string {
  return quests.length <= 2 ? quests.join(', ') : `${quests.length} other quests`;
}
