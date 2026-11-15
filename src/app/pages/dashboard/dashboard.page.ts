import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { SmCardComponent } from '../../shared/ui/sm-card/sm-card.component';
import { SmProgressComponent } from '../../shared/ui/sm-progress/sm-progress.component';
import { SmButtonComponent } from '../../shared/ui/sm-button/sm-button.component';
import { DashboardBudget, DashboardDataService, DashboardSnapshot } from './dashboard-data.service';

type DashboardState = 'loading' | 'ready' | 'empty' | 'error' | 'stale';
@Component({
 selector: 'app-dashboard', standalone: true,
 imports: [CurrencyPipe, DatePipe, RouterLink, SmCardComponent, SmProgressComponent, SmButtonComponent],
 templateUrl: './dashboard.page.html', styleUrl: './dashboard.page.scss',
})
export class DashboardPage implements OnInit, OnDestroy {
 private readonly auth = inject(AuthService);
 private readonly data = inject(DashboardDataService);
 private request?: Subscription;
 readonly snapshot = signal<DashboardSnapshot | null>(null);
 readonly state = signal<DashboardState>('loading');
 readonly firstName = computed(() => this.auth.currentUser()?.name?.trim().split(/\s+/)[0] || 'there');
 readonly todayLabel = new Intl.DateTimeFormat('en-NZ', {timeZone:'Pacific/Auckland',weekday:'long',day:'numeric',month:'long'}).format(new Date());
 readonly monthLabel = computed(() => {
  const month = this.snapshot()?.report.month;
  return month ? new Intl.DateTimeFormat('en-NZ',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${month}-15T12:00:00Z`)) : '';
 });
 readonly budgets = computed(() => [...(this.snapshot()?.budgets ?? [])].sort((a,b) => this.ratio(b) - this.ratio(a) || a.category.localeCompare(b.category)).slice(0,4));
 readonly goal = computed(() => {
  const goals = [...(this.snapshot()?.goals ?? [])];
  const incomplete = goals.filter(goal => Number(goal.savedAmount) < Number(goal.targetAmount));
  return (incomplete.length ? incomplete : goals).sort((a,b) => a.targetDate.localeCompare(b.targetDate) || a.id.localeCompare(b.id))[0];
 });
 readonly weeks = computed(() => {
  const days = this.snapshot()?.report.daily ?? [];
  const weeks = [];
  for (let i=0;i<days.length;i+=7) {
   const block = days.slice(i,i+7);
   weeks.push({label:`${i+1}–${i+block.length}`,income:block.reduce((n,day)=>n+Number(day.income),0),expenses:block.reduce((n,day)=>n+Number(day.expenses),0)});
  }
  return weeks;
 });
 readonly chartMaximum = computed(() => Math.max(1,...this.weeks().flatMap(week=>[week.income,week.expenses])));
 readonly incomePoints = computed(() => this.points('income'));
 readonly expensePoints = computed(() => this.points('expenses'));
 ngOnInit(): void { this.load(); }
 ngOnDestroy(): void { this.request?.unsubscribe(); }
 load(): void {
  this.request?.unsubscribe(); this.state.set('loading');
  this.request = this.data.load().subscribe({
   next: snapshot => {
    this.snapshot.set(snapshot);
    const empty = snapshot.recordCount === 0 && snapshot.budgets?.length === 0 && snapshot.goals?.length === 0;
    this.state.set(empty ? 'empty' : 'ready');
   },
   error: () => this.state.set(this.snapshot() ? 'stale' : 'error'),
  });
 }
 progress(value: number | string, maximum: number | string): number {
  return Number(maximum) > 0 ? Math.max(0,Math.min(100, Math.round(Number(value)/Number(maximum)*100))) : 0;
 }
 budgetTone(budget: DashboardBudget): 'teal' | 'warning' | 'danger' {
  return Number(budget.spent) > Number(budget.monthlyLimit) ? 'danger' : Number(budget.spent) === Number(budget.monthlyLimit) ? 'warning' : 'teal';
 }
 budgetStatus(budget: DashboardBudget): string {
  if (Number(budget.monthlyLimit) === 0) return Number(budget.spent) > 0 ? 'Spending with no allowance' : 'No allowance set';
  return Number(budget.spent) > Number(budget.monthlyLimit) ? 'Over limit' : Number(budget.spent) === Number(budget.monthlyLimit) ? 'At limit' : 'Within limit';
 }
 dateLabel(value: string): string { return new Intl.DateTimeFormat('en-NZ',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`)); }
 openThinker(): void { window.dispatchEvent(new Event('smartmoney:open-thinker')); }
 private ratio(budget: DashboardBudget): number { return Number(budget.monthlyLimit) > 0 ? Number(budget.spent)/Number(budget.monthlyLimit) : Number(budget.spent) > 0 ? Infinity : 0; }
 private points(key: 'income' | 'expenses'): string {
  const weeks = this.weeks();
  return weeks.map((week,index)=>`${20+index*360/Math.max(1,weeks.length-1)},${150-week[key]/this.chartMaximum()*125}`).join(' ');
 }
}
