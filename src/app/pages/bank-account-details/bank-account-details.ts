
import {
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import {
  BankAccountsApiService,
  ConnectedBankAccount,
  BankAccountTransaction,
} from '../../core/bank/bank-accounts-api.service';

@Component({
  selector: 'app-bank-account-details',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    RouterLink,
  ],
  templateUrl: './bank-account-details.html',
  styleUrls: ['./bank-account-details.scss'],
})
export class BankAccountDetailsPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly bankApi = inject(BankAccountsApiService);

  readonly account = signal<ConnectedBankAccount | null>(null);
  readonly transactions = signal<BankAccountTransaction[]>([]);

  readonly loading = signal(false);
  readonly error = signal('');

  ngOnInit(): void {
    void this.loadDetails();
  }

  async loadDetails(): Promise<void> {
    if (this.loading()) return;

    const accountId = this.route.snapshot.paramMap.get('accountId');

    if (!accountId) {
      this.error.set('Bank account ID is missing.');
      return;
    }

    this.loading.set(true);
    this.error.set('');
    this.account.set(null);
    this.transactions.set([]);

    try {
      // Fetch the currently connected accounts.
      const accounts = await firstValueFrom(
        this.bankApi.getAccounts()
      );

      // Select the account requested by the route.
      const selectedAccount = accounts.find(
        account => account.id === accountId
      );

      if (!selectedAccount) {
        this.error.set(
          'This bank account was not found or is no longer connected.'
        );
        return;
      }

      this.account.set(selectedAccount);

      // Retrieve saved transactions from PostgreSQL.
      const transactions = await firstValueFrom(
        this.bankApi.getTransactions(accountId)
      );

      this.transactions.set(transactions);
    } catch {
      this.error.set(
        'Unable to load bank account details. Please try again.'
      );
    } finally {
      this.loading.set(false);
    }
  }
}
