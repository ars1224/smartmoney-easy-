import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { routes } from '../../app.routes';
import { GettingStartedComponent } from './getting-started.component';
import { CommonQuestionsComponent } from './common-questions.component';

@Component({ standalone: true, template: '<p>Destination</p>' })
class DestinationComponent {}

const destinations = ['/onboarding', '/app/profile', '/app/activity', '/app/budgets', '/app/goals', '/app/dashboard', '/app/reports'];

beforeEach(() => {
  TestBed.configureTestingModule({
    imports: [GettingStartedComponent, CommonQuestionsComponent],
    providers: [provideRouter(destinations.map(path => ({ path: path.slice(1), component: DestinationComponent })))],
  });
});

describe('Getting started app guide', () => {
  it('is optional, opens six ordered steps and can be closed without leaving Learn', () => {
    const fixture = TestBed.createComponent(GettingStartedComponent);
    fixture.detectChanges();
    const disclosure = fixture.nativeElement.querySelector('details') as HTMLDetailsElement;
    const summary = disclosure.querySelector('summary')!;
    expect(disclosure.open).toBe(false);
    summary.click();
    expect(disclosure.open).toBe(true);
    expect(disclosure.querySelectorAll('ol > li').length).toBe(6);
    expect(disclosure.textContent).toContain('Skip employment and payroll');
    expect(disclosure.textContent).toContain('Save monthly allocation');
    expect(disclosure.textContent).toContain('automatically finishes connecting');
    expect(disclosure.textContent).toContain('Manage Funds');
    expect(disclosure.textContent).not.toContain('Confirm selected accounts');
    expect(disclosure.textContent).not.toContain('Add Contribution');
    expect(disclosure.textContent).toContain('not an available balance');
    summary.click();
    expect(disclosure.open).toBe(false);
  });

  it('opens first-time setup through the real onboarding destination', async () => {
    const fixture = TestBed.createComponent(GettingStartedComponent);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('summary').click();
    const link = fixture.nativeElement.querySelector('a[href="/onboarding"]') as HTMLAnchorElement;
    link.click(); await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/onboarding');
  });

  it('links to actual app routes and opens Budgets without creating records', async () => {
    const fixture = TestBed.createComponent(GettingStartedComponent);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('summary').click();
    const links = [...fixture.nativeElement.querySelectorAll('a')] as HTMLAnchorElement[];
    const childPaths = ['/onboarding', ...routes.find(route => route.path === 'app')!.children!.map(route => `/app/${route.path}`)];
    expect(routes.some(route => route.path === 'onboarding')).toBe(true);
    expect(links.map(link => link.getAttribute('href'))).toEqual(destinations);
    for (const link of links) expect(childPaths).toContain(link.getAttribute('href'));
    links.find(link => link.textContent?.includes('Open Budgets'))!.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/app/budgets');
  });
});

describe('Common questions', () => {
  it('lets users open answers independently and keeps them revisitable', () => {
    const fixture = TestBed.createComponent(CommonQuestionsComponent);
    fixture.detectChanges();
    const items = [...fixture.nativeElement.querySelectorAll('details')] as HTMLDetailsElement[];
    expect(items.length).toBe(8);
    expect(items.every(item => !item.open)).toBe(true);
    items[0].querySelector('summary')!.click();
    items[1].querySelector('summary')!.click();
    expect(items[0].open && items[1].open).toBe(true);
    expect(items[0].textContent).toContain('loading problem, not an empty account');
    expect(items[1].textContent).toContain('does not start a bank sync');
    items[0].querySelector('summary')!.click();
    expect(items[0].open).toBe(false);
    expect(items[1].open).toBe(true);
  });

  it('explains optional payroll, mandatory allocation and current Goals controls', () => {
    const fixture = TestBed.createComponent(CommonQuestionsComponent);
    fixture.detectChanges();
    const questions = fixture.nativeElement.querySelectorAll('details') as NodeListOf<HTMLDetailsElement>;
    const text = [...questions].map(question => question.textContent).join(' ');
    expect(text).toContain('Skip employment and payroll');
    expect(text).toContain('Finish Setup');
    expect(text).toContain('Allocate Funds');
    expect(text).toContain('Release Funds');
    expect(text).toContain('View Funding History');
    expect(text).toContain('Transfers and refunds cannot be linked');
    expect(text).toContain('uncategorised bank inflows');
    expect(text).not.toContain('Add Contribution');
    expect(text).not.toContain('Confirm selected accounts');
  });

  it('opens Thinker through the shared shell event without submitting a question', () => {
    const fixture = TestBed.createComponent(CommonQuestionsComponent);
    fixture.detectChanges();
    const last = fixture.nativeElement.querySelectorAll('details')[5] as HTMLDetailsElement;
    last.querySelector('summary')!.click();
    expect(last.textContent).toContain('your question is sent to OpenAI');
    expect(last.textContent).toContain('without sending records to OpenAI');
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    last.querySelector('button')!.click();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0].type).toBe('smartmoney:open-thinker');
    dispatch.mockRestore();
  });
});
