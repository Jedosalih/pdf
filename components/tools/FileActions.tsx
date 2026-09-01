import { ArrowUp, ArrowDown, X } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";

interface FileActionsProps {
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRemove: () => void;
  moveUpLabel: string;
  moveDownLabel: string;
  removeLabel: string;
  disabled?: boolean;
}

/** The move-up/move-down/remove control cluster shown per file row. Move
 * handlers are optional so single-file tools can render just the remove
 * action without reorder controls that would never do anything. */
export function FileActions({
  onMoveUp,
  onMoveDown,
  onRemove,
  moveUpLabel,
  moveDownLabel,
  removeLabel,
  disabled,
}: FileActionsProps) {
  return (
    <div className="flex items-center gap-0.5">
      {onMoveUp ? (
        <IconButton
          size="sm"
          label={moveUpLabel}
          disabled={disabled}
          onClick={onMoveUp}
        >
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        </IconButton>
      ) : null}
      {onMoveDown ? (
        <IconButton
          size="sm"
          label={moveDownLabel}
          disabled={disabled}
          onClick={onMoveDown}
        >
          <ArrowDown className="h-4 w-4" aria-hidden="true" />
        </IconButton>
      ) : null}
      <IconButton
        size="sm"
        label={removeLabel}
        disabled={disabled}
        onClick={onRemove}
        className="hover:bg-error/10 hover:text-error"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </IconButton>
    </div>
  );
}
