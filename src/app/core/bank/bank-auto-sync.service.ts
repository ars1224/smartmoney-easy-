import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { BankAccountsApiService } from './bank-accounts-api.service';

export interface BankAutoSyncResult {
  failed: boolean;
  attempted: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class BankAutoSyncService {
  private readonly bankApi = inject(BankAccountsApiService);

  // A shared promise lets the app shell and Profile & Assets
  // await the same operation instead of starting overlapping syncs.
  private inFlight: Promise<BankAutoSyncResult> | null = null;

  syncOnAppOpen(): Promise<BankAutoSyncResult> {
    if (this.inFlight) {
      return this.inFlight;
    }

    const operation = this.performSync();
    this.inFlight = operation;

    void operation.then(() => {
      if (this.inFlight === operation) {
        this.inFlight = null;
      }
    });

    return operation;
  }

  private async performSync(): Promise<BankAutoSyncResult> {
    let failed = false;
    let attempted = false;

    try {
      const accounts = await firstValueFrom(
        this.bankApi.getAccounts()
      );

      const connectionIds = [
        ...new Set(
          accounts
            .map(account => account.connectionId)
            .filter(id => Boolean(id))
        ),
      ];

      for (const connectionId of connectionIds) {
        attempted = true;

        try {
          const result = await firstValueFrom(
            this.bankApi.syncConnection(connectionId)
          );

          if (result.status === 'partial_success') {
            failed = true;
          }
        } catch {
          failed = true;
          console.warn(
            'Automatic Mock Bank sync failed. ' +
            'Previously saved transactions remain available.'
          );
        }
      }
    } catch {
      failed = true;
      console.warn(
        'Unable to retrieve connected bank accounts for automatic sync.'
      );
    }

    return { failed, attempted };
  }
}
