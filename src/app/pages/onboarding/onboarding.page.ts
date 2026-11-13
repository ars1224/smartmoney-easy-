import {
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';

import { Router, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';

import {
  OnboardingApiService,
  OnboardingProgress,
  OnboardingStep,
} from '../../core/services/onboarding-api.service';

import { PayrollIncomeType } from '../../core/services/payroll-api.service';

import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import { HttpErrorResponse } from '@angular/common/http';

import {
  PayrollApiService,
  PayrollFrequency,
  PayrollSettings,
  PayrollEstimate,
  SupportedTaxCode,
} from '../../core/services/payroll-api.service';

import {
  BudgetAllocationsApiService,
} from '../../core/services/budget-allocations-api.service';





type BudgetBucket = 'needs' | 'savings' | 'wants';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [IonContent, RouterLink, ReactiveFormsModule],
  templateUrl: './onboarding.page.html',
  styleUrl: './onboarding.page.scss',

})
export class OnboardingPage implements OnInit {
  private readonly onboardingApi =
    inject(OnboardingApiService);


private readonly allocationsApi =
  inject(BudgetAllocationsApiService);


private readonly router = inject(Router);

readonly completionSaving = signal(false);
readonly completionError = signal('');


readonly allocationLoading = signal(false);
readonly allocationLoadError = signal('');
readonly allocationSaved = signal(false);
readonly Number = Number;

readonly budgetSaving = signal(false);
readonly budgetSaveMessage = signal('');

  readonly loading = signal(true);
  readonly error = signal('');
  readonly progress = signal<OnboardingProgress | null>(null);
  readonly progressSaving = signal(false);


readonly budgetShares = signal({
  needs: 55,
  savings: 25,
  wants: 20,
});

readonly budgetError = signal('');

readonly budgetTotalPercent = computed(() => {
  const shares = this.budgetShares();

  return shares.needs + shares.savings + shares.wants;
});

readonly budgetMonthlyNet = computed(() => {
  const estimate = this.payrollEstimate();

  if (!estimate) {
    return null;
  }

  const amount = Number(estimate.estimatedMonthlyNet);

  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return amount;
});

readonly budgetPreview = computed(() => {
  const monthlyNet = this.budgetMonthlyNet();

  if (
    monthlyNet === null ||
    this.budgetTotalPercent() !== 100
  ) {
    return null;
  }

  const shares = this.budgetShares();
  const totalCents = Math.round(monthlyNet * 100);

const needsCents = Math.round(
  totalCents * shares.needs / 100
);

const savingsCents = Math.round(
  totalCents * shares.savings / 100
);

  // Keep the three allocations equal to the exact
  // monthly total, avoiding fractional cents.
  const wantsCents =
    totalCents - needsCents - savingsCents;

  return {
    monthlyNet: totalCents / 100,
    needs: needsCents / 100,
    savings: savingsCents / 100,
    wants: wantsCents / 100,
  };
});


  readonly steps: {
    id: OnboardingStep;
    label: string;
  }[] = [
    { id: 'EMPLOYMENT', label: 'Employment details' },
    { id: 'PAYROLL', label: 'Pay and deductions' },
    { id: 'BUDGET', label: 'Monthly budget' },
    { id: 'REVIEW', label: 'Review your setup' },
  ];

  ngOnInit(): void {
    void this.loadProgress();
  }

