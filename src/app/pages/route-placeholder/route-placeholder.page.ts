import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { SmAlertComponent } from '../../shared/ui/sm-alert/sm-alert.component';
import { SmCardComponent } from '../../shared/ui/sm-card/sm-card.component';
import { SmProgressComponent } from '../../shared/ui/sm-progress/sm-progress.component';

interface PlaceholderData {
  eyebrow: string;
  title: string;
  description: string;
  publicPage?: boolean;
  nextLink?: string;
  nextLabel?: string;

  secondaryLink?: string;
  secondaryLabel?: string;
}

@Component({
  selector: 'app-route-placeholder',
  standalone: true,
  templateUrl: './route-placeholder.page.html',
  styleUrl: './route-placeholder.page.scss',
  imports: [IonContent, RouterLink, SmAlertComponent, SmCardComponent, SmProgressComponent],
})
export class RoutePlaceholderPage implements OnInit {
  private readonly route = inject(ActivatedRoute);

  data: PlaceholderData = {
    eyebrow: 'SmartMoney! Easy',
    title: 'Page',
    description: 'This route is ready for feature development.',
  };

  ngOnInit(): void {
    this.data = { ...this.data, ...(this.route.snapshot.data as Partial<PlaceholderData>) };
  }
}
