import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';

import { SaveBuildDialogComponent, validateBuildName } from './save-build-dialog.component';

describe('validateBuildName', () => {
  it('accepts a normal name', () => {
    expect(validateBuildName('My Awesome Build')).toBe('My Awesome Build');
  });

  it('trims surrounding whitespace', () => {
    expect(validateBuildName('  Padded  ')).toBe('Padded');
  });

  it('rejects an empty or whitespace-only name', () => {
    expect(validateBuildName('')).toBeNull();
    expect(validateBuildName('   ')).toBeNull();
  });

  it('rejects a name over 60 characters', () => {
    expect(validateBuildName('a'.repeat(61))).toBeNull();
  });

  it('accepts a name at exactly the 60 character limit', () => {
    expect(validateBuildName('a'.repeat(60))).toBe('a'.repeat(60));
  });
});

describe('SaveBuildDialogComponent', () => {
  let fixture: ComponentFixture<SaveBuildDialogComponent>;
  let component: SaveBuildDialogComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [SaveBuildDialogComponent],
      imports: [FormsModule]
    });
    fixture = TestBed.createComponent(SaveBuildDialogComponent);
    component = fixture.componentInstance;
  });

  it('seeds the name field from initialName on changes', () => {
    component.initialName = 'Existing Build';
    component.ngOnChanges({ initialName: {} as any });
    expect(component.name).toBe('Existing Build');
  });

  it('does not reseed the name field when an unrelated input changes (e.g. saving)', () => {
    // Regression test: ngOnChanges used to unconditionally reset name from
    // initialName on ANY input change - saving flips true the instant the
    // user clicks confirm (submit() has already emitted the typed name by
    // then, so the save itself is unaffected), which briefly reverted the
    // visible field to the dialog's original name while "Saving…" showed.
    component.initialName = 'Existing Build';
    component.ngOnChanges({ initialName: {} as any });
    component.name = 'My New Name';

    component.saving = true;
    component.ngOnChanges({ saving: {} as any });

    expect(component.name).toBe('My New Name');
  });

  it('does not emit confirmed for an invalid name', () => {
    const spy = vi.fn().mockName('confirmed');
    component.confirmed.subscribe(spy);
    component.name = '   ';

    component.submit();

    expect(spy).not.toHaveBeenCalled();
  });

  it('emits the trimmed name on submit when valid', () => {
    const spy = vi.fn().mockName('confirmed');
    component.confirmed.subscribe(spy);
    component.name = '  My Build  ';

    component.submit();

    expect(spy).toHaveBeenCalledWith('My Build');
  });

  it('does not emit confirmed while saving', () => {
    const spy = vi.fn().mockName('confirmed');
    component.confirmed.subscribe(spy);
    component.name = 'My Build';
    component.saving = true;

    component.submit();

    expect(spy).not.toHaveBeenCalled();
  });

  it('shows the right title and confirm label per mode', () => {
    component.mode = 'create';
    expect(component.title).toBe('Save build');
    expect(component.confirmLabel).toBe('Save');

    component.mode = 'rename';
    expect(component.title).toBe('Rename build');
    expect(component.confirmLabel).toBe('Rename');

    component.mode = 'save-as';
    expect(component.title).toBe('Save a copy as…');
    expect(component.confirmLabel).toBe('Save');
  });

  it('does not close on backdrop click while saving', () => {
    const spy = vi.fn().mockName('cancelled');
    component.cancelled.subscribe(spy);
    component.saving = true;

    component.onBackdropClick();

    expect(spy).not.toHaveBeenCalled();
  });

  it('closes on backdrop click when not saving', () => {
    const spy = vi.fn().mockName('cancelled');
    component.cancelled.subscribe(spy);

    component.onBackdropClick();

    expect(spy).toHaveBeenCalled();
  });
});
