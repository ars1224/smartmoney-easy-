
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { ProfileAssetsPage } from './profile-assets';
import {
  CashWalletService,
  type CashWallet,
} from '../../core/services/cash-wallet.service';
import { CashWalletApiService } from '../../core/services/cash-wallet-api.service';
import { BankAccountsApiService } from '../../core/bank/bank-accounts-api.service';
import { BankConnectionService } from '../../core/bank/bank-connection.service';

import {
  BankAutoSyncService,
  type BankSyncResult,
} from '../../core/bank/bank-auto-sync.service';

import type {
  ConnectedBankAccount,
} from '../../core/bank/bank-accounts-api.service';

describe('ProfileAssetsPage - Disconnect failure', () => {
  it('shows the API error inside the open dialog', async () => {
    const cancelConnection = vi.fn(() =>
      throwError(() =>
        new HttpErrorResponse({
          status: 503,
          statusText: 'Service Unavailable',
          error: {
            error: 'Mock Bank is temporarily unavailable.',
          },
        })
      )
    );

    await TestBed.configureTestingModule({
      imports: [ProfileAssetsPage],
      providers: [
        provideRouter([]),
        {
          provide: CashWalletService,
          useValue: { wallets: signal([]) },
        },
        {
          provide: CashWalletApiService,
          useValue: {},
        },
        {
          provide: BankAccountsApiService,
          useValue: {},
        },
        {
          provide: BankConnectionService,
          useValue: { cancelConnection },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ProfileAssetsPage);
    const page = fixture.componentInstance;

    // Prevent page initialization from making API calls.
    vi.spyOn(page, 'loadAssets').mockResolvedValue(undefined);

    fixture.detectChanges();

    page.disconnectDialog.set({
      connectionId: 'fake-connection',
      accountNames: ['Everyday Account'],
    });

    fixture.detectChanges();

    await page.confirmDisconnectBank();

    fixture.detectChanges();

    expect(cancelConnection).toHaveBeenCalledWith(
      'fake-connection'
    );

    expect(page.disconnectDialog()).not.toBeNull();

    expect(page.disconnectingBank()).toBeNull();

    const dialog = fixture.nativeElement.querySelector(
      '[aria-labelledby="disconnect-modal-title"]'
    ) as HTMLElement | null;

    expect(dialog).not.toBeNull();

    const alert = dialog?.querySelector('[role="alert"]');

    expect(alert).not.toBeNull();

    expect(alert?.textContent).toContain(
      'Mock Bank is temporarily unavailable.'
    );
  });
});
describe('ProfileAssetsPage - Cash Wallet regression', () => {
  async function setupWalletTest() {
    const wallet = {
      id: 'qa-wallet-001',
      name: 'QA Cash Wallet',
      currency: 'NZD',
      openingBalance: 20,
      currentBalance: 10,
      isArchived: false,
    } as CashWallet;

    const wallets = signal<CashWallet[]>([wallet]);

    const archivedWallets = signal<CashWallet[]>([]);

    const loadWallets = vi.fn(() => of(wallets()));

    const updateWallet = vi.fn(() => of(wallet));

    const getArchivedWallets = vi.fn(() => of(archivedWallets()));

    const archiveWallet = vi.fn(() => {
      wallets.set([]);

      archivedWallets.set([
        {
          ...wallet,
          isArchived: true,
        },
      ]);

      return of(undefined);
    });

    const restoreWallet = vi.fn(() => {
      wallets.set([wallet]);

      archivedWallets.set([]);

      return of(undefined);
    });

    await TestBed.configureTestingModule({
      imports: [ProfileAssetsPage],
      providers: [
        provideRouter([]),
        {
          provide: CashWalletService,
          useValue: {
            wallets,
            loadWallets,
          },
        },
        {
          provide: CashWalletApiService,
          useValue: {
            updateWallet,
            archiveWallet,
            restoreWallet,
            getArchivedWallets,
          },
        },
        {
          provide: BankAccountsApiService,
          useValue: {},
        },
        {
          provide: BankConnectionService,
          useValue: {},
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ProfileAssetsPage);

    const page = fixture.componentInstance;

    // Prevent initialization from making real API requests.
    vi.spyOn(page, 'loadAssets').mockResolvedValue(undefined);

    fixture.detectChanges();

    return {
      fixture,
      page,
      wallet,
      wallets,
      archivedWallets,
      loadWallets,
      updateWallet,
      archiveWallet,
      restoreWallet,
      getArchivedWallets,
    };
  }

  it('locks the opening balance after a 409 Conflict', async () => {
    const {
      fixture,
      page,
      wallet,
      updateWallet,
    } = await setupWalletTest();

    const backendMessage =
      'Opening balance cannot be changed after transactions have been recorded.';

    updateWallet.mockImplementationOnce(() =>
      throwError(() =>
        new HttpErrorResponse({
          status: 409,
          statusText: 'Conflict',
          error: {
            error: backendMessage,
          },
        })
      )
    );

    page.openEditWalletModal(wallet);

    page.editOpeningBalance = 25;

    await page.saveEditWallet();

    fixture.detectChanges();

    // The application attempted the requested update.
    expect(updateWallet).toHaveBeenCalledWith(
      wallet.id,
      {
        name: 'QA Cash Wallet',
        openingBalance: 25,
      }
    );

    // The backend rejected the change.
    expect(page.editWalletError()).toBe(backendMessage);

    // The modal must remain open.
    expect(page.editingWallet()).not.toBeNull();

    // The opening balance must return to its original value.
    expect(page.editOpeningBalance).toBe(20);

    // Future changes to the opening balance are blocked.
    expect(page.editOpeningBalanceLocked()).toBe(true);

    // The HTML input must become read-only.
    const balanceInput = fixture.nativeElement.querySelector(
      '#edit-opening-balance'
    ) as HTMLInputElement | null;

    expect(balanceInput).not.toBeNull();

    expect(balanceInput?.readOnly).toBe(true);

    // The helper text must explain the restriction.
    const helper = fixture.nativeElement.querySelector(
      '#edit-opening-balance-help'
    ) as HTMLElement | null;

    expect(helper).not.toBeNull();

    expect(helper?.textContent).toContain(
      'opening balance is locked'
    );

    expect(page.savingEditWallet()).toBe(false);
  });

  it('allows wallet name editing after the opening balance is locked', async () => {
    const {
      page,
      wallet,
      updateWallet,
      loadWallets,
    } = await setupWalletTest();

    // First attempt: backend rejects an opening-balance change.
    updateWallet.mockImplementationOnce(() =>
      throwError(() =>
        new HttpErrorResponse({
          status: 409,
          statusText: 'Conflict',
          error: {
            error:
              'Opening balance cannot be changed after transactions have been recorded.',
          },
        })
      )
    );

    page.openEditWalletModal(wallet);

    page.editOpeningBalance = 25;

    await page.saveEditWallet();

    expect(page.editOpeningBalanceLocked()).toBe(true);

    expect(page.editOpeningBalance).toBe(20);

    // Second attempt: change the name only.
    page.editWalletName = 'QA Cash Wallet QA';

    await page.saveEditWallet();

    // The name changes, but the original balance is submitted.
    expect(updateWallet).toHaveBeenNthCalledWith(
      2,
      wallet.id,
      {
        name: 'QA Cash Wallet QA',
        openingBalance: 20,
      }
    );

    // The wallet list is refreshed after saving.
    expect(loadWallets).toHaveBeenCalled();

    // Successful saving closes the modal.
    expect(page.editingWallet()).toBeNull();

    expect(page.editWalletError()).toBe('');

    expect(page.savingEditWallet()).toBe(false);
  });

  it('archives and restores a wallet without changing its balance', async () => {
    const {
      page,
      wallet,
      archiveWallet,
      restoreWallet,
    } = await setupWalletTest();

    // Initial state.
    expect(page.activeWallets()).toHaveLength(1);

    expect(page.cashTotal()).toBe(10);

    // Open the archive confirmation.
    page.openArchiveWalletModal(wallet);

    expect(page.archiveWalletDialog()).not.toBeNull();

    // Confirm archiving.
    await page.confirmArchiveWallet();

    expect(archiveWallet).toHaveBeenCalledWith(wallet.id);

    // Archived wallets must not count toward active cash balances.
    expect(page.activeWallets()).toHaveLength(0);

    expect(page.cashTotal()).toBe(0);

    // The wallet must appear in the archived list.
    expect(page.archivedWallets()).toHaveLength(1);

    expect(page.archivedWallets()[0].isArchived).toBe(true);

    expect(page.archivedWallets()[0].currentBalance).toBe(10);

    expect(page.archiveWalletDialog()).toBeNull();

    expect(page.archiveWalletNotice()).toContain(
      'has been archived'
    );

    // Restore the archived wallet.
    const archivedWallet = page.archivedWallets()[0];

    page.openRestoreWalletModal(archivedWallet);

    expect(page.restoreWalletDialog()).not.toBeNull();

    await page.confirmRestoreWallet();

    expect(restoreWallet).toHaveBeenCalledWith(wallet.id);

    // The wallet must return to the active list.
    expect(page.activeWallets()).toHaveLength(1);

    expect(page.activeWallets()[0].isArchived).toBe(false);

    expect(page.activeWallets()[0].currentBalance).toBe(10);

    // The original balance must return.
    expect(page.cashTotal()).toBe(10);

    // The archived list must now be empty.
    expect(page.archivedWallets()).toHaveLength(0);

    expect(page.restoreWalletDialog()).toBeNull();

    expect(page.archiveWalletNotice()).toContain(
      'restored successfully'
    );
  });
  describe('ProfileAssetsPage - Bank balance refresh', () => {
    async function setupRefreshTest(
      result: BankSyncResult = {
        totalConnections: 1,
        successfulConnections: 1,
        failedConnections: 0,
        busy: false,
      }
    ) {
      const wallets = signal<CashWallet[]>([]);

      let savedBalance = 500;

      const account: ConnectedBankAccount = {
        id: 'account-001',
        connectionId: 'connection-001',
        accountName: 'Everyday Account',
        accountNumberLast4: '1234',
        accountType: 'CHECKING',
        currency: 'NZD',
        balance: 500,
        status: 'CONNECTED',
        lastSyncedAt: null,
      };

      const syncNow = vi.fn(async () => {
        if (!result.busy && result.failedConnections === 0) {
          savedBalance = 750;
        }

        return result;
      });

      const getAccounts = vi.fn(() =>
        of([
          {
            ...account,
            balance: savedBalance,
          },
        ])
      );

      const loadWallets = vi.fn(() => of([]));

      const getArchivedWallets = vi.fn(() => of([]));

      await TestBed.configureTestingModule({
        imports: [ProfileAssetsPage],
        providers: [
          provideRouter([]),
          {
            provide: CashWalletService,
            useValue: {
              wallets,
              loadWallets,
            },
          },
          {
            provide: CashWalletApiService,
            useValue: {
              getArchivedWallets,
            },
          },
          {
            provide: BankAccountsApiService,
            useValue: {
              getAccounts,
            },
          },
          {
            provide: BankAutoSyncService,
            useValue: {
              syncNow,
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

      await page.loadAssets();

      return {
        fixture,
        page,
        syncNow,
        getAccounts,
      };
    }

    it('synchronises before loading updated bank balances', async () => {
      const {
        page,
        syncNow,
        getAccounts,
      } = await setupRefreshTest();

      expect(page.bankTotal()).toBe(500);

      await page.refreshBalances();

      expect(syncNow).toHaveBeenCalledOnce();
      expect(getAccounts).toHaveBeenCalledTimes(2);
      expect(page.bankTotal()).toBe(750);
      expect(page.combinedTotal()).toBe(750);
      expect(page.refreshError()).toBe('');
    });

    it('marks balances unavailable when synchronisation fails', async () => {
      const {
        page,
      } = await setupRefreshTest({
        totalConnections: 1,
        successfulConnections: 0,
        failedConnections: 1,
        busy: false,
      });

      await page.refreshBalances();

      expect(page.refreshError()).toContain(
        'could not be synchronised'
      );

      expect(page.bankError()).not.toBe('');
      expect(page.refreshingBalances()).toBe(false);
    });

    it('does not treat an overlapping sync as a successful refresh', async () => {
      const {
        page,
      } = await setupRefreshTest({
        totalConnections: 0,
        successfulConnections: 0,
        failedConnections: 0,
        busy: true,
      });

      await page.refreshBalances();

      expect(page.refreshError()).toContain(
        'already running'
      );

      expect(page.bankError()).not.toBe('');
    });
  });
});