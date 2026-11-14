export type BudgetGroup =
  | 'NEEDS'
  | 'WANTS'
  | 'SAVINGS';

export type GoalGroup =
  | 'NEEDS'
  | 'WANTS'
  | 'SAVINGS';

export const BUDGET_CATEGORIES: Record<
  BudgetGroup,
  readonly string[]
> = {
  NEEDS: [
    'Rent',
    'Mortgage',
    'Rates',
    'Groceries',
    'Electricity',
    'Gas',
    'Water',
    'Internet',
    'Phone',
    'Transport',
    'Fuel',
    'Public Transport',
    'Parking',
    'Healthcare',
    'Pharmacy',
    'Dental',
    'Insurance',
    'Health Insurance',
    'Car Insurance',
    'Education',
    'Childcare',
    'Vehicle Maintenance',
    'Home Maintenance',
    'Other',
  ],
  WANTS: [
    'Eating out',
    'Takeaways',
    'Coffee & Cafes',
    'Entertainment',
    'Shopping',
    'Clothing',
    'Electronics',
    'Subscriptions',
    'Travel',
    'Personal Care',
    'Hobbies',
    'Gifts',
    'Fitness',
    'Pet Care',
    'Donations',
    'Other',
  ],
    SAVINGS: [
    'Savings',
  ],
};

export const GOAL_CATEGORIES: Record<
  GoalGroup,
  readonly string[]
> = {
  NEEDS: [
    'Medical Fund',
    'Car Repairs',
    'Education Fund',
    'Home Repairs',
    'Essential Appliances',
    'Family Support',
    'Moving Expenses',
    'Other',
  ],
  WANTS: [
    'Holiday Fund',
    'New Laptop',
    'Electronics & Gadgets',
    'Wedding Fund',
    'New Car',
    'Shopping Fund',
    'Hobbies',
    'Other',
  ],
  SAVINGS: [
    'Emergency Fund',
    'General Savings',
    'House Deposit',
    'Retirement Fund',
    'Investment Fund',
    'Rainy Day Fund',
    'Long-term Savings',
    'Other',
  ],
};
