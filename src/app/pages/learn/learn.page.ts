import { GuideReaderComponent } from './guide-reader.component';
import { DailyChallengeComponent } from './daily-challenge.component';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SmCardComponent } from '../../shared/ui/sm-card/sm-card.component';
import { SmButtonComponent } from '../../shared/ui/sm-button/sm-button.component';

type Topic = 'All topics' | 'Budgeting' | 'Saving' | 'Spending' | 'Staying safe';
export interface Guide {
  id: string;
  topic: Topic;
  number: string;
  title: string;
  description: string;
  minutes: number;
  sections: { title: string; body: string }[];
  action: string;
  route: string;
}
interface Article { title: string; url: string; publishedAt: string | null; topic?: string; via?: 'Google News' | 'Yahoo Finance' }
interface ArticleFeed {
  articles: Article[];
  status: 'available' | 'stale' | 'unavailable';
  fetchedAt: string | null;
}

export const LEARNING_GUIDES: Guide[] = [
  {
    id: 'budget', topic: 'Budgeting', number: '01', minutes: 1,
    title: 'Make a plan for payday',
    description: 'Start a simple budget that makes room for everyday life.',
    sections: [
      { title: 'Start with what comes in', body: 'List the income you can rely on for your next pay period. If it varies, use a cautious estimate.' },
      { title: 'Make space for the essentials', body: 'Add housing, food, transport and bills. Set something aside for costs that arrive less often, such as an annual payment.' },
      { title: 'Review, then adjust', body: 'Compare your plan with your spending. Pick one category to adjust, then check again next payday.' },
    ], action: 'Explore your budgets', route: '/app/budgets',
  },
  {
    id: 'saving', topic: 'Saving', number: '02', minutes: 1,
    title: 'What are you saving for?',
    description: 'Turn something you care about into a clear, achievable goal.',
    sections: [
      { title: 'Give your goal a purpose', body: 'Name something you care about: a rainy-day buffer, a course or a trip. Give your saving a purpose.' },
      { title: 'Choose a target and a date', body: 'Choose an amount and a date. Divide the amount by the paydays left, then check whether it fits your budget.' },
      { title: 'Track your progress', body: 'Record each contribution. SmartMoney tracks your progress; it does not transfer money between accounts.' },
    ], action: 'Set a savings goal', route: '/app/goals',
  },
  {
    id: 'spending', topic: 'Spending', number: '03', minutes: 1,
    title: 'Where did my money go?',
    description: 'Small check-ins can help you understand where your money goes.',
    sections: [
      { title: 'Look at a useful period', body: 'Check a week of spending, including cash. Which purchases do you remember, and which surprised you?' },
      { title: 'Group similar purchases', body: 'Group similar purchases, such as groceries or transport. Check categories before drawing conclusions from them.' },
      { title: 'Pick one thing to explore', body: 'Choose one change you can comfortably try. Check next week whether it helped, without judging every purchase.' },
    ], action: 'Review your activity', route: '/app/activity',
  },
  {
    id: 'safety', topic: 'Staying safe', number: '04', minutes: 1,
    title: 'Pause before you tap',
    description: 'Recognise pressure and protect your account information.',
    sections: [
      { title: 'Notice urgency', body: 'A countdown, threat or unexpected request for payment is a reason to pause. You do not need to respond immediately.' },
      { title: 'Check through a separate channel', body: 'Open the bank app yourself or use contact details you already trust. Avoid links and numbers in an unexpected message.' },
      { title: 'Keep access details private', body: 'Keep passwords and security codes private. If worried, contact the provider independently. Only use test information in this development app.' },
    ], action: 'Open profile settings', route: '/app/profile/settings',
  },
];

@Component({
  selector: 'app-learn',
  standalone: true,
  imports: [GuideReaderComponent, DailyChallengeComponent, DatePipe, FormsModule, SmCardComponent, SmButtonComponent],
  templateUrl: './learn.page.html',
  styleUrl: './learn.page.scss',
})
export class LearnPage {
  private readonly http = inject(HttpClient);
  readonly topics: Topic[] = ['All topics', 'Budgeting', 'Saving', 'Spending', 'Staying safe'];
  readonly topic = signal<Topic>('All topics');
  readonly search = signal('');
  readonly activeGuide = signal<Guide | null>(null);
  readonly feed = signal<ArticleFeed | null>(null);
  readonly feedLoading = signal(false);
  readonly feedError = signal(false);
  readonly guides = computed(() => {
    const query = this.search().trim().toLowerCase();
    return LEARNING_GUIDES.filter(guide =>
      (this.topic() === 'All topics' || guide.topic === this.topic()) &&
      `${guide.title} ${guide.description} ${guide.topic}`.toLowerCase().includes(query),
    );
  });
  readonly articles = computed(() => {
    const query = this.search().trim().toLowerCase();
    return (this.feed()?.articles ?? []).filter(article => article.title.toLowerCase().includes(query));
  });
  readonly listedGuides = computed(() => this.guides());
  readonly photos: Record<string, { src: string; alt: string }> = {
    budget: { src: 'assets/learn/budget-notebook.jpg', alt: 'Notebook, calculator and pen for planning a budget' },
    saving: { src: 'assets/learn/saving-jar.jpg', alt: 'Coins in a jar labelled Savings' },
    spending: { src: 'assets/learn/grocery-basket.jpg', alt: 'A basket of fresh vegetables while grocery shopping' },
    safety: { src: 'assets/learn/phone-message.jpg', alt: 'A person checking a message on a smartphone' },
  };
  readonly failedImages = signal<string[]>([]);
  readonly articleLimit = signal(3);
  readonly visibleArticles = computed(() => this.articles().slice(0, this.articleLimit()));
  imageAvailable(id: string): boolean { return !!this.photos[id] && !this.failedImages().includes(id); }
  hideImage(id: string): void { this.failedImages.update(ids => ids.includes(id) ? ids : [...ids, id]); }
  showMoreArticles(): void { this.articleLimit.update(limit => limit + 3); }
  setSearch(value: string): void { this.search.set(value); this.articleLimit.set(3); }

  constructor() { this.loadArticles(); }

  openGuide(guide: Guide): void {
    this.activeGuide.set(guide);
  }

  closeGuide(): void {
    this.activeGuide.set(null);
  }

  resetFilters(): void { this.topic.set('All topics'); this.search.set(''); this.articleLimit.set(3); }

  loadArticles(): void {
    if (this.feedLoading()) return;
    this.feedLoading.set(true);
    this.feedError.set(false);
    this.http.get<ArticleFeed>(`${environment.apiUrl}/learn/articles`, { withCredentials: true })
      .pipe(timeout(12000))
      .subscribe({
        next: feed => {
          // Accept Yahoo links or explicitly attributed Google News article links only.
          this.feed.set({ ...feed, articles: feed.articles.filter(article => this.isYahooLink(article.url, article.via)) });
          this.feedLoading.set(false);
        },
        error: () => { this.feedError.set(true); this.feedLoading.set(false); },
      });
  }

  private isYahooLink(value: string, via?: string): boolean {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && (!url.port || url.port === '443') && !url.username && !url.password &&
        (url.hostname === 'finance.yahoo.com' || (via === 'Google News' && url.hostname === 'news.google.com' && /^\/(rss\/)?articles\//.test(url.pathname)));
    } catch { return false; }
  }
}
