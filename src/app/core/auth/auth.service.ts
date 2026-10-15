import { Injectable, computed, signal } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';

export interface SmartMoneyUser {
  name: string;
  email: string;
}

const SESSION_KEY = 'smartmoney.session';
const SESSION_LENGTH_MS = 30 * 24 * 60 * 60 * 1000;

interface StoredSession {
  expiresAt: number;
  user: SmartMoneyUser;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly currentUserSignal = signal<SmartMoneyUser | null>(this.readSession());

  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUserSignal() !== null);

  login(email: string, password: string): Observable<SmartMoneyUser> {
    if (email.toLowerCase() === 'error@smartmoney.test') {
      return throwError(() => new Error('We could not sign you in. Check your details and try again.'));
    }

    const user: SmartMoneyUser = {
      name: this.nameFromEmail(email),
      email: email.trim().toLowerCase(),
    };
    this.saveSession(user);
    return of(user).pipe(delay(450));
  }

  register(name: string, email: string, _password: string): Observable<SmartMoneyUser> {
    const user: SmartMoneyUser = { name: name.trim(), email: email.trim().toLowerCase() };
    this.saveSession(user);
    return of(user).pipe(delay(450));
  }

  logout(): void {
    localStorage.removeItem(SESSION_KEY);
    this.currentUserSignal.set(null);
  }

  private saveSession(user: SmartMoneyUser): void {
    const session: StoredSession = {
      user,
      expiresAt: Date.now() + SESSION_LENGTH_MS,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    this.currentUserSignal.set(user);
  }

  private readSession(): SmartMoneyUser | null {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw) as StoredSession;
      if (!session.user || session.expiresAt <= Date.now()) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return session.user;
    } catch {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
  }

  private nameFromEmail(email: string): string {
    const firstPart = email.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
    if (!firstPart) return 'SmartMoney user';
    return firstPart.replace(/\b\w/g, (character) => character.toUpperCase());
  }
}
