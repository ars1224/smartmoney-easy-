
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


getById(id: string): ManualTransaction | undefined {
  return this.getAll().find(
    transaction => transaction.id === id
  );
}


update(
  id: string,
  input: NewManualTransaction
): ManualTransaction {

  const transactions = this.getAll();

  const index = transactions.findIndex(
    transaction => transaction.id === id
  );

  if (index === -1) {
    throw new Error('Transaction not found.');
  }

  // Validate the amount
  if (
    !Number.isFinite(input.amount) ||
    input.amount <= 0 ||
    Math.abs(
      input.amount * 100 - Math.round(input.amount * 100)
    ) > 1e-7
  ) {
    throw new Error('Enter a valid transaction amount.');
  }

  // Validate required fields
  if (
    (input.type !== 'income' && input.type !== 'expense') ||
    !input.assetId.trim() ||
    !input.category.trim() ||
    !input.date.trim() ||
    input.note.length > 250
  ) {
    throw new Error('Invalid transaction details.');
  }

  const updatedTransaction: ManualTransaction = {
    ...transactions[index],
    ...input,
    id,
    source: 'cash'
  };

  transactions[index] = updatedTransaction;

  if (typeof window === 'undefined') {
    throw new Error('Browser storage is unavailable.');
  }

  try {
    window.localStorage.setItem(
      this.storageKey,
      JSON.stringify(transactions)
    );
  } catch {
    throw new Error('Unable to update transaction.');
  }

  return updatedTransaction;
}


remove(id: string): boolean {

  const transactions = this.getAll();

  const remainingTransactions = transactions.filter(
    transaction => transaction.id !== id
  );

  // Transaction does not exist
  if (remainingTransactions.length === transactions.length) {
    return false;
  }

  if (typeof window === 'undefined') {
    throw new Error('Browser storage is unavailable.');
  }

  try {
    window.localStorage.setItem(
      this.storageKey,
      JSON.stringify(remainingTransactions)
    );
  } catch {
    throw new Error('Unable to delete transaction.');
  }

  return true;
}

}
