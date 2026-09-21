import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { EquippedService } from '../planner/equipped.service';
import { TrackedEquipmentSidebarComponent } from './tracked-equipment-sidebar.component';

describe('TrackedEquipmentSidebarComponent', () => {
  let fixture: ComponentFixture<TrackedEquipmentSidebarComponent>;
  let equipped: EquippedService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppModule]
    }).compileComponents();
  });

  beforeEach(() => {
    equipped = TestBed.inject(EquippedService);
    fixture = TestBed.createComponent(TrackedEquipmentSidebarComponent);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('describes non-gear entries in the hover card, showing checklist entries as a checked box', () => {
    equipped.addExternalAffixValue('Strength', 'Insight', 3, 'Spell');
    equipped.addExternalAffixValue('Feather Falling', 'Bool', 1, 'Ring');
    fixture.componentInstance.previewExternal();
    // The sidebar uses the default (OnPush) strategy.
    fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();

    const values = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.tracked-equipment-external-row .tracked-equipment-set-bonus-value'));
    expect(values.map(value => value.textContent!.trim())).toEqual(['+3 Insight', '']);
    expect(values[1].querySelector('.fa-check-square')?.getAttribute('aria-label')).toBe('Covered');
  });
});
