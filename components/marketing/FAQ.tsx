import { ChevronDown } from "lucide-react";

interface FaqItem {
  q: string;
  a: string;
}

interface FAQProps {
  title: string;
  items: FaqItem[];
}

/** Native <details>/<summary> — full keyboard support and screen-reader
 * semantics for free, no accordion library needed. Shared by the homepage
 * and every tool page (via ToolDescription). */
export function FAQ({ title, items }: FAQProps) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-h2 font-semibold text-foreground">{title}</h2>
      <div className="flex flex-col divide-y divide-border">
        {items.map((item) => (
          <details key={item.q} className="group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-body font-medium text-foreground">
              {item.q}
              <ChevronDown
                className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <p className="mt-2 text-small text-muted-foreground">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
