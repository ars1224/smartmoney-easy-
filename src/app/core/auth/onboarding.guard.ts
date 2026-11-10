
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { OnboardingApiService } from
  '../services/onboarding-api.service';

export const onboardingRequiredGuard: CanActivateFn = () => {
  const onboarding = inject(OnboardingApiService);
  const router = inject(Router);

  return onboarding.getProgress().pipe(
    map(progress => {
      // Existing accounts and completed setups
      // can access the normal application.
      if (
        !progress.onboardingRequired &&
        (
          progress.status === 'LEGACY' ||
          progress.status === 'COMPLETED'
        )
      ) {
        return true;
      }

      // Users with unfinished setup must complete it.
      return router.createUrlTree(['/onboarding']);
    }),

    catchError(() => {
      // Don't bypass onboarding when its status
      // cannot be verified.
      // The onboarding page handles API errors and retry.
      return of(
        router.createUrlTree(['/onboarding'])
      );
    })
  );
};
