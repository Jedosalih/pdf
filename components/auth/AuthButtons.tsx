import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";

/** Logged-out header state — plain Log in / Sign up links. */
export async function AuthButtons() {
  const t = await getTranslations("common");

  return (
    <div className="flex items-center gap-1.5">
      <Link
        href="/login"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
      >
        {t("nav.login")}
      </Link>
      <Link
        href="/signup"
        className={cn(buttonVariants({ variant: "primary", size: "sm" }))}
      >
        {t("nav.signup")}
      </Link>
    </div>
  );
}
