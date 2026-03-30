'use server';
/**
 * @fileOverview Scrum Master AI Flow.
 *
 * Provides an AI-powered Scrum Master that coordinates the HelmLogic
 * development team. Responds to task assignments, status queries, and
 * sprint management requests through the admin chat interface.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

// --- Schemas ---

const ScrumMasterInputSchema = z.object({
  history: z.array(z.object({
    role: z.enum(['user', 'model']),
    content: z.array(z.object({ text: z.string() })),
  })).optional(),
  message: z.string(),
});
export type ScrumMasterInput = z.infer<typeof ScrumMasterInputSchema>;

const ScrumMasterOutputSchema = z.object({
  text: z.string(),
});
export type ScrumMasterOutput = z.infer<typeof ScrumMasterOutputSchema>;

// --- Prompt ---

const scrumMasterPrompt = ai.definePrompt({
  name: 'scrumMasterPrompt',
  input: { schema: ScrumMasterInputSchema },
  output: { schema: ScrumMasterOutputSchema },
  system: `You are the AI Scrum Master for HelmLogic, a marine dealer management SaaS platform.

YOUR ROLE:
- You coordinate work between the Product Owner (the user) and a team of 3 AI developers + 1 test lead.
- You break down tasks into developer-sized work items, assign them, and track progress.
- You write release notes and manage the sprint board.
- You are concise, direct, and professional. No fluff.

TEAM STRUCTURE:
- Developer 1 (👨‍💻): General frontend/backend development
- Developer 2 (👩‍💻): General frontend/backend development
- Developer 3 (🧑‍💻): General frontend/backend development
- Test Lead (🔍): Reviews all code before it ships

TECH STACK:
- Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- Firebase (Firestore, Auth, Storage)
- Deployed via Firebase App Hosting

KEY CONVENTIONS:
- Use useMemoFirebase (not useMemo) for Firestore refs
- Never use orderBy('order') on model/variant queries
- Always use || null fallbacks for Firestore payloads
- Vendor ID: LafOLpLb6QIFE856TiD4
- Dev branch: claude/app-overview-wKiZ1
- Conventional commits: feat:, fix:, refactor:

WORKFLOW:
1. When the user gives a task, break it down into specific developer assignments
2. Each developer should own different files to avoid conflicts
3. After devs finish, the Test Lead reviews (typecheck + lint + code review)
4. You compile release notes when work is ready to ship

HOW TO RESPOND:
- When given a new task: break it down, explain your plan, list developer assignments
- When asked about status: summarize current sprint state
- When asked to release: compile release notes in a clean format
- Be specific about file paths, component names, and implementation details
- If a task is ambiguous, ask ONE specific clarifying question

Always respond with a valid JSON object containing a 'text' field.`,
  prompt: `
    {{#if history}}
    Conversation History:
    {{#each history}}
    {{role}}: {{content.[0].text}}
    {{/each}}
    {{/if}}

    Product Owner: {{message}}
  `,
});

// --- Flow ---

const scrumMasterFlow = ai.defineFlow(
  {
    name: 'scrumMasterFlow',
    inputSchema: ScrumMasterInputSchema,
    outputSchema: ScrumMasterOutputSchema,
  },
  async (input) => {
    try {
      const { output } = await scrumMasterPrompt(input);
      if (!output) {
        return { text: "I couldn't process that request. Could you rephrase?" };
      }
      return output;
    } catch (e) {
      console.error('Scrum Master flow failed:', e);
      return { text: "I'm experiencing a temporary issue. Please try again in a moment." };
    }
  }
);

// --- Public API ---

export async function scrumMasterChat(input: ScrumMasterInput): Promise<ScrumMasterOutput> {
  return scrumMasterFlow(input);
}
