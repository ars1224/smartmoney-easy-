
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, switchMap } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';

export type OnboardingStep =
  | 'EMPLOYMENT'
  | 'PAYROLL'
  | 'BUDGET'
  | 'REVIEW';

export type OnboardingStatus =
  | 'LEGACY'
  | 'IN_PROGRESS'
  | 'COMPLETED';

export interface OnboardingProgress {
  status: OnboardingStatus;
  currentStep: OnboardingStep | null;
  onboardingRequired: boolean;
  completedAt: string | null;
}

export interface OnboardingProgressUpdate {
  status: OnboardingStatus;
  currentStep: OnboardingStep;
  onboardingRequired: boolean;
}

export interface OnboardingCompletionResponse {
  message: string;
  status: 'COMPLETED';
  currentStep: 'REVIEW';
  onboardingRequired: false;
  completedAt: string;
}


@Injectable({
  providedIn: 'root',
})
export class OnboardingApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly apiUrl =
    `${environment.apiUrl}/onboarding`;

  getProgress(): Observable<OnboardingProgress> {
    return this.http.get<OnboardingProgress>(
      this.apiUrl,
      {
        withCredentials: true,
      }
    );
  }

  saveProgress(
    currentStep: OnboardingStep
  ): Observable<OnboardingProgressUpdate> {
    return this.auth.getCsrfToken().pipe(
      switchMap(token =>
        this.http.put<OnboardingProgressUpdate>(
          `${this.apiUrl}/progress`,
          { currentStep },
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


  completeOnboarding(): Observable<OnboardingCompletionResponse> {
    return this.auth.getCsrfToken().pipe(
      switchMap(token =>
        this.http.post<OnboardingCompletionResponse>(
          `${this.apiUrl}/complete`,
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