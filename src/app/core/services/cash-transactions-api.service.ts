
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';

export type CashTransactionType = 'income' | 'expense';

export interface CashTransactionRecord {
  id: string;
  source: 'cash';
  type: CashTransactionType;
  assetId: string;
  amount: number;
  category: string;
  date: string;
  note: string;
  createdAt: string;
}

interface CashTransactionDto {
  id: string;
  source: 'cash';
  type: CashTransactionType;
  assetId: string;
  amount: string;
  category: string;
  date: string;
  note: string;
  createdAt: string;
}

export interface CashTransactionPayload {
  type: CashTransactionType;
  assetId: string;
  amount: number;
  category: string;
  date: string;
  note: string;
}

export type UpdateCashTransactionPayload =
  Partial<CashTransactionPayload>;

interface TransactionListResponse {
  transactions: CashTransactionDto[];
  count: number;
}

interface TransactionResponse {
  message: string;
  transaction: CashTransactionDto;
}

@Injectable({ providedIn: 'root' })
export class CashTransactionsApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly apiUrl =
    `${environment.apiUrl}/cash-transactions`;

  getTransactions(): Observable<CashTransactionRecord[]> {
    return this.http.get<TransactionListResponse>(
      this.apiUrl,
      { withCredentials: true }
    ).pipe(
      map(response =>
        response.transactions.map(
          transaction => this.mapTransaction(transaction)
        )
      )
    );
  }

  createTransaction(
    payload: CashTransactionPayload
  ): Observable<CashTransactionRecord> {
    return this.write<TransactionResponse>(
      'POST',
      this.apiUrl,
      {
        ...payload,
        amount: payload.amount.toFixed(2),
      }
    ).pipe(
      map(response => this.mapTransaction(response.transaction))
    );
  }

  updateTransaction(
    id: string,
    payload: UpdateCashTransactionPayload
  ): Observable<CashTransactionRecord> {
    const body = {
      ...payload,
      ...(payload.amount !== undefined
        ? { amount: payload.amount.toFixed(2) }
        : {}),
    };

    return this.write<TransactionResponse>(
      'PATCH',
      `${this.apiUrl}/${encodeURIComponent(id)}`,
      body
    ).pipe(
      map(response => this.mapTransaction(response.transaction))
    );
  }

  deleteTransaction(id: string): Observable<void> {
    return this.write<{ message: string }>(
      'DELETE',
      `${this.apiUrl}/${encodeURIComponent(id)}`
    ).pipe(
      map(() => undefined)
    );
  }

  private write<T>(
    method: 'POST' | 'PATCH' | 'DELETE',
    url: string,
    body?: unknown
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

  private mapTransaction(
    dto: CashTransactionDto
  ): CashTransactionRecord {
    return {
      id: dto.id,
      source: 'cash',
      type: dto.type,
      assetId: dto.assetId,
      amount: Number(dto.amount),
      category: dto.category,
      date: dto.date,
      note: dto.note,
      createdAt: dto.createdAt,
    };
  }
}
