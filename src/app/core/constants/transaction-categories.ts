
export interface TransactionCategoryGroup {
  label: string;
  categories: string[];
}

export const TRANSACTION_CATEGORY_GROUPS: TransactionCategoryGroup[] = [
  {
    label: 'Housing & Utilities',
    categories: [
      'Rent',
      'Mortgage',
      'Rates',
      'Electricity',
      'Gas',
      'Water',
      'Internet',
      'Phone',
      'Home Maintenance',
    ],
  },
  {
    label: 'Food & Dining',
    categories: [
      'Groceries',
      'Eating out',
      'Takeaways',
      'Coffee & Cafes',
    ],
  },
  {
    label: 'Transport & Vehicles',
    categories: [
      'Transport',
      'Fuel',
      'Public Transport',
      'Parking',
      'Vehicle Maintenance',
      'Car Insurance',
    ],
  },
  {
    label: 'Health & Wellbeing',
    categories: [
      'Healthcare',
      'Pharmacy',
      'Dental',
      'Health Insurance',
      'Fitness',
    ],
  },
  {
    label: 'Shopping & Lifestyle',
    categories: [
      'Shopping',
      'Clothing',
      'Electronics',
      'Entertainment',
      'Subscriptions',
      'Travel',
      'Personal Care',
      'Hobbies',
      'Gifts',
    ],
  },
  {
    label: 'Family & Education',
    categories: [
      'Education',
      'Childcare',
      'Pet Care',
      'Family Support',
    ],
  },
  {
    label: 'Financial & Bills',
    categories: [
      'Bills',
      'Insurance',
      'Loan Repayment',
      'Credit Card Payment',
      'BNPL Repayment',
      'Bank Fees',
      'Taxes',
      'Donations',
    ],
  },
  {
    label: 'Income',
    categories: [
      'Income',
      'Salary',
      'Business Income',
      'Freelance Income',
      'Interest Income',
      'Dividends',
      'Refund',
      'Other Income',
    ],
  },
  {
    label: 'Savings & Transfers',
    categories: [
      'Savings Transfer',
      'Internal Transfer',
      'Transfer',
      'Investment',
    ],
  },
  {
    label: 'Other',
    categories: ['Other'],
  },
];

export const TRANSACTION_CATEGORIES =
  TRANSACTION_CATEGORY_GROUPS.flatMap(
    group => group.categories
  );