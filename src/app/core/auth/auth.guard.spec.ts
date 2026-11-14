
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { Observable, of, firstValueFrom } from 'rxjs';

import { AuthService } from './auth.service';
import { authGuard, guestGuard } from './auth.guard';

describe('Auth Guards', () => {
  let authServiceMock: {
    verifySession: ReturnType<typeof vi.fn>;
    sessionExpired: ReturnType<typeof vi.fn>;
  };

  let router: Router;

  beforeEach(() => {
    authServiceMock = {
      verifySession: vi.fn().mockReturnValue(of(true)),
      sessionExpired: vi.fn().mockReturnValue(false),
    };

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: authServiceMock,
        },
      ],
    });

    router = TestBed.inject(Router);
  });

  describe('authGuard', () => {
    it('should allow access when the user is authenticated', async () => {
      authServiceMock.verifySession.mockReturnValue(of(true));

      const result = TestBed.runInInjectionContext(() =>
        authGuard(
          {} as never,
          { url: '/app/dashboard' } as never
        )
      ) as Observable<boolean | UrlTree>;

      const value = await firstValueFrom(result);

      expect(value).toBe(true);
      expect(authServiceMock.verifySession).toHaveBeenCalled();
    });

    it('should redirect to login when the user is not authenticated on first visit', async () => {
      authServiceMock.verifySession.mockReturnValue(of(false));
      authServiceMock.sessionExpired.mockReturnValue(false);

      const result = TestBed.runInInjectionContext(() =>
        authGuard(
          {} as never,
          { url: '/app/dashboard' } as never
        )
      ) as Observable<boolean | UrlTree>;

      const value = await firstValueFrom(result);

      expect(value).toBeInstanceOf(UrlTree);

      if (value instanceof UrlTree) {
        expect(value.queryParams['returnUrl']).toBe('/app/dashboard');
        expect(value.queryParams['sessionExpired']).toBeUndefined();
      }
    });

    it('should redirect to login with sessionExpired when the session has expired', async () => {
      authServiceMock.verifySession.mockReturnValue(of(false));
      authServiceMock.sessionExpired.mockReturnValue(true);

      const result = TestBed.runInInjectionContext(() =>
        authGuard(
          {} as never,
          { url: '/app/profile-settings' } as never
        )
      ) as Observable<boolean | UrlTree>;

      const value = await firstValueFrom(result);

      expect(value).toBeInstanceOf(UrlTree);

      if (value instanceof UrlTree) {
        expect(value.queryParams['returnUrl']).toBe('/app/profile-settings');
        expect(value.queryParams['sessionExpired']).toBe('true');
      }
    });
  });

  describe('guestGuard', () => {
    it('should redirect authenticated users to the dashboard', async () => {
      authServiceMock.verifySession.mockReturnValue(of(true));

      const result = TestBed.runInInjectionContext(() =>
        guestGuard({} as never, {} as never)
      ) as Observable<boolean | UrlTree>;

      const value = await firstValueFrom(result);

      expect(value).toBeInstanceOf(UrlTree);

      if (value instanceof UrlTree) {
        expect(router.serializeUrl(value)).toBe('/app/dashboard');
      }
    });

    it('should allow unauthenticated users to access guest routes', async () => {
      authServiceMock.verifySession.mockReturnValue(of(false));

      const result = TestBed.runInInjectionContext(() =>
        guestGuard({} as never, {} as never)
      ) as Observable<boolean | UrlTree>;

      const value = await firstValueFrom(result);

      expect(value).toBe(true);
    });
  });
});
