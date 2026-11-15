
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectorRef,
  Component,
  OnInit,
  computed,
  inject,
  signal
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  SavingsGoalsService,
  type GoalGroup,
  type GoalFundingAllocation,
  type GoalFundingHistory,
  type GoalFundingSource,
  type SavingsFundingSummary,
} from '../../core/savings/savings-goals.service';

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  savedAmount: number;
  legacyUnverifiedAmount?: number;
  targetDate: string;
  createdAt: string;
  group: GoalGroup;
  spentAmount: number;
  achievedAt: string | null;
}

interface SavingsGoalForm {
  name: string;
  group: GoalGroup;
  targetAmount: number | null;
  targetDate: string;
}

type FundingAction = 'ALLOCATE' | 'RELEASE';

type GoalFilter = 'ALL' | GoalGroup;

@Component({
  selector: 'app-savings-goals',
  imports: [CommonModule, FormsModule],
  templateUrl: './savings-goals.html',
  styleUrl: './savings-goals.scss',
})
export class SavingsGoalsPage implements OnInit {
  private readonly savingsApi = inject(SavingsGoalsService);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly loading = signal(true);
  readonly fundingSummary = signal<SavingsFundingSummary | null>(null);
  readonly fundingLoading = signal(true);
  readonly fundingError = signal(false);

  readonly linkedSavingsLabel = computed(() => {
    const balance = this.fundingSummary()?.linkedSavingsBalance;

    return balance === null || balance === undefined
      ? 'Unavailable'
      : this.formatCurrency(balance);
  });
  readonly pageError = signal('');
  readonly goals = signal<SavingsGoal[]>([]);

  readonly activeFilter = signal<GoalFilter>('ALL');

  readonly goalFilters: ReadonlyArray<{
    label: string;
    value: GoalFilter;
  }> = [
    { label: 'All', value: 'ALL' },
    { label: 'Needs', value: 'NEEDS' },
    { label: 'Wants', value: 'WANTS' },
    { label: 'Savings', value: 'SAVINGS' },
  ];

  readonly filteredGoals = computed(() => {
    const selected = this.activeFilter();

    if (selected === 'ALL') {
      return this.goals();
    }

    return this.goals().filter(
      goal => goal.group === selected
    );
  });

  readonly totalTarget = computed(() =>
    this.goals().reduce((sum, goal) => sum + goal.targetAmount, 0)
  );

  readonly totalSaved = computed(() =>
    this.goals().reduce((sum, goal) => sum + goal.savedAmount, 0)
  );

  readonly totalProgressAmount = computed(() =>
    this.goals().reduce(
      (sum, goal) =>
        sum + Math.min(
          goal.targetAmount,
          goal.savedAmount + goal.spentAmount
        ),
      0
    )
  );

  readonly completedGoals = computed(() =>
    this.goals().filter(goal => goal.achievedAt !== null).length
  );

  readonly overallProgress = computed(() => {
    const target = this.totalTarget();

    if (target <= 0) {
      return 0;
    }

    return Math.min(
      100,
      Math.round((this.totalProgressAmount() / target) * 100)
    );
  });

  readonly today = this.getLocalDate();

  showGoalForm = false;
  editingGoalId: string | null = null;
  goalFormError = '';
  savingGoal = false;

  goalForm: SavingsGoalForm = this.emptyGoalForm();

  showFundingForm = false;
  fundingGoal: SavingsGoal | null = null;

  fundingAction: FundingAction = 'ALLOCATE';
  fundingAmount: number | null = null;
  fundingSelectedSourceKey = '';

  fundingSources: GoalFundingSource[] = [];
  fundingHistory: GoalFundingHistory | null = null;

  fundingFormLoading = false;
  fundingBusy = false;
  fundingFormError = '';

  private fundingLoadVersion = 0;
  private fundingRequestId: string | null = null;
  private fundingRequestFingerprint = '';

