
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';
import type {
  BudgetGroup,
} from '../constants/financial-categories';

export interface BudgetRecord {
  id: string;
  category: string;
  budgetGroup: BudgetGroup | null;
  monthlyLimit: number;
  spent: number;
  createdAt: string;
  updatedAt: string;
}

export interface GroupSpending {
  NEEDS: number;
  WANTS: number;
}

export interface BudgetOverview {
  budgets: BudgetRecord[];
  groupSpending: GroupSpending;
  savingsTransferred: number;
}

interface BudgetDto {
  id: string;
  category: string;
  budgetGroup?: BudgetGroup | null;
  monthlyLimit: string;
  spent: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBudgetPayload {
  category: string;
  budgetGroup: BudgetGroup;
  monthlyLimit: number;
}

export interface UpdateBudgetPayload {
  category?: string;
  budgetGroup?: BudgetGroup;
  monthlyLimit?: number;
}

interface BudgetListResponse {
  month: string;
  budgets: BudgetDto[];
  count: number;
  groupSpending?: {
    NEEDS?: string;
    WANTS?: string;
  };
  savingsTransferred?: string;
}

interface BudgetResponse {
  message: string;
  budget: BudgetDto;
}

export interface AllocationOverview {
  month: string;
  configured: boolean;
  availableMoney: number | null;

  percentages: Record<BudgetGroup, number>;

  targets: Record<BudgetGroup, number> | null;
}

interface AllocationDto {
  month: string;
  configured: boolean;
  availableMoney: string | null;

  percentages: Record<BudgetGroup, number>;

  targets: Record<BudgetGroup, string> | null;
}

export interface SaveAllocationPayload {
  availableMoney: number;
  needsPercent: number;
  wantsPercent: number;
  savingsPercent: number;
}

@Injectable({ providedIn: 'root' })
export class BudgetsApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly apiUrl =
    `${environment.apiUrl}/budgets`;

    getBudgets(month?: string): Observable<BudgetRecord[]> {
    return this.http.get<BudgetListResponse>(
        this.apiUrl,
        {
        withCredentials: true,
        params: month ? { month } : {},
        }
    ).pipe(
        map(response =>
        response.budgets.map(budget =>
            this.mapBudget(budget)
        )
        )
    );
    }

    createBudget(
      payload: CreateBudgetPayload,
      month?: string
    ): Observable<BudgetRecord> {
      return this.write<BudgetResponse>(
        'POST',
        this.apiUrl,
        {
          category: payload.category,
          budgetGroup: payload.budgetGroup,
          monthlyLimit: payload.monthlyLimit.toFixed(2),
        },
        month
      ).pipe(
        map(response => this.mapBudget(response.budget))
      );
    }

    updateBudget(
      id: string,
      payload: UpdateBudgetPayload,
      month?: string
    ): Observable<BudgetRecord> {
      const body = {
        ...payload,
        ...(payload.monthlyLimit !== undefined
          ? {
              monthlyLimit: payload.monthlyLimit.toFixed(2),
            }
          : {}),
      };

      return this.write<BudgetResponse>(
        'PATCH',
        `${this.apiUrl}/${encodeURIComponent(id)}`,
        body,
        month
      ).pipe(
        map(response => this.mapBudget(response.budget))
      );
    }

    private write<T>(
      method: 'POST' | 'PATCH',
      url: string,
      body: unknown,
      month?: string
    ): Observable<T> {
      return this.auth.getCsrfToken().pipe(
        switchMap(token =>
          this.http.request<T>(method, url, {
            body,
            withCredentials: true,
            params: month ? { month } : {},
            headers: {
              'X-CSRF-Token': token,
            },
          })
        )
      );
    }

private mapAllocation(
  dto: AllocationDto
): AllocationOverview {
  return {
    month: dto.month,
    configured: dto.configured,

    availableMoney:
      dto.availableMoney === null
        ? null
        : Number(dto.availableMoney),

    percentages: {
      NEEDS: dto.percentages.NEEDS,
      WANTS: dto.percentages.WANTS,
      SAVINGS: dto.percentages.SAVINGS,
    },

    targets: dto.targets
      ? {
          NEEDS: Number(dto.targets.NEEDS),
          WANTS: Number(dto.targets.WANTS),
          SAVINGS: Number(dto.targets.SAVINGS),
        }
      : null,
  };
}

getAllocation(
  month?: string
): Observable<AllocationOverview> {
  return this.http.get<AllocationDto>(
    `${this.apiUrl}/allocation`,
    {
      withCredentials: true,
      params: month ? { month } : {},
    }
  ).pipe(
    map(response => this.mapAllocation(response))
  );
}

saveAllocation(
  payload: SaveAllocationPayload,
  month?: string
): Observable<AllocationOverview> {
  return this.auth.getCsrfToken().pipe(
    switchMap(token =>
      this.http.put<AllocationDto>(
        `${this.apiUrl}/allocation`,
        {
          availableMoney:
            payload.availableMoney.toFixed(2),

          needsPercent: payload.needsPercent,
          wantsPercent: payload.wantsPercent,
          savingsPercent: payload.savingsPercent,
        },
        {
          withCredentials: true,
          params: month ? { month } : {},
          headers: {
            'X-CSRF-Token': token,
          },
        }
      )
    ),
    map(response => this.mapAllocation(response))
  );
}

private mapBudget(dto: BudgetDto): BudgetRecord {
  return {
    id: dto.id,
    category: dto.category,
    budgetGroup: dto.budgetGroup ?? null,
    monthlyLimit: Number(dto.monthlyLimit),
    spent: Number(dto.spent),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}


  getBudgetOverview(month?: string): Observable<BudgetOverview> {
    return this.http.get<BudgetListResponse>(
      this.apiUrl,
      {
        withCredentials: true,
        params: month ? { month } : {},
      }
    ).pipe(
      map(response => ({
        budgets: response.budgets.map(
          budget => this.mapBudget(budget)
        ),
        groupSpending: {
          NEEDS: Number(response.groupSpending?.NEEDS ?? 0),
          WANTS: Number(response.groupSpending?.WANTS ?? 0),
        },

        savingsTransferred: Number(
          response.savingsTransferred ?? 0
        ),
      }))
    );
  }

}
