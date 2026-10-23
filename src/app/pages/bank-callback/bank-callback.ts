import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import {
  BankConnectionService,
  BankConfirmationResponse,
  PendingBankConnection,
} from '../../core/bank/bank-connection.service';

@Component({
  selector: 'app-bank-callback',
  standalone: true,
  imports: [RouterLink],
  template: `
    <main class="callback-page">
      <section class="callback-card">
        <h1>Connect Mock Bank</h1>

        @if (loading()) {
          <p>Checking your bank authorisation...</p>
        } @else {
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }

          @if (message()) {
            <p class="notice" role="status">{{ message() }}</p>
          }

          @if (connected(); as result) {
            <h2>Bank connected successfully</h2>
            <p>
              {{ result.accounts_connected }}
              bank account(s) connected.
            </p>

            @if (result.sync_status === 'RETRY_REQUIRED') {
              <p class="notice">
                Your connection was saved, but synchronisation
                needs to be retried.
              </p>
            } @else if (result.sync_status === 'PARTIAL_SUCCESS') {
              <p class="notice">
                Some accounts synchronised successfully.
                Other accounts will need another sync attempt.
              </p>
            } @else {
              <p>Your initial bank synchronisation completed.</p>
            }

            <a class="button-link" routerLink="/app/profile">
              View Profile & Assets
            </a>
          } @else {
            @for (connection of connections(); track connection.connection_id) {
              <div class="connection">
                @if (connection.status === 'EXPIRED') {
                  <h2>Bank authorisation expired</h2>
                  <p>
                    This connection can no longer be confirmed.
                    Cancel it before reconnecting.
                  </p>
                } @else {
                  <h2>Select bank accounts</h2>
                  <p>
                    Choose the accounts you want to connect to SmartMoney.
                  </p>

                  @for (account of connection.accounts; track account.id) {
                    <label class="account">
                      <input
                        type="checkbox"
                        [checked]="isSelected(connection.connection_id, account.id)"
                        [disabled]="busy()"
                        (change)="toggleAccount(connection.connection_id, account.id)"
                      />

                      <span class="account-details">
                        <strong>{{ account.account_name }}</strong>
                        <small>
                          {{ account.account_type }}
                          ending in {{ account.account_number_last4 }}
                        </small>
                        <small>{{ account.currency }}</small>
                      </span>
                    </label>
                  }

                  <button
                    type="button"
                    class="primary"
                    [disabled]="busy() || selectedCount(connection.connection_id) === 0"
                    (click)="confirmConnection(connection.connection_id)"
                  >
                    {{ busy() ? 'Processing...' : 'Confirm selected accounts' }}
                  </button>
                }

                <button
                  type="button"
                  class="secondary"
                  [disabled]="busy()"
                  (click)="cancelConnection(connection.connection_id)"
                >
                  Cancel connection
                </button>
              </div>
            } @empty {
              <p>No unfinished bank connections were found.</p>
            }

            <button
              type="button"
              class="secondary"
              [disabled]="busy()"
              (click)="recoverPending()"
            >
              Refresh pending connections
            </button>

            @if (connections().length === 0) {
              <button
                type="button"
                class="primary"
                [disabled]="busy()"
                (click)="startConnection()"
              >
                Connect Mock Bank
              </button>
            }

            <a class="back-link" routerLink="/app/profile">
              Back to Profile & Assets
            </a>
          }
        }
      </section>
    </main>
  `,
  styles: [`
    .callback-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: #f5f7fb;
      color: #243247;
      box-sizing: border-box;
    }

    .callback-card {
      width: 100%;
      max-width: 520px;
      padding: 28px;
      border-radius: 16px;
      background: #fff;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.06);
    }

    h1 {
      font-size: 24px;
    }

    h2 {
      font-size: 19px;
      margin-top: 20px;
    }

    p {
      line-height: 1.5;
    }

    .connection {
      margin: 20px 0;
    }

    .account {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px;
      margin: 12px 0;
      border: 1px solid #dde3ed;
      border-radius: 10px;
      cursor: pointer;
    }

    .account input {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }

    .account-details {
      display: flex;
      flex-direction: column;
      gap: 5px;
      min-width: 0;
    }

    .account-details small {
      color: #637083;
    }

    button,
    .button-link {
      display: block;
      width: 100%;
      padding: 13px;
      margin-top: 12px;
      border-radius: 9px;
      border: none;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      box-sizing: border-box;
      text-align: center;
      text-decoration: none;
    }

    .primary,
    .button-link {
      background: #2563eb;
      color: white;
    }

    .secondary {
      background: #edf2f9;
      color: #243247;
    }

    button:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .error {
      padding: 12px;
      border-radius: 8px;
      background: #fff0ee;
      color: #b42318;
    }

    .notice {
      padding: 12px;
      border-radius: 8px;
      background: #eff6ff;
      color: #1e40af;
    }

    .back-link {
      display: block;
      margin-top: 20px;
      color: #2563eb;
      text-align: center;
    }
  `],
})
export class BankCallbackPage implements OnInit {
  private readonly bank = inject(BankConnectionService);
  private readonly route = inject(ActivatedRoute);

  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly connections = signal<PendingBankConnection[]>([]);
  readonly selected = signal<Record<string, string[]>>({});
  readonly connected = signal<BankConfirmationResponse | null>(null);

