import { Component, Input } from '@angular/core';
interface Scene { kind: string; title: string; rows: { label: string; value: string }[]; result: string; caption: string }
export const CHALLENGE_SCENES: Record<string, Scene> = {
  "budget-balance": {
    "kind": "receipt",
    "title": "Weekly plan",
    "rows": [
      {
        "label": "Income",
        "value": "$600"
      },
      {
        "label": "Planned costs",
        "value": "−$470"
      }
    ],
    "result": "$130 left",
    "caption": "$600 − $470 = $130 before other spending or saving."
  },
  "budget-annual": {
    "kind": "steps",
    "title": "Prepare over 52 weeks",
    "rows": [
      {
        "label": "Annual bill",
        "value": "$260"
      },
      {
        "label": "Weekly contributions",
        "value": "52"
      }
    ],
    "result": "$5 each week",
    "caption": "$5 × 52 weeks covers the example $260 bill."
  },
  "budget-variable": {
    "kind": "plan",
    "title": "Income can change",
    "rows": [
      {
        "label": "High-earning week",
        "value": "Not guaranteed"
      },
      {
        "label": "Reliable income",
        "value": "Planning starting point"
      }
    ],
    "result": "Plan from reliable income",
    "caption": "Revisit your plan when actual earnings change."
  },
  "budget-frequency": {
    "kind": "steps",
    "title": "Count the whole year",
    "rows": [
      {
        "label": "Weekly cost",
        "value": "$25"
      },
      {
        "label": "Payments in a year",
        "value": "52"
      }
    ],
    "result": "$1,300 a year",
    "caption": "52 weekly payments, rather than 12 groups of four."
  },
  "saving-gap": {
    "kind": "progress",
    "title": "How far to the goal?",
    "rows": [
      {
        "label": "Already saved",
        "value": "$80"
      },
      {
        "label": "Target",
        "value": "$200"
      }
    ],
    "result": "$120 to go",
    "caption": "$80 saved + $120 remaining = $200."
  },
  "saving-paydays": {
    "kind": "steps",
    "title": "Four contributions",
    "rows": [
      {
        "label": "Still needed",
        "value": "$160"
      },
      {
        "label": "Paydays left",
        "value": "4"
      }
    ],
    "result": "$40 each payday",
    "caption": "$40 + $40 + $40 + $40 = $160."
  },
  "saving-extra": {
    "kind": "plan",
    "title": "Make room to adjust",
    "rows": [
      {
        "label": "Target amount",
        "value": "Can change"
      },
      {
        "label": "Target date",
        "value": "Can change"
      }
    ],
    "result": "Adjust the plan",
    "caption": "Keep essential costs in view when choosing a contribution."
  },
  "saving-weeks": {
    "kind": "steps",
    "title": "Eight small steps",
    "rows": [
      {
        "label": "Each contribution",
        "value": "$15"
      },
      {
        "label": "Contributions",
        "value": "8"
      }
    ],
    "result": "$120 saved",
    "caption": "$15 × 8 = $120, excluding interest and fees."
  },
  "saving-transfer": {
    "kind": "transfer",
    "title": "Two different actions",
    "rows": [
      {
        "label": "SmartMoney",
        "value": "Track your progress"
      },
      {
        "label": "Your bank",
        "value": "Move your money"
      }
    ],
    "result": "Recording is not transferring",
    "caption": "Logging a contribution does not transfer money between accounts."
  },
  "spend-unit": {
    "kind": "compare",
    "title": "Compare each item",
    "rows": [
      {
        "label": "6 items for $9",
        "value": "$1.50 each"
      },
      {
        "label": "10 items for $14",
        "value": "$1.40 each"
      }
    ],
    "result": "Ten-pack: lower unit price",
    "caption": "It still costs more upfront; consider how many you will use."
  },
  "spend-discount": {
    "kind": "receipt",
    "title": "Read the sale price",
    "rows": [
      {
        "label": "Original price",
        "value": "$80"
      },
      {
        "label": "Discount",
        "value": "25%"
      }
    ],
    "result": "$60 to pay",
    "caption": "25% × $80 = $20 off; $80 − $20 = $60."
  },
  "spend-delivery": {
    "kind": "receipt",
    "title": "At the checkout",
    "rows": [
      {
        "label": "Item",
        "value": "$30"
      },
      {
        "label": "Delivery",
        "value": "+$7"
      }
    ],
    "result": "$37 total",
    "caption": "$30 + $7 delivery = $37 to pay."
  },
  "spend-coffee": {
    "kind": "steps",
    "title": "The weekly view",
    "rows": [
      {
        "label": "One purchase",
        "value": "$5"
      },
      {
        "label": "Days per week",
        "value": "5"
      }
    ],
    "result": "$25 a week",
    "caption": "$5 × 5 purchases = $25."
  },
  "spend-cash": {
    "kind": "transfer",
    "title": "Follow the same $40",
    "rows": [
      {
        "label": "Bank → cash",
        "value": "$40 withdrawal"
      },
      {
        "label": "Cash → groceries",
        "value": "$40 spending"
      }
    ],
    "result": "One expense, not two",
    "caption": "The withdrawal changes where the money is; the purchase spends it."
  },
  "safe-code": {
    "kind": "phone",
    "title": "Incoming call",
    "rows": [
      {
        "label": "Caller",
        "value": "Please read me your bank security code."
      },
      {
        "label": "Claim",
        "value": "I know your name, so you can trust me."
      }
    ],
    "result": "Pause. Keep the code private.",
    "caption": "A familiar name does not verify the caller; contact the bank independently."
  },
  "safe-prize": {
    "kind": "phone",
    "title": "Unexpected message",
    "rows": [
      {
        "label": "Message",
        "value": "You won! Pay a fee now to claim your prize."
      },
      {
        "label": "Pressure",
        "value": "Offer expires immediately."
      }
    ],
    "result": "Upfront fee + urgency",
    "caption": "Warning signs are a reason to pause and independently verify."
  },
  "safe-sender": {
    "kind": "phone",
    "title": "A familiar-looking text",
    "rows": [
      {
        "label": "Sender name",
        "value": "Your bank"
      },
      {
        "label": "Message",
        "value": "Please confirm your account details."
      }
    ],
    "result": "A name is not proof",
    "caption": "Names and branding can be copied; check the request independently."
  },
  "safe-pressure": {
    "kind": "phone",
    "title": "Seller conversation",
    "rows": [
      {
        "label": "Seller",
        "value": "Pay right now. Do not tell anyone about this deal."
      },
      {
        "label": "Pressure",
        "value": "Immediate payment + secrecy"
      }
    ],
    "result": "Slow down and verify",
    "caption": "Pressure and secrecy are warning signs, not proof of a trustworthy offer."
  },
  "safe-link": {
    "kind": "phone",
    "title": "Unexpected refund",
    "rows": [
      {
        "label": "Message",
        "value": "Your refund is waiting. Enter your password through this link."
      },
      {
        "label": "Destination",
        "value": "An unfamiliar link"
      }
    ],
    "result": "Open the official service yourself",
    "caption": "Do not use an unexpected message as your route to account access."
  },
  "debt-total": {
    "kind": "steps",
    "title": "Count every repayment",
    "rows": [
      {
        "label": "Each payment",
        "value": "$30"
      },
      {
        "label": "Repayments",
        "value": "20"
      }
    ],
    "result": "$600 repaid",
    "caption": "20 × $30 = $600, assuming no other fees."
  },
  "debt-fee": {
    "kind": "receipt",
    "title": "Include separate fees",
    "rows": [
      {
        "label": "Repayments",
        "value": "$500"
      },
      {
        "label": "Separate fee",
        "value": "+$25"
      }
    ],
    "result": "$525 total",
    "caption": "$500 + $25 = $525 paid in total."
  },
  "debt-term": {
    "kind": "compare",
    "title": "Same payment, different term",
    "rows": [
      {
        "label": "Plan A: $20 × 10",
        "value": "$200 total"
      },
      {
        "label": "Plan B: $20 × 15",
        "value": "$300 total"
      }
    ],
    "result": "Plan A totals $100 less",
    "caption": "Compare the length of the plan as well as the weekly payment."
  },
  "debt-terms": {
    "kind": "plan",
    "title": "Beyond the headline",
    "rows": [
      {
        "label": "Offer",
        "value": "Interest-free"
      },
      {
        "label": "Read the terms",
        "value": "Fees · due dates · end date"
      }
    ],
    "result": "Check the full terms",
    "caption": "An interest-free headline does not tell you every cost or obligation."
  },
  "debt-due": {
    "kind": "plan",
    "title": "Before a payment is missed",
    "rows": [
      {
        "label": "Repayment",
        "value": "May be difficult"
      },
      {
        "label": "Next checks",
        "value": "Budget + provider options"
      }
    ],
    "result": "Contact the provider early",
    "caption": "Discuss what is possible; arrangements depend on the situation and provider."
  },
  "debt-compare": {
    "kind": "plan",
    "title": "Compare the full picture",
    "rows": [
      {
        "label": "Headline",
        "value": "Weekly payment"
      },
      {
        "label": "Full picture",
        "value": "Total · fees · term · affordability"
      }
    ],
    "result": "Look beyond one number",
    "caption": "A small weekly amount alone does not show the full borrowing cost."
  }
};
@Component({ selector: 'app-challenge-scene', standalone: true, templateUrl: './challenge-scene.component.html', styleUrl: './challenge-scene.component.scss' })
export class ChallengeSceneComponent {
 @Input({ required: true }) id = '';
 @Input() answered = false;
 get scene(): Scene | undefined { return CHALLENGE_SCENES[this.id]; }

}
