'use server';
/**
 * @fileOverview HelmLogic Maritime Assistant Genkit Flow.
 * 
 * This flow provides an intelligent interface for users to query 
 * boat specifications, motor compatibility, and vendor information.
 * It uses specialized tools to search across the Brand -> Range -> Model hierarchy.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { initializeFirebase } from '@/firebase';
import { collection, query, where, getDocs, doc, getDoc, limit, collectionGroup } from 'firebase/firestore';

// --- Data Retrieval Tools ---

/**
 * Tool to search for boat models across the data warehouse.
 * Uses optimized collectionGroup query to find models across all vendors/ranges.
 * Builds a rich searchable index in-memory to handle multi-keyword queries.
 */
const searchBoatModels = ai.defineTool(
  {
    name: 'searchBoatModels',
    description: 'Searches the data warehouse for boat models. Use this for queries like "Highfield Classic 380" or just "380".',
    inputSchema: z.object({
      searchTerm: z.string().describe('The search query (e.g., "Classic 380" or "Stacer 429").'),
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
        // 1. Fetch all vendors and ranges in parallel to build context maps
        const [vendorsSnap, rangesSnap] = await Promise.all([
            getDocs(collection(firestore, 'data-warehouse')),
            getDocs(collectionGroup(firestore, 'ranges'))
        ]);

        const vendorMap = new Map();
        vendorsSnap.docs.forEach(d => vendorMap.set(d.id, d.data().name));

        const rangeMap = new Map();
        rangesSnap.docs.forEach(d => {
            const vendorId = d.ref.parent.parent?.id;
            if (vendorId) {
                rangeMap.set(`${vendorId}/${d.id}`, d.data().name);
            }
        });

        // 2. Fetch all models
        const modelsSnap = await getDocs(collectionGroup(firestore, 'models'));
        
        const searchLower = input.searchTerm.toLowerCase();
        // Split search into keywords, ignore very short ones
        const searchParts = searchLower.split(/[\s-]+/).filter(p => p.length > 1);

        modelsSnap.docs.forEach(modelDoc => {
            const modelData = modelDoc.data();
            const name = modelData.name || '';
            const code = modelData.modelCode || '';
            
            const pathParts = modelDoc.ref.path.split('/');
            const vendorId = pathParts[1];
            const rangeId = pathParts[3];
            
            const vendorName = vendorMap.get(vendorId) || '';
            const rangeName = rangeMap.get(`${vendorId}/${rangeId}`) || '';
            
            // Build a rich searchable string: "Highfield Classic 380 CL380"
            const fullName = `${vendorName} ${rangeName} ${name}`.trim();
            const searchableText = `${vendorName} ${rangeName} ${name} ${code}`.toLowerCase();

            // Match if ALL parts of the user's query are present in our searchable text
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

    // Return the best 10 matches
    return results.slice(0, 10);
  }
);

/**
 * Tool to get detailed specs for a specific model.
 * Handles slight variations in names by doing a fallback search if exact lookup fails.
 */
const getModelSpecs = ai.defineTool(
    {
        name: 'getModelSpecs',
        description: 'Retrieves technical specifications and engine requirements for a identified boat model.',
        inputSchema: z.object({
            modelNameOrId: z.string().describe('The name or ID of the boat to look up.'),
        }),
        outputSchema: z.any(),
    },
    async (input) => {
        const { firestore } = initializeFirebase();
        
        try {
            const searchLower = input.modelNameOrId.toLowerCase();
            const modelsSnap = await getDocs(collectionGroup(firestore, 'models'));
            
            // 1. Try exact match on ID, Name or Model Code
            let match = modelsSnap.docs.find(d => {
                const data = d.data();
                return d.id === input.modelNameOrId || 
                       (data.name?.toLowerCase() === searchLower) || 
                       (data.modelCode?.toLowerCase() === searchLower);
            });

            // 2. Fallback: Search for the most relevant match if no exact hit
            if (!match) {
                match = modelsSnap.docs.find(d => {
                    const data = d.data();
                    const searchable = `${data.name} ${data.modelCode}`.toLowerCase();
                    return searchable.includes(searchLower) || searchLower.includes(data.name?.toLowerCase() || '___');
                });
            }

            if (!match) return { error: 'Model specifications not found. Try searching for the boat first.' };
            
            const data = match.data();
            return {
                id: match.id,
                name: data.name,
                modelCode: data.modelCode,
                specifications: data.specifications || {},
                standardFeatures: data.standardFeatures || [],
                optionalFeatures: (data.optionalFeatures || []).map((f: any) => ({
                    name: f.name,
                    category: f.category,
                    code: f.code
                })),
            };
        } catch (e) {
            return { error: 'Data retrieval failed during spec lookup.' };
        }
    }
);

/**
 * Tool to search for motors in the catalog.
 */
const searchMotors = ai.defineTool(
    {
        name: 'searchMotors',
        description: 'Searches for outboard motors. Filter by HP or search by model name/part number.',
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
                    const isMotorDataset = dsData.name.toLowerCase().includes('outboard') || 
                                         dsData.name.toLowerCase().includes('motor') ||
                                         dsData.name.toLowerCase().includes('engine');
                                         
                    if (isMotorDataset) {
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
  system: `You are the HelmLogic AI Assistant, a high-level specialist in maritime logistics, boat specifications, and motor compatibility.
  
  Your primary objective is to help sales staff find accurate technical information from our Data Warehouse.
  
  SPECIAL THINKING PROTOCOL:
  When a user provides a name like "Highfield Classic 380", they are giving you a hierarchy: Brand (Highfield), Range (Classic), and Model (380).
  1. ALWAYS use 'searchBoatModels' first. Do not guess specs.
  2. If the user provides a string with multiple parts, search for the most specific part (e.g., "380") or the full string.
  3. Once you get search results, confirm the Brand and Range match the user's intent.
  4. Use the specific 'id' or 'name' from the search results to call 'getModelSpecs'.
  5. If looking for motors, use the 'Max HP' from 'getModelSpecs' to call 'searchMotors'.
  
  GUIDELINES:
  - Be precise and technical.
  - If you cannot find a boat after searching, ask for the Brand and Model Code separately.
  - Recommended motors must ALWAYS be equal to or less than the boat's Max HP rating.
  - Always respond with a professional tone.
  
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
    try {
        const { output } = await assistantPrompt(input);
        if (!output) {
            return { text: "I'm sorry, I couldn't process that. Please try searching for the boat model specifically." };
        }
        return output;
    } catch (e) {
        console.error("Flow execution failed:", e);
        return { text: "The system is currently busy. Please try asking again in a moment." };
    }
  }
);
