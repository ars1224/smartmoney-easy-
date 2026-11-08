import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProfileSettingsPage } from './profile-settings.page';
import { AuthService } from '../../core/auth/auth.service';

import { RegularIncomeApiService } from
  '../../core/services/regular-income-api.service';



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

  const regularIncomeMock = {
    getProfile: vi.fn(),
    saveProfile: vi.fn(),
  };

  const savedHourlyProfile = {
    incomeType: 'HOURLY' as const,
    amount: 28.20,
    payFrequency: null,
    hoursPerWeek: 40,
    monthlyEstimate: 4888,
  };


  beforeEach(async () => {
    logoutAttempts = 0;
    navigatedTo = null;

    vi.clearAllMocks();

    regularIncomeMock.getProfile.mockReturnValue(of(null));
    regularIncomeMock.saveProfile.mockReturnValue(
      of(savedHourlyProfile)
    );


    await TestBed.configureTestingModule({
      imports: [ProfileSettingsPage],
      providers: [
        { provide: AuthService, useValue: authMock },
        { provide: Router, useValue: routerMock },
        {
          provide: RegularIncomeApiService,
          useValue: regularIncomeMock,
        },
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


it('saves a regular weekly salary', async () => {
  component.activeModal = 'expected-income';
  component.regularIncomeType = 'SALARY';
  component.regularIncomeAmount = 800;
  component.regularPayFrequency = 'WEEKLY';

  regularIncomeMock.saveProfile.mockReturnValueOnce(
    of({
      incomeType: 'SALARY',
      amount: 800,
      payFrequency: 'WEEKLY',
      hoursPerWeek: null,
      monthlyEstimate: 3466.67,
    })
  );

  await component.saveRegularIncome();

  expect(regularIncomeMock.saveProfile).toHaveBeenCalledWith({
    incomeType: 'SALARY',
    amount: 800,
    payFrequency: 'WEEKLY',
    hoursPerWeek: null,
  });

  expect(component.regularIncomeProfile?.monthlyEstimate)
    .toBe(3466.67);

  expect(component.regularIncomeMessage)
    .toContain('saved successfully');

  expect(component.regularIncomeSaving).toBe(false);
});

it('saves hourly pay and usual weekly hours', async () => {
  component.activeModal = 'expected-income';
  component.regularIncomeType = 'HOURLY';
  component.regularIncomeAmount = 28.20;
  component.regularHoursPerWeek = 40;

  await component.saveRegularIncome();

  expect(regularIncomeMock.saveProfile).toHaveBeenCalledWith({
    incomeType: 'HOURLY',
    amount: 28.20,
    payFrequency: null,
    hoursPerWeek: 40,
  });

  expect(component.regularIncomeProfile?.monthlyEstimate)
    .toBe(4888);

  expect(component.regularIncomeError).toBe('');
});

it('rejects invalid regular income without saving', async () => {
  component.activeModal = 'expected-income';
  component.regularIncomeType = 'SALARY';
  component.regularIncomeAmount = -10;

  await component.saveRegularIncome();

  expect(component.regularIncomeError)
    .toContain('zero or more');

  expect(regularIncomeMock.saveProfile)
    .not.toHaveBeenCalled();

  component.regularIncomeAmount = 12.345;

  await component.saveRegularIncome();

  expect(component.regularIncomeError)
    .toContain('two decimal places');

  expect(regularIncomeMock.saveProfile)
    .not.toHaveBeenCalled();

  component.regularIncomeType = 'HOURLY';
  component.regularIncomeAmount = 25;
  component.regularHoursPerWeek = 169;

  await component.saveRegularIncome();

  expect(component.regularIncomeError)
    .toContain('between 0 and 168');

  expect(regularIncomeMock.saveProfile)
    .not.toHaveBeenCalled();
});

it('allows retry after regular income save fails', async () => {
  component.activeModal = 'expected-income';
  component.regularIncomeType = 'HOURLY';
  component.regularIncomeAmount = 28.20;
  component.regularHoursPerWeek = 40;

  regularIncomeMock.saveProfile.mockReturnValueOnce(
    throwError(() => new Error('Network unavailable'))
  );

  await component.saveRegularIncome();

  expect(component.regularIncomeError)
    .toContain('Unable to save regular income');

  expect(component.regularIncomeSaving).toBe(false);

  // The user's entered data should remain available.
  expect(component.regularIncomeAmount).toBe(28.20);
  expect(component.regularHoursPerWeek).toBe(40);

  regularIncomeMock.saveProfile.mockReturnValueOnce(
    of(savedHourlyProfile)
  );

  await component.saveRegularIncome();

  expect(regularIncomeMock.saveProfile)
    .toHaveBeenCalledTimes(2);

  expect(component.regularIncomeError).toBe('');
  expect(component.regularIncomeMessage)
    .toContain('saved successfully');

  expect(component.regularIncomeSaving).toBe(false);
});

});