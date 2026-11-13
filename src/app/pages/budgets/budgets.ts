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
  type AllocationOverview,
  type GroupSpending,
} from '../../core/services/budgets-api.service';

import {
  BUDGET_CATEGORIES,
  type BudgetGroup,
} from '../../core/constants/financial-categories';

export type BudgetStatus = 'safe' | 'warning' | 'danger';

interface BudgetForm {
  budgetGroup: BudgetGroup | '';
  category: string;
  otherCategory: string;
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

  get categories(): readonly string[] {
    const group = this.budgetForm.budgetGroup;

    return group
      ? BUDGET_CATEGORIES[group]
      : [];
  }

onBudgetGroupChange(): void {
  this.budgetForm.category =
    this.budgetForm.budgetGroup === 'SAVINGS'
      ? 'Savings'
      : '';

  this.budgetForm.otherCategory = '';
}

  budgets: BudgetRecord[] = [];
  groupSpending: GroupSpending | null = null;
  allocation: AllocationOverview | null = null;
  allocationError = '';

  showAllocationEditor = false;
allocationSaving = false;
allocationFormError = '';

allocationForm: {
  availableMoney: number | null;
  needsPercent: number;
  wantsPercent: number;
  savingsPercent: number;
} = {
  availableMoney: null,
  needsPercent: 55,
  wantsPercent: 20,
  savingsPercent: 25,
};

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
  if (
    this.isLoading ||
    this.saving ||
    this.allocationSaving
  ) {
    return;
  }

  this.showAllocationEditor = false;

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
  this.allocationError = '';
  this.allocation = null;

