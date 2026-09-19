import type { ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex min-h-40 flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
      <p className="text-sm font-semibold">{label}…</p>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line bg-canvas p-6 text-center">
      <p className="font-extrabold text-ink">{title}</p>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", whatHappened, whatYouCanDo, onRetry }: {
  title?: string; whatHappened: string; whatYouCanDo: string; onRetry?: () => void;
}) {
  return (
    <div role="alert" className="flex min-h-48 flex-col items-center gap-3 rounded-card border border-destructive/20 bg-speech-tint p-6 text-center">
      <AlertTriangle className="size-8 text-destructive" aria-hidden="true" />
      <p className="text-lg font-extrabold text-ink">{title}</p>
      <p className="text-sm text-muted-foreground">{whatHappened}</p>
      <p className="text-sm font-semibold text-ink">{whatYouCanDo}</p>
      {onRetry && (
        <Button className="mt-2 rounded-full" onClick={onRetry}>Try again</Button>
      )}
    </div>
  );
}

export function Modal({ open, onOpenChange, title, description, children }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function PermissionDialog({ open, onOpenChange, title, description, allowLabel = "Allow", onAllow }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string;
  allowLabel?: string; onAllow: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>Not now</Button>
          <Button className="rounded-full" onClick={() => { onAllow(); onOpenChange(false); }}>{allowLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
