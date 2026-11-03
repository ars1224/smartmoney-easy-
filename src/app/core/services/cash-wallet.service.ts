
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import {
  CashWalletApiService,
  CashWalletRecord,
} from './cash-wallet-api.service';

export type CashWallet = CashWalletRecord;

@Injectable({
  providedIn: 'root',
})
export class CashWalletService {
  private readonly walletApi = inject(CashWalletApiService);

  private readonly walletsState = signal<CashWallet[]>([]);

  readonly wallets = this.walletsState.asReadonly();

  // Fetch the authenticated user's wallets from Flask.
  loadWallets(): Observable<CashWallet[]> {
    return this.walletApi.getWallets().pipe(
      tap(wallets => {
        this.walletsState.set(wallets);
      })
    );
  }

  // Retrieve wallets already loaded from PostgreSQL.
  getWallets(): CashWallet[] {
    return this.walletsState();
  }

  getWalletById(id: string): CashWallet | undefined {
    return this.walletsState().find(
      wallet => wallet.id === id
    );
  }

  // The backend calculates balances using PostgreSQL
  // income and expense transactions.
  getBalance(walletId: string): number {
    const wallet = this.getWalletById(walletId);

    if (!wallet) {
      throw new Error('Cash wallet not found.');
    }

    return wallet.currentBalance;
  }

  clearWallets(): void {
    this.walletsState.set([]);
  }
}
