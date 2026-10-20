import { Component, ElementRef, ViewChild } from '@angular/core';

export type BudgetStatus = 'safe' | 'warning' | 'danger';

export interface Budget {
  id: string;
  category: string;
  limit: number;
  spent: number;
}



@Component({
  selector: 'app-budgets',
  standalone: true,
  imports: [],
  templateUrl: './budgets.html',
  styleUrl: './budgets.scss',
})
export class BudgetsPage {

  // Temporary budgets for frontend development.
  // These will eventually come from the Flask API.
  readonly budgets: Budget[] = [
    {
      id: 'budget-1',
      category: 'Groceries',
      limit: 500,
      spent: 420
    },
    {
      id: 'budget-2',
      category: 'Transport',
      limit: 250,
      spent: 160
    },
    {
      id: 'budget-3',
      category: 'Entertainment',
      limit: 160,
      spent: 145
    }
  ];

  // Calculate the percentage of the budget used.
  getPercentage(budget: Budget): number {
    if (budget.limit <= 0) {
      return 0;
    }

    return Math.max(
      0,
      (budget.spent / budget.limit) * 100
    );
  }

  // Prevent progress bars from extending past 100%.
  getProgressWidth(budget: Budget): number {
    return Math.min(
      this.getPercentage(budget),
      100
    );
  }

  // Determine the budget's status.
  getBudgetStatus(budget: Budget): BudgetStatus {
    const percentage = this.getPercentage(budget);

    if (percentage >= 90) {
      return 'danger';
    }

    if (percentage >= 75) {
      return 'warning';
    }

    return 'safe';
  }

  // Calculate the remaining amount.
  getRemainingAmount(budget: Budget): number {
    return Math.max(
      0,
      budget.limit - budget.spent
    );
  }

  // Identify the budget that needs most attention.
  get alertBudget(): Budget | null {
    const budgetsNeedingAttention = this.budgets
      .filter(budget => this.getPercentage(budget) >= 90)
      .sort(
        (a, b) =>
          this.getPercentage(b) - this.getPercentage(a)
      );

    return budgetsNeedingAttention[0] ?? null;
  }

  // Generate an automatic budget alert.
  get alertMessage(): string {
    const budget = this.alertBudget;

    if (!budget) {
      return 'Your budgets are currently within their limits.';
    }

    if (budget.spent >= budget.limit) {
      return `${budget.category} has reached or exceeded its monthly limit. Review your spending.`;
    }

    return `${budget.category} is close to its monthly limit. Review your spending before making another purchase.`;
  }

  // Format monetary values in NZD.
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: 'NZD',
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount);
  }


@ViewChild('budgetDialog')
private budgetDialog?: ElementRef<HTMLDialogElement>;

openBudgetDialog(): void {
  this.budgetDialog?.nativeElement.showModal();
}

closeBudgetDialog(): void {
  this.budgetDialog?.nativeElement.close();
}

}
