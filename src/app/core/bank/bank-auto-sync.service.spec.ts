import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import {
  BankAccountsApiService,
  type BankSyncResponse,
  type ConnectedBankAccount,
} from './bank-accounts-api.service';
import { BankAutoSyncService } from './bank-auto-sync.service';

const connectedAccount: ConnectedBankAccount = {
  id: 'account-1',
  connectionId: 'connection-1',
  accountName: 'Everyday',
  accountNumberLast4: '1234',
  accountType: 'CHECKING',
  currency: 'NZD',
  balance: 100,
  status: 'ACTIVE',
  lastSyncedAt: null,
};

const success: BankSyncResponse = {
  status: 'success',
  accounts_synced: 2,
  accounts_failed: 0,
  failed_account_ids: [],
  transactions_imported: 1,
  transactions_categorised: 1,
  last_synced_at: '2026-11-22T00:00:00Z',
};

describe('BankAutoSyncService', () => {
  it('shares an in-flight sync and syncs a connection only once', async () => {
    const pending = new Subject<BankSyncResponse>();
    const getAccounts = vi.fn(() => of([
      connectedAccount,
      { ...connectedAccount, id: 'account-2' },
    ]));
    const syncConnection = vi.fn()
      .mockImplementationOnce(() => pending.asObservable())
      .mockImplementation(() => of(success));

    TestBed.configureTestingModule({
      providers: [
        {
          provide: BankAccountsApiService,
          useValue: { getAccounts, syncConnection },
        },
      ],
    });

    const service = TestBed.inject(BankAutoSyncService);
    const first = service.syncOnAppOpen();
    const second = service.syncOnAppOpen();

    expect(second).toBe(first);

    await Promise.resolve();

    expect(getAccounts).toHaveBeenCalledTimes(1);
    expect(syncConnection).toHaveBeenCalledTimes(1);
    expect(syncConnection).toHaveBeenCalledWith('connection-1');

    pending.next(success);
    pending.complete();

    expect(await first).toBe(true);

    // A later page visit is allowed to synchronise again.
    expect(await service.syncOnAppOpen()).toBe(true);
    expect(getAccounts).toHaveBeenCalledTimes(2);
  });

  it('reports a partial bank sync instead of treating it as fresh data', async () => {
    const getAccounts = vi.fn(() => of([connectedAccount]));
    const syncConnection = vi.fn(() => of({
      ...success,
      status: 'partial_success' as const,
      accounts_failed: 1,
      failed_account_ids: ['account-1'],
    }));

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
  });

  it('reports a failed account lookup without blocking the caller', async () => {
    const getAccounts = vi.fn(() =>
      throwError(() => new Error('Mock Bank unavailable'))
    );
    const syncConnection = vi.fn();
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
      expect(syncConnection).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
