import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, switchMap } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';

export type OnboardingStatus =
  | 'LEGACY'
  | 'IN_PROGRESS'
  | 'COMPLETED';

export type OnboardingStep =
  | 'EMPLOYMENT'
  | 'PAYROLL'
  | 'BUDGET'
  | 'REVIEW';

export interface OnboardingProgress {
  status: OnboardingStatus;
  currentStep: OnboardingStep | null;
  onboardingRequired: boolean;
  completedAt: string | null;
}

export interface OnboardingProgressUpdate {
  status: 'IN_PROGRESS';
  currentStep: OnboardingStep;
  onboardingRequired: true;
}

export interface OnboardingCompletion {
  message: string;
  status: 'COMPLETED';
  currentStep: 'REVIEW';
  onboardingRequired: false;
  completedAt: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class OnboardingApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly apiUrl =
    `${environment.apiUrl}/onboarding`;

  getStatus(): Observable<OnboardingProgress> {
    return this.http.get<OnboardingProgress>(
      this.apiUrl,
      {
        withCredentials: true,
      }
    );
  }

  // Compatibility with the original onboarding wizard.
  getProgress(): Observable<OnboardingProgress> {
    return this.getStatus();
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

  complete(): Observable<OnboardingCompletion> {
    return this.auth.getCsrfToken().pipe(
      switchMap(token =>
        this.http.post<OnboardingCompletion>(
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

  // Compatibility with the original onboarding wizard.
  completeOnboarding(): Observable<OnboardingCompletion> {
    return this.complete();
  }
}