/** UI public surface: overlay screens, input, touch controls, portraits and pure HUD helpers. */
export { createUI, type UI, type UIHandlers, type UIOptions, type ScreenName } from './ui';
export { createInput, stickToAxes, type InputController, type InputOptions, type ButtonName, type InputDevice } from './input';
export { createTouchControls, type TouchControls, type TouchOptions } from './touch';
export { createPortrait, drawPortrait, type PortraitOptions } from './portraits';
export { objectiveStage, objectiveText, activeHint, scoreBreakdown, pawRating, type ScoreBreakdown, type ObjectiveStage } from './logic';
export { ensureStyles } from './styles';
export { formatTime, hashHex, prefersReducedMotion } from './dom';
