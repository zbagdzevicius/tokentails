import { useProfile } from "@/context/ProfileContext";
import { IProfile } from "@/models/profile";
import { useEffect, useMemo, useState } from "react";
import { Countdown } from "../shared/Countdown";
import { PixelButton } from "../shared/PixelButton";
import { Tag } from "../shared/Tag";
import { USER_API } from "@/api/user-api";
import { useDebouncedCallback } from "use-debounce";
import { cdnFile } from "@/constants/utils";

export interface ICodex {
  title: string;
  description: string;
  how: string;
  image: string;
  task: string;
  progress?: number;
  verification: (profile: IProfile) => boolean;
  status: (profile: IProfile) => string;
}

export enum CODEX_LIFE {
  ONE = "1",
  TWO = "2",
  THREE = "3",
  FOUR = "4",
  FIVE = "5",
  SIX = "6",
  SEVEN = "7",
  EIGHT = "8",
  NINE = "9",
}

const codex: ICodex[] = [
  {
    title: "#1 One Spirit, Two Bodies",
    description:
      "Every COLLECTIBLE cat reflects a real soul. Digital twins of the forgotten, the wounded, the waiting. To adopt one is to guard both — in code and in flesh.",
    how: "Visit cat shelter, find a cat which you like and adopt it",
    image: cdnFile("codex/codex-1.webp"),
    task: "ADOPT COLLECTIBLE CAT",
    verification: (profile) => (profile?.monthCatsAdopted || 0) >= 1,
    status: (profile) => `${profile?.monthCatsAdopted || 0} / 1`,
  },
  {
    title: "#2 Play Is Prayer",
    description:
      "When we quest, we serve. When we mint, we mend. Every action echoes in shelters, clinics, and cages.",
    how: "Earn $TAILS through playing or participating in Airdrop event",
    image: cdnFile("codex/codex-2.webp"),
    task: "COLLECT 100 $TAILS",
    verification: (profile) => (profile?.monthTails || 0) >= 100,
    status: (profile) => `${profile?.monthTails || 0} / 100`,
  },
  {
    title: "#3 The Saviors Are Marked",
    description:
      "We are not collectors. We are chosen — called to bind our wallets to the weak. Every cat we save leaves a mark on our legacy… and our fortune.",
    how: "Save a cat!",
    image: cdnFile("codex/codex-3.webp"),
    task: "SPEND $1",
    verification: (profile) =>
      !!profile?.monthCatsAdopted || (profile?.monthSpent || 0) >= 1,
    status: (profile) =>
      `${profile?.monthSpent || profile?.monthCatsAdopted || 0 * 1} / 1`,
  },
  {
    title: "#4 Coins Must Flow Where Compassion Leads",
    description:
      "Half of all gained must give. Every game played, every trade made — that fuels their future. And in doing so, ensures ours.",
    how: "Open mystery box or loot box 2 times in 'GIFT' section's 'BOXES' tab",
    image: cdnFile("codex/codex-4.webp"),
    task: "OPEN A BOX",
    verification: (profile) => (profile?.monthBoxes || 0) >= 2,
    status: (profile) => `${profile?.monthBoxes || 0} / 2`,
  },
  {
    title: "#5 No Life is Left Behind",
    description:
      "Not the last-born kitten in a shelter. Not the unloved token in the chain. We rescue what others abandon. That is our oath.",
    how: "Go to HOME and feed your cat by clicki 'FEED TO CONTROL' button.",
    image: cdnFile("codex/codex-5.webp"),
    task: "FEED YOUR CATS",
    verification: (profile) => (profile?.monthFeeded || 0) >= 1,
    status: (profile) => `${profile?.monthFeeded || 0} / 1`,
  },
  {
    title: "#6 The Bond Cannot Break",
    description:
      "Your cat is not your possession — it is your mirror. To neglect it is to neglect yourself. To care is to evolve.",
    how: "Click 'CHECK-IN' button 10 times! You can do it once a day.",
    image: cdnFile("codex/codex-6.webp"),
    task: "CHECK-IN 10 times",
    verification: (profile) => (profile?.monthStreak || 0) >= 10,
    status: (profile) => `${profile?.monthStreak || 0} / 10`,
  },
  {
    title: "#7 The Tailsguard Ascends Together",
    description:
      "For every life saved, the world shifts. The more we rescue, the stronger our network. Our magic multiplies.",
    how: "Go to 'GIFTS' section, click 'INVITE' button and invite a friend. Once they onboard, you'll be rewarded.",
    image: cdnFile("codex/codex-7.webp"),
    task: "ONBOARD 1 FRIEND",
    verification: (profile) => (profile?.monthReferrals || 0) >= 1,
    status: (profile) => `${profile?.monthReferrals || 0} / 1`,
  },
  {
    title: "#8 From the Blockchain to the Beyond",
    description:
      "These cats are more than metadata. They are stories. Beacons. Proof that Web3 can matter. And we, their guardians, become legends. Your feedback is CODEX fuel.",
    how: "Go to 'QUESTS' section and complete 10 quests",
    image: cdnFile("codex/codex-8.webp"),
    task: "COMPLETE 10 QUESTS",
    verification: (profile) => (profile?.quests?.length || 0) >= 10,
    status: (profile) => `${profile?.quests?.length || 0} / 10`,
  },
  {
    title: "#9 Destiny Is Shared",
    description:
      "To save a cat is to unlock its ninth life. But in return, it unlocks yours. Every rescuer earns a fortune not just in token — but in legacy, in status, in soul.",
    how: "Craft 20 $TAILS by staking your cats. You can do it once every 7 days with each of your cat, head over to 'CATS' section and click 'CRAFT $TAILS' button. The more cats you have, the more $TAILS you can craft.",
    image: cdnFile("codex/codex-9.webp"),
    task: "CRAFT TAILS",
    verification: (profile) => (profile?.monthTailsCrafted || 0) >= 20,
    status: (profile) => `${profile.monthTailsCrafted || 0} / 20`,
  },
];

