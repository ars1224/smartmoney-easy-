
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';

import { environment } from '../../../environments/environment';

import { AuthService } from '../auth/auth.service';



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


export interface BankAccountTransaction {
  id: string;
  description: string;
  amount: number;
  balanceAfter: number | null;
  currency: string;
  transactionType: string;
  transactionDate: string;
}



interface BankAccountTransactionDto {
  id: string;
  description: string;
  amount: string;
  balance_after: string | null;
  currency: string;
  transaction_type: string;
  transaction_date: string;
}

interface BankTransactionsResponse {
  account_id: string;
  transactions: BankAccountTransactionDto[];
  count: number;
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


export interface BankActivityTransaction {
  id: string;
  bankAccountId: string;
  description: string;
  category: string | null;
  amount: number;
  currency: string;
  transactionType: string;
  transactionDate: string;
}

interface BankActivityTransactionDto {
  id: string;
  bank_account_id: string;
  description: string;
  category: string | null;
  amount: string;
  currency: string;
  transaction_type: string;
  transaction_date: string;
}

interface AllBankTransactionsResponse {
  transactions: BankActivityTransactionDto[];
  count: number;
}


@Injectable({
  providedIn: 'root',
})
export class BankAccountsApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

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

getTransactions(
  accountId: string
): Observable<BankAccountTransaction[]> {
  const url =
    `${environment.apiUrl}/bank/accounts/` +
    `${encodeURIComponent(accountId)}/transactions`;

  return this.http.get<BankTransactionsResponse>(
    url,
    { withCredentials: true }
  ).pipe(
    map(response =>
      response.transactions.map(transaction => ({
        id: transaction.id,
        description: transaction.description,
        amount: Number(transaction.amount),
        balanceAfter:
          transaction.balance_after === null
            ? null
            : Number(transaction.balance_after),
        currency: transaction.currency,
        transactionType: transaction.transaction_type,
        transactionDate: transaction.transaction_date,
      }))
    )
  );
}


getAllTransactions(): Observable<BankActivityTransaction[]> {
  return this.http.get<AllBankTransactionsResponse>(
    `${environment.apiUrl}/bank/transactions`,
    { withCredentials: true }
  ).pipe(
    map(response =>
      response.transactions.map(transaction => ({
        id: transaction.id,
        bankAccountId: transaction.bank_account_id,
        description: transaction.description,
        category: transaction.category,
        amount: Number(transaction.amount),
        currency: transaction.currency,
        transactionType: transaction.transaction_type,
        transactionDate: transaction.transaction_date,
      }))
    )
  );
}


syncConnection(connectionId: string): Observable<unknown> {
  const url =
    `${environment.apiUrl}/bank/connections/` +
    `${encodeURIComponent(connectionId)}/sync`;

  return this.auth.getCsrfToken().pipe(
    switchMap(token =>
      this.http.post<unknown>(
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
