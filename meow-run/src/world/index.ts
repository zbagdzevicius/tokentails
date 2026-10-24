// WORLD-ART lane entry. Registers the meadow, gorge and sunset themes (themes registry). Called once by main.ts.
// Also exports `cottage` (where Grandma's cottage, its door and the garden gate are) for the ending cutscene.
import { registerThemes } from './theme';

export { cottage } from './cottage';

export function registerWorld(): void {
  registerThemes();
}
