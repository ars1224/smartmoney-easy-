import { TestBed } from '@angular/core/testing';

import { Subject, of, throwError } from 'rxjs';

import { HttpErrorResponse } from '@angular/common/http';

import { ThinkerComponent } from './thinker.component';

import { ThinkerReply, ThinkerService } from './thinker.service';

const reply: ThinkerReply = { mode: 'demo', title: 'Build a budget', message: 'List your essentials.', takeaway: 'Check one bill.' };

describe('Thinker demo interaction', () => {

 function setup(send = vi.fn().mockReturnValue(of(reply)), status = vi.fn().mockReturnValue(of({mode: 'demo', available: true}))) {

  TestBed.configureTestingModule({ imports: [ThinkerComponent], providers: [{ provide: ThinkerService, useValue: { send, status } }] });

  const fixture = TestBed.createComponent(ThinkerComponent);

  const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;

  dialog.showModal = () => dialog.setAttribute('open','');

  dialog.close = () => { dialog.removeAttribute('open'); dialog.dispatchEvent(new Event('close')); };

  fixture.detectChanges(); return { fixture, component: fixture.componentInstance, dialog, send };

 }

 it('labels the demo, sends a starter, and renders text safely', () => {

  const { fixture, component, send } = setup();

  expect(fixture.nativeElement.textContent).toContain('Live AI is not connected');

  component.send('Help me build a budget'); fixture.detectChanges();

  expect(send).toHaveBeenCalledWith('Help me build a budget');

  expect(component.messages()).toHaveLength(2);

  expect(fixture.nativeElement.textContent).toContain('Thinker · Demo reply');

  component.send('<img src=x onerror=alert(1)>'); fixture.detectChanges();

  expect(fixture.nativeElement.querySelector('img')).toBeNull();

 });

 it('blocks empty, oversized and duplicate in-flight sends', () => {

  const pending = new Subject<ThinkerReply>(); const send = vi.fn().mockReturnValue(pending);

  const { component } = setup(send);

  component.send(' '); component.send('x'.repeat(601)); expect(send).not.toHaveBeenCalled();

  component.send('saving'); component.send('saving'); expect(send).toHaveBeenCalledTimes(1);

  pending.next(reply); expect(component.busy()).toBe(false);

 });

 it('retries a failed request without repeating the user bubble and clears the conversation', () => {

  const send = vi.fn().mockReturnValueOnce(throwError(() => new HttpErrorResponse({status:503}))).mockReturnValue(of(reply));

  const { component } = setup(send); component.send('budget');

  expect(component.error()).toContain('try again'); component.retry();

  expect(component.messages().filter(row => row.role === 'you')).toHaveLength(1);

  expect(component.error()).toBe(''); expect(component.messages()).toHaveLength(2);

  component.clear(); expect(component.messages()).toHaveLength(0);

 });

 it('cancels pending work on destroy and emits close', () => {

  const pending = new Subject<ThinkerReply>(); const { component, fixture } = setup(vi.fn().mockReturnValue(pending));

  let closed = false; component.closed.subscribe(() => closed = true);

  component.close(); expect(closed).toBe(true);

  component.send('budget'); fixture.destroy(); pending.next(reply);

  expect(component.messages()).toHaveLength(1);

 });

 it('labels live AI and discloses questions sent to OpenAI', () => {
  const live = {...reply, mode: 'live' as const};
  const { fixture, component } = setup(vi.fn().mockReturnValue(of(live)), vi.fn().mockReturnValue(of({mode:'live',available:true})));
  component.send('budget');fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('Powered by OpenAI');
  expect(fixture.nativeElement.textContent).toContain('Thinker · AI reply');
  expect(fixture.nativeElement.textContent).toContain('Questions are sent to OpenAI');
  expect(fixture.nativeElement.textContent).not.toContain('Prepared replies');
 });
 it('blocks messages while configuration is unavailable and reconnects', () => {
  const status = vi.fn().mockReturnValueOnce(throwError(() => new HttpErrorResponse({status:503}))).mockReturnValue(of({mode:'live',available:true}));
  const { component, send }=setup(vi.fn().mockReturnValue(of(reply)),status);
  component.send('budget');expect(send).not.toHaveBeenCalled();expect(component.statusError()).toBe(true);
  component.loadStatus();component.send('budget');expect(send).toHaveBeenCalledTimes(1);
 });
 it('explains limits without exposing provider details', () => {
  const { component }=setup(vi.fn().mockReturnValue(throwError(() => new HttpErrorResponse({status:429,error:{error:'private provider detail'}}))));
  component.send('budget');expect(component.error()).toContain('usage limit');expect(component.error()).not.toContain('private');
 });

});
