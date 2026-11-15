import { Component } from '@angular/core';
import { APP_HELP } from '../../shared/app-help';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-common-questions',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './common-questions.component.html',
  styleUrl: './common-questions.component.scss',
})
export class CommonQuestionsComponent {
  readonly help = APP_HELP;
  openThinker(): void {
    window.dispatchEvent(new Event('smartmoney:open-thinker'));
  }
}