  async ngOnInit(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    const code = params.get('code');
    const state = params.get('state');
    const bankError = params.get('error');

    // Remove OAuth parameters from browser history.
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname
    );

    try {
      if (bankError) {
        this.error.set('Bank authorisation was cancelled or rejected.');
        return;
      }

      if (code && state) {
        const result = await firstValueFrom(
          this.bank.completeAuthorization(code, state)
        );

        if (
          result.status !== 'PENDING' ||
          !result.connection_id ||
          !Array.isArray(result.accounts)
        ) {
          throw new Error('Invalid bank callback response.');
        }

        this.connections.set([result]);
      } else {
        await this.loadPending();
      }
    } catch (err) {
      this.error.set(this.errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  isSelected(connectionId: string, accountId: string): boolean {
    return (this.selected()[connectionId] ?? []).includes(accountId);
  }

  selectedCount(connectionId: string): number {
    return (this.selected()[connectionId] ?? []).length;
  }

  toggleAccount(connectionId: string, accountId: string): void {
    this.selected.update(current => {
      const ids = current[connectionId] ?? [];

      return {
        ...current,
        [connectionId]: ids.includes(accountId)
          ? ids.filter(id => id !== accountId)
          : [...ids, accountId],
      };
    });
  }

  async confirmConnection(connectionId: string): Promise<void> {
    const accountIds = this.selected()[connectionId] ?? [];

    if (this.busy() || accountIds.length === 0) return;

    this.busy.set(true);
    this.error.set('');

    try {
      const result = await firstValueFrom(
        this.bank.confirmConnection(connectionId, accountIds)
      );

      this.connected.set(result);
      this.connections.set([]);
    } catch (err) {
      this.error.set(this.errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  async cancelConnection(connectionId: string): Promise<void> {
    if (this.busy()) return;

    if (!window.confirm('Cancel this bank connection?')) {
      return;
    }

    this.busy.set(true);
    this.error.set('');

    try {
      const result = await firstValueFrom(
        this.bank.cancelConnection(connectionId)
      );

      if (result.status !== 'DISCONNECTED') {
        throw new Error('Bank disconnection is still in progress.');
      }

      this.connections.update(connections =>
        connections.filter(
          connection => connection.connection_id !== connectionId
        )
      );

      this.message.set('Bank connection cancelled.');
    } catch (err) {
      this.error.set(this.errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  async recoverPending(): Promise<void> {
    if (this.busy()) return;

    this.busy.set(true);
    this.error.set('');

    try {
      await this.loadPending();
      this.message.set('Pending connections refreshed.');
    } catch (err) {
      this.error.set(this.errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  async startConnection(): Promise<void> {
    if (this.busy()) return;

    this.busy.set(true);
    this.error.set('');

    try {
      const result = await firstValueFrom(
        this.bank.startConnection()
      );

      if (!result.authorization_url) {
        throw new Error('Mock Bank authorisation URL is missing.');
      }

      window.location.assign(result.authorization_url);
    } catch (err) {
      this.error.set(this.errorMessage(err));
      this.busy.set(false);
    }
  }

  private async loadPending(): Promise<void> {
    const result = await firstValueFrom(
      this.bank.getPendingConnections()
    );

    if (!Array.isArray(result.connections)) {
      throw new Error('Invalid pending connection response.');
    }

    this.connections.set(result.connections);
  }

  private errorMessage(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const backendError = err.error?.error;

      if (typeof backendError === 'string') {
        return backendError;
      }

      if (err.status === 401) {
        return 'Please log in to SmartMoney before connecting a bank.';
      }

      return 'The bank request failed. Please try again.';
    }

    return err instanceof Error
      ? err.message
      : 'An unexpected bank connection error occurred.';
  }
}