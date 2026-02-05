'use server';
/**
 * @fileOverview A Genkit flow for analyzing JSON data using AI.
 *
 * - analyzeJson - A function that analyzes a JSON string and provides insights.
 * - AnalyzeJsonInput - The input type for the analyzeJson function.
 * - AnalyzeJsonOutput - The return type for the analyzeJson function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const AnalyzeJsonInputSchema = z.object({
  jsonString: z.string().describe('A JSON string to be analyzed.'),
});
export type AnalyzeJsonInput = z.infer<typeof AnalyzeJsonInputSchema>;

const AnalyzeJsonOutputSchema = z.object({
  summary: z.string().describe("A brief summary of the JSON data's content and structure."),
  keyFields: z.array(z.string()).describe('A list of the most important or identifying fields in the data.'),
  usageSuggestions: z.string().describe('Suggestions on how this data could be used or visualized in an application.'),
});
export type AnalyzeJsonOutput = z.infer<typeof AnalyzeJsonOutputSchema>;

export async function analyzeJson(input: AnalyzeJsonInput): Promise<AnalyzeJsonOutput> {
  return analyzeJsonFlow(input);
}

const analyzeJsonPrompt = ai.definePrompt({
  name: 'analyzeJsonPrompt',
  input: { schema: AnalyzeJsonInputSchema },
  output: { schema: AnalyzeJsonOutputSchema },
  prompt: `You are an expert data analyst. Your task is to analyze the provided JSON data and provide a concise analysis.

Here is the JSON data:
\`\`\`json
{{{jsonString}}}
\`\`\`

Please perform the following actions:
1.  Provide a brief summary of the data's content and structure. What does the data represent? Is it a list of items or a single object?
2.  Identify and list the key fields that are most important for understanding each item in the data.
3.  Provide a short paragraph with suggestions on how this data could be used or visualized within a business application.
`,
});


const analyzeJsonFlow = ai.defineFlow(
  {
    name: 'analyzeJsonFlow',
    inputSchema: AnalyzeJsonInputSchema,
    outputSchema: AnalyzeJsonOutputSchema,
  },
  async (input) => {
    const { output } = await analyzeJsonPrompt(input);
    if (!output) {
      throw new Error("The AI model did not return any output.");
    }
    return output;
  }
);
