import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';

import { describe, it, expect, vi } from 'vitest';

import { DashboardPage } from './dashboard.page';
import {
  DashboardDataService,
  DashboardSnapshot,
} from './dashboard-data.service';

import { AuthService } from '../../core/auth/auth.service';

// ============================================================
// TEST DATA
// ============================================================

const data: DashboardSnapshot = {
  report: {
    month: '2026-11',
    source: 'all',
    currency: 'NZD',

    // Financial totals
    income: '1000.10',
    expenses: '300.20',
    refunds: '20.05',
    uncategorisedInflows: '0.00',
    uncategorisedInflowCount: 0,
    netCashFlow: '719.95',

    // Transaction counts
    transactionCount: 3,
    bankTransactionCount: 2,
    uncategorisedCount: 0,

    // Report coverage
    coverage: 'complete',

    excluded: {
      foreignCurrency: 0,
      transfers: 0,
      reviewNeeded: 0,
    },

    // Expense categories
    categories: [
      {
        name: 'Groceries',
        amount: '300.20',
        percentage: 100,
        count: 1,
      },
    ],

    // Daily financial totals
    daily: [
      {
        date: '2026-11-01',
        income: '1000.10',
        expenses: '300.20',
        refunds: '20.05',
        uncategorisedInflows: '0.00',
      },
    ],
  },

  recordCount: 3,
  loadedAt: '2026-11-15T00:00:00Z',

  // Recent transactions
  transactions: [
    {
      id: 't1',
      name: 'My grocery record',
      category: 'Groceries',
      date: '2026-11-01T00:00:00Z',
      reportDate: '2026-11-01',
      source: 'bank',
      currency: 'NZD',
      amount: '-300.20',
    },
  ],

  // Budgets
  budgets: [
    {
      id: 'b1',
      category: 'Groceries',
      spent: '300.20',
      monthlyLimit: '250.00',
    },
  ],

  // Savings goals
  goals: [
    {
      id: 'g1',
      name: 'My actual goal',
      savedAmount: '80',
      targetAmount: '100',
      targetDate: '2026-12-01',
    },
  ],
};

// ============================================================
// DASHBOARD TESTS
// ============================================================

