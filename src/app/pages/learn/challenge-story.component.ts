import { Component, Input } from '@angular/core';
@Component({ selector: 'app-challenge-story', standalone: true, templateUrl: './challenge-story.component.html', styleUrl: './challenge-story.component.scss' })
export class ChallengeStoryComponent {
  @Input({ required: true }) story = '';
  @Input() answered = false;
  readonly months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  readonly weeks = [1, 2, 3, 4, 5, 6];
}
