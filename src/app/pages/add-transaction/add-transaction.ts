
import { Component, inject } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ManualTransactionsService } from '../../core/services/manual-transactions.service';


type TransactionType = 'income' | 'expense';

@Component({
  selector: 'app-add-transaction',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './add-transaction.html',
  styleUrl: './add-transaction.scss',
})
export class AddTransaction {

  private readonly fb = inject(FormBuilder);

  private readonly router = inject(Router);

  private readonly manualTransactions =
  inject(ManualTransactionsService);

  saveError = '';
  isSaving = false;

  // Default date: Today (local time)
  readonly today = this.getTodayDate();

  // Cash wallets available for manual transactions
  // Additional wallets will be loaded from the backend later.
  readonly cashWallets = [
    {
      id: 'nzd-cash',
      name: 'NZD Cash',
      currency: 'NZD'
    }
  ];

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

  // Prevent duplicate submissions
  if (this.isSaving) {
    return;
  }

  // Validate the form
  if (this.transactionForm.invalid) {
    this.transactionForm.markAllAsTouched();
    return;
  }

  this.isSaving = true;

  try {

    // Get all form values
    const formData = this.transactionForm.getRawValue();

    // Save the manual cash transaction
    this.manualTransactions.add(formData);

    // Return to Activity page
    await this.router.navigateByUrl('/app/activity');

  } catch (error) {

    this.saveError =
      error instanceof Error
        ? error.message
        : 'Unable to save transaction. Please try again.';

  } finally {

    this.isSaving = false;

  }
}

}


