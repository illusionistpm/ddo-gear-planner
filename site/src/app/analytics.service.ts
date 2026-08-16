import { Injectable } from '@angular/core';

type AnalyticsParams = Record<string, string | number | boolean | undefined | null>;

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  track(eventName: string, params: AnalyticsParams = {}) {
    const gtag = (window as any).gtag;
    if (typeof gtag !== 'function') {
      return;
    }

    const cleanParams: Record<string, string | number | boolean> = {};
    for (const key of Object.keys(params)) {
      const value = params[key];
      if (value !== undefined && value !== null) {
        cleanParams[key] = value;
      }
    }

    gtag('event', eventName, cleanParams);
  }
}
