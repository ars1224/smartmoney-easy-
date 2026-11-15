import { Component } from '@angular/core';
import { APP_HELP } from '../../shared/app-help';
import { RouterLink } from '@angular/router';
import { SmCardComponent } from '../../shared/ui/sm-card/sm-card.component';

@Component({
  selector: 'app-getting-started',
  standalone: true,
  imports: [RouterLink, SmCardComponent],
  templateUrl: './getting-started.component.html',
  styleUrl: './getting-started.component.scss',
})
export class GettingStartedComponent {
  readonly help = APP_HELP;
}
