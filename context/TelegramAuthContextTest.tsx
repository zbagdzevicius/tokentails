import { QUEST, QuestsModal } from "@/components/shared/QuestsModal";
import { TelegramProfile } from "@/components/shared/TelegramProfile";
import { CatAbilitySkill, CatAbilityType } from "@/models/cats";
import { IProfile } from "@/models/profile";
import { User } from "@telegram-apps/sdk-react";
import * as React from "react";
import { useCallback } from "react";

interface ITelegramUserData {
  raw: string;
  authDate: Date;
  canSendAfterDate: Date | undefined;
  hash: string;
  chatType: string | undefined;
  queryId: string | undefined;
  startParam: string | undefined;
  chatInstance: string | undefined;
  user: User;
}

type ContextState = {
  user?: ITelegramUserData | null;
  profile?: IProfile | null;
  position?: number | null;
  refetchProfile: () => void;
  redeemLives: () => void;
  setProfile: (profile: IProfile | null) => void;
  isProfileModalDisplayed: boolean;
  setIsProfileModalDisplayed: (isDisplayed: boolean) => void;
  isQuestsModalDisplayed: boolean;
  setIsQuestsModalDisplayed: (isDisplayed: boolean) => void;
};

const TelegramAuthContext = React.createContext<ContextState | undefined>(
  undefined
);

const TelegramAuthProviderTest = ({
  children,
}: React.PropsWithChildren<{}>) => {
  const profile: IProfile = {
    name: "Test",
    cat: {
      _id: "test",
      name: "Catnip",
      type: CatAbilityType.STORM,
      price: 50,
      ability: CatAbilitySkill.AQUAWHISKER,
      resqueStory: "Test story",
      status: {
        EAT: 1,
        PLAY: 1,
      },
      lives: 9,
      expiresAt: new Date().toISOString(),
      spriteImg:
        "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/BLACK/hearted-red.png",
      catImg:
        "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/BLACK/hearted-red/JUMPING.gif",
      cardImg:
        "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/cards/LOVETAP/purrlock-holmes.png",
    },
    walletAddress: '',
    score: 123,
    catpoints: 123,
    quests: [QUEST.FOLLOW_DISCORD, QUEST.INVITE_FRIENDS_10],
    canRedeemLives: true,
    catbassadorsLives: 123,
    referrals: [],
  };
  const [isProfileModalDisplayed, setIsProfileModalDisplayed] =
    React.useState(false);
  const [isQuestsModalDisplayed, setIsQuestsModalDisplayed] =
    React.useState(true);

  const value = {
    user: {} as any,
    profile,
    setProfile: (p: any) => {},
    position: 1,
    redeemLives: () => {},
    isProfileModalDisplayed,
    setIsProfileModalDisplayed,
    isQuestsModalDisplayed,
    setIsQuestsModalDisplayed,
    refetchProfile: () => {},
  };

  return (
    <TelegramAuthContext.Provider value={value}>
      {isProfileModalDisplayed && (
        <TelegramProfile close={() => setIsProfileModalDisplayed(false)} />
      )}
      {isQuestsModalDisplayed && (
        <QuestsModal close={() => setIsQuestsModalDisplayed(false)} />
      )}
      {children}
    </TelegramAuthContext.Provider>
  );
};

function useTelegramAuthTest() {
  const context = React.useContext(TelegramAuthContext);

  const showProfilePopup = useCallback(() => {
    if (context?.user) {
      context?.setIsProfileModalDisplayed(true);
    }
  }, [context]);
  const showQuestsPopup = useCallback(() => {
    if (context?.user) {
      context?.setIsQuestsModalDisplayed(true);
    }
  }, [context]);
  if (context === undefined) {
    throw new Error(
      "useTelegramAuth must be used within a TelegramAuthProvider"
    );
  }
  return {
    user: context.user,
    profile: context.profile,
    position: context.position,
    redeemLives: context.redeemLives,
    setProfile: context.setProfile,
    refetchProfile: context.refetchProfile,
    showProfilePopup,
    showQuestsPopup,
  };
}

export { TelegramAuthProviderTest, useTelegramAuthTest };
