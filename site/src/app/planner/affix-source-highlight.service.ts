import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

import { AffixSource, EquippedService, FILIGREE_SOURCE_SLOTS } from './equipped.service';

/** The gear list's jump target for the non-gear card. A slot's target is the slot's own name. */
export const NON_GEAR_JUMP_TARGET = 'non-gear';

/** The gear list's jump target for a set's bonus card. */
export function setJumpTarget(setName: string): string {
  return `set:${setName}`;
}

/** The gear list's jump target for a filigree set's bonus card, apart from any gear set of the same name. */
export function filigreeSetJumpTarget(setName: string): string {
  return `filigree-set:${setName}`;
}

/** A set bonus card's jump target, whichever kind of set it is. */
export function setBonusJumpTarget(setBonus: { setName: string; filigree?: boolean }): string {
  return setBonus.filigree ? filigreeSetJumpTarget(setBonus.setName) : setJumpTarget(setBonus.setName);
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
    this.targets.next(new Set(this.equipped.getSourcesForAffixType(affixName, bonusType).map(source => this.jumpTargetFor(source))));
  }

  private jumpTargetFor(source: AffixSource): string {
    switch (source.kind) {
      case 'set': return setJumpTarget(source.itemName);
      case 'external': return NON_GEAR_JUMP_TARGET;
      case 'filigree':
        // A slotted filigree lights up the card of the item holding it.
        if (source.slot === FILIGREE_SOURCE_SLOTS.set) {
          return filigreeSetJumpTarget(source.itemName);
        }
        return source.slot === FILIGREE_SOURCE_SLOTS.weapon
          ? 'Weapon'
          : this.equipped.getFiligreeHostItem('artifact')?.slot ?? source.slot;
      default: return source.slot;
    }
  }

  clear() {
    if (this.targets.value.size) {
      this.targets.next(new Set());
    }
  }
}
