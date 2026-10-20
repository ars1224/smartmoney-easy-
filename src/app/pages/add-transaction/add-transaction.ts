import { Component, inject, OnInit } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ManualTransactionsService } from '../../core/services/manual-transactions.service';
import { CashWalletService } from '../../core/services/cash-wallet.service';


type TransactionType = 'income' | 'expense';

@Component({
  selector: 'app-add-transaction',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './add-transaction.html',
  styleUrl: './add-transaction.scss',
})



export class AddTransaction implements OnInit {

  private readonly fb = inject(FormBuilder);

  private readonly router = inject(Router);

  private readonly manualTransactions =
  inject(ManualTransactionsService);

  private readonly cashWalletService = inject(CashWalletService);

  saveError = '';
  isSaving = false;

  // Default date: Today (local time)
  readonly today = this.getTodayDate();

  // Cash wallets available for manual transactions
  // Additional wallets will be loaded from the backend later.
  readonly cashWallets = this.cashWalletService.getWallets();

  // Expense categories
  readonly expenseCategories = [
    'Groceries',
    'Transport',
    'Eating out',
    'Shopping',
    'Bills',
    'Entertainment',
    'Other'
  ];

  // Income categories
  readonly incomeCategories = [
    'Salary',
    'Business',
    'Gift',
    'Other'
  ];


ngOnInit(): void {
  const id = this.activatedRoute.snapshot.paramMap.get('id');

  // No ID means we're creating a new transaction.
  if (!id) {
    return;
  }

  this.editId = id;

  // Find the existing manual transaction.
  const transaction = this.manualTransactions.getById(id);

  if (!transaction) {
    this.loadError = 'Transaction not found.';
    this.transactionForm.disable();
    return;
  }

  // Populate the form with existing values.
  this.transactionForm.patchValue({
    type: transaction.type,
    assetId: transaction.assetId,
    amount: transaction.amount,
    category: transaction.category,
    date: transaction.date,
    note: transaction.note
  });
}


  // Reactive Transaction Form
  readonly transactionForm = this.fb.nonNullable.group({
    type: this.fb.nonNullable.control<TransactionType>(
      'expense',
      Validators.required
    ),

    assetId: ['nzd-cash', Validators.required],

    amount: [
      0,
      [
        Validators.required,
        Validators.min(0.01)
      ]
    ],

    category: ['', Validators.required],

    date: [this.today, Validators.required],

    note: ['', Validators.maxLength(250)]
  });

  // Categories change depending on transaction type
  get availableCategories(): string[] {
    return this.transactionForm.controls.type.value === 'income'
      ? this.incomeCategories
      : this.expenseCategories;
  }


get selectedWalletBalance(): string {

  // Get the wallet selected in the form.
  const walletId =
    this.transactionForm.controls.assetId.value;

  // Find the wallet.
  const wallet =
    this.cashWalletService.getWalletById(walletId);

  if (!wallet) {
    return 'Unavailable';
  }

  // Calculate its balance from saved transactions.
  const balance =
    this.cashWalletService.getBalance(wallet.id);

  // Format using the wallet's own currency.
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: wallet.currency,
    currencyDisplay: 'code',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(balance);

}


  // Change transaction type and reset category
  setTransactionType(type: TransactionType): void {
    if (this.transactionForm.controls.type.value === type) {
      return;
    }

    this.transactionForm.patchValue({
      type,
      category: ''
    });
  }

  // Get today's date in YYYY-MM-DD format
  private getTodayDate(): string {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }



async saveTransaction(): Promise<void> {
  this.saveError = '';

  if (this.isSaving || this.loadError) {
    return;
  }

  // Validate all fields.
  if (this.transactionForm.invalid) {
    this.transactionForm.markAllAsTouched();
    return;
  }

  this.isSaving = true;

  try {
    const formData = this.transactionForm.getRawValue();

    if (this.isEditMode && this.editId) {

      // Update an existing Cash transaction.
      this.manualTransactions.update(
        this.editId,
        formData
      );

    } else {

      // Create a new Cash transaction.
      this.manualTransactions.add(formData);

    }

    // Return to Activity history.
    await this.router.navigateByUrl('/app/activity');

  } catch (error) {

    this.saveError =
      error instanceof Error
        ? error.message
        : 'Unable to save transaction.';

  } finally {
    this.isSaving = false;
  }
}



private readonly activatedRoute = inject(ActivatedRoute);

editId: string | null = null;
loadError = '';

get isEditMode(): boolean {
  return this.editId !== null;
}


}


