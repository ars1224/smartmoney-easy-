import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { finalize } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';

function matchingPasswords(control: AbstractControl): ValidationErrors | null {
  return control.get('password')?.value === control.get('confirmPassword')?.value
    ? null
    : { passwordMismatch: true };
}

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [IonContent, ReactiveFormsModule, RouterLink],
  templateUrl: './register.page.html',
  styleUrl: './register.page.scss',
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly serverError = signal('');
  readonly showPassword = signal(false);
  readonly recoveryCode = signal('');
  readonly recoveryCodeConfirmed = signal(false);
  readonly recoveryCopyMessage = signal('');
  readonly form = this.fb.nonNullable.group(
    {
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      password: [
        '',
        [
          Validators.required,
          Validators.minLength(12),
          Validators.maxLength(128),
        ],
      ],
      confirmPassword: ['', Validators.required],
    },
    { validators: matchingPasswords },
  );

  submit(): void {
    this.serverError.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    const { name, email, password } = this.form.getRawValue();
    this.auth
      .register(name, email, password)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: result => {
          this.recoveryCode.set(result.recoveryCode);
          this.recoveryCodeConfirmed.set(false);
        },
        error: (error: Error) => this.serverError.set(error.message),
      });
  }

  continueToOnboarding(): void {
    if (
      !this.recoveryCode() ||
      !this.recoveryCodeConfirmed()
    ) {
      return;
    }

    this.recoveryCode.set('');

    void this.router.navigateByUrl('/onboarding');
  }

async copyRecoveryCode(): Promise<void> {
  const code = this.recoveryCode();

  if (!code) {
    return;
  }

  this.recoveryCopyMessage.set('');

  if (!navigator.clipboard?.writeText) {
    this.recoveryCopyMessage.set(
      'Automatic copying is unavailable. Please select and copy your code manually.'
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
      'Unable to copy automatically. Please select and copy your code manually.'
    );
  }
}
}
