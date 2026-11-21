import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { BankAccountsApiService } from './bank-accounts-api.service';

@Injectable({
  providedIn: 'root',
})
export class BankAutoSyncService {
  private readonly bankApi = inject(BankAccountsApiService);

  // App-shell startup and Profile & Assets may request a sync together.
  // Both callers must wait for the same operation rather than starting
  // overlapping bank requests.
  private inFlightSync: Promise<boolean> | null = null;

  syncOnAppOpen(): Promise<boolean> {
    if (this.inFlightSync) {
      return this.inFlightSync;
    }

    this.inFlightSync = this.syncConnections().finally(() => {
      this.inFlightSync = null;
    });

    return this.inFlightSync;
  }

  private async syncConnections(): Promise<boolean> {
    try {
      const accounts = await firstValueFrom(
        this.bankApi.getAccounts()
      );

      // Multiple accounts can share a connection. Sync each once.
      const connectionIds = [
        ...new Set(
          accounts
            .map(account => account.connectionId)
            .filter(id => Boolean(id))
        ),
      ];

      let allSucceeded = true;

      // Serial requests avoid concurrent writes to bank account data.
      for (const connectionId of connectionIds) {
        try {
          const result = await firstValueFrom(
            this.bankApi.syncConnection(connectionId)
          );

          if (
            result.status !== 'success' ||
            result.accounts_failed > 0
          ) {
            allSucceeded = false;
          }
        } catch {
          allSucceeded = false;

          console.warn(
            'Automatic Mock Bank sync failed. ' +
            'Previously saved transactions remain available.'
          );
        }
      }

      return allSucceeded;
    } catch {
      console.warn(
        'Unable to retrieve connected bank accounts for automatic sync.'
      );

      return false;
    }
  }
}
