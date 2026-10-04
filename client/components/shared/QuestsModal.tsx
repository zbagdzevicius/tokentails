import { QUEST_API } from "@/api/quest-api";
import { REWARDS } from "@/constants/rewards";
import { cdnFile } from "@/constants/utils";
import { GameModal } from "@/components/ui/GameModal";
import { useAccountAction, useLatest } from "@/hooks/useAccountAction";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { allQuests, ILocalQuest, QuestType } from "@/models/quest";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { LeaderboardContent } from "../Leaderboard";
import { LeaderboardCatnipContent } from "../LeaderboardCatnip";
import { PixelIcon } from "./PixelIcon";
import {
  EmptyState,
  ModalButton,
  ModalSection,
  ModalStack,
  ModalTabPanel,
  type ModalTab,
} from "@/components/ui/modal";
import { HintedTabs } from "@/components/ui/modal/HintedTabs";
import clsx from "clsx";
import { LeaderboardRescuerContent } from "../LeaderboardRescuer";
import { formatTails } from "@/shared-contracts/copy";

export const TrailheadsData = [
  {
    name: "beaver",
    icon: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/BEAVER/base/RUNNING.gif",
  },
  {
    name: "fox",
    icon: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/FOX/base/IDLE.gif",
  },
  {
    name: "goat",
    icon: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/GOAT/base/JUMPING.gif",
  },
  {
    name: "owl",
    icon: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/OWL/bandage/RUNNING.gif",
  },
  {
    name: "moose",
    icon: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/MOOSE/base/JUMPING.gif",
  },
  {
    name: "raccoon",
    icon: "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/RACCON/base/WALKING.gif",
  },
];

export const TrailheadsTypes = TrailheadsData.map(
  (trailhead) => trailhead.name
);