export const CodexSection = ({
  title,
  description,
  how,
  image,
  task,
  verification,
  status,
}: ICodex) => {
  const [info, setInfo] = useState<null | {
    type: "lore" | "how";
    text: string;
  }>(null);
  const { profile } = useProfile();
  const isCompleted = useMemo(() => verification?.(profile!), [profile]);
  return (
    <div
      className={`flex flex-col items-center relative font-primary pt-4 border-4 rounded-2xl bg-gradient-to-bl from-yellow-300 to-orange-300 ${
        isCompleted ? "border-yellow-300" : "border-red-300"
      }`}
    >
      {!info && (
        <div className="flex items-center gap-1 absolute top-0 left-0">
          <Tag isSmall>{title.slice(0, 2)}</Tag>
        </div>
      )}
      <img src={image} alt="codex" className="h-16 -mb-2 -mt-12" />
      {info && <Tag isSmall>{title}</Tag>}
      {info && (
        <div
          key={info?.type}
          className={`flex flex-col w-64 animate-opacity font-primary text-balance text-center animate-opacit rounded-2xl border-4 border-yellow-300 px-0.5 py-1 ${
            isCompleted ? "bg-yellow-300" : "bg-red-300"
          }`}
        >
          <div className="text-p5 font-bold">
            {info.type === "lore" ? "WHY IT MATTERS" : "WHAT DO I NEED TO DO?"}
          </div>
          {info.type === "lore" ? description : how}
        </div>
      )}
      <span
        className={`px-2 text-p6 rounded-b-xl border-x-4 border-yellow-300 ${
          isCompleted ? "bg-yellow-300" : "bg-red-300"
        }`}
      >
        MISSION
      </span>
      <div
        className={`font-primary text-center animate-opacity w-fit flex items-center gap-1`}
      >
        <img
          src={
            isCompleted
              ? cdnFile("icons/check.webp")
              : cdnFile("icons/loader.webp")
          }
          className={`w-4 h-4 -mt-1 ${isCompleted ? "" : "animate-spin-slow"}`}
        />
        {task}
      </div>
      <div className="flex items-center -mt-2">
        <PixelButton
          isSmall
          text="WHY?"
          active={info?.type === "lore"}
          onClick={() =>
            setInfo((prev) =>
              prev?.type === "lore" ? null : { type: "lore", text: description }
            )
          }
        />
        <div
          className={`font-primary text-center animate-opacity w-fit px-2 h-fit rounded-2xl border-yellow-300 border-2 ${
            isCompleted ? "bg-yellow-300" : "bg-red-300"
          }`}
        >
          {status(profile!)}
        </div>
        <PixelButton
          isSmall
          text="HOW?"
          active={info?.type === "how"}
          onClick={() =>
            setInfo((prev) =>
              prev?.type === "how" ? null : { type: "how", text: how }
            )
          }
        />
      </div>
    </div>
  );
};

