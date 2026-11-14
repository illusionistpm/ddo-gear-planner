import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { FiltersComponent } from './filters.component';
import { NO_PACK_KEY } from '../gear/pack-filter';
import { EquippedService } from '../planner/equipped.service';
import { GearDbService } from '../gear/gear-db.service';
import { ItemBonusService } from '../gear/item-bonus.service';
import { ItemBonusSettingsService } from '../planner/item-bonus-settings.service';

describe('FiltersComponent', () => {
  let component: FiltersComponent;
  let fixture: ComponentFixture<FiltersComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppModule]
    })
      .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(FiltersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('starts with all pack options checked', () => {
    expect(component.packOptions.length).toBeGreaterThan(0);
    expect(component.packOptions.every(option => option.value)).toBe(true);
  });

  /** The checkbox whose label starts with this text, within the pack panel. */
  function checkbox(labelStart: string): HTMLInputElement {
    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLLabelElement>('#packFilters label')
    );
    const label = labels.find(candidate => candidate.textContent!.trim().startsWith(labelStart));
    if (!label) {
      throw new Error(`No pack panel checkbox labelled "${labelStart}"`);
    }
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(`#${label.htmlFor}`)!;
  }

  function button(text: string): HTMLButtonElement {
    const found = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.filters-shell button'))
      .find(candidate => candidate.textContent!.trim() === text);
    if (!found) {
      throw new Error(`No pack panel button "${text}"`);
    }
    return found;
  }

  /** Awaited: checkboxes the press reveals take their ngModel value a microtask later. */
  async function press(text: string): Promise<void> {
    button(text).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function click(labelStart: string): void {
    checkbox(labelStart).click();
    fixture.detectChanges();
  }

  /** Pack names under a group heading, in the order shown. */
  function groupPacks(title: string): string[] {
    const group = component.packGroups.find(candidate => candidate.title === title)!;
    return group.options.map(option => option.name);
  }

  function hiddenPacks(): Set<string> {
    let hidden = new Set<string>();
    component.filters.getItemFilters().subscribe(filters => hidden = filters.hiddenPacks).unsubscribe();
    return hidden;
  }

  it('lists free quests, the DDO Store and events first', () => {
    const names = component.packOptions.map(option => option.name);

    expect(names.slice(0, 3)).toEqual(['Free Quests', 'DDO Store', 'Events']);
    expect(groupPacks('Free and other')).toEqual(['Free Quests', 'DDO Store', 'Events']);
  });

  it('lists expansions apart from adventure packs, each oldest first', () => {
    const expansions = groupPacks('Expansions');
    const packs = groupPacks('Adventure packs');

    expect(expansions.slice(0, 3)).toEqual(['Menace of the Underdark', 'Shadowfell Conspiracy', 'Mists of Ravenloft']);
    expect(packs).not.toContain('Mists of Ravenloft');
    // Sold only inside Shadowfell Conspiracy, so not packs of their own.
    expect(component.packOptions.map(option => option.name)).not.toContain('Shadow Over Wheloon');
    expect(packs.indexOf("Delera's Tomb")).toBeLessThan(packs.indexOf('Attack on Stormreach'));
    expect(packs.indexOf('Attack on Stormreach')).toBeLessThan(packs.indexOf('Keep on the Borderlands'));
    // Every listed pack is in exactly one group.
    expect(component.packGroups.flatMap(group => group.options).length).toBe(component.packOptions.length);
  });

  it('sorts the packs by name on request', async () => {
    await press('Only packs I own');
    await press('Name');

    const packs = groupPacks('Adventure packs');
    expect(packs).toEqual([...packs].sort((left, right) => left.localeCompare(right)));
    expect(button('Name').getAttribute('aria-pressed')).toBe('true');
  });

  it('starts on every pack, with the checklist put away', () => {
    expect(button('Every pack').getAttribute('aria-pressed')).toBe('true');
    expect((fixture.nativeElement as HTMLElement).querySelector('#packFilters')).toBeNull();
    expect(hiddenPacks().size).toBe(0);
  });

  function couponSelect(): HTMLSelectElement {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>('#questingCoupon')!;
  }

  /** Picks the yearly coupon whose option starts with this text ("None", "2020"). */
  function pickCoupon(optionStart: string): void {
    const select = couponSelect();
    const option = Array.from(select.options).find(candidate => candidate.textContent!.trim().startsWith(optionStart))!;
    select.value = option.value;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  it('starts "Only packs I own" from the free content, the newest coupon and the expansions coupon', async () => {
    await press('Only packs I own');

    const hidden = hiddenPacks();
    expect(hidden.has(NO_PACK_KEY)).toBe(false);
    expect(hidden.has('DDO Store')).toBe(false);
    // On the 2026 coupon, and on the expansions coupon.
    expect(hidden.has("Delera's Tomb")).toBe(false);
    expect(hidden.has('Mists of Ravenloft')).toBe(false);
    // On neither.
    expect(hidden.has('Tavern Tales')).toBe(true);
    expect(hidden.has('Vecna Unleashed')).toBe(true);
    expect(couponSelect().selectedOptions[0].textContent).toContain('NATURAL20');
    expect(checkbox('2026 free expansions coupon').checked).toBe(true);
  });

  it('lists the yearly coupons newest first', async () => {
    await press('Only packs I own');

    const years = Array.from(couponSelect().options).map(option => option.textContent!.trim().slice(0, 4));
    expect(years).toEqual(['None', '2026', '2025', '2024', '2023', '2021', '2020']);
  });

  it('ticks the packs the chosen yearly coupon granted, and only those', async () => {
    await press('Only packs I own');
    pickCoupon('2020');

    const hidden = hiddenPacks();
    // On the 2020 coupon.
    expect(hidden.has("Delera's Tomb")).toBe(false);
    expect(hidden.has('The Lost Gatekeepers')).toBe(false);
    // Added by the 2021 coupon, and never on any coupon.
    expect(hidden.has('Peril of the Planar Eyes')).toBe(true);
    expect(hidden.has('Tavern Tales')).toBe(true);
    expect(couponSelect().selectedOptions[0].textContent).toContain('DDOFREEQUESTS');
  });

  it('swaps one yearly coupon for another, keeping packs ticked by hand', async () => {
    await press('Only packs I own');
    pickCoupon('2021');
    click('Tavern Tales');
    pickCoupon('2024');

    const hidden = hiddenPacks();
    expect(hidden.has("Delera's Tomb")).toBe(false);
    expect(hidden.has('Hunter and Hunted')).toBe(false);
    // On the 2021 coupon but not the 2024 one.
    expect(hidden.has('Vaults of the Artificers')).toBe(true);
    expect(hidden.has('Tavern Tales')).toBe(false);
    expect(couponSelect().selectedOptions[0].textContent).toContain('2024');

    pickCoupon('None');

    expect(hiddenPacks().has("Delera's Tomb")).toBe(true);
    expect(hiddenPacks().has('Tavern Tales')).toBe(false);
  });

  it('shows the coupon a build\'s packs amount to', async () => {
    const coupon2025 = component.questingCoupons.find(coupon => coupon.year === '2025')!;
    const owned = new Set(coupon2025.options.map(option => option.name));
    component.filters.setHiddenPacks(new Set(
      component.packOptions.filter(option => option.year && !owned.has(option.name)).map(option => option.name)
    ));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // 2025 and 2026 granted the same packs; the newer one is shown.
    expect(couponSelect().selectedOptions[0].textContent).toContain('2026');
  });

  it('offers the free expansions coupon as its own tick', async () => {
    await press('Only packs I own');
    click('2026 free expansions coupon');

    expect(checkbox('2026 free expansions coupon').parentElement!.textContent).toContain('BIGBYISBETTER');
    expect(hiddenPacks().has('Mists of Ravenloft')).toBe(true);
    expect(hiddenPacks().has('Shadowfell Conspiracy')).toBe(true);
    expect(hiddenPacks().has("Delera's Tomb")).toBe(false);

    click('2026 free expansions coupon');

    expect(hiddenPacks().has('Mists of Ravenloft')).toBe(false);
    expect(hiddenPacks().has('Vecna Unleashed')).toBe(true);
  });

  it('shows every pack again, and remembers the owned ones for next time', async () => {
    await press('Only packs I own');
    pickCoupon('2020');
    await press('Every pack');

    expect(hiddenPacks().size).toBe(0);

    await press('Only packs I own');

    expect(hiddenPacks().has("Delera's Tomb")).toBe(false);
    expect(hiddenPacks().has('Tavern Tales')).toBe(true);
  });

  it('opens on the checklist when the build already hides packs', async () => {
    component.filters.setHiddenPacks(new Set(['Tavern Tales']));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(button('Only packs I own').getAttribute('aria-pressed')).toBe('true');
    expect(checkbox('Tavern Tales').checked).toBe(false);
    expect(checkbox("Delera's Tomb").checked).toBe(true);
  });

  it('shows each pack\'s release year', async () => {
    await press('Only packs I own');
    const label = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('#packFilters label'))
      .find(candidate => candidate.textContent!.includes('Keep on the Borderlands'))!;

    expect(label.querySelector('.pack-year')!.textContent).toBe('2019');
  });

  it('ticks and unticks a whole group from its heading', async () => {
    await press('Only packs I own');
    click('Expansions');

    expect(hiddenPacks().has('Mists of Ravenloft')).toBe(false);
    expect(hiddenPacks().has('Vecna Unleashed')).toBe(false);
    expect(hiddenPacks().has('Tavern Tales')).toBe(true);

    click('Expansions');

    expect(hiddenPacks().has('Mists of Ravenloft')).toBe(true);
    expect(hiddenPacks().has("Delera's Tomb")).toBe(false);
  });

  it('stores unchecked pack options as hidden packs', () => {
    const firstPack = component.packOptions[0];
    firstPack.value = false;

    component.onChangePacks(component.packOptions, 'subgroup');

    component.filters.getItemFilters().subscribe(filters => {
      expect(filters.hiddenPacks.has(firstPack.name === 'Free Quests' ? NO_PACK_KEY : firstPack.name)).toBe(true);
    });
  });

  describe('Advanced bonuses', () => {
    const panel = () => fixture.nativeElement.querySelector('.bonus-systems-panel') as HTMLElement;
    const system = (kind: string) => panel().querySelector(`[data-bonus-kind="${kind}"]`) as HTMLElement;
    const toggle = (kind: string) => system(kind).querySelector('input') as HTMLInputElement;

    function equipHelm() {
      const equipped = TestBed.inject(EquippedService);
      equipped.set(TestBed.inject(GearDbService).getGearBySlot('Helm')[0]);
      return equipped;
    }

    it('lists the three systems, all off, with nothing to act on', () => {
      expect(Array.from(panel().querySelectorAll('label')).map(label => label.textContent!.trim()))
        .toEqual(['Mythic Boosts', 'Reaper Bonuses', 'Curses']);
      expect(Array.from(panel().querySelectorAll('input')).map(input => input.checked)).toEqual([false, false, false]);
      expect(panel().querySelector('.bonus-system-actions')).toBeNull();
    });

    it('switches one system on without the others', () => {
      toggle('reaper').click();
      fixture.detectChanges();

      const settings = TestBed.inject(ItemBonusSettingsService);
      expect([...settings.getEnabledKindsSnapshot()]).toEqual(['reaper']);
      expect(system('reaper').querySelector('.bonus-system-actions')).not.toBeNull();
      expect(system('mythic').querySelector('.bonus-system-actions')).toBeNull();
    });

    it('fills the equipped gear for the build goals, then removes it again', () => {
      const equipped = equipHelm();
      equipped.setImportantAffixes(['Physical Sheltering']);
      toggle('mythic').click();
      fixture.detectChanges();

      (system('mythic').querySelector('.bonus-system-fill') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(equipped.getSlotsSnapshot().get('Helm')?.bonuses.mythic?.name).toBe('Mythic +3 (PRR/MRR)');
      expect(system('mythic').querySelector('.bonus-system-count')!.textContent).toBe('On 1 equipped item');

      (system('mythic').querySelector('.bonus-system-clear') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(equipped.countItemBonuses('mythic')).toBe(0);
      expect(system('mythic').querySelector('.bonus-system-clear')).toBeNull();
    });

    it('cannot fill without build goals to fill for', () => {
      equipHelm();
      toggle('mythic').click();
      fixture.detectChanges();

      expect((system('mythic').querySelector('.bonus-system-fill') as HTMLButtonElement).disabled).toBe(true);
    });

    it('offers to remove a bonus a build carries for a system that is off', () => {
      const equipped = equipHelm();
      equipped.setItemBonus('Helm', 'curse', TestBed.inject(ItemBonusService).find('curse', 'Helm', 'Curse of Major Strength'));
      fixture.detectChanges();

      expect(system('curse').querySelector('.bonus-system-fill')).toBeNull();
      (system('curse').querySelector('.bonus-system-clear') as HTMLButtonElement).click();

      expect(equipped.countItemBonuses('curse')).toBe(0);
    });
  });
});
