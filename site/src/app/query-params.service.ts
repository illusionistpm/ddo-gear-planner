import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class QueryParamsService {
  private paramsFromCode: Map<any, any>;

  private observables: Array<[any, Observable<any>]>;

  private updateListeners: Array<any>;

  private initialPageLoad = true;

  constructor(
    private readonly router: Router
  ) {
    this.updateListeners = [];
    this.observables = [];

    this.paramsFromCode = new Map<any, any>();
  }

  _makeNavigateFn(pair: any) {
    return (val: any) => {
        this.paramsFromCode.set(pair[0], val);

        let combinedParams = {};
        for (const param of this.paramsFromCode.values()) {
          if (param) {
            combinedParams = { ...combinedParams, ...param };
          }
        }

        const rawHash = window.location.hash || '';
        const hashPath = rawHash.startsWith('#/') ? rawHash.slice(1) : (rawHash.startsWith('#') ? rawHash.slice(1) : rawHash);
        const routePath = hashPath.split('?')[0] || this.router.url.split('?')[0] || '';
        const routeSegments = routePath.split('/').filter(Boolean);

        this.router.navigate(routeSegments, {
          queryParams: combinedParams,
          replaceUrl: true,
          queryParamsHandling: 'merge'
        });
      };
    }

  // Called by the app when the page is loaded
  updateFromParams(params: any) {
    if (this.initialPageLoad) {
      this.initialPageLoad = false;

      for (const listener of this.updateListeners) {
        listener.updateFromParams(params);
      }

    // Don't start listening to the observables until after we've applied the query parameters.
    // Otherwise we just end up overwriting everything.
      for (const pair of this.observables) {
        pair[1].subscribe(this._makeNavigateFn(pair));
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
}
