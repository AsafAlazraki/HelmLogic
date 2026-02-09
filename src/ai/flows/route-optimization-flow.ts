'use server';

/**
 * @fileOverview AI-powered route optimization flow for maritime operations.
 *
 * - optimizeRoute - A function that suggests the most efficient and safe route.
 * - OptimizeRouteInput - The input type for the optimizeRoute function.
 * - OptimizeRouteOutput - The return type for the optimizeRoute function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const OptimizeRouteInputSchema = z.object({
  vesselSpecs: z.string().describe('Specifications of the vessel (e.g., size, type, speed).'),
  origin: z.string().describe('Starting location for the route.'),
  destination: z.string().describe('Final location for the route.'),
  timeframe: z.string().describe('Desired timeframe for the journey (e.g., dates, time of year).'),
});
export type OptimizeRouteInput = z.infer<typeof OptimizeRouteInputSchema>;

const RouteSuggestionSchema = z.object({
  route: z.string().describe('The suggested route as a list of GPS coordinates.'),
  estimatedTravelTime: z.string().describe('The estimated travel time for the suggested route.'),
  weatherConditions: z.string().describe('The expected weather conditions along the route.'),
  trafficConditions: z.string().describe('The expected maritime traffic conditions along the route.'),
  regulatoryInformation: z.string().describe('Any relevant regulatory information for the route.'),
  safetyConsiderations: z.string().describe('Important safety considerations for the route.'),
});

const OptimizeRouteOutputSchema = z.object({
  optimalRoute: RouteSuggestionSchema.describe('The most efficient and safe route suggestion.'),
  alternativeRoutes: z.array(RouteSuggestionSchema).describe('Alternative route suggestions.'),
});
export type OptimizeRouteOutput = z.infer<typeof OptimizeRouteOutputSchema>;

export async function optimizeRoute(input: OptimizeRouteInput): Promise<OptimizeRouteOutput> {
  return optimizeRouteFlow(input);
}

const shouldConsiderWeather = ai.defineTool({
  name: 'shouldConsiderWeather',
  description: 'Determines whether weather conditions should be a significant factor in route optimization.',
  inputSchema: z.object({
    timeframe: z.string().describe('The timeframe for the journey (e.g., dates, time of year).'),
    origin: z.string().describe('The origin of the route.'),
    destination: z.string().describe('The destination of the route.'),
  }),
  outputSchema: z.boolean().describe('True if weather is a significant factor, false otherwise.'),
}, async (input) => {
  // In a real implementation, this would involve calling a weather API or service
  // to determine if the weather conditions are likely to be a significant factor.
  // For this example, we'll just return true if the timeframe includes winter months.
  const timeframe = input.timeframe.toLowerCase();
  return timeframe.includes('december') || timeframe.includes('january') || timeframe.includes('february');
});


const prompt = ai.definePrompt({
  name: 'optimizeRoutePrompt',
  input: {schema: OptimizeRouteInputSchema},
  output: {schema: OptimizeRouteOutputSchema},
  tools: [shouldConsiderWeather],
  system: `You are a maritime route optimization expert. Your task is to suggest the most efficient and safe route based on the provided details. Use the 'shouldConsiderWeather' tool to determine if the journey's timeframe requires special attention to weather conditions. If it does, prioritize routes that minimize exposure to adverse weather in your suggestions.`,
  prompt: `
  Based on the following information, provide an optimal route and alternative routes.

  Vessel Specifications: {{{vesselSpecs}}}
  Origin: {{{origin}}}
  Destination: {{{destination}}}
  Timeframe: {{{timeframe}}}

  For each route, include:
  - The route as a list of GPS coordinates.
  - Estimated travel time.
  - Expected weather conditions.
  - Expected maritime traffic conditions.
  - Any relevant regulatory information.
  - Important safety considerations.
  `,
});

const optimizeRouteFlow = ai.defineFlow(
  {
    name: 'optimizeRouteFlow',
    inputSchema: OptimizeRouteInputSchema,
    outputSchema: OptimizeRouteOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
