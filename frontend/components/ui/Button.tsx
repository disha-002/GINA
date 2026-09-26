import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "secondary" | "danger" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-indigo disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-surface text-slate-100 hover:bg-surface-secondary border border-surface-border": variant === "default",
            "bg-brand-indigo text-white hover:bg-brand-indigo-light shadow-sm shadow-brand-indigo/20": variant === "primary",
            "bg-surface-secondary text-slate-200 hover:bg-surface-border": variant === "secondary",
            "bg-rose-500 text-white hover:bg-rose-600": variant === "danger",
            "hover:bg-surface-secondary hover:text-slate-100 text-slate-400": variant === "ghost",
            "h-9 px-4 py-2": size === "default",
            "h-8 rounded-md px-3 text-xs": size === "sm",
            "h-10 rounded-md px-8": size === "lg",
            "h-9 w-9": size === "icon",
          },
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
