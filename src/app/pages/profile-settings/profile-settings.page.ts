
import { Component } from '@angular/core';
import { IonContent } from '@ionic/angular/ion-content';

import { SmCardComponent } from '../../shared/ui/sm-card/sm-card.component';
import { SmButtonComponent } from '../../shared/ui/sm-button/sm-button.component';

@Component({
  selector: 'app-profile-settings',
  standalone: true,
  imports: [
    IonContent,
    SmCardComponent,
    SmButtonComponent,
  ],
  templateUrl: './profile-settings.page.html',
  styleUrl: './profile-settings.pages.scss',
})
export class ProfileSettingsPage {
  readonly settings = [
    {
      title: 'Personal details',
      description: 'Manage this setting',
      action: 'personal-details',
    },
    {
      title: 'Change password',
      description: 'Manage this setting',
      action: 'change-password',
    },
    {
      title: 'Export my data',
      description: 'Manage this setting',
      action: 'export-data',
    },
    {
      title: 'Remove stored bank data',
      description:
        'Permanently remove imported history without deleting the account',
      action: 'remove-bank-data',
    },
    {
      title: 'Log out',
      description: 'Manage this setting',
      action: 'logout',
    },
    {
      title: 'Delete SmartMoney account',
      description: 'Permanent action requiring confirmation',
      action: 'delete-account',
      danger: true,
    },
  ];

  openSetting(action: string): void {
    console.log('Selected setting:', action);
  }

  goBack(): void {
    window.history.back();
  }
}
