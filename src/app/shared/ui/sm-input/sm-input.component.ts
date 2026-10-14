import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-sm-input',
  standalone: true,
  templateUrl: './sm-input.component.html',
  styleUrl: './sm-input.component.scss',
})
export class SmInputComponent {
  @Input({ required: true }) id = '';
  @Input({ required: true }) label = '';
  @Input() type: 'text' | 'email' | 'password' | 'number' = 'text';
  @Input() placeholder = '';
  @Input() value = '';
  @Input() error = '';
  @Input() disabled = false;
}
