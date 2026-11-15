
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, switchMap } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';

export type PayrollIncomeType = 'SALARY' | 'HOURLY';

export type PayrollFrequency =
  | 'WEEKLY'
  | 'FORTNIGHTLY'
  | 'FOUR_WEEKLY'
  | 'MONTHLY';

export type SupportedTaxCode = 'M' | 'M SL';

export interface PayrollSettings {
  incomeType: PayrollIncomeType;
  grossAmount: string;
  payFrequency: PayrollFrequency;
  hoursPerWeek: string | null;
  taxCode: SupportedTaxCode;
  kiwiSaverRate: string | null;
  hasStudentLoan: boolean;
}

export interface PayrollSettingsResponse {
  settings: PayrollSettings | null;
}

export interface PayrollSaveResponse {
  message: string;
  settings: PayrollSettings;
}

export interface PayrollEstimate {
  taxYear: string;
  effectiveTaxCode: string;
  grossPerPay: string;
  payeIncludingAcc: string;
  studentLoan: string;
  kiwiSaver: string;
  netPerPay: string;
  estimatedMonthlyNet: string;
}

export interface PayrollEstimateResponse {
  payDate: string;
  estimate: PayrollEstimate;
}

@Injectable({
  providedIn: 'root',
})
export class PayrollApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly apiUrl =
    `${environment.apiUrl}/payroll`;

  getSettings(): Observable<PayrollSettingsResponse> {
    return this.http.get<PayrollSettingsResponse>(
      `${this.apiUrl}/settings`,
      { withCredentials: true }
    );
  }

  saveSettings(
    settings: PayrollSettings
  ): Observable<PayrollSaveResponse> {
    return this.auth.getCsrfToken().pipe(
      switchMap(token =>
        this.http.put<PayrollSaveResponse>(
          `${this.apiUrl}/settings`,
          settings,
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

  getEstimate(): Observable<PayrollEstimateResponse> {
    return this.http.get<PayrollEstimateResponse>(
      `${this.apiUrl}/estimate`,
      { withCredentials: true }
    );
  }
}
