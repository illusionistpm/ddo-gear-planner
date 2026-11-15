import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';

import { BuildsService } from '../build/builds.service';
import { ListReturnService } from '../build/list-return.service';
import { AuthService } from '../shared/auth.service';
import { BuildCompareComponent } from './build-compare.component';
import { ComparePageComponent } from './compare-page.component';

describe('ComparePageComponent', () => {
  it('loads the compare page on first visit, handing it the builds the URL names', async () => {
    const params = new BehaviorSubject(convertToParamMap({ a: 'old1', b: 'new1' }));
    await TestBed.configureTestingModule({
      declarations: [ComparePageComponent],
      // app-page-chrome is PageChromeComponent's to test.
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: params } },
        { provide: ListReturnService, useValue: { url: '/build/s1/tank' } },
        { provide: AuthService, useValue: { isAuthenticated$: of(false), signIn: () => undefined } },
        { provide: BuildsService, useValue: { getByShortId: () => of({ name: 'x', blob: 'not a build' }), listMine: () => of([]) } },
      ]
    }).compileComponents();
    const fixture = TestBed.createComponent(ComparePageComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Loading…');

    await fixture.componentInstance.loadBody();
    fixture.detectChanges();

    const body = fixture.debugElement.query(debug => debug.componentInstance instanceof BuildCompareComponent);
    expect(body.componentInstance.a).toBe('old1');
    expect(body.componentInstance.b).toBe('new1');
    expect(fixture.componentInstance.plannerLink.url).toBe('/build/s1/tank');
  });
});
