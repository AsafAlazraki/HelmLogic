'use server';
/**
 * @fileOverview A Genkit flow for analyzing and restructuring JSON data using AI.
 *
 * - analyzeJson - A function that analyzes and transforms a JSON string based on user instructions.
 * - AnalyzeJsonInput - The input type for the analyzeJson function.
 * - AnalyzeJsonOutput - The return type for the analyzeJson function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const AnalyzeJsonInputSchema = z.object({
  jsonString: z.string().describe('A JSON string to be analyzed.'),
  instructions: z.string().describe('User instructions on how to restructure or what to extract from the JSON data.'),
});
export type AnalyzeJsonInput = z.infer<typeof AnalyzeJsonInputSchema>;

// Schema for the direct AI output
const AiOutputSchema = z.object({
  summary: z.string().describe("A brief summary of the data transformation performed."),
  restructuredJson: z.string().describe('The restructured data, formatted as a valid JSON string.'),
});

// Schema for the final flow output
const AnalyzeJsonOutputSchema = z.object({
  summary: z.string().describe("A brief summary of the data transformation performed."),
  restructuredData: z.any().describe('The restructured data as a parsed JSON object or array.'),
});
export type AnalyzeJsonOutput = z.infer<typeof AnalyzeJsonOutputSchema>;

export async function analyzeJson(input: AnalyzeJsonInput): Promise<AnalyzeJsonOutput> {
  return analyzeJsonFlow(input);
}

const analyzeJsonPrompt = ai.definePrompt({
  name: 'analyzeJsonPrompt',
  input: { schema: AnalyzeJsonInputSchema },
  output: { schema: AiOutputSchema },
  prompt: `You are an expert data analyst who specializes in transforming JSON data. Your task is to analyze the provided JSON data and restructure it based on the user's instructions.

Here is the JSON data:
\`\`\`json
{{{jsonString}}}
\`\`\`

The user has provided the following instructions:
"{{{instructions}}}"

Please perform the following actions:
1.  Provide a brief summary of the transformation you are about to perform.
2.  Restructure the JSON data according to the user's instructions. The value for 'restructuredJson' must be a valid JSON string that can be parsed programmatically. It should NOT be wrapped in markdown backticks. Pay close attention to hierarchical structures if the user requests them. If the user asks to extract specific fields, only include those fields.
`,
});


const analyzeJsonFlow = ai.defineFlow(
  {
    name: 'analyzeJsonFlow',
    inputSchema: AnalyzeJsonInputSchema,
    outputSchema: AnalyzeJsonOutputSchema,
  },
  async (input) => {
    const { output: aiOutput } = await analyzeJsonPrompt(input);
    if (!aiOutput) {
      throw new Error("The AI model did not return any output.");
    }
    try {
        const restructuredData = JSON.parse(aiOutput.restructuredJson);
        const finalOutput: AnalyzeJsonOutput = {
            summary: aiOutput.summary,
            restructuredData: restructuredData,
        };
        return finalOutput;
    } catch (e) {
        console.error("Failed to parse restructuredJson from AI output:", e, "Raw JSON string:", aiOutput.restructuredJson);
        throw new Error("The AI returned invalid JSON for the restructured data. Please try again.");
    }
  }
);
