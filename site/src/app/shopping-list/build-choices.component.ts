import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

import { BuildSummary } from '../build/build';
import { characterNameFor, MAX_CHARACTER_NAME_LENGTH } from '../build/groups.service';

/** One of your saved builds, offered for a list. */
export interface BuildChoice {
  build: BuildSummary;
  /** The character name it's on the list as, or would be added as. */
  characterName: string;
  /** On the list already. */
  inGroup: boolean;
  /** Chosen to add, where they're chosen before adding them all at once. */
  picked: boolean;
  busy: boolean;
  error: string | null;
}

/** Your saved builds as choices, each named after its build. */
export function buildChoicesOf(builds: readonly BuildSummary[]): BuildChoice[] {
  return builds.map(build => ({ build, characterName: characterNameFor(build.name), inGroup: false, picked: false, busy: false, error: null }));
}

/**
 * Your saved builds, each with the character name it's on a list as. In
 * `pick` mode, you tick the ones to add and whoever shows them adds them
 * at once (your own list's Add builds); those on the list already say so.
 * In `manage` mode, each is added, renamed or taken out on its own (a list
 * of several builds' Add builds).
 */
@Component({
  selector: 'app-build-choices',
  templateUrl: './build-choices.component.html',
  styleUrls: ['../shared/list-dialog-parts.css', './build-choices.component.css'],
  // Not OnPush: whoever shows the choices updates them in place (an error, busy, now on the list), and
  // marks itself for check; these are checked along with it.
  changeDetection: ChangeDetectionStrategy.Eager
})
export class BuildChoicesComponent {
  /** Null while they load. */
  @Input() choices: BuildChoice[] | null = null;
  @Input() loadError: string | null = null;
  @Input() mode: 'pick' | 'manage' = 'manage';
  /** The list can take no more: nothing more is offered to add. */
  @Input() full = false;
  @Output() readonly add = new EventEmitter<BuildChoice>();
  @Output() readonly rename = new EventEmitter<BuildChoice>();
  @Output() readonly remove = new EventEmitter<BuildChoice>();

  readonly maxNameLength = MAX_CHARACTER_NAME_LENGTH;

  /** A name typed for a build to add picks it, as that's what it's for. */
  setCharacterName(choice: BuildChoice, value: string): void {
    choice.characterName = value;
    choice.error = null;
    if (this.mode === 'pick' && !choice.inGroup && !this.full) {
      choice.picked = true;
    }
  }

  setPicked(choice: BuildChoice, picked: boolean): void {
    choice.picked = picked;
    choice.error = null;
  }

  submit(choice: BuildChoice): void {
    if (this.mode === 'manage') {
      (choice.inGroup ? this.rename : this.add).emit(choice);
    }
  }
}
