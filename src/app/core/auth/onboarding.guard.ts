import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { OnboardingApiService } from '../services/onboarding-api.service';

export const onboardingGuard: CanActivateFn = () => {
  const onboarding = inject(OnboardingApiService);
  const router = inject(Router);

  return onboarding.getStatus().pipe(
    map(progress => {
      // Existing users and completed users retain normal access.
      if (
        progress.status === 'COMPLETED' ||
        progress.status === 'LEGACY'
      ) {
        return true;
      }

      // New users must finish onboarding.
      return router.createUrlTree(['/onboarding']);
    }),

    // If onboarding status cannot be verified,
    // do not grant access to protected pages.
    catchError(() =>
      of(router.createUrlTree(['/onboarding']))
    )
  );
};