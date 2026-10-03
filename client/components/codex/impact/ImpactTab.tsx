import { currentAccessToken } from "@/api/api";
import { fetchDonateRail } from "@/api/impact-api";
import {
  currentGoal,
  deliveredGoals,
  fetchGoals,
  fetchMyGives,
  GOALS_QUERY_KEY,
  maxGive,
  MY_GIVES_QUERY_KEY,
  newPledgeId,
  pledgeWithRetry,
  type PledgeOutcome,
  type RescueGoal,
} from "@/api/rescue-goals-api";
import { analytics, buildEvent } from "@/analytics";
import { isAppBuild } from "@/components/claims/build";
import { partnerShelterName } from "@/components/impact/live";
import { pawView } from "@/components/impact/pawView";
import { DONATE_RAIL_QUERY_KEY, IMPACT_ME_QUERY_KEY, useImpactMe } from "@/components/impact/useImpactMe";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { useImpact } from "@/hooks/useImpact";
import { useAccountAction, useLatest } from "@/hooks/useAccountAction";
import { formatTails, TAILS_DEFINITION, TAILS_NO_CASH_VALUE } from "@/shared-contracts/copy";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { SeasonBand } from "../SeasonBand";
import type { SeasonTimes } from "../season";
import { DeliveredStrip } from "./DeliveredStrip";
import { GiveSheet, pledgeProblem } from "./GiveSheet";
import { MyImpact } from "./MyImpact";
import { giveOptions, RescueGoalCard, type GiveChip, type GoalsLoad } from "./RescueGoalCard";
import { TodaysPaw } from "./TodaysPaw";
import { fetchDonateMe, sendTreat, treatSentStatus, treatState, type TreatSend } from "./treat";
import { TreatCard } from "./TreatCard";

/** The paw and treat partner when the snapshot names none yet (the G4 copy names Pink Paw). */
export const IMPACT_PARTNER_FALLBACK = "Pink Paw";
export const DONATE_ME_QUERY_KEY = "donate-me";

interface GiveDraft {
  goal: RescueGoal;
  amount: number;
  /** The give's UUID, made when the sheet opened; every retry re-sends it. */
  pledgeId: string;
  problem: string | null;
  canRetry: boolean;
  /** The give was refused or returned and the same give cannot go through: the sheet only closes. */
  final: boolean;
}

/**
 * The IMPACT tab, PROGRESS's default (plan G5 "PROGRESS restructure", G4 "IMPACT tab"):
 * season band, the current Rescue Goal with 100 / 1,000 / MAX and a confirm sheet, the treat card,
 * today's paw, MY IMPACT and the DELIVERED strip.
 *
 * Guests see everything and are asked to save their cat when they act; they never give or send
 * (F5.4). App builds read the app surface of goals (no tx hashes) and show no chain words.
 */
