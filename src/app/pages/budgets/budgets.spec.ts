import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import {
  describe,
  beforeEach,
  it,
  expect,
  vi,
} from 'vitest';

import { BudgetsPage } from './budgets';
import { BudgetsApiService } from '../../core/services/budgets-api.service';

import { MonthlyIncomeApiService } from
  '../../core/services/monthly-income-api.service';

  import {
  BudgetAllocationsApiService,
} from '../../core/services/budget-allocations-api.service';

import { provideRouter } from '@angular/router';

describe('BudgetsPage', () => {
  let component: BudgetsPage;

  const budgetsApi = {
    getBudgets: vi.fn(),
    createBudget: vi.fn(),
    updateBudget: vi.fn(),
  };

  const allocationsApi = {
  getAllocation: vi.fn(),
  saveAllocation: vi.fn(),
};

const incomeApi = {
  getSummary: vi.fn(),
};


  beforeEach(() => {
    vi.clearAllMocks();
    budgetsApi.getBudgets.mockReturnValue(of([]));

    allocationsApi.getAllocation.mockReturnValue(
    of({
        month: '2026-11',
        allocation: null,
    })
    );


TestBed.configureTestingModule({
  providers: [
    provideRouter([]),
    {
      provide: BudgetsApiService,
      useValue: budgetsApi,
    },
    {
      provide: MonthlyIncomeApiService,
      useValue: incomeApi,
    },
    {
      provide: BudgetAllocationsApiService,
      useValue: allocationsApi,
    },
  ],
});


    incomeApi.getSummary.mockReturnValue(of({
    month: '2026-11',
    expectedIncome: null,
    allocatedBudget: 0,
    unallocatedBudget: null,
    }));

    const fixture = TestBed.createComponent(BudgetsPage);
    component = fixture.componentInstance;
  });

  it('rejects an invalid category', async () => {
    component.budgetForm = {
      category: 'Invalid',
      otherCategory: '',
      monthlyLimit: 100,
    };

    await component.saveBudget();

    expect(component.formError).toBe(
      'Please select a valid category.'
    );
    expect(budgetsApi.createBudget).not.toHaveBeenCalled();
  });

  it('rejects a zero monthly limit', async () => {
    component.budgetForm = {
      category: 'Groceries',
      otherCategory: '',
      monthlyLimit: 0,
    };

    await component.saveBudget();

    expect(component.formError).toContain(
      'greater than zero'
    );
    expect(budgetsApi.createBudget).not.toHaveBeenCalled();
  });

  it('rejects more than two decimal places', async () => {
    component.budgetForm = {
      category: 'Groceries',
      otherCategory: '',
      monthlyLimit: 12.345,
    };

    await component.saveBudget();

    expect(component.formError).toContain(
      'two decimal places'
    );
    expect(budgetsApi.createBudget).not.toHaveBeenCalled();
  });

  it('rejects duplicate categories', async () => {
    component.budgets = [{
      id: 'budget-1',
      category: 'Groceries',
      monthlyLimit: 400,
      spent: 50,
      createdAt: '',
      updatedAt: '',
    }];

    component.budgetForm = {
      category: 'Groceries',
      otherCategory: '',
      monthlyLimit: 500,
    };

    await component.saveBudget();

    expect(component.formError).toContain(
      'already exists'
    );
    expect(budgetsApi.createBudget).not.toHaveBeenCalled();
  });

  it('creates a budget successfully', async () => {
    const savedBudget = {
      id: 'budget-2',
      category: 'Transport',
      monthlyLimit: 250,
      spent: 0,
      createdAt: '',
      updatedAt: '',
    };

    budgetsApi.createBudget.mockReturnValue(of(savedBudget));
    budgetsApi.getBudgets.mockReturnValue(of([savedBudget]));

    component.budgetForm = {
      category: 'Transport',
      otherCategory: '',
      monthlyLimit: 250,
    };

    await component.saveBudget();
    expect(budgetsApi.createBudget).toHaveBeenCalledWith(
    {
        category: 'Transport',
        monthlyLimit: 250,
    },
    component.selectedMonth
    );


    expect(component.budgets).toEqual([savedBudget]);
    expect(component.formError).toBe('');
    expect(component.saving).toBe(false);
  });


    it('creates a custom Other - Loan budget', async () => {
    const savedBudget = {
        id: 'budget-custom',
        category: 'Other - Loan',
        monthlyLimit: 50000,
        spent: 50,
        createdAt: '',
        updatedAt: '',
    };

    // Configure the API responses before saving.
    budgetsApi.createBudget.mockReturnValue(of(savedBudget));
    budgetsApi.getBudgets.mockReturnValue(of([savedBudget]));

    component.budgetForm = {
        category: 'Other',
        otherCategory: '  Loan  ',
        monthlyLimit: 50000,
    };

    await component.saveBudget();

    expect(budgetsApi.createBudget).toHaveBeenCalledWith(
    {
        category: 'Other - Loan',
        monthlyLimit: 50000,
    },
    component.selectedMonth
    );

    expect(budgetsApi.getBudgets).toHaveBeenCalledWith(
        component.selectedMonth
    );

    expect(component.budgets).toEqual([savedBudget]);
    expect(component.formError).toBe('');
    expect(component.saving).toBe(false);
    });


  it('rejects an empty custom Other category', async () => {
    component.budgetForm = {
      category: 'Other',
      otherCategory: '   ',
      monthlyLimit: 100,
    };

    await component.saveBudget();

    expect(component.formError).toContain(
      'Please specify a valid category'
    );

    expect(budgetsApi.createBudget).not.toHaveBeenCalled();
  });

  it('prefills the custom category when editing', () => {
    const existingBudget = {
      id: 'budget-custom',
      category: 'Other - Loan',
      monthlyLimit: 50000,
      spent: 50,
      createdAt: '',
      updatedAt: '',
    };

    component.openEditDialog(existingBudget);

    expect(component.editingBudgetId).toBe(
      'budget-custom'
    );

    expect(component.budgetForm).toEqual({
      category: 'Other',
      otherCategory: 'Loan',
      monthlyLimit: 50000,
    });
  });

  it('updates an existing budget successfully', async () => {
    const existingBudget = {
      id: 'budget-1',
      category: 'Groceries',
      monthlyLimit: 400,
      spent: 50,
      createdAt: '',
      updatedAt: '',
    };

    const updatedBudget = {
      ...existingBudget,
      monthlyLimit: 600,
    };

    component.budgets = [existingBudget];
    component.editingBudgetId = existingBudget.id;

    component.budgetForm = {
      category: 'Groceries',
      otherCategory: '',
      monthlyLimit: 600,
    };

    budgetsApi.updateBudget.mockReturnValue(of(updatedBudget));
    budgetsApi.getBudgets.mockReturnValue(of([updatedBudget]));

    await component.saveBudget();


    expect(budgetsApi.updateBudget).toHaveBeenCalledWith(
    'budget-1',
    {
        category: 'Groceries',
        monthlyLimit: 600,
    },
    component.selectedMonth
    );

    expect(component.budgets).toEqual([updatedBudget]);
    expect(component.editingBudgetId).toBeNull();
    expect(component.formError).toBe('');
    expect(component.saving).toBe(false);
  });

  it('shows an error and allows retry after a failed save', async () => {
    const savedBudget = {
      id: 'budget-3',
      category: 'Bills',
      monthlyLimit: 300,
      spent: 0,
      createdAt: '',
      updatedAt: '',
    };

    component.budgetForm = {
      category: 'Bills',
      otherCategory: '',
      monthlyLimit: 300,
    };

    budgetsApi.createBudget.mockReturnValueOnce(
      throwError(() => new Error('Network unavailable'))
    );

    await component.saveBudget();

    expect(component.formError).toBe(
      'Unable to save budget. Please try again.'
    );
    expect(component.saving).toBe(false);
    expect(component.budgets).toEqual([]);

    budgetsApi.createBudget.mockReturnValueOnce(
      of(savedBudget)
    );
    budgetsApi.getBudgets.mockReturnValue(of([savedBudget]));

    await component.saveBudget();

    expect(component.budgets).toEqual([savedBudget]);
    expect(component.formError).toBe('');
    expect(component.saving).toBe(false);
  });

  it('shows a loading error and recovers after retry', async () => {
    budgetsApi.getBudgets.mockReturnValueOnce(
      throwError(() => new Error('Network unavailable'))
    );

    await component.loadBudgets();

    expect(component.loadError).toBe(
      'Unable to load budgets. Please try again.'
    );
    expect(component.isLoading).toBe(false);

    budgetsApi.getBudgets.mockReturnValueOnce(of([]));

    await component.loadBudgets();

    expect(component.loadError).toBe('');
    expect(component.budgets).toEqual([]);
    expect(component.isLoading).toBe(false);
  });

it('loads the saved monthly allocation', async () => {
  const month = component.selectedMonth;

  const allocation = {
    needsPercent: 55,
    savingsPercent: 25,
    wantsPercent: 20,
  };

  allocationsApi.getAllocation.mockReturnValue(
    of({ month, allocation })
  );

  await component.loadAllocation();

  expect(allocationsApi.getAllocation)
    .toHaveBeenCalledWith(month);

  expect(component.budgetAllocation).toEqual(
    allocation
  );

  expect(component.allocationLoading).toBe(false);
  expect(component.allocationError).toBe('');
});

it('calculates allocation amounts with exact cent totals', () => {
  component.incomeSummary = {
    month: '2026-11',
    expectedIncome: 3345.81,
    allocatedBudget: 0,
    unallocatedBudget: 3345.81,
  };

  component.budgetAllocation = {
    needsPercent: 55,
    savingsPercent: 25,
    wantsPercent: 20,
  };

  const amounts = component.allocationAmounts;

  expect(amounts).toEqual({
    needs: 1840.20,
    savings: 836.45,
    wants: 669.16,
  });

  expect(
    Math.round(
      (
        amounts!.needs +
        amounts!.savings +
        amounts!.wants
      ) * 100
    )
  ).toBe(334581);
});

it('handles a month without a saved allocation', async () => {
  allocationsApi.getAllocation.mockReturnValue(
    of({
      month: component.selectedMonth,
      allocation: null,
    })
  );

  await component.loadAllocation();

  expect(component.budgetAllocation).toBeNull();
  expect(component.allocationAmounts).toBeNull();
  expect(component.allocationError).toBe('');
});

it('recovers from a failed allocation request', async () => {
  allocationsApi.getAllocation.mockReturnValueOnce(
    throwError(() => new Error('Network unavailable'))
  );

  await component.loadAllocation();

  expect(component.allocationError).toBe(
    'Unable to load your monthly allocation.'
  );

  expect(component.allocationLoading).toBe(false);
  expect(component.budgetAllocation).toBeNull();

  allocationsApi.getAllocation.mockReturnValueOnce(
    of({
      month: component.selectedMonth,
      allocation: {
        needsPercent: 55,
        savingsPercent: 25,
        wantsPercent: 20,
      },
    })
  );

  await component.loadAllocation();

  expect(component.allocationError).toBe('');
  expect(component.budgetAllocation?.needsPercent).toBe(55);
  expect(component.allocationLoading).toBe(false);
});


it('loads the correct allocation when switching months', async () => {
  const novemberAllocation = {
    needsPercent: 55,
    savingsPercent: 25,
    wantsPercent: 20,
  };

  allocationsApi.getAllocation.mockImplementation(
    (month: string) => of({
      month,
      allocation:
        month === '2026-11' ? novemberAllocation : null,
    })
  );

  component.selectedMonth = '2026-10';
  component.isLoading = false;

  await component.loadAllocation();

  expect(component.budgetAllocation).toBeNull();

  component.changeMonth(1);

  await vi.waitFor(() => {
    expect(component.selectedMonth).toBe('2026-11');

    expect(component.budgetAllocation).toEqual(
      novemberAllocation
    );
  });

  expect(allocationsApi.getAllocation)
    .toHaveBeenLastCalledWith('2026-11');
});

it('ignores outdated allocation responses', async () => {
  const octoberResponse = new Subject<any>();
  const novemberResponse = new Subject<any>();

  allocationsApi.getAllocation.mockImplementation(
    (month: string) =>
      month === '2026-10'
        ? octoberResponse.asObservable()
        : novemberResponse.asObservable()
  );

  component.selectedMonth = '2026-10';
  const firstRequest = component.loadAllocation();

  component.selectedMonth = '2026-11';
  const secondRequest = component.loadAllocation();

  const novemberAllocation = {
    needsPercent: 55,
    savingsPercent: 25,
    wantsPercent: 20,
  };

  novemberResponse.next({
    month: '2026-11',
    allocation: novemberAllocation,
  });
  novemberResponse.complete();

  await secondRequest;

  octoberResponse.next({
    month: '2026-10',
    allocation: null,
  });
  octoberResponse.complete();

  await firstRequest;

  expect(component.selectedMonth).toBe('2026-11');
  expect(component.budgetAllocation).toEqual(
    novemberAllocation
  );
  expect(component.allocationLoading).toBe(false);
  expect(component.allocationError).toBe('');
});


});