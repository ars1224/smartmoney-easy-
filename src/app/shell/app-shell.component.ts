import { Component, HostListener } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { addIcons } from 'ionicons';
import { bookOutline, homeOutline, personOutline } from 'ionicons/icons';

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
  thinkerOpen = false;

  readonly navigation: NavigationItem[] = [
    { label: 'Home', route: '/app/dashboard', iconName: 'home-outline' },
    { label: 'Activity', route: '/app/activity', icon: '↕' },
    { label: 'Budgets', route: '/app/budgets', icon: '▤' },
    { label: 'Goals', route: '/app/goals', icon: '◎' },
    { label: 'Learn', route: '/app/learn', iconName: 'book-outline' },
  ];

  constructor() {
    addIcons({ bookOutline, homeOutline, personOutline });
  }

  openThinker(): void {
    this.thinkerOpen = true;
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
