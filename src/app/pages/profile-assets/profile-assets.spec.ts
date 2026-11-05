
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { throwError } from 'rxjs';
import { vi } from 'vitest';

import { ProfileAssetsPage } from './profile-assets';
import { CashWalletService } from '../../core/services/cash-wallet.service';
import { CashWalletApiService } from '../../core/services/cash-wallet-api.service';
import { BankAccountsApiService } from '../../core/bank/bank-accounts-api.service';
import { BankConnectionService } from '../../core/bank/bank-connection.service';

describe('ProfileAssetsPage - Disconnect failure', () => {
  it('shows the API error inside the open dialog', async () => {
    const cancelConnection = vi.fn(() =>
      throwError(() =>
        new HttpErrorResponse({
          status: 503,
          statusText: 'Service Unavailable',
          error: {
            error: 'Mock Bank is temporarily unavailable.',
          },
        })
      )
    );

    await TestBed.configureTestingModule({
      imports: [ProfileAssetsPage],
      providers: [
        provideRouter([]),
        {
          provide: CashWalletService,
          useValue: { wallets: signal([]) },
        },
        {
          provide: CashWalletApiService,
          useValue: {},
        },
        {
          provide: BankAccountsApiService,
          useValue: {},
        },
        {
          provide: BankConnectionService,
          useValue: { cancelConnection },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ProfileAssetsPage);
    const page = fixture.componentInstance;

    // Prevent page initialization from making API calls.
    vi.spyOn(page, 'loadAssets').mockResolvedValue(undefined);

    fixture.detectChanges();

    page.disconnectDialog.set({
      connectionId: 'fake-connection',
      accountNames: ['Everyday Account'],
    });

    fixture.detectChanges();

    await page.confirmDisconnectBank();

    fixture.detectChanges();

    expect(cancelConnection).toHaveBeenCalledWith(
      'fake-connection'
    );

    expect(page.disconnectDialog()).not.toBeNull();

    expect(page.disconnectingBank()).toBeNull();

    const dialog = fixture.nativeElement.querySelector(
      '[aria-labelledby="disconnect-modal-title"]'
    ) as HTMLElement | null;

    expect(dialog).not.toBeNull();

    const alert = dialog?.querySelector('[role="alert"]');

    expect(alert).not.toBeNull();

    expect(alert?.textContent).toContain(
      'Mock Bank is temporarily unavailable.'
    );
  });
});
