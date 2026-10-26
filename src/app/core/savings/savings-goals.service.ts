import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';

export interface SavingsGoalRecord {
  id: string;
  name: string;
  targetAmount: number;
  savedAmount: number;
  targetDate: string;
  createdAt: string;
  updatedAt: string;
}

interface SavingsGoalDto {
  id: string;
  name: string;
  targetAmount: string;
  savedAmount: string;
  targetDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavingsGoalPayload {
  name: string;
  targetAmount: number;
  savedAmount: number;
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

  deleteGoal(id: string): Observable<void> {
    return this.write<{ message: string }>(
      'DELETE',
      `${this.apiUrl}/${encodeURIComponent(id)}`
    ).pipe(
      map(() => undefined)
    );
  }

  addContribution(
    goalId: string,
    amount: number
  ): Observable<SavingsGoalRecord> {
    return this.write<GoalResponse>(
      'POST',
      `${this.apiUrl}/${encodeURIComponent(goalId)}/contributions`,
      { amount: amount.toFixed(2) }
    ).pipe(
      map(response => this.mapGoal(response.goal))
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

  private mapGoal(dto: SavingsGoalDto): SavingsGoalRecord {
    return {
      id: dto.id,
      name: dto.name,
      targetAmount: Number(dto.targetAmount),
      savedAmount: Number(dto.savedAmount),
      targetDate: dto.targetDate,
      createdAt: dto.createdAt,
      updatedAt: dto.updatedAt,
    };
  }
}