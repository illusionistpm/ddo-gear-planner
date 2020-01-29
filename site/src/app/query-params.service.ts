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

  constructor(
    private readonly router: Router
  ) {
    this.updateListeners = [];
    this.observables = [];

    this.paramsFromCode = new Map<any, any>();
  }

  // Called by the app when the page is loaded
  updateFromParams(params) {
    for(const listener of this.updateListeners) {
      listener.updateFromParams(params);
    }

    // Don't start listening to the observables until after we've applied the query parameters.
    // Otherwise we just end up overwriting everything.
    for (const pair of this.observables) {
      pair[1].subscribe(val => {
        this.paramsFromCode.set(pair[0], val);

        let combinedParams = {};
        for (const param of this.paramsFromCode.values()) {
          if (param) {
            combinedParams = {...combinedParams, ...param};
          }
        }

        this.router.navigate([], { queryParams: combinedParams });
      });
    }
  }

  // Call to register your observable params with the system
  register(source: any, obs: Observable<any>) {
    this.observables.push([source, obs]);
  }

  // Call to be notified when the params change
  subscribe(listener) {
    this.updateListeners.push(listener);
  }
}
