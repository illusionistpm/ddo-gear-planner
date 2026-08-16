import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import { perfMark, perfStart } from './perf-trace';

@Injectable({
  providedIn: 'root'
})
export class QueryParamsService {
  private paramsFromCode: Map<any, any>;

  private observables: Array<[any, Observable<any>]>;

  private updateListeners: Array<any>;

  private initialPageLoad = true;

  private applyingParamsFromUrl = false;

  private appUrlWritesToIgnore = 0;

  constructor(
    private readonly router: Router
  ) {
    this.updateListeners = [];
    this.observables = [];

    this.paramsFromCode = new Map<any, any>();
  }

  _makeNavigateFn(pair: [any, Observable<any>]) {
    return (val: any) => {
        const done = perfStart('QueryParamsService.navigateFromObservable');
        this.paramsFromCode.set(pair[0], val);

        if (this.applyingParamsFromUrl) {
          done({ skipped: 'applyingParamsFromUrl' });
          return;
        }

        let combinedParams = {};
        for (const param of this.paramsFromCode.values()) {
          if (param) {
            combinedParams = { ...combinedParams, ...param };
          }
        }

        const routerPath = this.router.url.split('?')[0];
        const hashPath = this.getHashRoutePath();
        const routePath = routerPath && routerPath !== '/' ? routerPath : hashPath || routerPath || '';
        const routeSegments = routePath.split('/').filter(Boolean);

        this.appUrlWritesToIgnore++;
        const navigateDone = perfStart('Router.navigate');
        this.router.navigate(routeSegments, {
          queryParams: combinedParams,
          replaceUrl: false
        }).finally(() => {
          navigateDone({ route: routeSegments.join('/'), keys: Object.keys(combinedParams).length });
          setTimeout(() => {
          if (this.appUrlWritesToIgnore > 0) {
            this.appUrlWritesToIgnore--;
          }
          });
        });
        done({ keys: Object.keys(combinedParams).length });
      };
    }

  // Called by the app when the page is loaded
  updateFromParams(params: any) {
    const done = perfStart('QueryParamsService.updateFromParams');
    this.applyingParamsFromUrl = true;
    try {
      for (const listener of this.updateListeners) {
        listener.updateFromParams(params);
      }
    } finally {
      this.applyingParamsFromUrl = false;
      done({ keys: Array.from(params.keys).length });
    }

    if (this.initialPageLoad) {
      this.initialPageLoad = false;

      // Don't start listening to the observables until after we've applied the query parameters.
      // Otherwise we just end up overwriting everything.
      this.applyingParamsFromUrl = true;
      try {
        for (const pair of this.observables) {
          pair[1].subscribe(this._makeNavigateFn(pair));
        }
      } finally {
        this.applyingParamsFromUrl = false;
      }
    }
  }

  // Call to register your observable params with the system
  register(source: any, obs: Observable<any>) {
    this.observables.push([source, obs]);

    if (!this.initialPageLoad) {
      obs.subscribe(this._makeNavigateFn([source, obs]));
    }
  }

  // Call to be notified when the params change
  subscribe(listener: any) {
    this.updateListeners.push(listener);
  }

  consumeAppUrlWrite() {
    if (this.appUrlWritesToIgnore <= 0) {
      return false;
    }

    this.appUrlWritesToIgnore--;
    perfMark('QueryParamsService.consumeAppUrlWrite');
    return true;
  }

  private getHashRoutePath() {
    const rawHash = window.location.hash || '';
    const hashPath = rawHash.startsWith('#/') ? rawHash.slice(1) : (rawHash.startsWith('#') ? rawHash.slice(1) : rawHash);
    return hashPath.split('?')[0] || '';
  }
}
