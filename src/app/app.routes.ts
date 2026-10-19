import { Routes } from '@angular/router';


export const routes: Routes = [
  {
    path: 'bank/callback',
    loadComponent: () =>
      import('./pages/bank-callback/bank-callback')
        .then((m) => m.BankCallback),
  },
  {
    path: 'home',
    loadComponent: () =>
      import('./home/home.page').then((m) => m.HomePage),
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
];
