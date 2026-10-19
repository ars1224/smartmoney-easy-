import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'auth',
    canActivate: [guestGuard],
    children: [
      {
        path: 'login',
        loadComponent: () => import('./pages/auth/login/login.page').then((m) => m.LoginPage),
      },
      {
        path: 'register',
        loadComponent: () =>
          import('./pages/auth/register/register.page').then((m) => m.RegisterPage),
      },
      {
        path: 'forgot-password',
        loadComponent: () =>
          import('./pages/route-placeholder/route-placeholder.page').then(
            (m) => m.RoutePlaceholderPage,
          ),
        data: {
          eyebrow: 'Account access',
          title: 'Reset password',
          description: 'Password recovery will be connected when the backend endpoint is ready.',
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
    canActivate: [authGuard],
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
          import('./pages/profile-settings/profile-settings.page').then(
            (m) => m.ProfileSettingsPage,
          ),
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
  {
    path: 'about',
    loadComponent: () =>
      import('./pages/route-placeholder/route-placeholder.page').then(
        (m) => m.RoutePlaceholderPage,
      ),
    data: {
      eyebrow: 'About the app',
      title: 'SmartMoney! Easy',
      description: 'A supportive financial-wellness app for tracking, planning and learning.',
      publicPage: true,
      nextLink: '/auth/login',
      nextLabel: 'Back to log in',
    },
  },
  {
    path: 'privacy',
    loadComponent: () =>
      import('./pages/route-placeholder/route-placeholder.page').then(
        (m) => m.RoutePlaceholderPage,
      ),
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
  {
    path: '',
    redirectTo: 'auth/login',
    pathMatch: 'full',
  },
  { path: '**', redirectTo: 'auth/login' },
];
