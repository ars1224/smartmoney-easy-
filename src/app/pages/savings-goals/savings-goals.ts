
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { SavingsGoalsService } from '../../core/savings/savings-goals.service';

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  savedAmount: number;
  targetDate: string;
  createdAt: string;
}

interface SavingsGoalForm {
  name: string;
  targetAmount: number | null;
  savedAmount: number | null;
  targetDate: string;
}

@Component({
  selector: 'app-savings-goals',
  imports: [CommonModule, FormsModule],
  templateUrl: './savings-goals.html',
  styleUrl: './savings-goals.scss',
})
export class SavingsGoalsPage implements OnInit {
  private readonly savingsApi = inject(SavingsGoalsService);

  readonly loading = signal(true);
  readonly pageError = signal('');
  readonly goals = signal<SavingsGoal[]>([]);

  readonly totalTarget = computed(() =>
    this.goals().reduce((sum, goal) => sum + goal.targetAmount, 0)
  );

  readonly totalSaved = computed(() =>
    this.goals().reduce((sum, goal) => sum + goal.savedAmount, 0)
  );

  readonly completedGoals = computed(() =>
    this.goals().filter(
      (goal) => goal.savedAmount >= goal.targetAmount
    ).length
  );

  readonly overallProgress = computed(() => {
    const target = this.totalTarget();

    if (target <= 0) {
      return 0;
    }

    return Math.min(
      100,
      Math.round((this.totalSaved() / target) * 100)
    );
  });

  readonly today = this.getLocalDate();

  showGoalForm = false;
  editingGoalId: string | null = null;
  goalFormError = '';
  savingGoal = false;

  goalForm: SavingsGoalForm = this.emptyGoalForm();

  showContributionForm = false;
  contributionGoal: SavingsGoal | null = null;
  contributionAmount: number | null = null;
  contributionError = '';
  savingContribution = false;

  goalToDelete: SavingsGoal | null = null;
  deletingGoal = false;
  deleteError = '';

  async ngOnInit(): Promise<void> {
    await this.loadGoals();
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
      targetAmount: null,
      savedAmount: 0,
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
      targetAmount: goal.targetAmount,
      savedAmount: goal.savedAmount,
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
    const savedAmount = this.goalForm.savedAmount;
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
      savedAmount === null ||
      !Number.isFinite(savedAmount) ||
      savedAmount < 0
    ) {
      this.goalFormError =
        'Saved amount cannot be negative.';
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

    if (
      hasMoreThanTwoDecimals(targetAmount) ||
      hasMoreThanTwoDecimals(savedAmount)
    ) {
      this.goalFormError =
        'Amounts cannot have more than two decimal places.';
      return;
    }

    const payload = {
      name,
      targetAmount,
      savedAmount,
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
  openContribution(goal: SavingsGoal): void {
    this.contributionGoal = goal;
    this.contributionAmount = null;
    this.contributionError = '';
    this.showContributionForm = true;
  }

  closeContribution(): void {
    this.showContributionForm = false;
    this.contributionGoal = null;
    this.contributionAmount = null;
    this.contributionError = '';
  }

  async addContribution(): Promise<void> {
    if (!this.contributionGoal || this.savingContribution) {
      return;
    }

    this.contributionError = '';

    const amount = this.contributionAmount;

    if (
      amount === null ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      this.contributionError =
        'Please enter an amount greater than zero.';
      return;
    }

    if (
      Math.abs(amount - Number(amount.toFixed(2))) > 1e-9
    ) {
      this.contributionError =
        'Contribution cannot have more than two decimal places.';
      return;
    }

    const goalId = this.contributionGoal.id;

    this.savingContribution = true;

    try {
      const updatedGoal = await firstValueFrom(
        this.savingsApi.addContribution(goalId, amount)
      );

      this.goals.update(current =>
        current.map(goal =>
          goal.id === updatedGoal.id ? updatedGoal : goal
        )
      );

      this.closeContribution();

    } catch (error: unknown) {
      this.contributionError =
        error instanceof HttpErrorResponse &&
        typeof error.error?.error === 'string'
          ? error.error.error
          : 'Unable to add contribution. Please try again.';

    } finally {
      this.savingContribution = false;
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

    return Math.min(
      100,
      Math.round((goal.savedAmount / goal.targetAmount) * 100)
    );
  }

  remainingAmount(goal: SavingsGoal): number {
    return Math.max(
      0,
      goal.targetAmount - goal.savedAmount
    );
  }

  goalStatus(goal: SavingsGoal): string {
    if (goal.savedAmount >= goal.targetAmount) {
      return 'Completed';
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
}
