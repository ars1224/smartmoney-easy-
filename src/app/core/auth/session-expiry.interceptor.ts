import { inject } from '@angular/core';
import {
  HttpErrorResponse,
  HttpInterceptorFn,
} from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { AuthService } from './auth.service';

export const sessionExpiryInterceptor: HttpInterceptorFn = (
  request,
  next
) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !request.url.includes('/auth/login') &&
        !request.url.includes('/auth/register') &&
        !request.url.includes('/auth/me')
      ) {
        auth.handleSessionExpired();

        void router.navigate(['/auth/login'], {
          queryParams: {
            returnUrl: router.url,
            sessionExpired: true,
          },
        });
      }

      return throwError(() => error);
    })
  );
};
