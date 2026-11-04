
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface ConnectedBankAccount {
  id: string;
  connectionId: string;
  accountName: string;
  accountNumberLast4: string;
  accountType: string;
  currency: string;
  balance: number;
  status: string;
  lastSyncedAt: string | null;
}

interface BankAccountDto {
  id: string;
  connection_id: string;
  account_name: string;
  account_number_last4: string;
  account_type: string;
  currency: string;
  balance: string;
  status: string;
  last_synced_at: string | null;
}

interface BankAccountsResponse {
  accounts: BankAccountDto[];
  count: number;
}

@Injectable({
  providedIn: 'root',
})
export class BankAccountsApiService {
  private readonly http = inject(HttpClient);

  private readonly apiUrl =
    `${environment.apiUrl}/bank/accounts`;

  getAccounts(): Observable<ConnectedBankAccount[]> {
    return this.http.get<BankAccountsResponse>(
      this.apiUrl,
      {
        withCredentials: true,
      }
    ).pipe(
      map(response =>
        response.accounts.map(account => ({
          id: account.id,
          connectionId: account.connection_id,
          accountName: account.account_name,
          accountNumberLast4: account.account_number_last4,
          accountType: account.account_type,
          currency: account.currency,
          balance: Number(account.balance),
          status: account.status,
          lastSyncedAt: account.last_synced_at,
        }))
      )
    );
  }
}
