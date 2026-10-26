
import { Component, inject, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  ActivatedRoute,
  Router,
  RouterLink,
} from '@angular/router';
import { firstValueFrom } from 'rxjs';

import {
  CashWallet,
  CashWalletService,
} from '../../core/services/cash-wallet.service';

import {
  CashTransactionsApiService,
  CashTransactionType,
} from '../../core/services/cash-transactions-api.service';

import {
  CashWalletApiService,
} from '../../core/services/cash-wallet-api.service';


@Component({
  selector: 'app-add-transaction',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './add-transaction.html',
  styleUrl: './add-transaction.scss',
})
export class AddTransactionPage implements OnInit {
  private readonly cashWalletApi =
  inject(CashWalletApiService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);

  private readonly cashWalletService =
    inject(CashWalletService);

  private readonly cashTransactionsApi =
    inject(CashTransactionsApiService);

  readonly today = this.getTodayDate();

  cashWallets: CashWallet[] = [];

  noWallets = false;
  isCreatingWallet = false;
  walletCreateError = '';

  readonly walletForm = this.fb.nonNullable.group({
    name: ['', [
      Validators.required,
      Validators.maxLength(80),
    ]],
    openingBalance: [0, [
      Validators.required,
      Validators.min(0),
    ]],
  });

  walletsLoading = true;
  saveError = '';
  loadError = '';
  isSaving = false;

  editId: string | null = null;

  readonly expenseCategories = [
    'Groceries',
    'Transport',
    'Eating out',
    'Shopping',
    'Bills',
    'Entertainment',
    'Other',
  ];

  readonly incomeCategories = [
    'Salary',
    'Business',
    'Gift',
    'Other',
  ];

  readonly transactionForm = this.fb.nonNullable.group({
    type: this.fb.nonNullable.control<CashTransactionType>(
      'expense',
      Validators.required
    ),

    assetId: this.fb.nonNullable.control(
      '',
      Validators.required
    ),

    amount: this.fb.nonNullable.control(
      0,
      [
        Validators.required,
        Validators.min(0.01),
      ]
    ),

    category: this.fb.nonNullable.control(
      '',
      [
        Validators.required,
        Validators.maxLength(80),
      ]
    ),

    date: this.fb.nonNullable.control(
      this.today,
      Validators.required
    ),

    note: this.fb.nonNullable.control(
      '',
      Validators.maxLength(250)
    ),
  });

  ngOnInit(): void {
    void this.initializePage();
  }

  get isEditMode(): boolean {
    return this.editId !== null;
  }

  get availableCategories(): string[] {
    return this.transactionForm.controls.type.value === 'income'
      ? this.incomeCategories
      : this.expenseCategories;
  }

  get selectedWalletBalance(): string {
    if (this.walletsLoading) {
      return 'Loading...';
    }

    const walletId =
      this.transactionForm.controls.assetId.value;

    const wallet =
      this.cashWalletService.getWalletById(walletId);

    if (!wallet) {
      return 'Unavailable';
    }

    return new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: wallet.currency,
      currencyDisplay: 'code',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(wallet.currentBalance);
  }

  private async initializePage(): Promise<void> {
    this.editId =
      this.activatedRoute.snapshot.paramMap.get('id');

    this.walletsLoading = true;
    this.loadError = '';

    try {
      this.cashWallets = await firstValueFrom(
        this.cashWalletService.loadWallets()
      );

      if (this.cashWallets.length === 0) {
        this.noWallets = true;
        this.loadError =
          'No cash wallets available. Create a cash wallet ' +
          'before recording transactions.';

        this.transactionForm.disable();
        return;
      }

      if (this.editId) {
        const transactions = await firstValueFrom(
          this.cashTransactionsApi.getTransactions()
        );

        const transaction = transactions.find(
          item => item.id === this.editId
        );

        if (!transaction) {
          this.loadError = 'Cash transaction not found.';
          this.transactionForm.disable();
          return;
        }

        const walletAvailable = this.cashWallets.some(
          wallet => wallet.id === transaction.assetId
        );

        if (!walletAvailable) {
          this.loadError =
            'This transaction belongs to an archived ' +
            'or unavailable cash wallet.';

          this.transactionForm.disable();
          return;
        }

        this.transactionForm.setValue({
          type: transaction.type,
          assetId: transaction.assetId,
          amount: transaction.amount,
          category: transaction.category,
          date: transaction.date,
          note: transaction.note,
        });

      } else {
        this.transactionForm.controls.assetId.setValue(
          this.cashWallets[0].id
        );
      }

    } catch (error) {
      this.loadError = this.getErrorMessage(
        error,
        'Unable to load cash wallet data.'
      );

      this.transactionForm.disable();

    } finally {
      this.walletsLoading = false;
    }
  }

