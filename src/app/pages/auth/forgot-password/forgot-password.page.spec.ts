import {
  ComponentFixture,
  TestBed,
} from '@angular/core/testing';

import {
  provideRouter,
  Router,
} from '@angular/router';

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  of,
  Subject,
  throwError,
} from 'rxjs';

import { AuthService } from '../../../core/auth/auth.service';
import { ForgotPasswordPage } from './forgot-password.page';

describe('ForgotPasswordPage', () => {
  let fixture: ComponentFixture<ForgotPasswordPage>;
  let component: ForgotPasswordPage;
  let router: Router;

  const verifyRecovery = vi.fn();
  const resetPasswordWithRecovery = vi.fn();

  const validRecoveryDetails = {
    email: 'recovery@example.test',
    name: 'Recovery Test User',
    recoveryCode: 'ABC2D3',
  };

  const validPasswords = {
    newPassword: 'NewSecurePassword123!',
    confirmPassword: 'NewSecurePassword123!',
  };

  const replacementCode = 'Q2W3E4';

  function fillRecoveryDetails(): void {
    component.identityForm.setValue(
      validRecoveryDetails
    );
  }

  function advanceToPasswordStep(): void {
    fillRecoveryDetails();

    component.submitVerification();

    fixture.detectChanges();
  }

  function completePasswordReset(): void {
    advanceToPasswordStep();

    component.passwordForm.setValue(
      validPasswords
    );

    component.submitNewPassword();

    fixture.detectChanges();
  }

  beforeEach(async () => {
    verifyRecovery.mockReset();
    resetPasswordWithRecovery.mockReset();

    verifyRecovery.mockReturnValue(
      of(undefined)
    );

    resetPasswordWithRecovery.mockReturnValue(
      of({
        recoveryCode: replacementCode,
      })
    );

    await TestBed.configureTestingModule({
      imports: [
        ForgotPasswordPage,
      ],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            verifyRecovery,
            resetPasswordWithRecovery,
          },
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);

    vi.spyOn(
      router,
      'navigateByUrl'
    ).mockResolvedValue(true);

    fixture = TestBed.createComponent(
      ForgotPasswordPage
    );

    component = fixture.componentInstance;

    fixture.detectChanges();
  });

  it('starts with the recovery verification form', () => {
    expect(component.step()).toBe('verify');

    expect(
      component.replacementRecoveryCode()
    ).toBe('');

    const emailInput =
      fixture.nativeElement.querySelector(
        '#recovery-email'
      );

    const nameInput =
      fixture.nativeElement.querySelector(
        '#recovery-name'
      );

    const codeInput =
      fixture.nativeElement.querySelector(
        '#recovery-code'
      );

    expect(emailInput).not.toBeNull();
    expect(nameInput).not.toBeNull();
    expect(codeInput).not.toBeNull();
  });

  it('rejects an invalid email without calling the backend', () => {
    component.identityForm.setValue({
      email: 'not-an-email',
      name: 'Recovery Test User',
      recoveryCode: 'ABC2D3',
    });

    component.submitVerification();

    expect(
      component.identityForm.controls.email.invalid
    ).toBe(true);

    expect(verifyRecovery).not.toHaveBeenCalled();

    expect(component.step()).toBe('verify');
  });

  it('rejects an invalid recovery code without calling the backend', () => {
    component.identityForm.setValue({
      email: 'recovery@example.test',
      name: 'Recovery Test User',
      recoveryCode: 'ABCI12',
    });

    component.submitVerification();

    expect(
      component.identityForm.controls.recoveryCode.invalid
    ).toBe(true);

    expect(verifyRecovery).not.toHaveBeenCalled();

    expect(component.step()).toBe('verify');
  });

  it('advances to the password form after successful verification', () => {
    fillRecoveryDetails();

    component.submitVerification();

    fixture.detectChanges();

    expect(verifyRecovery).toHaveBeenCalledWith(
      'recovery@example.test',
      'Recovery Test User',
      'ABC2D3'
    );

    expect(component.step()).toBe('password');

    const passwordInput =
      fixture.nativeElement.querySelector(
        '#new-password'
      );

    expect(passwordInput).not.toBeNull();

    expect(
      component.replacementRecoveryCode()
    ).toBe('');
  });

  it('prevents duplicate verification requests while loading', () => {
    const verificationResponse =
      new Subject<void>();

    verifyRecovery.mockReturnValue(
      verificationResponse.asObservable()
    );

    fillRecoveryDetails();

    component.submitVerification();

    expect(component.loading()).toBe(true);

    component.submitVerification();

    expect(
      verifyRecovery
    ).toHaveBeenCalledTimes(1);

    verificationResponse.next();
    verificationResponse.complete();

    expect(component.loading()).toBe(false);

    expect(component.step()).toBe('password');
  });

  it('keeps the verification form open after a backend error', () => {
    verifyRecovery.mockReturnValue(
      throwError(
        () => new Error(
          'Unable to verify recovery details.'
        )
      )
    );

    fillRecoveryDetails();

    component.submitVerification();

    fixture.detectChanges();

    expect(component.step()).toBe('verify');

    expect(component.serverError()).toBe(
      'Unable to verify recovery details.'
    );

    expect(
      component.replacementRecoveryCode()
    ).toBe('');

    expect(component.loading()).toBe(false);
  });

  it('rejects mismatched passwords without resetting the account', () => {
    advanceToPasswordStep();

    component.passwordForm.setValue({
      newPassword: 'NewSecurePassword123!',
      confirmPassword: 'DifferentPassword123!',
    });

    component.submitNewPassword();

    expect(
      component.passwordForm.hasError(
        'passwordMismatch'
      )
    ).toBe(true);

    expect(
      resetPasswordWithRecovery
    ).not.toHaveBeenCalled();

    expect(component.step()).toBe('password');
  });

  it('displays a replacement code and clears sensitive forms after reset', () => {
    completePasswordReset();

    expect(
      resetPasswordWithRecovery
    ).toHaveBeenCalledWith(
      'recovery@example.test',
      'Recovery Test User',
      'ABC2D3',
      'NewSecurePassword123!',
      'NewSecurePassword123!'
    );

    expect(component.step()).toBe('save-code');

    expect(
      component.replacementRecoveryCode()
    ).toBe(replacementCode);

    expect(
      component.identityForm.controls.recoveryCode.value
    ).toBe('');

    expect(
      component.passwordForm.controls.newPassword.value
    ).toBe('');

    expect(
      component.passwordForm.controls.confirmPassword.value
    ).toBe('');

    const replacementInput =
      fixture.nativeElement.querySelector(
        '#replacement-recovery-code'
      ) as HTMLInputElement | null;

    expect(replacementInput).not.toBeNull();

    expect(
      replacementInput?.value
    ).toBe(replacementCode);
  });

  it('keeps the password form open when resetting fails', () => {
    advanceToPasswordStep();

    resetPasswordWithRecovery.mockReturnValue(
      throwError(
        () => new Error(
          'Recovery reset is temporarily unavailable.'
        )
      )
    );

    component.passwordForm.setValue(
      validPasswords
    );

    component.submitNewPassword();

    expect(component.step()).toBe('password');

    expect(component.serverError()).toBe(
      'Recovery reset is temporarily unavailable.'
    );

    expect(
      component.replacementRecoveryCode()
    ).toBe('');

    expect(component.loading()).toBe(false);
  });

  it('requires acknowledgment before navigating to login', () => {
    completePasswordReset();

    component.continueToLogin();

    expect(
      router.navigateByUrl
    ).not.toHaveBeenCalled();

    expect(
      component.replacementRecoveryCode()
    ).toBe(replacementCode);

    component.recoveryCodeConfirmed.set(true);

    component.continueToLogin();

    expect(
      router.navigateByUrl
    ).toHaveBeenCalledWith('/auth/login');

    expect(
      component.replacementRecoveryCode()
    ).toBe('');

    expect(
      component.recoveryCodeConfirmed()
    ).toBe(false);
  });

  it('allows returning to verification without retaining the new password', () => {
    advanceToPasswordStep();

    component.passwordForm.setValue(
      validPasswords
    );

    component.backToVerification();

    expect(component.step()).toBe('verify');

    expect(
      component.passwordForm.controls.newPassword.value
    ).toBe('');

    expect(
      component.passwordForm.controls.confirmPassword.value
    ).toBe('');
  });

  it('clears the replacement recovery code when the page is destroyed', () => {
    completePasswordReset();

    expect(
      component.replacementRecoveryCode()
    ).toBe(replacementCode);

    fixture.destroy();

    expect(
      component.replacementRecoveryCode()
    ).toBe('');

    expect(
      component.identityForm.controls.recoveryCode.value
    ).toBe('');
  });
});