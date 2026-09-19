import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { EquippedService } from '../planner/equipped.service';
import { ExternalAffixSlotCardComponent } from './external-affix-slot-card.component';

describe('ExternalAffixSlotCardComponent', () => {
  let fixture: ComponentFixture<ExternalAffixSlotCardComponent>;
  let equipped: EquippedService;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [AppModule]
    }).compileComponents();
  }));

  beforeEach(() => {
    equipped = TestBed.inject(EquippedService);
    fixture = TestBed.createComponent(ExternalAffixSlotCardComponent);
    fixture.detectChanges();
  });

  function rowTexts(): string[] {
    return Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.external-affix-row'))
      .map(row => Array.from<HTMLElement>(row.querySelectorAll('div')).map(cell => cell.textContent!.trim()).join(' | '));
  }

  it('renders nothing without entries', () => {
    expect(fixture.nativeElement.querySelector('.external-slot-title')).toBeNull();
  });

  it('renders each non-gear entry with its label and value', () => {
    equipped.addExternalAffixValue('Strength', 'Insight', 3, 'Spell');
    equipped.addExternalAffixValue('Feather Falling', 'Bool', 1, 'Ring');
    equipped.addExternalAffixIgnored('Wisdom', 'Quality', 'Skip');
    fixture.detectChanges();

    expect(rowTexts()).toEqual([
      'Strength (Spell) | +3 Insight',
      'Feather Falling (Ring) | Covered',
      'Wisdom (Skip) | Quality',
    ]);
  });
});