  async loadProgress(): Promise<void> {
    this.loading.set(true);
    this.error.set('');

    try {
      const result = await firstValueFrom(
        this.onboardingApi.getProgress()
      );


this.progress.set(result);

if (result.status === 'IN_PROGRESS') {
  this.viewedStep.set(result.currentStep ?? 'EMPLOYMENT');

  // Restore payroll settings saved during an earlier session.
  try {
    const response = await firstValueFrom(
      this.payrollApi.getSettings()
    );

    const settings = response.settings;

    if (settings) {
      this.selectedIncomeType.set(settings.incomeType);

      this.payrollForm.patchValue({
        grossAmount: settings.grossAmount,
        payFrequency: settings.payFrequency,
        hoursPerWeek: settings.hoursPerWeek ?? '',
        taxCode: settings.taxCode,
        kiwiSaverRate: settings.kiwiSaverRate ?? '',
      });

      // Restore the take-home preview too.
      try {
        const estimateResponse = await firstValueFrom(
          this.payrollApi.getEstimate()
        );

        this.payrollEstimate.set(estimateResponse.estimate);
      } catch {
        this.payrollError.set(
          'Your pay settings were loaded, but the estimate is unavailable. Save again to retry.'
        );
      }
    }
  } catch {
    this.payrollError.set(
      'Unable to restore saved pay settings. Please try again.'
    );
  }
}

if (
  result.currentStep === 'BUDGET' ||
  result.currentStep === 'REVIEW'
) {
  await this.loadBudgetAllocation();
}

    } catch {
      this.progress.set(null);
      this.error.set(
        'Unable to load your setup progress. Please try again.'
      );
    } finally {
      this.loading.set(false);
    }
  }

chooseIncomeType(type: PayrollIncomeType): void {
  if (this.selectedIncomeType() === type) {
    return;
  }

  this.selectedIncomeType.set(type);

  // Employment type changed, so the previous
  // payroll estimate is no longer valid.
  this.payrollEstimate.set(null);
  this.payrollError.set('');
}

continueToPayroll(): void {
  if (!this.selectedIncomeType()) {
    return;
  }

  // Navigation only. Payroll information is not saved yet.
  this.viewedStep.set('PAYROLL');
}


async savePayroll(): Promise<void> {
  if (this.payrollSaving()) {
    return;
  }

  this.payrollError.set('');
  this.payrollEstimate.set(null);

  const incomeType = this.selectedIncomeType();

  if (!incomeType) {
    this.payrollError.set(
      'Please select your employment type first.'
    );
    return;
  }

  if (this.payrollForm.invalid) {
    this.payrollForm.markAllAsTouched();
    this.payrollError.set(
      'Please enter a valid gross pay amount.'
    );
    return;
  }

  const form = this.payrollForm.getRawValue();

  const grossAmount = form.grossAmount.trim();
  const hours = form.hoursPerWeek.trim();

  if (Number(grossAmount) > 999999999999.99) {
    this.payrollError.set('Gross pay exceeds the allowed limit.');
    return;
  }

  if (incomeType === 'HOURLY') {
    if (
      !/^\d+(\.\d{1,2})?$/.test(hours) ||
      Number(hours) > 168
    ) {
      this.payrollError.set(
        'Enter valid weekly hours between 0 and 168.'
      );
      return;
    }
  }

  const settings: PayrollSettings = {
    incomeType,
    grossAmount,
    payFrequency: form.payFrequency,

    hoursPerWeek:
      incomeType === 'HOURLY' ? hours : null,

    taxCode: form.taxCode,

    kiwiSaverRate:
      form.kiwiSaverRate || null,

    hasStudentLoan: form.taxCode === 'M SL',
  };

  this.payrollSaving.set(true);

  try {
    await firstValueFrom(
      this.payrollApi.saveSettings(settings)
    );

    const response = await firstValueFrom(
      this.payrollApi.getEstimate()
    );

    this.payrollEstimate.set(response.estimate);

  } catch (error: unknown) {
    this.payrollError.set(
      error instanceof HttpErrorResponse &&
      typeof error.error?.error === 'string'
        ? error.error.error
        : 'Unable to save payroll settings. Please try again.'
    );

  } finally {
    this.payrollSaving.set(false);
  }
}


backToEmployment(): void {
  this.viewedStep.set('EMPLOYMENT');
}

