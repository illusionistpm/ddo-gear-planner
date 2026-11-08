import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BuildChoice, buildChoicesOf, BuildChoicesComponent, RENAME_DELAY_MS } from './build-choices.component';

describe('BuildChoicesComponent', () => {
  let fixture: ComponentFixture<BuildChoicesComponent>;
  let choices: BuildChoice[];
  let toggled: [string, boolean][];
  let renamed: string[];

  const el = () => fixture.nativeElement as HTMLElement;
  const rows = () => Array.from(el().querySelectorAll<HTMLElement>('.build-choice'));
  const box = (row: HTMLElement) => row.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  const nameInput = (row: HTMLElement) => row.querySelector<HTMLInputElement>('.build-choice-input')!;
  const reset = (row: HTMLElement) => row.querySelector<HTMLButtonElement>('.build-choice-reset');
  const show = (mode: 'pick' | 'manage', inputs: { full?: boolean } = {}) => {
    fixture.componentRef.setInput('mode', mode);
    fixture.componentRef.setInput('choices', choices);
    fixture.componentRef.setInput('full', inputs.full ?? false);
    fixture.componentRef.setInput('currentBuildId', 'b2');
    fixture.detectChanges();
  };
  const tick = (row: HTMLElement, checked: boolean) => {
    if (box(row).checked !== checked) {
      box(row).click();
    }
    fixture.detectChanges();
  };
  const type = (row: HTMLElement, value: string) => {
    nameInput(row).value = value;
    nameInput(row).dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  beforeEach(() => {
    choices = buildChoicesOf([
      { id: 'b1', shortId: 's1', name: 'Tank build' },
      { id: 'b2', shortId: 's2', name: 'My alt with a long name' }
    ], 'b2');
    toggled = [];
    renamed = [];
    fixture = TestBed.createComponent(BuildChoicesComponent);
    fixture.componentInstance.ticked.subscribe(({ choice, on }) => toggled.push([choice.build.id, on]));
    fixture.componentInstance.rename.subscribe(choice => renamed.push(`${choice.build.id}:${choice.characterName}`));
  });

  afterEach(() => vi.useRealTimers());

  it('puts the build on screen first, chosen, each named after its build as much as fits', () => {
    expect(choices.map(choice => [choice.build.id, choice.picked, choice.characterName])).toEqual([
      ['b2', true, 'My alt with a long n'], ['b1', false, 'Tank build']
    ]);
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
    expect(el().textContent).toContain('You haven\'t saved any builds yet');
  });

  it('heads its columns, and marks this build', () => {
    show('pick');

    expect(Array.from(el().querySelectorAll('.build-grid-head span'), heading => heading.textContent)).toEqual(['', 'Build', 'Character name']);
    expect(rows()[0].querySelector('.build-choice-this')?.textContent).toBe('this build');
    expect(rows()[1].querySelector('.build-choice-this')).toBeNull();
    // The build's name ticks its box.
    expect(rows()[1].querySelector('label')!.getAttribute('for')).toBe(box(rows()[1]).id);
  });

  describe('for a list not started yet', () => {
    it('gathers the ticks, this build\'s among them and yours to untick, and picks a build whose character you name', () => {
      show('pick');
      expect(box(rows()[0]).checked).toBe(true);

      tick(rows()[0], false);
      type(rows()[1], 'Thane');

      expect(choices.map(choice => [choice.build.id, choice.picked, choice.characterName])).toEqual([
        ['b2', false, 'My alt with a long n'], ['b1', true, 'Thane']
      ]);
      expect(toggled).toEqual([]);
      expect(renamed).toEqual([]);
    });

    it('offers no more once the list would be full, saying why, but lets you untick', () => {
      show('pick', { full: true });

      expect(box(rows()[0]).disabled).toBe(false);
      expect(box(rows()[1]).disabled).toBe(true);
      expect(box(rows()[1]).title).toBe('A list holds up to 12 builds');
    });
  });

  describe('for a list in progress', () => {
    beforeEach(() => {
      choices[1].inGroup = true;
    });

    it('ticks and unticks builds on and off it, as asked, the box showing the list rather than the click', () => {
      show('manage');
      expect(rows().map(row => box(row).checked)).toEqual([false, true]);

      tick(rows()[0], true);
      tick(rows()[1], false);

      expect(toggled).toEqual([['b2', true], ['b1', false]]);
      // Nothing put them on or took them off the list here, so the boxes go back as they were.
      expect(rows().map(row => box(row).checked)).toEqual([false, true]);
    });

    it('saves a character\'s name once you\'ve stopped typing it, not before', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      show('manage');

      type(rows()[1], 'Kir');
      vi.advanceTimersByTime(RENAME_DELAY_MS - 1);
      type(rows()[1], 'Kira');
      vi.advanceTimersByTime(RENAME_DELAY_MS - 1);
      expect(renamed).toEqual([]);

      vi.advanceTimersByTime(1);
      expect(renamed).toEqual(['b1:Kira']);
      // Naming one doesn't put it on the list: its box does.
      type(rows()[0], 'Thane');
      vi.advanceTimersByTime(RENAME_DELAY_MS);
      expect(renamed).toEqual(['b1:Kira']);
      expect(toggled).toEqual([]);
    });

    it('offers to put a name back as the build\'s own, saving it at once', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      show('manage');
      expect(reset(rows()[1])).toBeNull();

      type(rows()[1], 'Kira');
      expect(reset(rows()[1])!.title).toBe('Back to Tank build');
      reset(rows()[1])!.click();
      fixture.detectChanges();

      expect(nameInput(rows()[1]).value).toBe('Tank build');
      expect(reset(rows()[1])).toBeNull();
      expect(renamed).toEqual(['b1:Tank build']);
      vi.advanceTimersByTime(RENAME_DELAY_MS);
      expect(renamed).toEqual(['b1:Tank build']);
    });

    it('saves a name still being typed when it closes', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      show('manage');
      type(rows()[1], 'Kira');

      fixture.destroy();

      expect(renamed).toEqual(['b1:Kira']);
    });
  });
});
