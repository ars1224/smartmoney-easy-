export interface ChallengeQuestion {
 id: string; topic: string; title: string; prompt: string; note: string; choices: string[]; correct: number; success: string; explanation: string; caution: string; takeaway?: string; numeric?: boolean;
}
const ORIGINAL: ChallengeQuestion[] = [
  { id: 'scam', topic: 'Staying safe', title: 'Could you spot the scam?', prompt: 'Which message has stronger warning signs?', note: 'Fictional examples. No real links.', choices: ['Your account will be locked in 10 minutes. Verify your details now at secure-bank.example.', 'Your monthly statement is ready. Open your bank app as usual to view it.'], correct: 0, success: 'You spotted the warning signs.', explanation: 'Urgency and an unfamiliar link are reasons to pause. Open the bank app yourself instead of following the message.', caution: 'The other message has fewer warning signs, but a sender name alone does not prove a message is genuine.' },
  { id: 'payday', topic: 'Budgeting', title: 'What is missing from payday?', prompt: 'You planned for rent, food and transport. Your annual car registration is due next month. What should you add?', note: 'An everyday budgeting example.', choices: ['An amount towards the upcoming registration', 'Nothing: only weekly costs belong in a budget'], correct: 0, success: 'You made room for the less frequent costs.', explanation: 'Annual and occasional bills belong in your plan too. Setting some money aside each payday can make them easier to manage.', caution: '' },
  { id: 'subscription', topic: 'Spending', title: 'Small subscription, bigger total?', prompt: 'A subscription costs $8 each month. How much is that over 12 months?', note: 'Assume the price stays the same, with no extra fees.', choices: ['$80', '$96', '$104'], correct: 1, success: 'That is the yearly picture.', explanation: '$8 × 12 months = $96 a year. Looking at the yearly cost can help you decide whether you use a subscription enough.', caution: '' },
  { id: 'saving', topic: 'Saving', title: 'Six weeks to your goal?', prompt: 'You want to save $120 in six weeks, starting from $0. How much would you set aside each week?', note: 'Assume equal weekly amounts, with no interest or fees.', choices: ['$15', '$20', '$30'], correct: 1, success: 'You broke the goal into smaller steps.', explanation: '$120 ÷ 6 weeks = $20 a week. If that does not fit your budget, you can adjust the amount or the target date.', caution: '' },
  { id: 'expense', topic: 'Budgeting', title: 'An unexpected bill arrives.', prompt: 'Before taking out a new loan, what could you check first?', note: 'An example to practise comparing options.', choices: ['Only the advertised weekly repayment', 'Your budget, available savings and possible payment arrangements'], correct: 1, success: 'You gave yourself more options to compare.', explanation: 'Check what you can afford and ask the provider about payment options. If considering a loan, compare its total cost, fees and repayment terms.', caution: 'The right next step depends on your circumstances. This is a learning example, not personalised advice.' },
];

