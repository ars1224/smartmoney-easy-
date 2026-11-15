import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { switchMap, timeout } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { environment } from '../../../environments/environment';
export interface ThinkerReply { mode: 'demo' | 'live'; title: string; message: string; takeaway: string; links?: {id: string}[]; }
export interface ThinkerStatus { mode: 'demo' | 'live' | 'unavailable'; available: boolean; }
@Injectable({ providedIn: 'root' })
export class ThinkerService {
 private readonly http = inject(HttpClient);
 private readonly auth = inject(AuthService);
 status() { return this.http.get<ThinkerStatus>(`${environment.apiUrl}/thinker/status`, { withCredentials: true }).pipe(timeout(10000)); }
 send(message: string) {
  return this.auth.getCsrfToken().pipe(switchMap(token => this.http.post<ThinkerReply>(`${environment.apiUrl}/thinker/messages`, { message }, { withCredentials: true, headers: { 'X-CSRF-Token': token } })), timeout(25000));
 }
}
