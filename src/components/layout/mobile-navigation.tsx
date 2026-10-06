"use client"

import { Menu } from "lucide-react"
import { useState } from "react"

import { AppSidebar } from "@/components/layout/app-sidebar"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

export function MobileNavigation({ variant = "account_manager", isAdministrator = false }: { variant?: "account_manager" | "supervisor"; isAdministrator?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" size="icon" className="lg:hidden" aria-label="Open navigation" />}>
        <Menu />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 border-0 bg-transparent p-0 shadow-none" showCloseButton={false}>
        <SheetTitle className="sr-only">Main navigation</SheetTitle>
        <AppSidebar variant={variant} isAdministrator={isAdministrator} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}
