
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BankAutoSyncService } from './bank-auto-sync.service';
import {
  BankAccountsApiService,
  type BankSyncResponse,
  type ConnectedBankAccount,
} from './bank-accounts-api.service';

describe('BankAutoSyncService - Regression tests', () => {
  let service: BankAutoSyncService;

  const getAccounts = vi.fn();
  const syncConnection = vi.fn();

  const account = (
    id: string,
    connectionId: string
  ): ConnectedBankAccount => ({
    id,
    connectionId,
    accountName: 'Test Account',
    accountNumberLast4: '1234',
    accountType: 'CHECKING',
    currency: 'NZD',
    balance: 500,
    status: 'CONNECTED',
    lastSyncedAt: null,
  });

  const syncResponse = (
    overrides: Partial<BankSyncResponse> = {}
  ): BankSyncResponse => ({
    status: 'success',
    accounts_synced: 1,
    accounts_failed: 0,
    failed_account_ids: [],
    transactions_imported: 0,
    last_synced_at: new Date().toISOString(),
    transactions_categorised: 0,
    ...overrides,
  });

  beforeEach(() => {
    vi.resetAllMocks();

    getAccounts.mockReturnValue(
      of([account('account-1', 'connection-1')])
    );

    syncConnection.mockReturnValue(
      of(syncResponse())
    );

    TestBed.configureTestingModule({
      providers: [
        BankAutoSyncService,
        {
          provide: BankAccountsApiService,
          useValue: {
            getAccounts,
            syncConnection,
          },
        },
      ],
    });

    service = TestBed.inject(BankAutoSyncService);
  });

  it('synchronises a connected bank successfully', async () => {
    const result = await service.syncNow();

    expect(syncConnection).toHaveBeenCalledWith(
      'connection-1'
    );

    expect(result).toEqual({
      totalConnections: 1,
      successfulConnections: 1,
      failedConnections: 0,
      busy: false,
    });
  });

  it('synchronises each connection only once', async () => {
    getAccounts.mockReturnValue(
      of([
        account('account-1', 'connection-1'),
        account('account-2', 'connection-1'),
      ])
    );

    const result = await service.syncNow();

    expect(syncConnection).toHaveBeenCalledTimes(1);
    expect(result.totalConnections).toBe(1);
    expect(result.successfulConnections).toBe(1);
  });

  it('detects partial success even when HTTP succeeds', async () => {
    syncConnection.mockReturnValue(
      of(
        syncResponse({
          status: 'partial_success',
          accounts_synced: 1,
          accounts_failed: 1,
          failed_account_ids: ['account-2'],
        })
      )
    );

    const result = await service.syncNow();

    expect(result.successfulConnections).toBe(0);
    expect(result.failedConnections).toBe(1);
    expect(result.busy).toBe(false);
  });

  it('detects failed accounts even with success status', async () => {
    syncConnection.mockReturnValue(
      of(
        syncResponse({
          status: 'success',
          accounts_failed: 1,
        })
      )
    );

    const result = await service.syncNow();

    expect(result.failedConnections).toBe(1);
  });

  it('continues synchronising other connections after a failure', async () => {
    getAccounts.mockReturnValue(
      of([
        account('account-1', 'connection-1'),
        account('account-2', 'connection-2'),
      ])
    );

    syncConnection
      .mockReturnValueOnce(
        throwError(() => new Error('Bank unavailable'))
      )
      .mockReturnValueOnce(of(syncResponse()));

    const result = await service.syncNow();

    expect(syncConnection).toHaveBeenCalledTimes(2);
    expect(result.totalConnections).toBe(2);
    expect(result.successfulConnections).toBe(1);
    expect(result.failedConnections).toBe(1);
  });

  it('propagates account lookup failures', async () => {
    getAccounts.mockReturnValue(
      throwError(() => new Error('Unable to load accounts'))
    );

    await expect(
      service.syncNow()
    ).rejects.toThrow('Unable to load accounts');
  });

  it('handles users with no connected bank accounts', async () => {
    getAccounts.mockReturnValue(of([]));

    const result = await service.syncNow();

    expect(syncConnection).not.toHaveBeenCalled();
    expect(result.totalConnections).toBe(0);
    expect(result.failedConnections).toBe(0);
    expect(result.busy).toBe(false);
  });
});
