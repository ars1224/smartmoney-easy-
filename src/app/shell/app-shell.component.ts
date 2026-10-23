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
  get isProfileSectionActive(): boolean {
    const path = this.router.url.split(/[?#]/)[0];

    return (
      path === '/app/profile' ||
      path.startsWith('/app/profile/') ||
      path === '/app/profile-settings' ||
      path.startsWith('/app/profile-settings/')
    );
  }

  thinkerOpen = false;

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
    this.auth.logout();
    void this.router.navigateByUrl('/auth/login');
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

  @HostListener('document:keydown.escape')
  closeThinkerWithEscape(): void {
    if (this.thinkerOpen) {
      this.closeThinker();
    }
  }
}
