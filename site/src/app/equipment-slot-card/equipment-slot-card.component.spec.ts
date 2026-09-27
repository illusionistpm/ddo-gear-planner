import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { EquipmentSlotCardComponent } from './equipment-slot-card.component';

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
});
