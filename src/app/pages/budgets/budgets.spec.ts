
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
import { BudgetsApiService } from '../../core/services/budgets-api.service';

describe('BudgetsPage', () => {
  let component: BudgetsPage;

  const budgetsApi = {
    getBudgets: vi.fn(),
    createBudget: vi.fn(),
    updateBudget: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    budgetsApi.getBudgets.mockReturnValue(of([]));

    TestBed.configureTestingModule({
      providers: [
        {
          provide: BudgetsApiService,
          useValue: budgetsApi,
        },
      ],
    });

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

    component.budgetForm = {
      category: 'Transport',
      otherCategory: '',
      monthlyLimit: 250,
    };

    await component.saveBudget();

    expect(budgetsApi.createBudget).toHaveBeenCalledWith({
      category: 'Transport',
      monthlyLimit: 250,
    });

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

    budgetsApi.createBudget.mockReturnValue(of(savedBudget));

    component.budgetForm = {
      category: 'Other',
      otherCategory: '  Loan  ',
      monthlyLimit: 50000,
    };

    await component.saveBudget();

    expect(budgetsApi.createBudget).toHaveBeenCalledWith({
      category: 'Other - Loan',
      monthlyLimit: 50000,
    });

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

    await component.saveBudget();

    expect(budgetsApi.updateBudget).toHaveBeenCalledWith(
      'budget-1',
      {
        category: 'Groceries',
        monthlyLimit: 600,
      }
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
});
