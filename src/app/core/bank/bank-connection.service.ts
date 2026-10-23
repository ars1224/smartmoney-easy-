import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, switchMap } from 'rxjs';


import { environment } from '../../../environments/environment';

export interface BankAccountPreview {
  id: string;
  account_name: string;
  account_type: string;
  account_number_last4: string;
  currency: string;
  status: string;
}

export interface BankCallbackResponse {
  connection_id: string;
  status: 'PENDING';
  accounts: BankAccountPreview[];
}

export interface PendingBankConnection {
  connection_id: string;
  status: 'PENDING' | 'EXPIRED';
  expires_at?: string;
  accounts: BankAccountPreview[];
}

export interface PendingConnectionsResponse {
  connections: PendingBankConnection[];
  count: number;
}

export interface BankConfirmationResponse {
  connection_id: string;
  status: 'CONNECTED';
  accounts_connected: number;
  sync_status?: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'RETRY_REQUIRED';
  sync?: {
    status?: string;
    [key: string]: unknown;
  };
  message?: string;
}

export interface BankDisconnectResponse {
  connection_id: string;
  status: 'DISCONNECTED' | 'DISCONNECTING';
  message?: string;
  error?: string;
  action?: string;
  warning?: string;
}

@Injectable({ providedIn: 'root' })
export class BankConnectionService {
  private readonly http = inject(HttpClient);


  private readonly apiUrl = environment.apiUrl;

  startConnection(): Observable<{
    authorization_url: string;
    expires_in: number;
  }> {
    return this.postWithCsrf(
      '/bank/oauth/start',
      {}
    );
  }

  completeAuthorization(
    code: string,
    state: string
  ): Observable<BankCallbackResponse> {
    return this.postWithCsrf(
      '/bank/oauth/callback',
      { code, state }
    );
  }

  getPendingConnections(): Observable<PendingConnectionsResponse> {
    return this.http.get<PendingConnectionsResponse>(
      `${this.apiUrl}/bank/connections/pending`,
      { withCredentials: true }
    );
  }

  confirmConnection(
    connectionId: string,
    accountIds: string[]
  ): Observable<BankConfirmationResponse> {
    return this.postWithCsrf(
      '/bank/oauth/confirm',
      {
        connection_id: connectionId,
        account_ids: accountIds,
      }
    );
  }

  cancelConnection(
    connectionId: string
  ): Observable<BankDisconnectResponse> {
    return this.postWithCsrf(
      `/bank/connections/${encodeURIComponent(connectionId)}/disconnect`,
      {}
    );
  }

  private postWithCsrf<T>(
    endpoint: string,
    body: unknown
  ): Observable<T> {
    return this.http.get<{ csrf_token: string }>(
      `${this.apiUrl}/auth/csrf`,
      { withCredentials: true }
    ).pipe(
      switchMap(({ csrf_token }) =>
        this.http.post<T>(
          `${this.apiUrl}${endpoint}`,
          body,
          {
            withCredentials: true,
            headers: {
              'X-CSRF-Token': csrf_token,
            },
          }
        )
      )
    );
  }
}
