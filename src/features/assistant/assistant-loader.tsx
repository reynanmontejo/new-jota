"use client"

import dynamic from "next/dynamic"
import type { ComponentProps } from "react"
import type { FloatingAssistant } from "./floating-assistant"

const Assistant = dynamic(() => import("./floating-assistant").then((module) => module.FloatingAssistant), { ssr: false })

export function AssistantLoader(props: ComponentProps<typeof FloatingAssistant>) { return <Assistant {...props} /> }
