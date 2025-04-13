import { useLocalStorage } from "@/constants/hooks";
import { catsOnboardingSteps } from "@/constants/onboarding";
import { useProfile } from "@/context/ProfileContext";
import { useEffect, useMemo, useState } from "react";
import Joyride from "react-joyride";

export const CatsOnboarding = () => {
  const [isClient, setIsClient] = useState(false);
  const { profile } = useProfile();
  const isOnboardingStarted = useMemo(
    () => isClient && profile?.cat,
    [profile, isClient]
  );
  const [isOnboarded, setIsOnboarded] = useLocalStorage("isOnboardedCats");

  useEffect(() => {
    const checkAndStartOnboarding = () => {
      if (document.querySelector("#craft")) {
        setIsClient(true); // Element is present, start onboarding
      } else {
        setTimeout(checkAndStartOnboarding, 500); // Check again after a delay
      }
    };

    if (!isClient) {
      checkAndStartOnboarding();
    }
  }, []);
  const handleOnboarding = (handle: any) => {
    if (handle?.action === "reset") {
      setIsOnboarded(true);
    }
  };

  if (!isOnboardingStarted || isOnboarded) return <></>;
  return (
    <Joyride
      steps={catsOnboardingSteps}
      continuous={true}
      run={true}
      callback={handleOnboarding}
    />
  );
};
