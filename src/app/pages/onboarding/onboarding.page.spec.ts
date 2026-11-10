import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OnboardingPage } from './onboarding.page';
import { OnboardingApiService } from '../../core/services/onboarding-api.service';
import { PayrollApiService } from '../../core/services/payroll-api.service';
import { BudgetAllocationsApiService } from '../../core/services/budget-allocations-api.service';

describe('OnboardingPage navigation', () => {
  const saveProgress = vi.fn();

  const estimate = {
    taxYear: '2026-27',
    effectiveTaxCode: 'M',
    grossPerPay: '1000.00',
    payeIncludingAcc: '200.00',
    studentLoan: '0.00',
    kiwiSaver: '0.00',
    netPerPay: '800.00',
    estimatedMonthlyNet: '3466.67',
  };

  let page: OnboardingPage;

  beforeEach(() => {
    saveProgress.mockReset();

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: OnboardingApiService,
          useValue: { saveProgress },
        },
        {
          provide: PayrollApiService,
          useValue: {},
        },
        {
          provide: BudgetAllocationsApiService,
          useValue: {},
        },
      ],
    });

    page = TestBed.runInInjectionContext(
      () => new OnboardingPage()
    );
  });

  it('allows returning to Review after visiting Budget', async () => {
    page.progress.set({
      status: 'IN_PROGRESS',
      currentStep: 'REVIEW',
      onboardingRequired: true,
      completedAt: null,
    });

    page.payrollEstimate.set(estimate);
    page.allocationSaved.set(true);

    // Simulate returning from Review to Budget.
    page.viewedStep.set('BUDGET');

    await page.continueToReview();

    expect(page.viewedStep()).toBe('REVIEW');
    expect(saveProgress).not.toHaveBeenCalled();
  });

  it('invalidates an estimate when employment type changes', () => {
    page.selectedIncomeType.set('SALARY');
    page.payrollEstimate.set(estimate);

    page.chooseIncomeType('HOURLY');

    expect(page.selectedIncomeType()).toBe('HOURLY');
    expect(page.payrollEstimate()).toBeNull();
  });

  it('matches the Budget page allocation rounding', () => {
  page.payrollEstimate.set({
    ...estimate,
    estimatedMonthlyNet: '4295.89',
  });

  page.budgetShares.set({
    needs: 55,
    savings: 25,
    wants: 20,
  });

  expect(page.budgetPreview()).toEqual({
    monthlyNet: 4295.89,
    needs: 2362.74,
    savings: 1073.97,
    wants: 859.18,
  });
});
});