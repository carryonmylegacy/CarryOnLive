import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "../../lib/utils"

// Use modal={false} to bypass react-remove-scroll (iOS PWA scroll lock)
const Dialog = React.forwardRef(({ children, ...props }, ref) => (
  <DialogPrimitive.Root {...props} modal={false}>
    {children}
  </DialogPrimitive.Root>
))
Dialog.displayName = "Dialog"

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80",
      className
    )}
    {...props} />
))
DialogOverlay.displayName = "DialogOverlay"

// iOS PWA fix: The dialog card sits inside a full-screen scrollable wrapper.
// iOS can scroll a full-screen fixed element (inset-0 + overflow-y-auto),
// but CANNOT scroll a smaller fixed element (top-5vh + max-h-90vh + overflow-y-scroll).
const DialogContent = React.forwardRef(({ className, children, onOpenAutoFocus, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    {/* Full-screen scrollable wrapper — this is what iOS actually scrolls */}
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
      <div className="min-h-full flex items-start justify-center py-[5vh] px-4 sm:px-0">
        <DialogPrimitive.Content
          ref={ref}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            if (onOpenAutoFocus) onOpenAutoFocus(e);
          }}
          className={cn(
            "relative z-50 w-full max-w-lg gap-4 border bg-background p-6 shadow-lg sm:rounded-lg",
            className
          )}
          {...props}>
          {children}
          <DialogPrimitive.Close
            className="absolute right-4 top-4 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-[var(--t4)] transition-transform active:scale-90 focus:outline-none">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </div>
    </div>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props} />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props} />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props} />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props} />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
