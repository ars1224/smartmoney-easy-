import {
  Component,
  OnInit,
  computed,
  inject,
  signal,
  HostListener,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import {
  CashWalletService,
  CashWallet,
} from '../../core/services/cash-wallet.service';

import { CashWalletApiService } from '../../core/services/cash-wallet-api.service';

import {
  BankAccountsApiService,
  ConnectedBankAccount,
} from '../../core/bank/bank-accounts-api.service';

import { HttpErrorResponse } from '@angular/common/http';

import { BankConnectionService } from '../../core/bank/bank-connection.service';


@Component({
  selector: 'app-profile-assets',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    RouterLink,
    FormsModule,
  ],
  templateUrl: './profile-assets.html',
  styleUrls: ['./profile-assets.scss'],


})
export class ProfileAssetsPage implements OnInit {
  private readonly walletService = inject(CashWalletService);
  private readonly walletApi = inject(CashWalletApiService);
  private readonly bankApi = inject(BankAccountsApiService);

  // Data
  readonly wallets = this.walletService.wallets;
  readonly bankAccounts = signal<ConnectedBankAccount[]>([]);

  // Loading and error states
  readonly loading = signal(false);
  readonly walletError = signal('');
  readonly bankError = signal('');

  // Cash Wallet form state
  readonly showCreateWallet = signal(false);
  readonly savingWallet = signal(false);
  readonly createWalletError = signal('');

  readonly disconnectDialog = signal<{
  connectionId: string;
  accountNames: string[];
    } | null>(null);

  walletName = '';
  openingBalance: number | null = 0;

  // Active Cash Wallets
  readonly activeWallets = computed(() =>
    this.wallets().filter(wallet => !wallet.isArchived)
  );


    readonly archivedWallets = signal<CashWallet[]>([]);
    readonly archivedWalletError = signal('');

    readonly archivedWalletCount = computed(() =>
    this.archivedWallets().length
    );


    toggleArchivedWallets(): void {
    this.showArchivedWallets.update(value => !value);
    }
    readonly showArchivedWallets = signal(false);

    // Total NZD Cash Wallet balance
    readonly cashTotal = computed(() =>
        this.activeWallets()
        .filter(wallet => wallet.currency === 'NZD')
        .reduce(
            (sum, wallet) => sum + wallet.currentBalance,
            0
        )
    );

    // Total connected NZD Bank balance
    readonly bankTotal = computed(() =>
        this.bankAccounts()
        .filter(account => account.currency === 'NZD')
        .reduce(
            (sum, account) => sum + account.balance,
            0
        )
    );

    // Combined NZD balance
    readonly combinedTotal = computed(() =>
        this.cashTotal() + this.bankTotal()
    );


    readonly editingWallet = signal<CashWallet | null>(null);
    readonly savingEditWallet = signal(false);
    readonly editWalletError = signal('');

    editWalletName = '';
    editOpeningBalance: number | null = 0;


  ngOnInit(): void {
    void this.loadAssets();
  }


    readonly archiveWalletDialog = signal<CashWallet | null>(null);
    readonly archivingWallet = signal(false);
    readonly archiveWalletError = signal('');
    readonly archiveWalletNotice = signal('');


  // Load wallets and connected bank accounts

    async loadAssets(): Promise<void> {
    if (this.loading()) return;

    this.loading.set(true);
    this.walletError.set('');
    this.bankError.set('');
    this.archivedWalletError.set('');

    try {
        const [
        walletResult,
        bankResult,
        archivedResult,
        ] = await Promise.allSettled([
        firstValueFrom(this.walletService.loadWallets()),
        firstValueFrom(this.bankApi.getAccounts()),
        firstValueFrom(this.walletApi.getArchivedWallets()),
        ]);

        // Active Cash Wallets
        if (walletResult.status === 'rejected') {
        this.walletError.set(
            'Unable to load cash wallets. Please try again.'
        );
        }

        // Connected bank accounts
        if (bankResult.status === 'fulfilled') {
        this.bankAccounts.set(bankResult.value);
        } else {
        this.bankError.set(
            'Unable to load bank accounts. Please try again.'
        );
        }

        // Archived Cash Wallets
        if (archivedResult.status === 'fulfilled') {
        this.archivedWallets.set(archivedResult.value);
        } else {
        this.archivedWallets.set([]);
        this.archivedWalletError.set(
            'Unable to load archived wallets. Please try again.'
        );
        }
    } finally {
        this.loading.set(false);
    }
    }



