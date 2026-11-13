
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { ActivityPage } from './activity';
import { CashTransactionsApiService } from '../../core/services/cash-transactions-api.service';
import { BankAccountsApiService } from '../../core/bank/bank-accounts-api.service';

describe('ActivityPage currency formatting', () => {
  it('preserves bank currency and formats amounts correctly', async () => {
    await TestBed.configureTestingModule({
      imports: [ActivityPage],
      providers: [
        provideRouter([]),
        {
          provide: CashTransactionsApiService,
          useValue: {
            getTransactions: () => of([]),
          },
        },
        {
          provide: BankAccountsApiService,
          useValue: {
            getAllTransactions: () =>
              of([
                {
                  id: 'test-usd-transaction',
                  description: 'Foreign currency test',
                  category: 'Shopping',
                  amount: -50,
                  currency: 'USD',
                  transactionDate: '2026-11-04',
                },
              ]),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ActivityPage);
    const page = fixture.componentInstance;

    // No detectChanges(): prevents automatic ngOnInit.
    await page.loadManualTransactions();

    expect(page.bankTransactions).toHaveLength(1);
    expect(page.bankTransactions[0].currency).toBe('USD');

    // Normalize locale-specific spaces for stable assertions.
    const normalize = (value: string) =>
      value.replace(/\s+/g, ' ');

    expect(normalize(page.formatAmount(-50, 'NZD')))
      .toBe('-NZD 50.00');

    expect(normalize(page.formatAmount(-50, 'USD')))
      .toBe('-USD 50.00');

    expect(normalize(page.formatAmount(100, 'AUD')))
      .toBe('+AUD 100.00');
  });
});
