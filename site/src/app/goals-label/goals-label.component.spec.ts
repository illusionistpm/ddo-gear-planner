import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { GoalsLabelComponent } from './goals-label.component';

describe('GoalsLabelComponent', () => {
  let fixture: ComponentFixture<GoalsLabelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AppModule] }).compileComponents();
    fixture = TestBed.createComponent(GoalsLabelComponent);
  });

  const el = () => fixture.nativeElement as HTMLElement;

  it('names the editor button as it reads: + Build Goals, + Goals when short', () => {
    fixture.componentRef.setInput('for', 'editor-button');
    fixture.detectChanges();

    expect(el().classList).toContain('editor-button');
    expect(el().querySelector('.fa-plus')).not.toBeNull();
    expect(el().querySelector('.goals-label-full')?.textContent).toBe('Build Goals');
    expect(el().querySelector('.goals-label-short')?.textContent).toBe('Goals');
  });

  it('names the view tab without the plus', () => {
    fixture.componentRef.setInput('for', 'view-tab');
    fixture.detectChanges();

    expect(el().classList).toContain('view-tab');
    expect(el().querySelector('.fa-plus')).toBeNull();
    expect(el().querySelector('.goals-label-short')?.textContent).toBe('Goals');
  });
});
