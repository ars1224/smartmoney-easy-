
import { Injectable, inject } from '@angular/core';

import {
  ManualTransactionsService
} from './manual-transactions.service';

export interface CashWallet {
  id: string;
  name: string;
  currency: string;
  openingBalance: number;
}

@Injectable({
  providedIn: 'root'
})
export class CashWalletService {

  private readonly manualTransactions =
    inject(ManualTransactionsService);

  // Temporary Cash wallet for MVP development.
  // Opening balances will eventually come from
  // the user's saved wallets in the Flask backend.
  private readonly wallets: CashWallet[] = [
    {
      id: 'nzd-cash',
      name: 'NZD Cash',
      currency: 'NZD',
      openingBalance: 0
    }
  ];

  // Retrieve available Cash wallets
  getWallets(): CashWallet[] {
    return [...this.wallets];
  }

  // Find a specific Cash wallet
  getWalletById(id: string): CashWallet | undefined {
    return this.wallets.find(wallet => wallet.id === id);
  }

  // Calculate the wallet's balance from its transactions
  getBalance(walletId: string): number {

    const wallet = this.getWalletById(walletId);

    if (!wallet) {
      throw new Error('Cash wallet not found.');
    }

    const transactions = this.manualTransactions
      .getAll()
      .filter(transaction => transaction.assetId === walletId);

    // Work in cents to avoid floating-point errors
    const openingCents = Math.round(
      wallet.openingBalance * 100
    );

    const transactionCents = transactions.reduce(
      (total, transaction) => {

        const amountCents = Math.round(
          transaction.amount * 100
        );

        return transaction.type === 'income'
          ? total + amountCents
          : total - amountCents;

      },
      0
    );

    return (openingCents + transactionCents) / 100;
  }
}
