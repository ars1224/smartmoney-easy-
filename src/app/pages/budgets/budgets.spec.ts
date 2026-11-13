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
} from '../../core/services/budgets-api.service';
import { MonthlyIncomeApiService } from '../../core/services/monthly-income-api.service';

describe('BudgetsPage', () => {
    let component: BudgetsPage;

    const makeOverview = (budgets: BudgetRecord[] = []) => ({
    budgets,
    groupSpending: {
      NEEDS: 0,
      WANTS: 0,
    },
  });

    const budgetsApi = {
    getBudgetOverview: vi.fn(),
    createBudget: vi.fn(),
    updateBudget: vi.fn(),
    };

  const incomeApi = {
    getSummary: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    budgetsApi.getBudgetOverview.mockReturnValue(
    of(makeOverview())
    );

    incomeApi.getSummary.mockReturnValue(
      of({
        month: '2026-11',
        expectedIncome: null,
        allocatedBudget: 0,
        unallocatedBudget: null,
      })
    );

    TestBed.configureTestingModule({
      providers: [
        {
          provide: BudgetsApiService,
          useValue: budgetsApi,
        },
        {
          provide: MonthlyIncomeApiService,
          useValue: incomeApi,
        },
      ],
    });

    const fixture = TestBed.createComponent(BudgetsPage);
    component = fixture.componentInstance;
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

    expect(budgetsApi.createBudget).not.toHaveBeenCalled();
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

    expect(budgetsApi.createBudget).not.toHaveBeenCalled();
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

    expect(budgetsApi.createBudget).not.toHaveBeenCalled();
  });

  it('rejects duplicate categories', async () => {
    component.budgets = [
      {
        id: 'budget-1',
        budgetGroup: 'NEEDS',
        category: 'Groceries',
        monthlyLimit: 400,
        spent: 50,
        createdAt: '',
        updatedAt: '',
      },
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

    expect(budgetsApi.createBudget).not.toHaveBeenCalled();
  });

  it('creates a budget successfully', async () => {
    const savedBudget = {
      id: 'budget-2',
      budgetGroup: 'NEEDS' as const,
      category: 'Transport',
      monthlyLimit: 250,
      spent: 0,
      createdAt: '',
      updatedAt: '',
    };

    budgetsApi.createBudget.mockReturnValue(
      of(savedBudget)
    );

    budgetsApi.getBudgetOverview.mockReturnValue(
      of(makeOverview([savedBudget]))
    );

    component.budgetForm = {
      budgetGroup: 'NEEDS',
      category: 'Transport',
      otherCategory: '',
      monthlyLimit: 250,
    };

    await component.saveBudget();

    expect(budgetsApi.createBudget).toHaveBeenCalledWith(
      {
        category: 'Transport',
        monthlyLimit: 250,
        budgetGroup: 'NEEDS',
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
      budgetGroup: 'NEEDS' as const,
      category: 'Other - Loan',
      monthlyLimit: 50000,
      spent: 50,
      createdAt: '',
      updatedAt: '',
    };

    budgetsApi.createBudget.mockReturnValue(
      of(savedBudget)
    );

    budgetsApi.getBudgetOverview.mockReturnValue(
        of(makeOverview([savedBudget]))
    );

    component.budgetForm = {
      budgetGroup: 'NEEDS',
      category: 'Other',
      otherCategory: '  Loan  ',
      monthlyLimit: 50000,
    };

    await component.saveBudget();

    expect(budgetsApi.createBudget).toHaveBeenCalledWith(
      {
        category: 'Other - Loan',
        monthlyLimit: 50000,
        budgetGroup: 'NEEDS',
      },
      component.selectedMonth
    );

    expect(budgetsApi.getBudgetOverview).toHaveBeenCalledWith(
      component.selectedMonth
    );

    expect(component.budgets).toEqual([savedBudget]);
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

    expect(budgetsApi.createBudget).not.toHaveBeenCalled();
  });

  it('prefills the custom category when editing', () => {
    const existingBudget = {
      id: 'budget-custom',
      budgetGroup: 'NEEDS' as const,
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
      budgetGroup: 'NEEDS',
      category: 'Other',
      otherCategory: 'Loan',
      monthlyLimit: 50000,
    });
  });

  it('updates an existing budget successfully', async () => {
    const existingBudget = {
      id: 'budget-1',
      budgetGroup: 'NEEDS' as const,
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
      budgetGroup: 'NEEDS',
      category: 'Groceries',
      otherCategory: '',
      monthlyLimit: 600,
    };

    budgetsApi.updateBudget.mockReturnValue(
      of(updatedBudget)
    );

    budgetsApi.getBudgetOverview.mockReturnValue(
        of(makeOverview([updatedBudget]))
    );

    await component.saveBudget();

    expect(budgetsApi.updateBudget).toHaveBeenCalledWith(
      'budget-1',
      {
        category: 'Groceries',
        monthlyLimit: 600,
        budgetGroup: 'NEEDS',
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
    budgetGroup: 'NEEDS' as const,
    category: 'Electricity',
    monthlyLimit: 300,
    spent: 0,
    createdAt: '',
    updatedAt: '',
    };

    component.budgetForm = {
    budgetGroup: 'NEEDS',
    category: 'Electricity',
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

    budgetsApi.getBudgetOverview.mockReturnValue(
        of(makeOverview([savedBudget]))
    );

    await component.saveBudget();

    expect(component.budgets).toEqual([savedBudget]);
    expect(component.formError).toBe('');
    expect(component.saving).toBe(false);
  });

  it('shows a loading error and recovers after retry', async () => {
    budgetsApi.getBudgetOverview.mockReturnValueOnce(
      throwError(() => new Error('Network unavailable'))
    );

    await component.loadBudgets();

    expect(component.loadError).toBe(
      'Unable to load budgets. Please try again.'
    );

    expect(component.isLoading).toBe(false);

    budgetsApi.getBudgetOverview.mockReturnValueOnce(
      of(makeOverview())
    );

    await component.loadBudgets();

    expect(component.loadError).toBe('');
    expect(component.budgets).toEqual([]);
    expect(component.isLoading).toBe(false);
  });
});