  readonly selectedIncomeType = signal<PayrollIncomeType | null>(null);

readonly viewedStep = signal<OnboardingStep>('EMPLOYMENT');

private readonly fb = inject(FormBuilder);
private readonly payrollApi = inject(PayrollApiService);

readonly payrollSaving = signal(false);
readonly payrollError = signal('');
readonly payrollEstimate = signal<PayrollEstimate | null>(null);

readonly payrollForm = this.fb.nonNullable.group({
  grossAmount: [
    '',
    [
      Validators.required,
      Validators.pattern(/^\d+(\.\d{1,2})?$/),
    ],
  ],

  payFrequency:
    this.fb.nonNullable.control<PayrollFrequency>('WEEKLY'),

  hoursPerWeek: [''],

  taxCode:
    this.fb.nonNullable.control<SupportedTaxCode>('M'),

  // Empty string means not enrolled in KiwiSaver.
  kiwiSaverRate: [''],
});


async continueToBudget(): Promise<void> {
  const state = this.progress();

  if (
    !state ||
    state.status !== 'IN_PROGRESS' ||
    !this.payrollEstimate() ||
    this.payrollSaving() ||
    this.progressSaving()
  ) {
    return;
  }

  this.payrollError.set('');
  this.progressSaving.set(true);

  try {
    // Persist progress in the correct sequence.
    if (state.currentStep === 'EMPLOYMENT') {
      await firstValueFrom(
        this.onboardingApi.saveProgress('PAYROLL')
      );
    }

    if (
      state.currentStep === 'EMPLOYMENT' ||
      state.currentStep === 'PAYROLL'
    ) {
      const saved = await firstValueFrom(
        this.onboardingApi.saveProgress('BUDGET')
      );

      this.progress.set({
        ...state,
        status: saved.status,
        currentStep: saved.currentStep,
        onboardingRequired: saved.onboardingRequired,
      });
    }

    this.viewedStep.set('BUDGET');
    await this.loadBudgetAllocation();

  } catch (error: unknown) {
    this.payrollError.set(
      error instanceof HttpErrorResponse &&
      typeof error.error?.error === 'string'
        ? error.error.error
        : 'Unable to save your setup progress. Please retry.'
    );

  } finally {
    this.progressSaving.set(false);
  }
}


updateBudgetShare(
  bucket: BudgetBucket,
  rawValue: string
): void {
  const value = Number(rawValue);

  if (
    rawValue.trim() === '' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 100
  ) {
    this.budgetError.set(
      'Enter a whole percentage between 0 and 100.'
    );
    return;
  }

  this.budgetShares.update(shares => ({
    ...shares,
    [bucket]: value,
  }));

  this.budgetError.set('');

this.allocationSaved.set(false);
this.budgetSaveMessage.set('');


  if (this.budgetTotalPercent() !== 100) {
    this.budgetError.set(
      'Needs, Savings and Wants must total 100%.'
    );
  }
}


async loadBudgetAllocation(): Promise<void> {
  this.allocationLoading.set(true);
  this.allocationLoadError.set('');

  try {
    const response = await firstValueFrom(
      this.allocationsApi.getAllocation()
    );

    if (response.allocation) {
      this.budgetShares.set({
        needs: response.allocation.needsPercent,
        savings: response.allocation.savingsPercent,
        wants: response.allocation.wantsPercent,
      });

      this.allocationSaved.set(true);
    } else {
      this.budgetShares.set({
        needs: 55,
        savings: 25,
        wants: 20,
      });

      this.allocationSaved.set(false);
    }

    this.budgetError.set('');

  } catch {
    this.allocationLoadError.set(
      'Unable to load your monthly budget allocation.'
    );
    this.allocationSaved.set(false);

  } finally {
    this.allocationLoading.set(false);
  }
}

async saveBudgetAllocation(): Promise<void> {
  if (
    this.budgetSaving() ||
    this.allocationLoading() ||
    this.allocationLoadError()
  ) {
    return;
  }

  this.budgetError.set('');
  this.budgetSaveMessage.set('');

  if (
    this.budgetTotalPercent() !== 100 ||
    !this.budgetPreview()
  ) {
    this.budgetError.set(
      'Your allocation must total 100% and have a valid income estimate.'
    );
    return;
  }

  const shares = this.budgetShares();

  this.budgetSaving.set(true);

  try {
    const response = await firstValueFrom(
      this.allocationsApi.saveAllocation({
        needsPercent: shares.needs,
        savingsPercent: shares.savings,
        wantsPercent: shares.wants,
      })
    );

    this.budgetShares.set({
      needs: response.allocation.needsPercent,
      savings: response.allocation.savingsPercent,
      wants: response.allocation.wantsPercent,
    });

    this.allocationSaved.set(true);

    this.budgetSaveMessage.set(
      `Your allocation for ${response.month} was saved successfully.`
    );

  } catch (error: unknown) {
    this.allocationSaved.set(false);

    this.budgetError.set(
      error instanceof HttpErrorResponse &&
      typeof error.error?.error === 'string'
        ? error.error.error
        : 'Unable to save your budget allocation. Please try again.'
    );

  } finally {
    this.budgetSaving.set(false);
  }
}


async continueToReview(): Promise<void> {
  const state = this.progress();

  if (
    !state ||
    state.status !== 'IN_PROGRESS' ||
    (
      state.currentStep !== 'BUDGET' &&
      state.currentStep !== 'REVIEW'
    ) ||
    !this.allocationSaved() ||
    this.allocationLoading() ||
    !!this.allocationLoadError() ||
    this.budgetSaving() ||
    this.progressSaving() ||
    !!this.budgetError() ||
    this.budgetPreview() === null
  ) {
    return;
  }

  this.budgetError.set('');

  // Users who already reached Review can return
  // without repeating the backend step transition.
  if (state.currentStep === 'REVIEW') {
    this.viewedStep.set('REVIEW');
    return;
  }

  this.progressSaving.set(true);

  try {
    const saved = await firstValueFrom(
      this.onboardingApi.saveProgress('REVIEW')
    );

    this.progress.set({
      ...state,
      status: saved.status,
      currentStep: saved.currentStep,
      onboardingRequired: saved.onboardingRequired,
    });

    this.viewedStep.set('REVIEW');

  } catch (error: unknown) {
    this.budgetError.set(
      error instanceof HttpErrorResponse &&
      typeof error.error?.error === 'string'
        ? error.error.error
        : 'Unable to continue to Review. Please try again.'
    );

  } finally {
    this.progressSaving.set(false);
  }
}


async finishSetup(): Promise<void> {
  const state = this.progress();

  if (
    !state ||
    state.status !== 'IN_PROGRESS' ||
    state.currentStep !== 'REVIEW' ||
    !this.payrollEstimate() ||
    !this.allocationSaved() ||
    this.allocationLoading() ||
    !!this.allocationLoadError() ||
    !this.budgetPreview() ||
    this.completionSaving()
  ) {
    return;
  }

  this.completionError.set('');
  this.completionSaving.set(true);

  try {
    const response = await firstValueFrom(
      this.onboardingApi.completeOnboarding()
    );

    // Only mark the UI complete after Flask confirms it.
    this.progress.set({
      status: response.status,
      currentStep: response.currentStep,
      onboardingRequired: response.onboardingRequired,
      completedAt: response.completedAt,
    });

    // Redirect only after successful completion.
    await this.router.navigateByUrl('/app/dashboard');

  } catch (error: unknown) {
    this.completionError.set(
      error instanceof HttpErrorResponse &&
      typeof error.error?.error === 'string'
        ? error.error.error
        : 'Unable to finish setup. Please try again.'
    );

  } finally {
    this.completionSaving.set(false);
  }
}





}
