
import {
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  ChangeDetectorRef,
  inject,
} from '@angular/core';

import { IonContent } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { SmCardComponent } from '../../shared/ui/sm-card/sm-card.component';
import { SmButtonComponent } from '../../shared/ui/sm-button/sm-button.component';
import { AuthService } from '../../core/auth/auth.service';
import { BankAccountsApiService } from '../../core/bank/bank-accounts-api.service';

import { firstValueFrom } from 'rxjs';

import {
  MonthlyIncomeApiService,
  MonthlyIncomeSummary,
} from '../../core/services/monthly-income-api.service';

import {
  RegularIncomeApiService,
  RegularIncomeProfile,
  RegularIncomeType,
  PayFrequency,
} from '../../core/services/regular-income-api.service';

import { HttpErrorResponse } from '@angular/common/http';

import {
  PayrollApiService,
  PayrollFrequency,
} from '../../core/services/payroll-api.service';

type SettingsModal =
  | 'personal-details'
  | 'change-password'
  | 'privacy-data'
  | 'confirm-remove-bank-data'
  | 'logout'
  | 'delete-account'
  | 'expected-income'
  | null;

@Component({
  selector: 'app-profile-settings',
  standalone: true,
  imports: [
    IonContent,
    SmCardComponent,
    SmButtonComponent,
    FormsModule,
  ],
  templateUrl: './profile-settings.page.html',
  styleUrl: './profile-settings.pages.scss',
})
export class ProfileSettingsPage {
  private readonly auth = inject(AuthService);
  private readonly bankApi = inject(BankAccountsApiService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly monthlyIncomeApi =
    inject(MonthlyIncomeApiService);
  private readonly regularIncomeApi =
    inject(RegularIncomeApiService);
  private readonly payrollApi =
    inject(PayrollApiService);
  private regularIncomeRequestId = 0;

  incomeMonth = '';
  incomeAmount: number | null = null;
  incomeSummary: MonthlyIncomeSummary | null = null;

  incomeLoading = false;
  incomeSaving = false;
  incomeError = '';
  incomeMessage = '';

  activeModal: SettingsModal = null;

  personalDetailsLoading = false;
  passwordLoading = false;
  logoutLoading = false;
  logoutError = '';

  private modalTrigger: HTMLElement | null = null;
  private modalElement: HTMLElement | null = null;


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


  @ViewChild('settingsModal')
  set settingsModal(ref: ElementRef<HTMLElement> | undefined) {
    this.modalElement = ref?.nativeElement ?? null;

    const modal = this.modalElement;

    if (!modal) {
      return;
    }

    requestAnimationFrame(() => {
      if (!modal.isConnected || !this.activeModal) {
        return;
      }

      const firstFocusable = this.getFocusableElements(modal)[0];
      (firstFocusable ?? modal).focus();
    });
  }

  /**
   * Notify AppShell when a settings modal opens or closes.
   */
  private notifyModalState(isOpen: boolean): void {
    window.dispatchEvent(
      new CustomEvent('smartmoney:settings-modal', {
        detail: { isOpen },
      }),
    );
  }

  @HostListener('document:keydown', ['$event'])
  handleModalKeyboard(event: KeyboardEvent): void {
    if (!this.activeModal || !this.modalElement) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeModal();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const modal = this.modalElement;
    const focusableElements = this.getFocusableElements(modal);

    if (focusableElements.length === 0) {
      event.preventDefault();
      modal.focus();
      return;
    }

    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;

    if (!modal.contains(activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }

    if (event.shiftKey && activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private getFocusableElements(
    modal: HTMLElement,
  ): HTMLElement[] {
    const selector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ');

    return Array.from(
      modal.querySelectorAll<HTMLElement>(selector),
    ).filter(
      element =>
        element.getClientRects().length > 0 &&
        element.getAttribute('aria-hidden') !== 'true',
    );
  }

  // Personal details
  personalName = '';
  personalEmail = '';
  personalDetailsError = '';
  personalDetailsMessage = '';

  // Change password
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  passwordError = '';
  passwordMessage = '';

  // Privacy and stored data
  privacyMessage = '';
  bankDeleteLoading = false;

  // Settings cards
  readonly settings = [
    {
      title: 'Personal details',
      description: 'Manage this setting',
      action: 'personal-details',
    },
    {
      title: 'Expected income',
      description: 'Set your planned income for each month.',
      action: 'expected-income',
    },
    {
      title: 'Change password',
      description: 'Manage this setting',
      action: 'change-password',
    },
    {
      title: 'Export my data',
      description: 'Coming soon — not available in this version',
      action: 'export-data',
    },
    {
      title: 'Remove stored bank data',
      description:
        'Permanently remove imported history without deleting the account',
      action: 'remove-bank-data',
    },
    {
      title: 'Log out',
      description: 'Manage this setting',
      action: 'logout',
    },
    {
      title: 'Delete SmartMoney account',
      description: 'Coming soon — not available in this version',
      action: 'delete-account',
      danger: true,
    },
  ];

  // Open the relevant settings modal
  openSetting(action: string, event?: MouseEvent): void {
    const trigger = event?.currentTarget;

    this.modalTrigger =
      trigger instanceof HTMLElement ? trigger : null;


  if (action === 'expected-income') {
    this.incomeMonth = this.getCurrentNzMonth();
    this.incomeAmount = null;
    this.incomeSummary = null;
    this.incomeError = '';
    this.incomeMessage = '';

    this.activeModal = 'expected-income';
    this.notifyModalState(true);

    void this.loadExpectedIncome();
    void this.loadRegularIncomeProfile();
    return;
  }


    if (action === 'personal-details') {
      const user = this.auth.currentUser();

      this.personalName = user?.name ?? '';
      this.personalEmail = user?.email ?? '';
      this.personalDetailsError = '';
      this.personalDetailsMessage = '';
      this.activeModal = 'personal-details';
      this.notifyModalState(true);
      return;
    }

    if (action === 'change-password') {
      this.currentPassword = '';
      this.newPassword = '';
      this.confirmPassword = '';
      this.passwordError = '';
      this.passwordMessage = '';
      this.activeModal = 'change-password';
      this.notifyModalState(true);
      return;
    }

    if (
      action === 'export-data' ||
      action === 'remove-bank-data'
    ) {
      this.privacyMessage = '';
      this.activeModal = 'privacy-data';
      this.notifyModalState(true);
      return;
    }

    if (action === 'logout') {
      this.logoutError = '';
      this.activeModal = 'logout';
      this.notifyModalState(true);
      return;
    }

    if (action === 'delete-account') {
      this.activeModal = 'delete-account';
      this.notifyModalState(true);
      return;
    }

    this.modalTrigger = null;
    console.log('Selected setting:', action);
  }

  // Close the modal and reset temporary messages
  closeModal(): void {
    // Prevent closing while an API request is in progress.
    if (
      this.personalDetailsLoading ||
      this.passwordLoading ||
      this.logoutLoading ||
      this.bankDeleteLoading ||
      this.incomeSaving ||
      this.regularIncomeSaving
    ) {
      return;
    }

    const trigger = this.modalTrigger;

    this.activeModal = null;
    this.notifyModalState(false);

    this.modalTrigger = null;
    this.modalElement = null;

    this.personalDetailsError = '';
    this.personalDetailsMessage = '';

    this.currentPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
    this.passwordError = '';
    this.passwordMessage = '';

    this.privacyMessage = '';
    this.logoutError = '';

    // Return keyboard focus to the button that opened the modal.
    setTimeout(() => {
      trigger?.focus();
    });
  }

  // Validate personal details
  savePersonalDetails(): void {
    const name = this.personalName.trim();
    const email = this.personalEmail.trim();

    if (!name || name.length < 2 || name.length > 100) {
      this.personalDetailsError =
        'Name must be between 2 and 100 characters.';
      this.personalDetailsMessage = '';
      return;
    }

    if (
      !email ||
      email.length > 255 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      this.personalDetailsError =
        'Please enter a valid email address.';
      this.personalDetailsMessage = '';
      return;
    }

    if (this.personalDetailsLoading) {
      return;
    }

    this.personalDetailsLoading = true;
    this.personalDetailsError = '';
    this.personalDetailsMessage = '';

    this.auth.updateProfile(name, email).subscribe({
      next: (user) => {
        this.personalName = user.name;
        this.personalEmail = user.email;

        this.personalDetailsMessage =
          'Your personal details have been updated successfully.';

        this.personalDetailsLoading = false;

        this.cdr.detectChanges();
      },
      error: (error: Error) => {
        this.personalDetailsError = error.message;
        this.personalDetailsLoading = false;

        this.cdr.detectChanges();
      },
    });
  }

  // Validate password fields
  updatePassword(): void {
    if (!this.currentPassword) {
      this.passwordError =
        'Please enter your current password.';
      this.passwordMessage = '';
      return;
    }

    if (
      this.newPassword.length < 12 ||
      this.newPassword.length > 128
    ) {
      this.passwordError =
        'Your new password must be between 12 and 128 characters.';
      this.passwordMessage = '';
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.passwordError =
        'Your passwords do not match.';
      this.passwordMessage = '';
      return;
    }

    if (this.currentPassword === this.newPassword) {
      this.passwordError =
        'Your new password must be different from your current password.';
      this.passwordMessage = '';
      return;
    }

    if (this.passwordLoading) {
      return;
    }

    this.passwordLoading = true;
    this.passwordError = '';
    this.passwordMessage = '';

    this.auth.changePassword(
      this.currentPassword,
      this.newPassword
    ).subscribe({
      next: () => {
        this.passwordMessage =
          'Your password has been updated successfully.';

        this.currentPassword = '';
        this.newPassword = '';
        this.confirmPassword = '';

        this.passwordLoading = false;
        this.cdr.detectChanges();
      },

      error: (error: Error) => {
        this.passwordError = error.message;
        this.passwordLoading = false;

        this.cdr.detectChanges();
      },
    });
  }

  // Show privacy-related status messages
  showPrivacyMessage(action: string): void {
    if (action === 'export-data') {
      this.privacyMessage =
        'Data export will be available after backend integration.';
      return;
    }

    if (action === 'remove-bank-data') {
      if (this.bankDeleteLoading) {
        return;
      }

      this.activeModal = 'confirm-remove-bank-data';
    }
  }

  // Return to the privacy modal without deleting data
  cancelBankDeleteConfirmation(): void {
    if (this.bankDeleteLoading) {
      return;
    }

    this.activeModal = 'privacy-data';
  }

  // Confirm and remove imported bank transactions
  confirmRemoveBankData(): void {
    if (this.bankDeleteLoading) {
      return;
    }

    this.bankDeleteLoading = true;

    this.bankApi.deleteImportedTransactions().subscribe({
      next: (response) => {
        this.privacyMessage =
          `${response.deleted_count} imported bank transactions removed. ` +
          'Your connected accounts and cash transactions remain unchanged. ' +
          'Deleted transactions may reappear during the next bank sync while your bank connection remains active.';

        this.bankDeleteLoading = false;
        this.activeModal = 'privacy-data';
        this.cdr.detectChanges();
      },

      error: () => {
        this.privacyMessage =
          'Unable to remove imported bank transactions. Please try again.';

        this.bankDeleteLoading = false;
        this.activeModal = 'privacy-data';
        this.cdr.detectChanges();
      },
    });
  }

  // Log out using Flask session-based authentication
  confirmLogout(): void {
    if (this.logoutLoading) {
      return;
    }

    this.logoutLoading = true;
    this.logoutError = '';

    this.auth.logout().subscribe({
      next: () => {
        this.logoutLoading = false;
        this.closeModal();
        void this.router.navigateByUrl('/auth/login');
      },

      error: (error: Error) => {
        this.logoutLoading = false;
        this.logoutError =
          error.message || 'Logout failed. Please try again.';

        this.cdr.detectChanges();
      },
    });
  }

  // Return to the Profile & Assets page
  goBack(): void {
    void this.router.navigateByUrl('/app/profile');
  }


async loadExpectedIncome(): Promise<void> {
  const month = this.incomeMonth;

  this.incomeLoading = true;
  this.incomeError = '';
  this.incomeMessage = '';
  this.incomeSummary = null;
  this.incomeAmount = null;

  try {
    const summary = await firstValueFrom(
      this.monthlyIncomeApi.getSummary(month)
    );

    if (
      this.activeModal !== 'expected-income' ||
      this.incomeMonth !== month
    ) {
      return;
    }

    this.incomeSummary = summary;
    this.incomeAmount = summary.expectedIncome;

  } catch {
    if (
      this.activeModal === 'expected-income' &&
      this.incomeMonth === month
    ) {
      this.incomeError =
        'Unable to load expected income. Please try again.';
    }

  } finally {
    if (
      this.activeModal === 'expected-income' &&
      this.incomeMonth === month
    ) {
      this.incomeLoading = false;
      this.cdr.detectChanges();
    }
  }
}

async saveExpectedIncome(): Promise<void> {
  if (
    this.incomeSaving ||
    this.incomeLoading ||
    this.activeModal !== 'expected-income'
  ) {
    return;
  }

  this.incomeError = '';
  this.incomeMessage = '';

  const amount = this.incomeAmount;
  const month = this.incomeMonth;

  if (
    !Number.isInteger(Number(month.slice(0, 4))) ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
    Number(month.slice(0, 4)) < 1 ||
    Number(month.slice(0, 4)) > 9998
  ) {
    this.incomeError = 'Select a valid month.';
    return;
  }

  if (
    amount === null ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    amount > 999999999999.99
  ) {
    this.incomeError =
      'Enter a valid expected income of zero or more.';
    return;
  }

  if (
    Math.abs(amount - Number(amount.toFixed(2))) > 1e-9
  ) {
    this.incomeError =
      'Income cannot exceed two decimal places.';
    return;
  }

  this.incomeSaving = true;

  try {
    await firstValueFrom(
      this.monthlyIncomeApi.saveExpectedIncome(
        month,
        amount
      )
    );

    await this.loadExpectedIncome();

    if (!this.incomeError) {
      this.incomeMessage =
        'Expected income saved successfully.';
    }
  } catch {
    this.incomeError =
      'Unable to save expected income. Please try again.';
  } finally {
    this.incomeSaving = false;
    this.cdr.detectChanges();
  }
}


regularIncomeProfile: RegularIncomeProfile | null = null;

regularIncomeType: RegularIncomeType = 'SALARY';
regularIncomeAmount: number | null = null;
regularPayFrequency: PayFrequency = 'WEEKLY';
regularHoursPerWeek: number | null = null;

regularIncomeLoading = false;
regularIncomeSaving = false;
regularIncomeError = '';
regularIncomeMessage = '';
regularIncomePrefillMessage = '';

private async prefillRegularIncomeFromPayroll(): Promise<void> {
  const settingsResponse = await firstValueFrom(
    this.payrollApi.getSettings()
  );

  const settings = settingsResponse.settings;

  if (!settings) {
    return;
  }

  const estimateResponse = await firstValueFrom(
    this.payrollApi.getEstimate()
  );

  const estimate = estimateResponse.estimate;

  const netPerPay = Number(estimate.netPerPay);

  if (!Number.isFinite(netPerPay) || netPerPay < 0) {
    return;
  }

  this.regularIncomeType = settings.incomeType;

  if (settings.incomeType === 'SALARY') {
    if (settings.payFrequency === 'FOUR_WEEKLY') {
      // Regular Income does not support four-weekly frequency.
      // Convert 13 four-weekly payments into 12 monthly periods.
      this.regularIncomeAmount = Number(
        ((netPerPay * 13) / 12).toFixed(2)
      );

      this.regularPayFrequency = 'MONTHLY';
    } else {
      this.regularIncomeAmount = Number(
        netPerPay.toFixed(2)
      );

      this.regularPayFrequency = settings.payFrequency;
    }

    this.regularHoursPerWeek = null;
  } else {
    const hoursPerWeek = Number(settings.hoursPerWeek);

    if (
      !Number.isFinite(hoursPerWeek) ||
      hoursPerWeek <= 0 ||
      hoursPerWeek > 168
    ) {
      return;
    }

    const weeksPerPay: Record<PayrollFrequency, number> = {
      WEEKLY: 1,
      FORTNIGHTLY: 2,
      FOUR_WEEKLY: 4,
      MONTHLY: 52 / 12,
    };

    const hoursPerPay =
      hoursPerWeek * weeksPerPay[settings.payFrequency];

    this.regularIncomeAmount = Number(
      (netPerPay / hoursPerPay).toFixed(2)
    );

    this.regularHoursPerWeek = hoursPerWeek;
  }

  this.regularIncomePrefillMessage =
    'These values were estimated from your onboarding payroll settings. Review them and select Save regular pay to confirm.';
}

async loadRegularIncomeProfile(): Promise<void> {
  const requestId = ++this.regularIncomeRequestId;

  this.regularIncomeLoading = true;
  this.regularIncomeError = '';
  this.regularIncomeMessage = '';
  this.regularIncomePrefillMessage = '';

  // Keep the remaining existing code unchanged.

  try {
    const profile = await firstValueFrom(
      this.regularIncomeApi.getProfile()
    );

    if (
      requestId !== this.regularIncomeRequestId ||
      this.activeModal !== 'expected-income'
    ) {
      return;
    }

    this.regularIncomeProfile = profile;
    this.regularIncomePrefillMessage = '';

    if (profile) {
      this.regularIncomeType = profile.incomeType;
      this.regularIncomeAmount = profile.amount;

      this.regularPayFrequency =
        profile.payFrequency ?? 'WEEKLY';

      this.regularHoursPerWeek =
        profile.hoursPerWeek;
    } else {
      this.regularIncomeType = 'SALARY';
      this.regularIncomeAmount = null;
      this.regularPayFrequency = 'WEEKLY';
      this.regularHoursPerWeek = null;

      try {
        await this.prefillRegularIncomeFromPayroll();
      } catch {
        // Payroll information is optional.
        // Users can still enter their regular income manually.
      }

      if (
        requestId !== this.regularIncomeRequestId ||
        this.activeModal !== 'expected-income'
      ) {
        return;
      }
    }

  } catch {
    if (
      requestId === this.regularIncomeRequestId &&
      this.activeModal === 'expected-income'
    ) {
      this.regularIncomeError =
        'Unable to load regular income settings. Please try again.';
    }

  } finally {
    if (requestId === this.regularIncomeRequestId) {
      this.regularIncomeLoading = false;
      this.cdr.detectChanges();
    }
  }
}

async saveRegularIncome(): Promise<void> {
  if (
    this.personalDetailsLoading ||
    this.passwordLoading ||
    this.logoutLoading ||
    this.incomeSaving ||
    this.regularIncomeLoading ||
    this.regularIncomeSaving
  ) {
    return;
  }


  this.regularIncomeError = '';
  this.regularIncomeMessage = '';

  const incomeType = this.regularIncomeType;
  const amount = this.regularIncomeAmount;
  const hours = this.regularHoursPerWeek;

  // Validate the regular pay amount.
  if (
    amount === null ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    amount > 999999999999.99
  ) {
    this.regularIncomeError =
      'Enter a valid income amount of zero or more.';
    return;
  }

  if (
    Math.abs(amount - Number(amount.toFixed(2))) > 1e-9
  ) {
    this.regularIncomeError =
      'Income cannot exceed two decimal places.';
    return;
  }

  // Validate hourly workers' usual weekly hours.
  if (incomeType === 'HOURLY') {
    if (
      hours === null ||
      !Number.isFinite(hours) ||
      hours < 0 ||
      hours > 168
    ) {
      this.regularIncomeError =
        'Enter weekly hours between 0 and 168.';
      return;
    }

    if (
      Math.abs(hours - Number(hours.toFixed(2))) > 1e-9
    ) {
      this.regularIncomeError =
        'Weekly hours cannot exceed two decimal places.';
      return;
    }
  }

  this.regularIncomeSaving = true;

  try {
    const saved = await firstValueFrom(
      this.regularIncomeApi.saveProfile({
        incomeType,
        amount,
        payFrequency:
          incomeType === 'SALARY'
            ? this.regularPayFrequency
            : null,
        hoursPerWeek:
          incomeType === 'HOURLY'
            ? hours
            : null,
      })
    );

    this.regularIncomeProfile = saved;
    this.regularIncomePrefillMessage = '';

    // The regular income save succeeded.
    this.regularIncomeMessage =
      'Regular income saved successfully.';

    // Refresh the monthly summary after saving.
    if (this.activeModal === 'expected-income') {
      await this.loadExpectedIncome();

      if (this.incomeError) {
        this.regularIncomeMessage =
          'Regular income was saved, but the monthly summary could not be refreshed. Please use Reload income.';
      }
    }

  } catch (error: unknown) {
    this.regularIncomeError =
      error instanceof HttpErrorResponse &&
      typeof error.error?.error === 'string'
        ? error.error.error
        : 'Unable to save regular income. Please try again.';

  } finally {
    this.regularIncomeSaving = false;
    this.cdr.detectChanges();
  }
}

  onRegularIncomeTypeChange(type: RegularIncomeType): void {
    this.regularIncomeType = type;

    this.regularIncomeAmount = null;
    this.regularHoursPerWeek = null;

    this.regularIncomeError = '';
    this.regularIncomeMessage = '';
    this.regularIncomePrefillMessage = '';
  }
}