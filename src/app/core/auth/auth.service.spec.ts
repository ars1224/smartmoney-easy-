
import { TestBed } from '@angular/core/testing';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  HttpErrorResponse,
  provideHttpClient,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

describe('AuthService', () => {
  let service: AuthService;
  let httpTestingController: HttpTestingController;

  const sessionUrl = `${environment.apiUrl}/auth/me`;

  const mockUser = {
    id: 'test-user-1',
    name: 'Test User',
    email: 'test@example.com',
  };

  beforeEach(() => {
    sessionStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(AuthService);
    httpTestingController = TestBed.inject(
      HttpTestingController
    );
  });

  afterEach(() => {
    httpTestingController.verify();
    sessionStorage.clear();
  });

  it('should not mark the session as expired on first visit', () => {
    let result: boolean | undefined;

    service.verifySession().subscribe(value => {
      result = value;
    });

    const request =
      httpTestingController.expectOne(sessionUrl);

    request.flush(
      { error: 'Unauthorized' },
      {
        status: 401,
        statusText: 'Unauthorized',
      }
    );

    expect(result).toBe(false);
    expect(service.sessionExpired()).toBe(false);
    expect(service.isAuthenticated()).toBe(false);
  });

  it('should mark the session as expired when an existing session returns 401', () => {
    sessionStorage.setItem(
      'smartmoney-had-session',
      'true'
    );

    let result: boolean | undefined;

    service.verifySession().subscribe(value => {
      result = value;
    });

    const request =
      httpTestingController.expectOne(sessionUrl);

    request.flush(
      { error: 'Unauthorized' },
      {
        status: 401,
        statusText: 'Unauthorized',
      }
    );

    expect(result).toBe(false);
    expect(service.sessionExpired()).toBe(true);
    expect(service.isAuthenticated()).toBe(false);
  });

  it('should preserve the existing session when the server returns 500', () => {
    sessionStorage.setItem(
      'smartmoney-had-session',
      'true'
    );

    // Establish an authenticated session first.
    service.verifySession().subscribe();

    const initialRequest =
      httpTestingController.expectOne(sessionUrl);

    initialRequest.flush({
      user: mockUser,
    });

    let receivedError: unknown;

    // Verify the session again and simulate a server error.
    service.verifySession().subscribe({
      error: error => {
        receivedError = error;
      },
    });

    const request =
      httpTestingController.expectOne(sessionUrl);

    request.flush(
      { error: 'Internal Server Error' },
      {
        status: 500,
        statusText: 'Internal Server Error',
      }
    );

    expect(receivedError).toBeInstanceOf(HttpErrorResponse);

    expect(
      (receivedError as HttpErrorResponse).status
    ).toBe(500);

    expect(service.sessionExpired()).toBe(false);
    expect(service.isAuthenticated()).toBe(true);

    expect(service.currentUser()).toEqual({
      name: 'Test User',
      email: 'test@example.com',
    });
  });

  it('should share one session verification request between concurrent subscribers', () => {
    let firstResult: boolean | undefined;
    let secondResult: boolean | undefined;

    service.verifySession().subscribe(value => {
      firstResult = value;
    });

    service.verifySession().subscribe(value => {
      secondResult = value;
    });

    const requests =
      httpTestingController.match(sessionUrl);

    expect(requests.length).toBe(1);

    requests[0].flush({
      user: mockUser,
    });

    expect(firstResult).toBe(true);
    expect(secondResult).toBe(true);
    expect(service.isAuthenticated()).toBe(true);
    expect(service.currentUser()).toEqual({
      name: 'Test User',
      email: 'test@example.com',
    });
  });
    it('returns the one-time recovery code after registration', () => {
    let recoveryCode: string | undefined;

    service.register(
      '  Test User  ',
      '  TEST@EXAMPLE.COM  ',
      'SecurePassword123!'
    ).subscribe(result => {
      recoveryCode = result.recoveryCode;
    });

    const csrfRequest =
      httpTestingController.expectOne(
        `${environment.apiUrl}/auth/csrf`
      );

    expect(csrfRequest.request.method).toBe('GET');
    expect(csrfRequest.request.withCredentials).toBe(true);

    csrfRequest.flush({
      csrf_token: 'registration-csrf',
    });

    const registerRequest =
      httpTestingController.expectOne(
        `${environment.apiUrl}/auth/register`
      );

    expect(registerRequest.request.method).toBe('POST');

    expect(registerRequest.request.withCredentials).toBe(true);

    expect(
      registerRequest.request.headers.get('X-CSRF-Token')
    ).toBe('registration-csrf');

    expect(registerRequest.request.body).toEqual({
      name: 'Test User',
      email: 'test@example.com',
      password: 'SecurePassword123!',
    });

    registerRequest.flush(
      {
        message: 'Account created successfully.',
        user: mockUser,
        csrf_token: 'authenticated-csrf',
        recovery_code: 'ABC2D3',
      },
      {
        status: 201,
        statusText: 'Created',
      }
    );

    expect(recoveryCode).toBe('ABC2D3');

    expect(service.isAuthenticated()).toBe(true);

    expect(service.currentUser()).toEqual({
      name: 'Test User',
      email: 'test@example.com',
    });

    expect(
      sessionStorage.getItem('smartmoney-had-session')
    ).toBe('true');
  });

  it('sends normalized recovery details with CSRF protection', () => {
    let completed = false;

    service.verifyRecovery(
      '  RECOVERY@EXAMPLE.TEST  ',
      '  Recovery Test User  ',
      '  abc2d3  '
    ).subscribe(() => {
      completed = true;
    });

    const csrfRequest =
      httpTestingController.expectOne(
        `${environment.apiUrl}/auth/csrf`
      );

    expect(csrfRequest.request.method).toBe('GET');

    expect(csrfRequest.request.withCredentials).toBe(true);

    csrfRequest.flush({
      csrf_token: 'verification-csrf',
    });

    const verifyRequest =
      httpTestingController.expectOne(
        `${environment.apiUrl}/auth/recovery/verify`
      );

    expect(verifyRequest.request.method).toBe('POST');

    expect(verifyRequest.request.withCredentials).toBe(true);

    expect(
      verifyRequest.request.headers.get('X-CSRF-Token')
    ).toBe('verification-csrf');

    expect(verifyRequest.request.body).toEqual({
      email: 'recovery@example.test',
      name: 'Recovery Test User',
      recoveryCode: 'ABC2D3',
    });

    verifyRequest.flush({
      verified: true,
    });

    expect(completed).toBe(true);

    // Successful verification must not authenticate the user.
    expect(service.isAuthenticated()).toBe(false);
  });

  it('handles failed recovery verification without authenticating the user', () => {
    let receivedError: unknown;

    service.verifyRecovery(
      'unknown@example.test',
      'Unknown User',
      'ABC2D3'
    ).subscribe({
      error: error => {
        receivedError = error;
      },
    });

    const csrfRequest =
      httpTestingController.expectOne(
        `${environment.apiUrl}/auth/csrf`
      );

    csrfRequest.flush({
      csrf_token: 'verification-csrf',
    });

    const verifyRequest =
      httpTestingController.expectOne(
        `${environment.apiUrl}/auth/recovery/verify`
      );

    verifyRequest.flush(
      {
        error: 'Unable to verify recovery details.',
      },
      {
        status: 400,
        statusText: 'Bad Request',
      }
    );

    expect(receivedError).toBeInstanceOf(Error);

    expect(service.isAuthenticated()).toBe(false);

    expect(
      sessionStorage.getItem('smartmoney-had-session')
    ).toBeNull();
  });

  it('does not submit recovery details when obtaining CSRF fails', () => {
    let receivedError: unknown;

    service.verifyRecovery(
      'recovery@example.test',
      'Recovery Test User',
      'ABC2D3'
    ).subscribe({
      error: error => {
        receivedError = error;
      },
    });

    const csrfRequest =
      httpTestingController.expectOne(
        `${environment.apiUrl}/auth/csrf`
      );

    csrfRequest.flush(
      {
        error: 'Unable to issue CSRF token.',
      },
      {
        status: 503,
        statusText: 'Service Unavailable',
      }
    );

    httpTestingController.expectNone(
      `${environment.apiUrl}/auth/recovery/verify`
    );

    expect(receivedError).toBeInstanceOf(Error);

    expect(service.isAuthenticated()).toBe(false);
  });

  it('resets the password and clears the existing local session', () => {
    // Establish an authenticated session before the reset.
    service.verifySession().subscribe();

    const sessionRequest =
      httpTestingController.expectOne(sessionUrl);

    sessionRequest.flush({
      user: mockUser,
    });

    sessionStorage.setItem(
      'smartmoney-had-session',
      'true'
    );

    expect(service.isAuthenticated()).toBe(true);

    let replacementCode: string | undefined;

    service.resetPasswordWithRecovery(
      '  RECOVERY@EXAMPLE.TEST  ',
      '  Recovery Test User  ',
      '  abc2d3  ',
      'NewSecurePassword123!',
      'NewSecurePassword123!'
    ).subscribe(result => {
      replacementCode = result.recoveryCode;
    });

    const csrfRequest =
      httpTestingController.expectOne(
        `${environment.apiUrl}/auth/csrf`
      );

    csrfRequest.flush({
      csrf_token: 'reset-csrf',
    });

    const resetRequest =
      httpTestingController.expectOne(
        `${environment.apiUrl}/auth/recovery/reset`
      );

    expect(resetRequest.request.method).toBe('POST');

    expect(resetRequest.request.withCredentials).toBe(true);

    expect(
      resetRequest.request.headers.get('X-CSRF-Token')
    ).toBe('reset-csrf');

    expect(resetRequest.request.body).toEqual({
      email: 'recovery@example.test',
      name: 'Recovery Test User',
      recoveryCode: 'ABC2D3',
      newPassword: 'NewSecurePassword123!',
      confirmPassword: 'NewSecurePassword123!',
    });

    resetRequest.flush({
      message: 'Password reset successfully.',
      recovery_code: 'Q2W3E4',
    });

    expect(replacementCode).toBe('Q2W3E4');

    expect(service.isAuthenticated()).toBe(false);

    expect(service.currentUser()).toBeNull();

    expect(
      sessionStorage.getItem('smartmoney-had-session')
    ).toBeNull();
  });

  it('preserves the current local session when recovery reset fails', () => {
    // Establish an authenticated session.
    service.verifySession().subscribe();

    const sessionRequest =
      httpTestingController.expectOne(sessionUrl);

    sessionRequest.flush({
      user: mockUser,
    });

    sessionStorage.setItem(
      'smartmoney-had-session',
      'true'
    );

    let receivedError: unknown;

    service.resetPasswordWithRecovery(
      'recovery@example.test',
      'Recovery Test User',
      'ABC2D3',
      'NewSecurePassword123!',
      'NewSecurePassword123!'
    ).subscribe({
      error: error => {
        receivedError = error;
      },
    });

    const csrfRequest =
      httpTestingController.expectOne(
        `${environment.apiUrl}/auth/csrf`
      );

    csrfRequest.flush({
      csrf_token: 'reset-csrf',
    });

    const resetRequest =
      httpTestingController.expectOne(
        `${environment.apiUrl}/auth/recovery/reset`
      );

    resetRequest.flush(
      {
        error: 'Unable to reset password.',
      },
      {
        status: 400,
        statusText: 'Bad Request',
      }
    );

    expect(receivedError).toBeInstanceOf(Error);

    // A failed reset must not clear a valid local session.
    expect(service.isAuthenticated()).toBe(true);

    expect(service.currentUser()).toEqual({
      name: 'Test User',
      email: 'test@example.com',
    });

    expect(
      sessionStorage.getItem('smartmoney-had-session')
    ).toBe('true');
  });
});
