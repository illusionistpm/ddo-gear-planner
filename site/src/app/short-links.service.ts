import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../environments/environment';

// Distinct from BuildsService/builds.ts on purpose: a short link is an
// anonymous, immutable share snapshot (see worker/migrations/0002_shortlinks.sql),
// not an owned/mutable build row - see the plan for why saving and sharing
// are deliberately decoupled.
@Injectable({
  providedIn: 'root'
})
export class ShortLinksService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api`;

  constructor(private readonly http: HttpClient) {}

  create(blob: string, name: string): Observable<{ shortId: string }> {
    return this.http.post<{ shortId: string }>(`${this.baseUrl}/shortlinks`, { blob, name });
  }
}
