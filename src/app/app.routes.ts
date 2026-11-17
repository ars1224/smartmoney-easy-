import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';
import { onboardingGuard } from './core/auth/onboarding.guard';

export const routes: Routes = [
  // Mock Bank OAuth callback
  {
    path: 'bank/callback',
    title: 'Bank connection | SmartMoney! Easy',
    loadComponent: () =>
      import('./pages/bank-callback/bank-callback')
        .then((m) => m.BankCallbackPage),
  },

  // Authentication routes - Dhona
  {
    path: 'auth',
    canActivate: [guestGuard],
    children: [
      {
        path: 'login',
        title: 'Log in | SmartMoney! Easy',
        loadComponent: () =>
          import('./pages/auth/login/login.page')
            .then((m) => m.LoginPage),
      },
      {
        path: 'register',
        title: 'Create account | SmartMoney! Easy',
        loadComponent: () =>
          import('./pages/auth/register/register.page')
            .then((m) => m.RegisterPage),
      },
      {
        path: 'forgot-password',
        title: 'Reset password | SmartMoney! Easy',
        loadComponent: () =>
          import('./pages/route-placeholder/route-placeholder.page')
            .then((m) => m.RoutePlaceholderPage),
        data: {
          eyebrow: 'Account access',
          title: 'Reset password',
          description:
            'Password recovery will be connected when the backend endpoint is ready.',
          publicPage: true,
          nextLink: '/auth/login',
          nextLabel: 'Back to log in',
        },
      },
      {
        path: '',
        redirectTo: 'login',
        pathMatch: 'full',
      },
    ],
  },

  // First-time onboarding
  {
    path: 'onboarding',
    title: 'Getting started | SmartMoney! Easy',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/onboarding/onboarding.page')
        .then((m) => m.OnboardingPage),
  },

  // Protected SmartMoney application
  {
    path: 'app',
    title: 'SmartMoney! Easy',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./shell/app-shell.component')
        .then((m) => m.AppShellComponent),
    children: [
      {
        path: 'dashboard',
        title: 'Dashboard | SmartMoney! Easy',
        loadComponent: () =>
      import('./pages/dashboard/dashboard.page')
        .then((m) => m.DashboardPage),
          data: {
          eyebrow: 'Financial fitness',
          title: 'Dashboard',
          description:
            'Your safe-to-spend and financial overview will appear here.',
          nextLink: '/app/reports',
          nextLabel: 'View reports',
        },
      },

      {
        path: 'activity/add',
        title: 'Add transaction | SmartMoney! Easy',
        loadComponent: () =>
          import('./pages/add-transaction/add-transaction').then(
            (m) => m.AddTransactionPage
          ),
      },


      {
        path: 'activity/edit/:id',
        title: 'Edit transaction | SmartMoney! Easy',
        loadComponent: () =>
        import('./pages/add-transaction/add-transaction').then(
          (m) => m.AddTransactionPage
        ),
      },


      {
        path: 'activity',
        title: 'Activity | SmartMoney! Easy',
        loadComponent: () =>
        import('./pages/activity/activity')
          .then((m) => m.ActivityPage),
      },

      {
        path: 'budgets',
        title: 'Budgets | SmartMoney! Easy',
        loadComponent: () =>
        import('./pages/budgets/budgets')
          .then((m) => m.BudgetsPage),
      },

      // Savings Goals — Aries
      {
        path: 'goals',
        title: 'Goals | SmartMoney! Easy',
        loadComponent: () =>
          import('./pages/savings-goals/savings-goals')
            .then((m) => m.SavingsGoalsPage),
      },
      {
        path: 'reports',
        title: 'Reports | SmartMoney! Easy',
        loadComponent: () =>
          import('./pages/reports/reports.page')
            .then((m) => m.ReportsPage),
        data: {
          eyebrow: 'Understand patterns',
          title: 'Reports & insights',
          description:
            'Financial charts and useful insights will appear here.',
        },
      },
      {
        path: 'learn',
        title: 'Learn | SmartMoney! Easy',
        loadComponent: () =>
          import('./pages/learn/learn.page')
            .then((m) => m.LearnPage),
        data: {
          eyebrow: 'Learn one step at a time',
          title: 'Learn',
          description:
            'Short personalised financial-learning content will appear here.',
        },
      },
      {
        path: 'bank/connect',
        title: 'Bank connection | SmartMoney! Easy',
        loadComponent: () =>
          import('./pages/bank-callback/bank-callback')
            .then((m) => m.BankCallbackPage),
      },

      {
        path: 'bank/accounts/:accountId',
        title: 'Bank account | SmartMoney! Easy',
        loadComponent: () =>
          import('./pages/bank-account-details/bank-account-details')
            .then((m) => m.BankAccountDetailsPage),
      },


      {
        path: 'profile/settings',
        title: 'Profile settings | SmartMoney! Easy',
        loadComponent: () =>
          import('./pages/profile-settings/profile-settings.page').then(
            (m) => m.ProfileSettingsPage,
          ),
      },
      {
        path: 'profile',
        title: 'Profile & Assets | SmartMoney! Easy',
        loadComponent: () =>
          import('./pages/profile-assets/profile-assets')
            .then((m) => m.ProfileAssetsPage),
      },

      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
    ],
  },

  // Public information pages
  {
    path: 'about',
    title: 'About | SmartMoney! Easy',
    loadComponent: () =>
      import('./pages/route-placeholder/route-placeholder.page')
        .then((m) => m.RoutePlaceholderPage),
    data: {
      eyebrow: 'About the app',
      title: 'SmartMoney! Easy',
      description:
        'A supportive financial-wellness app for tracking, planning and learning.',
      publicPage: true,
      nextLink: '/auth/login',
      nextLabel: 'Back to log in',
    },
  },
  {
    path: 'privacy',
    title: 'Privacy | SmartMoney! Easy',
    loadComponent: () =>
      import('./pages/route-placeholder/route-placeholder.page')
        .then((m) => m.RoutePlaceholderPage),
    data: {
      eyebrow: 'Development prototype',
      title: 'Prototype privacy statement',
      description:
        'SmartMoney! Easy currently uses mock authentication for development testing. Do not enter real passwords, bank credentials or sensitive financial information.',
      publicPage: true,
      nextLink: '/auth/register',
      nextLabel: 'Back to create account',
    },
  },

  // Default and fallback routes
  {
    path: '',
    redirectTo: 'auth/login',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: 'auth/login',
  },
];
