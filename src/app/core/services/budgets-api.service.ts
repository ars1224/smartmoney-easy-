
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';

export interface BudgetRecord {
  id: string;
  category: string;
  monthlyLimit: number;
  spent: number;
  createdAt: string;
  updatedAt: string;
}

interface BudgetDto {
  id: string;
  category: string;
  monthlyLimit: string;
  spent: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBudgetPayload {
  category: string;
  monthlyLimit: number;
}

export interface UpdateBudgetPayload {
  category?: string;
  monthlyLimit?: number;
}

interface BudgetListResponse {
  month: string;
  budgets: BudgetDto[];
  count: number;
}

interface BudgetResponse {
  message: string;
  budget: BudgetDto;
}

@Injectable({ providedIn: 'root' })
export class BudgetsApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly apiUrl =
    `${environment.apiUrl}/budgets`;

  getBudgets(): Observable<BudgetRecord[]> {
    return this.http.get<BudgetListResponse>(
      this.apiUrl,
      { withCredentials: true }
    ).pipe(
      map(response =>
        response.budgets.map(budget =>
          this.mapBudget(budget)
        )
      )
    );
  }

  createBudget(
    payload: CreateBudgetPayload
  ): Observable<BudgetRecord> {
    return this.write<BudgetResponse>(
      'POST',
      this.apiUrl,
      {
        category: payload.category,
        monthlyLimit: payload.monthlyLimit.toFixed(2),
      }
    ).pipe(
      map(response => this.mapBudget(response.budget))
    );
  }

  updateBudget(
    id: string,
    payload: UpdateBudgetPayload
  ): Observable<BudgetRecord> {
    const body = {
      ...payload,
      ...(payload.monthlyLimit !== undefined
        ? {
            monthlyLimit:
              payload.monthlyLimit.toFixed(2),
          }
        : {}),
    };

    return this.write<BudgetResponse>(
      'PATCH',
      `${this.apiUrl}/${encodeURIComponent(id)}`,
      body
    ).pipe(
      map(response => this.mapBudget(response.budget))
    );
  }

  private write<T>(
    method: 'POST' | 'PATCH',
    url: string,
    body: unknown
  ): Observable<T> {
    return this.auth.getCsrfToken().pipe(
      switchMap(token =>
        this.http.request<T>(method, url, {
          body,
          withCredentials: true,
          headers: {
            'X-CSRF-Token': token,
          },
        })
      )
    );
  }

  private mapBudget(dto: BudgetDto): BudgetRecord {
    return {
      id: dto.id,
      category: dto.category,
      monthlyLimit: Number(dto.monthlyLimit),
      spent: Number(dto.spent),
      createdAt: dto.createdAt,
      updatedAt: dto.updatedAt,
    };
  }
}

