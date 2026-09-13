import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { BuildUrlCodecService } from './build-url-codec.service';
import { isBuildParamKey } from './build-param-keys';
import { perfMark, perfStart } from './perf-trace';

type QueryParamValue = string | number | boolean | Array<string | number | boolean>;
type QueryParamRecord = Record<string, QueryParamValue>;
type ParamsAdapter = {
  keys: string[];
  get: (key: string) => string | null;
  getAll: (key: string) => string[];
};
type DecodedParamsResult = {
  params: ParamsAdapter;
  source: string;
  shouldCanonicalize: boolean;
  canonicalParams: QueryParamRecord;
};

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

  private passthroughParams: QueryParamRecord = {};

  // Equipment slot names are data-driven (loaded game data), not a fixed
  // list - EquippedService pushes them here rather than this service
  // injecting GearDbService directly, which would be a circular DI
  // dependency (GearDbService -> FiltersService -> QueryParamsService).
  private ownedSlots: ReadonlyArray<string> = [];

  constructor(
    private readonly router: Router,
    private readonly buildUrlCodec: BuildUrlCodecService
  ) {
    this.updateListeners = [];
    this.observables = [];

    this.paramsFromCode = new Map<any, any>();
  }

  // Called once by EquippedService with the current (data-driven) set of
  // equipment slot names, so isOwnedParamKey() can tell a build's own slot
  // params apart from an unrecognized param a viewer might have appended to
  // a shared link by hand.
  registerOwnedSlots(slots: ReadonlyArray<string>) {
    this.ownedSlots = slots;
  }

  _makeNavigateFn(pair: [any, Observable<any>]) {
    return (val: any) => {
        const done = perfStart('QueryParamsService.navigateFromObservable');
        this.paramsFromCode.set(pair[0], val);

        if (this.applyingParamsFromUrl) {
          done({ skipped: 'applyingParamsFromUrl' });
          return;
        }

        const combinedParams = this.getCombinedParams();
        this.navigateWithParams(combinedParams, false);
        done({ keys: Object.keys(combinedParams).length });
      };
    }

  // Called by the app when the page is loaded
  updateFromParams(params: ParamsAdapter) {
    const done = perfStart('QueryParamsService.updateFromParams');
    const paramsToApply = this.decodeCompactParams(params);
    this.passthroughParams = this.getPassthroughParams(paramsToApply.params);

    if (paramsToApply.shouldCanonicalize) {
      perfMark('QueryParamsService.legacyUrlCanonicalize', {
        keys: paramsToApply.params.keys.length
      });
      this.navigateWithParams(paramsToApply.canonicalParams, true);
    }

    this.applyingParamsFromUrl = true;
    try {
      for (const listener of this.updateListeners) {
        listener.updateFromParams(paramsToApply.params);
      }
    } finally {
      this.applyingParamsFromUrl = false;
      done({ keys: Array.from(paramsToApply.params.keys).length, source: paramsToApply.source });
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

  private decodeCompactParams(params: ParamsAdapter): DecodedParamsResult {
    const compactParam = params.get('b');
    if (compactParam) {
      const decodedParams = this.buildUrlCodec.decode(compactParam);
      if (decodedParams) {
        const externalPassthroughParams = this.getPassthroughParams(this.withoutCompactParam(params));
        const mergedParams = { ...decodedParams, ...externalPassthroughParams };
        return {
          params: this.paramsAdapterFromRecord(mergedParams),
          source: 'compact',
          shouldCanonicalize: Object.keys(externalPassthroughParams).length > 0,
          canonicalParams: mergedParams
        };
      }

      perfMark('QueryParamsService.compactUrlDecodeFallback', {
        keys: params.keys.length,
        hasLegacyParams: params.keys.some(key => key !== 'b')
      });
    }

    const legacyParams = this.withoutCompactParam(params);
    return {
      params: legacyParams,
      source: compactParam ? 'legacy-fallback' : 'legacy',
      shouldCanonicalize: legacyParams.keys.length > 0,
      canonicalParams: this.paramsAdapterToRecord(legacyParams)
    };
  }

  private withoutCompactParam(params: ParamsAdapter): ParamsAdapter {
    if (!params.keys.includes('b')) {
      return params;
    }

    const record: Record<string, string | string[]> = {};
    for (const key of params.keys) {
      if (key === 'b') {
        continue;
      }

      const values = params.getAll(key);
      if (values.length > 1) {
        record[key] = values;
      } else if (values.length === 1) {
        record[key] = values[0];
      }
    }
    return this.paramsAdapterFromRecord(record);
  }

  private getCombinedParams(): QueryParamRecord {
    let combinedParams: QueryParamRecord = { ...this.passthroughParams };
    for (const param of this.paramsFromCode.values()) {
      if (param) {
        combinedParams = { ...combinedParams, ...param };
      }
    }
    return combinedParams;
  }

  private getPassthroughParams(params: ParamsAdapter): Record<string, string | Array<string>> {
    const passthroughParams: Record<string, string | Array<string>> = {};
    for (const key of params.keys) {
      if (this.isOwnedParamKey(key)) {
        continue;
      }

      const values = params.getAll(key);
      if (values.length > 1) {
        passthroughParams[key] = values;
      } else if (values.length === 1) {
        passthroughParams[key] = values[0];
      }
    }
    return passthroughParams;
  }

  private paramsAdapterToRecord(params: ParamsAdapter): QueryParamRecord {
    const record: QueryParamRecord = {};
    for (const key of params.keys) {
      const values = params.getAll(key);
      if (values.length > 1) {
        record[key] = values;
      } else if (values.length === 1) {
        record[key] = values[0];
      }
    }
    return record;
  }

  private isOwnedParamKey(key: string) {
    return isBuildParamKey(key, this.ownedSlots);
  }

  private navigateWithParams(params: QueryParamRecord, replaceUrl: boolean) {
    const routePath = this.router.url.split('?')[0];
    const routeSegments = routePath.split('/').filter(Boolean);
    const compactParam = this.buildUrlCodec.encode(params);
    const queryParams = { b: compactParam };

    perfMark('QueryParamsService.compactUrlWrite', {
      replaceUrl,
      keys: Object.keys(params).length,
      compactChars: compactParam.length
    });

    this.appUrlWritesToIgnore++;
    const navigateDone = perfStart('Router.navigate');
    this.router.navigate(routeSegments, {
      queryParams,
      replaceUrl
    }).finally(() => {
      navigateDone({ route: routeSegments.join('/'), keys: Object.keys(queryParams).length, replaceUrl });
      setTimeout(() => {
        if (this.appUrlWritesToIgnore > 0) {
          this.appUrlWritesToIgnore--;
        }
      });
    });
  }

  private paramsAdapterFromRecord(record: Record<string, string | Array<string>>): ParamsAdapter {
    return {
      keys: Object.keys(record),
      get: (key: string) => {
        const value = record[key];
        if (Array.isArray(value)) {
          return value.length ? value[0] : null;
        }
        return value === undefined ? null : value;
      },
      getAll: (key: string) => {
        const value = record[key];
        if (Array.isArray(value)) {
          return value;
        }
        return value === undefined ? [] : [value];
      }
    };
  }
}
