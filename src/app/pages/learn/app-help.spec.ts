import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { routes } from '../../app.routes';
import { GettingStartedComponent } from './getting-started.component';
import { CommonQuestionsComponent } from './common-questions.component';

@Component({ standalone: true, template: '<p>Destination</p>' })
class DestinationComponent {}

const destinations = ['profile', 'activity', 'budgets', 'goals', 'dashboard', 'reports'];

beforeEach(() => {
  TestBed.configureTestingModule({
    imports: [GettingStartedComponent, CommonQuestionsComponent],
    providers: [provideRouter(destinations.map(path => ({ path: `app/${path}`, component: DestinationComponent })))],
  });
});

describe('Getting started app guide', () => {
  it('is optional, opens five ordered steps and can be closed without leaving Learn', () => {
    const fixture = TestBed.createComponent(GettingStartedComponent);
    fixture.detectChanges();
    const disclosure = fixture.nativeElement.querySelector('details') as HTMLDetailsElement;
    const summary = disclosure.querySelector('summary')!;
    expect(disclosure.open).toBe(false);
    summary.click();
    expect(disclosure.open).toBe(true);
    expect(disclosure.querySelectorAll('ol > li').length).toBe(5);
    expect(disclosure.textContent).toContain('Confirm selected accounts');
    expect(disclosure.textContent).toContain('it does not move money');
    expect(disclosure.textContent).toContain('not an available balance');
    summary.click();
    expect(disclosure.open).toBe(false);
  });

  it('links to actual app routes and opens Budgets without creating records', async () => {
    const fixture = TestBed.createComponent(GettingStartedComponent);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('summary').click();
    const links = [...fixture.nativeElement.querySelectorAll('a')] as HTMLAnchorElement[];
    const childPaths = routes.find(route => route.path === 'app')!.children!.map(route => `/app/${route.path}`);
    expect(links.map(link => link.getAttribute('href'))).toEqual(destinations.map(path => `/app/${path}`));
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
    expect(items.length).toBe(6);
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

  it('opens Thinker through the shared shell event without submitting a question', () => {
    const fixture = TestBed.createComponent(CommonQuestionsComponent);
    fixture.detectChanges();
    const last = fixture.nativeElement.querySelectorAll('details')[5] as HTMLDetailsElement;
    last.querySelector('summary')!.click();
    expect(last.textContent).toContain('your question is sent to OpenAI');
    expect(last.textContent).toContain('cannot see your financial records');
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    last.querySelector('button')!.click();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0].type).toBe('smartmoney:open-thinker');
    dispatch.mockRestore();
  });
});
