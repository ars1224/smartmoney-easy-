import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { BankAutoSyncService } from '../../core/bank/bank-auto-sync.service';
import {
  BankAccountsApiService,
  type ConnectedBankAccount,
} from '../../core/bank/bank-accounts-api.service';
import { BankConnectionService } from '../../core/bank/bank-connection.service';
import { CashWalletService } from '../../core/services/cash-wallet.service';
import { CashWalletApiService } from '../../core/services/cash-wallet-api.service';
import { ProfileAssetsPage } from './profile-assets';

const refreshedAccount: ConnectedBankAccount = {
  id: 'account-1',
  connectionId: 'connection-1',
  accountName: 'Everyday',
  accountNumberLast4: '1234',
  accountType: 'CHECKING',
  currency: 'NZD',
  balance: 725,
  status: 'ACTIVE',
  lastSyncedAt: '2026-11-22T00:00:00Z',
};

describe('ProfileAssetsPage - bank sync on entry', () => {
  async function setup(syncPromise: Promise<boolean>) {
    const syncOnAppOpen = vi.fn(() => syncPromise);
    const getAccounts = vi.fn(() => of([refreshedAccount]));

    await TestBed.configureTestingModule({
      imports: [ProfileAssetsPage],
      providers: [
        provideRouter([]),
        {
          provide: BankAutoSyncService,
          useValue: { syncOnAppOpen },
        },
        {
          provide: BankAccountsApiService,
          useValue: { getAccounts },
        },
        {
          provide: CashWalletService,
          useValue: {
            wallets: signal([]),
            loadWallets: vi.fn(() => of([])),
          },
        },
        {
          provide: CashWalletApiService,
          useValue: {
            getArchivedWallets: vi.fn(() => of([])),
          },
        },
        {
          provide: BankConnectionService,
          useValue: {},
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ProfileAssetsPage);
    const page = fixture.componentInstance;

    fixture.detectChanges();

    return { page, getAccounts, syncOnAppOpen };
  }

  it('waits for sync before reading the refreshed bank balance', async () => {
    let finishSync!: (succeeded: boolean) => void;

    const pending = new Promise<boolean>(resolve => {
      finishSync = resolve;
    });

    const { page, getAccounts, syncOnAppOpen } = await setup(pending);

    expect(syncOnAppOpen).toHaveBeenCalledTimes(1);
    expect(getAccounts).not.toHaveBeenCalled();

    finishSync(true);

    await vi.waitFor(() => {
      expect(getAccounts).toHaveBeenCalledTimes(1);
      expect(page.bankTotal()).toBe(725);
      expect(page.combinedTotal()).toBe(725);
      expect(page.loading()).toBe(false);
    });
  });

  it('requests a new sync when balances are refreshed', async () => {
    const { page, getAccounts, syncOnAppOpen } =
      await setup(Promise.resolve(true));

    await vi.waitFor(() => {
      expect(page.loading()).toBe(false);
      expect(getAccounts).toHaveBeenCalledTimes(1);
    });

    await page.loadAssets(true);

    expect(syncOnAppOpen).toHaveBeenCalledTimes(2);
    expect(getAccounts).toHaveBeenCalledTimes(2);
  });

  it('warns when sync fails but still displays saved balances', async () => {
    const { page, getAccounts } = await setup(Promise.resolve(false));

    await vi.waitFor(() => {
      expect(getAccounts).toHaveBeenCalledTimes(1);
      expect(page.bankAccounts()).toHaveLength(1);
      expect(page.bankError()).toContain('may be outdated');
      expect(page.loading()).toBe(false);
    });
  });
});
