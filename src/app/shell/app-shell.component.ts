import { Component, HostListener, inject } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { addIcons } from 'ionicons';
import { bookOutline, homeOutline, logOutOutline, personOutline } from 'ionicons/icons';
import { AuthService } from '../core/auth/auth.service';

interface NavigationItem {
  label: string;
  route: string;
  icon?: string;
  iconName?: string;
}

@Component({
  selector: 'app-shell',
  standalone: true,
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
  imports: [IonIcon, RouterLink, RouterLinkActive, RouterOutlet],
})
export class AppShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  thinkerOpen = false;
  isSettingsModalOpen = false;

  readonly navigation: NavigationItem[] = [
    { label: 'Home', route: '/app/dashboard', iconName: 'home-outline' },
    { label: 'Activity', route: '/app/activity', icon: '↕' },
    { label: 'Budgets', route: '/app/budgets', icon: '▤' },
    { label: 'Goals', route: '/app/goals', icon: '◎' },
    { label: 'Learn', route: '/app/learn', iconName: 'book-outline' },
  ];

  constructor() {
    addIcons({ bookOutline, homeOutline, logOutOutline, personOutline });
  }

  logout(): void {
    this.auth.logout().subscribe({
      next: () => {
        void this.router.navigateByUrl('/auth/login');
      },
      error: (error: Error) => {
        window.alert(error.message);
      },
    });
  }

  openThinker(): void {
    this.thinkerOpen = true;
  }

  @HostListener('window:smartmoney:open-thinker')
  openThinkerFromDashboard(): void {
    this.openThinker();
  }

  closeThinker(): void {
    this.thinkerOpen = false;
  }

  @HostListener('window:smartmoney:settings-modal', ['$event'])
  onSettingsModalChange(event: Event): void {
    const customEvent = event as CustomEvent<{ isOpen: boolean }>;
    this.isSettingsModalOpen = customEvent.detail?.isOpen === true;
  }

  @HostListener('document:keydown.escape')
  closeThinkerWithEscape(): void {
    if (this.thinkerOpen) {
      this.closeThinker();
    }
  }
}
