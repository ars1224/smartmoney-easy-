import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { LearnPage } from './learn.page';
import { environment } from '../../../environments/environment';

describe('LearnPage', () => {
  let http: HttpTestingController;
  const endpoint = `${environment.apiUrl}/learn/articles`;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [LearnPage], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('keeps guides usable when the feed fails and filters by topic and search', () => {
    const fixture = TestBed.createComponent(LearnPage);
    http.expectOne(endpoint).flush('Unavailable', { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    const page = fixture.componentInstance;
    expect(page.guides().length).toBe(4);
    expect(fixture.nativeElement.textContent).toContain('Yahoo Finance articles are currently unavailable');
    page.topic.set('Saving');
    expect(page.guides().map(g => g.id)).toEqual(['saving']);
    page.search.set('does not exist');
    expect(page.guides()).toEqual([]);
    page.resetFilters();
    expect(page.guides().length).toBe(4);
  });

  it('shows four lessons and keeps a balanced fallback when a photo fails', () => {
    const fixture = TestBed.createComponent(LearnPage);
    http.expectOne(endpoint).flush({ articles: [], status: 'unavailable', fetchedAt: null });
    const page = fixture.componentInstance;
    expect(page.listedGuides().length).toBe(4);
    page.hideImage('budget');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img[src="assets/learn/budget-notebook.jpg"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.guide-placeholder')).not.toBeNull();
    page.topic.set('Budgeting');
    expect(page.listedGuides().map(g => g.id)).toEqual(['budget']);
  });

  it('reveals three articles at a time and resets the limit when searching', () => {
    const fixture = TestBed.createComponent(LearnPage);
    http.expectOne(endpoint).flush({ status: 'available', fetchedAt: null, articles: Array.from({ length: 7 }, (_, i) => ({ title: `Saving guide ${i}`, url: `https://finance.yahoo.com/news/${i}`, publishedAt: null })) });
    const page = fixture.componentInstance;
    expect(page.visibleArticles().length).toBe(3);
    page.showMoreArticles();
    expect(page.visibleArticles().length).toBe(6);
    page.setSearch('Saving');
    expect(page.visibleArticles().length).toBe(3);
  });

  it('sends credentials and renders publisher headlines as text with safe links', () => {
    const fixture = TestBed.createComponent(LearnPage);
    const request = http.expectOne(endpoint);
    expect(request.request.withCredentials).toBe(true);
    request.flush({ status: 'available', fetchedAt: null, articles: [
      { title: '<img src=x onerror=alert(1)> A headline', url: 'https://finance.yahoo.com/news/test.html', publishedAt: null },
      { title: 'Unsafe', url: 'javascript:alert(1)', publishedAt: null },
    ] });
    fixture.detectChanges();
    expect(fixture.componentInstance.articles().length).toBe(1);
    expect(fixture.nativeElement.querySelector('.news-card img')).toBeNull();
    const link = fixture.nativeElement.querySelector('.news-card a') as HTMLAnchorElement;
    expect(link.href).toBe('https://finance.yahoo.com/news/test.html');
    expect(link.rel).toBe('noopener noreferrer');
  });

  it('accepts explicitly attributed Google News article links and rejects other Google URLs', () => {
    const fixture = TestBed.createComponent(LearnPage);
    http.expectOne(endpoint).flush({ status: 'available', fetchedAt: null, articles: [
      { title: 'Budget guide - Yahoo Finance', url: 'https://news.google.com/rss/articles/example', publishedAt: '2026-10-08T07:00:00Z', via: 'Google News', topic: 'Budgeting' },
      { title: 'Wrong path', url: 'https://news.google.com/search?q=budget', publishedAt: null, via: 'Google News' },
      { title: 'Missing attribution', url: 'https://news.google.com/rss/articles/another', publishedAt: null },
    ] });
    fixture.detectChanges();
    expect(fixture.componentInstance.articles().length).toBe(1);
    expect(fixture.nativeElement.querySelector('.news-card').textContent).toContain('via Google News');
    expect(fixture.nativeElement.querySelector('.news-card').textContent).toContain('Feed date');
    expect(fixture.nativeElement.querySelector('.news-card a').textContent).toContain('Read via Google News');
  });

  it('retries the feed without overlapping requests', () => {
    const fixture = TestBed.createComponent(LearnPage);
    fixture.componentInstance.loadArticles();
    http.expectOne(endpoint).flush({ articles: [], status: 'unavailable', fetchedAt: null });
    fixture.componentInstance.loadArticles();
    http.expectOne(endpoint).flush({ articles: [], status: 'available', fetchedAt: null });
    expect(fixture.componentInstance.feedError()).toBe(false);
    expect(fixture.componentInstance.feedLoading()).toBe(false);
  });
});
