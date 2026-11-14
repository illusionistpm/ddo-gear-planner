import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { EquipmentSlotCardComponent } from './equipment-slot-card.component';
import { EquippedService } from '../planner/equipped.service';
import { GearDbService } from '../gear/gear-db.service';

describe('EquipmentSlotCardComponent', () => {
  let fixture: ComponentFixture<EquipmentSlotCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AppModule] }).compileComponents();
    fixture = TestBed.createComponent(EquipmentSlotCardComponent);
  });

  function render(slot: string): HTMLElement {
    fixture.componentRef.setInput('slot', slot);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  it('shows the slot\'s icon before its name', () => {
    const name = render('Helm').querySelector('.slot-name')!;

    expect(name.querySelector('app-slot-icon svg path')?.getAttribute('d')).toBeTruthy();
    expect(name.querySelector('.slot-name-text')!.textContent).toBe('Helm');
  });

  it('spaces out a numbered slot\'s name', () => {
    const name = render('Ring1').querySelector('.slot-name-text')!;

    expect(name.textContent).toBe('Ring 1');
  });

  it('names an equipped weapon\'s kind after the slot name', () => {
    const equipped = TestBed.inject(EquippedService);
    const weapon = TestBed.inject(GearDbService).getGearBySlot('Weapon').find(item => item.type === 'Long Swords')!;
    equipped.set(weapon);

    expect(render('Weapon').querySelector('.slot-name-text')!.textContent).toBe('Weapon – Long Sword');
  });

  it('names no kind for an empty weapon slot', () => {
    expect(render('Weapon').querySelector('.slot-name-text')!.textContent).toBe('Weapon');
  });

  it('marks the offhand occupied while a two-handed weapon is equipped', () => {
    const equipped = TestBed.inject(EquippedService);
    const twoHander = TestBed.inject(GearDbService).getGearBySlot('Weapon').find(item => item.hasTypeAttribute('two-handed'))!;
    equipped.set(twoHander);

    expect(render('Offhand').querySelector('.slot-name-text')!.textContent).toBe('Offhand – Occupied');
  });
});
