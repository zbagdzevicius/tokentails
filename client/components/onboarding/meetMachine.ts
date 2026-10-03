import type { StarterBreed } from "@/shared-contracts/enums";
import type { CatNameErrorCode } from "@/shared-contracts/name";
import { DEFAULT_STARTER, starterLook } from "./starters";

/**
 * Meet your cat as a pure state machine (plan G3 "Flow"), so the order of the steps, SKIP and the
 * commit outcomes are unit-tested without rendering:
 *
 *   loading -> awaits -> choose -> name -> reveal -> featured -> done
 *
 * - `loading`: the altar background only, never a lobby flash.
 * - `awaits`: "Your cat awaits…": the painted tabby crossfades to pixel Scout.
 * - `choose`: five starters, Scout preselected.
 * - `name`: the nameplate. REVEAL is refused while the name is invalid.
 * - `reveal`: "Meet {name}!" while the commit runs. The reveal cannot be left (CONTINUE, START,
 *   SKIP) until the commit has answered, so a NAME_* refusal is never lost: it goes back to `name`
 *   with the message. 409 STARTER_LOCKED and offline (draft kept) count as done; `failed` (nothing
 *   saved) offers RETRY and still lets the player go on.
 * - `featured`: "Real cats are waiting too", skippable; skipped by itself when there are none.
 * - `done`: the ceremony is over; `exit` says how (finished or skipped).
 *
 * SKIP works from every step before `done` and commits the default starter (`skipped: true`); at the
 * reveal it waits, like CONTINUE, for the commit to answer.
 */
export type MeetStep = "loading" | "awaits" | "choose" | "name" | "reveal" | "featured" | "done";

export const MEET_STEPS: ReadonlyArray<MeetStep> = [
  "loading",
  "awaits",
  "choose",
  "name",
  "reveal",
  "featured",
  "done",
];

export type CommitState = "idle" | "pending" | "committed" | "locked" | "offline" | "failed";

export interface MeetState {
  step: MeetStep;
  breed: StarterBreed;
  /** What the player typed (not yet normalised). */
  nameInput: string;
  /** The normalised name that was committed (or will be). */
  name: string | null;
  nameError: CatNameErrorCode | null;
  /** True once the player has tried to continue, so errors show while typing from then on. */
  nameTouched: boolean;
  commit: CommitState;
  /** null: still loading; [] means none, so the step is skipped. */
  featuredCount: number | null;
  exit: "finished" | "skipped" | null;
}

export type MeetAction =
  | { type: "LOADED" }
  | { type: "CONTINUE" }
  | { type: "SELECT"; breed: StarterBreed }
  | { type: "BACK" }
  | { type: "SET_NAME"; value: string; error: CatNameErrorCode | null }
  | { type: "SUBMIT_NAME"; name: string | null; error: CatNameErrorCode | null }
  | { type: "COMMIT_RESULT"; result: "committed" | "locked" | "offline" | "failed"; name?: string }
  | { type: "COMMIT_INVALID"; error: CatNameErrorCode }
  | { type: "FEATURED"; count: number }
  | { type: "START" }
  | { type: "RETRY" }
  | { type: "SKIP" };

export function initialMeetState(): MeetState {
  return {
    step: "loading",
    breed: DEFAULT_STARTER,
    nameInput: starterLook(DEFAULT_STARTER).name,
    name: null,
    nameError: null,
    nameTouched: false,
    commit: "idle",
    featuredCount: null,
    exit: null,
  };
}

/** Steps before the reveal, where BACK is offered. */
const BACK_FROM: Partial<Record<MeetStep, MeetStep>> = {
  choose: "awaits",
  name: "choose",
};

/** The reveal waits for the commit's answer before it can be left (review 4a #3). */
function revealLocked(state: MeetState): boolean {
  return state.step === "reveal" && state.commit === "pending";
}

function afterReveal(state: MeetState): MeetState {
  // The featured step only shows when there is something to show; while it is still loading the
  // step shows its own placeholder, and an empty answer later moves it to done.
  if (state.featuredCount === 0) return { ...state, step: "done", exit: "finished" };
  return { ...state, step: "featured" };
}

export function meetReducer(state: MeetState, action: MeetAction): MeetState {
  if (state.step === "done") return state;
  switch (action.type) {
    case "LOADED":
      return state.step === "loading" ? { ...state, step: "awaits" } : state;
    case "CONTINUE":
      if (state.step === "awaits") return { ...state, step: "choose" };
      if (state.step === "choose") return { ...state, step: "name" };
      if (state.step === "reveal") return revealLocked(state) ? state : afterReveal(state);
      return state;
    case "SELECT": {
      if (state.step !== "choose") return state;
      // Keep a name the player typed; replace the previous starter's default name.
      const previousDefault = starterLook(state.breed).name;
      const nameInput =
        state.nameInput.trim() === "" || state.nameInput === previousDefault
          ? starterLook(action.breed).name
          : state.nameInput;
      return { ...state, breed: action.breed, nameInput, nameError: null };
    }
    case "BACK": {
      const previous = BACK_FROM[state.step];
      return previous ? { ...state, step: previous } : state;
    }
    case "SET_NAME":
      if (state.step !== "name") return state;
      return {
        ...state,
        nameInput: action.value,
        // Errors appear once the player tried to continue; before that, typing is quiet.
        nameError: state.nameTouched ? action.error : null,
      };
    case "SUBMIT_NAME":
      if (state.step !== "name") return state;
      if (action.error || !action.name) {
        return { ...state, nameTouched: true, nameError: action.error ?? "NAME_TOO_SHORT" };
      }
      return { ...state, step: "reveal", name: action.name, nameError: null, nameTouched: true, commit: "pending" };
    case "COMMIT_INVALID":
      // The server refused the name (a reserved featured name, say): back to the nameplate.
      if (state.exit === "skipped") return state;
      return { ...state, step: "name", nameError: action.error, nameTouched: true, commit: "idle" };
    case "COMMIT_RESULT":
      return { ...state, commit: action.result, name: action.name ?? state.name };
    case "RETRY":
      // Only a failed save (nothing kept) is retried; offline already kept a draft.
      if (state.step !== "reveal" || state.commit !== "failed") return state;
      return { ...state, commit: "pending" };
    case "FEATURED": {
      const next = { ...state, featuredCount: action.count };
      if (state.step === "featured" && action.count === 0) return { ...next, step: "done", exit: "finished" };
      return next;
    }
    case "START":
      if (state.step !== "featured" && state.step !== "reveal") return state;
      if (revealLocked(state)) return state;
      return { ...state, step: "done", exit: "finished" };
    case "SKIP":
      // After the reveal the starter is already committed: SKIP just leaves the optional step.
      if (state.step === "reveal" || state.step === "featured") {
        if (revealLocked(state)) return state;
        return { ...state, step: "done", exit: "finished" };
      }
      return {
        ...state,
        step: "done",
        exit: "skipped",
        breed: DEFAULT_STARTER,
        name: starterLook(DEFAULT_STARTER).name,
        commit: "pending",
      };
    default:
      return state;
  }
}

/** The step's position for analytics and the progress dots (loading and done are not counted). */
export const VISIBLE_STEPS: ReadonlyArray<MeetStep> = ["awaits", "choose", "name", "reveal", "featured"];
