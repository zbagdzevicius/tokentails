import { useLocalStorage } from "@/constants/hooks";
import { onboardingSteps } from "@/constants/onboarding";
import { useProfile } from "@/context/ProfileContext";
import { useEffect, useMemo, useState } from "react";
import Joyride from "react-joyride";

export const Onboarding = () => {
  const [isClient, setIsClient] = useState(false);
  const { profile } = useProfile();
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [hasCheckedStorage, setHasCheckedStorage] = useState(false);

  const isOnboardingStarted = useMemo(
    () => isClient && profile?.cat,
    [profile, isClient]
  );

  useEffect(() => {
    setTimeout(() => {
      setIsClient(true);
    }, 1000);
  }, []);

  useEffect(() => {
    if (isClient) {
      const stored = localStorage.getItem("isOnboarded");
      setIsOnboarded(stored === "true");
      setHasCheckedStorage(true);
    }
  }, [isClient]);

  const handleOnboarding = (handle: any) => {
    if (handle?.action === "reset") {
      localStorage.setItem("isOnboarded", "true");
      setIsOnboarded(true);
    }
  };

  if (!isOnboardingStarted || isOnboarded || !hasCheckedStorage) return null;

  return (
    <Joyride
      steps={onboardingSteps}
      continuous
      run
      callback={handleOnboarding}
    />
  );
};
