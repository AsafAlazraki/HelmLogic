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
    description: 'Searches the data warehouse for boat models. Handles partial names and combinations like "Highfield Classic 380".',
    inputSchema: z.object({
      searchTerm: z.string().describe('The name or partial name of the boat model to search for (e.g., "Classic 380" or "Highfield 380").'),
    }),
    outputSchema: z.array(z.object({
      id: z.string(),
      name: z.string(),
      vendorName: z.string(),
      rangeName: z.string(),
      modelCode: z.string().optional(),
      fullName: z.string().describe('The complete name including Brand and Range.'),
    })),
  },
  async (input) => {
    const { firestore } = initializeFirebase();
    const results: any[] = [];

    try {
        // 1. Fetch all vendors once
        const vendorsSnap = await getDocs(collection(firestore, 'data-warehouse'));
        const vendorMap = new Map();
        vendorsSnap.docs.forEach(d => vendorMap.set(d.id, d.data().name));

        // 2. Fetch all ranges once to resolve range names
        // Path: data-warehouse/{v}/ranges/{r}
        const rangesSnap = await getDocs(collectionGroup(firestore, 'ranges'));
        const rangeMap = new Map();
        rangesSnap.docs.forEach(d => {
            const vendorId = d.ref.parent.parent?.id;
            if (vendorId) {
                rangeMap.set(`${vendorId}/${d.id}`, d.data().name);
            }
        });

        // 3. Fetch all models
        const modelsSnap = await getDocs(collectionGroup(firestore, 'models'));
        
        const searchLower = input.searchTerm.toLowerCase();
        const searchParts = searchLower.split(' ').filter(p => p.length > 1);

        modelsSnap.docs.forEach(modelDoc => {
            const modelData = modelDoc.data();
            const name = modelData.name || '';
            const code = modelData.modelCode || '';
            
            const pathParts = modelDoc.ref.path.split('/');
            const vendorId = pathParts[1];
            const rangeId = pathParts[3];
            
            const vendorName = vendorMap.get(vendorId) || 'Unknown';
            const rangeName = rangeMap.get(`${vendorId}/${rangeId}`) || 'Unknown';
            
            const fullName = `${vendorName} ${rangeName} ${name}`.trim();
            const searchableText = `${fullName} ${code}`.toLowerCase();

            // Match if all parts of the search term are present in the model's metadata
            const isMatch = searchParts.length > 0 
                ? searchParts.every(part => searchableText.includes(part))
                : searchableText.includes(searchLower);

            if (isMatch) {
                results.push({
                    id: modelDoc.id,
                    name: name,
                    vendorName,
                    rangeName,
                    modelCode: code,
                    fullName,
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
        description: 'Retrieves technical specifications and engine requirements for a boat model.',
        inputSchema: z.object({
            modelName: z.string().describe('The specific name or model code of the boat.'),
        }),
        outputSchema: z.any(),
    },
    async (input) => {
        const { firestore } = initializeFirebase();
        
        try {
            const searchLower = input.modelName.toLowerCase();
            const modelsSnap = await getDocs(collectionGroup(firestore, 'models'));
            
            // Try exact match first
            let match = modelsSnap.docs.find(d => {
                const data = d.data();
                return (data.name?.toLowerCase() === searchLower) || (data.modelCode?.toLowerCase() === searchLower);
            });

            // If no exact match, try to see if the search term contains the model name
            if (!match) {
                match = modelsSnap.docs.find(d => {
                    const data = d.data();
                    const name = data.name?.toLowerCase();
                    const code = data.modelCode?.toLowerCase();
                    return (name && searchLower.includes(name)) || (code && searchLower.includes(code));
                });
            }

            if (!match) return { error: 'Model not found. Please try searching first to get the correct name.' };
            
            const data = match.data();
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
                const dsSnap = await getDocs(collection(firestore, `data-warehouse/${vendorDoc.id}/dataSets`));
                
                for (const dsDoc of dsSnap.docs) {
                    const dsData = dsDoc.data();
                    // Only search in motor/outboard related datasets
                    if (dsData.name.toLowerCase().includes('outboard') || dsData.name.toLowerCase().includes('motor')) {
                        const rowsSnap = await getDocs(collection(firestore, `data-warehouse/${vendorDoc.id}/dataSets/${dsDoc.id}/rows`));
                        const rows = rowsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

                        let filtered = rows;
                        if (input.hpRating) {
                            filtered = filtered.filter(r => {
                                const hp = parseInt(r['HP Rating'] || r.hp || '0');
                                return hp === input.hpRating;
                            });
                        }

                        if (input.searchTerm) {
                            const s = input.searchTerm.toLowerCase();
                            filtered = filtered.filter(r => 
                                (r['Model Name'] || r.name || '').toLowerCase().includes(s) || 
                                (r['Part Number'] || r.sku || '').toLowerCase().includes(s)
                            );
                        }
                        results.push(...filtered);
                    }
                }
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
  
  CORE WORKFLOW:
  1. If a user mentions a boat (e.g., "Highfield Classic 380"), ALWAYS use 'searchBoatModels' first to resolve the brand, range, and model name.
  2. Once the boat is identified, use 'getModelSpecs' with the model name or code to get technical data (Max HP, Weight, etc.).
  3. Use 'searchMotors' to find compatible engines based on the boat's 'Max HP' rating.
  
  GUIDELINES:
  - Be professional, concise, and technically accurate.
  - Always recommend motors that are EQUAL TO or LESS THAN the boat's Max HP rating.
  - If you can't find a direct match, offer to show similar models or ask for more details.
  
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
