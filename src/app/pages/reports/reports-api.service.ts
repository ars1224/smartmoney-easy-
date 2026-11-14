import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
export type ReportSource = 'all' | 'cash' | 'bank';
export interface ReportDay { date: string; income: string; expenses: string; refunds: string }
export interface ReportSummary {
  month: string; source: ReportSource; currency: 'NZD'; income: string; expenses: string;
  refunds: string; netCashFlow: string; transactionCount: number; uncategorisedCount: number;
  bankTransactionCount: number; coverage: 'complete' | 'partial';
  excluded: { foreignCurrency: number; transfers: number; reviewNeeded: number };
  categories: { name: string; amount: string; percentage: number; count: number }[];
  daily: ReportDay[];
}
export interface CategoryReport {
  month: string; source: ReportSource; category: string; currency: 'NZD'; total: string;
  transactions: { id: string; description: string; source: string; amount: string; currency: string; date: string; reportDate: string }[];
}
@Injectable({ providedIn: 'root' })
export class ReportsApiService {
  private readonly http = inject(HttpClient);
  getCategory(month: string, source: ReportSource, category: string) {
    return this.http.get<CategoryReport>(`${environment.apiUrl}/reports/category`, {
      params: { month, source, category }, withCredentials: true,
    });
  }
  getReport(month: string, source: ReportSource) {
    return this.http.get<ReportSummary>(`${environment.apiUrl}/reports`, {
      params: { month, source }, withCredentials: true,
    });
  }
}
