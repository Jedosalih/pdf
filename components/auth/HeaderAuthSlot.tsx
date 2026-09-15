import { getSessionUser } from "@/lib/auth/session";
import { AuthButtons } from "./AuthButtons";
import { UserMenu } from "./UserMenu";

/**
 * The single seam the header composes against — it never touches session
 * logic directly. Swaps between the logged-out (`AuthButtons`) and
 * logged-in (`UserMenu`) states based on the real session.
 */
export async function HeaderAuthSlot() {
  const user = await getSessionUser();
  return user ? <UserMenu user={user} /> : <AuthButtons />;
}
