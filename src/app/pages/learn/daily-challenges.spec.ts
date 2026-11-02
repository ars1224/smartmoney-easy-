import { CHALLENGE_BANK } from './challenge-bank';
import { dailyQuestions, localDay, practiceQuestions, restoreProgress, TOPICS } from './daily-challenges';
describe('daily challenge selection', () => {
 it('has thirty valid unique questions and five topics', () => {
  expect(CHALLENGE_BANK.length).toBe(30);
  expect(new Set(CHALLENGE_BANK.map(q => q.id)).size).toBe(30);
  for (const q of CHALLENGE_BANK) { expect(q.correct).toBeGreaterThanOrEqual(0); expect(q.correct).toBeLessThan(q.choices.length); expect(new Set(q.choices).size).toBe(q.choices.length); expect(q.explanation.length).toBeGreaterThan(20); }
 });
 it('stays stable across refresh, mixes topics, avoids yesterday and rotates answer positions correctly', () => {
  for (let day = 1; day <= 28; day++) {
   const date = `2026-10-${String(day).padStart(2, '0')}`;
   const nextDate = `2026-10-${String(day + 1).padStart(2, '0')}`;
   const today = dailyQuestions(date), tomorrow = dailyQuestions(nextDate);
   expect(today).toEqual(dailyQuestions(date));
   expect(new Set(today.map(q => q.id)).size).toBe(5);
   expect(new Set(today.map(q => q.topic))).toEqual(new Set(TOPICS));
   expect(tomorrow.some(q => today.some(old => old.id === q.id))).toBe(false);
   for (const q of today) { const original = CHALLENGE_BANK.find(item => item.id === q.id)!; expect(q.choices[q.correct]).toBe(original.choices[original.correct]); }
  }
 });
 it('avoids daily and previous practice questions when making another practice round', () => {
  const daily = dailyQuestions('2026-10-27');
  const first = practiceQuestions(daily.map(q => q.id), 'one');
  const excluded = [...daily, ...first].map(q => q.id);
  const second = practiceQuestions(excluded, 'two');
  expect(second.some(q => excluded.includes(q.id))).toBe(false);
  expect(new Set(second.map(q => q.topic)).size).toBe(5);
 });
 it('discards corrupt, outdated and out-of-range saved values', () => {
  const day = '2026-10-27', questions = dailyQuestions(day);
  expect(restoreProgress('{bad', day, questions).answers).toEqual({});
  expect(restoreProgress(JSON.stringify({version:1,day:'2026-10-26',answers:{}}), day, questions).index).toBe(0);
  const state = restoreProgress(JSON.stringify({version:1,day,answers:{[questions[0].id]:0,[questions[1].id]:999,unknown:1},index:99,completed:true}),day,questions);
  expect(state.answers).toEqual({[questions[0].id]:0}); expect(state.index).toBe(0);
 });
 it('uses the browser calendar day rather than a UTC date string', () => {
  expect(localDay(new Date(2026, 9, 27, 0, 1))).toBe('2026-10-27');
 });
});
