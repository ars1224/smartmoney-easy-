
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { of, throwError, Subject } from 'rxjs';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { AppShellComponent } from './app-shell.component';
import { AuthService } from '../core/auth/auth.service';

describe('AppShellComponent', () => {
  let component: AppShellComponent;
  let fixture: ComponentFixture<AppShellComponent>;

  let authService: {
    logout: ReturnType<typeof vi.fn>;
  };

  let router: {
    navigateByUrl: ReturnType<typeof vi.fn>;
  };

  let logoutDialogElement: HTMLElement;

  beforeEach(async () => {
    authService = {
      logout: vi.fn(),
    };

    router = {
      navigateByUrl: vi.fn().mockResolvedValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [AppShellComponent],
      providers: [
        {
          provide: AuthService,
          useValue: authService,
        },
        {
          provide: Router,
          useValue: router,
        },
      ],
    })
      .overrideComponent(AppShellComponent, {
        set: {
          template: '',
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(AppShellComponent);
    component = fixture.componentInstance;

    logoutDialogElement = document.createElement('div');

    const logoutButton = document.createElement('button');
    logoutDialogElement.appendChild(logoutButton);

    document.body.appendChild(logoutDialogElement);

    component.logoutDialog = {
      nativeElement: logoutDialogElement,
    } as ElementRef<HTMLElement>;

    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();

    logoutDialogElement?.remove();

    document
      .querySelectorAll('body > div')
      .forEach((element) => element.remove());
  });

  describe('Initial State', () => {
    it('should create the component', () => {
      expect(component).toBeTruthy();
    });

    it('should initialize modal states as closed', () => {
      expect(component.thinkerOpen).toBe(false);
      expect(component.isSettingsModalOpen).toBe(false);
      expect(component.isLogoutModalOpen).toBe(false);
      expect(component.logoutLoading).toBe(false);
    });
  });

  describe('Logout Modal', () => {
    it('should open the logout modal', () => {
      component.openLogoutModal();

      expect(component.isLogoutModalOpen).toBe(true);
    });

    it('should close the logout modal', () => {
      component.isLogoutModalOpen = true;

      component.closeLogoutModal();

      expect(component.isLogoutModalOpen).toBe(false);
    });

    it('should not close the logout modal while logout is loading', () => {
      component.isLogoutModalOpen = true;
      component.logoutLoading = true;

      component.closeLogoutModal();

      expect(component.isLogoutModalOpen).toBe(true);
    });
  });

  describe('Logout', () => {
    it('should logout successfully and navigate to login', () => {
      authService.logout.mockReturnValue(of(undefined));

      component.isLogoutModalOpen = true;

      component.logout();

      expect(authService.logout).toHaveBeenCalledTimes(1);
      expect(component.logoutLoading).toBe(false);
      expect(component.isLogoutModalOpen).toBe(false);
      expect(router.navigateByUrl).toHaveBeenCalledWith('/auth/login');
    });

    it('should set logoutLoading to true while logout is in progress', () => {
      const logoutSubject = new Subject<void>();

      authService.logout.mockReturnValue(logoutSubject.asObservable());

      component.logout();

      expect(component.logoutLoading).toBe(true);

      logoutSubject.next();
      logoutSubject.complete();

      expect(component.logoutLoading).toBe(false);
    });

    it('should prevent duplicate logout calls while loading', () => {
      const logoutSubject = new Subject<void>();

      authService.logout.mockReturnValue(logoutSubject.asObservable());

      component.logout();
      component.logout();

      expect(authService.logout).toHaveBeenCalledTimes(1);

      logoutSubject.next();
      logoutSubject.complete();
    });

    it('should handle logout errors', () => {
      const error = new Error('Logout failed');

      const alertSpy = vi
        .spyOn(window, 'alert')
        .mockImplementation(() => {});

      authService.logout.mockReturnValue(
        throwError(() => error)
      );

      component.logout();

      expect(component.logoutLoading).toBe(false);
      expect(alertSpy).toHaveBeenCalledWith('Logout failed');
      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });
  });

  describe('Thinker Modal', () => {
    it('should open the Thinker modal', () => {
      component.openThinker();

      expect(component.thinkerOpen).toBe(true);
    });

    it('should close the Thinker modal', () => {
      component.thinkerOpen = true;

      component.closeThinker();

      expect(component.thinkerOpen).toBe(false);
    });

    it('should open Thinker from the dashboard event', () => {
      component.openThinkerFromDashboard();

      expect(component.thinkerOpen).toBe(true);
    });
  });

  describe('Settings Modal', () => {
    it('should open the settings modal from a custom event', () => {
      const event = new CustomEvent('smartmoney:settings-modal', {
        detail: {
          isOpen: true,
        },
      });

      component.onSettingsModalChange(event);

      expect(component.isSettingsModalOpen).toBe(true);
    });

    it('should close the settings modal from a custom event', () => {
      component.isSettingsModalOpen = true;

      const event = new CustomEvent('smartmoney:settings-modal', {
        detail: {
          isOpen: false,
        },
      });

      component.onSettingsModalChange(event);

      expect(component.isSettingsModalOpen).toBe(false);
    });

    it('should keep settings modal closed if event detail is missing', () => {
      const event = new CustomEvent('smartmoney:settings-modal');

      component.onSettingsModalChange(event);

      expect(component.isSettingsModalOpen).toBe(false);
    });
  });

  describe('Escape Key', () => {
    it('should close the logout modal when Escape is pressed', () => {
      component.isLogoutModalOpen = true;

      component.closeThinkerWithEscape();

      expect(component.isLogoutModalOpen).toBe(false);
    });

    it('should close Thinker when Escape is pressed', () => {
      component.thinkerOpen = true;

      component.closeThinkerWithEscape();

      expect(component.thinkerOpen).toBe(false);
    });

    it('should prioritize closing the logout modal over Thinker', () => {
      component.isLogoutModalOpen = true;
      component.thinkerOpen = true;

      component.closeThinkerWithEscape();

      expect(component.isLogoutModalOpen).toBe(false);
      expect(component.thinkerOpen).toBe(true);
    });

    it('should do nothing when both modals are closed', () => {
      component.isLogoutModalOpen = false;
      component.thinkerOpen = false;

      component.closeThinkerWithEscape();

      expect(component.isLogoutModalOpen).toBe(false);
      expect(component.thinkerOpen).toBe(false);
    });
  });

  describe('Focus Trap', () => {
    it('should ignore Tab when logout modal is closed', () => {
      component.isLogoutModalOpen = false;

      const event = {
        key: 'Tab',
        shiftKey: false,
        preventDefault: vi.fn(),
      } as unknown as KeyboardEvent;

      component.trapLogoutModalFocus(event);

      expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('should ignore non-Tab keys', () => {
      component.isLogoutModalOpen = true;

      const event = {
        key: 'Enter',
        shiftKey: false,
        preventDefault: vi.fn(),
      } as unknown as KeyboardEvent;

      component.trapLogoutModalFocus(event);

      expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('should prevent Tab when there are no focusable elements', () => {
      component.isLogoutModalOpen = true;

      const mockElement = document.createElement('div');

      component.logoutDialog = {
        nativeElement: mockElement,
      } as ElementRef<HTMLElement>;

      const event = {
        key: 'Tab',
        shiftKey: false,
        preventDefault: vi.fn(),
      } as unknown as KeyboardEvent;

      component.trapLogoutModalFocus(event);

      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('should wrap focus from the last element to the first element', () => {
      component.isLogoutModalOpen = true;

      const container = document.createElement('div');
      const firstButton = document.createElement('button');
      const lastButton = document.createElement('button');

      container.appendChild(firstButton);
      container.appendChild(lastButton);

      document.body.appendChild(container);

      component.logoutDialog = {
        nativeElement: container,
      } as ElementRef<HTMLElement>;

      lastButton.focus();

      expect(document.activeElement).toBe(lastButton);

      const event = {
        key: 'Tab',
        shiftKey: false,
        preventDefault: vi.fn(),
      } as unknown as KeyboardEvent;

      component.trapLogoutModalFocus(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(document.activeElement).toBe(firstButton);
    });

    it('should wrap focus from the first element to the last element with Shift+Tab', () => {
      component.isLogoutModalOpen = true;

      const container = document.createElement('div');
      const firstButton = document.createElement('button');
      const lastButton = document.createElement('button');

      container.appendChild(firstButton);
      container.appendChild(lastButton);

      document.body.appendChild(container);

      component.logoutDialog = {
        nativeElement: container,
      } as ElementRef<HTMLElement>;

      firstButton.focus();

      expect(document.activeElement).toBe(firstButton);

      const event = {
        key: 'Tab',
        shiftKey: true,
        preventDefault: vi.fn(),
      } as unknown as KeyboardEvent;

      component.trapLogoutModalFocus(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(document.activeElement).toBe(lastButton);
    });
  });
});
