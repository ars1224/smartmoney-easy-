
import { Injectable, computed, inject, signal } from '@angular/core';
import {
  HttpClient,
  HttpErrorResponse,
} from '@angular/common/http';
import {
  Observable,
  catchError,
  map,
  of,
  switchMap,
  tap,
  throwError,
} from 'rxjs';

export interface SmartMoneyUser {
  name: string;
  email: string;
}

import { environment } from '../../../environments/environment';

interface BackendUser {
  id: string;
  email: string;
}

interface AuthResponse {
  message: string;
  user: BackendUser;
  csrf_token: string;
}

interface SessionResponse {
  user: BackendUser;
}

interface CsrfResponse {
  csrf_token: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

private readonly apiBase = `${environment.apiUrl}/auth`;
  private readonly currentUserSignal =
    signal<SmartMoneyUser | null>(null);

  private csrfToken: string | null = null;

  readonly currentUser = this.currentUserSignal.asReadonly();

  readonly isAuthenticated = computed(
    () => this.currentUserSignal() !== null
  );

  private fetchCsrfToken(): Observable<string> {
    return this.http.get<CsrfResponse>(
      `${this.apiBase}/csrf`,
      { withCredentials: true }
    ).pipe(
      map(response => {
        this.csrfToken = response.csrf_token;
        return response.csrf_token;
      })
    );
  }

  getCsrfToken(): Observable<string> {
    if (this.csrfToken) {
      return of(this.csrfToken);
    }

    return this.fetchCsrfToken();
  }

  login(
    email: string,
    password: string
  ): Observable<SmartMoneyUser> {
    return this.fetchCsrfToken().pipe(
      switchMap(token =>
        this.http.post<AuthResponse>(
          `${this.apiBase}/login`,
          {
            email: email.trim().toLowerCase(),
            password,
          },
          {
            withCredentials: true,
            headers: {
              'X-CSRF-Token': token,
            },
          }
        )
      ),
      map(response => {
        // Flask rotates the session and CSRF token on login.
        this.csrfToken = response.csrf_token;

        const user = this.mapUser(response.user);
        this.currentUserSignal.set(user);

        return user;
      }),
      catchError(error =>
        throwError(() => this.toError(error))
      )
    );
  }

  register(
    name: string,
    email: string,
    password: string
  ): Observable<SmartMoneyUser> {
    return this.fetchCsrfToken().pipe(
      switchMap(token =>
        this.http.post<AuthResponse>(
          `${this.apiBase}/register`,
          {
            email: email.trim().toLowerCase(),
            password,
          },
          {
            withCredentials: true,
            headers: {
              'X-CSRF-Token': token,
            },
          }
        )
      ),
      map(response => {
        this.csrfToken = response.csrf_token;

        const user = this.mapUser(response.user, name);
        this.currentUserSignal.set(user);

        return user;
      }),
      catchError(error =>
        throwError(() => this.toError(error))
      )
    );
  }

  verifySession(): Observable<boolean> {
    return this.http.get<SessionResponse>(
      `${this.apiBase}/me`,
      { withCredentials: true }
    ).pipe(
      tap(response => {
        this.currentUserSignal.set(
          this.mapUser(response.user)
        );
      }),
      map(() => true),
      catchError(() => {
        this.clearLocalSession();
        return of(false);
      })
    );
  }

  logout(): Observable<void> {
    return this.getCsrfToken().pipe(
      switchMap(token =>
        this.http.post<void>(
          `${this.apiBase}/logout`,
          {},
          {
            withCredentials: true,
            headers: {
              'X-CSRF-Token': token,
            },
          }
        )
      ),
      tap(() => this.clearLocalSession()),
      map(() => undefined),
      catchError(error =>
        throwError(() => this.toError(error))
      )
    );
  }

  private clearLocalSession(): void {
    this.currentUserSignal.set(null);
    this.csrfToken = null;
  }

  private mapUser(
    user: BackendUser,
    name?: string
  ): SmartMoneyUser {
    return {
      email: user.email,
      name: name?.trim() || this.nameFromEmail(user.email),
    };
  }

  private nameFromEmail(email: string): string {
    const firstPart = email
      .split('@')[0]
      ?.replace(/[._-]+/g, ' ')
      .trim();

    if (!firstPart) {
      return 'SmartMoney user';
    }

    return firstPart.replace(
      /\b\w/g,
      character => character.toUpperCase()
    );
  }

  private toError(error: unknown): Error {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return new Error(
          'Unable to connect to SmartMoney. Check that the Flask server is running.'
        );
      }

      const message = error.error?.error;

      if (typeof message === 'string') {
        return new Error(message);
      }

      return new Error(
        'The request could not be completed. Please try again.'
      );
    }

    return new Error('An unexpected error occurred.');
  }
}
