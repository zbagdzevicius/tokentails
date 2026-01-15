import { PacksModal } from "@/components/shared/PacksModal";
import { FirebaseAuthProvider } from "@/context/FirebaseAuthContext";

export default function Packs() {
  return (
    <FirebaseAuthProvider>
      <PacksModal />
    </FirebaseAuthProvider>
  );
}
