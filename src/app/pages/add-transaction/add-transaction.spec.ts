
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import {
  describe,
  beforeEach,
  it,
  expect,
  vi,
} from 'vitest';

import { AddTransactionPage } from './add-transaction';
import {
  CashWallet,
  CashWalletService,
} from '../../core/services/cash-wallet.service';
import {
  CashWalletApiService,
} from '../../core/services/cash-wallet-api.service';
import {
  CashTransactionsApiService,
  CashTransactionRecord,
} from '../../core/services/cash-transactions-api.service';

describe('AddTransactionPage', () => {
  const wallet: CashWallet = {
    id: 'wallet-1',
    name: 'Test Cash Wallet',
    currency: 'NZD',
    openingBalance: 100,
    currentBalance: 100,
    isArchived: false,
    createdAt: '2026-11-02T00:00:00Z',
    updatedAt: '2026-11-02T00:00:00Z',
  };

  const transaction: CashTransactionRecord = {
    id: 'transaction-1',
    source: 'cash',
    type: 'expense',
    assetId: wallet.id,
    amount: 40,
    category: 'Groceries',
    date: '2026-11-02',
    note: '',
    createdAt: '2026-11-02T00:00:00Z',
  };

  let component: AddTransactionPage;
  let wallets: CashWallet[];

  let walletService: {
    loadWallets: ReturnType<typeof vi.fn>;
    getWalletById: ReturnType<typeof vi.fn>;
  };

  let walletApi: {
    createWallet: ReturnType<typeof vi.fn>;
  };

  let transactionsApi: {
    createTransaction: ReturnType<typeof vi.fn>;
    updateTransaction: ReturnType<typeof vi.fn>;
    getTransactions: ReturnType<typeof vi.fn>;
  };

  let router: Router;

  beforeEach(async () => {
    wallets = [wallet];

    walletService = {
      loadWallets: vi.fn(() => of(wallets)),
      getWalletById: vi.fn((id: string) =>
        wallets.find(item => item.id === id)
      ),
    };

    walletApi = {
      createWallet: vi.fn(),
    };

    transactionsApi = {
      createTransaction: vi.fn(),
      updateTransaction: vi.fn(),
      getTransactions: vi.fn(() => of([])),
    };

    await TestBed.configureTestingModule({
      imports: [AddTransactionPage],
      providers: [
        provideRouter([]),
        {
          provide: CashWalletService,
          useValue: walletService,
        },
        {
          provide: CashWalletApiService,
          useValue: walletApi,
        },
        {
          provide: CashTransactionsApiService,
          useValue: transactionsApi,
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    component = TestBed.createComponent(
      AddTransactionPage
    ).componentInstance;
  });

  it('starts with an empty transaction amount', () => {
    expect(
      component.transactionForm.controls.amount.value
    ).toBeNull();
  });

  it('rejects saving when the amount is empty', async () => {
  component.transactionForm.patchValue({
    type: 'expense',
    assetId: wallet.id,
    amount: null,
    category: 'Groceries',
    date: '2026-11-02',
    note: '',
  });

  component.walletsLoading = false;

  await component.saveTransaction();

  expect(component.transactionForm.invalid).toBe(true);
  expect(
    transactionsApi.createTransaction
  ).not.toHaveBeenCalled();
});

  it('restores the save state after a failed request', async () => {
    component.transactionForm.patchValue({
      type: 'expense',
      assetId: wallet.id,
      amount: 40,
      category: 'Groceries',
      date: '2026-11-02',
      note: '',
    });

    component.walletsLoading = false;

    transactionsApi.createTransaction.mockReturnValue(
      throwError(() => new HttpErrorResponse({
        status: 0,
      }))
    );

    await component.saveTransaction();

    expect(component.isSaving).toBe(false);
    expect(component.saveError).toBe(
      'Unable to connect to the Flask server.'
    );
    expect(
      component.transactionForm.controls.amount.value
    ).toBe(40);
  });

  it('allows a successful retry after a failed save', async () => {
    component.transactionForm.patchValue({
      type: 'expense',
      assetId: wallet.id,
      amount: 40,
      category: 'Groceries',
      date: '2026-11-02',
      note: '',
    });

    component.walletsLoading = false;

    transactionsApi.createTransaction
      .mockReturnValueOnce(
        throwError(() => new HttpErrorResponse({
          status: 0,
        }))
      )
      .mockReturnValueOnce(of(transaction));

    await component.saveTransaction();

    expect(component.isSaving).toBe(false);
    expect(component.saveError).toBeTruthy();

    await component.saveTransaction();

    expect(component.saveError).toBe('');
    expect(
      transactionsApi.createTransaction
    ).toHaveBeenCalledTimes(2);
    expect(router.navigateByUrl).toHaveBeenCalledWith(
      '/app/activity'
    );
  });

  it('restores wallet creation state after failure', async () => {
    wallets = [];

    component.walletForm.patchValue({
      name: 'Test Cash Wallet',
      openingBalance: 100,
    });

    walletApi.createWallet.mockReturnValue(
      throwError(() => new HttpErrorResponse({
        status: 0,
      }))
    );

    await component.createCashWallet();

    expect(component.isCreatingWallet).toBe(false);
    expect(component.walletCreateError).toBe(
      'Unable to connect to the Flask server.'
    );
    expect(
      component.walletForm.controls.name.value
    ).toBe('Test Cash Wallet');
  });

  it('allows wallet creation to succeed after retry', async () => {
    wallets = [];

    component.walletForm.patchValue({
      name: 'Test Cash Wallet',
      openingBalance: 100,
    });

    walletApi.createWallet
      .mockReturnValueOnce(
        throwError(() => new HttpErrorResponse({
          status: 0,
        }))
      )
      .mockImplementationOnce(() => {
        wallets = [wallet];
        return of(wallet);
      });

    await component.createCashWallet();

    expect(component.walletCreateError).toBeTruthy();

    await component.createCashWallet();

    expect(component.walletCreateError).toBe('');
    expect(component.isCreatingWallet).toBe(false);
    expect(
      component.transactionForm.controls.assetId.value
    ).toBe(wallet.id);
    expect(walletApi.createWallet).toHaveBeenCalledTimes(2);
  });
  it('honours an income quick action on a new transaction', async () => {
    vi.spyOn(TestBed.inject(ActivatedRoute).snapshot.queryParamMap, 'get').mockReturnValue('income');
    component.ngOnInit(); await new Promise(resolve => setTimeout(resolve, 0));
    expect(component.transactionForm.controls.type.value).toBe('income');
  });
  it('ignores unsupported quick-action types', async () => {
    vi.spyOn(TestBed.inject(ActivatedRoute).snapshot.queryParamMap, 'get').mockReturnValue('invalid');
    component.ngOnInit(); await new Promise(resolve => setTimeout(resolve, 0));
    expect(component.transactionForm.controls.type.value).toBe('expense');
  });
  it('does not overwrite an existing transaction type with a quick-action parameter', async () => {
    const route=TestBed.inject(ActivatedRoute);
    vi.spyOn(route.snapshot.paramMap,'get').mockReturnValue(transaction.id);
    vi.spyOn(route.snapshot.queryParamMap,'get').mockReturnValue('income');
    transactionsApi.getTransactions.mockReturnValue(of([transaction]));
    component.ngOnInit(); await new Promise(resolve => setTimeout(resolve, 0));
    expect(component.transactionForm.controls.type.value).toBe('expense');expect(component.transactionForm.controls.amount.value).toBe(40);
  });

});
