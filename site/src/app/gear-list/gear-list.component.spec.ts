import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AppModule } from '../app.module';
import { EquippedService, VisibleSetBonus } from '../planner/equipped.service';
import { GearListComponent } from './gear-list.component';
import { Item } from '../gear/item';
import { AffixSourceHighlightService } from '../planner/affix-source-highlight.service';

describe('GearListComponent', () => {
  let component: GearListComponent;
  let fixture: ComponentFixture<GearListComponent>;
  const onboardingStateKey = 'ddo-planner-onboarding-state-v1';
  const legacyOnboardingKey = 'ddo-planner-onboarding-affix-type-opened';

  beforeEach(async () => {
    localStorage.removeItem(onboardingStateKey);
    localStorage.removeItem(legacyOnboardingKey);
    await TestBed.configureTestingModule({
      imports: [AppModule]
    })
      .compileComponents();
  });

  afterEach(() => {
    localStorage.removeItem(onboardingStateKey);
    localStorage.removeItem(legacyOnboardingKey);
  });

  function createComponentWithSetBonuses(setBonuses: Array<VisibleSetBonus>) {
    const equipped = TestBed.inject(EquippedService);
    vi.spyOn(equipped, 'getVisibleSetBonusesObservable').mockReturnValue(of(setBonuses));

    fixture = TestBed.createComponent(GearListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('should create', () => {
    createComponentWithSetBonuses([]);

    expect(component).toBeTruthy();
  });

  it('does not show the equipment/set divider when no sets are equipped', () => {
    createComponentWithSetBonuses([]);

    expect(fixture.nativeElement.querySelector('.equipment-set-divider')).toBeNull();
  });

  it('shows the equipment/set divider when sets are equipped', () => {
    createComponentWithSetBonuses([{
        setName: 'Test Set',
        pieces: 2,
        tiers: []
      }]);

    expect(fixture.nativeElement.querySelector('.equipment-set-divider')).not.toBeNull();
  });

  it('shows the set label and piece count on the top row with the set name beneath', () => {
    createComponentWithSetBonuses([{ setName: 'Test Set', pieces: 3, tiers: [] }]);

    const button = fixture.nativeElement.querySelector('.set-bonus-button');
    expect(button.querySelector('.set-name-row .set-label').textContent).toBe('Set');
    expect(button.querySelector('.set-name-row .set-piece-count').textContent).toBe('3 Equipped');
    expect(button.querySelector('.item-name').textContent).toBe('Test Set');
  });

  it('pairs the armor green cue with intro text and a skip action', () => {
    createComponentWithSetBonuses([]);
    const compiled: HTMLElement = fixture.nativeElement;

    expect(compiled.querySelector('.equipment-onboarding-hint')).not.toBeNull();
    expect(compiled.querySelector('.recommended-start-slot')).not.toBeNull();
    expect(compiled.textContent).toContain('Pick an armor item first');
    expect(compiled.querySelector('.onboarding-dismiss-button')?.textContent).toContain('Skip intro');
  });

  it('hides the armor onboarding cue when dismissed', () => {
    createComponentWithSetBonuses([]);

    component.dismissIntro();

    expect(component.shouldShowArmorStartHint()).toBe(false);
  });

  it('shows the slot cards weapons first, then head to toe', () => {
    createComponentWithSetBonuses([]);
    const slots = Array.from(fixture.nativeElement.querySelectorAll('app-equipment-slot-card') as NodeListOf<HTMLElement>)
      .map(card => card.dataset['jumpTarget']);

    expect(slots.slice(0, 5)).toEqual(['Weapon', 'Offhand', 'Helm', 'Goggles', 'Necklace']);
    expect(slots.indexOf('Boots')).toBeGreaterThan(slots.indexOf('Ring2'));
    expect(slots.indexOf('Ring2')).toBeGreaterThan(slots.indexOf('Belt'));
  });

  describe('jump-to-slot bar', () => {
    const realScrollIntoView = Element.prototype.scrollIntoView;
    let scrolledTo: Element[];

    beforeEach(() => {
      scrolledTo = [];
      // jsdom has no layout, so no scrollIntoView; record what would scroll.
      Element.prototype.scrollIntoView = function (this: Element) {
        scrolledTo.push(this);
      };
    });

    afterEach(() => {
      Element.prototype.scrollIntoView = realScrollIntoView;
    });

    function makeItem(name: string, slot: string, type: string) {
      return new Item({ name, slot, type, ml: 1, affixes: [], sets: [], url: '', crafting: [], quests: [] });
    }

    function bar(): HTMLElement {
      return fixture.nativeElement.querySelector('nav.slot-jump-bar');
    }

    function chip(slot: string): HTMLButtonElement {
      return Array.from(bar().querySelectorAll<HTMLButtonElement>('.slot-jump-chip'))
        .find(button => button.getAttribute('aria-label')!.startsWith(`${slot}:`))!;
    }

    function card(slot: string): HTMLElement {
      return fixture.nativeElement.querySelector(`[data-jump-target="${slot}"]`);
    }

    it('has a chip for every slot, in the grid\'s order', () => {
      createComponentWithSetBonuses([]);
      const chips = Array.from(bar().querySelectorAll('.slot-jump-chip'))
        .map(button => button.getAttribute('aria-label')!.split(':')[0])
        .filter(label => label !== 'Non-gear' && label !== 'Set');
      const cards = Array.from(fixture.nativeElement.querySelectorAll('app-equipment-slot-card'))
        .map(element => (element as HTMLElement).dataset['jumpTarget']!.replace(/^(\D+)(\d+)$/, '$1 $2'));

      expect(chips.length).toBeGreaterThan(0);
      expect(chips).toEqual(cards);
    });

    it('marks a slot with something in it, and names the item', () => {
      createComponentWithSetBonuses([]);
      TestBed.inject(EquippedService).set(makeItem('Test Boots', 'Boots', 'Boots'));
      fixture.detectChanges();

      expect(chip('Boots').classList).toContain('is-equipped');
      expect(chip('Boots').title).toBe('Boots: Test Boots');
      expect(chip('Helm').classList).not.toContain('is-equipped');
      expect(chip('Helm').title).toBe('Helm: empty');
    });

    it('numbers the rings, for when the chips show icons only', () => {
      createComponentWithSetBonuses([]);

      expect(chip('Ring 1').querySelector('.slot-jump-number')!.textContent).toBe('1');
      expect(chip('Ring 2').querySelector('.slot-jump-number')!.textContent).toBe('2');
      expect(chip('Helm').querySelector('.slot-jump-number')).toBeNull();
    });

    it('marks the offhand unavailable while a two-handed weapon is equipped', () => {
      createComponentWithSetBonuses([]);
      TestBed.inject(EquippedService).set(makeItem('Test Great Sword', 'Weapon', 'Great Swords'));
      fixture.detectChanges();

      expect(chip('Offhand').classList).toContain('is-disabled');
      expect(chip('Offhand').title).toContain('unavailable');
    });

    it('scrolls to the slot\'s card and highlights it', () => {
      createComponentWithSetBonuses([]);

      chip('Helm').click();

      expect(scrolledTo).toEqual([card('Helm')]);
      expect(card('Helm').classList).toContain('slot-jump-highlight');
    });

    it('moves the highlight when another slot is chosen', () => {
      createComponentWithSetBonuses([]);

      chip('Helm').click();
      chip('Boots').click();

      expect(card('Helm').classList).not.toContain('slot-jump-highlight');
      expect(card('Boots').classList).toContain('slot-jump-highlight');
    });
    it('ends with a Non-gear chip, filled once there is a non-gear entry', () => {
      createComponentWithSetBonuses([]);
      expect(chip('Non-gear').classList).not.toContain('is-equipped');
      expect(chip('Non-gear').title).toBe('Non-gear: none');

      TestBed.inject(EquippedService).addExternalAffixValue('Strength', 'Enhancement', 4, 'Spell');
      fixture.detectChanges();

      expect(chip('Non-gear').classList).toContain('is-equipped');
      expect(chip('Non-gear').title).toBe('Non-gear: 1 entry');
    });

    it('jumps to the non-gear card', () => {
      createComponentWithSetBonuses([]);

      chip('Non-gear').click();

      expect(scrolledTo).toEqual([fixture.nativeElement.querySelector('app-external-affix-slot-card')]);
    });

    it('has a chip for each set with an active bonus, and none for a set without one', () => {
      createComponentWithSetBonuses([
        { setName: 'Active Set', pieces: 3, tiers: [{ threshold: 2, eligible: true, affixes: [] }] },
        { setName: 'Idle Set', pieces: 1, tiers: [{ threshold: 2, eligible: false, affixes: [] }] }
      ] as Array<VisibleSetBonus>);
      const setChips = Array.from(bar().querySelectorAll<HTMLElement>('.slot-jump-chip.is-set-single'));

      expect(setChips.map(element => element.title)).toEqual(['Set: Active Set (3 equipped)']);
      expect(setChips[0].querySelector('.slot-jump-number')!.textContent).toBe('3');
    });

    it('jumps to a set\'s card', () => {
      createComponentWithSetBonuses([
        { setName: 'Active Set', pieces: 3, tiers: [{ threshold: 2, eligible: true, affixes: [] }] }
      ] as Array<VisibleSetBonus>);

      bar().querySelector<HTMLButtonElement>('.slot-jump-chip.is-set-single')!.click();

      expect(scrolledTo).toEqual([fixture.nativeElement.querySelector('.active-set-bonus')]);
    });

    it('lights the chips supplying the bonus type hovered on the affix panel', () => {
      createComponentWithSetBonuses([
        { setName: 'Active Set', pieces: 3, tiers: [{ threshold: 2, eligible: true, affixes: [] }] }
      ] as Array<VisibleSetBonus>);
      const equipped = TestBed.inject(EquippedService);
      vi.spyOn(equipped, 'getSourcesForAffixType').mockReturnValue([
        { kind: 'item', slot: 'Belt', itemName: 'A Belt', affixName: 'Strength', bonusType: 'Enhancement', value: 4 },
        { kind: 'set', slot: 'Set', itemName: 'Active Set', affixName: 'Strength', bonusType: 'Enhancement', value: 4 },
        { kind: 'external', slot: 'Non-gear', itemName: 'Spell', affixName: 'Strength', bonusType: 'Enhancement', value: 4 }
      ]);
      const highlight = TestBed.inject(AffixSourceHighlightService);
      const lit = () => Array.from(bar().querySelectorAll<HTMLElement>('.slot-jump-chip.is-source')).map(element => element.title);

      highlight.showSourcesOf('Strength', 'Enhancement');
      fixture.detectChanges();

      expect(lit()).toEqual(['Belt: empty', 'Non-gear: none', 'Set: Active Set (3 equipped)', 'Sets: 1 with active bonuses']);

      highlight.clear();
      fixture.detectChanges();

      expect(lit()).toEqual([]);
    });
    describe('when the bar is short of room', () => {
      const twoSets = [
        { setName: 'First Set', pieces: 3, tiers: [{ threshold: 2, eligible: true, affixes: [] }] },
        { setName: 'Second Set', pieces: 2, tiers: [{ threshold: 2, eligible: true, affixes: [] }] }
      ] as Array<VisibleSetBonus>;

      function mergedChip(): HTMLButtonElement {
        return bar().querySelector<HTMLButtonElement>('.is-set-merged')!;
      }

      function menu(): HTMLElement | null {
        return fixture.nativeElement.querySelector('.slot-jump-set-menu');
      }

      /** jsdom has no layout: give the bar a width, and a content width per layout. */
      function fakeBarWidths(clientWidth: number, contentWidthFor: (classes: DOMTokenList) => number) {
        Object.defineProperty(bar(), 'clientWidth', { configurable: true, get: () => clientWidth });
        Object.defineProperty(bar(), 'scrollWidth', { configurable: true, get: () => contentWidthFor(bar().classList) });
      }

      const contentWidth = (classes: DOMTokenList) =>
        classes.contains('show-labels') ? 1500
          : classes.contains('merge-sets') ? 550
            : classes.contains('dense') ? 620
              : 820;

      it('takes the roomiest layout that fits, and hides the bar when none does', () => {
        createComponentWithSetBonuses(twoSets);
        const fitFor = (width: number) => {
          fakeBarWidths(width, contentWidth);
          component.fitJumpBar();
          return Array.from(bar().classList).filter(name => name !== 'slot-jump-bar');
        };

        expect(fitFor(1600)).toEqual(['show-labels']);
        expect(fitFor(900)).toEqual([]);
        expect(fitFor(700)).toEqual(['dense']);
        expect(fitFor(560)).toEqual(['dense', 'merge-sets']);
        expect(fitFor(400)).toEqual(['dense', 'merge-sets', 'no-room']);
        expect(fitFor(1600)).toEqual(['show-labels']);
      });

      it('leaves a hidden bar alone', () => {
        createComponentWithSetBonuses(twoSets);
        fakeBarWidths(0, contentWidth);

        component.fitJumpBar();

        expect(Array.from(bar().classList)).toEqual(['slot-jump-bar']);
      });

      it('has one chip for all the sets, opening a menu of them', () => {
        createComponentWithSetBonuses(twoSets);
        expect(mergedChip().title).toBe('Sets: 2 with active bonuses');
        expect(menu()).toBeNull();

        mergedChip().click();
        fixture.detectChanges();

        expect(mergedChip().getAttribute('aria-expanded')).toBe('true');
        expect(Array.from(menu()!.querySelectorAll('.slot-jump-set-name')).map(name => name.textContent))
          .toEqual(['First Set', 'Second Set']);
      });

      it('jumps to the set picked from the menu, and closes it', () => {
        createComponentWithSetBonuses(twoSets);
        mergedChip().click();
        fixture.detectChanges();

        menu()!.querySelectorAll<HTMLButtonElement>('.slot-jump-set-item')[1].click();
        fixture.detectChanges();

        expect(scrolledTo).toEqual([fixture.nativeElement.querySelectorAll('.active-set-bonus')[1]]);
        expect(menu()).toBeNull();
      });

      it('closes the menu on Escape, and on a click elsewhere', () => {
        createComponentWithSetBonuses(twoSets);
        mergedChip().click();
        fixture.detectChanges();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        fixture.detectChanges();

        expect(menu()).toBeNull();

        mergedChip().click();
        fixture.detectChanges();
        document.body.click();
        fixture.detectChanges();

        expect(menu()).toBeNull();
      });
    });
  });
});
