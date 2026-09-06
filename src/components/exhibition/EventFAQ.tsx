import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

// Phase 25 — organizer-entered FAQ (ExhibitionFAQ), reusing the exact same
// Accordion pattern already established for ContactUs.tsx/HelpCenter.tsx
// (single-open, same card styling) rather than inventing another pattern.
// Renders nothing if the organizer hasn't added any FAQs.
export function EventFAQ({ faqs }: { faqs: FAQItem[] | undefined }) {
  const items = faqs ?? [];
  if (items.length === 0) return null;

  return (
    <div>
      <h2 className="font-display text-xl font-semibold mb-4">Frequently Asked Questions</h2>
      <Accordion type="single" collapsible className="space-y-3">
        {items.map((item) => (
          <AccordionItem key={item.id} value={item.id} className="card-premium border rounded-xl px-4">
            <AccordionTrigger className="hover:no-underline text-left py-4 min-h-[44px]">
              <span className="font-medium">{item.question}</span>
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground whitespace-pre-line">
              {item.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
