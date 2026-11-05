import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GuideReaderComponent } from './guide-reader.component';
import { LEARNING_GUIDES } from './learn.page';

// The unit-test DOM lacks native dialog APIs; real modal focus/Escape is checked in the browser.
function supportDialog(dialog: HTMLDialogElement): void {
 dialog.showModal = () => dialog.setAttribute('open', '');
 dialog.close = () => { dialog.removeAttribute('open'); dialog.dispatchEvent(new Event('close')); };
}
describe('GuideReaderComponent', () => {
 it('opens the selected guide with three sections, credit and a real next-step link', () => {
  TestBed.configureTestingModule({ imports: [GuideReaderComponent], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(GuideReaderComponent);
  supportDialog(fixture.nativeElement.querySelector('dialog'));
  fixture.componentRef.setInput('guide', LEARNING_GUIDES[0]);
  fixture.componentRef.setInput('photo', { src: 'assets/learn/budget-notebook.jpg', alt: 'Budget notebook' });
  fixture.detectChanges();
  const dialog = fixture.nativeElement.querySelector('dialog');
  expect(dialog.open).toBe(true);
  expect(dialog.getAttribute('aria-labelledby')).toBe('reader-title');
  expect(dialog.querySelectorAll('.reader-sections li').length).toBe(3);
  expect(dialog.querySelector('figcaption').textContent).toContain('PNW Production');
  expect(dialog.querySelector('.reader-footer a').getAttribute('href')).toBe('/app/budgets');
  expect(dialog.querySelector('.reader-takeaway').textContent).toContain('next payday');
  let closed = false; fixture.componentInstance.closed.subscribe(() => closed = true);
  fixture.componentInstance.close();
  expect(closed).toBe(true);
  expect(dialog.open).toBe(false);
 });
 it('keeps the guide readable without a photo and emits an image failure for fallback', () => {
  TestBed.configureTestingModule({ imports: [GuideReaderComponent], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(GuideReaderComponent);
  supportDialog(fixture.nativeElement.querySelector('dialog'));
  fixture.componentRef.setInput('guide', LEARNING_GUIDES[1]); fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('img')).toBeNull();
  expect(fixture.nativeElement.querySelector('h2').textContent).toContain('What are you saving for?');
  const ids: string[] = []; fixture.componentInstance.imageFailed.subscribe(id => ids.push(id));
  fixture.componentRef.setInput('photo', { src: 'missing.jpg', alt: 'Savings jar' }); fixture.detectChanges();
  fixture.nativeElement.querySelector('img').dispatchEvent(new Event('error'));
  expect(ids).toEqual(['saving']);
 });
});