export const ImpactTab = ({ season, seasonLoading }: { season: SeasonTimes | null; seasonLoading: boolean }) => {
  const isApp = isAppBuild();
  const surface = isApp ? "app" : "web";
  const queryClient = useQueryClient();
  const showToast = useToast();
  const { profile, setProfileUpdate } = useProfile();
  const { runWithAccount } = useAccountAction();
  const latest = useLatest({ profile, setProfileUpdate });
  const { viewer, me: impactMe, loading: impactLoading } = useImpactMe();
  const { impact } = useImpact();
  const registered = viewer === "registered" && !!profile?._id;

  const goalsQuery = useQuery({
    queryKey: [GOALS_QUERY_KEY, surface],
    queryFn: async ({ signal }) => {
      const goals = await fetchGoals({ status: "current", surface, signal });
      if (!goals) throw new Error("rescue goals unavailable");
      return goals;
    },
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const givesQuery = useQuery({
    queryKey: [MY_GIVES_QUERY_KEY, profile?._id ?? null],
    queryFn: ({ signal }) => fetchMyGives({ signal, token: currentAccessToken() }),
    enabled: registered,
    staleTime: 15_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  // Same key and reader as the lobby (useDonateRail), so the rail is read once.
  const railQuery = useQuery({
    queryKey: [DONATE_RAIL_QUERY_KEY],
    queryFn: ({ signal }) => fetchDonateRail({ signal }),
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const donateMeQuery = useQuery({
    queryKey: [DONATE_ME_QUERY_KEY, profile?._id ?? null],
    queryFn: ({ signal }) => fetchDonateMe({ signal, token: currentAccessToken() }),
    enabled: registered,
    staleTime: 15_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const goals = goalsQuery.data ?? [];
  const goal = currentGoal(goals);
  const delivered = deliveredGoals(goals);
  const goalsLoad: GoalsLoad = goalsQuery.isError ? "error" : goalsQuery.isPending ? "loading" : "ready";
  const gives = registered ? givesQuery.data ?? null : null;
  const treatPartner = partnerShelterName(impact) ?? IMPACT_PARTNER_FALLBACK;

  // ---------------------------------------------------------------- impact_tab_viewed, once
  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    analytics.track(buildEvent("impact_tab_viewed", {}));
  }, []);

  // ---------------------------------------------------------------- gives
  // The draft outlives the sheet's close, so the dialog closes through `open` (see TailsExplainer).
  const [draft, setDraft] = useState<GiveDraft | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [giving, setGiving] = useState(false);

  const refreshGives = () => {
    void queryClient.invalidateQueries({ queryKey: [GOALS_QUERY_KEY] });
    void queryClient.invalidateQueries({ queryKey: [MY_GIVES_QUERY_KEY] });
  };

  /** The account's gives, read now (a guest who just signed in has no cached view). Null when the read fails. */
  const readGives = async (staleTime: number) => {
    try {
      return await queryClient.fetchQuery({
        queryKey: [MY_GIVES_QUERY_KEY, latest.current.profile?._id ?? null],
        queryFn: ({ signal }) => fetchMyGives({ signal, token: currentAccessToken() }),
        staleTime,
      });
    } catch {
      return null;
    }
  };

  const pick = (chip: GiveChip) => {
    if (!goal) return;
    const pending = draft;
    void runWithAccount("save-progress", async () => {
      // An interrupted give may have reached Token Tails, and the balance refreshed on close would
      // then already be lower (MAX shrinks, a chip may no longer fit). Whatever chip was tapped, the
      // sheet re-offers that same give with its id: the backend replays it if it went through, so
      // the player sees it counted and is never asked for a second give by accident.
      if (pending?.canRetry && !pending.final && pending.goal.id === goal.id) {
        setDraft({ ...pending, goal });
        setSheetOpen(true);
        return;
      }
      // The chips a guest saw were a guest's: after a sign-in the account decides what can be given
      // (a new account waits three days, and giving may not be open yet).
      const fresh = await readGives(15_000);
      const options = giveOptions(goal, "registered", fresh);
      const option = options.chips.find((c) => c.key === chip.key);
      if (!option?.enabled || !option.amount) {
        showToast({
          message:
            options.note ??
            (fresh
              ? "You don't have enough Tails to give yet. Play a run and come back."
              : "Could not check your Tails right now. Try again in a moment."),
          isError: true,
        });
        return;
      }
      setDraft({ goal, amount: option.amount, pledgeId: newPledgeId(), problem: null, canRetry: false, final: false });
      setSheetOpen(true);
    });
  };

  const closeSheet = () => {
    setSheetOpen(false);
    // An interrupted give may have gone through: show the balance and the goal as they are now.
    if (draft?.canRetry) refreshGives();
  };

  /** The most this account can still give to the goal, read now; 0 when nothing fits. */
  const roomNow = async (goalId: string): Promise<{ goal: RescueGoal; max: number } | null> => {
    try {
      const fresh = await queryClient.fetchQuery({
        queryKey: [GOALS_QUERY_KEY, surface],
        queryFn: async ({ signal }) => {
          const list = await fetchGoals({ status: "current", surface, signal });
          if (!list) throw new Error("rescue goals unavailable");
          return list;
        },
        staleTime: 0,
      });
      const next = fresh.find((g) => g.id === goalId);
      if (!next) return null;
      return { goal: next, max: maxGive(next, await readGives(0)) };
    } catch {
      return null;
    }
  };

  const confirm = async () => {
    if (!draft || !sheetOpen || giving || draft.final) return;
    setGiving(true);
    let outcome: PledgeOutcome;
    let smaller: { goal: RescueGoal; max: number } | null = null;
    try {
      outcome = await pledgeWithRetry({ goalId: draft.goal.id, amount: draft.amount, pledgeId: draft.pledgeId });
      if (outcome.kind === "refused" && outcome.code === "GOAL_OVERFLOW") smaller = await roomNow(draft.goal.id);
    } finally {
      setGiving(false);
    }
    if (outcome.kind === "signed-out") {
      setSheetOpen(false);
      void runWithAccount("save-progress", () => undefined);
      return;
    }
    if (outcome.kind === "given") {
      analytics.track(buildEvent("pledge_made", {}));
      latest.current.setProfileUpdate({ tails: outcome.receipt.balance });
      showToast({
        message: `You gave ${formatTails(outcome.receipt.amount)} to ${draft.goal.title}. Your rank stays the same.`,
        symbol: "tails",
      });
      setSheetOpen(false);
      refreshGives();
      return;
    }
    if (outcome.kind === "interrupted") {
      // The retry re-sends the same id, so the give is never counted twice.
      setDraft((d) => (d ? { ...d, problem: pledgeProblem(outcome), canRetry: true, final: false } : d));
      return;
    }
    // Refused or returned: the same give would be refused again. Only a goal that needs fewer Tails
    // than asked offers a smaller give, as a new give with a new id.
    if (smaller && smaller.max > 0 && smaller.max < draft.amount) {
      const offer = smaller;
      setDraft({
        goal: offer.goal,
        amount: offer.max,
        pledgeId: newPledgeId(),
        problem: `This goal needs fewer Tails than that. You can give ${formatTails(offer.max)} instead.`,
        canRetry: false,
        final: false,
      });
    } else {
      setDraft((d) => (d ? { ...d, problem: pledgeProblem(outcome), canRetry: false, final: true } : d));
    }
    refreshGives();
  };

  // ---------------------------------------------------------------- treats
  const [send, setSend] = useState<TreatSend | null>(null);
  const [sending, setSending] = useState(false);
  const treat = treatState({
    viewer,
    rail: railQuery.data ?? null,
    railLoaded: !railQuery.isPending,
    me: registered ? donateMeQuery.data ?? null : null,
    meLoaded: !registered || !donateMeQuery.isPending,
    send,
  });

  const sendNow = async () => {
    if (sending) return;
    setSending(true);
    let result: TreatSend;
    try {
      result = await sendTreat();
    } finally {
      setSending(false);
    }
    analytics.track(buildEvent("treat_sent", { status: treatSentStatus(result) }));
    if (result.kind === "signed-out") {
      void runWithAccount("give-treat", () => undefined);
      return;
    }
    if (result.kind === "retry") {
      showToast({ message: "Could not reach Token Tails. Check your connection and try again.", isError: true });
      return;
    }
    setSend(result);
    void queryClient.invalidateQueries({ queryKey: [DONATE_RAIL_QUERY_KEY] });
    void queryClient.invalidateQueries({ queryKey: [DONATE_ME_QUERY_KEY] });
    void queryClient.invalidateQueries({ queryKey: [IMPACT_ME_QUERY_KEY] });
  };
  const saveCat = () => void runWithAccount("give-treat", () => undefined);

  // ---------------------------------------------------------------- paws
  const paw = pawView(viewer, impactMe, impactLoading);
  const treatsConfirmed = donateMeQuery.data?.confirmedCount ?? impactMe?.treats.confirmedCount ?? 0;

  return (
    <div className="flex w-full flex-col gap-3" data-testid="impact-tab">
      <SeasonBand season={season} loading={seasonLoading} />
      <div className="grid w-full grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <RescueGoalCard
          load={goalsLoad}
          goal={goal}
          viewer={viewer}
          gives={gives}
          onPick={pick}
          onRetry={() => void goalsQuery.refetch()}
          isApp={isApp}
        />
        <TreatCard
          state={treat}
          partner={treatPartner}
          busy={sending}
          onSend={() => void sendNow()}
          onSave={saveCat}
          impact={impact}
          isApp={isApp}
        />
        <TodaysPaw view={paw} partner={treatPartner} settlementSends={!!impact?.pawSettlements.sendEnabled} isApp={isApp} />
        <MyImpact
          viewer={viewer}
          paws={paw.lifetime}
          treatsConfirmed={treatsConfirmed}
          gives={gives}
          isApp={isApp}
        />
        <DeliveredStrip goals={delivered} isApp={isApp} />
      </div>
      <p className="px-1 text-center font-secondary text-p6 leading-snug text-tt-muted" data-testid="tails-small-print">
        {TAILS_DEFINITION} {TAILS_NO_CASH_VALUE}
      </p>
      {draft && (
        <GiveSheet
          open={sheetOpen}
          goal={draft.goal}
          amount={draft.amount}
          busy={giving}
          problem={draft.problem}
          canRetry={draft.canRetry}
          final={draft.final}
          onConfirm={() => void confirm()}
          onClose={closeSheet}
        />
      )}
    </div>
  );
};

export default ImpactTab;
