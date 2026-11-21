import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { ExpandingCheckboxesComponent } from './expanding-checkboxes.component';

describe('ExpandingCheckboxesComponent', () => {
  let component: ExpandingCheckboxesComponent;
  let fixture: ComponentFixture<ExpandingCheckboxesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ AppModule ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ExpandingCheckboxesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('as an item type group (inverted: a value of true is a hidden type)', () => {
    let changes: string[];
    const element = () => fixture.nativeElement as HTMLElement;
    const row = () => element().querySelector<HTMLButtonElement>('.type-group-toggle')!;

    beforeEach(() => {
      changes = [];
      fixture.componentRef.setInput('title', 'Ranged');
      fixture.componentRef.setInput('invert', true);
      fixture.componentRef.setInput('list', [{ name: 'Longbows', value: false }, { name: 'Shortbows', value: true }]);
      fixture.componentRef.setInput('onChangeFn', (_: unknown, source: string) => changes.push(source));
      fixture.detectChanges();
    });

    it('says how many of its types are shown, and opens in place to list them', () => {
      expect(row().textContent).toContain('1/2');
      expect(element().querySelector('.type-group-list')).toBeNull();

      row().click();
      fixture.detectChanges();

      const boxes = Array.from(element().querySelectorAll<HTMLInputElement>('.type-group-list input'));
      expect(boxes.length).toBe(2);
      expect(row().getAttribute('aria-expanded')).toBe('true');
    });

    it('shows all of them, or none, in one click', () => {
      row().click();
      fixture.detectChanges();
      const bulk = (text: string) => Array.from(element().querySelectorAll<HTMLButtonElement>('.type-group-bulk-button'))
        .find(button => button.textContent!.trim() === text)!;

      bulk('All').click();
      fixture.detectChanges();
      expect(component.list.map(type => type.value)).toEqual([false, false]);
      expect(row().textContent).toContain('2/2');

      bulk('None').click();
      fixture.detectChanges();
      expect(component.list.map(type => type.value)).toEqual([true, true]);
      expect(changes).toEqual(['all', 'none']);
    });
  });
});
