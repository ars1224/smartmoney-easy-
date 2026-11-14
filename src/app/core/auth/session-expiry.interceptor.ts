
import { inject } from '@angular/core';
import {
  HttpErrorResponse,
  HttpInterceptorFn,
} from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';

import { AuthService } from './auth.service';

export const sessionExpiryInterceptor: HttpInterceptorFn = (
  request,
  next
) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const excludedAuthEndpoints = [
    '/auth/login',
    '/auth/register',
    '/auth/me',
    '/auth/logout',
    '/auth/csrf',
  ];

  const isExcludedRequest = excludedAuthEndpoints.some(
    endpoint => request.url.includes(endpoint)
  );

  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        !(error instanceof HttpErrorResponse) ||
        error.status !== 401 ||
        isExcludedRequest
      ) {
        return throwError(() => error);
      }

      return auth.verifySession().pipe(
        switchMap(isAuthenticated => {
          if (
            !isAuthenticated &&
            auth.sessionExpired()
          ) {
            const shouldRedirect =
              auth.handleSessionExpired();

            if (shouldRedirect) {
              const currentUrl = router.url;
              const isProtectedRoute =
                currentUrl.startsWith('/app/');

              void router.navigate(['/auth/login'], {
                queryParams: {
                  returnUrl: isProtectedRoute
                    ? currentUrl
                    : null,
                  sessionExpired: true,
                },
              });
            }
          }

          return throwError(() => error);
        }),
        catchError(() => throwError(() => error))
      );
    })
  );
};
