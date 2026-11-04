import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { Build, BuildSummary } from './build';
import type { ShoppingSaveProgress } from '../planner/shopping-list/shopping-list-types';
import { environment } from '../../environments/environment';

interface BuildResponse {
  id: string;
  shortId: string;
  name: string;
  blob: string;
  createdAt: string;
  updatedAt: string;
}

// What GET /api/builds/mine actually returns - no `blob` (see
// BuildSummary's comment and worker/src/routes/builds.ts's
// toBuildSummaryResponse).
interface BuildSummaryResponse {
  id: string;
  shortId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

// GET /api/build/:shortId is intentionally public (no auth) and returns
// just {name, blob} - see worker/src/routes/builds.ts - so shared links
// don't need an id/shortId round-tripped back to them.
interface SharedBuildResponse {
  name: string;
  blob: string;
}

@Injectable({
  providedIn: 'root'
})
export class BuildsService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api`;

  constructor(private readonly http: HttpClient) {}

  create(name: string, blob: string): Observable<Build> {
    return this.http.post<BuildResponse>(`${this.baseUrl}/builds`, { name, blob });
  }

  listMine(): Observable<BuildSummary[]> {
    return this.http.get<BuildSummaryResponse[]>(`${this.baseUrl}/builds/mine`);
  }

  getByShortId(shortId: string): Observable<SharedBuildResponse> {
    return this.http.get<SharedBuildResponse>(`${this.baseUrl}/build/${encodeURIComponent(shortId)}`);
  }

  /**
   * Renames a build or saves new gear into it. `progress`, the shopping
   * list for the build as saved, is stored with it in one step (see the
   * worker's handleUpdateBuild); `progressSaved` in the answer says whether
   * it was, present only when it was sent.
   */
  update(id: string, fields: { name?: string; blob?: string; progress?: ShoppingSaveProgress }): Observable<Build & { progressSaved?: boolean }> {
    return this.http.put<BuildResponse & { progressSaved?: boolean }>(`${this.baseUrl}/builds/${encodeURIComponent(id)}`, fields);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/builds/${encodeURIComponent(id)}`);
  }
}
