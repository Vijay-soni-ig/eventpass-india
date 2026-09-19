import { useState } from "react";
import { QrCode, TicketCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LegacyScanner from "@/pages/exhibitor/scanner/Scanner";
import UniversalScanner from "./UniversalScanner";

export default function OrganizerScanner() {
  const [mode, setMode] = useState("universal");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Check-in</h1>
        <p className="text-muted-foreground">Operate universal event ticket entry and legacy exhibition ticket scanning from one workspace.</p>
      </div>
      <Tabs value={mode} onValueChange={setMode}>
        <TabsList className="grid w-full max-w-xl grid-cols-2">
          <TabsTrigger value="universal"><TicketCheck className="mr-2 h-4 w-4" />Event Tickets</TabsTrigger>
          <TabsTrigger value="legacy"><QrCode className="mr-2 h-4 w-4" />Exhibition Tickets</TabsTrigger>
        </TabsList>
        <TabsContent value="universal" className="mt-6">
          <UniversalScanner />
        </TabsContent>
        <TabsContent value="legacy" className="mt-6">
          <LegacyScanner context="organizer" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
