
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';

import {
  BudgetAllocation,
} from '../../../core/services/budget-allocations-api.service';

export interface MonthlyAllocationAmounts {
  needs: number;
  savings: number;
  wants: number;
}

@Component({
  selector: 'app-monthly-allocation',
  standalone: true,
  templateUrl: './monthly-allocation.component.html',
  styleUrl: './monthly-allocation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonthlyAllocationComponent {
  @Input() monthLabel = '';

  @Input() allocation: BudgetAllocation | null = null;

  @Input() amounts: MonthlyAllocationAmounts | null = null;

  @Input() loading = false;
  @Input() incomeLoading = false;

  @Input() error = '';

  @Output() retry = new EventEmitter<void>();

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: 'NZD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  retryLoading(): void {
    this.retry.emit();
  }
}
