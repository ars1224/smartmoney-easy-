
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  BankAccountsApiService,
} from './bank-accounts-api.service';

@Injectable({
  providedIn: 'root',
})
export class BankAutoSyncService {
  private readonly bankApi = inject(BankAccountsApiService);

  private syncing = false;

  async syncOnAppOpen(): Promise<void> {
    // Prevent overlapping automatic sync operations.
    if (this.syncing) return;

    this.syncing = true;

    try {
      // Retrieve connected accounts from SmartMoney.
      const accounts = await firstValueFrom(
        this.bankApi.getAccounts()
      );

      // Multiple accounts may belong to one connection.
      // Synchronise each connection only once.
      const connectionIds = [
        ...new Set(
          accounts
            .map(account => account.connectionId)
            .filter(id => Boolean(id))
        ),
      ];

      // Process connections sequentially to avoid
      // overlapping database sync operations.
      for (const connectionId of connectionIds) {
        try {
          await firstValueFrom(
            this.bankApi.syncConnection(connectionId)
          );
        } catch {
          // A failed bank request must not block the app.
          console.warn(
            'Automatic Mock Bank sync failed. ' +
            'Previously saved transactions remain available.'
          );
        }
      }
    } catch {
      console.warn(
        'Unable to retrieve connected bank accounts for automatic sync.'
      );
    } finally {
      this.syncing = false;
    }
  }
}