  goalToDelete: SavingsGoal | null = null;
  deletingGoal = false;
  deleteError = '';
  goalToAchieve: SavingsGoal | null = null;
  achievingGoal = false;
  achieveError = '';

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.loadGoals(),
      this.loadFundingSummary(),
    ]);
  }

  async loadGoals(): Promise<void> {
    this.loading.set(true);
    this.pageError.set('');

    try {
      const goals = await firstValueFrom(
        this.savingsApi.getGoals()
      );

      this.goals.set(goals);
    } catch {
      this.pageError.set(
        'Unable to load savings goals. Check your connection and try again.'
      );
    } finally {
      this.loading.set(false);
    }
  }
  private emptyGoalForm(): SavingsGoalForm {
    return {
      name: '',
      group: 'SAVINGS',
      targetAmount: null,
      targetDate: '',
    };
  }
  private getLocalDate(): string {
    const date = new Date();

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  get isEditingGoal(): boolean {
    return this.editingGoalId !== null;
  }

  openCreateGoal(): void {
    this.editingGoalId = null;
    this.goalForm = this.emptyGoalForm();
    this.goalFormError = '';
    this.showGoalForm = true;
  }

  openEditGoal(goal: SavingsGoal): void {
    this.editingGoalId = goal.id;

    this.goalForm = {
      name: goal.name,
      group: goal.group,
      targetAmount: goal.targetAmount,
      targetDate: goal.targetDate,
    };

    this.goalFormError = '';
    this.showGoalForm = true;
  }

  closeGoalForm(): void {
    this.showGoalForm = false;
    this.editingGoalId = null;
    this.goalFormError = '';
  }

  async saveGoal(): Promise<void> {
    if (this.savingGoal) return;

    this.goalFormError = '';

    const name = this.goalForm.name.trim();
    const targetAmount = this.goalForm.targetAmount;
    const targetDate = this.goalForm.targetDate;

    if (!name || name.length > 80) {
      this.goalFormError =
        'Goal name must contain 1–80 characters.';
      return;
    }

    if (
      targetAmount === null ||
      !Number.isFinite(targetAmount) ||
      targetAmount <= 0
    ) {
      this.goalFormError =
        'Target amount must be greater than zero.';
      return;
    }

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(targetDate) ||
      Number.isNaN(new Date(`${targetDate}T00:00:00`).getTime())
    ) {
      this.goalFormError =
        'Please select a valid target date.';
      return;
    }

    const hasMoreThanTwoDecimals = (value: number): boolean =>
      Math.abs(value - Number(value.toFixed(2))) > 1e-9;

    if (hasMoreThanTwoDecimals(targetAmount)) {
      this.goalFormError =
        'Amounts cannot have more than two decimal places.';
      return;
    }

    const payload = {
      name,
      group: this.goalForm.group,
      targetAmount,
      targetDate,
    };

  this.savingGoal = true;
    try {
      const savedGoal = await firstValueFrom(
        this.editingGoalId
          ? this.savingsApi.updateGoal(this.editingGoalId, payload)
          : this.savingsApi.createGoal(payload)
      );

      if (this.editingGoalId) {
        this.goals.update(current =>
          current.map(goal =>
            goal.id === savedGoal.id ? savedGoal : goal
          )
        );
      } else {
        this.goals.update(current => [
          savedGoal,
          ...current,
        ]);
      }

      this.closeGoalForm();

    } catch (error: unknown) {
      this.goalFormError =
        error instanceof HttpErrorResponse &&
        typeof error.error?.error === 'string'
          ? error.error.error
          : 'Unable to save your savings goal. Please try again.';

    } finally {
      this.savingGoal = false;
    }
  }

async openFunding(goal: SavingsGoal): Promise<void> {
  if (this.fundingBusy) {
    return;
  }

  this.fundingGoal = goal;
  this.showFundingForm = true;

  this.fundingAction = 'ALLOCATE';
  this.fundingAmount = null;
  this.fundingSelectedSourceKey = '';

  this.fundingSources = [];
  this.fundingHistory = null;

  this.fundingFormError = '';
  this.fundingFormLoading = true;

  this.fundingRequestId = null;
  this.fundingRequestFingerprint = '';

  const version = ++this.fundingLoadVersion;

  try {
    const [sources, history] = await Promise.all([
      firstValueFrom(
        this.savingsApi.getFundingSources()
      ),
      firstValueFrom(
        this.savingsApi.getGoalFundingHistory(goal.id)
      ),
    ]);

    if (version !== this.fundingLoadVersion) {
      return;
    }

    this.fundingSources = sources;
    this.fundingHistory = history;

    const firstAvailable =
      this.availableFundingSources()[0];

    if (firstAvailable) {
      this.fundingSelectedSourceKey =
        this.fundingKey(firstAvailable);
    }

  } catch (error: unknown) {
    if (version !== this.fundingLoadVersion) {
      return;
    }

    this.fundingFormError = this.getFundingError(
      error,
      'Unable to load funding information.'
    );

  } finally {
    if (version === this.fundingLoadVersion) {
      this.fundingFormLoading = false;

      // Notify Angular that the modal state changed.
      this.cdr.markForCheck();
    }
  }
}

