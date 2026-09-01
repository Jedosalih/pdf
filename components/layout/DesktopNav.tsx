import { Link } from "@/lib/i18n/navigation";

export interface NavItem {
  href: string;
  label: string;
}

interface DesktopNavProps {
  items: readonly NavItem[];
}

export function DesktopNav({ items }: DesktopNavProps) {
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="rounded-sm px-3 py-2 text-small font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
