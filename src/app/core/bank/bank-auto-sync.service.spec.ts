import { TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import type { BankSyncResponse } from './bank-accounts-api.service';
import { describe, expect, it, vi } from 'vitest';

import { BankAccountsApiService } from './bank-accounts-api.service';
import { BankAutoSyncService } from './bank-auto-sync.service';

describe('BankAutoSyncService', () => {
  it('deduplicates connections and shares an in-flight sync', async () => {
    let releaseSync: (() => void) | undefined;
    const syncGate = new Promise<void>(resolve => {
      releaseSync = resolve;
    });

    const getAccounts = vi.fn(() => of([
      { connectionId: 'connection-a' },
      { connectionId: 'connection-a' },
    ]));

    const syncConnection = vi.fn(
      (): Observable<BankSyncResponse> => new Observable(subscriber => {
        void syncGate.then(() => {
          subscriber.next({
            status: 'success',
            accounts_synced: 1,
            accounts_failed: 0,
            failed_account_ids: [],
            transactions_imported: 0,
            last_synced_at: '2026-11-22T00:00:00Z',
            transactions_categorised: 0,
          });
          subscriber.complete();
        });
      })
    );

    TestBed.configureTestingModule({
      providers: [
        BankAutoSyncService,
        {
          provide: BankAccountsApiService,
          useValue: { getAccounts, syncConnection },
        },
      ],
    });

    const service = TestBed.inject(BankAutoSyncService);
    const first = service.syncOnAppOpen();
    const second = service.syncOnAppOpen();

    expect(first).toBe(second);

    releaseSync?.();
    const results = await Promise.all([first, second]);

    expect(results[0]).toEqual({ attempted: true, failed: false });
    expect(getAccounts).toHaveBeenCalledTimes(1);
    expect(syncConnection).toHaveBeenCalledTimes(1);
    expect(syncConnection).toHaveBeenCalledWith('connection-a');
  });

  it('reports partial sync without blocking balance refresh', async () => {
    TestBed.configureTestingModule({
      providers: [
        BankAutoSyncService,
        {
          provide: BankAccountsApiService,
          useValue: {
            getAccounts: () => of([{ connectionId: 'connection-a' }]),
            syncConnection: () => of({ status: 'partial_success' }),
          },
        },
      ],
    });

    const result = await TestBed.inject(BankAutoSyncService).syncOnAppOpen();

    expect(result).toEqual({ attempted: true, failed: true });
  });
});