    openCreateWalletModal(): void {
    if (this.savingWallet() || this.disconnectDialog()) {
        return;
    }

    this.createWalletError.set('');
    this.showCreateWallet.set(true);
    }

    closeCreateWalletModal(): void {
    if (this.savingWallet()) {
        return;
    }

    this.showCreateWallet.set(false);
    this.createWalletError.set('');
    }


    // Create a new Cash Wallet
    async createCashWallet(): Promise<void> {
        if (this.savingWallet()) return;

        const name = this.walletName.trim();
        const balance = this.openingBalance;

        if (!name || name.length > 80) {
        this.createWalletError.set(
            'Enter a wallet name of up to 80 characters.'
        );
        return;
        }

        if (
        balance === null ||
        !Number.isFinite(balance) ||
        balance < 0 ||
        !/^\d+(\.\d{1,2})?$/.test(String(balance))
        ) {
        this.createWalletError.set(
            'Enter a valid opening balance with up to two decimal places.'
        );
        return;
        }

        this.savingWallet.set(true);
        this.createWalletError.set('');

        try {
        await firstValueFrom(
            this.walletApi.createWallet({
            name,
            currency: 'NZD',
            openingBalance: balance,
            })
        );

        await firstValueFrom(
            this.walletService.loadWallets()
        );

        // Reset form after success
        this.walletName = '';
        this.openingBalance = 0;
        this.showCreateWallet.set(false);
        } catch {
        this.createWalletError.set(
            'Unable to save or refresh the cash wallet. Please refresh and check before retrying.'
        );
        } finally {
        this.savingWallet.set(false);
        }
    }


    private readonly bankConnection = inject(BankConnectionService);

    readonly disconnectingBank = signal<string | null>(null);
    readonly retryDisconnectId = signal<string | null>(null);
    readonly disconnectError = signal('');
    readonly disconnectNotice = signal('');

    // Group accounts by their bank connection.
    // Multiple accounts may share one connection.
    readonly bankConnections = computed(() => {
    const groups = new Map<string, string[]>();

    for (const account of this.bankAccounts()) {
        const names = groups.get(account.connectionId) ?? [];
        names.push(account.accountName);
        groups.set(account.connectionId, names);
    }

    return Array.from(groups, ([connectionId, accountNames]) => ({
        connectionId,
        accountNames,
        }));
    });


    async confirmDisconnectBank(): Promise<void> {
    const dialog = this.disconnectDialog();

    if (!dialog || this.disconnectingBank() !== null) {
        return;
    }

    this.disconnectError.set('');
    this.disconnectNotice.set('');
    this.disconnectingBank.set(dialog.connectionId);

    try {
        const result = await firstValueFrom(
        this.bankConnection.cancelConnection(dialog.connectionId)
        );

        if (result.status !== 'DISCONNECTED') {
        if (result.action === 'retry_disconnect') {
            this.retryDisconnectId.set(dialog.connectionId);
        }

        this.disconnectError.set(
            result.error ??
            result.warning ??
            'Unable to disconnect Mock Bank.'
        );
        return;
        }

        this.retryDisconnectId.set(null);
        this.disconnectDialog.set(null);

        this.disconnectNotice.set(
        'Mock Bank disconnected successfully. Existing transaction history was preserved.'
        );

        await this.loadAssets();

    } catch (error) {
        if (error instanceof HttpErrorResponse) {
        const backendError = error.error?.error;

        if (typeof backendError === 'string') {
            this.disconnectError.set(backendError);
        } else {
            this.disconnectError.set(
            'Unable to disconnect Mock Bank.'
            );
        }
        } else {
        this.disconnectError.set(
            'Unable to disconnect Mock Bank.'
        );
        }
    } finally {
        this.disconnectingBank.set(null);
    }
    }