describe('Real Dashboard interactions', () => {

  // ----------------------------------------------------------
  // Test setup
  // ----------------------------------------------------------

  function setup(
    load = vi.fn().mockReturnValue(of(data)),
  ) {
    TestBed.configureTestingModule({
      imports: [DashboardPage],

      providers: [
        provideRouter([]),

        {
          provide: AuthService,
          useValue: {
            currentUser: () => ({
              name: 'Dhona Test',
              email: 'test@example.test',
            }),
          },
        },

        {
          provide: DashboardDataService,
          useValue: { load },
        },
      ],
    });

    const fixture = TestBed.createComponent(DashboardPage);

    fixture.detectChanges();

    return {
      fixture,
      page: fixture.componentInstance,
      load,
    };
  }

  // ----------------------------------------------------------
  // Test 1: Dashboard renders saved financial data
  // ----------------------------------------------------------

  it(
    'renders saved figures, real activity and goal instead of examples',
    () => {

        const { fixture, page } = setup();

        const text = fixture.nativeElement.textContent;

        const normalizedText = text.replace(/\s+/g, ' ');
            expect(normalizedText).toContain(
            '$80.00 of $100.00'
            );

      expect(text).toContain('Kia ora, Dhona');
      expect(text).toContain('$719.95');
      expect(text).toContain('My grocery record');
      expect(text).toContain('My actual goal');
      expect(text).toContain('80%');

      expect(text).not.toContain('42.50');

      expect(
        fixture.nativeElement.querySelector('table'),
      ).not.toBeNull();

      expect(
        page.budgetStatus(data.budgets![0]),
      ).toBe('Over limit');

      expect(
        page.progress('300.20', '250'),
      ).toBe(100);
    },
  );

  it('shows uncategorised bank inflows separately from income', () => {
  const snapshotWithInflow: DashboardSnapshot = {
    ...data,

    report: {
      ...data.report,

      income: '1000.10',
      expenses: '300.20',
      refunds: '20.05',

      uncategorisedInflows: '65.00',
      uncategorisedInflowCount: 1,

      netCashFlow: '784.95',
    },
  };

  const load = vi.fn().mockReturnValue(
    of(snapshotWithInflow)
  );

  const { fixture, page } = setup(load);

  const text = fixture.nativeElement.textContent as string;

  // Display the unknown credit separately.
  expect(text).toContain('Uncategorised inflows');
  expect(text).toContain('$65.00');

  // Net cash flow must include the unknown credit.
  expect(text).toContain('$784.95');

  // Confirmed income must remain unchanged.
  expect(text).toContain('$1,000.10');

  // Verify the underlying report values.
  expect(
    page.snapshot()?.report.income
  ).toBe('1000.10');

  expect(
    page.snapshot()?.report.uncategorisedInflows
  ).toBe('65.00');

  expect(
    page.snapshot()?.report.netCashFlow
  ).toBe('784.95');
});

  // ----------------------------------------------------------
  // Test 2: Navigation and Thinker integration
  // ----------------------------------------------------------

  it(
    'connects income and expense to the existing form and exposes Reports/Learn',
    () => {
      const { fixture, page } = setup();

      const links = [
        ...fixture.nativeElement.querySelectorAll('a'),
      ].map(
        (a: any) => a.getAttribute('href'),
      );

      expect(links).toContain(
        '/app/activity/add?type=income',
      );

      expect(links).toContain(
        '/app/activity/add?type=expense',
      );

      expect(links).toContain('/app/reports');
      expect(links).toContain('/app/learn');

      const listener = vi.fn();

      window.addEventListener(
        'smartmoney:open-thinker',
        listener,
      );

      page.openThinker();

      expect(listener).toHaveBeenCalledTimes(1);

      window.removeEventListener(
        'smartmoney:open-thinker',
        listener,
      );
    },
  );

  // ----------------------------------------------------------
  // Test 3: Partial data and unavailable sections
  // ----------------------------------------------------------

  it(
    'shows partial-data and section failures without replacing missing data with zeros',
    () => {
      const { fixture } = setup(
        vi.fn().mockReturnValue(
          of({
            ...data,

            budgets: null,
            goals: null,

            report: {
              ...data.report,

              coverage: 'partial',

              excluded: {
                foreignCurrency: 2,
                transfers: 1,
                reviewNeeded: 1,
              },
            },
          }),
        ),
      );

      const text = fixture.nativeElement.textContent;

      expect(text).toContain('2 non-NZD');

      expect(text).toContain(
        'Budget information is unavailable',
      );

      expect(text).toContain(
        'Goal information is unavailable',
      );

      expect(text).not.toContain(
        'No category budgets yet',
      );
    },
  );

  // ----------------------------------------------------------
  // Test 4: Empty dashboard
  // ----------------------------------------------------------

  it(
    'shows genuine empty-state setup actions',
    () => {
      const { fixture, page } = setup(
        vi.fn().mockReturnValue(
          of({
            ...data,

            recordCount: 0,
            transactions: [],
            budgets: [],
            goals: [],

            report: {
              ...data.report,

              income: '0',
              expenses: '0',
              refunds: '0',
              uncategorisedInflows: '0',
              uncategorisedInflowCount: 0,
              netCashFlow: '0',

              transactionCount: 0,
              daily: [],
            },
          }),
        ),
      );

      expect(page.state()).toBe('empty');

      expect(
        fixture.nativeElement.textContent,
      ).toContain('Start with what you have');

      expect(
        fixture.nativeElement.textContent,
      ).not.toContain('My actual goal');
    },
  );

  // ----------------------------------------------------------
  // Test 5: Loading, stale data and recovery
  // ----------------------------------------------------------

  it(
    'handles loading, refresh failure with a labelled stale snapshot and successful recovery',
    () => {
      const pending = new Subject<DashboardSnapshot>();

      const load = vi.fn()
        .mockReturnValueOnce(pending)
        .mockReturnValueOnce(
          throwError(() => new Error('offline')),
        )
        .mockReturnValue(of(data));

      const { fixture, page } = setup(load);

      expect(page.state()).toBe('loading');

      pending.next(data);
      pending.complete();

      fixture.detectChanges();

      page.load();
      fixture.detectChanges();

      expect(page.state()).toBe('stale');

      expect(
        fixture.nativeElement.textContent,
      ).toContain('previously loaded figures');

      expect(
        fixture.nativeElement.textContent,
      ).toContain('$719.95');

      page.load();

      expect(page.state()).toBe('ready');
    },
  );

  // ----------------------------------------------------------
  // Test 6: Initial request failure and retry
  // ----------------------------------------------------------

  it(
    'shows an initial failure and supports retry',
    () => {
      const { fixture, page } = setup(
        vi.fn()
          .mockReturnValueOnce(
            throwError(() => new Error('offline')),
          )
          .mockReturnValue(of(data)),
      );

      expect(page.state()).toBe('error');

      expect(
        fixture.nativeElement.textContent,
      ).toContain('Dashboard unavailable');

      page.load();

      expect(page.state()).toBe('ready');
    },
  );

  // ----------------------------------------------------------
  // Test 7: Cancelled and outdated responses
  // ----------------------------------------------------------

  it(
    'ignores cancelled responses and cancels pending work when destroyed',
    () => {
      const old = new Subject<DashboardSnapshot>();
      const current = new Subject<DashboardSnapshot>();

      const { fixture, page } = setup(
        vi.fn()
          .mockReturnValueOnce(old)
          .mockReturnValue(current),
      );

      page.load();

      old.next(data);

      expect(page.snapshot()).toBeNull();

      current.next(data);

      expect(page.snapshot()).toEqual(data);

      fixture.destroy();

      current.next({
        ...data,
        recordCount: 999,
      });

      expect(
        page.snapshot()?.recordCount,
      ).toBe(3);
    },
  );

  // ----------------------------------------------------------
  // Test 8: Budget limits and completed goals
  // ----------------------------------------------------------

  it(
    'keeps zero limits and completed goals honest',
    () => {
      const { page } = setup();

      expect(
        page.budgetStatus({
          id: 'zero',
          category: 'Other',
          spent: '5',
          monthlyLimit: '0',
        }),
      ).toBe('Spending with no allowance');

      expect(
        page.progress('5', '0'),
      ).toBe(0);

      page.snapshot.set({
        ...data,

        goals: [
          {
            id: 'later',
            name: 'Later',
            savedAmount: '5',
            targetAmount: '100',
            targetDate: '2027-01-01',
          },

          {
            id: 'done',
            name: 'Done',
            savedAmount: '100',
            targetAmount: '100',
            targetDate: '2026-10-01',
          },
        ],
      });

      expect(
        page.goal()?.id,
      ).toBe('later');
    },
  );

});