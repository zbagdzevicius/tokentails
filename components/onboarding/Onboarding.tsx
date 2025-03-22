import { useLocalStorage } from "@/constants/hooks";
import { onboardingSteps } from "@/constants/onboarding";
import { useProfile } from "@/context/ProfileContext";
import { useEffect, useMemo, useState } from "react";
import Joyride from "react-joyride";

export const Onboarding = () => {
  const [isClient, setIsClient] = useState(false);
  const { profile } = useProfile();
  const isOnboardingStarted = useMemo(
    () => isClient && profile?.cat,
    [profile, isClient]
  );
  const [isOnboarded, setIsOnboarded] = useLocalStorage("isOnboarded");
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
      steps={onboardingSteps}
      continuous={true}
      run={true}
      callback={handleOnboarding}
    />
  );
};
