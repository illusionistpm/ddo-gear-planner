import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

import { Affix } from '../affixes/affix';
import { AffixService } from '../affixes/affix.service';
import { FiligreeDbService } from '../gear/filigree-db.service';
import {
  countFiligreeSetPieces, CountedFiligree, emptyFiligreeLoadout, FILIGREE_HOST_TEXT, FiligreeChoice, FiligreeHost,
  FiligreeLoadout
} from '../gear/filigree';
import type { Item } from '../gear/item';
import { countLoadoutFiligree, filigreeCapacity, FiligreeHosts, findFiligreeHosts } from './filigree-loadout';
import { parseFiligreeLoadout, serializeFiligreeLoadout } from './filigree-params';

/** Where filigree sources are reported (AffixSource.slot, as shown in tooltips). */
export const FILIGREE_SOURCE_SLOTS: Readonly<Record<FiligreeHost | 'set', string>> = {
  weapon: 'Weapon filigree',
  artifact: 'Artifact filigree',
  set: 'Filigree set',
};

/** One affix a slotted filigree, or an active filigree set, gives the build. */
export interface FiligreeContribution {
  /** The host the filigree is slotted in; null for a set bonus. */
  host: FiligreeHost | null;
  /** FILIGREE_SOURCE_SLOTS' entry for it. */
  slot: string;
  /** The filigree ("Celerity: Dexterity (Rare)") or set name. */
  itemName: string;
  affix: Affix;
}

/**
 * The filigrees slotted in the sentient weapon and the minor artifact: what the player has chosen,
 * what the equipped items hold of it, and what that gives the build.
 *
 * The loadout is kept apart from which items are equipped, so EquippedService hands over its slots
 * (connectSlots) and reads the contributions back. It also listens to edits() to recompute what it
 * derives and to save the loadout into the build URL.
 */
@Injectable({
  providedIn: 'root'
})
export class FiligreeLoadoutService {
  private loadout: FiligreeLoadout = emptyFiligreeLoadout();
  private readonly loadoutSubject = new BehaviorSubject<FiligreeLoadout>(this.loadout);
  private readonly editsSubject = new Subject<void>();
  private slots: () => ReadonlyMap<string, Item | null> = () => new Map();
  // What the counted filigrees and their sets give, groups flattened; rebuilt by refreshContributions.
  private contributions: FiligreeContribution[] = [];

  constructor(
    private filigreeDb: FiligreeDbService,
    private affixSvc: AffixService
  ) { }

  /** Where to find the equipped items, which decide what holds filigree. EquippedService connects its own. */
  connectSlots(slots: () => ReadonlyMap<string, Item | null>) {
    this.slots = slots;
  }

  getLoadout(): FiligreeLoadout {
    return this.loadout;
  }

  getLoadoutObservable(): Observable<FiligreeLoadout> {
    return this.loadoutSubject.asObservable();
  }

  /** Emits after each change the player makes (not after restore()), once getLoadoutObservable has. */
  edits(): Observable<void> {
    return this.editsSubject.asObservable();
  }

  /** Replaces the loadout with what a `filigree` param describes, dropping filigrees the data doesn't know. */
  restore(raw: string | null | undefined) {
    this.loadout = parseFiligreeLoadout(raw, name => !!this.filigreeDb.get(name));
    this.loadoutSubject.next(this.loadout);
  }

  /** The `filigree` param for the loadout, or null when it's empty. */
  serialize(): string | null {
    return serializeFiligreeLoadout(this.loadout);
  }

  private getHosts(): FiligreeHosts {
    return findFiligreeHosts(this.slots());
  }

  /** The item that holds a host's filigrees, and its slot: the main-hand weapon, or whichever minor artifact is equipped. */
  getHost(host: FiligreeHost): { slot: string; item: Item } | null {
    return this.getHosts()[host];
  }

  /** How many filigrees the host holds: 10 for any main-hand weapon, the artifact's Max Filigree Slots, 0 with none equipped. */
  getCapacity(host: FiligreeHost): number {
    return filigreeCapacity(host, this.getHosts());
  }

