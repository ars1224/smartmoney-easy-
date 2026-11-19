import { Component, OnDestroy, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { finalize } from 'rxjs';

import { AuthService } from '../../../core/auth/auth.service';


type RecoveryStep = 'verify' | 'password' | 'save-code';


function matchingPasswords(
  control: AbstractControl
): ValidationErrors | null {
  const password = control.get('newPassword')?.value;
  const confirmation = control.get('confirmPassword')?.value;

  return password === confirmation
    ? null
    : { passwordMismatch: true };
}


@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [
    IonContent,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './forgot-password.page.html',
  styleUrl: './forgot-password.page.scss',
})
export class ForgotPasswordPage implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  readonly step = signal<RecoveryStep>('verify');

  readonly loading = signal(false);
  readonly serverError = signal('');

  readonly showRecoveryCode = signal(false);
  readonly showPassword = signal(false);

  readonly replacementRecoveryCode = signal('');
  readonly recoveryCodeConfirmed = signal(false);
  readonly recoveryCopyMessage = signal('');

  readonly identityForm = this.fb.nonNullable.group({
    email: [
      '',
      [
        Validators.required,
        Validators.email,
        Validators.maxLength(255),
      ],
    ],
    name: [
      '',
      [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(100),
      ],
    ],
    recoveryCode: [
      '',
      [
        Validators.required,
        Validators.pattern(
          /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/i
        ),
      ],
    ],
  });

  readonly passwordForm = this.fb.nonNullable.group(
    {
      newPassword: [
        '',
        [
          Validators.required,
          Validators.minLength(12),
          Validators.maxLength(128),
        ],
      ],
      confirmPassword: [
        '',
        Validators.required,
      ],
    },
    {
      validators: matchingPasswords,
    }
  );


  submitVerification(): void {
    if (
      this.loading() ||
      this.step() !== 'verify'
    ) {
      return;
    }

    this.serverError.set('');

    if (this.identityForm.invalid) {
      this.identityForm.markAllAsTouched();

      return;
    }

    const {
      email,
      name,
      recoveryCode,
    } = this.identityForm.getRawValue();

    this.loading.set(true);

    this.auth
      .verifyRecovery(
        email,
        name,
        recoveryCode
      )
      .pipe(
        finalize(() => this.loading.set(false))
      )
      .subscribe({
        next: () => {
          this.serverError.set('');
          this.step.set('password');
        },
        error: (error: Error) => {
          this.serverError.set(error.message);
        },
      });
  }


  submitNewPassword(): void {
    if (
      this.loading() ||
      this.step() !== 'password'
    ) {
      return;
    }

    this.serverError.set('');

    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();

      return;
    }

    const {
      email,
      name,
      recoveryCode,
    } = this.identityForm.getRawValue();

    const {
      newPassword,
      confirmPassword,
    } = this.passwordForm.getRawValue();

    this.loading.set(true);

    this.auth
      .resetPasswordWithRecovery(
        email,
        name,
        recoveryCode,
        newPassword,
        confirmPassword
      )
      .pipe(
        finalize(() => this.loading.set(false))
      )
      .subscribe({
        next: result => {
          // Hold the replacement recovery code in memory only.
          this.replacementRecoveryCode.set(
            result.recoveryCode
          );

          this.recoveryCodeConfirmed.set(false);
          this.recoveryCopyMessage.set('');

          // Remove the submitted recovery code and passwords.
          this.identityForm.reset();
          this.passwordForm.reset();

          this.showRecoveryCode.set(false);
          this.showPassword.set(false);

          this.serverError.set('');

          this.step.set('save-code');
        },
        error: (error: Error) => {
          this.serverError.set(error.message);
        },
      });
  }


  backToVerification(): void {
    if (
      this.loading() ||
      this.step() !== 'password'
    ) {
      return;
    }

    this.passwordForm.reset();
    this.showPassword.set(false);

    this.serverError.set('');
    this.step.set('verify');
  }


  async copyRecoveryCode(): Promise<void> {
    const code = this.replacementRecoveryCode();

    if (
      this.step() !== 'save-code' ||
      !code
    ) {
      return;
    }

    this.recoveryCopyMessage.set('');

    if (!navigator.clipboard?.writeText) {
      this.recoveryCopyMessage.set(
        'Automatic copying is unavailable. Please select and copy your recovery code manually.'
      );

      return;
    }

    try {
      await navigator.clipboard.writeText(code);

      this.recoveryCopyMessage.set(
        'Recovery code copied successfully.'
      );
    } catch {
      this.recoveryCopyMessage.set(
        'Unable to copy automatically. Please select and copy your recovery code manually.'
      );
    }
  }


  continueToLogin(): void {
    if (
      this.step() !== 'save-code' ||
      !this.replacementRecoveryCode() ||
      !this.recoveryCodeConfirmed()
    ) {
      return;
    }

    // Clear the one-time recovery code before navigating.
    this.replacementRecoveryCode.set('');

    this.recoveryCodeConfirmed.set(false);
    this.recoveryCopyMessage.set('');

    void this.router.navigateByUrl('/auth/login');
  }


  ngOnDestroy(): void {
    // Never retain recovery credentials after leaving this page.
    this.replacementRecoveryCode.set('');

    this.identityForm.reset();
    this.passwordForm.reset();

    this.recoveryCodeConfirmed.set(false);
    this.recoveryCopyMessage.set('');
  }
}