export const QuestsModalContent = () => {
  const { profile, setProfileUpdate, utils } = useProfile();
  const [questsType, setQuestsType] = useState(QuestType.SOCIAL);
  const { data: partnerQuests } = useQuery({
    queryKey: ["quests"],
    queryFn: () => QUEST_API.find(),
  });
  // Snapshot on purpose: a quest completed while the modal is open stays in
  // the list with a check mark instead of disappearing, so profile.quests is
  // deliberately left out of the dependencies.
  /* eslint-disable react-hooks/preserve-manual-memoization, react-hooks/exhaustive-deps */
  const quests = useMemo(
    () =>
      [...(partnerQuests || []), ...allQuests].filter(
        (quest) => !profile?.quests?.includes?.(quest.key)
      ),
    [partnerQuests]
  );
  /* eslint-enable react-hooks/preserve-manual-memoization, react-hooks/exhaustive-deps */
  const toast = useToast();

  const { shareUrl } = useProfile();
  // Quest claims and the referral link are account actions (decision #9): a guest gets the
  // AuthSheet first. The referral link only exists for an account, so it is read after sign-in.
  const { runWithAccount, isRegistered, hasAuth } = useAccountAction();
  const latest = useLatest({ profile, setProfileUpdate, shareUrl, utils });

  // The share sheet (`navigator.share`) and `window.open` need the tap's user activation, which
  // has expired once the AuthSheet closed (plan G9). So an account shares at once and a guest, once
  // signed in, is asked to tap again.
  const onInvite = () => {
    if (isRegistered || !hasAuth) {
      if (shareUrl) utils?.shareURL(shareUrl);
      return;
    }
    void runWithAccount("share", () =>
      toast({ message: "You're signed in. Tap GET INVITE LINK again to share it." })
    );
  };

  const complete = async (quest: ILocalQuest) => {
    const result = await QUEST_API.complete(quest.key);
    toast({ message: result.message });
    if (result.success) {
      const { profile: current, setProfileUpdate } = latest.current;
      setProfileUpdate({ quests: [...(current?.quests || []), quest.key] });
    }
  };

  const claim = useDebouncedCallback((quest: ILocalQuest) => {
    void runWithAccount("claim-rewards", () => complete(quest));
  }, 200);
  // The partner link opens straight from the tap (popup blockers); only the claim is debounced
  // and needs an account.
  const redeem = (quest: ILocalQuest) => {
    if (quest.link) {
      utils?.openLink(quest.link);
    }
    claim(quest);
  };

  // QUESTS first: it is the one tab you act on; the three boards follow.
  const tabs: ModalTab<QuestType>[] = [
    { id: QuestType.SOCIAL, label: "QUESTS", icon: "target", badge: quests.length || undefined },
    { id: QuestType.WIN, label: "TAILS", icon: "coins" },
    { id: QuestType.CATNIP, label: "CATNIP", icon: "zap" },
    { id: QuestType.RESCUE, label: "RESCUERS", icon: "heart" },
  ];

  /** "1,000 / 10,000" for a count quest, from the profile number it tracks. */
  const goalProgress = (quest: ILocalQuest) => {
    if (!quest.goal) return null;
    const have = quest.goal.metric === "tails" ? profile?.tails ?? 0 : profile?.referralsCount ?? 0;
    return {
      have: Math.min(have, quest.goal.target),
      target: quest.goal.target,
      reached: have >= quest.goal.target,
      unit: quest.goal.metric,
    };
  };

  return (
    <div className="flex flex-col gap-4 pb-2 text-tt-cream animate-appear motion-reduce:animate-none short:gap-3">
      <HintedTabs
        tabs={tabs}
        value={questsType}
        onChange={setQuestsType}
        label="Event lists"
        idBase="events"
        fadeFrom="from-tt-night-800"
        className="md:[&_[role=tab]]:text-p4"
      />
      <ModalTabPanel idBase="events" id={questsType} className="flex flex-col gap-4 short:gap-3">
        {questsType === QuestType.SOCIAL && (
          <ModalStack>
            <ModalSection
              tone="highlight"
              title="Invite a friend"
              icon="users"
              helper="Share your link. When your friend joins, you both get Tails."
            >
              <div className="grid grid-cols-2 gap-3 short:gap-2">
                <div className="flex items-center gap-2 bg-tt-night-950/45 p-3">
                  <img alt="" aria-hidden="true" draggable={false} className="h-8 w-8 object-contain" src={cdnFile("logo/logo.webp")} />
                  <div className="min-w-0">
                    <p className="font-sans text-p6 font-extrabold uppercase tracking-wider text-tt-muted">For you</p>
                    <p className="font-primary text-p4 leading-none text-tt-gold-400">{formatTails(REWARDS.INVITE_FRIEND)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-tt-night-950/45 p-3">
                  <img
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    className="h-8 w-8 object-contain"
                    src={cdnFile("icons/invites/gift-coin.png")}
                  />
                  <div className="min-w-0">
                    <p className="font-sans text-p6 font-extrabold uppercase tracking-wider text-tt-muted">For your friend</p>
                    <p className="font-primary text-p4 leading-none text-tt-gold-400">{formatTails(REWARDS.INVITE_FRIEND)}</p>
                  </div>
                </div>
              </div>
              <p className="font-sans text-p6 font-semibold text-tt-cream md:text-p5">
                Play side by side and earn daily paws together.
              </p>
              <ModalButton variant="primary" icon="share" fullWidth onClick={onInvite}>
                GET INVITE LINK
              </ModalButton>
            </ModalSection>

            <ModalSection
              title="Quests"
              icon="target"
              helper="Quick one-time tasks. Tap one to do it; its Tails come once it is done."
            >
              {quests.length === 0 ? (
                <EmptyState compact icon="check" title="All quests done" body="New quests show up here. Check back soon." />
              ) : (
                <ul className="flex flex-col gap-2">
                  {quests.map((quest) => {
                    const done = !!profile?.quests?.includes(quest.key);
                    const progress = goalProgress(quest);
                    const detailId = `quest-${quest.key ?? quest.name}`.replace(/[^a-zA-Z0-9_-]/g, "-");
                    return (
                      <li key={quest.name}>
                        <button
                          type="button"
                          onClick={() => redeem(quest)}
                          aria-label={quest.name}
                          aria-describedby={detailId}
                          className={clsx(
                            "group flex min-h-[56px] w-full items-center gap-3 p-2 pr-2 text-left",
                            "outline-none focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[2px] focus-visible:outline-tt-gold-400",
                            "transition-colors duration-150 motion-reduce:transition-none",
                            done
                              ? "bg-tt-mint/[0.06] [box-shadow:inset_0_0_0_2px_rgb(var(--tt-mint)/0.35)]"
                              : "bg-tt-night-950/45 [box-shadow:inset_0_0_0_2px_rgb(var(--tt-night-500)/0.6)] hover:bg-tt-night-600/60 hover:[box-shadow:inset_0_0_0_2px_rgb(var(--tt-gold-500)/0.55)]"
                          )}
                        >
                          <img
                            draggable={false}
                            className="h-10 w-10 shrink-0 object-contain"
                            alt=""
                            aria-hidden="true"
                            src={done ? cdnFile("icons/check.webp") : quest.icon}
                          />
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="line-clamp-2 font-sans text-p5 font-extrabold leading-tight text-tt-cream md:text-p4">
                              {quest.name}
                            </span>
                            <span id={detailId} className="font-sans text-p6 font-semibold leading-snug text-tt-muted">
                              {done
                                ? "Done"
                                : progress
                                ? progress.reached
                                  ? "Reached: tap to claim"
                                  : progress.unit === "tails"
                                  ? `${formatTails(progress.have, { word: false })} / ${formatTails(progress.target)}`
                                  : `${progress.have} / ${progress.target} friends joined`
                                : quest.link
                                ? "Opens in a new tab"
                                : "Tap to claim"}
                              {!!quest.reward.tails && <span className="sr-only">{`, pays ${formatTails(quest.reward.tails)}`}</span>}
                            </span>
                          </span>
                          {!!quest.reward.tails && (
                            <span
                              aria-hidden="true"
                              className="inline-flex w-[88px] shrink-0 items-center justify-end gap-1 font-primary text-p5 leading-none text-tt-gold-400"
                            >
                              <PixelIcon name="coins" size={14} />+{formatTails(quest.reward.tails, { word: false })}
                            </span>
                          )}
                          <PixelIcon
                            name="chevron-right"
                            size={18}
                            className="shrink-0 text-tt-muted group-hover:text-tt-gold-400"
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ModalSection>
          </ModalStack>
        )}
        {questsType === QuestType.WIN && <LeaderboardContent />}
        {questsType === QuestType.CATNIP && <LeaderboardCatnipContent />}
        {questsType === QuestType.RESCUE && <LeaderboardRescuerContent />}
      </ModalTabPanel>
    </div>
  );
};

export const QuestsModal = ({ close }: { close: () => void }) => {
  return (
    <GameModal
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title="EVENTS"
      icon="trophy"
      description="Quests that pay Tails, and the leaderboards."
      name="events"
      size="lg"
      // One height for every tab, so switching tabs never makes the panel jump.
      className="h-[min(92dvh,860px)] [&>div]:flex-1"
    >
      <QuestsModalContent />
    </GameModal>
  );
};
