import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  inject,
  OnInit,
  ViewChild,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import {
  CashTransactionsApiService,
} from '../../core/services/cash-transactions-api.service';

import {
  BankAccountsApiService,
} from '../../core/bank/bank-accounts-api.service';

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

export class ActivityPage implements OnInit {
  private deleteTrigger: HTMLElement | null = null;

  private deleteModalElement: HTMLElement | null = null;

  private readonly bankAccountsApi =
  inject(BankAccountsApiService);

  @ViewChild('deleteModal')
  set deleteModal(ref: ElementRef<HTMLElement> | undefined) {
    this.deleteModalElement = ref?.nativeElement ?? null;

    const modal = this.deleteModalElement;

    if (!modal) {
      return;
    }

    requestAnimationFrame(() => {
      if (!modal.isConnected || !this.transactionToDelete) {
        return;
      }

      const cancelButton =
        modal.querySelector<HTMLButtonElement>('.modal-cancel-btn');

      (cancelButton ?? modal).focus();
    });
  }

  private readonly cashTransactionsApi =
    inject(CashTransactionsApiService);

  private readonly changeDetector =
    inject(ChangeDetectorRef);

  selectedSource: SourceFilter = 'all';

  manualTransactions: Transaction[] = [];
  bankTransactions: Transaction[] = [];

  isLoading = false;
  loadError = '';
  deleteError = '';
  deletingId: string | null = null;

  transactionToDelete: Transaction | null = null;

  ngOnInit(): void {
    void this.loadManualTransactions();
  }


async loadManualTransactions(): Promise<void> {
  if (this.isLoading) return;

  this.isLoading = true;
  this.loadError = '';

  try {
    const [cashResult, bankResult] = await Promise.allSettled([
      firstValueFrom(
        this.cashTransactionsApi.getTransactions()
      ),
      firstValueFrom(
        this.bankAccountsApi.getAllTransactions()
      ),
    ]);

    // Cash transactions
    if (cashResult.status === 'fulfilled') {
      this.manualTransactions = cashResult.value.map(
        transaction => ({
          id: transaction.id,
          description:
            transaction.note.trim() || transaction.category,
          source: 'cash' as const,
          category: transaction.category,
          amount:
            transaction.type === 'income'
              ? transaction.amount
              : -transaction.amount,
          date: transaction.date,
        })
      );
    } else {
      this.manualTransactions = [];
      this.loadError = 'Unable to load cash transactions.';
    }

    // Imported bank transactions
    if (bankResult.status === 'fulfilled') {
      this.bankTransactions = bankResult.value.map(
        transaction => ({
          id: transaction.id,
          description: transaction.description,
          source: 'bank' as const,
          category:
            transaction.category?.trim() || 'Uncategorised',
          amount: transaction.amount,
          date: transaction.transactionDate,
        })
      );
    } else {
      this.bankTransactions = [];
      this.loadError = [
        this.loadError,
        'Unable to load bank transactions.',
      ].filter(Boolean).join(' ');
    }

  } finally {
    this.isLoading = false;
    this.changeDetector.markForCheck();
  }
}



get transactions(): Transaction[] {
  return [
    ...this.manualTransactions,
    ...this.bankTransactions,
  ].sort((a, b) => {
    const aTime = Date.parse(a.date) || 0;
    const bTime = Date.parse(b.date) || 0;

    return bTime - aTime || a.id.localeCompare(b.id);
  });
}


  get filteredTransactions(): Transaction[] {
    if (this.selectedSource === 'all') {
      return this.transactions;
    } return this.transactions.filter(
      transaction => transaction.source === this.selectedSource
    );
  }

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

  formatAmount(amount: number): string {
    const formatted = Math.abs(amount).toLocaleString(
      'en-NZ',
      {
        style: 'currency',
        currency: 'NZD',
        currencyDisplay: 'narrowSymbol',
      }
    );

    return `${amount >= 0 ? '+' : '-'}${formatted}`;
  }

  openDeleteModal(transaction: Transaction, event: Event): void {
    if (
      transaction.source !== 'cash' ||
      this.deletingId !== null
    ) {
      return;
    }

    this.deleteTrigger =
      event.currentTarget instanceof HTMLElement
        ? event.currentTarget
        : null;

    this.deleteError = '';
    this.transactionToDelete = transaction;
  }

  closeDeleteModal(): void {
    if (this.deletingId !== null) {
      return;
    }

    const trigger = this.deleteTrigger;

    this.deleteError = '';
    this.transactionToDelete = null;
    this.deleteTrigger = null;

    setTimeout(() => {
      if (trigger?.isConnected) {
        trigger.focus();
      }
    }, 0);
  }
  async confirmDeleteTransaction(): Promise<void> {
    if (
      !this.transactionToDelete ||
      this.transactionToDelete.source !== 'cash' ||
      this.deletingId !== null
    ) {
      return;
    }

    const transaction = this.transactionToDelete;
    this.deleteError = '';
    this.deletingId = transaction.id;

    try {
      await firstValueFrom(
        this.cashTransactionsApi.deleteTransaction(
          transaction.id
        )
      );

    await this.loadManualTransactions();

    this.transactionToDelete = null;
    this.deleteTrigger = null;

    } catch (error) {
      this.deleteError = this.getErrorMessage(
        error,
        'Unable to delete transaction.'
      );

    } finally {
      this.deletingId = null;
      this.changeDetector.markForCheck();
    }
  }

  private getErrorMessage(
    error: unknown,
    fallback: string
  ): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return 'Unable to connect to the Flask server.';
      }

      if (error.status === 401) {
        return 'Your session has expired. Please log in again.';
      }

      const message = error.error?.error;

      if (typeof message === 'string') {
        return message;
      }
    }

    return fallback;
  }


  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: Event): void {
    if (this.transactionToDelete && this.deletingId === null) {
      event.preventDefault();
      this.closeDeleteModal();
    }
  }


  @HostListener('document:keydown.tab', ['$event'])
  onModalTab(event: Event): void {
    if (!this.transactionToDelete || !this.deleteModalElement) {
      return;
    }

    const keyboardEvent = event as KeyboardEvent;
    const modal = this.deleteModalElement;

    const focusableButtons = Array.from(
      modal.querySelectorAll<HTMLButtonElement>(
        'button:not([disabled])'
      )
    );

    if (focusableButtons.length === 0) {
      keyboardEvent.preventDefault();
      modal.focus();
      return;
    }

    const firstButton = focusableButtons[0];
    const lastButton = focusableButtons[focusableButtons.length - 1];
    const activeElement = document.activeElement;

    // Keep focus inside if it somehow moved outside.
    if (!modal.contains(activeElement)) {
      keyboardEvent.preventDefault();

      if (keyboardEvent.shiftKey) {
        lastButton.focus();
      } else {
        firstButton.focus();
      }

      return;
    }

    // Shift + Tab from first button loops to last.
    if (keyboardEvent.shiftKey && activeElement === firstButton) {
      keyboardEvent.preventDefault();
      lastButton.focus();
      return;
    }

    // Tab from last button loops back to first.
    if (!keyboardEvent.shiftKey && activeElement === lastButton) {
      keyboardEvent.preventDefault();
      firstButton.focus();
    }
  }


}