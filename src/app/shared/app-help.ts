// Public app instructions shared at build time with the backend. No user data or secrets.
import content from '../../../backend/app/content/app-help.json';

export interface AppHelpLink { page: string; label: string; }
export interface AppHelpPage { label: string; route: string; }
export interface AppHelpStep { id: string; title: string; body: string; links: AppHelpLink[]; }
export interface AppHelpQuestion { id: string; title: string; paragraphs: string[]; links: AppHelpLink[]; action?: string; }
interface AppHelpContent {
  title: string; intro: string; developmentNote: string; returnNote: string;
  pages: Record<string, AppHelpPage>; steps: AppHelpStep[]; questions: AppHelpQuestion[];
}
export const APP_HELP: AppHelpContent = content;

// Resolve IDs to trusted local navigation. Never render provider-supplied URLs or labels.
export function resolveAppHelpLinks(value: unknown): AppHelpPage[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap(item => {
    const id: unknown = item?.id;
    if (typeof id !== 'string' || !Object.hasOwn(APP_HELP.pages, id) || seen.has(id)) return [];
    seen.add(id);
    return [APP_HELP.pages[id]];
  }).slice(0, 8);
}
