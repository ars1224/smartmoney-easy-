import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { DashboardPage } from './dashboard.page';
import { DashboardDataService, DashboardSnapshot } from './dashboard-data.service';
import { AuthService } from '../../core/auth/auth.service';
const data:DashboardSnapshot={report:{month:'2026-11',source:'all',currency:'NZD',income:'1000.10',expenses:'300.20',refunds:'20.05',netCashFlow:'719.95',transactionCount:3,bankTransactionCount:2,uncategorisedCount:0,coverage:'complete',excluded:{foreignCurrency:0,transfers:0,reviewNeeded:0},categories:[{name:'Groceries',amount:'300.20',percentage:100,count:1}],daily:[{date:'2026-11-01',income:'1000.10',expenses:'300.20',refunds:'20.05'}]},recordCount:3,loadedAt:'2026-11-15T00:00:00Z',transactions:[{id:'t1',name:'My grocery record',category:'Groceries',date:'2026-11-01T00:00:00Z',reportDate:'2026-11-01',source:'bank',currency:'NZD',amount:'-300.20'}],budgets:[{id:'b1',category:'Groceries',spent:'300.20',monthlyLimit:'250.00'}],goals:[{id:'g1',name:'My actual goal',savedAmount:'80',targetAmount:'100',targetDate:'2026-12-01'}]};
describe('Real Dashboard interactions',()=>{
 function setup(load=vi.fn().mockReturnValue(of(data))){
  TestBed.configureTestingModule({imports:[DashboardPage],providers:[provideRouter([]),{provide:AuthService,useValue:{currentUser:()=>({name:'Dhona Test',email:'test@example.test'})}},{provide:DashboardDataService,useValue:{load}}]});
  const fixture=TestBed.createComponent(DashboardPage);fixture.detectChanges();return {fixture,page:fixture.componentInstance,load};
 }
 it('renders saved figures, real activity and goal instead of examples',()=>{
  const {fixture,page}=setup();const text=fixture.nativeElement.textContent;
  expect(text).toContain('Kia ora, Dhona');expect(text).toContain('$719.95');expect(text).toContain('My grocery record');expect(text).toContain('My actual goal');expect(text).toContain('80%');expect(text).not.toContain('42.50');
  expect(fixture.nativeElement.querySelector('table')).not.toBeNull();expect(page.budgetStatus(data.budgets![0])).toBe('Over limit');expect(page.progress('300.20','250')).toBe(100);
 });
 it('connects income and expense to the existing form and exposes Reports/Learn',()=>{
  const {fixture,page}=setup();const links=[...fixture.nativeElement.querySelectorAll('a')].map((a:any)=>a.getAttribute('href'));
  expect(links).toContain('/app/activity/add?type=income');expect(links).toContain('/app/activity/add?type=expense');expect(links).toContain('/app/reports');expect(links).toContain('/app/learn');
  const listener=vi.fn();window.addEventListener('smartmoney:open-thinker',listener);page.openThinker();expect(listener).toHaveBeenCalledTimes(1);window.removeEventListener('smartmoney:open-thinker',listener);
 });
 it('shows partial-data and section failures without replacing missing data with zeros',()=>{
  const {fixture}=setup(vi.fn().mockReturnValue(of({...data,budgets:null,goals:null,report:{...data.report,coverage:'partial',excluded:{foreignCurrency:2,transfers:1,reviewNeeded:1}}})));
  const text=fixture.nativeElement.textContent;expect(text).toContain('2 non-NZD');expect(text).toContain('Budget information is unavailable');expect(text).toContain('Goal information is unavailable');expect(text).not.toContain('No category budgets yet');
 });
 it('shows genuine empty-state setup actions',()=>{
  const {fixture,page}=setup(vi.fn().mockReturnValue(of({...data,recordCount:0,transactions:[],budgets:[],goals:[],report:{...data.report,income:'0',expenses:'0',refunds:'0',netCashFlow:'0',transactionCount:0,daily:[]}})));
  expect(page.state()).toBe('empty');expect(fixture.nativeElement.textContent).toContain('Start with what you have');expect(fixture.nativeElement.textContent).not.toContain('My actual goal');
 });
 it('handles loading, refresh failure with a labelled stale snapshot and successful recovery',()=>{
  const pending=new Subject<DashboardSnapshot>();const load=vi.fn().mockReturnValueOnce(pending).mockReturnValueOnce(throwError(()=>new Error('offline'))).mockReturnValue(of(data));
  const {fixture,page}=setup(load);expect(page.state()).toBe('loading');pending.next(data);pending.complete();fixture.detectChanges();
  page.load();fixture.detectChanges();expect(page.state()).toBe('stale');expect(fixture.nativeElement.textContent).toContain('previously loaded figures');expect(fixture.nativeElement.textContent).toContain('$719.95');
  page.load();expect(page.state()).toBe('ready');
 });
 it('shows an initial failure and supports retry',()=>{
  const {fixture,page}=setup(vi.fn().mockReturnValueOnce(throwError(()=>new Error('offline'))).mockReturnValue(of(data)));
  expect(page.state()).toBe('error');expect(fixture.nativeElement.textContent).toContain('Dashboard unavailable');page.load();expect(page.state()).toBe('ready');
 });
 it('ignores cancelled responses and cancels pending work when destroyed',()=>{
  const old=new Subject<DashboardSnapshot>();const current=new Subject<DashboardSnapshot>();const {fixture,page}=setup(vi.fn().mockReturnValueOnce(old).mockReturnValue(current));
  page.load();old.next(data);expect(page.snapshot()).toBeNull();current.next(data);expect(page.snapshot()).toEqual(data);fixture.destroy();current.next({...data,recordCount:999});expect(page.snapshot()?.recordCount).toBe(3);
 });
 it('keeps zero limits and completed goals honest',()=>{
  const {page}=setup();expect(page.budgetStatus({id:'zero',category:'Other',spent:'5',monthlyLimit:'0'})).toBe('Spending with no allowance');expect(page.progress('5','0')).toBe(0);
  page.snapshot.set({...data,goals:[{id:'later',name:'Later',savedAmount:'5',targetAmount:'100',targetDate:'2027-01-01'},{id:'done',name:'Done',savedAmount:'100',targetAmount:'100',targetDate:'2026-10-01'}]});expect(page.goal()?.id).toBe('later');
 });
});
