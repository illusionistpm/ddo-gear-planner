import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

import { AffixSource, EquippedService } from './equipped.service';

/** The gear list's jump target for the non-gear card. A slot's target is the slot's own name. */
export const NON_GEAR_JUMP_TARGET = 'non-gear';

/** The gear list's jump target for a set's bonus card. */
export function setJumpTarget(setName: string): string {
  return `set:${setName}`;
}

function jumpTargetFor(source: AffixSource): string {
  switch (source.kind) {
    case 'set': return setJumpTarget(source.itemName);
    case 'external': return NON_GEAR_JUMP_TARGET;
    default: return source.slot;
  }
}

/**
 * What supplies the bonus type the user is pointing at on the affix panel - as the
 * gear list's jump targets (slots, the non-gear card, set cards) - so the jump bar
 * can light up those chips.
 */
@Injectable({ providedIn: 'root' })
export class AffixSourceHighlightService {
  private readonly targets = new BehaviorSubject<ReadonlySet<string>>(new Set());
  readonly targets$: Observable<ReadonlySet<string>> = this.targets.asObservable();

  constructor(private equipped: EquippedService) { }

  /** Highlights everything supplying the counted value - all of them when several tie. */
  showSourcesOf(affixName: string, bonusType: string) {
    this.targets.next(new Set(this.equipped.getSourcesForAffixType(affixName, bonusType).map(jumpTargetFor)));
  }

  clear() {
    if (this.targets.value.size) {
      this.targets.next(new Set());
    }
  }
}
