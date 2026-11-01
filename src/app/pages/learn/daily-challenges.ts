import { CHALLENGE_BANK, ChallengeQuestion } from './challenge-bank';
export const DAILY_KEY = 'smartmoney.learn.daily.v1';
export const TOPICS = ['Budgeting', 'Saving', 'Spending', 'Staying safe', 'Debt basics'];
export function localDay(date = new Date()): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function hash(value: string): number { let h = 2166136261; for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
export function shuffled<T>(items: T[], seed: string): T[] {
 const result = [...items]; let state = hash(seed) || 1;
 const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
 for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; } return result;
}
function orderChoices(q: ChallengeQuestion, seed: string): ChallengeQuestion {
 // The scam story has fixed message labels and highlights. Keep those two positions stable.
 if (q.id === 'scam') return q;
 const order = shuffled(q.choices.map((_, i) => i), seed + q.id);
 return { ...q, choices: order.map(i => q.choices[i]), correct: order.indexOf(q.correct) };
}
export function dailyQuestions(day: string): ChallengeQuestion[] {
 const ordinal = Math.floor(Date.parse(day + 'T00:00:00Z') / 86400000);
 const selected = TOPICS.map(topic => {
   const pool = shuffled(CHALLENGE_BANK.filter(q => q.topic === topic), 'bank-v1-' + topic);
   return pool[((ordinal % pool.length) + pool.length) % pool.length];
 });
 return shuffled(selected, day).map(q => orderChoices(q, day));
}
export function practiceQuestions(excluded: string[], seed: string): ChallengeQuestion[] {
 return shuffled(TOPICS.map(topic => {
  const pool = CHALLENGE_BANK.filter(q => q.topic === topic);
  const fresh = pool.filter(q => !excluded.includes(q.id));
  return shuffled(fresh.length ? fresh : pool, seed + topic)[0];
 }), seed).map(q => orderChoices(q, seed));
}
export interface DailyProgress { version: 1; day: string; answers: Record<string, number>; index: number; completed: boolean }
export function restoreProgress(raw: string | null, day: string, questions: ChallengeQuestion[]): DailyProgress {
 const clean: DailyProgress = { version: 1, day, answers: {}, index: 0, completed: false };
 try {
  const data = JSON.parse(raw ?? 'null');
  if (!data || data.version !== 1 || data.day !== day || !data.answers || typeof data.answers !== 'object') return clean;
  for (const q of questions) { const value = data.answers[q.id]; if (Number.isInteger(value) && value >= 0 && value < q.choices.length) clean.answers[q.id] = value; }
  clean.index = Number.isInteger(data.index) && data.index >= 0 && data.index < questions.length ? data.index : 0;
  clean.completed = data.completed === true;
 } catch { /* Ignore unavailable or invalid browser storage. */ }
 return clean;
}