  try {
    const [budgetResult, allocationResult] =
      await Promise.allSettled([
        firstValueFrom(
          this.budgetsApi.getBudgetOverview(month)
        ),
        firstValueFrom(
          this.budgetsApi.getAllocation(month)
        ),
      ]);

    if (requestId !== this.loadRequestId) {
      return;
    }

    if (budgetResult.status === 'fulfilled') {
      this.budgets = budgetResult.value.budgets;
      this.groupSpending = budgetResult.value.groupSpending;
    } else {
      this.budgets = [];
      this.groupSpending = null;
      this.loadError =
        'Unable to load budgets. Please try again.';
    }

    if (allocationResult.status === 'fulfilled') {
      this.allocation = allocationResult.value;
    } else {
      this.allocationError =
        'Unable to load allocation targets.';
    }
  } finally {
    if (requestId === this.loadRequestId) {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }
}

openAllocationEditor(): void {
  if (this.isLoading || this.allocationSaving) {
    return;
  }

  this.allocationForm = {
    availableMoney: this.allocation?.availableMoney ?? null,
    needsPercent: this.allocation?.percentages.NEEDS ?? 55,
    wantsPercent: this.allocation?.percentages.WANTS ?? 20,
    savingsPercent: this.allocation?.percentages.SAVINGS ?? 25,
  };

  this.allocationFormError = '';
  this.showAllocationEditor = true;
}

cancelAllocationEditor(): void {
  if (this.allocationSaving) {
    return;
  }

  this.showAllocationEditor = false;
  this.allocationFormError = '';
}

async saveAllocation(): Promise<void> {
  if (this.allocationSaving) {
    return;
  }

  const {
    availableMoney,
    needsPercent,
    wantsPercent,
    savingsPercent,
  } = this.allocationForm;

  if (
    typeof availableMoney !== 'number' ||
    !Number.isFinite(availableMoney) ||
    availableMoney < 0 ||
    availableMoney > 999999999999.99
  ) {
    this.allocationFormError =
      'Enter a valid available-money amount.';
    return;
  }

  if (
    Math.abs(
      availableMoney * 100 -
      Math.round(availableMoney * 100)
    ) > 0.000001
  ) {
    this.allocationFormError =
      'Available money must have no more than two decimal places.';
    return;
  }

  const percentages = [
    needsPercent,
    wantsPercent,
    savingsPercent,
  ];

  if (
    percentages.some(
      value =>
        !Number.isInteger(value) ||
        value < 0 ||
        value > 100
    )
  ) {
    this.allocationFormError =
      'Each percentage must be a whole number between 0 and 100.';
    return;
  }

  if (
    needsPercent +
    wantsPercent +
    savingsPercent !== 100
  ) {
    this.allocationFormError =
      'Needs, Wants and Savings must add up to 100%.';
    return;
  }

  this.allocationSaving = true;
  this.allocationFormError = '';

  const month = this.selectedMonth;

  try {
    const updated = await firstValueFrom(
      this.budgetsApi.saveAllocation(
        {
          availableMoney,
          needsPercent,
          wantsPercent,
          savingsPercent,
        },
        month
      )
    );

    if (month === this.selectedMonth) {
      this.allocation = updated;
      this.allocationError = '';
      this.showAllocationEditor = false;
    }
  } catch (error: unknown) {
    this.allocationFormError =
      error instanceof HttpErrorResponse &&
      typeof error.error?.error === 'string'
        ? error.error.error
        : 'Unable to save allocation. Please try again.';
  } finally {
    this.allocationSaving = false;
    this.cdr.markForCheck();
  }
}

getGroupOverAllocation(group: BudgetGroup): number {
  const target = this.getTargetForGroup(group);

  if (target === null) {
    return 0;
  }

  const planned = this.getTotalForGroup(group);

  return Math.max(
    0,
    Math.round((planned - target) * 100) / 100
  );
}

getOverallOverAllocation(): number {
  const availableMoney = this.allocation?.availableMoney;

  if (
    availableMoney === null ||
    availableMoney === undefined
  ) {
    return 0;
  }

  const totalPlanned = this.budgets.reduce(
    (total, budget) => total + budget.monthlyLimit,
    0
  );

  return Math.max(
    0,
    Math.round(
      (totalPlanned - availableMoney) * 100
    ) / 100
  );
}

get availableMoneyDisplay(): string {
  const amount = this.allocation?.availableMoney;

  return amount === null || amount === undefined
    ? 'Not configured'
    : this.formatCurrency(amount);
}

private emptyForm(): BudgetForm {
  return {
    budgetGroup: '',
    category: '',
    otherCategory: '',
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

  const isCustomOther =
    budget.category.startsWith('Other - ');

  this.budgetForm = {
    budgetGroup: budget.budgetGroup ?? '',
    category: isCustomOther ? 'Other' : budget.category,
    otherCategory: isCustomOther
      ? budget.category.slice('Other - '.length)
      : '',
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

  const budgetGroup = this.budgetForm.budgetGroup;
    if (!budgetGroup) {
      this.formError =
        'Please select Needs, Wants or Savings.';
      return;
    }
  const selectedCategory = this.budgetForm.category;
  let category = selectedCategory;
  const monthlyLimit = this.budgetForm.monthlyLimit;

  if (!this.categories.includes(selectedCategory)) {
    this.formError = 'Please select a valid category.';
    return;
  }

  if (selectedCategory === 'Other') {
    const specific = this.budgetForm.otherCategory.trim();

    if (
      !specific ||
      specific.length > 72 ||
      /[\x00-\x1f\x7f]/.test(specific)
    ) {
      this.formError =
        'Please specify a valid category (1–72 characters).';
      return;
    }

    category = `Other - ${specific}`;
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
        budgetGroup,
      };

    await firstValueFrom(
      this.editingBudgetId
        ? this.budgetsApi.updateBudget(
            this.editingBudgetId,
            payload,
            this.selectedMonth
          )
        : this.budgetsApi.createBudget(
            payload,
            this.selectedMonth
          )
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

  readonly budgetColumns = [
  { id: 'NEEDS', title: 'Needs' },
  { id: 'WANTS', title: 'Wants' },
  { id: 'SAVINGS', title: 'Savings' },
] as const;

getBudgetsForGroup(
  group: BudgetGroup
): BudgetRecord[] {
  return this.budgets.filter(
    budget => budget.budgetGroup === group
  );
}

getTotalForGroup(
  group: BudgetGroup | 'SAVINGS'
): number {
  return this.getBudgetsForGroup(group).reduce(
    (total, budget) => total + budget.monthlyLimit,
    0
  );
}

get unassignedBudgets(): BudgetRecord[] {
  return this.budgets.filter(
    budget => budget.budgetGroup === null
  );
}

getTargetForGroup(group: BudgetGroup): number | null {
  return this.allocation?.targets?.[group] ?? null;
}

getAllocationPercentage(group: BudgetGroup): number {
  return this.allocation?.percentages[group] ?? 0;
}

get allocationPercentageTotal(): number | null {
  const values = [
    this.allocationForm.needsPercent,
    this.allocationForm.wantsPercent,
    this.allocationForm.savingsPercent,
  ];

  if (
    !values.every(
      value =>
        typeof value === 'number' &&
        Number.isFinite(value)
    )
  ) {
    return null;
  }

  return values.reduce(
    (total, value) => total + value,
    0
  );
}

}
