import { Pipe, PipeTransform } from '@angular/core';
import { UserItemLocation } from './user-gear.service';

@Pipe({ name: 'userItemLocationTooltip', standalone: false })
export class UserItemLocationTooltipPipe implements PipeTransform {
  transform(locations?: UserItemLocation[]): string {
    if (!locations || locations.length === 0) return '';
    return locations.map(loc =>
      `${loc.character}: ${loc.location}${loc.tab ? ' (Tab: ' + loc.tab + ')' : ''}`
    ).join('\n');
  }
}
