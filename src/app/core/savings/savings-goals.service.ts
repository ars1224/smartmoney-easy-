import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';

export type GoalGroup = 'NEEDS' | 'WANTS' | 'SAVINGS';

export interface SavingsFundingSummary {
  linkedSavingsBalance: number | null;
  savingsAccountCount: number;
  currency: string;
  lastSyncedAt: string | null;
}

interface SavingsFundingSummaryDto {
  linkedSavingsBalance: string | null;
  savingsAccountCount: number;
  currency: string;
  lastSyncedAt: string | null;
}

export type GoalFundingSourceType =
  'BANK_ACCOUNT' | 'CASH_WALLET';

export interface GoalFundingSource {
  sourceType: GoalFundingSourceType;
  sourceId: string;
  name: string;
  currency: string;
  currentBalance: number;
  allocated: number;
  available: number;
  shortfall: number;
  isAvailable: boolean;
  lastSyncedAt: string | null;
}

export interface GoalFundingAllocation {
  sourceType: GoalFundingSourceType;
  sourceId: string;
  name: string;
  allocated: number;
  isAvailable: boolean;
  shortfall: number;
}

export interface GoalFundingHistoryItem {
  id: string;
  sourceType: GoalFundingSourceType;
  sourceId: string;
  amount: number;
  createdAt: string;
  movementType: 'ALLOCATED' | 'RELEASED' | 'SPENT';
  transactionId: string | null;
}

export interface GoalFundingHistory {
  goalId: string;
  verifiedSavedAmount: number;
  legacyUnverifiedAmount: number;
  sources: GoalFundingAllocation[];
  history: GoalFundingHistoryItem[];
}

interface GoalFundingHistoryDto {
  goalId: string;
  verifiedSavedAmount: string;
  legacyUnverifiedAmount: string;

  sources: Array<{
    sourceType: GoalFundingSourceType;
    sourceId: string;
    name: string;
    allocated: string;
    isAvailable: boolean;
    shortfall: string;
  }>;

  history: Array<{
    id: string;
    sourceType: GoalFundingSourceType;
    sourceId: string;
    amount: string;
    createdAt: string;
    movementType?: 'ALLOCATED' | 'RELEASED' | 'SPENT';
    transactionId?: string | null;
  }>;
}

interface GoalFundingSourceDto {
  sourceType: GoalFundingSourceType;
  sourceId: string;
  name: string;
  currency: string;
  currentBalance: string;
  allocated: string;
  available: string;
  shortfall: string;
  isAvailable: boolean;
  lastSyncedAt: string | null;
}

interface GoalFundingSourcesResponse {
  sources: GoalFundingSourceDto[];
  count: number;
}

export interface SavingsGoalRecord {
  id: string;
  name: string;
  group: GoalGroup;
  targetAmount: number;
  savedAmount: number;
  targetDate: string;
  createdAt: string;
  updatedAt: string;
  legacyUnverifiedAmount: number;
  spentAmount: number;
  achievedAt: string | null;
}

interface SavingsGoalDto {
  id: string;
  name: string;
  targetAmount: string;
  savedAmount: string;
  targetDate: string;
  createdAt: string;
  updatedAt: string;
  group?: GoalGroup;
  legacyUnverifiedAmount?: string;
  spentAmount: string;
  achievedAt: string | null;
}

export interface SavingsGoalPayload {
  name: string;
  group?: GoalGroup;
  targetAmount: number;
  targetDate: string;
}

interface GoalListResponse {
  goals: SavingsGoalDto[];
  count: number;
}

interface GoalResponse {
  message: string;
  goal: SavingsGoalDto;
}

