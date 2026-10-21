import { Injectable } from '@angular/core';
import { Observable, delay, of } from 'rxjs';

export interface DashboardMetric { label: string; amount: number; change: string }
export interface DashboardBudget { name: string; spent: number; limit: number; tone: 'teal' | 'green' | 'warning' | 'danger' }
export interface DashboardTransaction { id: string; name: string; category: string; date: string; amount: number; source: 'manual' | 'mock-bank' }
export interface DashboardSnapshot {
  /** Illustrative design value only; not a calculated financial recommendation. */
  safeToSpend: number;
  safeToSpendEndDate: Date;
  lastUpdated: string;
  metrics: DashboardMetric[];
  budgets: DashboardBudget[];
  goal: { name: string; saved: number; target: number; note: string };
  transactions: DashboardTransaction[];
  learning: { duration: string; title: string; description: string };
}

const DEMO_SNAPSHOT: DashboardSnapshot = {
  safeToSpend: 42.5,
  safeToSpendEndDate: nextFriday(new Date()),
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
    { id: 'demo-transaction-1', name: 'Fresh Choice', category: 'Groceries', date: 'Today', amount: -84.2, source: 'mock-bank' },
    { id: 'demo-transaction-2', name: 'AT HOP', category: 'Transport', date: 'Yesterday', amount: -32, source: 'mock-bank' },
    { id: 'demo-transaction-3', name: 'Salary', category: 'Income', date: '2 Oct', amount: 1400, source: 'mock-bank' },
  ],
  learning: { duration: '2 min read', title: 'Make your food budget last', description: 'Example article based on grocery activity' },
};

function nextFriday(today: Date): Date {
  const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  endDate.setDate(endDate.getDate() + ((5 - endDate.getDay() + 7) % 7));
  return endDate;
}

@Injectable({ providedIn: 'root' })
export class DashboardDataService {
  /** Replace this boundary when approved backend contracts are ready. */
  load(): Observable<DashboardSnapshot> {
    return of({ ...DEMO_SNAPSHOT, safeToSpendEndDate: nextFriday(new Date()) }).pipe(delay(350));
  }
}
