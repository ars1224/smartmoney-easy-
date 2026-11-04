import { ChallengeSceneComponent } from './challenge-scene.component';
import { CHALLENGE_BANK } from './challenge-bank';
import { DAILY_KEY, dailyQuestions, localDay, practiceQuestions, restoreProgress } from './daily-challenges';
import { ChallengeStoryComponent } from './challenge-story.component';
import { SmButtonComponent } from '../../shared/ui/sm-button/sm-button.component';
import { Component, ElementRef, ViewChild, computed, signal, HostListener, OnDestroy } from '@angular/core';


@Component({ selector: 'app-daily-challenge', standalone: true, imports: [SmButtonComponent, ChallengeStoryComponent, ChallengeSceneComponent], templateUrl: './daily-challenge.component.html', styleUrl: './daily-challenge.component.scss' })
export class DailyChallengeComponent implements OnDestroy {
  @ViewChild('firstChoice') private firstChoice?: ElementRef<HTMLButtonElement>;
  @ViewChild('questionHeading') private questionHeading?: ElementRef<HTMLHeadingElement>;
  readonly takeaways: Record<string, string> = {
    scam: 'Open your bank app independently when a message asks you to act.',
    payday: 'Check your calendar for one bill that does not arrive every week.',
    subscription: 'Review one subscription and ask whether you still use it.',
    saving: 'Break a savings goal into amounts that fit your pay cycle.',
    expense: 'Compare your options and the total cost before committing.',
  };
  readonly day = signal(localDay());
  readonly mode = signal<'daily' | 'practice'>('daily');
  readonly activeQuestions = signal(dailyQuestions(this.day()));
  get questions() { return this.activeQuestions(); }
  readonly bankSize = CHALLENGE_BANK.length;
  readonly storageAvailable = signal(true);
  private readonly dayTimer = setInterval(() => this.checkDay(), 60000);
  constructor() { this.restoreDaily(); }
  ngOnDestroy(): void { clearInterval(this.dayTimer); }
  @HostListener('window:focus') checkDay(): boolean {
    if (localDay() !== this.day()) { this.day.set(localDay()); this.mode.set('daily'); this.activeQuestions.set(dailyQuestions(this.day())); this.restoreDaily(); return true; }
    return false;
  }
  private restoreDaily(): void {
    let raw: string | null = null;
    try { raw = localStorage.getItem(DAILY_KEY); } catch { this.storageAvailable.set(false); }
    const state = restoreProgress(raw, this.day(), this.questions);
    this.answers.set(state.answers); this.index.set(state.index); this.completed.set(state.completed);
  }
  private persist(): void {
    if (this.mode() !== 'daily') return;
    try { localStorage.setItem(DAILY_KEY, JSON.stringify({ version: 1, day: this.day(), answers: this.answers(), index: this.index(), completed: this.completed() })); }
    catch { this.storageAvailable.set(false); }
  }
  practise(): void {
    this.checkDay();
    const excluded = [...dailyQuestions(this.day()).map(q => q.id), ...this.questions.map(q => q.id)];
    this.mode.set('practice'); this.activeQuestions.set(practiceQuestions(excluded, String(Date.now()) + Math.random()));
    this.answers.set({}); this.index.set(0); this.completed.set(false); this.focusHeading();
  }
  returnToDaily(): void { this.checkDay(); this.mode.set('daily'); this.activeQuestions.set(dailyQuestions(this.day())); this.restoreDaily(); this.focusHeading(); }
  takeaway(): string { return this.question().takeaway ?? this.takeaways[this.question().id]; }

  readonly index = signal(0);
  readonly completed = signal(false);
  readonly answeredCount = computed(() => Object.keys(this.answers()).length);
  readonly isNumeric = computed(() => this.question().numeric || ['subscription', 'saving'].includes(this.question().id));
  finish(): void { if (this.checkDay()) return; this.completed.set(true); this.persist(); this.focusHeading(); }
  review(): void { this.completed.set(false); this.index.set(0); this.persist(); this.focusHeading(); }
  restart(): void { this.answers.set({}); this.review(); }
  private focusHeading(): void { setTimeout(() => this.questionHeading?.nativeElement.focus()); }

  readonly question = computed(() => this.questions[this.index()]);
  readonly answers = signal<Record<string, number>>({});
  readonly answer = computed(() => this.answers()[this.question().id] ?? null);
  choose(value: number): void { if (this.checkDay()) return; if (!Number.isInteger(value) || value < 0 || value >= this.question().choices.length) return; this.answers.update(answers => ({ ...answers, [this.question().id]: value })); this.persist(); }
  reset(): void {
    if (this.checkDay()) return;
    this.answers.update(answers => { const next = { ...answers }; delete next[this.question().id]; return next; });
    this.persist();
    this.firstChoice?.nativeElement.focus();
  }
  move(direction: number): void {
    if (this.checkDay()) return;
    const next = this.index() + direction;
    if (next < 0 || next >= this.questions.length) return;
    this.index.set(next); this.persist();
    // Keep keyboard focus on the new question after Angular updates the view.
    this.focusHeading();
  }
}
