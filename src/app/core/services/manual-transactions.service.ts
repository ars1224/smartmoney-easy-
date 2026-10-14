
import { Injectable } from '@angular/core';

export type TransactionType = 'income' | 'expense';

export interface ManualTransaction {
  id: string;
  source: 'cash';
  type: TransactionType;
  assetId: string;
  amount: number;
  category: string;
  date: string;
  note: string;
}

export type NewManualTransaction = Omit<
  ManualTransaction,
  'id' | 'source'
>;

@Injectable({
  providedIn: 'root',
})
export class ManualTransactionsService {

  private readonly storageKey =
    'smartmoney-manual-transactions-v1';

  // Retrieve saved manual transactions
  getAll(): ManualTransaction[] {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const stored = window.localStorage.getItem(
        this.storageKey
      );

      if (!stored) {
        return [];
      }

      const transactions: unknown = JSON.parse(stored);

      if (!Array.isArray(transactions)) {
        return [];
      }

      return transactions.filter(
        (item): item is ManualTransaction =>
          item !== null &&
          typeof item === 'object' &&
          typeof item.id === 'string' &&
          item.source === 'cash' &&
          (item.type === 'income' ||
            item.type === 'expense') &&
          typeof item.assetId === 'string' &&
          typeof item.amount === 'number' &&
          Number.isFinite(item.amount) &&
          item.amount > 0 &&
          typeof item.category === 'string' &&
          typeof item.date === 'string' &&
          typeof item.note === 'string'
      );
    } catch {
      return [];
    }
  }

  // Save a new manual cash transaction
  add(
    input: NewManualTransaction
  ): ManualTransaction {

    if (
      !Number.isFinite(input.amount) ||
      input.amount <= 0 ||
      Math.abs(
        input.amount * 100 - Math.round(input.amount * 100)
        ) > 1e-7
    ) {
      throw new Error(
        'Enter a valid amount with up to two decimal places.'
      );
    }

    const transaction: ManualTransaction = {
      ...input,
      id: crypto.randomUUID(),
      source: 'cash',
    };

    const transactions = [
      transaction,
      ...this.getAll(),
    ];

    if (typeof window === 'undefined') {
      throw new Error('Browser storage is unavailable.');
    }

    try {
      window.localStorage.setItem(
        this.storageKey,
        JSON.stringify(transactions)
      );
    } catch {
      throw new Error(
        'Could not save the transaction on this device.'
      );
    }

    return transaction;
  }
}
