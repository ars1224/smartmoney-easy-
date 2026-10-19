import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { SmCardComponent } from '../../shared/ui/sm-card/sm-card.component';
import { SmProgressComponent } from '../../shared/ui/sm-progress/sm-progress.component';
import { DashboardDataService, DashboardSnapshot } from './dashboard-data.service';

type DashboardState = 'loading' | 'ready' | 'empty' | 'error' | 'stale';

@Component({
  selector: 'app-dashboard', standalone: true,
  imports: [CurrencyPipe, DatePipe, RouterLink, SmCardComponent, SmProgressComponent],
  templateUrl: './dashboard.page.html', styleUrl: './dashboard.page.scss',
})
export class DashboardPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly data = inject(DashboardDataService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly snapshot = signal<DashboardSnapshot | null>(null);
  readonly state = signal<DashboardState>('loading');
  readonly notice = signal('');
  readonly firstName = computed(() => this.auth.currentUser()?.name.trim().split(/\s+/)[0] || 'there');
  readonly today = new Date();

  ngOnInit(): void { this.load(); }
  load(): void {
    this.state.set('loading');
    this.data.load().subscribe({
      next: (snapshot) => {
        this.snapshot.set(snapshot);
        const preview = this.route.snapshot.queryParamMap.get('dashboardState');
        this.state.set(preview === 'empty' || preview === 'error' || preview === 'stale' ? preview : 'ready');
      },
      error: () => this.state.set(this.snapshot() ? 'stale' : 'error'),
    });
  }
  retry(): void {
    if (this.route.snapshot.queryParamMap.has('dashboardState')) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { dashboardState: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      }).then(() => this.load());
      return;
    }
    this.load();
  }
  progress(value: number, maximum: number): number {
    return maximum > 0 ? Math.min(100, Math.round((value / maximum) * 100)) : 0;
  }
  showPending(action: string): void {
    this.notice.set(`${action} will be available when the Activity and Goals features are implemented.`);
  }

  openThinker(): void {
    window.dispatchEvent(new Event('smartmoney:open-thinker'));
  }
}
