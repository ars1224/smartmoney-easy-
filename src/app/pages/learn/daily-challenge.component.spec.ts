import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CHALLENGE_BANK } from './challenge-bank';
import { DailyChallengeComponent } from './daily-challenge.component';
import { DAILY_KEY } from './daily-challenges';

/**
 * Provide deterministic browser storage in the test runner.
 * Some Node.js versions expose an unavailable global localStorage, and this
 * suite must also be able to simulate storage failures deliberately.
 */
class MemoryStorage implements Storage {
  private readonly entries = new Map<string, string>();

  get length(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, String(value));
  }
}

const testStorage = new MemoryStorage();

describe('DailyChallengeComponent', () => {
  beforeEach(() => {
    testStorage.clear();
    vi.stubGlobal('localStorage', testStorage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('teaches warning signs without claiming the other message is guaranteed safe', () => {
    TestBed.configureTestingModule({
      imports: [DailyChallengeComponent],
    });

    const fixture = TestBed.createComponent(DailyChallengeComponent);

    fixture.componentInstance.activeQuestions.set(
      CHALLENGE_BANK.slice(0, 5),
    );

    fixture.detectChanges();

    const choices = fixture.nativeElement.querySelectorAll(
      '.choice',
    ) as NodeListOf<HTMLButtonElement>;

    choices[1].click();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[role="status"]').textContent,
    ).toContain('Here’s how to think about it.');

    expect(
      fixture.nativeElement.querySelector('[role="status"]').textContent,
    ).toContain('does not prove');

    expect(
      fixture.nativeElement.querySelector('a[href*="secure-bank"]'),
    ).toBeNull();

    choices[0].click();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[role="status"]').textContent,
    ).toContain('You spotted the warning signs');

    expect(
      choices[0].getAttribute('aria-pressed'),
    ).toBe('true');

    fixture.componentInstance.reset();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[role="status"]'),
    ).toBeNull();

    expect(document.activeElement).toBe(choices[0]);
  });

  it('keeps answers per question, resets only the current question and respects carousel bounds', () => {
    TestBed.configureTestingModule({
      imports: [DailyChallengeComponent],
    });

    const fixture = TestBed.createComponent(DailyChallengeComponent);

    fixture.componentInstance.activeQuestions.set(
      CHALLENGE_BANK.slice(0, 5),
    );

    const page = fixture.componentInstance;

    fixture.detectChanges();

    page.move(-1);
    expect(page.index()).toBe(0);

    page.choose(0);
    page.move(1);
    expect(page.answer()).toBeNull();

    page.choose(1);
    page.move(-1);
    expect(page.answer()).toBe(0);

    page.reset();
    expect(page.answer()).toBeNull();

    page.move(1);
    expect(page.answer()).toBe(1);

    page.move(1);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelectorAll('.choice').length,
    ).toBe(3);

    page.choose(1);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[role="status"]').textContent,
    ).toContain('$96');

    page.move(1);
    page.move(1);
    page.move(1);

    expect(page.index()).toBe(4);

    fixture.detectChanges();

    expect(
      fixture.nativeElement.textContent,
    ).toContain('Finish session');
  });

  it('finishes honestly when questions are skipped, reviews retained answers and restarts cleanly', () => {
    TestBed.configureTestingModule({
      imports: [DailyChallengeComponent],
    });

    const fixture = TestBed.createComponent(DailyChallengeComponent);

    fixture.componentInstance.activeQuestions.set(
      CHALLENGE_BANK.slice(0, 5),
    );

    const page = fixture.componentInstance;

    page.choose(0);
    page.index.set(4);

    fixture.detectChanges();

    fixture.nativeElement
      .querySelector('app-sm-button button')
      .click();

    fixture.detectChanges();

    expect(page.completed()).toBe(true);

    expect(
      fixture.nativeElement.textContent,
    ).toContain('You explored 1 of 5');

    expect(
      fixture.nativeElement.querySelector('.choices'),
    ).toBeNull();

    page.review();
    fixture.detectChanges();

    expect(page.index()).toBe(0);
    expect(page.answer()).toBe(0);

    page.restart();
    fixture.detectChanges();

    expect(page.answeredCount()).toBe(0);
    expect(page.answer()).toBeNull();
    expect(page.completed()).toBe(false);
  });

  it('moves focus to the new question and exposes the correct answer without colour alone', async () => {
    TestBed.configureTestingModule({
      imports: [DailyChallengeComponent],
    });

    const fixture = TestBed.createComponent(DailyChallengeComponent);

    fixture.componentInstance.activeQuestions.set(
      CHALLENGE_BANK.slice(0, 5),
    );

    fixture.detectChanges();

    fixture.nativeElement
      .querySelector('app-sm-button button')
      .click();

    fixture.detectChanges();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.activeElement).toBe(
      fixture.nativeElement.querySelector('h2'),
    );

    fixture.componentInstance.choose(1);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('.correct').textContent,
    ).toContain('Correct answer');

    expect(
      fixture.nativeElement.querySelector('.reconsider').textContent,
    ).toContain('Your choice');

    expect(
      fixture.nativeElement.querySelectorAll('.progress .visited').length,
    ).toBe(1);

    fixture.componentInstance.questions.forEach((question) => {
      fixture.componentInstance.answers.update((answers) => ({
        ...answers,
        [question.id]: question.correct,
      }));
    });

    fixture.componentInstance.finish();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.textContent,
    ).toContain('Today’s session complete.');
  });

  it('reveals warning signs and resets them without turning the fictional address into a link', () => {
    TestBed.configureTestingModule({
      imports: [DailyChallengeComponent],
    });

    const fixture = TestBed.createComponent(DailyChallengeComponent);

    fixture.componentInstance.activeQuestions.set(
      CHALLENGE_BANK.slice(0, 5),
    );

    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelectorAll('mark.warning').length,
    ).toBe(0);

    fixture.componentInstance.choose(1);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelectorAll('mark.warning').length,
    ).toBe(2);

    expect(
      fixture.nativeElement.querySelector('.takeaway').textContent,
    ).toContain('Open your bank app independently');

    fixture.componentInstance.reset();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelectorAll('mark.warning').length,
    ).toBe(0);
  });

  it('reveals and resets each example visual while retaining answers when navigating', () => {
    TestBed.configureTestingModule({
      imports: [DailyChallengeComponent],
    });

    const fixture = TestBed.createComponent(DailyChallengeComponent);

    fixture.componentInstance.activeQuestions.set(
      CHALLENGE_BANK.slice(0, 5),
    );

    const page = fixture.componentInstance;

    page.index.set(1);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('.ledger').textContent,
    ).toContain('$200');

    page.choose(0);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('.ledger').textContent,
    ).toContain('$160');

    expect(
      fixture.nativeElement.querySelector('.ledger').textContent,
    ).toContain('−$40');

    page.index.set(2);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelectorAll('.months > div').length,
    ).toBe(12);

    page.choose(1);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('.price').textContent,
    ).toContain('$96/year');

    page.index.set(3);
    page.choose(1);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelectorAll('.steps > div').length,
    ).toBe(6);

    expect(
      fixture.nativeElement.querySelector('.caption').textContent,
    ).toContain('six contributions');

    page.reset();
    fixture.detectChanges();

    expect(
      fixture.nativeElement
        .querySelector('.story')
        .classList.contains('revealed'),
    ).toBe(false);

    page.index.set(4);
    page.choose(1);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('.checklist').textContent,
    ).toContain('payment arrangements');

    page.index.set(2);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('.price').textContent,
    ).toContain('$96/year');
  });

  it('restores the actual daily set and keeps its progress separate from practice', () => {
    TestBed.configureTestingModule({
      imports: [DailyChallengeComponent],
    });

    const first = TestBed.createComponent(DailyChallengeComponent);

    const dailyIds = first.componentInstance.questions.map(
      (question) => question.id,
    );

    first.componentInstance.choose(0);
    first.componentInstance.move(1);

    const restored = TestBed.createComponent(DailyChallengeComponent);

    expect(
      restored.componentInstance.questions.map(
        (question) => question.id,
      ),
    ).toEqual(dailyIds);

    expect(restored.componentInstance.index()).toBe(1);
    expect(restored.componentInstance.answeredCount()).toBe(1);

    const saved = testStorage.getItem(DAILY_KEY);

    restored.componentInstance.practise();

    expect(
      restored.componentInstance.questions.some(
        (question) => dailyIds.includes(question.id),
      ),
    ).toBe(false);

    restored.componentInstance.choose(0);

    expect(
      testStorage.getItem(DAILY_KEY),
    ).toBe(saved);

    restored.componentInstance.returnToDaily();

    expect(restored.componentInstance.answeredCount()).toBe(1);
    expect(restored.componentInstance.index()).toBe(1);
  });

  it('starts the new local day without applying an old question click to the new set', () => {
    TestBed.configureTestingModule({
      imports: [DailyChallengeComponent],
    });

    const fixture = TestBed.createComponent(DailyChallengeComponent);

    const page = fixture.componentInstance;

    page.day.set('2000-01-01');
    page.answers.set({ old: 0 });
    page.choose(0);

    expect(page.day()).not.toBe('2000-01-01');
    expect(page.answeredCount()).toBe(0);
    expect(page.mode()).toBe('daily');
  });

  it('remains usable and explains when browser storage is unavailable', () => {
    TestBed.configureTestingModule({
      imports: [DailyChallengeComponent],
    });

    vi.spyOn(testStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    vi.spyOn(testStorage, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    const fixture = TestBed.createComponent(DailyChallengeComponent);

    fixture.componentInstance.choose(0);
    fixture.detectChanges();

    expect(fixture.componentInstance.answer()).toBe(0);

    expect(
      fixture.nativeElement.textContent,
    ).toContain('Progress cannot be saved');
  });

  it('gives every bank question a visual, answer-driven reveal, practical takeaway and working retry', () => {
    TestBed.configureTestingModule({
      imports: [DailyChallengeComponent],
    });

    const fixture = TestBed.createComponent(DailyChallengeComponent);

    const page = fixture.componentInstance;

    for (const question of CHALLENGE_BANK) {
      page.activeQuestions.set([question]);
      page.index.set(0);
      page.answers.set({});

      fixture.detectChanges();

      const visual = fixture.nativeElement.querySelector(
        '.scene, .story, .phone-frame',
      );

      expect(visual, question.id).not.toBeNull();

      expect(
        fixture.nativeElement.querySelector('.feedback'),
        question.id,
      ).toBeNull();

      const before = visual.textContent;

      page.choose(question.correct);
      fixture.detectChanges();

      expect(
        fixture.nativeElement.querySelector('.takeaway').textContent.length,
        question.id,
      ).toBeGreaterThan(35);

      expect(
        fixture.nativeElement.querySelector('.correct'),
        question.id,
      ).not.toBeNull();

      if (question.id !== 'scam') {
        expect(visual.textContent, question.id).not.toBe(before);
      } else {
        expect(
          fixture.nativeElement.querySelectorAll('mark.warning').length,
        ).toBe(2);
      }

      page.reset();
      fixture.detectChanges();

      expect(
        fixture.nativeElement.querySelector('.feedback'),
        question.id,
      ).toBeNull();

      expect(
        visual.textContent,
        question.id,
      ).toBe(before);
    }
  });
});