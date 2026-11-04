import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { ProfileSettingsPage } from './profile-settings.page';
import { AuthService } from '../../core/auth/auth.service';

describe('ProfileSettingsPage logout recovery', () => {
  let component: ProfileSettingsPage;
  let fixture: ComponentFixture<ProfileSettingsPage>;

  let logoutAttempts: number;
  let navigatedTo: string | null;

  const authMock = {
    logout: () => {
      logoutAttempts++;

      if (logoutAttempts === 1) {
        return throwError(() => new Error('Logout request failed'));
      }

      return of(undefined);
    },
  };

  const routerMock = {
    navigateByUrl: async (url: string) => {
      navigatedTo = url;
      return true;
    },
  };

  beforeEach(async () => {
    logoutAttempts = 0;
    navigatedTo = null;

    await TestBed.configureTestingModule({
      imports: [ProfileSettingsPage],
      providers: [
        { provide: AuthService, useValue: authMock },
        { provide: Router, useValue: routerMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfileSettingsPage);
    component = fixture.componentInstance;
    component.activeModal = 'logout';

    fixture.detectChanges();
  });

  it('should show an error and allow retry after logout fails', () => {
    component.confirmLogout();
    fixture.detectChanges();

    expect(component.logoutLoading).toBe(false);
    expect(component.logoutError).toBe('Logout request failed');

    const alert = fixture.nativeElement.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Logout request failed');

    const logoutButton = fixture.nativeElement.querySelector(
      '.settings-modal__primary',
    ) as HTMLButtonElement;

    expect(logoutButton.disabled).toBe(false);
    expect(logoutAttempts).toBe(1);
  });

  it('should navigate to login after a successful retry', () => {
    component.confirmLogout();
    fixture.detectChanges();

    component.confirmLogout();
    fixture.detectChanges();

    expect(logoutAttempts).toBe(2);
    expect(component.logoutLoading).toBe(false);
    expect(component.logoutError).toBe('');
    expect(navigatedTo).toBe('/auth/login');
  });
});