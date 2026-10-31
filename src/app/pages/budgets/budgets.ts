import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { HttpErrorResponse } from '@angular/common/http';

import {
  BudgetRecord,
  BudgetsApiService,
} from '../../core/services/budgets-api.service';

export type BudgetStatus = 'safe' | 'warning' | 'danger';



interface BudgetForm {
  category: string;
  monthlyLimit: number | null;
}

@Component({
  selector: 'app-budgets',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './budgets.html',
  styleUrl: './budgets.scss',
})
export class BudgetsPage implements OnInit {
  private readonly budgetsApi = inject(BudgetsApiService);
  private readonly cdr = inject(ChangeDetectorRef);

  @ViewChild('budgetDialog')
  private budgetDialog?: ElementRef<HTMLDialogElement>;

  readonly categories = [
    'Groceries',
    'Transport',
    'Entertainment',
    'Shopping',
    'Bills',
    'Eating out',
    'Other',
  ];

  budgets: BudgetRecord[] = [];


  selectedMonth = this.getCurrentNzMonth();

  private loadRequestId = 0;

  get selectedMonthLabel(): string {
    const [year, month] = this.selectedMonth
      .split('-')
      .map(Number);

    return new Intl.DateTimeFormat('en-NZ', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(
      new Date(Date.UTC(year, month - 1, 15))
    );
  }

  get isCurrentMonth(): boolean {
    return this.selectedMonth >= this.getCurrentNzMonth();
  }


  isLoading = true;
  loadError = '';
  formError = '';
  saving = false;

  editingBudgetId: string | null = null;

  budgetForm: BudgetForm = this.emptyForm();

  ngOnInit(): void {
    void this.loadBudgets();
  }


private getCurrentNzMonth(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find(
    part => part.type === 'year'
  )?.value;

  const month = parts.find(
    part => part.type === 'month'
  )?.value;

  return `${year}-${month}`;
}

changeMonth(direction: -1 | 1): void {
  if (this.isLoading || this.saving) return;

  const [year, month] = this.selectedMonth
    .split('-')
    .map(Number);

  const targetDate = new Date(
    Date.UTC(year, month - 1 + direction, 1)
  );

  const targetMonth =
    `${targetDate.getUTCFullYear()}-` +
    `${String(targetDate.getUTCMonth() + 1).padStart(2, '0')}`;

  if (
    targetMonth > this.getCurrentNzMonth() ||
    targetDate.getUTCFullYear() < 1
  ) {
    return;
  }

  this.selectedMonth = targetMonth;
  void this.loadBudgets();
}




async loadBudgets(): Promise<void> {
  const requestId = ++this.loadRequestId;
  const month = this.selectedMonth;

  this.isLoading = true;
  this.loadError = '';

  try {
    const budgets = await firstValueFrom(
      this.budgetsApi.getBudgets(month)
    );

    if (requestId !== this.loadRequestId) {
      return;
    }

    this.budgets = budgets;

  } catch {
    if (requestId !== this.loadRequestId) {
      return;
    }

    this.loadError =
      'Unable to load budgets. Please try again.';

  } finally {
    if (requestId === this.loadRequestId) {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }
}



  private emptyForm(): BudgetForm {
    return {
      category: '',
      monthlyLimit: null,
    };
  }

  openCreateDialog(): void {
    if (this.saving) return;

    this.editingBudgetId = null;
    this.budgetForm = this.emptyForm();
    this.formError = '';

    this.budgetDialog?.nativeElement.showModal();
  }

  openEditDialog(budget: BudgetRecord): void {
    if (this.saving) return;

    this.editingBudgetId = budget.id;

    this.budgetForm = {
      category: budget.category,
      monthlyLimit: budget.monthlyLimit,
    };

    this.formError = '';

    this.budgetDialog?.nativeElement.showModal();
  }

  closeBudgetDialog(): void {
    if (this.saving) return;

    this.budgetDialog?.nativeElement.close();
    this.editingBudgetId = null;
    this.formError = '';
    this.budgetForm = this.emptyForm();
  }

  onDialogCancel(event: Event): void {
    if (this.saving) {
      event.preventDefault();
      return;
    }

    this.closeBudgetDialog();
  }

  get isEditing(): boolean {
    return this.editingBudgetId !== null;
  }

  async saveBudget(): Promise<void> {
    if (this.saving) return;

    this.formError = '';

    const category = this.budgetForm.category;
    const monthlyLimit = this.budgetForm.monthlyLimit;

    if (!this.categories.includes(category)) {
      this.formError = 'Please select a valid category.';
      return;
    }

    if (
      monthlyLimit === null ||
      !Number.isFinite(monthlyLimit) ||
      monthlyLimit <= 0 ||
      monthlyLimit > 999999999999.99
    ) {
      this.formError =
        'Enter a valid monthly limit greater than zero.';
      return;
    }

    if (
      Math.abs(
        monthlyLimit - Number(monthlyLimit.toFixed(2))
      ) > 1e-9
    ) {
      this.formError =
        'Monthly limits cannot exceed two decimal places.';
      return;
    }

    const duplicate = this.budgets.some(
      budget =>
        budget.category === category &&
        budget.id !== this.editingBudgetId
    );

    if (duplicate) {
      this.formError =
        'A budget for this category already exists.';
      return;
    }

    this.saving = true;

    try {
      const payload = {
        category,
        monthlyLimit,
      };


      await firstValueFrom(
        this.editingBudgetId
          ? this.budgetsApi.updateBudget(
              this.editingBudgetId,
              payload
            )
          : this.budgetsApi.createBudget(payload)
      );

      this.budgetDialog?.nativeElement.close();
      this.editingBudgetId = null;
      this.budgetForm = this.emptyForm();

      // Reload budgets for the currently selected month.
      await this.loadBudgets();

    } catch (error: unknown) {
      this.formError =
        error instanceof HttpErrorResponse &&
        typeof error.error?.error === 'string'
          ? error.error.error
          : 'Unable to save budget. Please try again.';

    } finally {
      this.saving = false;
      this.cdr.markForCheck();
    }
  }

  getPercentage(budget: BudgetRecord): number {
    if (budget.monthlyLimit <= 0) return 0;

    return Math.max(
      0,
      (budget.spent / budget.monthlyLimit) * 100
    );
  }

  getProgressWidth(budget: BudgetRecord): number {
    return Math.min(this.getPercentage(budget), 100);
  }

  getBudgetStatus(budget: BudgetRecord): BudgetStatus {
    const percentage = this.getPercentage(budget);

    if (percentage >= 90) return 'danger';
    if (percentage >= 75) return 'warning';

    return 'safe';
  }

  getRemainingAmount(budget: BudgetRecord): number {
    return Math.max(
      0,
      budget.monthlyLimit - budget.spent
    );
  }

  get alertBudget(): BudgetRecord | null {
    const attention = this.budgets
      .filter(budget => this.getPercentage(budget) >= 90)
      .sort(
        (a, b) =>
          this.getPercentage(b) - this.getPercentage(a)
      );

    return attention[0] ?? null;
  }

  get alertMessage(): string {
    const budget = this.alertBudget;

    if (!budget) {
      return this.budgets.length === 0
        ? 'Create your first budget to track spending.'
        : 'Your budgets are currently within their limits.';
    }

    if (budget.spent >= budget.monthlyLimit) {
      return `${budget.category} has reached or exceeded its monthly limit. Review your spending.`;
    }

    return `${budget.category} is close to its monthly limit. Review your spending before making another purchase.`;
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: 'NZD',
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  }


}
