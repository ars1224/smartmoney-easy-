
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';

export interface MonthlyIncomeSummary {
  month: string;
  expectedIncome: number | null;
  allocatedBudget: number;
  unallocatedBudget: number | null;
}

interface MonthlyIncomeDto {
  month: string;
  expectedIncome: string | null;
  allocatedBudget: string;
  unallocatedBudget: string | null;
}

@Injectable({ providedIn: 'root' })
export class MonthlyIncomeApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly apiUrl =
    `${environment.apiUrl}/monthly-income`;

  getSummary(month: string): Observable<MonthlyIncomeSummary> {
    return this.http.get<MonthlyIncomeDto>(
      this.apiUrl,
      {
        params: { month },
        withCredentials: true,
      }
    ).pipe(
      map(response => ({
        month: response.month,
        expectedIncome:
          response.expectedIncome === null
            ? null
            : Number(response.expectedIncome),
        allocatedBudget: Number(response.allocatedBudget),
        unallocatedBudget:
          response.unallocatedBudget === null
            ? null
            : Number(response.unallocatedBudget),
      }))
    );
  }

  saveExpectedIncome(
    month: string,
    amount: number
  ): Observable<void> {
    return this.auth.getCsrfToken().pipe(
      switchMap(token =>
        this.http.put(
          this.apiUrl,
          {
            expectedIncome: amount.toFixed(2),
          },
          {
            params: { month },
            withCredentials: true,
            headers: {
              'X-CSRF-Token': token,
            },
          }
        )
      ),
      map(() => undefined)
    );
  }
}
