import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, forkJoin, map, of, throwError, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ReportSummary } from '../reports/reports-api.service';

export interface DashboardBudget {
  id: string;
  category: string;
  monthlyLimit: string;
  spent: string;
}
export interface DashboardGoal {
  id: string;
  name: string;
  savedAmount: string;
  targetAmount: string;
  targetDate: string;
}
export interface DashboardTransaction {
  id: string;
  name: string;
  category: string;
  date: string;
  reportDate: string;
  amount: string;
  currency: string;
  source: 'cash' | 'bank';
}
export interface DashboardOverview {
  report: ReportSummary;
  transactions: DashboardTransaction[];
  recordCount: number;
  loadedAt: string;
}
export interface DashboardSnapshot extends DashboardOverview {
  budgets: DashboardBudget[] | null;
  goals: DashboardGoal[] | null;
}
export function dashboardMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`;
}
@Injectable({ providedIn: 'root' })
export class DashboardDataService {
  private readonly http = inject(HttpClient);
  load(month = dashboardMonth()): Observable<DashboardSnapshot> {
    const options = { withCredentials: true, params: { month } };
    // Optional sections can fail independently, but authentication failures still propagate.
    const optionalError = (error: unknown) =>
      error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)
        ? throwError(() => error)
        : of(null);
    return forkJoin({
      overview: this.http
        .get<DashboardOverview>(`${environment.apiUrl}/dashboard`, options)
        .pipe(timeout(12000)),
      budgets: this.http
        .get<{ budgets: DashboardBudget[] }>(`${environment.apiUrl}/budgets`, options)
        .pipe(timeout(12000), catchError(optionalError)),
      goals: this.http
        .get<{
          goals: DashboardGoal[];
        }>(`${environment.apiUrl}/savings-goals`, { withCredentials: true })
        .pipe(timeout(12000), catchError(optionalError)),
    }).pipe(
      map(({ overview, budgets, goals }) => ({
        ...overview,
        budgets: budgets?.budgets ?? null,
        goals: goals?.goals ?? null,
      })),
    );
  }
}
