import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="top-center"
      toastOptions={{
        classNames: {
          toast: "bg-surface text-fg border-border shadow-[var(--shadow-border)]",
        },
      }}
    />
  );
}
