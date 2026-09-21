import { fromMinorUnits, moneyStep, parseMajorInput } from "@/lib/kakeibo/money";
import type { Currency } from "@/lib/kakeibo/types";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function MoneyField({
  id,
  label,
  currency,
  minor,
  onMinor,
  minZero = true,
}: {
  id: string;
  label: string;
  currency: Currency;
  minor: number;
  onMinor: (n: number) => void;
  minZero?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">
          {currency === "JPY" ? "¥" : "RM"}
        </span>
        <Input
          id={id}
          type="number"
          inputMode={currency === "JPY" ? "numeric" : "decimal"}
          min={minZero ? 0 : undefined}
          step={moneyStep(currency)}
          className="pl-10 tabular-nums"
          value={Number.isFinite(minor) ? fromMinorUnits(minor, currency) : ""}
          onChange={(e) => {
            const parsed = parseMajorInput(e.target.value, currency);
            if (parsed === null) {
              onMinor(0);
              return;
            }
            onMinor(parsed);
          }}
        />
      </div>
    </div>
  );
}
