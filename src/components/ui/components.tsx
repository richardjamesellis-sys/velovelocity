import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

import { cn } from "@/lib/utils"

// Button
const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

// Input
export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

// Card
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl border bg-card text-card-foreground shadow-sm",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

// Dialog
// A glass panel that grows out of the control that opened it and shrinks back into it.
const panelSpring = { type: "spring", bounce: 0, duration: 0.42 } as const

interface GlassDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: React.ReactElement
  title: string
  children: React.ReactNode
}

function GlassDialog({ open, onOpenChange, trigger, title, children }: GlassDialogProps) {
  const triggerRef = React.useRef<HTMLElement>(null)

  // Anchor the panel's transform origin to the centre of the trigger
  const anchorToTrigger = React.useCallback((el: HTMLDivElement | null) => {
    const t = triggerRef.current
    if (!el || !t) return
    const r = t.getBoundingClientRect()
    const parent = el.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 }
    const x = r.left + r.width / 2 - parent.left - el.offsetLeft
    const y = r.top + r.height / 2 - parent.top - el.offsetTop
    el.style.transformOrigin = `${x}px ${y}px`
  }, [])

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Trigger asChild ref={triggerRef as React.Ref<HTMLButtonElement>}>
        {trigger}
      </DialogPrimitive.Trigger>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-scrim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              />
            </DialogPrimitive.Overlay>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
              <DialogPrimitive.Content asChild forceMount aria-describedby={undefined}>
                <motion.div
                  ref={anchorToTrigger}
                  className="glass-thick pointer-events-auto relative w-full max-w-sm rounded-[28px] p-4 pt-3 text-label outline-none"
                  initial={{ opacity: 0, scale: 0.3 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.3 }}
                  transition={{ ...panelSpring, opacity: { duration: 0.18 } }}
                >
                  <div className="relative flex h-11 items-center justify-center">
                    <DialogPrimitive.Title className="text-headline">{title}</DialogPrimitive.Title>
                    <DialogPrimitive.Close
                      className="press absolute right-0 flex h-8 w-8 items-center justify-center rounded-full bg-fill-3 text-label-2"
                      aria-label="Close"
                    >
                      <X className="h-4 w-4" strokeWidth={2.5} />
                    </DialogPrimitive.Close>
                  </div>
                  <div className="mt-2">{children}</div>
                </motion.div>
              </DialogPrimitive.Content>
            </div>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  )
}

// Segmented control
interface SegmentedControlProps<T extends string> {
  id: string
  label: string
  value: T | undefined
  options: { value: T; label: React.ReactNode }[]
  onChange: (value: T) => void
}

function SegmentedControl<T extends string>({ id, label, value, options, onChange }: SegmentedControlProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-[9px] bg-fill-3 p-[2px]">
      {options.map((o) => {
        const selected = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative h-7 min-w-[64px] flex-1 rounded-[7px] px-3 text-footnote transition-colors",
              selected ? "font-semibold text-label" : "font-medium text-label-2"
            )}
          >
            {selected && (
              <motion.span
                layoutId={`segment-${id}`}
                className="absolute inset-0 rounded-[7px] bg-segment"
                style={{ boxShadow: "var(--shadow-sm)" }}
                transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export {
  Button,
  buttonVariants,
  Input,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  GlassDialog,
  SegmentedControl,
}
