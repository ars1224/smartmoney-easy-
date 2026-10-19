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
  private readonly currentUserSignal = signal<SmartMoneyUser | null>(null);
  private sessionExpiresAt: number | null = null;
  private expiryTimeout: ReturnType<typeof setTimeout> | null = null;

  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUserSignal() !== null);

  constructor() {
    const session = this.readSession();
    if (session) {
      this.currentUserSignal.set(session.user);
      this.sessionExpiresAt = session.expiresAt;
      this.scheduleExpiryCheck();
    }
  }

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
    if (email.toLowerCase() === 'error@smartmoney.test') {
      return throwError(
        () => new Error('We could not create your account. Please check your details and try again.'),
      );
    }

    const user: SmartMoneyUser = { name: name.trim(), email: email.trim().toLowerCase() };
    this.saveSession(user);
    return of(user).pipe(delay(450));
  }

  logout(): void {
    if (this.expiryTimeout) {
      clearTimeout(this.expiryTimeout);
      this.expiryTimeout = null;
    }
    localStorage.removeItem(SESSION_KEY);
    this.sessionExpiresAt = null;
    this.currentUserSignal.set(null);
  }

  hasValidSession(): boolean {
    if (!this.currentUserSignal() || !this.sessionExpiresAt || this.sessionExpiresAt <= Date.now()) {
      this.logout();
      return false;
    }
    return true;
  }

  private saveSession(user: SmartMoneyUser): void {
    const session: StoredSession = {
      user,
      expiresAt: Date.now() + SESSION_LENGTH_MS,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    this.sessionExpiresAt = session.expiresAt;
    this.currentUserSignal.set(user);
    this.scheduleExpiryCheck();
  }

  private readSession(): StoredSession | null {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw) as StoredSession;
      if (!session.user || session.expiresAt <= Date.now()) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return session;
    } catch {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
  }

  private scheduleExpiryCheck(): void {
    if (this.expiryTimeout) clearTimeout(this.expiryTimeout);
    if (!this.sessionExpiresAt) return;

    const maximumTimeout = 2_147_483_647;
    const delayUntilCheck = Math.min(
      Math.max(this.sessionExpiresAt - Date.now(), 0),
      maximumTimeout,
    );
    this.expiryTimeout = setTimeout(() => {
      if (!this.hasValidSession()) return;
      this.scheduleExpiryCheck();
    }, delayUntilCheck);
  }

  private nameFromEmail(email: string): string {
    const firstPart = email.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
    if (!firstPart) return 'SmartMoney user';
    return firstPart.replace(/\b\w/g, (character) => character.toUpperCase());
  }
}
