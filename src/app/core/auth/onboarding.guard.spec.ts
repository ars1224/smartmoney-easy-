
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { onboardingRequiredGuard } from './onboarding.guard';
import { OnboardingApiService } from '../services/onboarding-api.service';

describe('onboardingRequiredGuard', () => {
  const getProgress = vi.fn();

  beforeEach(() => {
    getProgress.mockReset();

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: OnboardingApiService,
          useValue: { getProgress },
        },
      ],
    });
  });

  async function checkGuard(): Promise<boolean | UrlTree> {
    const result = TestBed.runInInjectionContext(() =>
      onboardingRequiredGuard(
        {} as ActivatedRouteSnapshot,
        { url: '/app/dashboard' } as RouterStateSnapshot
      )
    ) as Observable<boolean | UrlTree>;

    return firstValueFrom(result);
  }

  it('allows legacy users into the application', async () => {
    getProgress.mockReturnValue(
      of({
        status: 'LEGACY',
        currentStep: null,
        onboardingRequired: false,
        completedAt: null,
      })
    );

    expect(await checkGuard()).toBe(true);
  });

  it('allows users who completed onboarding', async () => {
    getProgress.mockReturnValue(
      of({
        status: 'COMPLETED',
        currentStep: 'REVIEW',
        onboardingRequired: false,
        completedAt: '2026-11-09T00:00:00Z',
      })
    );

    expect(await checkGuard()).toBe(true);
  });

  it('redirects incomplete users to onboarding', async () => {
    getProgress.mockReturnValue(
      of({
        status: 'IN_PROGRESS',
        currentStep: 'PAYROLL',
        onboardingRequired: true,
        completedAt: null,
      })
    );

    const result = await checkGuard();

    expect(result instanceof UrlTree).toBe(true);
    expect((result as UrlTree).toString()).toBe('/onboarding');
  });

  it('does not allow access when progress verification fails', async () => {
    getProgress.mockReturnValue(
      throwError(() => new Error('API unavailable'))
    );

    const result = await checkGuard();

    expect(result instanceof UrlTree).toBe(true);
    expect((result as UrlTree).toString()).toBe('/onboarding');
  });
});
