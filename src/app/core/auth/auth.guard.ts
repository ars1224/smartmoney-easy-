
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.verifySession().pipe(
    map(isAuthenticated =>
      isAuthenticated
        ? true
        : router.createUrlTree(['/auth/login'], {
            queryParams: {
              returnUrl: state.url,
              sessionExpired: auth.sessionExpired() ? true : null,
            },
          })
    ),
    catchError(() => of(false))
  );
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.verifySession().pipe(
    map(isAuthenticated =>
      isAuthenticated
        ? router.createUrlTree(['/app/dashboard'])
        : true
    ),
    catchError(() => of(false))
  );
};
