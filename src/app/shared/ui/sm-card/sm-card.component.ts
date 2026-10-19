import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-sm-card',
  standalone: true,
  templateUrl: './sm-card.component.html',
  styleUrl: './sm-card.component.scss',
})
export class SmCardComponent {
  @Input() labelledBy?: string;
}