@Injectable({ providedIn: 'root' })
export class SavingsGoalsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly apiUrl = environment.production
    ? '/api/savings-goals'
    : 'http://localhost:5000/api/savings-goals';

  getGoals(): Observable<SavingsGoalRecord[]> {
    return this.http.get<GoalListResponse>(
      this.apiUrl,
      { withCredentials: true }
    ).pipe(
      map(response =>
        response.goals.map(goal => this.mapGoal(goal))
      )
    );
  }

  createGoal(
    payload: SavingsGoalPayload
  ): Observable<SavingsGoalRecord> {
    return this.write<GoalResponse>(
      'POST',
      this.apiUrl,
      payload
    ).pipe(
      map(response => this.mapGoal(response.goal))
    );
  }

  updateGoal(
    id: string,
    payload: Partial<SavingsGoalPayload>
  ): Observable<SavingsGoalRecord> {
    return this.write<GoalResponse>(
      'PATCH',
      `${this.apiUrl}/${encodeURIComponent(id)}`,
      payload
    ).pipe(
      map(response => this.mapGoal(response.goal))
    );
  }

  achieveGoal(id: string): Observable<SavingsGoalRecord> {
    return this.write<GoalResponse>(
      'POST',
      `${this.apiUrl}/${encodeURIComponent(id)}/achieve`
    ).pipe(
      map(response => this.mapGoal(response.goal))
    );
  }

  deleteGoal(id: string): Observable<void> {
    return this.write<{ message: string }>(
      'DELETE',
      `${this.apiUrl}/${encodeURIComponent(id)}`
    ).pipe(
      map(() => undefined)
    );
  }

  getFundingSources(): Observable<GoalFundingSource[]> {
  return this.http.get<GoalFundingSourcesResponse>(
    `${this.apiUrl}/funding-sources`,
    { withCredentials: true }
  ).pipe(
    map(response =>
      response.sources.map(source => ({
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        name: source.name,
        currency: source.currency,
        currentBalance: Number(source.currentBalance),
        allocated: Number(source.allocated),
        available: Number(source.available),
        shortfall: Number(source.shortfall),
        isAvailable: source.isAvailable,
        lastSyncedAt: source.lastSyncedAt,
      }))
    )
  );
}

  private write<T>(
    method: 'POST' | 'PATCH' | 'DELETE',
    url: string,
    body?: unknown
  ): Observable<T> {
    return this.auth.getCsrfToken().pipe(
      switchMap(token =>
        this.http.request<T>(
          method,
          url,
          {
            body,
            withCredentials: true,
            headers: {
              'X-CSRF-Token': token,
            },
          }
        )
      )
    );
  }

  getGoalFundingHistory(
  goalId: string
): Observable<GoalFundingHistory> {
  return this.http.get<GoalFundingHistoryDto>(
    `${this.apiUrl}/${encodeURIComponent(goalId)}/funding`,
    { withCredentials: true }
  ).pipe(
    map(response => ({
      goalId: response.goalId,

      verifiedSavedAmount:
        Number(response.verifiedSavedAmount),

      legacyUnverifiedAmount:
        Number(response.legacyUnverifiedAmount),

      sources: response.sources.map(source => ({
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        name: source.name,
        allocated: Number(source.allocated),
        isAvailable: source.isAvailable,
        shortfall: Number(source.shortfall),
      })),

      history: response.history.map(item => ({
        id: item.id,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        amount: Number(item.amount),
        createdAt: item.createdAt,

        movementType:
          item.movementType ??
          (Number(item.amount) > 0 ? 'ALLOCATED' : 'RELEASED'),

        transactionId: item.transactionId ?? null,
      })),
    }))
  );
}

  allocateFunds(
    goalId: string,
    sourceType: GoalFundingSourceType,
    sourceId: string,
    amount: number,
    requestId: string
  ): Observable<SavingsGoalRecord> {
    return this.write<GoalResponse>(
      'POST',
      `${this.apiUrl}/${encodeURIComponent(goalId)}/allocations`,
      {
        sourceType,
        sourceId,
        amount: amount.toFixed(2),
        requestId,
      }
    ).pipe(
      map(response => this.mapGoal(response.goal))
    );
  }

  releaseFunds(
  goalId: string,
  sourceType: GoalFundingSourceType,
  sourceId: string,
  amount: number,
  requestId: string
): Observable<SavingsGoalRecord> {
  return this.write<GoalResponse>(
    'POST',
    `${this.apiUrl}/${encodeURIComponent(goalId)}/releases`,
    {
      sourceType,
      sourceId,
      amount: amount.toFixed(2),
      requestId,
    }
  ).pipe(
    map(response => this.mapGoal(response.goal))
  );
}

  private mapGoal(dto: SavingsGoalDto): SavingsGoalRecord {
    return {
      id: dto.id,
      name: dto.name,
      group: dto.group ?? 'SAVINGS',
      targetAmount: Number(dto.targetAmount),
      savedAmount: Number(dto.savedAmount),
      legacyUnverifiedAmount: Number(dto.legacyUnverifiedAmount ?? '0'),
      targetDate: dto.targetDate,
      createdAt: dto.createdAt,
      updatedAt: dto.updatedAt,
      spentAmount: Number(dto.spentAmount ?? 0),
      achievedAt: dto.achievedAt ?? null,
    };
  }

  getFundingSummary(): Observable<SavingsFundingSummary> {
    return this.http.get<SavingsFundingSummaryDto>(
      `${this.apiUrl}/funding-summary`,
      { withCredentials: true }
    ).pipe(
      map(response => ({
        linkedSavingsBalance:
          response.linkedSavingsBalance === null
            ? null
            : Number(response.linkedSavingsBalance),
        savingsAccountCount: response.savingsAccountCount,
        currency: response.currency,
        lastSyncedAt: response.lastSyncedAt,
      }))
    );
  }
}