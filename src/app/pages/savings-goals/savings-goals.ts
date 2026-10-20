
import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

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
export class SavingsGoals {
  // Temporary in-memory data until Flask persistence is connected.
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

  goalForm: SavingsGoalForm = this.emptyGoalForm();

  showContributionForm = false;
  contributionGoal: SavingsGoal | null = null;
  contributionAmount: number | null = null;
  contributionError = '';

  goalToDelete: SavingsGoal | null = null;

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

  saveGoal(): void {
    const name = this.goalForm.name.trim();
    const targetAmount = Number(this.goalForm.targetAmount);
    const savedAmount = Number(this.goalForm.savedAmount);
    const targetDate = this.goalForm.targetDate;

    if (!name) {
      this.goalFormError = 'Please enter a goal name.';
      return;
    }

    if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
      this.goalFormError =
        'Target amount must be greater than zero.';
      return;
    }

    if (!Number.isFinite(savedAmount) || savedAmount < 0) {
      this.goalFormError =
        'Saved amount cannot be negative.';
      return;
    }

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(targetDate) ||
      Number.isNaN(new Date(`${targetDate}T00:00:00`).getTime())
    ) {
      this.goalFormError = 'Please select a valid target date.';
      return;
    }

    if (this.editingGoalId) {
      const editingId = this.editingGoalId;

      this.goals.update((currentGoals) =>
        currentGoals.map((goal) =>
          goal.id === editingId
            ? {
                ...goal,
                name,
                targetAmount,
                savedAmount,
                targetDate,
              }
            : goal
        )
      );
    } else {
      const newGoal: SavingsGoal = {
        id: crypto.randomUUID(),
        name,
        targetAmount,
        savedAmount,
        targetDate,
        createdAt: this.getLocalDate(),
      };

      this.goals.update((currentGoals) => [
        ...currentGoals,
        newGoal,
      ]);
    }

    this.closeGoalForm();
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

  addContribution(): void {
    if (!this.contributionGoal) {
      return;
    }

    const amount = Number(this.contributionAmount);

    if (
      this.contributionAmount === null ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      this.contributionError =
        'Please enter an amount greater than zero.';
      return;
    }

    const goalId = this.contributionGoal.id;

    this.goals.update((currentGoals) =>
      currentGoals.map((goal) =>
        goal.id === goalId
          ? {
              ...goal,
              savedAmount:
                Math.round((goal.savedAmount + amount) * 100) / 100,
            }
          : goal
      )
    );

    this.closeContribution();
  }

  requestDelete(goal: SavingsGoal): void {
    this.goalToDelete = goal;
  }

  cancelDelete(): void {
    this.goalToDelete = null;
  }

  deleteGoal(): void {
    if (!this.goalToDelete) {
      return;
    }

    const goalId = this.goalToDelete.id;

    this.goals.update((currentGoals) =>
      currentGoals.filter((goal) => goal.id !== goalId)
    );

    this.goalToDelete = null;
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
