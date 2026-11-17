import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppHelpPage, resolveAppHelpLinks } from '../app-help';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { ThinkerReply, ThinkerService, ThinkerStatus } from './thinker.service';
interface Message {
  id: number;
  role: 'you' | 'thinker';
  text: string;
  title?: string;
  takeaway?: string;
  mode?: 'demo' | 'live' | 'records';
  links?: AppHelpPage[];
}
@Component({
  selector: 'app-thinker',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './thinker.component.html',
  styleUrl: './thinker.component.scss',
})
export class ThinkerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('panel', { static: true }) panel!: ElementRef<HTMLDialogElement>;
  @ViewChild('conversation') conversation?: ElementRef<HTMLElement>;
  readonly closed = output<void>();
  private readonly api = inject(ThinkerService);
  private request?: Subscription;
  private statusRequest?: Subscription;
  readonly status = signal<ThinkerStatus | null>(null);
  readonly statusError = signal(false);
  private readonly opener = document.activeElement as HTMLElement | null;
  private nextId = 0;
  readonly messages = signal<Message[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly announcement = signal('');
  readonly draft = signal('');
  readonly failedMessage = signal('');
  readonly starters = ['Using SmartMoney', 'My latest transaction', 'My balances', 'My finances'];
  ngAfterViewInit(): void {
    this.panel.nativeElement.showModal();
    this.loadStatus();
  }
  loadStatus(): void {
    this.statusError.set(false);
    this.statusRequest?.unsubscribe();
    this.statusRequest = this.api
      .status()
      .subscribe({
        next: (status) => this.status.set(status),
        error: () => this.statusError.set(true),
      });
  }
  ngOnDestroy(): void {
    this.request?.unsubscribe();
    this.statusRequest?.unsubscribe();
    this.opener?.focus();
  }
  close(): void {
    this.panel.nativeElement.close();
  }
  onClosed(): void {
    this.closed.emit();
  }
  send(text = this.draft(), retry = false): void {
    text = text.trim();
    if (!this.status()?.available || this.busy() || !text || text.length > 600) return;
    if (!retry) this.messages.update((rows) => [...rows, { id: this.nextId++, role: 'you', text }]);
    this.draft.set('');
    this.error.set('');
    this.failedMessage.set(text);
    this.busy.set(true);
    this.announcement.set('Preparing a reply.');
    this.request = this.api.send(text).subscribe({
      next: (reply: ThinkerReply) => {
        this.messages.update((rows) => [
          ...rows,
          {
            id: this.nextId++,
            role: 'thinker',
            text: reply.message,
            title: reply.title,
            takeaway: reply.takeaway,
            mode: reply.mode,
            links: resolveAppHelpLinks(reply.links),
          },
        ]);
        this.busy.set(false);
        this.failedMessage.set('');
        this.announcement.set(
          `Thinker ${reply.mode === 'records' ? 'saved data' : reply.mode === 'demo' ? 'demo' : 'AI'}: ${reply.message}${reply.takeaway ? ' Next step: ' + reply.takeaway : ''}`,
        );
        this.scrollToLatest();
      },
      error: (error: HttpErrorResponse) => {
        this.busy.set(false);
        const messages: Record<number, string> = {
          401: 'Your session has ended. Close Thinker and sign in again.',
          403: 'Could not verify your session. Close Thinker and refresh the page before trying again.',
          429: 'Thinker has reached a usage limit. Please wait and try again later.',
          503: 'Thinker is unavailable. Please try again later or contact the project team.',
          504: 'Thinker took too long to respond. Please try again later.',
        };
        this.error.set(
          messages[error.status] || 'Could not load a reply. Check your connection and try again.',
        );
        this.announcement.set('');
        this.scrollToLatest();
      },
    });
    this.scrollToLatest();
  }
  retry(): void {
    this.send(this.failedMessage(), true);
  }
  clear(): void {
    if (this.busy()) return;
    this.messages.set([]);
    this.draft.set('');
    this.error.set('');
    this.failedMessage.set('');
    this.announcement.set('Conversation cleared.');
  }
  private scrollToLatest(): void {
    setTimeout(() => {
      const el = this.conversation?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}
