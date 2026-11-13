
import { TestBed } from '@angular/core/testing';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';

import { sessionExpiryInterceptor } from './session-expiry.interceptor';
import { AuthService } from './auth.service';

describe('sessionExpiryInterceptor', () => {
  let http: HttpClient;
  let httpTestingController: HttpTestingController;

  let authService: {
    verifySession: ReturnType<typeof vi.fn>;
    sessionExpired: ReturnType<typeof vi.fn>;
    handleSessionExpired: ReturnType<typeof vi.fn>;
  };

  let router: {
    url: string;
    navigate: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    authService = {
      verifySession: vi.fn(),
      sessionExpired: vi.fn(),
      handleSessionExpired: vi.fn(),
    };

    router = {
      url: '/app/dashboard',
      navigate: vi.fn().mockResolvedValue(true),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors([sessionExpiryInterceptor])
        ),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: authService,
        },
        {
          provide: Router,
          useValue: router,
        },
      ],
    });

    http = TestBed.inject(HttpClient);

    httpTestingController = TestBed.inject(
      HttpTestingController
    );
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('should not redirect when the session is not expired', () => {
    authService.verifySession.mockReturnValue(of(false));
    authService.sessionExpired.mockReturnValue(false);

    http.get('/api/protected').subscribe({
      error: () => {},
    });

    const request =
      httpTestingController.expectOne('/api/protected');

    request.flush(
      { error: 'Unauthorized' },
      {
        status: 401,
        statusText: 'Unauthorized',
      }
    );

    expect(authService.verifySession).toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('should redirect to login when the session has expired', () => {
    authService.verifySession.mockReturnValue(of(false));
    authService.sessionExpired.mockReturnValue(true);
    authService.handleSessionExpired.mockReturnValue(true);

    http.get('/api/protected').subscribe({
      error: () => {},
    });

    const request =
      httpTestingController.expectOne('/api/protected');

    request.flush(
      { error: 'Unauthorized' },
      {
        status: 401,
        statusText: 'Unauthorized',
      }
    );

    expect(authService.handleSessionExpired).toHaveBeenCalled();

    expect(router.navigate).toHaveBeenCalledWith(
      ['/auth/login'],
      {
        queryParams: {
          returnUrl: '/app/dashboard',
          sessionExpired: true,
        },
      }
    );
  });

  it('should redirect only once when multiple requests return 401', () => {
    authService.verifySession.mockReturnValue(of(false));
    authService.sessionExpired.mockReturnValue(true);

    authService.handleSessionExpired
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);

    http.get('/api/protected-one').subscribe({
      error: () => {},
    });

    http.get('/api/protected-two').subscribe({
      error: () => {},
    });

    const requestOne =
      httpTestingController.expectOne('/api/protected-one');

    const requestTwo =
      httpTestingController.expectOne('/api/protected-two');

    requestOne.flush(
      { error: 'Unauthorized' },
      {
        status: 401,
        statusText: 'Unauthorized',
      }
    );

    requestTwo.flush(
      { error: 'Unauthorized' },
      {
        status: 401,
        statusText: 'Unauthorized',
      }
    );

    expect(authService.handleSessionExpired).toHaveBeenCalledTimes(2);
    expect(router.navigate).toHaveBeenCalledTimes(1);
  });

  it('should not handle 401 responses from excluded auth endpoints', () => {
    http.get('/api/auth/login').subscribe({
      error: () => {},
    });

    const request =
      httpTestingController.expectOne('/api/auth/login');

    request.flush(
      { error: 'Unauthorized' },
      {
        status: 401,
        statusText: 'Unauthorized',
      }
    );

    expect(authService.verifySession).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
