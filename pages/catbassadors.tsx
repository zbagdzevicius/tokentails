import dynamicImport from "next/dynamic";

// Dynamically import client component with SSR disabled
const CatbassadorsClient = dynamicImport(
  () => import("@/components/CatbassadorsClient"),
  { ssr: false }
);

// Disable static generation - this page requires browser APIs
export const dynamic = "force-dynamic";

export default function game() {
  return <CatbassadorsClient />;
}