  setTransactionType(type: CashTransactionType): void {
    if (this.transactionForm.controls.type.value === type) {
      return;
    }

    this.transactionForm.patchValue({
      type,
      category: '',
    });
  }

  async saveTransaction(): Promise<void> {
    this.saveError = '';

    if (
      this.isSaving ||
      this.walletsLoading ||
      this.loadError
    ) {
      return;
    }

    if (this.transactionForm.invalid) {
      this.transactionForm.markAllAsTouched();
      return;
    }

    const formData =
      this.transactionForm.getRawValue();

    const wallet = this.cashWalletService.getWalletById(
      formData.assetId
    );

    if (!wallet) {
      this.saveError = 'Please select a valid cash wallet.';
      return;
    }

    if (
      !Number.isFinite(formData.amount) ||
      formData.amount <= 0 ||
      Math.abs(
        formData.amount * 100 -
        Math.round(formData.amount * 100)
      ) > 1e-7
    ) {
      this.saveError =
        'Enter a valid amount with up to two decimal places.';
      return;
    }

    this.isSaving = true;

    try {
      if (this.editId) {
        await firstValueFrom(
          this.cashTransactionsApi.updateTransaction(
            this.editId,
            formData
          )
        );

      } else {
        await firstValueFrom(
          this.cashTransactionsApi.createTransaction(
            formData
          )
        );
      }

      // Return to the Activity page after Flask confirms
      // that the transaction was saved successfully.
      await this.router.navigateByUrl('/app/activity');

    } catch (error) {
      this.saveError = this.getErrorMessage(
        error,
        'Unable to save cash transaction.'
      );

    } finally {
      this.isSaving = false;
    }
  }


async createCashWallet(): Promise<void> {
  this.walletCreateError = '';

  if (this.isCreatingWallet || this.walletForm.invalid) {
    this.walletForm.markAllAsTouched();
    return;
  }

  const { name, openingBalance } =
    this.walletForm.getRawValue();

  if (
    !name.trim() ||
    !Number.isFinite(openingBalance) ||
    openingBalance < 0 ||
    openingBalance > 999999999999.99 ||
    Math.abs(
      openingBalance * 100 -
      Math.round(openingBalance * 100)
    ) > 1e-7
  ) {
    this.walletCreateError =
      'Enter a valid wallet name and opening balance.';
    return;
  }

  this.isCreatingWallet = true;

  try {
    const wallet = await firstValueFrom(
      this.cashWalletApi.createWallet({
        name: name.trim(),
        currency: 'NZD',
        openingBalance,
      })
    );

    this.cashWallets = await firstValueFrom(
      this.cashWalletService.loadWallets()
    );

    this.transactionForm.enable();

    this.transactionForm.controls.assetId.setValue(
      wallet.id
    );

    this.noWallets = false;
    this.loadError = '';

    this.walletForm.reset({
      name: '',
      openingBalance: 0,
    });

  } catch (error) {
    this.walletCreateError = this.getErrorMessage(
      error,
      'Unable to create cash wallet.'
    );

  } finally {
    this.isCreatingWallet = false;
  }
}


  private getTodayDate(): string {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(
      now.getMonth() + 1
    ).padStart(2, '0');

    const day = String(
      now.getDate()
    ).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private getErrorMessage(
    error: unknown,
    fallback: string
  ): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return 'Unable to connect to the Flask server.';
      }

      const message = error.error?.error;

      if (typeof message === 'string') {
        return message;
      }
    }

    return fallback;
  }
}
