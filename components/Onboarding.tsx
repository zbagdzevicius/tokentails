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
  useEffect(() => {
    setTimeout(() => {
      setIsClient(true);
    }, 1000);
  }, []);

  if (!isOnboardingStarted) return <></>;
  return <Joyride steps={onboardingSteps} continuous />;
};
