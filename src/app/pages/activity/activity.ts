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
  TRANSACTION_CATEGORY_GROUPS,
  TRANSACTION_CATEGORIES,
} from '../../core/constants/transaction-categories';

import {
  CashTransactionsApiService,
} from '../../core/services/cash-transactions-api.service';

import {
  BankAccountsApiService,
  type BankCategorySuggestion,
  type BudgetGroup,
  type BudgetGroupOverride,
} from '../../core/bank/bank-accounts-api.service';

import { FormsModule } from '@angular/forms';

import { DatePipe } from '@angular/common';

type TransactionSource = 'cash' | 'bank';
type SourceFilter = 'all' | TransactionSource;

interface Transaction {
  id: string;
  description: string;
  source: TransactionSource;
  category: string;
  amount: number;
  currency: string;
  date: string;
  budgetGroup: BudgetGroup | null;
  budgetGroupOverride: BudgetGroupOverride;
}

@Component({
  selector: 'app-activity',
  standalone: true,
  imports: [RouterLink, FormsModule, DatePipe],
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

  searchTerm = '';

  transactionToDelete: Transaction | null = null;

  selectedBudgetGroup: 'all' | 'NEEDS' | 'WANTS' | 'SAVINGS' = 'all';
  selectedCategory = 'all';

  get availableCategories(): string[] {
    return [...new Set(
      this.transactions.map(transaction => transaction.category)
    )].sort((a, b) => a.localeCompare(b));
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.selectedSource = 'all';
    this.selectedBudgetGroup = 'all';
    this.selectedCategory = 'all';
  }

  ngOnInit(): void {
    void this.loadManualTransactions();
    void this.loadLegacyCategories();
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
            budgetGroup: null,
            id: transaction.id,
            description:
              transaction.note.trim() || transaction.category,
            source: 'cash' as const,
            category: transaction.category,
            amount:
              transaction.type === 'income'
                ? transaction.amount
                : -transaction.amount,
            currency: 'NZD',
            date: transaction.date,
            budgetGroupOverride: null,
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
            budgetGroup: transaction.budgetGroup ?? null,
            amount: transaction.amount,
            currency: transaction.currency,
            date: transaction.transactionDate,
            budgetGroupOverride: transaction.budgetGroupOverride ?? null,
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
    const query = this.searchTerm.trim().toLowerCase();

    return this.transactions.filter(transaction => {
      const matchesSource =
        this.selectedSource === 'all' ||
        transaction.source === this.selectedSource;

      const matchesGroup =
        this.selectedBudgetGroup === 'all' ||
        transaction.budgetGroup === this.selectedBudgetGroup;

      const matchesCategory =
        this.selectedCategory === 'all' ||
        transaction.category === this.selectedCategory;

      const matchesSearch =
        !query ||
        [
          transaction.description,
          transaction.category,
          transaction.source,
          transaction.budgetGroup ?? '',
          transaction.date,
        ].join(' ').toLowerCase().includes(query);

      return matchesSource &&
        matchesGroup &&
        matchesCategory &&
        matchesSearch;
    });
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

    formatAmount(amount: number, currency: string): string {
      const formatted = Math.abs(amount).toLocaleString('en-NZ', {
        style: 'currency',
        currency,
        currencyDisplay: 'code',
      });

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


  openBankCategoryDialog(
    transaction: Transaction,
    event: Event
  ): void {
    if (
      transaction.source !== 'bank' ||
      this.savingCategory ||
      this.transactionToDelete ||
      this.categoryTransaction
    ) {
      return;
    }

    this.categoryTrigger =
      event.currentTarget instanceof HTMLElement
        ? event.currentTarget
        : null;

    this.categoryTransaction = transaction;
    this.selectedBankGroupOverride =
  transaction.budgetGroupOverride ?? 'AUTO';


      const currentCategory = transaction.category;

      if (currentCategory.startsWith('Other - ')) {
        this.selectedBankCategory = 'Other';
        this.otherBankCategory =
          currentCategory.slice('Other - '.length);
      } else if (this.bankCategories.includes(currentCategory)) {
        this.selectedBankCategory = currentCategory;
        this.otherBankCategory = '';
      } else if (currentCategory === 'Uncategorised') {
        this.selectedBankCategory = '';
        this.otherBankCategory = '';
      } else {
        this.selectedBankCategory = 'Other';
        this.otherBankCategory = currentCategory;
      }

    this.categoryError = '';

    this.bankCategoryDialog?.nativeElement.showModal();
  }

  closeBankCategoryDialog(): void {
    if (this.savingCategory) return;

    this.bankCategoryDialog?.nativeElement.close();
  }

  onBankCategoryDialogCancel(event: Event): void {
    if (this.savingCategory) {
      event.preventDefault();
    }
  }

  onBankCategoryDialogClosed(): void {
    if (this.savingCategory) return;

    const trigger = this.categoryTrigger;

    this.categoryTransaction = null;
    this.selectedBankCategory = '';
    this.otherBankCategory = '';
    this.categoryError = '';
    this.categoryTrigger = null;
    this.selectedBankGroupOverride = 'AUTO';

    setTimeout(() => trigger?.focus(), 0);
    this.changeDetector.markForCheck();
  }

  async saveBankCategory(): Promise<void> {
    const transaction = this.categoryTransaction;

    if (
      !transaction ||
      transaction.source !== 'bank' ||
      this.savingCategory
    ) {
      return;
    }


  let category: string | null =
    this.selectedBankCategory || null;

    if (!category) {
      this.categoryError = 'Please select a category.';
      return;
    }

  if (category === 'Other') {
    const specific = this.otherBankCategory.trim();

    if (!specific) {
      this.categoryError =
        'Please specify what the Other category is.';
      return;
    }

    if (specific.length > 72) {
      this.categoryError =
        'The custom category is too long.';
      return;
    }

    category = `Other - ${specific}`;

  } else if (
    category !== null &&
    !this.bankCategories.includes(category)
  ) {
    this.categoryError = 'Select a valid category.';
    return;
  }


    this.savingCategory = true;
    this.categoryError = '';

try {
  const result = await firstValueFrom(
    this.bankAccountsApi.updateTransactionCategory(
      transaction.id,
      category,
      this.selectedBankGroupOverride === 'AUTO'
        ? null
        : this.selectedBankGroupOverride
    )
  );

  this.bankTransactions = this.bankTransactions.map(
    current =>
      current.id === result.id
        ? {
            ...current,
            category: result.category ?? 'Uncategorised',
            budgetGroup: result.budgetGroup,
            budgetGroupOverride: result.budgetGroupOverride,
          }
        : current
  );

  this.bankCategoryDialog?.nativeElement.close();

} catch (error: unknown) {
  this.categoryError = this.getErrorMessage(
    error,
    'Unable to update bank transaction category.'
  );

} finally {
  this.savingCategory = false;
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


  @ViewChild('bankCategoryDialog')
  private bankCategoryDialog?: ElementRef<HTMLDialogElement>;

readonly bankCategoryGroups = TRANSACTION_CATEGORY_GROUPS;
readonly bankCategories = TRANSACTION_CATEGORIES;


  categoryTransaction: Transaction | null = null;
  selectedBankCategory = '';
  otherBankCategory = '';
  categoryError = '';
  savingCategory = false;
  selectedBankGroupOverride:
  'AUTO' | 'NEEDS' | 'WANTS' | 'SAVINGS' | 'NONE' = 'AUTO';

  private categoryTrigger: HTMLElement | null = null;


legacySuggestions: BankCategorySuggestion[] = [];
legacyLoading = false;
legacyApplying = false;
legacyConfirmed = false;
legacyError = '';
legacySuccess = '';

async loadLegacyCategories(): Promise<void> {
  if (this.legacyLoading) return;

  this.legacyLoading = true;
  this.legacyError = '';

  try {
    const response = await firstValueFrom(
      this.bankAccountsApi.previewLegacyCategories()
    );

    this.legacySuggestions = response.suggestions;
    this.legacyConfirmed = false;

  } catch (error: unknown) {
    this.legacyError = this.getErrorMessage(
      error,
      'Unable to load category suggestions.'
    );

  } finally {
    this.legacyLoading = false;
    this.changeDetector.markForCheck();
  }
}

async applyLegacyCategories(): Promise<void> {
  if (
    this.legacyApplying ||
    !this.legacyConfirmed ||
    this.legacySuggestions.length === 0
  ) {
    return;
  }

  this.legacyApplying = true;
  this.legacyError = '';
  this.legacySuccess = '';

  try {
    const result = await firstValueFrom(
      this.bankAccountsApi.applyLegacyCategories()
    );

    this.legacySuccess =
      `${result.count} transaction(s) categorised successfully.`;

    this.legacySuggestions = [];
    this.legacyConfirmed = false;

    await this.loadManualTransactions();
    await this.loadLegacyCategories();

  } catch (error: unknown) {
    this.legacyError = this.getErrorMessage(
      error,
      'Unable to complete automatic categorisation.'
    );

  } finally {
    this.legacyApplying = false;
    this.changeDetector.markForCheck();
  }
}

}