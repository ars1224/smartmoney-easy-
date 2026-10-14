
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

type TransactionSource = 'cash' | 'bank';
type SourceFilter = 'all' | TransactionSource;

interface Transaction {
  id: number;
  description: string;
  source: TransactionSource;
  category: string;
  amount: number;
}

@Component({
  selector: 'app-activity',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './activity.html',
  styleUrl: './activity.scss',
})
export class Activity {

  // Currently selected transaction source
  selectedSource: SourceFilter = 'all';

  // Temporary data for frontend development
  transactions: Transaction[] = [
    {
      id: 1,
      description: 'Fresh Choice',
      source: 'bank',
      category: 'Groceries',
      amount: -84.20
    },
    {
      id: 2,
      description: 'Bus fare',
      source: 'cash',
      category: 'Transport',
      amount: -4.00
    },
    {
      id: 3,
      description: 'Salary',
      source: 'bank',
      category: 'Income',
      amount: 1400.00
    },
    {
      id: 4,
      description: 'Coffee',
      source: 'cash',
      category: 'Eating out',
      amount: -5.50
    }
  ];

  // Filter the transactions by source
  get filteredTransactions(): Transaction[] {
    if (this.selectedSource === 'all') {
      return this.transactions;
    }

    return this.transactions.filter(
      transaction => transaction.source === this.selectedSource
    );
  }

  // Update the selected filter
  changeSource(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;

    if (value === 'all' || value === 'cash' || value === 'bank') {
      this.selectedSource = value;
    }
  }

  // Format amounts as NZD
  formatAmount(amount: number): string {
    const formatted = Math.abs(amount).toLocaleString('en-NZ', {
      style: 'currency',
      currency: 'NZD',
      currencyDisplay: 'narrowSymbol'
    });

    return `${amount >= 0 ? '+' : '-'}${formatted}`;
  }
}
