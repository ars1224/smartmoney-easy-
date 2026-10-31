import { Component, ElementRef, HostListener, ViewChild, ChangeDetectorRef, inject } from '@angular/core';
import { IonContent } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { SmCardComponent } from '../../shared/ui/sm-card/sm-card.component';
import { SmButtonComponent } from '../../shared/ui/sm-button/sm-button.component';
import { AuthService } from '../../core/auth/auth.service';

type SettingsModal =
  | 'personal-details'
  | 'change-password'
  | 'privacy-data'
  | 'logout'
  | 'delete-account'
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
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  activeModal: SettingsModal = null;

  personalDetailsLoading = false;
  passwordLoading = false;
  logoutLoading = false;

  private modalTrigger: HTMLElement | null = null;
  private modalElement: HTMLElement | null = null;

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
    }) 
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

  // Delete account
  deleteConfirmation = '';
  deleteAccountMessage = '';

  // Settings cards
  readonly settings = [
    {
      title: 'Personal details',
      description: 'Manage this setting',
      action: 'personal-details',
    },
    {
      title: 'Change password',
      description: 'Manage this setting',
      action: 'change-password',
    },
    {
      title: 'Export my data',
      description: 'Manage this setting',
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
      description: 'Permanent action requiring confirmation',
      action: 'delete-account',
      danger: true,
    },
  ];

  // Open the relevant settings modal
  openSetting(action: string, event?: MouseEvent): void {
    const trigger = event?.currentTarget;

    this.modalTrigger =
      trigger instanceof HTMLElement ? trigger : null;

    if (action === 'personal-details') {
      const user = this.auth.currentUser();

      this.personalName = user?.name ?? '';
      this.personalEmail = user?.email ?? '';
      this.personalDetailsError = '';
      this.personalDetailsMessage = '';
      this.activeModal = 'personal-details';
      return;
    }

    if (action === 'change-password') {
      this.currentPassword = '';
      this.newPassword = '';
      this.confirmPassword = '';
      this.passwordError = '';
      this.passwordMessage = '';
      this.activeModal = 'change-password';
      return;
    }

    if (
      action === 'export-data' ||
      action === 'remove-bank-data'
    ) {
      this.privacyMessage = '';
      this.activeModal = 'privacy-data';
      return;
    }

    if (action === 'logout') {
      this.activeModal = 'logout';
      return;
    }

    if (action === 'delete-account') {
      this.deleteConfirmation = '';
      this.deleteAccountMessage = '';
      this.activeModal = 'delete-account';
      return;
    }

    this.modalTrigger = null;
    console.log('Selected setting:', action);
  }

  // Close the modal and reset temporary messages
  closeModal(): void {
    // Prevent closing while an API request is in progress.
    if (
      this. personalDetailsLoading ||
      this.passwordLoading ||
      this.logoutLoading
    ) {
      return;
    }

    const trigger = this.modalTrigger;

    this.activeModal = null;
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
    this.deleteConfirmation = '';

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
      this.privacyMessage =
        'Bank data removal will be available after backend integration.';
    }
  }

  // Log out and return to the login page
  confirmLogout(): void {
    if (this.logoutLoading) {
      return;
    }

    this.logoutLoading = true;

    this.auth.logout().subscribe({
      next: () => {
        this.logoutLoading = false;
        this.closeModal();
        void this.router.navigateByUrl('/auth/login');
      },
      error: (error: Error) => {
        this.logoutLoading = false;
        console.error('Logout failed:', error.message);
      },
    });
  }

  // Validate the account deletion confirmation
  confirmDeleteAccount(): void {
    if (this.deleteConfirmation !== 'DELETE') {
      return;
    }

    // Account deletion is not connected to the backend yet.
    // Do not delete the account or log the user out.
    this.deleteAccountMessage = 'Account data backend is not connected. Account deletion is not available yet and your account has not been deleted.';
  }

  // Return to the Profile & Assets page
  goBack(): void {
    void this.router.navigateByUrl('/app/profile');
  }
}
