import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import {
  BankAccountsApiService,
  type BankSyncResponse,
  type ConnectedBankAccount,
} from './bank-accounts-api.service';
import { BankAutoSyncService } from './bank-auto-sync.service';

describe('BankAutoSyncService - retry after failure', () => {
  it('allows a fresh sync request after a previously failed connection', async () => {
    const connectedAccount: ConnectedBankAccount = {
      id: 'retry-account',
      connectionId: 'retry-connection',
      accountName: 'Test account',
      accountNumberLast4: '1234',
      accountType: 'CHECKING',
      currency: 'NZD',
      balance: 100,
      status: 'ACTIVE',
      lastSyncedAt: null,
    };

    const success: BankSyncResponse = {
      status: 'success',
      accounts_synced: 1,
      accounts_failed: 0,
      failed_account_ids: [],
      transactions_imported: 1,
      transactions_categorised: 0,
      last_synced_at: '2026-11-22T00:00:00Z',
    };

    const getAccounts = vi.fn(() => of([connectedAccount]));
    const syncConnection = vi.fn()
      .mockImplementationOnce(() =>
        throwError(() => new Error('Temporary bank outage'))
      )
      .mockImplementation(() => of(success));

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      TestBed.configureTestingModule({
        providers: [
          {
            provide: BankAccountsApiService,
            useValue: { getAccounts, syncConnection },
          },
        ],
      });

      const service = TestBed.inject(BankAutoSyncService);

      expect(await service.syncOnAppOpen()).toBe(false);
      expect(await service.syncOnAppOpen()).toBe(true);
      expect(getAccounts).toHaveBeenCalledTimes(2);
      expect(syncConnection).toHaveBeenCalledTimes(2);
      expect(syncConnection).toHaveBeenNthCalledWith(1, 'retry-connection');
      expect(syncConnection).toHaveBeenNthCalledWith(2, 'retry-connection');
    } finally {
      warn.mockRestore();
    }
  });
});
