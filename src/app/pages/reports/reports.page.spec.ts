import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Subject, of } from 'rxjs';
import { ReportsPage, nzMonth } from './reports.page';
import { ReportsApiService, ReportSummary } from './reports-api.service';
import { environment } from '../../../environments/environment';
const report: ReportSummary = { month: '2026-11', source: 'all', currency: 'NZD', income: '1000.00', expenses: '300.00', refunds: '20.00', netCashFlow: '720.00', transactionCount: 3, bankTransactionCount: 2, uncategorisedCount: 1, coverage: 'complete', excluded: {foreignCurrency: 0, transfers: 0, reviewNeeded: 0}, categories: [{name: 'Uncategorised', amount: '300.00', percentage: 100, count: 1}], daily: [{date: '2026-11-01', income: '1000', expenses: '300', refunds: '20'}] };
async function settle(f:any) { await f.whenStable(); await new Promise(resolve => setTimeout(resolve, 20)); await f.whenStable(); }
async function setup(initial = of(report)) {
 const api = {getReport: vi.fn(() => initial), getCategory: vi.fn(() => of({month:'2026-11',source:'all',category:'Uncategorised',currency:'NZD',total:'300.00',transactions:[]}))};
 TestBed.configureTestingModule({imports:[ReportsPage],providers:[provideZonelessChangeDetection(),provideRouter([]),{provide:ReportsApiService,useValue:api}]});
 const fixture = TestBed.createComponent(ReportsPage);fixture.autoDetectChanges();await settle(fixture);
 return {fixture,page:fixture.componentInstance,api};
}
describe('Reports acceptance',()=>{
 it('renders recorded totals and text equivalents for both charts',async()=>{
  const {fixture}=await setup();const text=fixture.nativeElement.textContent;
  expect(text).toContain('$720.00');expect(text).toContain('Uncategorised');expect(text).toContain('View chart figures');
  expect(fixture.nativeElement.querySelector('table')).not.toBeNull();expect(text).toContain('not your available bank balance');
 });
 it('shows exclusions even when there are no included transactions',async()=>{
  const {fixture}=await setup(of({...report,transactionCount:0,coverage:'partial',excluded:{foreignCurrency:2,reviewNeeded:1,transfers:3}}));
  expect(fixture.nativeElement.textContent).toContain('This report has exclusions');expect(fixture.nativeElement.textContent).toContain('No included transactions');
 });
 it('loads the chosen source and month through form controls',async()=>{
  const {fixture,page,api}=await setup();const select=fixture.nativeElement.querySelector('select') as HTMLSelectElement;select.value='cash';select.dispatchEvent(new Event('change'));await settle(fixture);
  expect(api.getReport).toHaveBeenLastCalledWith(page.month(),'cash');
  (fixture.nativeElement.querySelector('[aria-label="Previous month"]') as HTMLButtonElement).click();await settle(fixture);expect(api.getReport).toHaveBeenLastCalledWith(page.month(),'cash');
 });
 it('shows loading, a retryable failure and recovery without stale totals',async()=>{
  const pending=new Subject<ReportSummary>();const {fixture,page,api}=await setup(pending);
  expect(fixture.nativeElement.textContent).toContain('Loading report');pending.error(new Error('offline'));await settle(fixture);
  expect(fixture.nativeElement.textContent).toContain('Report unavailable');expect(fixture.nativeElement.textContent).not.toContain('$720.00');api.getReport.mockReturnValue(of(report) as any);await page.load();await settle(fixture);expect(fixture.nativeElement.textContent).toContain('$720.00');
 });
 it('ignores out-of-order responses after filter changes',async()=>{
  const {page,api}=await setup();const old=new Subject<ReportSummary>(),newer=new Subject<ReportSummary>();api.getReport.mockReturnValueOnce(old as any).mockReturnValueOnce(newer as any);
  const first=page.load();page.source.set('bank');const second=page.load();newer.next({...report,income:'2000.00'});await second;old.next(report);await first;expect(page.report()?.income).toBe('2000.00');
 });
 it('explains positive, negative and zero cash flow without calling it balance',async()=>{
  const {page}=await setup();expect(page.cashFlowExplanation('10.00')).toContain('inflows exceeded outflows by $10.00');expect(page.cashFlowExplanation('-10.00')).toContain('outflows exceeded inflows by $10.00');expect(page.cashFlowExplanation('0.00')).toContain('were equal');
 });
 it('retains filters when opening category, permits retry and restores focus on close',async()=>{
  const {fixture,page,api}=await setup();const dialog=fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
  dialog.showModal=()=>dialog.setAttribute('open','');dialog.close=()=>{dialog.removeAttribute('open');dialog.dispatchEvent(new Event('close'));};
  page.month.set('2026-10');page.source.set('cash');
  const response=new Subject<any>();api.getCategory.mockReturnValueOnce(response as any);
  const trigger=fixture.nativeElement.querySelector('.category-open') as HTMLButtonElement;trigger.click();await settle(fixture);
  expect(api.getCategory).toHaveBeenCalledWith('2026-10','cash','Uncategorised');expect(dialog.textContent).toContain('Loading transactions');
  response.error(new Error('offline'));await settle(fixture);expect(dialog.textContent).toContain('load these transactions');
  await page.loadCategory();await settle(fixture);expect(dialog.textContent).toContain('No matching expense');
  page.closeCategory();await settle(fixture);expect(document.activeElement).toBe(trigger);expect(page.month()).toBe('2026-10');expect(page.source()).toBe('cash');
 });
 it('ignores a detail response after its dialog closes',async()=>{
  const {fixture,page,api}=await setup();const delayed=new Subject<any>();api.getCategory.mockReturnValueOnce(delayed as any);page.selectedCategory.set('Groceries');const pending=page.loadCategory();page.categoryClosed();delayed.next({total:'900'});await pending;await settle(fixture);expect(page.categoryReport()).toBeNull();
 });
 it('blocks invalid/future filters and derives NZ months independent of UTC',async()=>{
  const {page,api}=await setup();const count=api.getReport.mock.calls.length;page.selectMonth('2026-13');page.selectMonth('9999-01');page.selectSource('invalid');expect(api.getReport.mock.calls.length).toBe(count);
  expect(nzMonth(new Date('2026-10-31T11:30:00Z'))).toBe('2026-11');
 });
});
describe('Reports API contract',()=>{
 it('sends credentialed month/source query and preserves decimal strings',()=>{
  TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting()]});const api=TestBed.inject(ReportsApiService),http=TestBed.inject(HttpTestingController);let received:ReportSummary|undefined;
  api.getReport('2026-10','bank').subscribe(value=>received=value);const req=http.expectOne(r=>r.url===environment.apiUrl+'/reports');expect(req.request.withCredentials).toBe(true);expect(req.request.params.get('month')).toBe('2026-10');expect(req.request.params.get('source')).toBe('bank');req.flush(report);expect(received?.income).toBe('1000.00');http.verify();
 });
});
