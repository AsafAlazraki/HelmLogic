'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HighfieldModelEditor } from '@/components/highfield-model-editor';
import { JeanneauModelEditor } from '@/components/jeanneau-model-editor';
import { StacerModelEditor } from '@/components/stacer-model-editor';
import { StabicraftModelEditor } from '@/components/stabicraft-model-editor';
import { SurteesModelEditor } from '@/components/surtees-model-editor';

export function ModelConfigurationEditor({ model, docPath, vendor }: { model: any, docPath: string, vendor: any }) {
    const getModelEditor = () => {
        if (!model || !vendor || !docPath) return <p>Select a model to view details.</p>;

        switch (vendor.slug) {
            case 'highfield': return <HighfieldModelEditor model={model} docPath={docPath} />;
            case 'jeanneau': return <JeanneauModelEditor model={model} docPath={docPath} />;
            case 'stacer': return <StacerModelEditor model={model} docPath={docPath} />;
            case 'stabicraft': return <StabicraftModelEditor model={model} docPath={docPath} />;
            case 'surtees': return <SurteesModelEditor model={model} docPath={docPath} />;
            default: return <Card><CardHeader><CardTitle>Editor Not Available</CardTitle></CardHeader><CardContent>A specific editor has not been configured for this vendor.</CardContent></Card>;
        }
    };

    return (
        <Tabs defaultValue="boat" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="boat">Boat</TabsTrigger>
                <TabsTrigger value="motor">Motor</TabsTrigger>
                <TabsTrigger value="trailer">Trailer</TabsTrigger>
                <TabsTrigger value="dealer-fit">Dealer Fit Options</TabsTrigger>
            </TabsList>
            <TabsContent value="boat">
                {getModelEditor()}
            </TabsContent>
            <TabsContent value="motor">
                <Card>
                    <CardHeader>
                        <CardTitle>Motor Options</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground">Motor configuration options will be available here soon.</p>
                    </CardContent>
                </Card>
            </TabsContent>
            <TabsContent value="trailer">
                <Card>
                    <CardHeader>
                        <CardTitle>Trailer Options</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground">Trailer configuration options will be available here soon.</p>
                    </CardContent>
                </Card>
            </TabsContent>
            <TabsContent value="dealer-fit">
                <Card>
                    <CardHeader>
                        <CardTitle>Dealer Fit Options</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground">Dealer fit options will be available here soon.</p>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
    );
}
    