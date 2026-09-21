import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { EquippedService } from '../planner/equipped.service';
import { ExternalAffixFormComponent } from './external-affix-form.component';

describe('ExternalAffixFormComponent', () => {
  let fixture: ComponentFixture<ExternalAffixFormComponent>;
  let equipped: EquippedService;
  let done: number;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AppModule] }).compileComponents();
    equipped = TestBed.inject(EquippedService);
    fixture = TestBed.createComponent(ExternalAffixFormComponent);
    done = 0;
    fixture.componentInstance.done.subscribe(() => done++);
  });

  const el = () => fixture.nativeElement as HTMLElement;

  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function open(affixName: string, bonusType: string) {
    fixture.componentRef.setInput('affixName', affixName);
    fixture.componentRef.setInput('bonusType', bonusType);
    await settle();
  }

  async function type(selector: string, text: string) {
    const input = el().querySelector<HTMLInputElement>(selector)!;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await settle();
  }

  function button(text: string) {
    return Array.from(el().querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent!.trim() === text)!;
  }

  it('needs a source and a value before Add is enabled', async () => {
    await open('Strength', 'Insight');
    expect(button('Add').disabled).toBe(true);

    await type('.external-affix-label-input', 'Trance');
    expect(button('Add').disabled).toBe(true);

    await type('.external-affix-value-input', '5');
    expect(button('Add').disabled).toBe(false);
  });

  it('records the value under the trimmed source and reports it done', async () => {
    await open('Strength', 'Insight');
    await type('.external-affix-label-input', '  Trance ');
    await type('.external-affix-value-input', '5');

    button('Add').click();

    expect(equipped.getExternalAffixesForType('Strength', 'Insight'))
      .toEqual([expect.objectContaining({ kind: 'value', value: 5, label: 'Trance' })]);
    expect(done).toBe(1);
  });

  it('clears itself after recording, ready for the next entry', async () => {
    await open('Strength', 'Insight');
    await type('.external-affix-label-input', 'Trance');
    await type('.external-affix-value-input', '5');
    button('Add').click();
    await settle();

    expect(el().querySelector<HTMLInputElement>('.external-affix-label-input')!.value).toBe('');
    expect(button('Add').disabled).toBe(true);
  });

  it('records a checklist type as covered once the box is ticked', async () => {
    await open('Feather Falling', 'Bool');
    expect(el().querySelector('.external-affix-value-input')).toBeNull();
    await type('.external-affix-label-input', 'Ring');
    expect(button('Add').disabled).toBe(true);

    el().querySelector<HTMLInputElement>('.external-affix-checkbox-label input')!.click();
    await settle();
    button('Add').click();

    expect(equipped.getExternalAffixesForType('Feather Falling', 'Bool'))
      .toEqual([expect.objectContaining({ kind: 'value', value: 1, label: 'Ring' })]);
  });

  it('ignores the combination, labelled Ignored when no source was typed', async () => {
    await open('Strength', 'Insight');

    button('Ignore').click();

    expect(equipped.getExternalAffixesForType('Strength', 'Insight'))
      .toEqual([expect.objectContaining({ kind: 'ignored', label: 'Ignored' })]);
    expect(done).toBe(1);
  });

  it('cannot ignore once a value has been started', async () => {
    await open('Strength', 'Insight');
    await type('.external-affix-value-input', '5');

    expect(button('Ignore').disabled).toBe(true);
  });
});
