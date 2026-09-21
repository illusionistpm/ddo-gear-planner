import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { ExternalAffixEntry } from '../affixes/external-affix';
import { ExternalAffixValueComponent } from './external-affix-value.component';

describe('ExternalAffixValueComponent', () => {
  let fixture: ComponentFixture<ExternalAffixValueComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AppModule] }).compileComponents();
    fixture = TestBed.createComponent(ExternalAffixValueComponent);
  });

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent!.replace(/\s+/g, ' ').trim();
  const box = () => el().querySelector('.fa-check-square');

  function show(entry: Partial<ExternalAffixEntry>, includeLabel = false) {
    fixture.componentRef.setInput('entry', { id: '1', affixName: 'Strength', bonusType: 'Insight', kind: 'value', value: 3, label: 'Spell', ...entry });
    fixture.componentRef.setInput('includeLabel', includeLabel);
    fixture.detectChanges();
  }

  it('shows a value with its bonus type', () => {
    show({});

    expect(text()).toBe('+3 Insight');
    expect(box()).toBeNull();
  });

  it('appends the label when asked', () => {
    show({}, true);

    expect(text()).toBe('+3 Insight (Spell)');
  });

  it('shows a covered checklist entry as a checked box named "Covered"', () => {
    show({ affixName: 'Feather Falling', bonusType: 'Bool', value: 1 });

    expect(text()).toBe('');
    expect(box()?.getAttribute('aria-label')).toBe('Covered');
  });

  it('keeps the label beside the checked box when asked', () => {
    show({ affixName: 'Feather Falling', bonusType: 'Bool', value: 1 }, true);

    expect(box()).not.toBeNull();
    expect(text()).toBe('(Spell)');
  });

  it('shows an ignored entry as words, even for a checklist type', () => {
    show({ kind: 'ignored', bonusType: 'Bool', value: 0 });

    expect(text()).toBe('Ignored');
    expect(box()).toBeNull();
  });
});
