'use server';
/**
 * @fileOverview HelmLogic Maritime Assistant Genkit Flow.
 * 
 * This flow provides an intelligent interface for users to query 
 * boat specifications, motor compatibility, and vendor information.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { initializeFirebase } from '@/firebase';
import { collection, query, where, getDocs, doc, getDoc, limit } from 'firebase/firestore';

// --- Data Retrieval Tools ---

/**
 * Tool to search for boat models across the data warehouse.
 */
const searchBoatModels = ai.defineTool(
  {
    name: 'searchBoatModels',
    description: 'Searches the data warehouse for boat models by name or partial name.',
    inputSchema: z.object({
      searchTerm: z.string().describe('The name or partial name of the boat model to search for.'),
    }),
    outputSchema: z.array(z.object({
      id: z.string(),
      name: z.string(),
      vendorName: z.string(),
      rangeName: z.string(),
      modelCode: z.string().optional(),
    })),
  },
  async (input) => {
    const { firestore } = initializeFirebase();
    const vendorsSnap = await getDocs(collection(firestore, 'data-warehouse'));
    const results: any[] = [];

    for (const vendorDoc of vendorsSnap.docs) {
      const vendorData = vendorDoc.data();
      if (vendorData.vendorType !== 'Boat Brand') continue;

      const rangesSnap = await getDocs(collection(firestore, `data-warehouse/${vendorDoc.id}/ranges`));
      for (const rangeDoc of rangesSnap.docs) {
          const rangeData = rangeDoc.data();
          const modelsSnap = await getDocs(collection(firestore, `data-warehouse/${vendorDoc.id}/ranges/${rangeDoc.id}/models`));
          
          modelsSnap.docs.forEach(modelDoc => {
              const modelData = modelDoc.data();
              if (modelData.name.toLowerCase().includes(input.searchTerm.toLowerCase()) || 
                  (modelData.modelCode && modelData.modelCode.toLowerCase().includes(input.searchTerm.toLowerCase()))) {
                  results.push({
                      id: modelDoc.id,
                      name: modelData.name,
                      vendorName: vendorData.name,
                      rangeName: rangeData.name,
                      modelCode: modelData.modelCode,
                  });
              }
          });
      }
    }
    return results.slice(0, 10);
  }
);

/**
 * Tool to get detailed specs for a specific model.
 */
const getModelSpecs = ai.defineTool(
    {
        name: 'getModelSpecs',
        description: 'Retrieves technical specifications and engine requirements for a specific boat model.',
        inputSchema: z.object({
            vendorName: z.string(),
            rangeName: z.string(),
            modelName: z.string(),
        }),
        outputSchema: z.any(),
    },
    async (input) => {
        const { firestore } = initializeFirebase();
        // This is a simplified lookup for the POC
        const vendorsSnap = await getDocs(query(collection(firestore, 'data-warehouse'), where('name', '==', input.vendorName)));
        if (vendorsSnap.empty) return { error: 'Vendor not found' };
        
        const vendorId = vendorsSnap.docs[0].id;
        const rangesSnap = await getDocs(collection(firestore, `data-warehouse/${vendorId}/ranges`));
        const range = rangesSnap.docs.find(d => d.data().name === input.rangeName);
        if (!range) return { error: 'Range not found' };

        const modelsSnap = await getDocs(collection(firestore, `data-warehouse/${vendorId}/ranges/${range.id}/models`));
        const model = modelsSnap.docs.find(d => d.data().name === input.modelName);
        
        return model ? model.data() : { error: 'Model not found' };
    }
);

/**
 * Tool to search for motors in the catalog.
 */
const searchMotors = ai.defineTool(
    {
        name: 'searchMotors',
        description: 'Searches for outboard motors by HP rating or model name.',
        inputSchema: z.object({
            hpRating: z.number().optional(),
            brandName: z.string().optional(),
        }),
        outputSchema: z.array(z.any()),
    },
    async (input) => {
        const { firestore } = initializeFirebase();
        const vendorsSnap = await getDocs(collection(firestore, 'data-warehouse'));
        const motorVendor = vendorsSnap.docs.find(d => d.data().vendorType === 'Motor Brand' && (!input.brandName || d.data().name.includes(input.brandName)));
        
        if (!motorVendor) return [];

        const dsSnap = await getDocs(collection(firestore, `data-warehouse/${motorVendor.id}/dataSets`));
        const targetDS = dsSnap.docs.find(s => s.data().name.toLowerCase().includes('outboard')) || dsSnap.docs[0];
        
        if (!targetDS) return [];

        const rowsSnap = await getDocs(collection(firestore, `data-warehouse/${motorVendor.id}/dataSets/${targetDS.id}/rows`));
        let results = rowsSnap.docs.map(d => d.data());

        if (input.hpRating) {
            results = results.filter(r => {
                const hp = parseInt(r['HP Rating'] || r.hp);
                return hp === input.hpRating;
            });
        }

        return results.slice(0, 10);
    }
);

// --- Flow Definition ---

const MaritimeAssistantInputSchema = z.object({
  history: z.array(z.object({
      role: z.enum(['user', 'model']),
      content: z.array(z.object({ text: z.string() }))
  })).optional(),
  message: z.string(),
});
export type MaritimeAssistantInput = z.infer<typeof MaritimeAssistantInputSchema>;

const MaritimeAssistantOutputSchema = z.object({
  text: z.string(),
});
export type MaritimeAssistantOutput = z.infer<typeof MaritimeAssistantOutputSchema>;

export async function maritimeAssistantChat(input: MaritimeAssistantInput): Promise<MaritimeAssistantOutput> {
  return maritimeAssistantFlow(input);
}

const assistantPrompt = ai.definePrompt({
  name: 'maritimeAssistantPrompt',
  input: { schema: MaritimeAssistantInputSchema },
  output: { schema: MaritimeAssistantOutputSchema },
  tools: [searchBoatModels, getModelSpecs, searchMotors],
  system: `You are the HelmLogic AI Assistant, an expert in maritime logistics, boat specifications, and motor configurations.
  
  Your goal is to help sales staff and technicians find accurate information from our Data Warehouse.
  
  GUIDELINES:
  1. Use the 'searchBoatModels' tool to find specific boats if the user mentions a name like "Classic 380".
  2. Use 'getModelSpecs' once you have found a specific model to get its technical data (Max HP, Weight, etc.).
  3. Use 'searchMotors' to find outboards that match a boat's requirements.
  4. If a user asks what motor fits a boat, check the boat's Max HP and recommend motors that are within that limit.
  5. Be professional, concise, and technically accurate.
  6. If you cannot find information in the tools, politely state that the data might not be in the warehouse yet.
  
  Always respond with a valid JSON object containing a 'text' field.`,
});

const maritimeAssistantFlow = ai.defineFlow(
  {
    name: 'maritimeAssistantFlow',
    inputSchema: MaritimeAssistantInputSchema,
    outputSchema: MaritimeAssistantOutputSchema,
  },
  async (input) => {
    const { output } = await assistantPrompt(input);
    return output!;
  }
);
