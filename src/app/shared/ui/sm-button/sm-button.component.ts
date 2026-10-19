import { Component, EventEmitter, Input, Output } from '@angular/core';

export type SmartMoneyButtonVariant = 'primary' | 'secondary' | 'danger';

@Component({
  selector: 'app-sm-button',
  standalone: true,
  templateUrl: './sm-button.component.html',
  styleUrl: './sm-button.component.scss',
})
export class SmButtonComponent {
  @Input({ required: true }) label = '';
  @Input() variant: SmartMoneyButtonVariant = 'primary';
  @Input() type: 'button' | 'submit' = 'button';
  @Input() disabled = false;
  @Input() loading = false;
  @Output() readonly pressed = new EventEmitter<void>();

  activate(): void {
    if (!this.disabled && !this.loading) {
      this.pressed.emit();
    }
  }
}
