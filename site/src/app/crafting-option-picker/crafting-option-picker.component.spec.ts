import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

import { CraftingOptionPickerComponent } from './crafting-option-picker.component';
import { CraftableOption } from '../gear/craftable-option';
import { AffixUiService } from '../affixes/affix-ui.service';

const HIDE_KEY = 'ddo-gear-planner-hide-irrelevant-crafting-options';

describe('CraftingOptionPickerComponent', () => {
  let fixture: ComponentFixture<CraftingOptionPickerComponent>;
  let component: CraftingOptionPickerComponent;
  let emitted: CraftableOption[];
  let rankOf: (option: CraftableOption) => string;

  const empty = new CraftableOption(null);
  const charisma = [1, 3, 5, 7].map((value, i) =>
    new CraftableOption({ name: `Diamond of Charisma +${value}`, ml: 1 + i * 4, affixes: [{ name: 'Charisma', type: 'Enhancement', value }] }));
  const bluff = [5, 10].map((value, i) =>
    new CraftableOption({ name: `Diamond of Bluff +${value}`, ml: 4 + i * 4, affixes: [{ name: 'Bluff', type: 'Competence', value }] }));
  const acid = new CraftableOption({ name: 'Topaz of Acid Absorption', ml: 10, affixes: [{ name: 'Acid Absorption', type: 'Enhancement', value: 10 }] });
  const helpfulSet = new CraftableOption({ name: 'Set Augment: Helpful', ml: 30, set: 'Helpful' });
  const unhelpfulSet = new CraftableOption({ name: 'Set Augment: Unhelpful', ml: 30, set: 'Unhelpful' });
  const options = [empty, ...charisma, ...bluff, acid, helpfulSet, unhelpfulSet];

  // Charisma is tracked; +5 and +7 both rank Best, so a family pick lands on +7.
  const rankClass = new Map<CraftableOption, string>([
    [charisma[0], 'Outranked'], [charisma[1], 'BestTied'], [charisma[2], 'Best'], [charisma[3], 'Best'],
    [bluff[0], 'Irrelevant'], [bluff[1], 'Irrelevant'], [acid, 'Irrelevant'], [empty, 'Irrelevant'],
    [helpfulSet, 'Best'], [unhelpfulSet, 'Irrelevant'],
  ]);

  beforeEach(async () => {
    localStorage.removeItem(HIDE_KEY);
    await TestBed.configureTestingModule({
      declarations: [CraftingOptionPickerComponent],
      imports: [FormsModule, NgbModule]
    }).compileComponents();

    fixture = TestBed.createComponent(CraftingOptionPickerComponent);
    component = fixture.componentInstance;
    emitted = [];
    rankOf = option => rankClass.get(option)!;
    // The picker ranks its list through the service each time it opens.
    vi.spyOn(TestBed.inject(AffixUiService), 'rankCraftingOption').mockImplementation(option => ({
      className: rankOf(option),
      tooltip: '',
      note: option === helpfulSet ? '1 of 3 set pieces' : ''
    }));
    component.selectedChange.subscribe(option => emitted.push(option));
    fixture.componentRef.setInput('options', options);
    fixture.componentRef.setInput('selected', empty);
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.removeItem(HIDE_KEY);
  });

  async function open() {
    (fixture.nativeElement.querySelector('.crafting-picker-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const familyLabels = () => Array.from(document.body.querySelectorAll('.crafting-picker-family-name'))
    .map(label => label.textContent?.trim());
  const familyButton = (label: string) => Array.from(document.body.querySelectorAll<HTMLButtonElement>('.crafting-picker-family'))
    .find(button => button.querySelector('.crafting-picker-family-name')?.textContent?.trim() === label)!;
  const tierButtons = () => Array.from(document.body.querySelectorAll<HTMLButtonElement>('.crafting-picker-tier'));
  const tierLabels = () => tierButtons().map(button => button.querySelector('.crafting-picker-entry-label')!.textContent?.trim());
  const activeEntry = () => document.body.querySelector('.crafting-picker-entry.active')!;
  const searchBox = () => document.body.querySelector('.crafting-picker-search') as HTMLInputElement;
  const hideCheckbox = () => document.body.querySelector('.crafting-picker-hide input') as HTMLInputElement;

  function type(text: string) {
    searchBox().value = text;
    searchBox().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function press(key: string) {
    searchBox().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    fixture.detectChanges();
  }

  it('shows the selected option itself on the toggle, and nothing when there is none', () => {
    const toggleText = () => fixture.nativeElement.querySelector('.crafting-picker-toggle').textContent.trim();
    expect(toggleText()).toBe('');

    fixture.componentRef.setInput('selected', charisma[1]);
    fixture.detectChanges();
    expect(toggleText()).toBe('Diamond of Charisma +3');
  });

  it('is the only control, with no separate value select', () => {
    fixture.componentRef.setInput('selected', charisma[1]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('select, button').length).toBe(1);
  });

  it('caps the menu to the room beside the toggle, so it never runs past the viewport', async () => {
    const toggle = fixture.nativeElement.querySelector('.crafting-picker-toggle') as HTMLElement;
    vi.spyOn(toggle, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 200, 100, 30));
    await open();

    const menu = document.body.querySelector('.crafting-picker-menu.show') as HTMLElement;
    // The larger side is below: the viewport's height less the toggle's bottom, less a margin each end.
    expect(menu.style.getPropertyValue('--crafting-picker-max-height')).toBe(`${window.innerHeight - 230 - 16}px`);
  });

  it('opens with an empty search box', async () => {
    await open();
    await fixture.whenStable();

    expect(searchBox().value).toBe('');
  });

  it('lists one entry per family, coloured by its best tier, with irrelevant ones hidden by default', async () => {
    await open();

    expect(familyLabels()).toEqual(['Empty', 'Charisma', 'Helpful set']);
    expect(familyButton('Charisma').querySelector('.crafting-picker-family-name')!.classList).toContain('Best');
    expect(familyButton('Charisma').querySelector('.crafting-picker-entry-aside')!.textContent!.trim()).toBe('+1 to +7');
    expect(tierButtons()).toEqual([]);
    expect(hideCheckbox().checked).toBe(true);
    expect(document.body.querySelector('.crafting-picker-hide')!.textContent).toContain('(3)');
  });

  it('names every entry for its affix, with the bonus type beside it and the augment on the right', async () => {
    await open();
    hideCheckbox().click();
    fixture.detectChanges();

    const detail = (label: string) => familyButton(label).querySelector('.crafting-picker-entry-detail')?.textContent?.trim();
    const hint = (label: string) => familyButton(label).querySelector('.crafting-picker-entry-aside')?.textContent?.trim();
    expect(detail('Charisma')).toBe('Enhancement');
    expect(hint('Charisma')).toBe('+1 to +7');
    expect(detail('Acid Absorption')).toBe('+10 Enhancement');
    expect(hint('Acid Absorption')).toBe('Topaz of Acid Absorption');
  });

  it('shows a set augment\'s piece count beside it', async () => {
    await open();

    expect(familyButton('Helpful set').querySelector('.crafting-picker-entry-note')!.textContent!.trim())
      .toBe('1 of 3 set pieces');
  });

  it('shows irrelevant families once the toggle is unchecked, and remembers that', async () => {
    await open();

    hideCheckbox().click();
    fixture.detectChanges();

    expect(familyLabels()).toEqual(['Empty', 'Acid Absorption', 'Bluff', 'Charisma', 'Helpful set', 'Unhelpful set']);
    expect(localStorage.getItem(HIDE_KEY)).toBe('off');
  });

  it('does not hide anything when nothing in the list helps the build', async () => {
    rankOf = () => 'Irrelevant';
    await open();

    expect(familyLabels()).toEqual(['Empty', 'Acid Absorption', 'Bluff', 'Charisma', 'Helpful set', 'Unhelpful set']);
  });

  it('filters by family label and by option name', async () => {
    await open();
    hideCheckbox().click();
    fixture.detectChanges();

    type('topaz');
    expect(familyLabels()).toEqual(['Acid Absorption']);

    type('diamond of');
    expect(familyLabels()).toEqual(['Bluff', 'Charisma']);

    type('competence');
    expect(familyLabels()).toEqual(['Bluff']);
  });

  it('offers to show matches the toggle is hiding', async () => {
    await open();

    type('bluff');
    expect(familyLabels()).toEqual([]);
    const showHidden = document.body.querySelector('.crafting-picker-show-hidden') as HTMLButtonElement;
    expect(showHidden.textContent!.trim()).toBe('1 hidden match - show them');

    showHidden.click();
    fixture.detectChanges();
    expect(familyLabels()).toEqual(['Bluff']);
  });

  it('expands a family in place to list its tiers, each in its own rank colour', async () => {
    await open();

    familyButton('Charisma').click();
    fixture.detectChanges();

    expect(tierLabels()).toEqual(['+1 (ML 1)', '+3 (ML 5)', '+5 (ML 9)', '+7 (ML 13)']);
    expect(tierButtons().map(button => button.querySelector('.crafting-picker-entry-label')!.classList[1]))
      .toEqual(['Outranked', 'BestTied', 'Best', 'Best']);
    expect(tierButtons()[0].querySelector('.crafting-picker-entry-aside')!.textContent!.trim()).toBe('Diamond of Charisma +1');
    expect(emitted).toEqual([]);
  });

  it('highlights the best-ranked tier of an expanded family, highest value among ties', async () => {
    await open();

    familyButton('Charisma').click();
    fixture.detectChanges();

    expect(activeEntry().textContent).toContain('+7 (ML 13)');
  });

  it('picks a tier and closes', async () => {
    await open();
    familyButton('Charisma').click();
    fixture.detectChanges();

    tierButtons()[0].click();
    fixture.detectChanges();

    expect(emitted).toEqual([charisma[0]]);
    expect(document.body.querySelector('.crafting-picker-menu.show')).toBeNull();
  });

  it('picks a family with a single option outright', async () => {
    await open();
    hideCheckbox().click();
    fixture.detectChanges();

    familyButton('Acid Absorption').click();

    expect(emitted).toEqual([acid]);
  });

  it('opens with the family of the selected tier expanded and that tier highlighted', async () => {
    fixture.componentRef.setInput('selected', charisma[1]);
    fixture.detectChanges();
    await open();

    expect(tierLabels().length).toBe(4);
    expect(activeEntry().textContent).toContain('+3 (ML 5)');
  });

  it('picks with the keyboard: Enter expands a family, Enter again picks the highlighted tier', async () => {
    await open();

    type('char');
    press('Enter');
    expect(emitted).toEqual([]);
    press('Enter');
    expect(emitted).toEqual([charisma[3]]);
  });

  it('tells assistive tech which entry the arrow keys have reached', async () => {
    await open();

    press('ArrowDown');

    const active = document.body.querySelector('.crafting-picker-entry.active')!;
    expect(searchBox().getAttribute('aria-activedescendant')).toBe(active.id);
    expect(searchBox().getAttribute('aria-controls')).toBe(document.body.querySelector('.crafting-picker-list')!.id);
  });

  it('moves through the list with the arrow keys', async () => {
    await open();
    hideCheckbox().click();
    fixture.detectChanges();

    press('ArrowDown');
    press('ArrowDown');
    press('ArrowDown');
    press('ArrowUp');
    press('ArrowUp');
    press('Enter');

    expect(emitted).toEqual([acid]);
  });
});
