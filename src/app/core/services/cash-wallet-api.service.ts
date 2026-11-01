
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';

export interface CashWalletRecord {
  id: string;
  name: string;
  currency: string;
  openingBalance: number;
  currentBalance: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CashWalletDto {
  id: string;
  name: string;
  currency: string;
  openingBalance: string;
  currentBalance: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NewCashWalletPayload {
  name: string;
  currency: 'NZD';
  openingBalance: number;
}

export interface UpdateCashWalletPayload {
  name?: string;
  openingBalance?: number;
}

interface WalletListResponse {
  wallets: CashWalletDto[];
  count: number;
}

interface WalletResponse {
  message: string;
  wallet: CashWalletDto;
}

@Injectable({ providedIn: 'root' })
export class CashWalletApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly apiUrl =
    `${environment.apiUrl}/cash-wallets`;

  getWallets(): Observable<CashWalletRecord[]> {
    return this.http.get<WalletListResponse>(
      this.apiUrl,
      { withCredentials: true }
    ).pipe(
      map(response =>
        response.wallets.map(wallet => this.mapWallet(wallet))
      )
    );
  }

  createWallet(
    payload: NewCashWalletPayload
  ): Observable<CashWalletRecord> {
    return this.write<WalletResponse>(
      'POST',
      this.apiUrl,
      {
        ...payload,
        openingBalance: payload.openingBalance.toFixed(2),
      }
    ).pipe(
      map(response => this.mapWallet(response.wallet))
    );
  }

  updateWallet(
    id: string,
    payload: UpdateCashWalletPayload
  ): Observable<CashWalletRecord> {
    const body = {
      ...payload,
      ...(payload.openingBalance !== undefined
        ? {
            openingBalance:
              payload.openingBalance.toFixed(2),
          }
        : {}),
    };

    return this.write<WalletResponse>(
      'PATCH',
      `${this.apiUrl}/${encodeURIComponent(id)}`,
      body
    ).pipe(
      map(response => this.mapWallet(response.wallet))
    );
  }


getArchivedWallets(): Observable<CashWalletRecord[]> {
  return this.http.get<WalletListResponse>(
    this.apiUrl,
    {
      params: { archived: 'true' },
      withCredentials: true,
    }
  ).pipe(
    map(response =>
      response.wallets.map(wallet => this.mapWallet(wallet))
    )
  );
}

archiveWallet(
  id: string
): Observable<CashWalletRecord> {
  return this.write<WalletResponse>(
    'PATCH',
    `${this.apiUrl}/${encodeURIComponent(id)}/archive`,
    {}
  ).pipe(
    map(response => this.mapWallet(response.wallet))
  );
}


  private write<T>(
    method: 'POST' | 'PATCH',
    url: string,
    body: unknown
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

  private mapWallet(
    dto: CashWalletDto
  ): CashWalletRecord {
    return {
      id: dto.id,
      name: dto.name,
      currency: dto.currency,
      openingBalance: Number(dto.openingBalance),
      currentBalance: Number(dto.currentBalance),
      isArchived: dto.isArchived,
      createdAt: dto.createdAt,
      updatedAt: dto.updatedAt,
    };
  }
}
