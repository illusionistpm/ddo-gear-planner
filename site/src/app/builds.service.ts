import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { Build } from './build';
import { environment } from '../environments/environment';

interface BuildResponse {
  id: string;
  shortId: string;
  name: string;
  blob: string;
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

  listMine(): Observable<Build[]> {
    return this.http.get<BuildResponse[]>(`${this.baseUrl}/builds/mine`);
  }

  getByShortId(shortId: string): Observable<SharedBuildResponse> {
    return this.http.get<SharedBuildResponse>(`${this.baseUrl}/build/${encodeURIComponent(shortId)}`);
  }

  update(id: string, fields: { name?: string; blob?: string }): Observable<Build> {
    return this.http.put<BuildResponse>(`${this.baseUrl}/builds/${encodeURIComponent(id)}`, fields);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/builds/${encodeURIComponent(id)}`);
  }
}