closeFunding(): void {
  if (this.fundingBusy) return;

  ++this.fundingLoadVersion;

  this.showFundingForm = false;
  this.fundingGoal = null;

  this.fundingSources = [];
  this.fundingHistory = null;

  this.fundingAmount = null;
  this.fundingSelectedSourceKey = '';
  this.fundingFormLoading = false;
  this.fundingFormError = '';

  this.fundingRequestId = null;
  this.fundingRequestFingerprint = '';
}

fundingKey(
  source: { sourceType: string; sourceId: string }
): string {
  return `${source.sourceType}:${source.sourceId}`;
}

availableFundingSources(): GoalFundingSource[] {
  return this.fundingSources.filter(
    source => source.isAvailable && source.available >= 0.01
  );
}

releasableFundingSources(): GoalFundingAllocation[] {
  return (this.fundingHistory?.sources ?? []).filter(
    source => source.allocated >= 0.01
  );
}

changeFundingAction(): void {
  this.fundingAmount = null;
  this.fundingFormError = '';

  const sources = this.fundingAction === 'ALLOCATE'
    ? this.availableFundingSources()
    : this.releasableFundingSources();

  this.fundingSelectedSourceKey = sources.length
    ? this.fundingKey(sources[0])
    : '';
}

selectedFundingLimit(): number {
  if (!this.fundingGoal) return 0;

  if (this.fundingAction === 'ALLOCATE') {
    const source = this.availableFundingSources().find(
      item =>
        this.fundingKey(item) ===
        this.fundingSelectedSourceKey
    );

    return Math.max(
      0,
      Math.min(
        source?.available ?? 0,
        this.remainingAmount(this.fundingGoal)
      )
    );
  }

  const source = this.releasableFundingSources().find(
    item =>
      this.fundingKey(item) ===
      this.fundingSelectedSourceKey
  );

  return source?.allocated ?? 0;
}

async submitFunding(): Promise<void> {
  if (
    !this.fundingGoal ||
    this.fundingFormLoading ||
    this.fundingBusy
  ) {
    return;
  }

  this.fundingFormError = '';

  const amount = this.fundingAmount;
  const limit = this.selectedFundingLimit();

// Validate that an amount was entered.
if (amount === null || !Number.isFinite(amount)) {
  this.fundingFormError =
    'Please enter a valid amount.';
  return;
}

// Reject negative and zero amounts.
if (amount <= 0) {
  this.fundingFormError =
    'Amount must be greater than $0.00.';
  return;
}

// Allow no more than two decimal places.
if (
  Math.abs(amount - Number(amount.toFixed(2))) > 1e-9
) {
  this.fundingFormError =
    'Enter an amount with no more than two decimal places.';
  return;
}

  if (amount > limit + 0.000001) {
    this.fundingFormError =
      'Amount exceeds the available funding limit.';
    return;
  }

  const sources = this.fundingAction === 'ALLOCATE'
    ? this.availableFundingSources()
    : this.releasableFundingSources();

  const source = sources.find(
    item =>
      this.fundingKey(item) ===
      this.fundingSelectedSourceKey
  );

  if (!source) {
    this.fundingFormError = 'Please select a funding source.';
    return;
  }

  const goalId = this.fundingGoal.id;

  const fingerprint = [
    goalId,
    this.fundingAction,
    source.sourceType,
    source.sourceId,
    amount.toFixed(2),
  ].join('|');

  // Reuse the same request ID if an identical request is retried.
  if (fingerprint !== this.fundingRequestFingerprint) {
    this.fundingRequestFingerprint = fingerprint;
    this.fundingRequestId = crypto.randomUUID();
  }

  const requestId = this.fundingRequestId!;

  this.fundingBusy = true;

  try {
    const updatedGoal = await firstValueFrom(
      this.fundingAction === 'ALLOCATE'
        ? this.savingsApi.allocateFunds(
            goalId,
            source.sourceType,
            source.sourceId,
            amount,
            requestId
          )
        : this.savingsApi.releaseFunds(
            goalId,
            source.sourceType,
            source.sourceId,
            amount,
            requestId
          )
    );

    this.goals.update(current =>
      current.map(goal =>
        goal.id === updatedGoal.id ? updatedGoal : goal
      )
    );

    this.fundingBusy = false;
    this.closeFunding();
  } catch (error: unknown) {
    this.fundingFormError = this.getFundingError(
      error,
      'Unable to update goal funding. Please try again.'
    );
  } finally {
    this.fundingBusy = false;
    this.cdr.markForCheck();
  }
}

