'use server';
/**
 * @fileOverview A Genkit flow for dynamically adjusting maritime routes based on real-time data.
 *
 * - dataDrivenRouteAdjustments - A function that orchestrates route adjustments based on weather and traffic data.
 * - DataDrivenRouteAdjustmentsInput - The input type for the dataDrivenRouteAdjustments function.
 * - DataDrivenRouteAdjustmentsOutput - The return type for the dataDrivenRouteAdjustments function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const DataDrivenRouteAdjustmentsInputSchema = z.object({
  currentRoute: z.string().describe('The current maritime route.'),
  vesselSpecs: z.string().describe('Specifications of the vessel.'),
  weatherConditions: z.string().describe('Current weather conditions along the route.'),
  trafficDensity: z.string().describe('Traffic density report along the route.'),
  regulations: z.string().describe('Regulations applicable to the route'),
});

export type DataDrivenRouteAdjustmentsInput = z.infer<typeof DataDrivenRouteAdjustmentsInputSchema>;

const DataDrivenRouteAdjustmentsOutputSchema = z.object({
  adjustedRoute: z.string().describe('The adjusted maritime route based on real-time data.'),
  reasoning: z.string().describe('The reasoning behind the route adjustment.'),
});

export type DataDrivenRouteAdjustmentsOutput = z.infer<typeof DataDrivenRouteAdjustmentsOutputSchema>;


export async function dataDrivenRouteAdjustments(input: DataDrivenRouteAdjustmentsInput): Promise<DataDrivenRouteAdjustmentsOutput> {
  return dataDrivenRouteAdjustmentsFlow(input);
}

const shouldConsiderWeatherTool = ai.defineTool({
  name: 'shouldConsiderWeather',
  description: 'Determine if weather conditions warrant a route adjustment.',
  inputSchema: z.object({
    weatherConditions: z.string().describe('Current weather conditions along the route.'),
  }),
  outputSchema: z.boolean().describe('Whether weather conditions require a route adjustment.'),
},
async (input) => {
    // Basic logic to determine if weather should be considered; refine as needed
    return input.weatherConditions.toLowerCase().includes('storm') || input.weatherConditions.toLowerCase().includes('heavy rain');
});

const shouldConsiderTrafficTool = ai.defineTool({
  name: 'shouldConsiderTraffic',
  description: 'Determine if traffic density warrants a route adjustment.',
  inputSchema: z.object({
    trafficDensity: z.string().describe('Traffic density report along the route.'),
  }),
  outputSchema: z.boolean().describe('Whether traffic density requires a route adjustment.'),
},
async (input) => {
  // Basic logic to determine if traffic should be considered; refine as needed
  return input.trafficDensity.toLowerCase().includes('high') || input.trafficDensity.toLowerCase().includes('congestion');
});

const adjustRoutePrompt = ai.definePrompt({
  name: 'adjustRoutePrompt',
  input: {schema: DataDrivenRouteAdjustmentsInputSchema},
  output: {schema: DataDrivenRouteAdjustmentsOutputSchema},
  tools: [shouldConsiderWeatherTool, shouldConsiderTrafficTool],
  system: `You are a maritime route optimization expert. Given the current route, vessel specifications, weather conditions, traffic density, and regulations, you will adjust the route for optimized efficiency and safety.

  Current Route: {{{currentRoute}}}
  Vessel Specs: {{{vesselSpecs}}}
  Weather Conditions: {{{weatherConditions}}}
  Traffic Density: {{{trafficDensity}}}
  Regulations: {{{regulations}}}

  Based on the provided information, adjust the route as necessary. Consider using the shouldConsiderWeather and shouldConsiderTraffic tools to determine if weather or traffic conditions warrant a route adjustment. Explain your reasoning for the adjustment.
  `, 
  prompt: `Adjust the route based on the provided information and reasoning. Return the adjusted route and reasoning.`, 
});

const dataDrivenRouteAdjustmentsFlow = ai.defineFlow(
  {
    name: 'dataDrivenRouteAdjustmentsFlow',
    inputSchema: DataDrivenRouteAdjustmentsInputSchema,
    outputSchema: DataDrivenRouteAdjustmentsOutputSchema,
  },
  async input => {
    const {output} = await adjustRoutePrompt(input);
    return output!;
  }
);