    openDisconnectModal(
    connectionId: string,
    accountNames: string[]
    ): void {
    if (this.disconnectingBank() !== null || this.loading()) {
        return;
    }

    this.disconnectError.set('');
    this.disconnectNotice.set('');

    this.disconnectDialog.set({
        connectionId,
        accountNames,
    });
    }

    closeDisconnectModal(): void {
    if (this.disconnectingBank() !== null) {
        return;
    }

    this.disconnectDialog.set(null);
    }



    @HostListener('document:keydown.escape', ['$event'])
    onDisconnectModalEscape(event: Event): void {
    if (this.archiveWalletDialog()) {
        if (this.archivingWallet()) return;

        event.preventDefault();
        this.closeArchiveWalletModal();
        return;
    }

    if (this.editingWallet()) {
        if (this.savingEditWallet()) return;

        event.preventDefault();
        this.closeEditWalletModal();
        return;
    }

    if (this.showCreateWallet()) {
        if (this.savingWallet()) return;

        event.preventDefault();
        this.closeCreateWalletModal();
        return;
    }

    if (this.disconnectDialog()) {
        if (this.disconnectingBank() !== null) return;

        event.preventDefault();
        this.closeDisconnectModal();
    }
    }


    openEditWalletModal(wallet: CashWallet): void {
    if (
        this.savingEditWallet() ||
        this.showCreateWallet() ||
        this.disconnectDialog()
    ) {
        return;
    }

    this.editWalletName = wallet.name;
    this.editOpeningBalance = wallet.openingBalance;
    this.editWalletError.set('');
    this.editingWallet.set(wallet);
    }

    closeEditWalletModal(): void {
    if (this.savingEditWallet()) return;

    this.editingWallet.set(null);
    this.editWalletError.set('');
    }

    async saveEditWallet(): Promise<void> {
    const wallet = this.editingWallet();

    if (!wallet || this.savingEditWallet()) return;

    const name = this.editWalletName.trim();
    const balance = this.editOpeningBalance;

    if (!name || name.length > 80) {
        this.editWalletError.set(
        'Enter a wallet name of up to 80 characters.'
        );
        return;
    }

    if (
        balance === null ||
        !Number.isFinite(balance) ||
        balance < 0 ||
        !/^\d+(\.\d{1,2})?$/.test(String(balance))
    ) {
        this.editWalletError.set(
        'Enter a valid opening balance with up to two decimal places.'
        );
        return;
    }

    this.savingEditWallet.set(true);
    this.editWalletError.set('');

    try {
        await firstValueFrom(
        this.walletApi.updateWallet(wallet.id, {
            name,
            openingBalance: balance,
        })
        );

        this.editingWallet.set(null);

        try {
        await firstValueFrom(this.walletService.loadWallets());
        } catch {
        this.walletError.set(
            'Wallet updated, but balances could not be refreshed. Please reload the page.'
        );
        }
    } catch {
        this.editWalletError.set(
        'Unable to update the wallet. Please check the details and try again.'
        );
    } finally {
        this.savingEditWallet.set(false);
    }
    }


    openArchiveWalletModal(wallet: CashWallet): void {
    if (
        wallet.isArchived ||
        this.archivingWallet() ||
        this.savingEditWallet() ||
        this.savingWallet() ||
        this.loading() ||
        this.editingWallet() ||
        this.showCreateWallet() ||
        this.disconnectDialog()
    ) {
        return;
    }

    this.archiveWalletError.set('');
    this.archiveWalletNotice.set('');
    this.archiveWalletDialog.set(wallet);
    }

    closeArchiveWalletModal(): void {
    if (this.archivingWallet()) return;

    this.archiveWalletDialog.set(null);
    this.archiveWalletError.set('');
    }


