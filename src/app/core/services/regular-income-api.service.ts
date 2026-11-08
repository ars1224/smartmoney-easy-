
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';

export type RegularIncomeType = 'SALARY' | 'HOURLY';

export type PayFrequency =
  | 'WEEKLY'
  | 'FORTNIGHTLY'
  | 'MONTHLY'
  | 'YEARLY';

export interface RegularIncomeProfile {
  incomeType: RegularIncomeType;
  amount: number;
  payFrequency: PayFrequency | null;
  hoursPerWeek: number | null;
  monthlyEstimate: number;
}

export interface SaveRegularIncomePayload {
  incomeType: RegularIncomeType;
  amount: number;
  payFrequency: PayFrequency | null;
  hoursPerWeek: number | null;
}

interface RegularIncomeDto {
  incomeType: RegularIncomeType;
  amount: string;
  payFrequency: PayFrequency | null;
  hoursPerWeek: string | null;
  monthlyEstimate: string;
}

interface RegularIncomeResponse {
  profile: RegularIncomeDto | null;
}

interface SaveRegularIncomeResponse {
  message: string;
  profile: RegularIncomeDto;
}

@Injectable({
  providedIn: 'root',
})
export class RegularIncomeApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly apiUrl =
    `${environment.apiUrl}/regular-income`;

  getProfile(): Observable<RegularIncomeProfile | null> {
    return this.http.get<RegularIncomeResponse>(
      this.apiUrl,
      {
        withCredentials: true,
      }
    ).pipe(
      map(response =>
        response.profile
          ? this.mapProfile(response.profile)
          : null
      )
    );
  }

  saveProfile(
    payload: SaveRegularIncomePayload
  ): Observable<RegularIncomeProfile> {
    const body = {
      incomeType: payload.incomeType,
      amount: payload.amount.toFixed(2),

      payFrequency:
        payload.incomeType === 'SALARY'
          ? payload.payFrequency
          : null,

      hoursPerWeek:
        payload.incomeType === 'HOURLY' &&
        payload.hoursPerWeek !== null
          ? payload.hoursPerWeek.toFixed(2)
          : null,
    };

    return this.auth.getCsrfToken().pipe(
      switchMap(token =>
        this.http.put<SaveRegularIncomeResponse>(
          this.apiUrl,
          body,
          {
            withCredentials: true,
            headers: {
              'X-CSRF-Token': token,
            },
          }
        )
      ),
      map(response =>
        this.mapProfile(response.profile)
      )
    );
  }

  private mapProfile(
    dto: RegularIncomeDto
  ): RegularIncomeProfile {
    return {
      incomeType: dto.incomeType,
      amount: Number(dto.amount),
      payFrequency: dto.payFrequency,
      hoursPerWeek:
        dto.hoursPerWeek === null
          ? null
          : Number(dto.hoursPerWeek),
      monthlyEstimate: Number(dto.monthlyEstimate),
    };
  }
}
