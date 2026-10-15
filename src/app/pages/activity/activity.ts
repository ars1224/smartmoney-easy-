
import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  ManualTransactionsService
} from '../../core/services/manual-transactions.service';

type TransactionSource = 'cash' | 'bank';
type SourceFilter = 'all' | TransactionSource;

interface Transaction {
  id: string;
  description: string;
  source: TransactionSource;
  category: string;
  amount: number;
  date: string;
}

@Component({
  selector: 'app-activity',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './activity.html',
  styleUrl: './activity.scss',
})
export class Activity implements OnInit {

  private readonly manualTransactionsService =
    inject(ManualTransactionsService);

  selectedSource: SourceFilter = 'all';
  deleteError = '';

  // Transactions saved by the user
  manualTransactions: Transaction[] = [];

  // Temporary bank transactions for frontend testing
  // Replace these with Mock Bank API data later.
  readonly demoBankTransactions: Transaction[] = [
    {
      id: 'demo-bank-1',
      description: 'Fresh Choice',
      source: 'bank',
      category: 'Groceries',
      amount: -84.20,
      date: '2026-10-14'
    },
    {
      id: 'demo-bank-2',
      description: 'Salary',
      source: 'bank',
      category: 'Income',
      amount: 1400.00,
      date: '2026-10-14'
    }
  ];

  ngOnInit(): void {
    this.loadManualTransactions();
  }

  // Load transactions saved in browser storage
  loadManualTransactions(): void {

    const savedTransactions =
      this.manualTransactionsService.getAll();

    this.manualTransactions = savedTransactions.map(
      transaction => ({
        id: transaction.id,
        description:
          transaction.note.trim() || transaction.category,
        source: 'cash' as const,
        category: transaction.category,
        amount: transaction.type === 'income'
          ? transaction.amount
          : -transaction.amount,
        date: transaction.date
      })
    );

  }

  // Combine Cash and Bank transactions
  get transactions(): Transaction[] {
    return [
      ...this.manualTransactions,
      ...this.demoBankTransactions
    ];
  }

  // Filter by source
  get filteredTransactions(): Transaction[] {

    if (this.selectedSource === 'all') {
      return this.transactions;
    }

    return this.transactions.filter(
      transaction =>
        transaction.source === this.selectedSource
    );

  }

  // Change filter
  changeSource(event: Event): void {

    const value =
      (event.target as HTMLSelectElement).value;

    if (
      value === 'all' ||
      value === 'cash' ||
      value === 'bank'
    ) {
      this.selectedSource = value;
    }

  }

  // Display positive and negative NZD amounts
  formatAmount(amount: number): string {

    const formatted = Math.abs(amount).toLocaleString(
      'en-NZ',
      {
        style: 'currency',
        currency: 'NZD',
        currencyDisplay: 'narrowSymbol'
      }
    );

    return `${amount >= 0 ? '+' : '-'}${formatted}`;

  }

  deleteTransaction(transaction: Transaction): void {
    this.deleteError = '';

    // Only manual Cash transactions can be deleted.
    if (transaction.source !== 'cash') {
      return;
    }

    // Verify that the transaction exists in our manual store.
    const existingTransaction =
      this.manualTransactionsService.getById(transaction.id);

    if (!existingTransaction) {
      this.deleteError = 'Manual transaction not found.';
      return;
    }

    // Ask for confirmation before deleting.
    const confirmed = window.confirm(
      `Are you sure you want to delete "${transaction.description}"?\n\n` +
      'This action cannot be undone.'
    );

    if (!confirmed) {
      return;
    }

    try {
      const deleted = this.manualTransactionsService.remove(
        transaction.id
      );

      if (!deleted) {
        this.deleteError = 'Transaction could not be found.';
        return;
      }

      // Reload transactions immediately after deleting.
      this.loadManualTransactions();

    } catch (error) {
      this.deleteError =
        error instanceof Error
          ? error.message
          : 'Unable to delete transaction. Please try again.';
    }
  }

}
