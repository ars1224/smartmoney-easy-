import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DashboardDataService, dashboardMonth } from './dashboard-data.service';
import { environment } from '../../../environments/environment';
describe('Dashboard data boundary',()=>{
 function setup(){TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting()]});return {api:TestBed.inject(DashboardDataService),http:TestBed.inject(HttpTestingController)};}
 const overview={report:{month:'2026-11'},transactions:[],recordCount:0,loadedAt:'2026-11-15T00:00:00Z'};
 function requests(http:HttpTestingController){return {summary:http.expectOne(r=>r.url===`${environment.apiUrl}/dashboard`),budgets:http.expectOne(r=>r.url===`${environment.apiUrl}/budgets`),goals:http.expectOne(`${environment.apiUrl}/savings-goals`)};}
 afterEach(()=>vi.useRealTimers());
 it('uses authenticated read-only endpoints and the same month',()=>{
  const {api,http}=setup();let result:unknown;api.load('2026-11').subscribe(value=>result=value);const req=requests(http);
  for(const r of Object.values(req)){expect(r.request.withCredentials).toBe(true);expect(r.request.method).toBe('GET');}
  expect(req.summary.request.params.get('month')).toBe('2026-11');expect(req.budgets.request.params.get('month')).toBe('2026-11');
  req.summary.flush(overview);req.budgets.flush({budgets:[]});req.goals.flush({goals:[]});expect(result).toEqual({...overview,budgets:[],goals:[]});http.verify();
 });
 it('represents optional failures as unavailable rather than zero or empty',()=>{
  const {api,http}=setup();let result:any;api.load('2026-11').subscribe(value=>result=value);const req=requests(http);
  req.summary.flush(overview);req.budgets.flush({}, {status:503,statusText:'Offline'});req.goals.flush({goals:[]});
  expect(result.budgets).toBeNull();expect(result.goals).toEqual([]);http.verify();
 });
 it('does not substitute examples when the financial summary fails',()=>{
  const {api,http}=setup();let failed=false;api.load().subscribe({error:()=>failed=true});const req=requests(http);
  req.summary.flush({}, {status:503,statusText:'Offline'});expect(failed).toBe(true);expect(req.budgets.cancelled).toBe(true);expect(req.goals.cancelled).toBe(true);http.verify();
 });
 it('propagates optional-section authentication errors',()=>{
  const {api,http}=setup();let failed=false;api.load().subscribe({error:()=>failed=true});const req=requests(http);
  req.budgets.flush({}, {status:401,statusText:'Unauthenticated'});expect(failed).toBe(true);expect(req.summary.cancelled).toBe(true);http.verify();
 });
 it('times out a stalled optional section without discarding the report',()=>{
  vi.useFakeTimers();const {api,http}=setup();let result:any;api.load().subscribe(value=>result=value);const req=requests(http);
  req.summary.flush(overview);req.goals.flush({goals:[]});vi.advanceTimersByTime(12001);expect(result.budgets).toBeNull();expect(req.budgets.cancelled).toBe(true);http.verify();
 });
 it('chooses the Auckland calendar month around a UTC boundary',()=>{
  expect(dashboardMonth(new Date('2026-10-31T10:59:59Z'))).toBe('2026-10');expect(dashboardMonth(new Date('2026-10-31T11:00:00Z'))).toBe('2026-11');
 });
});
