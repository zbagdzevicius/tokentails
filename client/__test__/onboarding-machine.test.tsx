import { initialMeetState, meetReducer, type MeetAction, type MeetState } from "@/components/onboarding/meetMachine";
import { StarterBreed } from "@/shared-contracts/enums";
import { ErrorCode } from "@/shared-contracts/errors";

/** Meet your cat step machine (plan G3 "Flow"). */

const run = (actions: MeetAction[], from: MeetState = initialMeetState()) => actions.reduce(meetReducer, from);

describe("Meet your cat step machine", () => {
  it("starts on the altar loading state with Scout preselected", () => {
    const state = initialMeetState();
    expect(state.step).toBe("loading");
    expect(state.breed).toBe(StarterBreed.SCOUT);
    expect(state.nameInput).toBe("Scout");
    expect(state.commit).toBe("idle");
  });

  it("walks loading, awaits, choose, name, reveal, featured, done in order", () => {
    let state = initialMeetState();
    const seen: string[] = [state.step];
    for (const action of [
      { type: "LOADED" },
      { type: "CONTINUE" },
      { type: "SELECT", breed: StarterBreed.MISTY },
      { type: "CONTINUE" },
      { type: "SET_NAME", value: "Nimbus", error: null },
      { type: "SUBMIT_NAME", name: "Nimbus", error: null },
      { type: "COMMIT_RESULT", result: "committed", name: "Nimbus" },
      { type: "FEATURED", count: 3 },
      { type: "CONTINUE" },
      { type: "START" },
    ] as MeetAction[]) {
      state = meetReducer(state, action);
      if (seen[seen.length - 1] !== state.step) seen.push(state.step);
    }
    expect(seen).toEqual(["loading", "awaits", "choose", "name", "reveal", "featured", "done"]);
    expect(state).toMatchObject({ exit: "finished", breed: StarterBreed.MISTY, name: "Nimbus", commit: "committed" });
  });

  it("selecting another starter replaces the default name but keeps a typed one", () => {
    let state = run([{ type: "LOADED" }, { type: "CONTINUE" }, { type: "SELECT", breed: StarterBreed.PINKIE }]);
    expect(state.nameInput).toBe("Pinkie");
    state = run([{ type: "CONTINUE" }, { type: "SET_NAME", value: "Nimbus", error: null }, { type: "BACK" }], state);
    expect(state.step).toBe("choose");
    state = meetReducer(state, { type: "SELECT", breed: StarterBreed.SUNNY });
    expect(state.nameInput).toBe("Nimbus");
  });

  it("an invalid name keeps the nameplate open and shows its error", () => {
    const atName = run([{ type: "LOADED" }, { type: "CONTINUE" }, { type: "CONTINUE" }]);
    // Typing is quiet until the first try.
    const typing = meetReducer(atName, { type: "SET_NAME", value: "x", error: ErrorCode.NAME_TOO_SHORT });
    expect(typing.nameError).toBeNull();
    const tried = meetReducer(typing, { type: "SUBMIT_NAME", name: null, error: ErrorCode.NAME_TOO_SHORT });
    expect(tried.step).toBe("name");
    expect(tried.nameError).toBe(ErrorCode.NAME_TOO_SHORT);
    expect(tried.commit).toBe("idle");
    // From then on errors follow the input live.
    const fixed = meetReducer(tried, { type: "SET_NAME", value: "Nimbus", error: null });
    expect(fixed.nameError).toBeNull();
  });

  it("a name refused by the server goes back to the nameplate", () => {
    const revealing = run([
      { type: "LOADED" },
      { type: "CONTINUE" },
      { type: "CONTINUE" },
      { type: "SUBMIT_NAME", name: "Kretis", error: null },
    ]);
    expect(revealing).toMatchObject({ step: "reveal", commit: "pending" });
    const refused = meetReducer(revealing, { type: "COMMIT_INVALID", error: ErrorCode.NAME_RESERVED });
    expect(refused).toMatchObject({ step: "name", nameError: ErrorCode.NAME_RESERVED, commit: "idle" });
  });

  it("409 STARTER_LOCKED counts as done", () => {
    const state = run([
      { type: "LOADED" },
      { type: "CONTINUE" },
      { type: "CONTINUE" },
      { type: "SUBMIT_NAME", name: "Nimbus", error: null },
      { type: "COMMIT_RESULT", result: "locked" },
      { type: "FEATURED", count: 3 },
      { type: "CONTINUE" },
      { type: "START" },
    ]);
    expect(state).toMatchObject({ step: "done", exit: "finished", commit: "locked" });
  });

  it.each(["loading", "awaits", "choose", "name"] as const)("SKIP from %s commits the default starter", (step) => {
    const path: Record<string, MeetAction[]> = {
      loading: [],
      awaits: [{ type: "LOADED" }],
      choose: [{ type: "LOADED" }, { type: "CONTINUE" }, { type: "SELECT", breed: StarterBreed.SHADOW }],
      name: [
        { type: "LOADED" },
        { type: "CONTINUE" },
        { type: "SELECT", breed: StarterBreed.SHADOW },
        { type: "CONTINUE" },
        { type: "SET_NAME", value: "Nimbus", error: null },
      ],
    };
    const before = run(path[step]);
    expect(before.step).toBe(step);
    const skipped = meetReducer(before, { type: "SKIP" });
    expect(skipped).toMatchObject({
      step: "done",
      exit: "skipped",
      breed: StarterBreed.SCOUT,
      name: "Scout",
      commit: "pending",
    });
  });

  it("SKIP after the reveal only leaves the optional step: the starter stays committed", () => {
    const featured = run([
      { type: "LOADED" },
      { type: "CONTINUE" },
      { type: "SELECT", breed: StarterBreed.MISTY },
      { type: "CONTINUE" },
      { type: "SUBMIT_NAME", name: "Nimbus", error: null },
      { type: "COMMIT_RESULT", result: "committed", name: "Nimbus" },
      { type: "CONTINUE" },
    ]);
    expect(featured.step).toBe("featured");
    const skipped = meetReducer(featured, { type: "SKIP" });
    expect(skipped).toMatchObject({ step: "done", exit: "finished", breed: StarterBreed.MISTY, name: "Nimbus", commit: "committed" });
  });

  it("skips the featured step when there are no real cats to show", () => {
    const revealed = run([
      { type: "FEATURED", count: 0 },
      { type: "LOADED" },
      { type: "CONTINUE" },
      { type: "CONTINUE" },
      { type: "SUBMIT_NAME", name: "Nimbus", error: null },
      { type: "COMMIT_RESULT", result: "committed", name: "Nimbus" },
    ]);
    expect(meetReducer(revealed, { type: "CONTINUE" })).toMatchObject({ step: "done", exit: "finished" });
    // An empty answer that arrives while the step is showing also ends it.
    const waiting = run([
      { type: "LOADED" },
      { type: "CONTINUE" },
      { type: "CONTINUE" },
      { type: "SUBMIT_NAME", name: "Nimbus", error: null },
      { type: "COMMIT_RESULT", result: "committed", name: "Nimbus" },
      { type: "CONTINUE" },
    ]);
    expect(waiting.step).toBe("featured");
    expect(meetReducer(waiting, { type: "FEATURED", count: 0 })).toMatchObject({ step: "done" });
  });

  describe("the reveal waits for the commit's answer (review 4a #3)", () => {
    const atReveal = (featured = 0) =>
      run([
        { type: "FEATURED", count: featured },
        { type: "LOADED" },
        { type: "CONTINUE" },
        { type: "CONTINUE" },
        { type: "SUBMIT_NAME", name: "Nimbus", error: null },
      ]);

    it("CONTINUE, START and SKIP do nothing while the commit is pending", () => {
      const pending = atReveal();
      expect(pending).toMatchObject({ step: "reveal", commit: "pending" });
      for (const action of [{ type: "CONTINUE" }, { type: "START" }, { type: "SKIP" }] as MeetAction[]) {
        expect(meetReducer(pending, action)).toBe(pending);
      }
    });

    it("a NAME_* refusal after an early CONTINUE still reaches the nameplate", () => {
      // With no featured cats, CONTINUE used to end the ceremony before the answer came back.
      const pending = meetReducer(atReveal(0), { type: "CONTINUE" });
      expect(pending.step).toBe("reveal");
      const refused = meetReducer(pending, { type: "COMMIT_INVALID", error: ErrorCode.NAME_BLOCKED });
      expect(refused).toMatchObject({ step: "name", nameError: ErrorCode.NAME_BLOCKED, commit: "idle" });
    });

    it("COMMIT_INVALID arriving after done changes nothing", () => {
      const done = run([{ type: "COMMIT_RESULT", result: "committed", name: "Nimbus" }, { type: "CONTINUE" }], atReveal(0));
      expect(done.step).toBe("done");
      expect(meetReducer(done, { type: "COMMIT_INVALID", error: ErrorCode.NAME_BLOCKED })).toBe(done);
    });

    it("offline counts as done; failed offers RETRY and still lets the player go on", () => {
      const offline = meetReducer(atReveal(0), { type: "COMMIT_RESULT", result: "offline" });
      expect(meetReducer(offline, { type: "CONTINUE" })).toMatchObject({ step: "done", exit: "finished" });
      const failed = meetReducer(atReveal(0), { type: "COMMIT_RESULT", result: "failed" });
      expect(meetReducer(failed, { type: "RETRY" })).toMatchObject({ step: "reveal", commit: "pending" });
      expect(meetReducer(failed, { type: "CONTINUE" })).toMatchObject({ step: "done", exit: "finished" });
      // RETRY only means something after a failure.
      expect(meetReducer(offline, { type: "RETRY" })).toBe(offline);
    });
  });

  it("ignores everything once done", () => {
    const done = run([{ type: "SKIP" }]);
    for (const action of [{ type: "LOADED" }, { type: "CONTINUE" }, { type: "BACK" }, { type: "SKIP" }] as MeetAction[]) {
      expect(meetReducer(done, action)).toBe(done);
    }
  });
});
