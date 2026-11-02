import { Pipe, PipeTransform } from '@angular/core';
import { UserItemLocation } from '../planner/user-gear.service';

@Pipe({ name: 'userItemLocationTooltip', standalone: false })
export class UserItemLocationTooltipPipe implements PipeTransform {
  transform(locations?: readonly UserItemLocation[] | null): string {
    if (!locations || locations.length === 0) return '';
    return locations.map(loc =>
      `${loc.character}: ${loc.location}${loc.tab ? ' (Tab: ' + loc.tab + ')' : ''}`
      + ((loc.quantity ?? 1) > 1 ? ` ×${loc.quantity}` : '')
      // Only the character it's bound to can use it.
      + (loc.binding === 'BtC' ? ' · BtC' : '')
    ).join('\n');
  }
}
