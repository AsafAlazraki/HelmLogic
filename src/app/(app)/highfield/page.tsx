import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlaceHolderImages } from "@/lib/placeholder-images";

export default function HighfieldPage() {
  const highfieldImage = PlaceHolderImages.find(img => img.id === 'highfield-ship');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Highfield</h1>
      <Card>
        <CardHeader>
          <CardTitle>About Highfield</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            This is a placeholder page for the Highfield section. It demonstrates how a standard content page can be structured within the HelmLogic application layout. You can replace this content with information relevant to the Highfield feature.
          </p>
          {highfieldImage && (
             <div className="overflow-hidden rounded-lg">
                <Image
                    src={highfieldImage.imageUrl}
                    alt={highfieldImage.description}
                    width={1200}
                    height={800}
                    className="w-full h-auto object-cover"
                    data-ai-hint={highfieldImage.imageHint}
                />
             </div>
          )}
          <p>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
