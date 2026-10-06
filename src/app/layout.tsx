import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkflowProvider } from "@/features/workflow/workflow-provider";
import { TaskDrawerProvider } from "@/features/tasks/task-drawer";
import { isSupabaseConfigured } from "@/lib/env";
import { getAuthenticatedAppUser } from "@/lib/supabase/profile";
import { loadWorkflowData } from "@/features/workflow/workflow-data";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jota — Joyno Task",
  description: "Joyno Task: client work, campaigns, tasks, and reviews in one focused workspace.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const demoMode = !isSupabaseConfigured();
  const initialUser = demoMode ? null : await getAuthenticatedAppUser();
  const workflowData = demoMode || !initialUser ? null : await loadWorkflowData();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TooltipProvider>
          <WorkflowProvider initialUser={initialUser} initialTasks={workflowData?.tasks} initialClients={workflowData?.clients} initialUpcomingContent={workflowData?.upcomingContent} demoMode={demoMode}><TaskDrawerProvider>{children}</TaskDrawerProvider></WorkflowProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