private getFundingError(
  error: unknown,
  fallback: string
): string {
  if (
    error instanceof HttpErrorResponse &&
    typeof error.error?.error === 'string'
  ) {
    return error.error.error;
  }

  return fallback;
}

requestAchieve(goal: SavingsGoal): void {
  if (
    this.achievingGoal ||
    goal.achievedAt !== null ||
    goal.spentAmount <= 0 ||
    goal.savedAmount > 0
  ) {
    return;
  }

  this.goalToAchieve = goal;
  this.achieveError = '';
}

cancelAchieve(): void {
  if (this.achievingGoal) {
    return;
  }

  this.goalToAchieve = null;
  this.achieveError = '';
}

async confirmAchieve(): Promise<void> {
  if (!this.goalToAchieve || this.achievingGoal) {
    return;
  }

  const goalId = this.goalToAchieve.id;

  this.achievingGoal = true;
  this.achieveError = '';

  try {
    const updatedGoal = await firstValueFrom(
      this.savingsApi.achieveGoal(goalId)
    );

    this.goals.update(current =>
      current.map(goal =>
        goal.id === updatedGoal.id
          ? updatedGoal
          : goal
      )
    );

    this.goalToAchieve = null;
  } catch (error: unknown) {
    this.achieveError = this.getFundingError(
      error,
      'Unable to mark this goal as achieved.'
    );
  } finally {
    this.achievingGoal = false;
    this.cdr.markForCheck();
  }
}

requestDelete(goal: SavingsGoal): void {
  if (this.deletingGoal) return;

  this.goalToDelete = goal;
  this.deleteError = '';
}

cancelDelete(): void {
  if (this.deletingGoal) return;

  this.goalToDelete = null;
  this.deleteError = '';
}

async deleteGoal(): Promise<void> {
  if (!this.goalToDelete || this.deletingGoal) {
    return;
  }

  const goalId = this.goalToDelete.id;

  this.deletingGoal = true;
  this.deleteError = '';

  try {
    await firstValueFrom(
      this.savingsApi.deleteGoal(goalId)
    );

    this.goals.update(current =>
      current.filter(goal => goal.id !== goalId)
    );

    this.goalToDelete = null;
  } catch (error: unknown) {
    this.deleteError =
      error instanceof HttpErrorResponse &&
      typeof error.error?.error === 'string'
        ? error.error.error
        : 'Unable to delete this savings goal. Please try again.';
  } finally {
    this.deletingGoal = false;
  }
}

  progressPercent(goal: SavingsGoal): number {
    if (goal.targetAmount <= 0) {
      return 0;
    }

    const progress = goal.savedAmount + goal.spentAmount;

    return Math.min(
      100,
      Math.round((progress / goal.targetAmount) * 100)
    );
  }

  remainingAmount(goal: SavingsGoal): number {
    return Math.max(
      0,
      goal.targetAmount - goal.savedAmount - goal.spentAmount
    );
  }

  goalStatus(goal: SavingsGoal): string {
    if (goal.achievedAt) {
      return 'Achieved';
    }

    const progress = goal.savedAmount + goal.spentAmount;

    if (goal.spentAmount > 0 && progress >= goal.targetAmount) {
      return 'Purchase recorded';
    }

    if (progress >= goal.targetAmount) {
      return 'Fully funded';
    }

    if (goal.targetDate < this.getLocalDate()) {
      return 'Overdue';
    }

    return 'In progress';
  }
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: 'NZD',
    }).format(amount);
  }

  formatDate(date: string): string {
    if (!date) {
      return '';
    }

    const [year, month, day] = date.split('-').map(Number);

    return new Date(year, month - 1, day).toLocaleDateString(
      'en-NZ',
      {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }
    );
  }

  setActiveFilter(filter: GoalFilter): void {
    this.activeFilter.set(filter);
  }

  async loadFundingSummary(): Promise<void> {
    this.fundingLoading.set(true);
    this.fundingError.set(false);

    try {
      const summary = await firstValueFrom(
        this.savingsApi.getFundingSummary()
      );

      this.fundingSummary.set(summary);
    } catch {
      this.fundingSummary.set(null);
      this.fundingError.set(true);
    } finally {
      this.fundingLoading.set(false);
    }
  }
}
