import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'auth',
    children: [
      {
        path: 'login',
        loadComponent: () =>
          import('./pages/route-placeholder/route-placeholder.page').then(
            (m) => m.RoutePlaceholderPage,
          ),
        data: {
          eyebrow: 'Account access',
          title: 'Log in',
          description: 'Authentication page placeholder ready for Phase 2.',
          publicPage: true,
          nextLink: '/auth/register',
          nextLabel: 'Create account',
        },
      },
      {
        path: 'register',
        loadComponent: () =>
          import('./pages/route-placeholder/route-placeholder.page').then(
            (m) => m.RoutePlaceholderPage,
          ),
        data: {
          eyebrow: 'Create an account',
          title: 'Join SmartMoney! Easy',
          description: 'Registration page placeholder ready for Phase 2.',
          publicPage: true,
          nextLink: '/auth/login',
          nextLabel: 'Back to log in',
        },
      },
      { path: '', redirectTo: 'login', pathMatch: 'full' },
      
    ],
  },
  {
    path: 'app',
    loadComponent: () =>
      import('./shell/app-shell.component').then((m) => m.AppShellComponent),
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/route-placeholder/route-placeholder.page').then(
            (m) => m.RoutePlaceholderPage,
          ),
        data: {
          eyebrow: 'Financial fitness',
          title: 'Dashboard',
          description: 'Your safe-to-spend and financial overview will appear here.',
          nextLink: '/app/reports',
          nextLabel: 'View reports',
        },
      },
      {
        path: 'activity',
        loadComponent: () =>
          import('./pages/route-placeholder/route-placeholder.page').then(
            (m) => m.RoutePlaceholderPage,
          ),
        data: {
          eyebrow: 'Money activity',
          title: 'Activity',
          description: 'Manual and connected-bank transactions will appear here.',
          nextLink: '/app/reports',
          nextLabel: 'View reports',
        },
      },
      {
        path: 'budgets',
        loadComponent: () =>
          import('./pages/route-placeholder/route-placeholder.page').then(
            (m) => m.RoutePlaceholderPage,
          ),
        data: {
          eyebrow: 'Plan spending',
          title: 'Budgets',
          description: 'Budget limits, progress and supportive alerts will appear here.',
        },
      },
      {
        path: 'goals',
        loadComponent: () =>
          import('./pages/route-placeholder/route-placeholder.page').then(
            (m) => m.RoutePlaceholderPage,
          ),
        data: {
          eyebrow: 'Build momentum',
          title: 'Savings goals',
          description: 'Savings progress and milestones will appear here.',
        },
      },
      {
        path: 'reports',
        loadComponent: () =>
          import('./pages/route-placeholder/route-placeholder.page').then(
            (m) => m.RoutePlaceholderPage,
          ),
        data: {
          eyebrow: 'Understand patterns',
          title: 'Reports & insights',
          description: 'Financial charts and useful insights will appear here.',
        },
      },
      {
        path: 'learn',
        loadComponent: () =>
          import('./pages/route-placeholder/route-placeholder.page').then(
            (m) => m.RoutePlaceholderPage,
          ),
        data: {
          eyebrow: 'Learn one step at a time',
          title: 'Learn',
          description: 'Short personalised financial-learning content will appear here.',
        },
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./pages/route-placeholder/route-placeholder.page').then(
            (m) => m.RoutePlaceholderPage,
          ),
        data: {
          eyebrow: 'Your account',
          title: 'Profile & assets',
          description: 'Personal details, cash assets and connected accounts will appear here.',
        },
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },

      {
        path: 'profile-settings',
        loadComponent: () =>
          import('./pages/profile-settings/profile-settings.page').then(
            (m) => m.ProfileSettingsPage,
          ),
      },

    ],
  },
  {
    path: '',
    redirectTo: 'auth/login',
    pathMatch: 'full',
  },
  { path: '**', redirectTo: 'auth/login' },
];