  /**
   * The host's filigrees that show and count: as many as it holds. Any past that are kept for a
   * host that holds more.
   */
  getShown(host: FiligreeHost): FiligreeChoice[] {
    return this.loadout[host].slice(0, this.getCapacity(host));
  }

  /** Where the next filigree goes in the host, or null when it's full or not equipped. */
  getNextSlot(host: FiligreeHost): number | null {
    const count = this.loadout[host].length;
    return count < this.getCapacity(host) ? count : null;
  }

  /**
   * Puts a filigree in a slot, or with null takes it out, the ones after it sliding up. A slot just
   * past the last filigree adds one there, if the host has room.
   */
  set(host: FiligreeHost, index: number, choice: FiligreeChoice | null) {
    const slots = [...this.loadout[host]];
    if (index >= 0 && index < slots.length) {
      if (choice) {
        slots[index] = { ...choice };
      } else {
        slots.splice(index, 1);
      }
    } else if (choice && index === slots.length && index < this.getCapacity(host)) {
      slots.push({ ...choice });
    }
    this.loadout = { ...this.loadout, [host]: slots };
    this.loadoutSubject.next(this.loadout);
    this.editsSubject.next();
  }

  /**
   * Why a filigree can't be added after the host's last one now, or '' when it can. A second copy
   * in one host can still go in from the gear card, as a set piece; adding one elsewhere is blocked.
   */
  getAppendBlocker(host: FiligreeHost, name: string): string {
    const text = FILIGREE_HOST_TEXT[host];
    if (!this.getCapacity(host)) {
      return text.missing;
    }
    if (this.getShown(host).some(choice => choice.name === name)) {
      return `Already in the ${text.noun}`;
    }
    if (this.getNextSlot(host) === null) {
      return 'No room left';
    }
    return '';
  }

  /** The tooltip for a button that adds the filigree to the host: why it can't, or what it does. */
  getAppendTitle(host: FiligreeHost, name: string): string {
    return this.getAppendBlocker(host, name) || `Add it after the filigrees already in the ${FILIGREE_HOST_TEXT[host].noun}`;
  }

  /** Adds a filigree after the host's last one; false when the host is full or missing. */
  append(host: FiligreeHost, choice: FiligreeChoice): boolean {
    const index = this.getNextSlot(host);
    if (index === null) {
      return false;
    }
    this.set(host, index, choice);
    return true;
  }

  /** Every filigree that counts, both hosts. */
  getCounted(): CountedFiligree[] {
    return countLoadoutFiligree(this.loadout, this.getHosts());
  }

  /** Filigree set -> pieces, over both hosts' counted filigrees. */
  getSetPieces(): Map<string, number> {
    return this.setPiecesOf(this.getCounted());
  }

  private setPiecesOf(counted: ReadonlyArray<CountedFiligree>): Map<string, number> {
    return countFiligreeSetPieces(counted, name => this.filigreeDb.getSets(name));
  }

  /** Recomputes what the filigrees give, after the loadout or the equipped items change. */
  refreshContributions() {
    const contributions: FiligreeContribution[] = [];
    const add = (host: FiligreeHost | null, itemName: string, affixes: Affix[]) => {
      const slot = FILIGREE_SOURCE_SLOTS[host ?? 'set'];
      for (const affix of this.affixSvc.flattenAffixGroups(affixes, true)) {
        contributions.push({ host, slot, itemName, affix });
      }
    };
    const counted = this.getCounted();
    for (const entry of counted) {
      if (entry.contributes) {
        add(entry.host, entry.choice.name + (entry.choice.rare ? ' (Rare)' : ''), this.filigreeDb.getAffixes(entry.choice));
      }
    }
    for (const [set, pieces] of this.setPiecesOf(counted)) {
      add(null, set, this.filigreeDb.getSetBonus(set, pieces));
    }
    this.contributions = contributions;
  }

  /** What the counted filigrees and active filigree sets give `affixName` of `bonusType` (any type when omitted). */
  getContributionsFor(affixName: string, bonusType?: string): FiligreeContribution[] {
    return this.contributions.filter(entry => entry.affix.name === affixName
      && (bonusType === undefined || entry.affix.type === bonusType));
  }
}
