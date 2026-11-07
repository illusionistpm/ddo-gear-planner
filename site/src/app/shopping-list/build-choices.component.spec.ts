import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BuildChoice, buildChoicesOf, BuildChoicesComponent } from './build-choices.component';

describe('BuildChoicesComponent', () => {
  let fixture: ComponentFixture<BuildChoicesComponent>;
  let choices: BuildChoice[];

  const el = () => fixture.nativeElement as HTMLElement;
  const rows = () => Array.from(el().querySelectorAll<HTMLElement>('.build-choice'));
  const show = (mode: 'pick' | 'manage', inputs: { full?: boolean } = {}) => {
    fixture.componentRef.setInput('mode', mode);
    fixture.componentRef.setInput('choices', choices);
    fixture.componentRef.setInput('full', inputs.full ?? false);
    fixture.detectChanges();
  };

  beforeEach(() => {
    choices = buildChoicesOf([
      { id: 'b1', shortId: 's1', name: 'Tank build' },
      { id: 'b2', shortId: 's2', name: 'My alt with a long name' }
    ]);
    fixture = TestBed.createComponent(BuildChoicesComponent);
  });

  it('names each build\'s character after it, as much as fits', () => {
    expect(choices.map(choice => choice.characterName)).toEqual(['Tank build', 'My alt with a long n']);
  });

  it('says so while they load, when they couldn\'t, and when there are none', () => {
    fixture.detectChanges();
    expect(el().textContent).toContain('Loading your builds');

    fixture.componentRef.setInput('loadError', 'Couldn\'t load your builds.');
    fixture.detectChanges();
    expect(el().querySelector('[role="alert"]')?.textContent).toContain('Couldn\'t load');

    fixture.componentRef.setInput('loadError', null);
    fixture.componentRef.setInput('choices', []);
    fixture.detectChanges();
    expect(el().textContent).toContain('You haven\'t saved any other builds yet');
  });

  describe('to pick', () => {
    it('ticks builds, and picks one whose character you name', () => {
      show('pick');

      const box = rows()[0].querySelector<HTMLInputElement>('input[type="checkbox"]')!;
      box.checked = true;
      box.dispatchEvent(new Event('change'));
      const name = rows()[1].querySelector<HTMLInputElement>('.build-choice-input')!;
      name.value = 'Thane';
      name.dispatchEvent(new Event('input'));

      expect(choices.map(choice => [choice.picked, choice.characterName])).toEqual([[true, 'Tank build'], [true, 'Thane']]);
    });

    it('shows a build on the list already as on it, not to pick', () => {
      choices[0].inGroup = true;
      show('pick');

      expect(rows()[0].textContent).toContain('On the list as Tank build');
      expect(rows()[0].querySelector<HTMLInputElement>('input[type="checkbox"]')!.disabled).toBe(true);
      expect(rows()[0].querySelector('.build-choice-input')).toBeNull();
    });

    it('offers no more once the list would be full, but lets you untick', () => {
      choices[1].picked = true;
      show('pick', { full: true });

      const [first, second] = rows().map(row => row.querySelector<HTMLInputElement>('input[type="checkbox"]')!);
      expect(first.disabled).toBe(true);
      expect(second.disabled).toBe(false);
    });
  });

  describe('to manage', () => {
    it('adds, renames and takes out each build on its own, Enter doing whichever it can', () => {
      choices[0].inGroup = true;
      show('manage');
      const added: string[] = [];
      const renamed: string[] = [];
      const removed: string[] = [];
      fixture.componentInstance.add.subscribe(choice => added.push(choice.build.id));
      fixture.componentInstance.rename.subscribe(choice => renamed.push(choice.build.id));
      fixture.componentInstance.remove.subscribe(choice => removed.push(choice.build.id));
      const button = (row: HTMLElement, label: string) => Array.from(row.querySelectorAll<HTMLButtonElement>('button'))
        .find(candidate => candidate.textContent?.trim() === label)!;

      button(rows()[0], 'Rename').click();
      button(rows()[0], 'Take out').click();
      button(rows()[1], 'Add').click();
      rows()[1].querySelector('.build-choice-input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      rows()[0].querySelector('.build-choice-input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(added).toEqual(['b2', 'b2']);
      expect(renamed).toEqual(['b1', 'b1']);
      expect(removed).toEqual(['b1']);
      // Naming one doesn't pick it here: each is added by its own button.
      expect(choices[1].picked).toBe(false);
    });

    it('offers nothing more to add once the list is full', () => {
      show('manage', { full: true });

      expect(rows()[0].querySelector<HTMLButtonElement>('.pill-button.primary')!.disabled).toBe(true);
    });
  });
});
