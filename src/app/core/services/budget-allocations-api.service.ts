
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, switchMap } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';


export interface BudgetAllocation {
  needsPercent: number;
  savingsPercent: number;
  wantsPercent: number;
}

export interface BudgetAllocationResponse {
  month: string;
  allocation: BudgetAllocation | null;
}

export interface BudgetAllocationSaveResponse {
  message: string;
  month: string;
  allocation: BudgetAllocation;
}

@Injectable({
  providedIn: 'root',
})
export class BudgetAllocationsApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly apiUrl =
    `${environment.apiUrl}/budget-allocations`;

  getAllocation(
    month?: string
  ): Observable<BudgetAllocationResponse> {
    return this.http.get<BudgetAllocationResponse>(
      this.apiUrl,
      {
        withCredentials: true,
        params: month ? { month } : {},
      }
    );
  }

  saveAllocation(
    allocation: BudgetAllocation,
    month?: string
  ): Observable<BudgetAllocationSaveResponse> {
    return this.auth.getCsrfToken().pipe(
      switchMap(token =>
        this.http.put<BudgetAllocationSaveResponse>(
          this.apiUrl,
          allocation,
          {
            withCredentials: true,
            params: month ? { month } : {},
            headers: {
              'X-CSRF-Token': token,
            },
          }
        )
      )
    );
  }
}
