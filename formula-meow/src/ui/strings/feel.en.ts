/** The feel lane's strings (English). Registered from the lane's install file; every visible string goes through `t()`. */
/** Keys used by `ui/screens/settings.ts` (the feel lane's strings live here, not in CORE_EN; registered at boot). */
export const FEEL_KEYS = {
  smartSteer: 'Smart Steer',
  smartSteerHelp: 'Smart Steer nudges your touch steering away from the walls. Keys and gamepads are never changed.',
} as const;

export const FEEL_EN: Record<string, string> = {
  'LASER DOT INCOMING!': 'LASER DOT INCOMING!',
  // iteration 4 (F2): the touch steering assist's switch in Settings → Controls
  'Smart Steer': 'Smart Steer',
  'Smart Steer nudges your touch steering away from the walls. Keys and gamepads are never changed.':
    'Smart Steer nudges your touch steering away from the walls. Keys and gamepads are never changed.',
};
