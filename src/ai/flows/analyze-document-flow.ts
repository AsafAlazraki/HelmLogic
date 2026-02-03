'use server';
/**
 * @fileOverview A Genkit flow for analyzing uploaded documents using AI.
 *
 * - analyzeDocument - A function that analyzes a document and extracts structured data.
 * - AnalyzeDocumentInput - The input type for the analyzeDocument function.
 * - AnalyzeDocumentOutput - The return type for the analyzeDocument function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const AnalyzeDocumentInputSchema = z.object({
  fileDataUri: z.string().describe("A file as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."),
  analysisInstructions: z.string().describe('User instructions on how to analyze and what to extract from the data.'),
});
export type AnalyzeDocumentInput = z.infer<typeof AnalyzeDocumentInputSchema>;

// This is the schema of the object the AI model is asked to return.
// We ask for a JSON string to avoid strict schema validation issues with nested dynamic objects.
const AiOutputSchema = z.object({
  summary: z.string().describe("A brief summary of the document's content."),
  extractedDataJson: z.string().describe('The data extracted from the document, structured as a JSON string representing an array of objects. It must be a valid JSON string.'),
  suggestedColumns: z.array(z.object({ key: z.string(), label: z.string() })).describe('Suggested columns for displaying the data in a table.'),
});

// This is the final output schema of the flow, after parsing the JSON string.
// This is also what the front-end component expects.
const AnalyzeDocumentOutputSchema = z.object({
  summary: z.string().describe("A brief summary of the document's content."),
  extractedData: z.array(z.record(z.string(), z.any())).describe('The data extracted from the document, structured as an array of objects.'),
  suggestedColumns: z.array(z.object({ key: z.string(), label: z.string() })).describe('Suggested columns for displaying the data in a table.'),
});
export type AnalyzeDocumentOutput = z.infer<typeof AnalyzeDocumentOutputSchema>;

export async function analyzeDocument(input: AnalyzeDocumentInput): Promise<AnalyzeDocumentOutput> {
  return analyzeDocumentFlow(input);
}

const analyzeDocumentPrompt = ai.definePrompt({
  name: 'analyzeDocumentPrompt',
  input: { schema: AnalyzeDocumentInputSchema },
  // The prompt returns the AI-specific output schema
  output: { schema: AiOutputSchema },
  prompt: `You are a data analysis expert. Your task is to analyze the provided file and extract structured data from it based on user instructions.

The user has provided the following instructions:
"{{{analysisInstructions}}}"

Here is the file:
{{media url=fileDataUri}}

Please perform the following actions:
1.  Provide a concise, one-paragraph summary of the document's content.
2.  Extract the most relevant tabular data from the document as a valid JSON string representing an array of JSON objects. The keys for the objects should be consistent, descriptive, and in camelCase. This string will be parsed by a machine, so it must be valid JSON.
3.  Based on the extracted data, suggest a list of columns for displaying this data in a table. For each column, provide a 'key' that matches the keys in your extractedData objects, and a 'label' that is a human-readable name for the column header.
If the document does not contain clear tabular data, do your best to structure the information you can find. If the document is not a text-based format or image that you can read, state that you cannot process the file type.
`,
});


const analyzeDocumentFlow = ai.defineFlow(
  {
    name: 'analyzeDocumentFlow',
    inputSchema: AnalyzeDocumentInputSchema,
    // The flow returns the final, parsed output schema
    outputSchema: AnalyzeDocumentOutputSchema,
  },
  async (input) => {
    // We use a model that supports multimodal input (like documents and images).
    const { output: aiOutput } = await analyzeDocumentPrompt(input);
    if (!aiOutput) {
      throw new Error("The AI model did not return any output.");
    }
    
    try {
        const extractedData = JSON.parse(aiOutput.extractedDataJson);
        const finalOutput: AnalyzeDocumentOutput = {
            summary: aiOutput.summary,
            suggestedColumns: aiOutput.suggestedColumns,
            extractedData: extractedData,
        };
        return finalOutput;
    } catch (e) {
        console.error("Failed to parse extractedDataJson from AI output:", e, "Raw JSON string:", aiOutput.extractedDataJson);
        throw new Error("The AI returned invalid JSON for the extracted data. Please try again.");
    }
  }
);
