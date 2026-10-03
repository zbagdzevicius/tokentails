import { QUEST_API } from "@/api/quest-api";
import { REWARDS } from "@/constants/rewards";
import { bgStyle, cdnFile } from "@/constants/utils";
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
import { PixelButton } from "./PixelButton";
import { Tag } from "./Tag";
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
  const [questsType, setQuestsType] = useState(QuestType.WIN);
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

  return (
    <div className="px-0 md:px-2 pb-4 pt-1 flex flex-col justify-between items-center animate-appear text-tt-cream">
      <div className="pb-2 flex items-center justify-between w-full" role="group" aria-label="Event lists">
        <PixelButton
          text="TAILS"
          active={questsType === QuestType.WIN}
          onClick={() => setQuestsType(QuestType.WIN)}
        ></PixelButton>
        <PixelButton
          text="CATNIP"
          active={questsType === QuestType.CATNIP}
          onClick={() => setQuestsType(QuestType.CATNIP)}
        ></PixelButton>
        <PixelButton
          text="RESCUERS"
          active={questsType === QuestType.RESCUE}
          onClick={() => setQuestsType(QuestType.RESCUE)}
        ></PixelButton>
        <PixelButton
          text="QUESTS"
          active={questsType === QuestType.SOCIAL}
          onClick={() => setQuestsType(QuestType.SOCIAL)}
        ></PixelButton>
      </div>
      <span className="lg:px-8 w-full">
        {questsType === QuestType.SOCIAL && (
          <>
            <div className="flex flex-col gap-2 w-full">
              {quests.map((quest) => (
                <div
                  key={quest.name}
                  className="flex justify-between items-center w-full"
                >
                  <div className="flex gap-2 items-center">
                    {profile?.quests?.includes(quest.key) ? (
                      <img
                        draggable={false}
                        className="w-10"
                        alt="Done"
                        src={cdnFile("icons/check.webp")}
                      />
                    ) : (
                      <img
                        draggable={false}
                        className="w-10"
                        alt=""
                        aria-hidden="true"
                        src={quest.icon}
                      />
                    )}
                    <PixelButton
                      text={quest.name}
                      active={profile?.quests?.includes(quest.key)}
                      onClick={() => redeem(quest)}
                    ></PixelButton>
                  </div>
                  {!!quest.reward.tails && (
                    <div className="text-p5 h-6 flex items-center gap-1 font-secondary bg-tt-night-900 border border-tt-gold-500/70 text-tt-cream rounded-full pr-2 pl-4 relative">
                      <img
                        alt=""
                        aria-hidden="true"
                        draggable={false}
                        className="w-8 -left-5 -top-2 bottom-0 z-10 absolute"
                        src={cdnFile("logo/logo.webp")}
                      />
                      {formatTails(quest.reward.tails)}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <>
              <div
                className="flex flex-col mb-4 font-primary uppercase px-2 relative rounded-lg py-2 text-tt-gold-ink mt-8"
                style={bgStyle("6")}
              >
                <Tag size="sm">WHAT I&apos;LL GET FOR INVITING A FRIEND?</Tag>

                <div className="flex flex-row items-center mb-1">
                  <img
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    className="md:h-8 lg:h-10 h-7 mr-1"
                    src={cdnFile("logo/logo.webp")}
                  />
                  <p className="text-p4">{formatTails(REWARDS.INVITE_FRIEND)}</p>
                </div>
                <div className="flex flex-row items-center">
                  <img
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    className="w-7 h-6  md:w-8 md:h-7 lg:w-10 lg:h-9 mr-1"
                    src={cdnFile("icons/invites/gift-coin.png")}
                  />
                  <p className="text-p4">
                    {formatTails(REWARDS.INVITE_FRIEND)} FOR YOUR FRIEND
                  </p>
                </div>
                <div className="absolute -top-3 -left-3 z-0 -rotate-45">
                  <img
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    className="h-6 w-6"
                    src={cdnFile("logo/heart.webp")}
                  />
                </div>
                <div className="absolute -top-3 -right-3 z-0 rotate-45">
                  <img
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    className="h-6 w-6"
                    src={cdnFile("logo/heart.webp")}
                  />
                </div>
                <div className="flex flex-col gap-4 uppercase text-center">
                  Play side by side and earn daily paws together
                </div>
              </div>
              <PixelButton
                text="GET INVITE LINK"
                onClick={onInvite}
                fullWidth
              />
            </>
          </>
        )}
      </span>
      {questsType === QuestType.WIN && <LeaderboardContent />}
      {questsType === QuestType.CATNIP && <LeaderboardCatnipContent />}
      {questsType === QuestType.RESCUE && <LeaderboardRescuerContent />}
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
      name="events"
      size="md"
    >
      <QuestsModalContent />
    </GameModal>
  );
};
