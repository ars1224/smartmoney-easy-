import { Component, Input } from '@angular/core';

export type SmartMoneyAlertTone = 'info' | 'success' | 'warning' | 'error';

@Component({
  selector: 'app-sm-alert',
  standalone: true,
  templateUrl: './sm-alert.component.html',
  styleUrl: './sm-alert.component.scss',
})
export class SmAlertComponent {
  @Input({ required: true }) message = '';
  @Input() title = '';
  @Input() tone: SmartMoneyAlertTone = 'info';
}
