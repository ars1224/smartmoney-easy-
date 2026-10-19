
import { Component, inject } from '@angular/core';
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

  activeModal: SettingsModal = null;

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
  openSetting(action: string): void {
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
      this.activeModal = 'delete-account';
      return;
    }

    console.log('Selected setting:', action);
  }

  // Close the modal and reset temporary messages
  closeModal(): void {
    this.activeModal = null;

    this.personalDetailsError = '';
    this.personalDetailsMessage = '';

    this.passwordError = '';
    this.passwordMessage = '';

    this.privacyMessage = '';
    this.deleteConfirmation = '';
  }

  // Validate personal details
  savePersonalDetails(): void {
    const name = this.personalName.trim();
    const email = this.personalEmail.trim();

    if (!name) {
      this.personalDetailsError =
        'Please enter your full name.';
      this.personalDetailsMessage = '';
      return;
    }

    if (
      !email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      this.personalDetailsError =
        'Please enter a valid email address.';
      this.personalDetailsMessage = '';
      return;
    }

    // Saving will be implemented after integration.
    this.personalDetailsError = '';
    this.personalDetailsMessage =
      'Your details look valid. Saving will be available after integration.';
  }

  // Validate password fields
  updatePassword(): void {
    if (!this.currentPassword) {
      this.passwordError =
        'Please enter your current password.';
      this.passwordMessage = '';
      return;
    }

    if (this.newPassword.length < 8) {
      this.passwordError =
        'Your new password must be at least 8 characters.';
      this.passwordMessage = '';
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.passwordError =
        'Your passwords do not match.';
      this.passwordMessage = '';
      return;
    }

    // Actual password changes will be implemented later.
    this.passwordError = '';
    this.passwordMessage =
      'Your password meets the requirements. Updating will be available after integration.';
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
    this.auth.logout();
    this.closeModal();
    void this.router.navigateByUrl('/auth/login');
  }

  // Validate the account deletion confirmation
  confirmDeleteAccount(): void {
    if (this.deleteConfirmation !== 'DELETE') {
      return;
    }

    // Account deletion is not connected to the backend yet.
    // Do not delete the account or log the user out.
    this.closeModal();
  }

  // Return to the previous page
  goBack(): void {
    window.history.back();
  }
}
