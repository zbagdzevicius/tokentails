export interface OgPage {
  file: string;
  title: string;
  description: string;
  /** null: no og:url (the page answers several addresses) */
  url: string | null;
  image: string;
}
export const PAGES: OgPage[];
export function pageHtml(template: string, p: OgPage): string;
