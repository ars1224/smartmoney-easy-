import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  BankAccountsApiService,
} from './bank-accounts-api.service';

export interface BankSyncResult {
  totalConnections: number;
  successfulConnections: number;
  failedConnections: number;
  busy: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class BankAutoSyncService {
  private readonly bankApi = inject(BankAccountsApiService);

  private syncing = false;

  async syncNow(): Promise<BankSyncResult> {
    if (this.syncing) {
      return {
        totalConnections: 0,
        successfulConnections: 0,
        failedConnections: 0,
        busy: true,
      };
    }

    this.syncing = true;

    try {
      const accounts = await firstValueFrom(
        this.bankApi.getAccounts()
      );

      const connectionIds = [
        ...new Set(
          accounts
            .map(account => account.connectionId)
            .filter(
              (id): id is string => Boolean(id)
            )
        ),
      ];

      let successfulConnections = 0;
      let failedConnections = 0;

      for (const connectionId of connectionIds) {
        try {
          const response = await firstValueFrom(
            this.bankApi.syncConnection(connectionId)
          );

          if (
            response.status === 'partial_success' ||
            response.accounts_failed > 0
          ) {
            failedConnections++;
          } else {
            successfulConnections++;
          }
        } catch {
          failedConnections++;
        }
      }

      return {
        totalConnections: connectionIds.length,
        successfulConnections,
        failedConnections,
        busy: false,
      };
    } finally {
      this.syncing = false;
    }
  }

  async syncOnAppOpen(): Promise<void> {
    try {
      const result = await this.syncNow();

      if (result.failedConnections > 0) {
        console.warn(
          'Some automatic bank synchronisations failed.'
        );
      }
    } catch {
      console.warn(
        'Automatic bank synchronisation is unavailable.'
      );
    }
  }
}