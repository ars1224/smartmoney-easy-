import { Component, ElementRef, ViewChild, OnInit, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SmButtonComponent } from '../../shared/ui/sm-button/sm-button.component';
import { CategoryReport, ReportsApiService, ReportSource, ReportSummary } from './reports-api.service';

export function nzMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit' }).formatToParts(now);
  return `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}`;
}
@Component({
  selector: 'app-reports', standalone: true,
  imports: [FormsModule, RouterLink, SmButtonComponent],
  templateUrl: './reports.page.html', styleUrl: './reports.page.scss',
})
export class ReportsPage implements OnInit, OnDestroy {
  private readonly api = inject(ReportsApiService);
  private requestId = 0;
  private categoryRequestId = 0;
  private categoryTrigger: HTMLElement | null = null;
  @ViewChild('categoryDialog') categoryDialog?: ElementRef<HTMLDialogElement>;
  readonly selectedCategory = signal('');
  readonly categoryReport = signal<CategoryReport | null>(null);
  readonly categoryLoading = signal(false);
  readonly categoryError = signal('');

  readonly month = signal(nzMonth());
  readonly source = signal<ReportSource>('all');
  readonly report = signal<ReportSummary | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  get currentMonth() { return nzMonth(); }
  readonly monthLabel = computed(() => new Intl.DateTimeFormat('en-NZ', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${this.month()}-15T00:00:00Z`)));
  readonly weeks = computed(() => {
    const days = this.report()?.daily ?? [];
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) {
      const block = days.slice(i, i + 7);
      weeks.push({ label: `${i + 1}–${i + block.length}`, income: block.reduce((n, d) => n + Number(d.income), 0), expenses: block.reduce((n, d) => n + Number(d.expenses), 0), refunds: block.reduce((n, d) => n + Number(d.refunds), 0) });
    }
    return weeks;
  });
  readonly chartMaximum = computed(() => {
    const maximum = Math.max(1, ...this.weeks().flatMap(w => [w.income, w.expenses]));
    const roughStep = maximum / 4;
    const unit = 10 ** Math.floor(Math.log10(roughStep));
    const step = ([1, 2, 2.5, 5, 10].find(value => value >= roughStep / unit) ?? 10) * unit;
    return step * 4;
  });
  readonly chartTicks = computed(() => [1, .75, .5, .25, 0].map(value => value * this.chartMaximum()));
  axisLabel(value: number) {
    return '$' + new Intl.NumberFormat('en-NZ', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  }
  readonly topCategory = computed(() => this.report()?.categories[0]);
  ngOnInit() { void this.load(); }
  ngOnDestroy() { this.requestId++; this.categoryRequestId++; }
  cashFlowExplanation(value: string): string {
    const amount = Number(value);
    if (amount === 0) return 'Recorded inflows and outflows were equal.';
    return amount > 0
      ? `Recorded inflows exceeded outflows by ${this.money(amount)}.`
      : `Recorded outflows exceeded inflows by ${this.money(-amount)}.`;
  }
  openCategory(name: string, event: Event) {
    this.categoryTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.selectedCategory.set(name);
    this.categoryDialog?.nativeElement.showModal();
    void this.loadCategory();
  }
  async loadCategory() {
    const id = ++this.categoryRequestId;
    this.categoryReport.set(null); this.categoryLoading.set(true); this.categoryError.set('');
    try {
      const report = await firstValueFrom(this.api.getCategory(this.month(), this.source(), this.selectedCategory()));
      if (id === this.categoryRequestId) this.categoryReport.set(report);
    } catch {
      if (id === this.categoryRequestId) this.categoryError.set('We couldn’t load these transactions. Please try again.');
    } finally {
      if (id === this.categoryRequestId) this.categoryLoading.set(false);
    }
  }
  closeCategory() { this.categoryDialog?.nativeElement.close(); }
  categoryClosed() {
    this.categoryRequestId++;
    this.selectedCategory.set(''); this.categoryReport.set(null); this.categoryError.set('');
    if (this.categoryTrigger?.isConnected) this.categoryTrigger.focus();
    this.categoryTrigger = null;
  }
  dateLabel(value: string) {
    return new Intl.DateTimeFormat('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
  }
  originalAmount(value: string, currency: string) {
    return new Intl.NumberFormat('en-NZ', {style: 'currency', currency, currencyDisplay: 'code'}).format(Number(value));
  }
  async load() {
    const id = ++this.requestId;
    this.loading.set(true); this.error.set(''); this.report.set(null);
    try {
      const report = await firstValueFrom(this.api.getReport(this.month(), this.source()));
      if (id === this.requestId) this.report.set(report);
    } catch {
      if (id === this.requestId) this.error.set('We couldn’t load this report. Your transactions have not been changed.');
    } finally {
      if (id === this.requestId) this.loading.set(false);
    }
  }
  selectMonth(value: string) {
    if (!/^([2-9][0-9]{3}|19[0-9]{2})-(0[1-9]|1[0-2])$/.test(value) || value > this.currentMonth) return;
    this.month.set(value); void this.load();
  }
  moveMonth(direction: number) {
    const date = new Date(`${this.month()}-01T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + direction);
    this.selectMonth(date.toISOString().slice(0, 7));
  }
  selectSource(value: string) {
    if (value !== 'all' && value !== 'cash' && value !== 'bank') return;
    this.source.set(value); void this.load();
  }
  money(value: string | number) {
    return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2 }).format(Number(value));
  }
  categoryTone(name: string): string {
    const tones: Record<string, string> = {
      groceries: 'teal', transport: 'yellow', 'eating out': 'coral',
      bills: 'green', utilities: 'green', shopping: 'navy', entertainment: 'teal',
    };
    return tones[name.trim().toLowerCase()] ?? 'neutral';
  }
  bar(value: number) { return value ? Math.max(2, value / this.chartMaximum() * 100) : 0; }
}
