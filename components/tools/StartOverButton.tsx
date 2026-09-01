import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface StartOverButtonProps {
  label: string;
  onClick: () => void;
}

export function StartOverButton({ label, onClick }: StartOverButtonProps) {
  return (
    <Button variant="ghost" onClick={onClick} leadingIcon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}>
      {label}
    </Button>
  );
}
