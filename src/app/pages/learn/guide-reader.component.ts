import { AfterViewChecked, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Guide } from './learn.page';
@Component({ selector: 'app-guide-reader', standalone: true, imports: [RouterLink], templateUrl: './guide-reader.component.html', styleUrl: './guide-reader.component.scss' })
export class GuideReaderComponent implements AfterViewChecked {
 @Input() guide: Guide | null = null;
 @Input() photo: { src: string; alt: string } | null = null;
 @Output() readonly closed = new EventEmitter<void>();
 @Output() readonly imageFailed = new EventEmitter<string>();
 @ViewChild('reader', { static: true }) private reader!: ElementRef<HTMLDialogElement>;
 readonly takeaways: Record<string, string> = { budget: 'Before your next payday, list one regular cost and one bill that arrives less often.', saving: 'Name one goal, choose a target date and check what contribution fits your budget.', spending: 'Choose one spending category to review this week, including any cash purchases.', safety: 'If a message feels urgent, pause and open the organisation’s app yourself.' };
 readonly credits: Record<string, string> = { budget: 'PNW Production', saving: 'Towfiqu barbhuiya', spending: 'Tima Miroshnichenko', safety: 'cottonbro studio' };
 ngAfterViewChecked(): void {
  const dialog = this.reader.nativeElement;
  if (this.guide && !dialog.open) { dialog.showModal(); const scroll = dialog.querySelector('.reader-scroll'); if (scroll) scroll.scrollTop = 0; }
  else if (!this.guide && dialog.open) dialog.close();
 }
 close(): void { this.reader.nativeElement.close(); }
}
