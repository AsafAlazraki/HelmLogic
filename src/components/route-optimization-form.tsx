"use client";

import { useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Loader2, Ship, MapPin, Calendar, Sailboat, Check, Shield, AlertTriangle } from "lucide-react";
import type { OptimizeRouteOutput } from "@/ai/flows/route-optimization-flow";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  vesselSpecs: z.string().min(10, "Please provide detailed vessel specifications."),
  origin: z.string().min(2, "Origin is required."),
  destination: z.string().min(2, "Destination is required."),
  timeframe: z.string().min(3, "Timeframe is required."),
});

type FormValues = z.infer<typeof formSchema>;

type RouteOptimizationFormProps = {
  optimize: (values: FormValues) => Promise<OptimizeRouteOutput | null>;
};

export function RouteOptimizationForm({ optimize }: RouteOptimizationFormProps) {
  const [result, setResult] = useState<OptimizeRouteOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      vesselSpecs: "",
      origin: "",
      destination: "",
      timeframe: "",
    },
  });

  const onSubmit: SubmitHandler<FormValues> = async (data) => {
    setIsLoading(true);
    setResult(null);
    try {
      const response = await optimize(data);
      if (response) {
        setResult(response);
      } else {
        throw new Error("Received an empty response from the optimization service.");
      }
    } catch (error) {
      console.error("Optimization failed:", error);
      toast({
        variant: "destructive",
        title: "Optimization Failed",
        description: "Could not generate routes. Please try again later.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const RouteDetails = ({ route }: { route: OptimizeRouteOutput["optimalRoute"] }) => (
    <div className="space-y-4 text-sm">
        <p><span className="font-semibold">Route:</span> {route.route}</p>
        <p><span className="font-semibold">Est. Travel Time:</span> {route.estimatedTravelTime}</p>
        <p><span className="font-semibold">Weather Conditions:</span> {route.weatherConditions}</p>
        <p><span className="font-semibold">Traffic Conditions:</span> {route.trafficConditions}</p>
        <p><span className="font-semibold">Regulatory Info:</span> {route.regulatoryInformation}</p>
        <p><span className="font-semibold text-destructive">Safety Considerations:</span> {route.safetyConsiderations}</p>
    </div>
  );

  return (
    <div className="grid gap-8 md:grid-cols-12">
      <div className="md:col-span-4 lg:col-span-3">
        <Card>
          <CardHeader>
            <CardTitle>Route Parameters</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="vesselSpecs"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2"><Ship className="h-4 w-4"/> Vessel Specs</FormLabel>
                      <FormControl>
                        <Textarea placeholder="e.g., Panamax container ship, 25 knots max speed" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="origin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2"><MapPin className="h-4 w-4"/> Origin</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Port of Shanghai" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="destination"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2"><MapPin className="h-4 w-4"/> Destination</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Port of Rotterdam" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="timeframe"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2"><Calendar className="h-4 w-4"/> Timeframe</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Mid-December" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={isLoading} className="w-full">
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Optimizing...
                    </>
                  ) : (
                    "Optimize Route"
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
      <div className="md:col-span-8 lg:col-span-9">
        <Card className="min-h-full">
          <CardHeader>
            <CardTitle>Suggested Routes</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && (
              <div className="flex flex-col items-center justify-center gap-4 py-16 text-muted-foreground">
                <Sailboat className="h-16 w-16 animate-pulse"/>
                <p>Analyzing routes with GenAI...</p>
              </div>
            )}
            {result && (
              <Accordion type="single" collapsible defaultValue="item-0">
                <AccordionItem value="item-0">
                  <AccordionTrigger className="text-lg font-semibold text-primary">
                    <div className="flex items-center gap-2">
                        <Check className="h-5 w-5"/> Optimal Route
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-2">
                    <RouteDetails route={result.optimalRoute} />
                  </AccordionContent>
                </AccordionItem>
                {result.alternativeRoutes.map((route, index) => (
                  <AccordionItem value={`item-${index + 1}`} key={index}>
                    <AccordionTrigger>
                        <div className="flex items-center gap-2">
                            <Shield className="h-5 w-5"/> Alternative Route {index + 1}
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-2">
                      <RouteDetails route={route} />
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
            {!isLoading && !result && (
              <div className="flex flex-col items-center justify-center gap-4 py-16 text-muted-foreground">
                 <AlertTriangle className="h-16 w-16"/>
                <p>Enter parameters and click "Optimize Route" to see results.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
