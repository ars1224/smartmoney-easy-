
import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';

interface BankAccountPreview {
  id: string;
  account_name: string;
  account_type: string;
  account_number_last4: string;
  currency: string;
  status: string;
}

interface BankCallbackResponse {
  connection_id: string;
  status: 'PENDING';
  accounts: BankAccountPreview[];
}

@Component({
  selector: 'app-bank-callback',
  standalone: true,
  template: `
    <main class="callback-page">
      <section class="callback-card">
        <h1>Connect Mock Bank</h1>

        @if (loading()) {
          <p>Verifying your bank authorisation...</p>
        } @else if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        } @else {
          <h2>Bank authorisation successful!</h2>
          <p>Your approved accounts are ready for selection.</p>

          @for (account of accounts(); track account.id) {
            <div class="account">
              <strong>{{ account.account_name }}</strong>
              <span>
                {{ account.account_type }}
                ···· {{ account.account_number_last4 }}
              </span>
              <span>{{ account.currency }}</span>
            </div>
          }

          <p class="note">
            Your connection is pending. Account confirmation
            and initial synchronisation will happen next.
          </p>
        }
      </section>
    </main>
  `,
  styles: [`
    .callback-page {
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 24px;
      background: #f5f7fb;
      color: #243247;
      box-sizing: border-box;
    }

    .callback-card {
      background: white;
      border-radius: 16px;
      padding: 28px;
      width: 100%;
      max-width: 480px;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.06);
    }

    h1 {
      font-size: 24px;
      margin-bottom: 16px;
    }

    h2 {
      font-size: 19px;
    }

    .account {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 14px;
      margin-top: 12px;
      border: 1px solid #dde3ed;
      border-radius: 10px;
    }

    .account span,
    .note {
      color: #637083;
      font-size: 14px;
    }

    .error {
      color: #b42318;
    }
  `],
})
export class BankCallback implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);

  private readonly apiUrl = 'http://localhost:5000/api';

  loading = signal(true);
  error = signal('');
  connectionId = signal('');
  accounts = signal<BankAccountPreview[]>([]);

  async ngOnInit(): Promise<void> {
    const query = this.route.snapshot.queryParamMap;

    const code = query.get('code');
    const state = query.get('state');
    const bankError = query.get('error');

    // Remove OAuth information from the browser address bar.
    if (typeof window !== 'undefined') {
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname
      );
    }

    if (bankError) {
      this.error.set('Bank authorisation was cancelled or rejected.');
      this.loading.set(false);
      return;
    }

    if (!code || !state) {
      this.error.set('Missing bank authorisation information.');
      this.loading.set(false);
      return;
    }

    try {
      // Get a CSRF token from SmartMoney Flask.
      const csrf = await firstValueFrom(
        this.http.get<{ csrf_token: string }>(
          `${this.apiUrl}/auth/csrf`,
          { withCredentials: true }
        )
      );

      // Send the authorisation code to Flask.
      // Flask handles the secure token exchange.
      const result = await firstValueFrom(
        this.http.post<BankCallbackResponse>(
          `${this.apiUrl}/bank/oauth/callback`,
          { code, state },
          {
            withCredentials: true,
            headers: {
              'X-CSRF-Token': csrf.csrf_token,
            },
          }
        )
      );

      if (
        result.status !== 'PENDING' ||
        !result.connection_id ||
        !Array.isArray(result.accounts)
      ) {
        throw new Error('Invalid bank callback response.');
      }

      this.connectionId.set(result.connection_id);
      this.accounts.set(result.accounts);

    } catch {
      this.error.set(
        'Unable to complete bank authorisation. ' +
        'Please log in to SmartMoney and try connecting again.'
      );

    } finally {
      this.loading.set(false);
    }
  }
}