    async confirmArchiveWallet(): Promise<void> {
    const wallet = this.archiveWalletDialog();

    if (!wallet || this.archivingWallet()) return;

    this.archivingWallet.set(true);
    this.archiveWalletError.set('');
    this.archiveWalletNotice.set('');

    try {
        // Archive the selected wallet in PostgreSQL.

        await firstValueFrom(
        this.walletApi.archiveWallet(wallet.id)
        );


        this.archiveWalletDialog.set(null);

        this.archiveWalletNotice.set(
        `${wallet.name} has been archived. Its transaction history is preserved.`
        );

        // Refresh active and archived wallets separately.
        const [activeResult, archivedResult] =
        await Promise.allSettled([
            firstValueFrom(this.walletService.loadWallets()),
            firstValueFrom(this.walletApi.getArchivedWallets()),
        ]);

        if (activeResult.status === 'fulfilled') {
        this.walletError.set('');
        } else {
        this.walletError.set(
            'Wallet archived, but active wallets could not be refreshed. Please reload.'
        );
        }

        if (archivedResult.status === 'fulfilled') {
        this.archivedWallets.set(archivedResult.value);
        this.archivedWalletError.set('');
        this.showArchivedWallets.set(true);
        } else {
        this.archivedWalletError.set(
            'Wallet archived, but archived wallets could not be refreshed. Please reload.'
        );
        }
    } catch (error: unknown) {
        if (error instanceof HttpErrorResponse) {
        const backendError = error.error?.error;

        this.archiveWalletError.set(
            typeof backendError === 'string'
            ? backendError
            : 'Unable to archive this wallet. Please try again.'
        );
        } else {
        this.archiveWalletError.set(
            'Unable to archive this wallet. Please try again.'
        );
        }
    } finally {
        this.archivingWallet.set(false);
    }
    }


private activeModalElement: HTMLElement | null = null;
private modalTriggerElement: HTMLElement | null = null;

@ViewChild('addWalletTrigger')
private addWalletTrigger?: ElementRef<HTMLButtonElement>;

@ViewChild('profileModal')
set profileModalRef(
  reference: ElementRef<HTMLElement> | undefined
) {
  const modal = reference?.nativeElement ?? null;

  // Modal opened
  if (modal && !this.activeModalElement) {
    this.modalTriggerElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    this.activeModalElement = modal;

    setTimeout(() => {
      if (this.activeModalElement !== modal) return;

      const initialTarget =
        modal.querySelector<HTMLElement>('[data-initial-focus]') ??
        modal.querySelector<HTMLElement>(
          'input:not([disabled]), button:not([disabled])'
        );

      (initialTarget ?? modal).focus();
    }, 0);

    return;
  }

  // Modal closed
  if (!modal && this.activeModalElement) {
    this.activeModalElement = null;

    const trigger = this.modalTriggerElement;
    this.modalTriggerElement = null;

    setTimeout(() => {
      if (this.activeModalElement) return;

      if (trigger?.isConnected && !trigger.hasAttribute('disabled')) {
        trigger.focus();
      } else {
        // The Archive or Disconnect action may remove
        // its original button from the page.
        this.addWalletTrigger?.nativeElement.focus();
      }
    }, 0);

    return;
  }

  this.activeModalElement = modal;
}

// Keep Tab navigation inside the active modal.
@HostListener('document:keydown.tab', ['$event'])
onProfileModalTab(event: Event): void {
  const modal = this.activeModalElement;

  if (!modal) return;

  const keyboardEvent = event as KeyboardEvent;

  const focusableElements = Array.from(
    modal.querySelectorAll<HTMLElement>(
      'button:not([disabled]), ' +
      'input:not([disabled]), ' +
      'select:not([disabled]), ' +
      'textarea:not([disabled]), ' +
      'a[href], ' +
      '[tabindex]:not([tabindex="-1"])'
    )
  ).filter(element => element.getClientRects().length > 0);

  if (focusableElements.length === 0) {
    keyboardEvent.preventDefault();
    modal.focus();
    return;
  }

  const first = focusableElements[0];
  const last = focusableElements[focusableElements.length - 1];
  const current = document.activeElement;

  if (!modal.contains(current)) {
    keyboardEvent.preventDefault();

    if (keyboardEvent.shiftKey) {
      last.focus();
    } else {
      first.focus();
    }

    return;
  }

  if (keyboardEvent.shiftKey && current === first) {
    keyboardEvent.preventDefault();
    last.focus();
    return;
  }

  if (!keyboardEvent.shiftKey && current === last) {
    keyboardEvent.preventDefault();
    first.focus();
  }
}




}