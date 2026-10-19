import { Injectable } from '@angular/core';
import { Observable, delay, of } from 'rxjs';

export interface DashboardMetric { label: string; amount: number; change: string }
export interface DashboardBudget { name: string; spent: number; limit: number; tone: 'teal' | 'green' | 'warning' | 'danger' }
export interface DashboardTransaction { name: string; category: string; date: string; amount: number; source: 'manual' | 'mock-bank' }
export interface DashboardSnapshot {
  /** Illustrative design value only; not a calculated financial recommendation. */
  safeToSpend: number;
  safeToSpendUntil: string;
  daysRemaining: number;
  lastUpdated: string;
  metrics: DashboardMetric[];
  budgets: DashboardBudget[];
  goal: { name: string; saved: number; target: number; note: string };
  transactions: DashboardTransaction[];
  learning: { duration: string; title: string; description: string };
}

const DEMO_SNAPSHOT: DashboardSnapshot = {
  safeToSpend: 42.5,
  safeToSpendUntil: 'Friday',
  daysRemaining: 7,
  lastUpdated: 'Example data — no bank connected',
  metrics: [
    { label: 'Income', amount: 2800, change: '+4.2% vs last month' },
    { label: 'Expenses', amount: 1940, change: '−6.8% vs last month' },
    { label: 'Saved', amount: 420, change: '+12% vs last month' },
  ],
  budgets: [
    { name: 'Groceries', spent: 382, limit: 500, tone: 'teal' },
    { name: 'Transport', spent: 168, limit: 200, tone: 'warning' },
    { name: 'Eating out', spent: 126, limit: 140, tone: 'danger' },
    { name: 'Utilities', spent: 214, limit: 280, tone: 'green' },
  ],
  goal: { name: 'Emergency fund', saved: 1260, target: 2000, note: '$40 ahead this month' },
  transactions: [
    { name: 'Fresh Choice', category: 'Groceries', date: 'Today', amount: -84.2, source: 'mock-bank' },
    { name: 'AT HOP', category: 'Transport', date: 'Yesterday', amount: -32, source: 'mock-bank' },
    { name: 'Salary', category: 'Income', date: '2 Oct', amount: 1400, source: 'mock-bank' },
  ],
  learning: { duration: '2 min read', title: 'Make your food budget last', description: 'Example article based on grocery activity' },
};

@Injectable({ providedIn: 'root' })
export class DashboardDataService {
  /** Replace this boundary when approved backend contracts are ready. */
  load(): Observable<DashboardSnapshot> { return of(DEMO_SNAPSHOT).pipe(delay(350)); }
}
