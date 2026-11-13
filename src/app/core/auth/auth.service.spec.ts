
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
});
