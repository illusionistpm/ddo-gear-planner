import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, SimpleChanges, ViewChild } from '@angular/core';

export const MAX_BUILD_NAME_LENGTH = 60;

/**
 * Trims whitespace, rejects empty-after-trim, caps length. Mirrored
 * server-side in worker/src/routes/builds.ts's validateName() - client-side
 * validation alone isn't a real guarantee since the API is callable
 * directly.
 */
export function validateBuildName(name: string): string | null {
  const trimmed = name.trim();
  return trimmed && trimmed.length <= MAX_BUILD_NAME_LENGTH ? trimmed : null;
}

@Component({
  selector: 'app-save-build-dialog',
  templateUrl: './save-build-dialog.component.html',
  styleUrls: ['./save-build-dialog.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false
})
export class SaveBuildDialogComponent {
  @Input() mode: 'create' | 'rename' | 'save-as' = 'create';
  @Input() initialName = '';
  @Input() saving = false;
  @Input() errorMessage: string | null = null;

  @Output() confirmed = new EventEmitter<string>();
  @Output() cancelled = new EventEmitter<void>();

  @ViewChild('nameInput') private readonly nameInputRef?: ElementRef<HTMLInputElement>;

  name = '';

  readonly maxLength = MAX_BUILD_NAME_LENGTH;

  ngOnChanges(changes: SimpleChanges): void {
    // Only reseed from initialName when it actually changes (opening the
    // dialog for a new build/mode) - not on every input change. `saving`
    // flips true the instant the user clicks confirm, which is well before
    // this dialog closes; resetting `name` unconditionally on that change
    // too briefly reverted the field to the original name while "Saving…"
    // showed, even though the already-emitted (correct) name is what
    // actually gets saved.
    if (changes['initialName']) {
      this.name = this.initialName;
    }
  }

  get trimmedLength(): number {
    return this.name.trim().length;
  }

  get isValid(): boolean {
    return validateBuildName(this.name) !== null;
  }

  get title(): string {
    switch (this.mode) {
      case 'rename': return 'Rename build';
      case 'save-as': return 'Save a copy as…';
      default: return 'Save build';
    }
  }

  get confirmLabel(): string {
    return this.mode === 'rename' ? 'Rename' : 'Save';
  }

  onBackdropClick(): void {
    if (!this.saving) {
      this.cancelled.emit();
    }
  }

  submit(): void {
    const validated = validateBuildName(this.name);
    if (!validated || this.saving) {
      return;
    }
    this.confirmed.emit(validated);
  }

  focusInput(): void {
    this.nameInputRef?.nativeElement.focus();
  }
}