const date = 9;

export const Codex = () => {
  const [isFAQOpen, setIsFAQOpen] = useState(false);
  const { profile, setProfileUpdate } = useProfile();

  const completedMonths = useMemo(() => {
    return profile?.codex?.filter((item) => item === 1)?.length || 0;
  }, [profile]);
  const completedCount = useMemo(() => {
    return codex.filter((item) => item.verification?.(profile!)).length;
  }, [profile]);
  const isCompleted = useMemo(() => {
    return completedCount >= codex.length;
  }, [completedCount]);

  const saveCodex = useDebouncedCallback(async () => {
    await USER_API.saveCodex().then((response) => {
      setProfileUpdate({ codex: response?.codex || profile?.codex });
    });
  }, 1000);
  useEffect(() => {
    if (isCompleted) {
      saveCodex();
    }
  }, [isCompleted]);
  const dateUntilNearest9thDay = useMemo(() => {
    const now = new Date();
    const currentDayUTC = now.getUTCDate();
    const currentMonthUTC = now.getUTCMonth();
    const currentYearUTC = now.getUTCFullYear();

    let nearest9thDay;

    if (currentDayUTC < 9) {
      // 9th day of current month in UTC
      nearest9thDay = new Date(Date.UTC(currentYearUTC, currentMonthUTC, date));
    } else {
      // 9th day of next month in UTC
      nearest9thDay = new Date(
        Date.UTC(currentYearUTC, currentMonthUTC + 1, date)
      );
    }

    return nearest9thDay;
  }, []);
  const isLessThan8hoursLeft = useMemo(() => {
    const now = new Date();
    const timeDifference = dateUntilNearest9thDay.getTime() - now.getTime();
    return timeDifference > 0 && timeDifference < 8 * 60 * 60 * 1000;
  }, [dateUntilNearest9thDay]);
  const phase = useMemo(() => {
    // Use UTC date to ensure consistent date calculation globally
    const now = new Date();
    const nowUTC = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
    const startDate = new Date(Date.UTC(2025, 5, date)); // June 9, 2025 in UTC

    // If now is before the start date, return phase 1
    if (nowUTC < startDate) {
      return 1;
    }

    // Calculate how many months have passed since the start date
    const monthsPassed =
      (nowUTC.getUTCFullYear() - startDate.getUTCFullYear()) * 12 +
      (nowUTC.getUTCMonth() - startDate.getUTCMonth());

    // Calculate how many 9th days have been passed
    // Add 1 because we start with phase 1
    let phaseCount = monthsPassed;

    // If we're past the 9th day in the current month, add one more phase
    if (nowUTC.getUTCDate() >= date) {
      phaseCount += 1;
    }

    return phaseCount;
  }, []);
  return (
    <div className="flex flex-col items-center relative pb-14">
      <img
        src={
          isCompleted
            ? cdnFile("tail/guard.webp")
            : cdnFile("images/cats-slider/heal.webp")
        }
        alt="codex"
        className="h-24 mb-2"
      />
      <div className="flex flex-col items-center font-paws text-yellow-300 drop-shadow-[0_1.4px_1.8px_rgba(0,0,0)] text-h5 glow">
        MY BADGES: {completedMonths}
      </div>
      {!!completedCount && (
        <div className="flex justify-center gap-1 my-1">
          {Array.from({ length: completedMonths }).map((_, index) => (
            <img key={index} src={cdnFile("logo/heart.webp")} className="w-6" />
          ))}
        </div>
      )}
      <div className="text-p4 bg-yellow-300 border-4 border-yellow-900 rounded-lg px-2">
        I GET
        <span className="text-yellow-300 text-p4 drop-shadow-[0_1.4px_1.8px_rgba(0,0,0)] ml-1">
          {(profile?.codex?.reduce((acc, item) => acc + item, 0) || 0) * 300}{" "}
          $TAILS
        </span>{" "}
        PER MONTH
      </div>
      <div className="text-p6 mb-6">
        1 BADGE GIVES YOU
        <span className="text-yellow-300 drop-shadow-[0_1.4px_1.8px_rgba(0,0,0)] ml-1">
          300 $TAILS
        </span>{" "}
        PER MONTH
      </div>

      <Tag>THIS MONTH MISSIONS</Tag>
      <div className="flex flex-col items-center mt-1">
        <div className="w-full flex rounded-full overflow-hidden gap-1">
          {Array.from({ length: codex.length }).map((_, index) => (
            <div
              key={index}
              className={`h-4 w-6 flex-1 relative ${
                index < completedCount ? "bg-yellow-300" : "bg-red-300"
              }`}
            >
              {index < completedCount && (
                <img
                  src={cdnFile("logo/heart.webp")}
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3"
                />
              )}
            </div>
          ))}
        </div>

        {!isCompleted ? (
          <div className="font-primary text-p6">
            COMPLETE {codex.length - completedCount} MORE TO EARN CAT LOVER
            BADGE
          </div>
        ) : (
          <div className="font-primary text-p5 flex flex-col items-center">
            <span>THE BADGES OPEN FOR GUARDIANS</span>
            <span className="-mt-1">MISSIONS COMPLETED</span>
          </div>
        )}
      </div>
      {isFAQOpen ? (
        <div className="flex flex-col items-center mt-2">
          <Tag isSmall>WHAT DO I NEED TO DO?</Tag>
          <div className="font-primary mb-1">COMPLETE ALL 9 MISSIONS</div>
          <Tag isSmall>WHAT DO I NEED TO KNOW?</Tag>
          <div className="font-primary mb-1">
            RESETS ON 9TH DAY OF EVERY MONTH
          </div>
          <Tag isSmall>WHAT ARE THE BENEFITS OF CAT LOVER BADGES?</Tag>
          <div className="font-primary">DISCOUNTED COLLECTIBLES</div>
          <div className="font-primary">PRIORITY SUPPORT</div>
          <div className="font-primary">EARLY ACCESS TO UPDATES</div>
          <div className="font-primary">$TAILS DROPS</div>
          <div className="font-primary">
            $TAILS AIRDROP ELIGIBILITY CRITERIA
          </div>
        </div>
      ) : (
        <div className="absolute left-0 top-0">
          <PixelButton isSmall text="FAQ" onClick={() => setIsFAQOpen(true)} />
        </div>
      )}
      {isLessThan8hoursLeft ? (
        <div className="flex flex-col gap-4">
          <div className="font-primary text-p5">CALCULATING REWARDS...</div>
        </div>
      ) : (
        <div className="flex flex-col gap-12 mt-14">
          {codex.map((item, i) => (
            <CodexSection key={i} {...item} progress={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
};
