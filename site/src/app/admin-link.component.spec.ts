import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';

import { AdminLinkComponent } from './admin-link.component';
import { BuildUrlCodecService } from './build/build-url-codec.service';
import { MenuBackdropComponent } from './menu-backdrop/menu-backdrop.component';
import { PlannerOnboardingService } from './planner/planner-onboarding.service';
import { environment } from '../environments/environment';

describe('AdminLinkComponent', () => {
  let fixture: ComponentFixture<AdminLinkComponent>;
  let component: AdminLinkComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [AdminLinkComponent],
      imports: [FormsModule, MenuBackdropComponent],
      providers: [
        {
          provide: PlannerOnboardingService,
          useValue: {
            resetIntro: vi.fn().mockName('resetIntro')
          }
        }
      ]
    });

    fixture = TestBed.createComponent(AdminLinkComponent);
    component = fixture.componentInstance;
  });

  it('decodes compact URL data in the admin inspector', () => {
    const codec = TestBed.inject(BuildUrlCodecService);
    const compactParam = codec.encode({
      Weapon: 'Dinosaur Bone Great Crossbow',
      craft_0_slot: 'Weapon',
      craft_0_system: 'Claw (Weapon)',
      craft_0_selected: 'Iridiscent Claw: Force',
      tracked: ['Intelligence', 'Spellcraft']
    });

    component.inspectorInput = `http://localhost:4200/#/main?b=${compactParam}`;
    component.inspectUrl();
    fixture.detectChanges();

    expect(component.urlDataFormat).toBe('compact');
    expect(component.effectiveParamCount).toBe(5);
    expect(component.urlInspectionJson).toContain('equipment');
    expect(component.urlInspectionJson).toContain('Dinosaur Bone Great Crossbow');
    expect(component.urlInspectionJson).toContain('crafting');
    expect(component.urlInspectionJson).toContain('Claw (Weapon)');
    expect(component.urlInspectionJson).toContain('Spellcraft');
    expect(component.urlInspectionJson).not.toContain('"source"');
    expect(component.urlInspectionJson).not.toContain('"queryString"');
    expect(component.urlInspectionJson).not.toContain('"rawParams"');
    expect(component.urlInspectionJson).not.toContain('"compactParam"');
    expect(component.urlInspectionJson).not.toContain('"inflatedJson"');

    component.setUrlInspectorView('compact');

    // Format and payload length live in the stats boxes now, not this view.
    expect(component.payloadChars).toBeGreaterThan(0);
    expect(component.urlDataFormat).toBe('compact');
    expect(component.urlInspectionJson).toContain('Dinosaur Bone Great Crossbow');
    expect(component.urlInspectionJson).not.toContain('"compactPayload"');
    expect(component.urlInspectionJson).not.toContain('"format"');
    expect(component.urlInspectionJson).not.toContain('"payloadChars"');
    expect(component.urlInspectionJson).not.toContain('effectiveParams');

    component.setUrlInspectorView('effective');

    expect(component.urlInspectionJson).toContain('craft_0_slot');
    expect(component.urlInspectionJson).toContain('tracked');
  });

  it('omits empty sections (e.g. "other") from the human-readable view when every param is recognized', () => {
    const codec = TestBed.inject(BuildUrlCodecService);
    const compactParam = codec.encode({
      Weapon: 'Dinosaur Bone Light Crossbow',
      levelrange: '1,32'
    });

    component.inspectorInput = `http://localhost:4200/#/main?b=${compactParam}`;
    component.inspectUrl();
    fixture.detectChanges();

    expect(component.urlInspectionJson).not.toContain('"other"');
    expect(component.urlInspectionJson).not.toContain('"tracked"');
    expect(component.urlInspectionJson).toContain('"filters"');
    expect(component.urlInspectionJson).toContain('"equipment"');
  });

  it('shows non-gear affix entries under their own section, not "other"', () => {
    const codec = TestBed.inject(BuildUrlCodecService);
    const compactParam = codec.encode({
      nongear: JSON.stringify([
        { id: '1', affixName: 'Deadly', bonusType: 'Insightful', kind: 'value', value: 6, label: 'Trance' },
        { id: '2', affixName: 'Concentration', bonusType: 'Insight', kind: 'ignored', value: 0, label: 'Not chasing' }
      ])
    });

    component.inspectorInput = `http://localhost:4200/#/main?b=${compactParam}`;
    component.inspectUrl();
    fixture.detectChanges();

    expect(component.urlInspectionJson).toContain('"nonGear"');
    expect(component.urlInspectionJson).toContain('Trance');
    expect(component.urlInspectionJson).toContain('Not chasing');
    expect(component.urlInspectionJson).not.toContain('"other"');
    expect(component.urlInspectionJson).not.toContain('"nongear"');
  });

  it('lists its tools as rows, for the account menu to hold', () => {
    fixture.detectChanges();

    const rows = [...fixture.nativeElement.querySelectorAll('.admin-row')].map((e: Element) => e.textContent?.trim());
    expect(rows).toEqual(['Performance logging', 'Reset onboarding', 'Inspect URL data', 'Open admin page']);
  });

  it('asks its menu to close after resetting onboarding', () => {
    const acted = vi.fn();
    component.acted.subscribe(acted);
    fixture.detectChanges();

    fixture.debugElement.queryAll(By.css('.admin-panel-action'))[0].triggerEventHandler('click');

    expect(TestBed.inject(PlannerOnboardingService).resetIntro).toHaveBeenCalled();
    expect(acted).toHaveBeenCalledTimes(1);
  });

  it('opens the URL inspector on <body>, outside the menu, and removes it on destroy', () => {
    const acted = vi.fn();
    component.acted.subscribe(acted);
    fixture.detectChanges();

    fixture.debugElement.queryAll(By.css('.admin-panel-action'))[1].triggerEventHandler('click');
    fixture.detectChanges();

    expect(component.inspectorOpen).toBe(true);
    expect(acted).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('.admin-url-inspector')).toBeNull();
    expect(document.body.querySelector(':scope > .admin-inspector-layer .admin-url-inspector')).not.toBeNull();

    fixture.destroy();
    expect(document.body.querySelector('.admin-inspector-layer')).toBeNull();
  });

  it('renders nothing for real site visitors in production', () => {
    const originalProduction = environment.production;
    environment.production = true;
    try {
      fixture = TestBed.createComponent(AdminLinkComponent);
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.css('.admin-group'))).toBeNull();
      expect(fixture.nativeElement.textContent.trim()).toBe('');
    }
    finally {
      environment.production = originalProduction;
    }
  });
});
