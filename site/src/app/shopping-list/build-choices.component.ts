import {
  AfterViewChecked, ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, QueryList, ViewChildren
} from '@angular/core';

import { BuildSummary } from '../build/build';
import { characterNameFor, MAX_CHARACTER_NAME_LENGTH, MAX_GROUP_BUILDS } from '../build/groups.service';

/** One of your saved builds, offered for a list. */
export interface BuildChoice {
  build: BuildSummary;
  /** The character name it's on the list as, or would be added as, as typed. */
  characterName: string;
  /** The name the list has for it, as last saved; what a rename is measured against. */
  savedName: string;
  /** On the list. */
  inGroup: boolean;
  /** Chosen for a list not started yet, which takes them all at once. */
  picked: boolean;
  busy: boolean;
  error: string | null;
}

/** Your saved builds as choices, each named after its build: the build on screen first, and chosen. */
export function buildChoicesOf(builds: readonly BuildSummary[], currentBuildId: string | null = null): BuildChoice[] {
  const ordered = [...builds.filter(build => build.id === currentBuildId), ...builds.filter(build => build.id !== currentBuildId)];
  return ordered.map(build => {
    const characterName = characterNameFor(build.name);
    return { build, characterName, savedName: characterName, inGroup: false, picked: build.id === currentBuildId, busy: false, error: null };
  });
}

/** How long a character name rests before it's saved: once you've stopped typing. */
export const RENAME_DELAY_MS = 600;

let nextId = 0;

/**
 * Your saved builds as rows of a list's Add builds: a box to tick, the
 * build, and its character's name. The same for a list not started yet
 * (`pick`: the ticks are gathered, and whoever shows them starts the list)
 * and one in progress (`manage`: each tick puts the build on it or takes it
 * off, and a name is saved once you stop typing).
 */
@Component({
  selector: 'app-build-choices',
  templateUrl: './build-choices.component.html',
  styleUrls: ['../shared/list-dialog-parts.css', './build-choices.component.css'],
  // Not OnPush: whoever shows the choices updates them in place (an error, busy, now on the list), and
  // marks itself for check; these are checked along with it.
  changeDetection: ChangeDetectionStrategy.Eager
})
export class BuildChoicesComponent implements AfterViewChecked, OnDestroy {
  /** Null while they load. */
  @Input() choices: BuildChoice[] | null = null;
  @Input() loadError: string | null = null;
  @Input() mode: 'pick' | 'manage' = 'manage';
  /** The list can take no more: nothing more is offered to tick. */
  @Input() full = false;
  /** The build on screen, marked as this one. */
  @Input() currentBuildId: string | null = null;
  @Output() readonly ticked = new EventEmitter<{ choice: BuildChoice; on: boolean }>();
  @Output() readonly rename = new EventEmitter<BuildChoice>();

  readonly maxNameLength = MAX_CHARACTER_NAME_LENGTH;
  readonly fullTitle = `A list holds up to ${MAX_GROUP_BUILDS} builds`;
  /** Each row's ids, unique however many of these are on the page. */
  readonly idPrefix = `build-choice-${nextId++}-`;
  @ViewChildren('box') private boxes?: QueryList<ElementRef<HTMLInputElement>>;
  private readonly pendingRenames = new Map<BuildChoice, ReturnType<typeof setTimeout>>();

  /**
   * Each box as its choice is, every time these are checked. A click ticks
   * a box itself, and a tick that then fails to land on the list goes back
   * in the choice; the [checked] binding alone wouldn't put it back, as
   * the value it last set hasn't changed.
   */
  ngAfterViewChecked(): void {
    this.boxes?.forEach((box, i) => {
      const choice = this.choices?.[i];
      if (choice) {
        box.nativeElement.checked = this.isOn(choice);
      }
    });
  }

  ngOnDestroy(): void {
    // Closed mid-name: saved now rather than lost.
    for (const choice of [...this.pendingRenames.keys()]) {
      this.renameNow(choice);
    }
  }

  isOn(choice: BuildChoice): boolean {
    return this.mode === 'pick' ? choice.picked : choice.inGroup;
  }

  /** Each box's own, while the list is full: none more is ticked. */
  isDisabled(choice: BuildChoice): boolean {
    return choice.busy || (this.full && !this.isOn(choice));
  }

  /**
   * A box clicked, which has ticked or unticked it already. On click, not
   * change: the change comes after the change detection the click sets
   * off, by which time ngAfterViewChecked has put the box back as it was.
   */
  setOn(choice: BuildChoice, on: boolean): void {
    choice.error = null;
    if (this.mode === 'pick') {
      choice.picked = on;
    } else {
      this.ticked.emit({ choice, on });
    }
  }

  /** A name typed: picks a build not started on yet, or is saved once you stop typing on one on the list. */
  setCharacterName(choice: BuildChoice, value: string): void {
    choice.characterName = value;
    choice.error = null;
    if (this.mode === 'pick') {
      choice.picked ||= !this.full;
    } else if (choice.inGroup) {
      clearTimeout(this.pendingRenames.get(choice));
      this.pendingRenames.set(choice, setTimeout(() => this.renameNow(choice), RENAME_DELAY_MS));
    }
  }

  defaultName(choice: BuildChoice): string {
    return characterNameFor(choice.build.name);
  }

  /** Back to the name from the build's own. */
  resetName(choice: BuildChoice): void {
    choice.characterName = this.defaultName(choice);
    choice.error = null;
    if (this.mode === 'manage' && choice.inGroup) {
      this.renameNow(choice);
    }
  }

  private renameNow(choice: BuildChoice): void {
    clearTimeout(this.pendingRenames.get(choice));
    this.pendingRenames.delete(choice);
    this.rename.emit(choice);
  }
}
