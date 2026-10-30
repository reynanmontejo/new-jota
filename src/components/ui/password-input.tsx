"use client"

import { useId, useState, type ComponentProps } from "react"
import { Eye, EyeOff } from "lucide-react"

import { cn } from "@/lib/utils"

type PasswordInputProps = Omit<ComponentProps<"input">, "type"> & {
  visibilityLabel?: string
}

export function PasswordInput({ id, className, disabled, visibilityLabel = "password", ...props }: PasswordInputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const [visible, setVisible] = useState(false)
  const toggleLabel = `${visible ? "Hide" : "Show"} ${visibilityLabel}`

  return <div className="relative min-w-0">
    <input {...props} id={inputId} type={visible ? "text" : "password"} disabled={disabled} className={cn(className, "w-full pr-10")} />
    <button
      type="button"
      aria-label={toggleLabel}
      aria-controls={inputId}
      aria-pressed={visible}
      title={toggleLabel}
      disabled={disabled}
      onClick={() => setVisible((current) => !current)}
      className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    >
      {visible ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
    </button>
  </div>
}
