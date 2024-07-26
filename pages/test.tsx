import { CatbassadorsAuthTest } from "@/components/catbassadors/CatbassadorsAuthTest";
import { TelegramAuthProviderTest } from "@/context/TelegramAuthContextTest";

const test = () => {
  return (
    <TelegramAuthProviderTest>
      <CatbassadorsAuthTest />
    </TelegramAuthProviderTest>
  );
};

export default test;