export const CHALLENGE_BANK: ChallengeQuestion[] = [...ORIGINAL, ...[
  {
    "id": "budget-balance",
    "topic": "Budgeting",
    "title": "What is left for the week?",
    "prompt": "Your weekly income is $600 and planned costs total $470. What is left?",
    "note": "Fictional learning example; amounts and terms are illustrative.",
    "choices": [
      "$130",
      "$170",
      "$230"
    ],
    "correct": 0,
    "success": "You worked it out.",
    "explanation": "$600 − $470 = $130. This is the amount left before any other spending or saving.",
    "caution": "",
    "takeaway": "List any costs not yet included before using the remainder.",
    "numeric": true
  },
  {
    "id": "budget-annual",
    "topic": "Budgeting",
    "title": "A yearly bill, a weekly plan",
    "prompt": "An example annual bill is $260. Over 52 weeks, how much would cover it?",
    "note": "Fictional learning example; amounts and terms are illustrative.",
    "choices": [
      "$5 a week",
      "$10 a week",
      "$20 a week"
    ],
    "correct": 0,
    "success": "You worked it out.",
    "explanation": "$260 ÷ 52 = $5 each week, assuming a full year to prepare.",
    "caution": "",
    "takeaway": "Put one annual bill into your budget calendar.",
    "numeric": true
  },
  {
    "id": "budget-variable",
    "topic": "Budgeting",
    "title": "When income changes",
    "prompt": "Your earnings vary each week. Which starting point makes a plan less dependent on a great week?",
    "note": "Fictional learning example; amounts and terms are illustrative.",
    "choices": [
      "Your highest-ever weekly pay",
      "Income you can reasonably rely on",
      "Any income you hope to earn"
    ],
    "correct": 1,
    "success": "You worked it out.",
    "explanation": "Use a realistic income estimate and revisit the plan when your earnings change.",
    "caution": "",
    "takeaway": "Compare your plan with your actual income regularly.",
    "numeric": false
  },
  {
    "id": "budget-frequency",
    "topic": "Budgeting",
    "title": "Four weeks or a calendar month?",
    "prompt": "A cost is $25 every week. What does it total over 52 weeks?",
    "note": "Fictional learning example; amounts and terms are illustrative.",
    "choices": [
      "$1,200",
      "$1,300",
      "$1,000"
    ],
    "correct": 1,
    "success": "You worked it out.",
    "explanation": "$25 × 52 = $1,300. Treating every month as exactly four weeks would miss four weekly payments over a year.",
    "caution": "",
    "takeaway": "Check the payment frequency when comparing costs.",
    "numeric": true
  },
  {
    "id": "saving-gap",
    "topic": "Saving",
    "title": "You have already started",
    "prompt": "Your goal is $200 and you already have $80. How much remains?",
    "note": "Fictional learning example; amounts and terms are illustrative.",
    "choices": [
      "$120",
      "$180",
      "$280"
    ],
    "correct": 0,
    "success": "You worked it out.",
    "explanation": "$200 − $80 = $120 still to save.",
    "caution": "",
    "takeaway": "Subtract your current savings before planning contributions.",
    "numeric": true
  },
  {
    "id": "saving-paydays",
    "topic": "Saving",
    "title": "Four paydays to go",
    "prompt": "You need another $160 with four equal paydays left. What contribution meets the target?",
    "note": "Fictional learning example; amounts and terms are illustrative.",
    "choices": [
      "$20",
      "$40",
      "$60"
    ],
    "correct": 1,
    "success": "You worked it out.",
    "explanation": "$160 ÷ 4 = $40 each payday, ignoring interest and fees.",
    "caution": "",
    "takeaway": "Check that each contribution fits the rest of your budget.",
    "numeric": true
  },
  {
    "id": "saving-extra",
    "topic": "Saving",
    "title": "A goal that feels too tight",
    "prompt": "The weekly amount for a savings goal does not fit your budget. What could you adjust?",
    "note": "Fictional learning example; amounts and terms are illustrative.",
    "choices": [
      "The target amount or target date",
      "Ignore essential bills",
      "Assume extra income will arrive"
    ],
    "correct": 0,
    "success": "You worked it out.",
    "explanation": "Changing the amount or allowing more time can make a goal more realistic.",
    "caution": "",
    "takeaway": "Choose a timeline you can maintain.",
    "numeric": false
  },
  {
    "id": "saving-weeks",
    "topic": "Saving",
    "title": "Small amounts, steady progress",
    "prompt": "What does $15 a week add up to after eight contributions?",
    "note": "Fictional learning example; amounts and terms are illustrative.",
    "choices": [
      "$90",
      "$120",
      "$150"
    ],
    "correct": 1,
    "success": "You worked it out.",
    "explanation": "$15 × 8 = $120, with no interest or fees in this example.",
    "caution": "",
    "takeaway": "Track contributions so you can see your progress.",
    "numeric": true
  },
  {
    "id": "saving-transfer",
    "topic": "Saving",
    "title": "Tracking or transferring?",
    "prompt": "You record a savings contribution in SmartMoney. What does that action do?",
    "note": "Fictional learning example; amounts and terms are illustrative.",
    "choices": [
      "Records progress towards the goal",
      "Moves money between bank accounts",
      "Guarantees a return"
    ],
    "correct": 0,
    "success": "You worked it out.",
    "explanation": "Recording a contribution tracks progress in SmartMoney; it does not move money.",
    "caution": "",
    "takeaway": "Check your bank separately when you need to make a transfer.",
    "numeric": false
  },
  {
    "id": "spend-unit",
    "topic": "Spending",
    "title": "Which pack costs less per item?",
    "prompt": "Six identical items cost $9; ten cost $14. Which has the lower unit price?",
    "note": "Fictional learning example; amounts and terms are illustrative.",
    "choices": [
      "The six-pack",
      "The ten-pack",
      "They are equal"
    ],
    "correct": 1,
    "success": "You worked it out.",
    "explanation": "$9 ÷ 6 = $1.50 each; $14 ÷ 10 = $1.40 each. The ten-pack costs less per item but more upfront.",
    "caution": "",
    "takeaway": "Compare unit price and buy only an amount you will use.",
    "numeric": false
  },
  {
    "id": "spend-discount",
    "topic": "Spending",
    "title": "A discount still costs money",
    "prompt": "An item was $80 and is reduced by 25%. What is the sale price?",
    "note": "Fictional learning example; amounts and terms are illustrative.",
    "choices": [
      "$20",
      "$55",
      "$60"
    ],
    "correct": 2,
    "success": "You worked it out.",
    "explanation": "25% of $80 is $20. Subtracting that discount leaves a price of $60.",
    "caution": "",
    "takeaway": "Check the final price against your budget.",
    "numeric": true
  },
  {
    "id": "spend-delivery",
    "topic": "Spending",
    "title": "What is the checkout total?",
    "prompt": "A $30 item has a $7 delivery fee. What is the total?",
    "note": "Fictional learning example; amounts and terms are illustrative.",
    "choices": [
      "$30",
      "$37",
      "$23"
    ],
    "correct": 1,
    "success": "You worked it out.",
    "explanation": "$30 + $7 = $37. Extra charges can change a comparison between shops.",
    "caution": "",
    "takeaway": "Compare the checkout total, including fees.",
    "numeric": true
  },
  {
    "id": "spend-coffee",
    "topic": "Spending",
    "title": "The weekly view",
    "prompt": "An example $5 purchase happens on five days each week. What is the weekly total?",
    "note": "Fictional learning example; amounts and terms are illustrative.",
    "choices": [
      "$10",
      "$25",
      "$35"
    ],
    "correct": 1,
    "success": "You worked it out.",
    "explanation": "$5 × 5 = $25. Adding repeated purchases helps you see their place in your budget.",
    "caution": "",
    "takeaway": "Review one repeated cost without judging every purchase.",
    "numeric": true
  },
  {
    "id": "spend-cash",
    "topic": "Spending",
    "title": "Where did that cash go?",
    "prompt": "You withdraw $40 and later spend it on groceries. How can you avoid counting the same spending twice?",
    "note": "Fictional learning example; amounts and terms are illustrative.",
    "choices": [
      "Count both as new expenses",
      "Track the withdrawal as a transfer and the purchase as spending",
      "Ignore cash purchases"
    ],
    "correct": 1,
    "success": "You worked it out.",
    "explanation": "A withdrawal moves money into cash. The grocery purchase is the expense; distinguish the two in your records.",
    "caution": "",
    "takeaway": "Include cash purchases when reviewing spending.",
    "numeric": false
  },
  {
    "id": "safe-code",
    "topic": "Staying safe",
    "title": "A caller asks for a code",
    "prompt": "An unexpected caller asks you to read out a bank security code. What is a safer response?",
    "note": "Fictional learning example; amounts and terms are illustrative.",
    "choices": [
      "Read it out if they know your name",
      "End the call and contact the bank independently",
      "Send the code by text instead"
    ],
    "correct": 1,
    "success": "You worked it out.",
    "explanation": "A caller knowing your name does not verify their identity. Contact the bank using details you already trust.",
    "caution": "",
    "takeaway": "Keep passwords and security codes private.",
    "numeric": false
  },
  {
    "id": "safe-prize",
    "topic": "Staying safe",
    "title": "Pay first to claim a prize?",
    "prompt": "A message says you won a prize but must pay a fee immediately. What should you do first?",
    "note": "Fictional learning example; amounts and terms are illustrative.",
    "choices": [
      "Pay before the timer ends",
      "Pause and independently verify the claim",
      "Send your card number to reserve it"
    ],
    "correct": 1,
    "success": "You worked it out.",
    "explanation": "An unexpected prize, upfront payment and urgency are warning signs. Pause before sharing money or information.",
    "caution": "",
    "takeaway": "Verify unexpected offers through an independent channel.",
    "numeric": false
  },
  {
    "id": "safe-sender",
    "topic": "Staying safe",
    "title": "A familiar sender name",
    "prompt": "A text displays your bank’s name. Does that prove the message is genuine?",
    "note": "Fictional learning example; amounts and terms are illustrative.",
    "choices": [
      "Yes, names cannot be copied",
      "No, the displayed name is not proof",
      "Yes, if it uses the bank logo"
    ],
    "correct": 1,
    "success": "You worked it out.",
    "explanation": "Displayed names and branding can be imitated. Check unusual requests independently.",
    "caution": "",
    "takeaway": "Open the organisation’s app or website yourself.",
    "numeric": false
  },
  {
    "id": "safe-pressure",
    "topic": "Staying safe",
    "title": "A deal that ends right now",
    "prompt": "An unknown seller pressures you to pay immediately and avoid discussing the purchase. What stands out?",
    "note": "Fictional learning example; amounts and terms are illustrative.",
    "choices": [
      "Pressure and secrecy",
      "A friendly greeting",
      "A colourful product photo"
    ],
    "correct": 0,
    "success": "You worked it out.",
    "explanation": "Pressure to act quickly or keep things secret is a reason to slow down and verify.",
    "caution": "",
    "takeaway": "Take time to check the seller and payment request.",
    "numeric": false
  },
  {
    "id": "safe-link",
    "topic": "Staying safe",
    "title": "An unexpected refund link",
    "prompt": "A message promises a refund through an unfamiliar link. How could you check it?",
    "note": "Fictional learning example; amounts and terms are illustrative.",
    "choices": [
      "Use the link because it says refund",
      "Open the official service yourself to check",
      "Reply with your password"
    ],
    "correct": 1,
    "success": "You worked it out.",
    "explanation": "Check the claim through a service you access independently, rather than through the unexpected message.",
    "caution": "",
    "takeaway": "Avoid entering account details through unexpected links.",
    "numeric": false
  },
  {
    "id": "debt-total",
    "topic": "Debt basics",
    "title": "Look beyond the weekly payment",
    "prompt": "An example loan has 20 repayments of $30 and no other fees. What is repaid in total?",
    "note": "Fictional learning example; amounts and terms are illustrative.",
    "choices": [
      "$300",
      "$600",
      "$900"
    ],
    "correct": 1,
    "success": "You worked it out.",
    "explanation": "20 × $30 = $600. This is the repayment total, not necessarily the amount originally borrowed.",
    "caution": "",
    "takeaway": "Compare the total repayment, term and fees.",
    "numeric": true
  },
  {
    "id": "debt-fee",
    "topic": "Debt basics",
    "title": "A fee changes the total",
    "prompt": "An example plan has $500 in repayments plus a separate $25 fee. What is the total cost paid?",
    "note": "Fictional learning example; amounts and terms are illustrative.",
    "choices": [
      "$475",
      "$500",
      "$525"
    ],
    "correct": 2,
    "success": "You worked it out.",
    "explanation": "$500 + $25 = $525. Always check whether quoted repayments include every fee.",
    "caution": "",
    "takeaway": "Read which charges are included before comparing offers.",
    "numeric": true
  },
  {
    "id": "debt-term",
    "topic": "Debt basics",
    "title": "Same payment, different term",
    "prompt": "Plan A is $20 for 10 weeks. Plan B is $20 for 15 weeks. With no other fees, which totals less?",
    "note": "Fictional learning example; amounts and terms are illustrative.",
    "choices": [
      "Plan A",
      "Plan B",
      "They are equal"
    ],
    "correct": 0,
    "success": "You worked it out.",
    "explanation": "Plan A totals $200; Plan B totals $300. The same weekly payment can hide different repayment totals.",
    "caution": "",
    "takeaway": "Compare the number of repayments as well as their size.",
    "numeric": false
  },
  {
    "id": "debt-terms",
    "topic": "Debt basics",
    "title": "Interest-free means check what?",
    "prompt": "An offer says interest-free. What else should you check?",
    "note": "Fictional learning example; amounts and terms are illustrative.",
    "choices": [
      "Fees, payment dates and what happens after the offer",
      "Only the headline",
      "Nothing else"
    ],
    "correct": 0,
    "success": "You worked it out.",
    "explanation": "Read the terms for fees, payment obligations and the end of the promotional period.",
    "caution": "",
    "takeaway": "Check the full terms of a promotion.",
    "numeric": false
  },
  {
    "id": "debt-due",
    "topic": "Debt basics",
    "title": "A repayment may be difficult",
    "prompt": "You think you may miss a repayment. What could help you understand your options?",
    "note": "Fictional learning example; amounts and terms are illustrative.",
    "choices": [
      "Ignore messages until later",
      "Contact the lender early and review your budget",
      "Assume the payment will disappear"
    ],
    "correct": 1,
    "success": "You worked it out.",
    "explanation": "Contact the provider to discuss the situation and available options. Review what you can afford; arrangements depend on the provider and circumstances.",
    "caution": "",
    "takeaway": "Keep repayment dates visible in your budget.",
    "numeric": false
  },
  {
    "id": "debt-compare",
    "topic": "Debt basics",
    "title": "Which comparison is useful?",
    "prompt": "Before borrowing, which information gives a fuller picture?",
    "note": "Fictional learning example; amounts and terms are illustrative.",
    "choices": [
      "Only the smallest weekly payment",
      "Total repayments, fees, term and affordability",
      "Only the provider’s advertisement"
    ],
    "correct": 1,
    "success": "You worked it out.",
    "explanation": "Consider the full cost and whether the repayments fit your circumstances. A smaller weekly amount alone does not tell the whole story.",
    "caution": "",
    "takeaway": "Compare more than the headline payment.",
    "numeric": false
  }
]];
