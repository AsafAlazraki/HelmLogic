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
import { collection, query, where, getDocs, doc, getDoc, limit, collectionGroup } from 'firebase/firestore';

// --- Data Retrieval Tools ---

/**
 * Tool to search for boat models across the data warehouse.
 * Uses optimized collectionGroup query to find models across all vendors/ranges.
 */
const searchBoatModels = ai.defineTool(
  {
    name: 'searchBoatModels',
    description: 'Searches the data warehouse for boat models by name or partial name across all brands.',
    inputSchema: z.object({
      searchTerm: z.string().describe('The name or partial name of the boat model to search for.'),
    }),
    outputSchema: z.array(z.object({
      id: z.string(),
      name: z.string(),
      vendorName: z.string().optional(),
      rangeName: z.string().optional(),
      modelCode: z.string().optional(),
    })),
  },
  async (input) => {
    const { firestore } = initializeFirebase();
    const results: any[] = [];

    try {
        // 1. Fetch all vendors once to have a name map
        const vendorsSnap = await getDocs(collection(firestore, 'data-warehouse'));
        const vendorMap = new Map();
        vendorsSnap.docs.forEach(d => vendorMap.set(d.id, d.data().name));

        // 2. Fetch all models using optimized collectionGroup
        // This avoids deep nested loops
        const modelsSnap = await getDocs(collectionGroup(firestore, 'models'));
        
        const searchLower = input.searchTerm.toLowerCase();

        modelsSnap.docs.forEach(modelDoc => {
            const modelData = modelDoc.data();
            const name = modelData.name || '';
            const code = modelData.modelCode || '';

            if (name.toLowerCase().includes(searchLower) || code.toLowerCase().includes(searchLower)) {
                // Try to resolve vendor name from parent path if not in doc
                // Path format: data-warehouse/{vendorId}/ranges/{rangeId}/models/{modelId}
                const pathParts = modelDoc.ref.path.split('/');
                const vendorId = pathParts[1];
                
                results.push({
                    id: modelDoc.id,
                    name: name,
                    vendorName: vendorMap.get(vendorId) || 'Unknown Vendor',
                    modelCode: code,
                });
            }
        });
    } catch (e) {
        console.error("Tool 'searchBoatModels' failed:", e);
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
            modelName: z.string().describe('The specific name or model code of the boat.'),
        }),
        outputSchema: z.any(),
    },
    async (input) => {
        const { firestore } = initializeFirebase();
        
        try {
            const modelsSnap = await getDocs(collectionGroup(firestore, 'models'));
            const searchLower = input.modelName.toLowerCase();
            
            const match = modelsSnap.docs.find(d => {
                const data = d.data();
                return (data.name?.toLowerCase() === searchLower) || (data.modelCode?.toLowerCase() === searchLower);
            });

            if (!match) return { error: 'Model not found' };
            
            const data = match.data();
            // Flatten specs for the AI
            return {
                name: data.name,
                modelCode: data.modelCode,
                specifications: data.specifications || {},
                standardFeatures: data.standardFeatures || [],
                optionalFeatures: (data.optionalFeatures || []).map((f: any) => f.name),
            };
        } catch (e) {
            return { error: 'Data retrieval failed' };
        }
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
            hpRating: z.number().optional().describe('Filter by specific Horsepower rating.'),
            searchTerm: z.string().optional().describe('Search by motor model name or part number.'),
        }),
        outputSchema: z.array(z.any()),
    },
    async (input) => {
        const { firestore } = initializeFirebase();
        const results: any[] = [];

        try {
            // 1. Find Motor Brand vendors
            const vendorsSnap = await getDocs(query(collection(firestore, 'data-warehouse'), where('vendorType', '==', 'Motor Brand')));
            
            for (const vendorDoc of vendorsSnap.docs) {
                // 2. Fetch rows directly from masterDataSet if it exists, or look for datasets
                const masterSnap = await getDocs(collection(firestore, `data-warehouse/${vendorDoc.id}/masterDataSet`));
                
                let rows = masterSnap.docs.map(d => ({ id: d.id, ...d.data() }));

                // 3. Fallback to dataSets if master is empty
                if (rows.length === 0) {
                    const dsSnap = await getDocs(collection(firestore, `data-warehouse/${vendorDoc.id}/dataSets`));
                    for (const dsDoc of dsSnap.docs) {
                        const rowsSnap = await getDocs(collection(firestore, `data-warehouse/${vendorDoc.id}/dataSets/${dsDoc.id}/rows`));
                        rows = rows.concat(rowsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
                    }
                }

                // 4. Filter
                if (input.hpRating) {
                    rows = rows.filter(r => {
                        const hp = parseInt(r['HP Rating'] || r.hp || '0');
                        return hp === input.hpRating;
                    });
                }

                if (input.searchTerm) {
                    const s = input.searchTerm.toLowerCase();
                    rows = rows.filter(r => 
                        (r['Model Name'] || r.name || '').toLowerCase().includes(s) || 
                        (r['Part Number'] || r.sku || '').toLowerCase().includes(s)
                    );
                }

                results.push(...rows);
            }
        } catch (e) {
            console.error("Tool 'searchMotors' failed:", e);
        }

        return results.slice(0, 15);
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
  1. Use 'searchBoatModels' to find boats if the user is broad (e.g. "Show me Highfield boats").
  2. Use 'getModelSpecs' to get specific technical data (Max HP, Weight, etc.) once a boat is identified.
  3. Use 'searchMotors' to find outboards.
  4. If asked "What motors fit X boat?", FIRST use 'getModelSpecs' to find the boat's Max HP, then use 'searchMotors' to find engines within that range.
  5. Always recommend motors that are EQUAL TO or LESS THAN the boat's Max HP rating.
  6. Be professional, concise, and technically accurate.
  
  Always respond with a valid JSON object containing a 'text' field.`,
  prompt: `
    {{#if history}}
    Conversation History:
    {{#each history}}
    {{role}}: {{content.[0].text}}
    {{/each}}
    {{/if}}
    
    User: {{message}}
  `,
});

const maritimeAssistantFlow = ai.defineFlow(
  {
    name: 'maritimeAssistantFlow',
    inputSchema: MaritimeAssistantInputSchema,
    outputSchema: MaritimeAssistantOutputSchema,
  },
  async (input) => {
    const { output } = await assistantPrompt(input);
    if (!output) {
      return { text: "I'm sorry, I encountered an error processing your request. Please try again." };
    }
    return output;
  }
);
