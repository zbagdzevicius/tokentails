import { useLocalStorage } from "@/constants/hooks";
import { catCardOnboardingSteps } from "@/constants/onboarding";
import { useProfile } from "@/context/ProfileContext";
import { useEffect, useMemo, useState } from "react";
import Joyride from "react-joyride";

export const CatCardOnboarding = () => {
  const [isClient, setIsClient] = useState(false);
  const { profile } = useProfile();
  const isOnboardingStarted = useMemo(
    () => isClient && profile?.cat,
    [profile, isClient]
  );
  const [isOnboarded, setIsOnboarded] = useLocalStorage("isOnboardedCatCard");
  useEffect(() => {
    setTimeout(() => {
      setIsClient(true);
    }, 1000);
  }, []);
  const handleOnboarding = (handle: any) => {
    if (handle?.action === "reset") {
      setIsOnboarded(true);
    }
  };

  if (!isOnboardingStarted || isOnboarded) return <></>;
  return (
    <Joyride
      steps={catCardOnboardingSteps}
      continuous={true}
      run={true}
      callback={handleOnboarding}
    />
  );
};
