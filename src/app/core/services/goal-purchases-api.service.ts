import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';


export type GoalGroup = 'NEEDS' | 'WANTS' | 'SAVINGS';


export interface GoalPurchaseOption {
  id: string;
  name: string;
  group: GoalGroup;
  targetAmount: string;
  savedAmount: string;
  spentAmount: string;
  achievedAt: string | null;
}


interface GoalsResponse {
  goals: GoalPurchaseOption[];
  count: number;
}


export interface LinkGoalPurchaseResponse {
  message: string;
  goal: GoalPurchaseOption;
  transactionId: string;
  settledAmount: string;
  newlyLinked: boolean;
}


@Injectable({
  providedIn: 'root',
})
export class GoalPurchasesApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly apiUrl =
    `${environment.apiUrl}/savings-goals`;


  getGoals(): Observable<GoalPurchaseOption[]> {
    return this.http.get<GoalsResponse>(
      this.apiUrl,
      {
        withCredentials: true,
      }
    ).pipe(
      map(response => response.goals)
    );
  }


  linkPurchase(
    goalId: string,
    transactionId: string
  ): Observable<LinkGoalPurchaseResponse> {
    const url =
      `${this.apiUrl}/${encodeURIComponent(goalId)}` +
      `/purchases/${encodeURIComponent(transactionId)}`;

    return this.auth.getCsrfToken().pipe(
      switchMap(token =>
        this.http.patch<LinkGoalPurchaseResponse>(
          url,
          {},
          {
            withCredentials: true,
            headers: {
              'X-CSRF-Token': token,
            },
          }
        )
      )
    );
  }
}