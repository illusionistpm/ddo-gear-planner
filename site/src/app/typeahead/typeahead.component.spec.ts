import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { TypeaheadComponent } from './typeahead.component';

describe('TypeaheadComponent', () => {
  let component: TypeaheadComponent;
  let fixture: ComponentFixture<TypeaheadComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ AppModule ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(TypeaheadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('when the term matches nothing', () => {
    const note = () => (fixture.nativeElement as HTMLElement).querySelector('.typeahead-empty')!.textContent!.trim();

    async function type(text: string) {
      const input = (fixture.nativeElement as HTMLElement).querySelector('input')!;
      input.value = text;
      input.dispatchEvent(new Event('input'));
      // Past the search's debounce.
      await new Promise(resolve => setTimeout(resolve, 250));
      fixture.detectChanges();
      return input;
    }

    beforeEach(() => {
      component.source = [{ name: 'Sword of Shadow' }];
    });

    it('says so, where a blank box would look like a search that never ran', async () => {
      await type('zzzz');
      expect(note()).toBe('No matches');
    });

    it('says nothing while there are results, or once the box is left', async () => {
      await type('sword');
      expect(note()).toBe('');

      const input = await type('zzzz');
      input.dispatchEvent(new Event('blur'));
      fixture.detectChanges();
      expect(note()).toBe('');
    });
  });
});
