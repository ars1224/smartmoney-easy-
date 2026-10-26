import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  // Mock Bank OAuth callback
  {
    path: 'bank/callback',
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
        loadComponent: () =>
          import('./pages/auth/login/login.page')
            .then((m) => m.LoginPage),
      },
      {
        path: 'register',
        loadComponent: () =>
          import('./pages/auth/register/register.page')
            .then((m) => m.RegisterPage),
      },
      {
        path: 'forgot-password',
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

  // Protected SmartMoney application
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./shell/app-shell.component')
        .then((m) => m.AppShellComponent),
    children: [
      {
        path: 'dashboard',
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
        loadComponent: () =>
          import('./pages/add-transaction/add-transaction').then(
            (m) => m.AddTransactionPage
          ),
      },


      {
        path: 'activity/edit/:id',
        loadComponent: () =>
        import('./pages/add-transaction/add-transaction').then(
          (m) => m.AddTransactionPage
        ),
      },


      {
        path: 'activity',
        loadComponent: () =>
        import('./pages/activity/activity')
          .then((m) => m.ActivityPage),
      },

      {
        path: 'budgets',
        loadComponent: () =>
        import('./pages/budgets/budgets')
          .then((m) => m.BudgetsPage),
      },

      {
        path: 'goals',
        loadComponent: () =>
          import('./pages/route-placeholder/route-placeholder.page')
            .then((m) => m.RoutePlaceholderPage),
        data: {
          eyebrow: 'Build momentum',
          title: 'Savings goals',
          description:
            'Savings progress and milestones will appear here.',
        },
      },
      {
        path: 'reports',
        loadComponent: () =>
          import('./pages/route-placeholder/route-placeholder.page')
            .then((m) => m.RoutePlaceholderPage),
        data: {
          eyebrow: 'Understand patterns',
          title: 'Reports & insights',
          description:
            'Financial charts and useful insights will appear here.',
        },
      },
      {
        path: 'learn',
        loadComponent: () =>
          import('./pages/route-placeholder/route-placeholder.page')
            .then((m) => m.RoutePlaceholderPage),
        data: {
          eyebrow: 'Learn one step at a time',
          title: 'Learn',
          description:
            'Short personalised financial-learning content will appear here.',
        },
      },
      {
        path: 'bank/connect',
        loadComponent: () =>
          import('./pages/bank-callback/bank-callback')
            .then((m) => m.BankCallbackPage),
      },

      {
        path: 'profile/settings',
        loadComponent: () =>
          import('./pages/profile-settings/profile-settings.page').then(
            (m) => m.ProfileSettingsPage,
          ),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./pages/route-placeholder/route-placeholder.page')
            .then((m) => m.RoutePlaceholderPage),
        data: {
          eyebrow: 'Your account',
          title: 'Profile & assets',
          description:
            'Personal details, cash assets and connected accounts will appear here.',

          nextLink: '/app/bank/connect',
          nextLabel: 'Connect Mock Bank',

          secondaryLink: '/app/profile/settings',
          secondaryLabel: 'Open Profile Settings',
        },
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
