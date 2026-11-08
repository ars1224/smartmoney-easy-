
import {
  Component,
  ElementRef,
  HostListener,
  inject,
  OnInit,
  ViewChild,
} from '@angular/core';
import { IonIcon } from '@ionic/angular';
import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { addIcons } from 'ionicons';
import {
  bookOutline,
  homeOutline,
  logOutOutline,
  personOutline,
} from 'ionicons/icons';
import { AuthService } from '../core/auth/auth.service';
import { BankAutoSyncService } from '../core/bank/bank-auto-sync.service';

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
export class AppShellComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly bankAutoSync = inject(BankAutoSyncService);

  thinkerOpen = false;
  isSettingsModalOpen = false;

  isLogoutModalOpen = false;
  logoutLoading = false;

  private logoutModalTrigger: HTMLElement | null = null;

  @ViewChild('logoutDialog')
  logoutDialog!: ElementRef<HTMLElement>;

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

  ngOnInit(): void {
    // Automatically synchronise connected banks
    // when the authenticated application opens.
    // Do not block the UI while synchronising.
    void this.bankAutoSync.syncOnAppOpen();
  }

  openLogoutModal(): void {
    this.logoutModalTrigger = document.activeElement as HTMLElement;

    this.isLogoutModalOpen = true;

    setTimeout(() => {
      this.logoutDialog?.nativeElement
        ?.querySelector<HTMLElement>('button:not(:disabled)')
        ?.focus();
    });
  }

  closeLogoutModal(): void {
    if (this.logoutLoading) {
      return;
    }

    this.isLogoutModalOpen = false;

    setTimeout(() => {
      this.logoutModalTrigger?.focus();
      this.logoutModalTrigger = null;
    });
  }

  logout(): void {
    if (this.logoutLoading) {
      return;
    }

    this.logoutLoading = true;

    this.auth.logout().subscribe({
      next: () => {
        this.logoutLoading = false;
        this.isLogoutModalOpen = false;

        void this.router.navigateByUrl('/auth/login');
      },
      error: (error: Error) => {
        this.logoutLoading = false;
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
    if (this.isLogoutModalOpen) {
      this.closeLogoutModal();
      return;
    }

    if (this.thinkerOpen) {
      this.closeThinker();
    }
  }

  @HostListener('document:keydown', ['$event'])
  trapLogoutModalFocus(event: KeyboardEvent): void {
    if (!this.isLogoutModalOpen || event.key !== 'Tab') {
      return;
    }

    const dialog = this.logoutDialog?.nativeElement;

    if (!dialog) {
      return;
    }

    const focusableElements =
      dialog.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
      );

    if (focusableElements.length === 0) {
      event.preventDefault();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (
      !event.shiftKey &&
      document.activeElement === lastElement
    ) {
      event.preventDefault();
      firstElement.focus();
    }
  }
}
