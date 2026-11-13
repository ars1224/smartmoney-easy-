import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import {
  describe,
  beforeEach,
  it,
  expect,
  vi,
} from 'vitest';

import { BudgetsPage } from './budgets';

import {
  BudgetsApiService,
  type BudgetRecord,
  type AllocationOverview,
} from '../../core/services/budgets-api.service';


describe('BudgetsPage', () => {
  let component: BudgetsPage;

const budgetsApi = {
  getBudgetOverview: vi.fn(),
  getAllocation: vi.fn(),
  createBudget: vi.fn(),
  updateBudget: vi.fn(),
  saveAllocation: vi.fn(),
};

  const defaultAllocation: AllocationOverview = {
    month: '2026-11',
    configured: false,
    availableMoney: null,
    percentages: {
      NEEDS: 55,
      WANTS: 20,
      SAVINGS: 25,
    },
    targets: null,
  };

  const configuredAllocation: AllocationOverview = {
    month: '2026-11',
    configured: true,
    availableMoney: 2000,
    percentages: {
      NEEDS: 55,
      WANTS: 20,
      SAVINGS: 25,
    },
    targets: {
      NEEDS: 1100,
      WANTS: 400,
      SAVINGS: 500,
    },
  };

  function makeBudget(
    overrides: Partial<BudgetRecord> = {}
  ): BudgetRecord {
    return {
      id: 'budget-1',
      budgetGroup: 'NEEDS',
      category: 'Groceries',
      monthlyLimit: 400,
      spent: 50,
      createdAt: '',
      updatedAt: '',
      ...overrides,
    };
  }

  function mockBudgetOverview(
    budgets: BudgetRecord[]
  ): void {
    budgetsApi.getBudgetOverview.mockReturnValue(
      of({
        budgets,
        groupSpending: null,
      })
    );
  }

  beforeEach(() => {
    vi.resetAllMocks();

    mockBudgetOverview([]);

    budgetsApi.getAllocation.mockReturnValue(
      of(defaultAllocation)
    );

    TestBed.configureTestingModule({
      providers: [
        {
          provide: BudgetsApiService,
          useValue: budgetsApi,
        },
      ],
    });

    const fixture =
      TestBed.createComponent(BudgetsPage);

    component = fixture.componentInstance;
  });


  // ---------------------------------
  // Budget form validation
  // ---------------------------------

  it('requires a budget group', async () => {
    component.budgetForm = {
      budgetGroup: '',
      category: 'Groceries',
      otherCategory: '',
      monthlyLimit: 100,
    };

    await component.saveBudget();

    expect(component.formError).toBe(
      'Please select Needs, Wants or Savings.'
    );

    expect(
      budgetsApi.createBudget
    ).not.toHaveBeenCalled();
  });


  it('rejects an invalid category', async () => {
    component.budgetForm = {
      budgetGroup: 'NEEDS',
      category: 'Invalid',
      otherCategory: '',
      monthlyLimit: 100,
    };

    await component.saveBudget();

    expect(component.formError).toBe(
      'Please select a valid category.'
    );

    expect(
      budgetsApi.createBudget
    ).not.toHaveBeenCalled();
  });


  it('rejects a zero monthly limit', async () => {
    component.budgetForm = {
      budgetGroup: 'NEEDS',
      category: 'Groceries',
      otherCategory: '',
      monthlyLimit: 0,
    };

    await component.saveBudget();

    expect(component.formError).toContain(
      'greater than zero'
    );

    expect(
      budgetsApi.createBudget
    ).not.toHaveBeenCalled();
  });


  it('rejects more than two decimal places', async () => {
    component.budgetForm = {
      budgetGroup: 'NEEDS',
      category: 'Groceries',
      otherCategory: '',
      monthlyLimit: 12.345,
    };

    await component.saveBudget();

    expect(component.formError).toContain(
      'two decimal places'
    );

    expect(
      budgetsApi.createBudget
    ).not.toHaveBeenCalled();
  });


  it('rejects duplicate categories', async () => {
    component.budgets = [
      makeBudget({
        category: 'Groceries',
        monthlyLimit: 400,
      }),
    ];

    component.budgetForm = {
      budgetGroup: 'NEEDS',
      category: 'Groceries',
      otherCategory: '',
      monthlyLimit: 500,
    };

    await component.saveBudget();

    expect(component.formError).toContain(
      'already exists'
    );

    expect(
      budgetsApi.createBudget
    ).not.toHaveBeenCalled();
  });


  // ---------------------------------
  // Creating budgets
  // ---------------------------------

  it('creates a Needs budget successfully', async () => {
    const savedBudget = makeBudget({
      id: 'budget-2',
      category: 'Transport',
      monthlyLimit: 250,
      spent: 0,
    });

    budgetsApi.createBudget.mockReturnValue(
      of(savedBudget)
    );

    mockBudgetOverview([savedBudget]);

    component.budgetForm = {
      budgetGroup: 'NEEDS',
      category: 'Transport',
      otherCategory: '',
      monthlyLimit: 250,
    };

    await component.saveBudget();

    expect(
      budgetsApi.createBudget
    ).toHaveBeenCalledWith(
      {
        category: 'Transport',
        monthlyLimit: 250,
        budgetGroup: 'NEEDS',
      },
      component.selectedMonth
    );

    expect(component.budgets).toEqual([
      savedBudget,
    ]);

    expect(component.formError).toBe('');
    expect(component.saving).toBe(false);
  });


  it('creates a Wants budget successfully', async () => {
    const savedBudget = makeBudget({
      id: 'budget-wants',
      budgetGroup: 'WANTS',
      category: 'Eating out',
      monthlyLimit: 200,
      spent: 0,
    });

    budgetsApi.createBudget.mockReturnValue(
      of(savedBudget)
    );

    mockBudgetOverview([savedBudget]);

    component.budgetForm = {
      budgetGroup: 'WANTS',
      category: 'Eating out',
      otherCategory: '',
      monthlyLimit: 200,
    };

    await component.saveBudget();

    expect(
      budgetsApi.createBudget
    ).toHaveBeenCalledWith(
      {
        category: 'Eating out',
        monthlyLimit: 200,
        budgetGroup: 'WANTS',
      },
      component.selectedMonth
    );

    expect(component.budgets).toEqual([
      savedBudget,
    ]);
  });


  it('creates a Savings allocation successfully', async () => {
    const savedBudget = makeBudget({
      id: 'budget-savings',
      budgetGroup: 'SAVINGS',
      category: 'Savings',
      monthlyLimit: 200,
      spent: 0,
    });

    budgetsApi.createBudget.mockReturnValue(
      of(savedBudget)
    );

    mockBudgetOverview([savedBudget]);

    component.budgetForm = {
      budgetGroup: 'SAVINGS',
      category: 'Savings',
      otherCategory: '',
      monthlyLimit: 200,
    };

    await component.saveBudget();

    expect(
      budgetsApi.createBudget
    ).toHaveBeenCalledWith(
      {
        category: 'Savings',
        monthlyLimit: 200,
        budgetGroup: 'SAVINGS',
      },
      component.selectedMonth
    );

    expect(component.budgets).toEqual([
      savedBudget,
    ]);
  });


  // ---------------------------------
  // Custom categories
  // ---------------------------------

  it('creates a custom Other - Loan budget', async () => {
    const savedBudget = makeBudget({
      id: 'budget-custom',
      category: 'Other - Loan',
      monthlyLimit: 50000,
      spent: 50,
    });

    budgetsApi.createBudget.mockReturnValue(
      of(savedBudget)
    );

    mockBudgetOverview([savedBudget]);

    component.budgetForm = {
      budgetGroup: 'NEEDS',
      category: 'Other',
      otherCategory: '  Loan  ',
      monthlyLimit: 50000,
    };

    await component.saveBudget();

    expect(
      budgetsApi.createBudget
    ).toHaveBeenCalledWith(
      {
        category: 'Other - Loan',
        monthlyLimit: 50000,
        budgetGroup: 'NEEDS',
      },
      component.selectedMonth
    );

    expect(
      budgetsApi.getBudgetOverview
    ).toHaveBeenCalledWith(
      component.selectedMonth
    );

    expect(component.budgets).toEqual([
      savedBudget,
    ]);

    expect(component.formError).toBe('');
    expect(component.saving).toBe(false);
  });


  it('rejects an empty custom Other category', async () => {
    component.budgetForm = {
      budgetGroup: 'NEEDS',
      category: 'Other',
      otherCategory: '   ',
      monthlyLimit: 100,
    };

    await component.saveBudget();

    expect(component.formError).toContain(
      'Please specify a valid category'
    );

    expect(
      budgetsApi.createBudget
    ).not.toHaveBeenCalled();
  });


  // ---------------------------------
  // Editing budgets
  // ---------------------------------

  it('prefills the custom category when editing', () => {
    const existingBudget = makeBudget({
      id: 'budget-custom',
      category: 'Other - Loan',
      monthlyLimit: 50000,
    });

    component.openEditDialog(existingBudget);

    expect(component.editingBudgetId).toBe(
      'budget-custom'
    );

    expect(component.budgetForm).toEqual({
      budgetGroup: 'NEEDS',
      category: 'Other',
      otherCategory: 'Loan',
      monthlyLimit: 50000,
    });
  });


  it('handles a legacy budget without a group', () => {
    const existingBudget = makeBudget({
      budgetGroup: null,
    });

    component.openEditDialog(existingBudget);

    expect(
      component.budgetForm.budgetGroup
    ).toBe('');
  });


  it('updates an existing budget successfully', async () => {
    const existingBudget = makeBudget({
      id: 'budget-1',
      category: 'Groceries',
      monthlyLimit: 400,
    });

    const updatedBudget = makeBudget({
      ...existingBudget,
      monthlyLimit: 600,
    });

    component.budgets = [existingBudget];
    component.editingBudgetId = existingBudget.id;

    component.budgetForm = {
      budgetGroup: 'NEEDS',
      category: 'Groceries',
      otherCategory: '',
      monthlyLimit: 600,
    };

    budgetsApi.updateBudget.mockReturnValue(
      of(updatedBudget)
    );

    mockBudgetOverview([updatedBudget]);

    await component.saveBudget();

    expect(
      budgetsApi.updateBudget
    ).toHaveBeenCalledWith(
      'budget-1',
      {
        category: 'Groceries',
        monthlyLimit: 600,
        budgetGroup: 'NEEDS',
      },
      component.selectedMonth
    );

    expect(component.budgets).toEqual([
      updatedBudget,
    ]);

    expect(component.editingBudgetId).toBeNull();
    expect(component.formError).toBe('');
    expect(component.saving).toBe(false);
  });


  // ---------------------------------
  // API failures and retries
  // ---------------------------------

  it('shows an error and allows retry after a failed save', async () => {
    const savedBudget = makeBudget({
      id: 'budget-3',
      category: 'Electricity',
      monthlyLimit: 300,
      spent: 0,
    });

    component.budgetForm = {
      budgetGroup: 'NEEDS',
      category: 'Electricity',
      otherCategory: '',
      monthlyLimit: 300,
    };

    budgetsApi.createBudget.mockReturnValueOnce(
      throwError(
        () => new Error('Network unavailable')
      )
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

    mockBudgetOverview([savedBudget]);

    await component.saveBudget();

    expect(component.budgets).toEqual([
      savedBudget,
    ]);

    expect(component.formError).toBe('');
    expect(component.saving).toBe(false);
  });


  it('shows a loading error and recovers after retry', async () => {
    budgetsApi.getBudgetOverview.mockReturnValueOnce(
      throwError(
        () => new Error('Network unavailable')
      )
    );

    await component.loadBudgets();

    expect(component.loadError).toBe(
      'Unable to load budgets. Please try again.'
    );

    expect(component.isLoading).toBe(false);

    budgetsApi.getBudgetOverview.mockReturnValueOnce(
      of({
        budgets: [],
        groupSpending: null,
      })
    );

    await component.loadBudgets();

    expect(component.loadError).toBe('');
    expect(component.budgets).toEqual([]);
    expect(component.isLoading).toBe(false);
  });


  it('keeps budgets available if allocation loading fails', async () => {
    budgetsApi.getAllocation.mockReturnValueOnce(
      throwError(
        () => new Error('Allocation unavailable')
      )
    );

    await component.loadBudgets();

    expect(component.loadError).toBe('');

    expect(component.allocationError).toBe(
      'Unable to load allocation targets.'
    );

    expect(component.budgets).toEqual([]);
    expect(component.isLoading).toBe(false);
  });


  // ---------------------------------
  // Allocation validation
  // ---------------------------------

  it('rejects percentages that do not total 100', async () => {
    component.allocationForm = {
      availableMoney: 2000,
      needsPercent: 55,
      wantsPercent: 30,
      savingsPercent: 25,
    };

    await component.saveAllocation();

    expect(component.allocationFormError).toBe(
      'Needs, Wants and Savings must add up to 100%.'
    );

    expect(
      budgetsApi.saveAllocation
    ).not.toHaveBeenCalled();
  });


  it('rejects negative available money', async () => {
    component.allocationForm = {
      availableMoney: -100,
      needsPercent: 55,
      wantsPercent: 20,
      savingsPercent: 25,
    };

    await component.saveAllocation();

    expect(component.allocationFormError).toContain(
      'valid available-money amount'
    );

    expect(
      budgetsApi.saveAllocation
    ).not.toHaveBeenCalled();
  });


  it('saves a valid allocation successfully', async () => {
    budgetsApi.saveAllocation.mockReturnValue(
      of(configuredAllocation)
    );

    component.showAllocationEditor = true;

    component.allocationForm = {
      availableMoney: 2000,
      needsPercent: 55,
      wantsPercent: 20,
      savingsPercent: 25,
    };

    await component.saveAllocation();

    expect(
      budgetsApi.saveAllocation
    ).toHaveBeenCalledWith(
      {
        availableMoney: 2000,
        needsPercent: 55,
        wantsPercent: 20,
        savingsPercent: 25,
      },
      component.selectedMonth
    );

    expect(component.allocation).toEqual(
      configuredAllocation
    );

    expect(component.showAllocationEditor).toBe(false);
    expect(component.allocationFormError).toBe('');
    expect(component.allocationSaving).toBe(false);
  });


  // ---------------------------------
  // Allocation warnings
  // ---------------------------------

  it('warns when a group exceeds its percentage target', () => {
    component.allocation = configuredAllocation;

    component.budgets = [
      makeBudget({
        id: 'needs-1',
        budgetGroup: 'NEEDS',
        category: 'Rent',
        monthlyLimit: 1200,
      }),

      makeBudget({
        id: 'wants-1',
        budgetGroup: 'WANTS',
        category: 'Eating out',
        monthlyLimit: 300,
      }),

      makeBudget({
        id: 'savings-1',
        budgetGroup: 'SAVINGS',
        category: 'Savings',
        monthlyLimit: 600,
      }),
    ];

    expect(
      component.getGroupOverAllocation('NEEDS')
    ).toBe(100);

    expect(
      component.getGroupOverAllocation('WANTS')
    ).toBe(0);

    expect(
      component.getGroupOverAllocation('SAVINGS')
    ).toBe(100);
  });


  it('warns when total planned budgets exceed available money', () => {
    component.allocation = configuredAllocation;

    component.budgets = [
      makeBudget({
        id: 'needs-1',
        budgetGroup: 'NEEDS',
        category: 'Rent',
        monthlyLimit: 1200,
      }),

      makeBudget({
        id: 'wants-1',
        budgetGroup: 'WANTS',
        category: 'Eating out',
        monthlyLimit: 300,
      }),

      makeBudget({
        id: 'savings-1',
        budgetGroup: 'SAVINGS',
        category: 'Savings',
        monthlyLimit: 600,
      }),
    ];

    expect(
      component.getOverallOverAllocation()
    ).toBe(100);
  });


  it('does not warn before an allocation is configured', () => {
    component.allocation = defaultAllocation;

    component.budgets = [
      makeBudget({
        monthlyLimit: 3000,
      }),
    ];

    expect(
      component.getGroupOverAllocation('NEEDS')
    ).toBe(0);

    expect(
      component.getOverallOverAllocation()
    ).toBe(0);
  });
});