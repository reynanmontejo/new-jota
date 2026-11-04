import Image from "next/image"

import { brandAssets } from "@/lib/branding"
import { cn } from "@/lib/utils"

export function BrandLogo({ compact = false, showParentBrand = false, className }: {
  compact?: boolean
  showParentBrand?: boolean
  className?: string
}) {
  return <span role="img" aria-label="Joyno Task by Joyno Media" className={cn("block shrink-0", compact ? "size-10 rounded-lg bg-[#FAF7F2]" : "w-36", className)}>
    {compact ? <Image src={brandAssets.lion} width={256} height={256} sizes="40px" alt="" loading="eager" className="size-full object-contain" /> : <>
      <Image src={brandAssets.wordmarkLight} width={720} height={288} sizes="224px" alt="" loading="eager" className="h-auto w-full object-contain dark:hidden" />
      <Image src={brandAssets.wordmarkDark} width={720} height={288} sizes="224px" alt="" loading="eager" className="hidden h-auto w-full object-contain dark:block" />
      {showParentBrand && <span className="mt-0.5 block pr-2 text-right text-[10px] font-medium tracking-[0.1em] text-muted-foreground">by Joyno Media</span>}
    </>}
  </span>
}
