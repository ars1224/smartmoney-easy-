import { Component, Input } from '@angular/core';

export type SmartMoneyProgressTone = 'teal' | 'green' | 'warning' | 'danger';

@Component({
  selector: 'app-sm-progress',
  standalone: true,
  templateUrl: './sm-progress.component.html',
  styleUrl: './sm-progress.component.scss',
})
export class SmProgressComponent {
  @Input({ required: true }) label = '';
  @Input() value = 0;
  @Input() tone: SmartMoneyProgressTone = 'teal';

  get safeValue(): number {
    return Math.min(100, Math.max(0, this.value));
  }
}
