import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { of, Subject } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { environment } from '../../../environments/environment';
import { ThinkerService } from './thinker.service';
describe('Thinker request boundary', () => {
 afterEach(() => { vi.useRealTimers(); });
 function setup(token = of('session-csrf')) {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AuthService, useValue: { getCsrfToken: () => token } }] });
  return { api: TestBed.inject(ThinkerService), http: TestBed.inject(HttpTestingController) };
 }
 it('sends only the current message with credentials and CSRF', () => {
  const { api, http } = setup(); let received = false;
  api.send('Budget basics').subscribe(() => received = true);
  const request = http.expectOne(`${environment.apiUrl}/thinker/messages`);
  expect(request.request.method).toBe('POST'); expect(request.request.withCredentials).toBe(true);
  expect(request.request.headers.get('X-CSRF-Token')).toBe('session-csrf');
  expect(request.request.body).toEqual({message:'Budget basics'});
  request.flush({ mode:'demo', title:'Budget', message:'Prepared reply', takeaway:'Review a bill' });
  expect(received).toBe(true); http.verify();
 });
 it('times out and cancels a stalled request', () => {
  vi.useFakeTimers(); const { api, http } = setup(); let failed = false;
  api.send('budget').subscribe({error: () => failed = true});
  const request = http.expectOne(`${environment.apiUrl}/thinker/messages`);
  vi.advanceTimersByTime(25001); expect(failed).toBe(true); expect(request.cancelled).toBe(true); http.verify();
 });
 it('does not send a message before the CSRF token arrives', () => {
  const token = new Subject<string>(); const { api, http } = setup(token);
  const subscription = api.send('budget').subscribe(); http.expectNone(`${environment.apiUrl}/thinker/messages`);
  subscription.unsubscribe(); token.next('late-token'); http.expectNone(`${environment.apiUrl}/thinker/messages`); http.verify();
 });
});
