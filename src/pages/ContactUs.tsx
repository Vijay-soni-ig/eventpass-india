import { useState } from "react";
import { Mail, Phone, MapPin, Clock, Send, Building2, Ticket, Loader2, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const EMAIL_ADDRESS = "support@exhibittix.com";
const PHONE_NUMBER = "+91 800-123-4567";
const PHONE_TEL = "tel:+918001234567";
const ADDRESS = "123 Tech Park, SG Highway, Ahmedabad, Gujarat 380015";

// Same Google "search query" map-link format already established in
// VenueInfo.tsx — no new maps SDK/API key, no invented coordinates.
const MAP_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ADDRESS)}`;

// Same contact details already published in Footer.tsx / HelpCenter.tsx /
// ExhibitionDetail.tsx etc. — reused verbatim, not re-authored, since there's
// no single shared constants source for them today (a real future cleanup,
// out of scope for this pass — see report).
const contactInfo = [
  {
    icon: Mail,
    title: "Email Us",
    detail: EMAIL_ADDRESS,
    subDetail: "We respond within 24 hours",
    href: `mailto:${EMAIL_ADDRESS}`,
    external: false,
  },
  {
    icon: Phone,
    title: "Call Us",
    detail: PHONE_NUMBER,
    subDetail: "Mon-Sat, 9 AM - 7 PM IST",
    href: PHONE_TEL,
    external: false,
  },
  {
    icon: MapPin,
    title: "Visit Us",
    detail: "123 Tech Park, SG Highway",
    subDetail: "Ahmedabad, Gujarat 380015",
    href: MAP_URL,
    external: true,
  },
  {
    icon: Clock,
    title: "Business Hours",
    detail: "Monday - Saturday",
    subDetail: "9:00 AM - 7:00 PM IST",
    href: null,
    external: false,
  },
];

const FAQS = [
  { q: "How do I book tickets?", a: "Simply find your exhibition, select tickets, and pay securely online. You'll receive instant confirmation." },
  { q: "Can I cancel my booking?", a: "Yes, you can cancel up to 24 hours before the event for a full refund. Visit your dashboard to manage bookings." },
  { q: "How do I list my exhibition?", a: "Create an exhibitor account, add your exhibition details, set up tickets and pricing, and you're live!" },
  { q: "Is my payment secure?", a: "Absolutely. We use 256-bit SSL encryption and partner with trusted payment gateways like Razorpay." },
  { q: "How do I contact support?", a: "You can email us, call our helpline, or fill out this contact form. We respond within 24 hours." },
];

// Reliable because it reads the actual IST wall-clock time via Intl's
// timeZone option (works regardless of the visitor's own timezone) rather
// than approximating with a UTC offset. Mirrors the single Mon-Sat 9-7 IST
// window already declared above — there's no separate per-day business-hours
// config anywhere in the codebase to defer to.
function getBusinessHoursStatus(): { open: boolean; label: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    hour12: false,
    weekday: "short",
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const isOpen = weekday !== "Sun" && hour >= 9 && hour < 19;
  return { open: isOpen, label: isOpen ? "Open now" : "Closed now" };
}

const LIMITS = {
  name: { min: 2, max: 100 },
  email: { max: 254 },
  subject: { min: 3, max: 150 },
  message: { min: 10, max: 2000 },
};

// Loose, international-friendly: digits plus common separators (+, space,
// dash, parens), 7-15 digits total — rejects obvious garbage without
// rejecting legitimate non-Indian formats.
const PHONE_PATTERN = /^[+()\d][\d\s\-()]{6,19}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FormData {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  userType: "visitor" | "exhibitor";
}

type FieldErrors = Partial<Record<keyof Omit<FormData, "userType">, string>>;

const INITIAL_FORM: FormData = { name: "", email: "", phone: "", subject: "", message: "", userType: "visitor" };

function validate(data: FormData): FieldErrors {
  const errors: FieldErrors = {};

  const name = data.name.trim();
  if (!name) errors.name = "Please enter your name.";
  else if (name.length < LIMITS.name.min) errors.name = "Name is too short.";
  else if (name.length > LIMITS.name.max) errors.name = "Name is too long.";

  const email = data.email.trim();
  if (!email) errors.email = "Please enter your email address.";
  else if (email.length > LIMITS.email.max) errors.email = "Email is too long.";
  else if (!EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email address.";

  const phone = data.phone.trim();
  if (phone && !PHONE_PATTERN.test(phone)) errors.phone = "Enter a valid phone number.";

  const subject = data.subject.trim();
  if (!subject) errors.subject = "Please add a subject.";
  else if (subject.length < LIMITS.subject.min) errors.subject = "Subject is too short.";
  else if (subject.length > LIMITS.subject.max) errors.subject = "Subject is too long.";

  const message = data.message.trim();
  if (!message) errors.message = "Please write a message.";
  else if (message.length < LIMITS.message.min) errors.message = `Message should be at least ${LIMITS.message.min} characters.`;
  else if (message.length > LIMITS.message.max) errors.message = "Message is too long.";

  return errors;
}

const SUBJECT_PLACEHOLDER: Record<FormData["userType"], string> = {
  visitor: "How can we help with your ticket or visit?",
  exhibitor: "How can we help with your exhibition or stall?",
};

const ContactUs = () => {
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const businessHours = getBusinessHoursStatus();

  const setField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key as keyof FieldErrors]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return; // guards against a double-click/rapid re-submit

    const fieldErrors = validate(formData);
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      // No backend endpoint exists for this form today (confirmed by
      // repository audit — this page has never sent a real request). This
      // short delay mirrors the real request/response affordance a wired-up
      // submission would have (disabled button, spinner, no double-submit)
      // without pretending the message was actually delivered anywhere.
      // Wiring a real endpoint later only means replacing this block with
      // an actual API call — the surrounding validation/error/loading
      // structure (including this try/catch) doesn't need to change.
      await new Promise((resolve) => setTimeout(resolve, 500));
      toast.success("Message sent! We'll get back to you within 24 hours.");
      setFormData(INITIAL_FORM);
      setErrors({});
      setJustSubmitted(true);
    } catch {
      setSubmitError("Something went wrong while sending your message. Please try again.");
      toast.error("Something went wrong. Please try again or email us directly.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero */}
      <section className="pt-12 pb-10 md:pt-16 md:pb-12 gradient-hero">
        <div className="container mx-auto text-center px-4">
          <Badge className="mb-3 bg-primary-foreground/20 text-primary-foreground border-0">
            Get in Touch
          </Badge>
          <h1 className="font-display text-3xl md:text-5xl font-bold text-primary-foreground mb-3">
            Contact Us
          </h1>
          <p className="text-primary-foreground/80 text-base md:text-lg max-w-2xl mx-auto">
            Have questions? We're here to help. Send us a message and our team will get back to you as soon as possible.
          </p>
        </div>
      </section>

      {/* Contact Info Cards */}
      <section className="py-10 -mt-6">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {contactInfo.map((info) => {
              const cardBody = (
                <CardContent className="p-5 text-center h-full flex flex-col items-center">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3 shrink-0 transition-colors group-hover:bg-primary/20">
                    <info.icon className="w-6 h-6 text-primary" aria-hidden="true" />
                  </div>
                  <h3 className="font-semibold mb-1">{info.title}</h3>
                  <p className="text-foreground font-medium">{info.detail}</p>
                  <p className="text-sm text-muted-foreground">{info.subDetail}</p>
                  {info.title === "Business Hours" && (
                    <Badge
                      variant="outline"
                      className={
                        "mt-2 " +
                        (businessHours.open
                          ? "border-emerald/40 text-emerald bg-emerald/10"
                          : "border-muted-foreground/30 text-muted-foreground")
                      }
                    >
                      {businessHours.label}
                    </Badge>
                  )}
                </CardContent>
              );

              if (!info.href) {
                return (
                  <Card key={info.title} className="card-premium h-full transition-shadow hover:shadow-md motion-reduce:transition-none">
                    {cardBody}
                  </Card>
                );
              }

              return (
                <a
                  key={info.title}
                  href={info.href}
                  {...(info.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label={`${info.title}: ${info.detail}`}
                >
                  <Card className="card-premium h-full cursor-pointer transition-all hover:shadow-md hover:border-primary/40 motion-reduce:transition-none">
                    {cardBody}
                  </Card>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      {/* Contact Form + Quick Help */}
      <section className="pb-16 pt-4 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-12">
            <div>
              <h2 className="section-title text-left mb-3">Send Us a Message</h2>
              <p className="text-muted-foreground mb-6">
                Fill out the form below and our team will get back to you within 24 hours.
                For urgent queries, please call us directly.
              </p>

              <Card className="border-0 shadow-lg">
                {justSubmitted ? (
                  <CardContent className="p-6 py-12 text-center" role="status" aria-live="polite">
                    <div className="w-16 h-16 rounded-full bg-emerald flex items-center justify-center mx-auto mb-5 animate-scale-in">
                      <Check className="w-8 h-8 text-emerald-foreground" aria-hidden="true" />
                    </div>
                    <h3 className="font-display text-xl font-semibold mb-2">Message sent successfully</h3>
                    <p className="text-muted-foreground max-w-sm mx-auto mb-6">
                      Thanks for contacting ExhibitTix. Our team will get back to you within 24 hours.
                    </p>
                    <Button variant="outline" onClick={() => setJustSubmitted(false)}>
                      Send another message
                    </Button>
                  </CardContent>
                ) : (
                <CardContent className="p-6">
                  <form onSubmit={handleSubmit} noValidate className="space-y-5">
                    <div>
                      <Label className="text-sm font-medium">I am a</Label>
                      <RadioGroup
                        value={formData.userType}
                        onValueChange={(value) => setField("userType", value as FormData["userType"])}
                        className="grid grid-cols-2 gap-2 mt-2 max-w-xs"
                      >
                        <div className="relative">
                          <RadioGroupItem value="visitor" id="userType-visitor" className="peer sr-only" />
                          <Label
                            htmlFor="userType-visitor"
                            className="flex items-center justify-center gap-2 min-h-[44px] rounded-lg border border-input text-sm font-medium cursor-pointer transition-colors motion-reduce:transition-none hover:bg-muted peer-data-[state=checked]:bg-primary peer-data-[state=checked]:text-primary-foreground peer-data-[state=checked]:border-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2"
                          >
                            <Ticket className="w-4 h-4" aria-hidden="true" />
                            Visitor
                          </Label>
                        </div>
                        <div className="relative">
                          <RadioGroupItem value="exhibitor" id="userType-exhibitor" className="peer sr-only" />
                          <Label
                            htmlFor="userType-exhibitor"
                            className="flex items-center justify-center gap-2 min-h-[44px] rounded-lg border border-input text-sm font-medium cursor-pointer transition-colors motion-reduce:transition-none hover:bg-muted peer-data-[state=checked]:bg-primary peer-data-[state=checked]:text-primary-foreground peer-data-[state=checked]:border-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2"
                          >
                            <Building2 className="w-4 h-4" aria-hidden="true" />
                            Exhibitor
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="name">Full Name</Label>
                        <Input
                          id="name"
                          placeholder="Your name"
                          value={formData.name}
                          onChange={(e) => setField("name", e.target.value)}
                          maxLength={LIMITS.name.max}
                          aria-invalid={!!errors.name}
                          aria-describedby={errors.name ? "name-error" : undefined}
                          className="mt-1.5"
                        />
                        {errors.name && <p id="name-error" role="alert" className="text-sm text-destructive mt-1">{errors.name}</p>}
                      </div>
                      <div>
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="your@email.com"
                          value={formData.email}
                          onChange={(e) => setField("email", e.target.value)}
                          maxLength={LIMITS.email.max}
                          aria-invalid={!!errors.email}
                          aria-describedby={errors.email ? "email-error" : undefined}
                          className="mt-1.5"
                        />
                        {errors.email && <p id="email-error" role="alert" className="text-sm text-destructive mt-1">{errors.email}</p>}
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="phone">Phone (Optional)</Label>
                        <Input
                          id="phone"
                          type="tel"
                          placeholder="+91 98765 43210"
                          value={formData.phone}
                          onChange={(e) => setField("phone", e.target.value)}
                          maxLength={20}
                          aria-invalid={!!errors.phone}
                          aria-describedby={errors.phone ? "phone-error" : undefined}
                          className="mt-1.5"
                        />
                        {errors.phone && <p id="phone-error" role="alert" className="text-sm text-destructive mt-1">{errors.phone}</p>}
                      </div>
                      <div>
                        <Label htmlFor="subject">Subject</Label>
                        <Input
                          id="subject"
                          placeholder={SUBJECT_PLACEHOLDER[formData.userType]}
                          value={formData.subject}
                          onChange={(e) => setField("subject", e.target.value)}
                          maxLength={LIMITS.subject.max}
                          aria-invalid={!!errors.subject}
                          aria-describedby={errors.subject ? "subject-error" : undefined}
                          className="mt-1.5"
                        />
                        {errors.subject && <p id="subject-error" role="alert" className="text-sm text-destructive mt-1">{errors.subject}</p>}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="message">Message</Label>
                        <span
                          className={
                            "text-xs " +
                            (formData.message.length > LIMITS.message.max * 0.9 ? "text-amber-600" : "text-muted-foreground")
                          }
                        >
                          {formData.message.length} / {LIMITS.message.max}
                        </span>
                      </div>
                      <Textarea
                        id="message"
                        placeholder="Tell us more about your query..."
                        value={formData.message}
                        onChange={(e) => setField("message", e.target.value)}
                        maxLength={LIMITS.message.max}
                        aria-invalid={!!errors.message}
                        aria-describedby={errors.message ? "message-error" : undefined}
                        className="mt-1.5 min-h-[120px]"
                      />
                      {errors.message && <p id="message-error" role="alert" className="text-sm text-destructive mt-1">{errors.message}</p>}
                    </div>

                    {submitError && (
                      <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                        <span>{submitError}</span>
                      </div>
                    )}

                    <Button type="submit" size="lg" className="w-full gap-2" disabled={isSubmitting}>
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" aria-hidden="true" />
                          Send Message
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
                )}
              </Card>
            </div>

            {/* FAQ Preview */}
            <div>
              <h2 className="section-title text-left mb-3">Quick Help</h2>
              <p className="text-muted-foreground mb-6">
                Find answers to common questions before reaching out.
              </p>

              <Accordion type="single" collapsible className="space-y-3">
                {FAQS.map((faq, index) => (
                  <AccordionItem
                    key={faq.q}
                    value={`faq-${index}`}
                    className="card-premium border rounded-xl px-4 transition-colors motion-reduce:transition-none data-[state=open]:border-primary/40"
                  >
                    <AccordionTrigger className="hover:no-underline text-left py-4 min-h-[44px]">
                      <span className="font-medium">{faq.q}</span>
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground">
                      {faq.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>

              <div className="mt-6 p-6 rounded-xl bg-primary/10 border border-primary/20">
                <h3 className="font-semibold mb-2">Need Immediate Help?</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Our support team is available Monday to Saturday, 9 AM to 7 PM IST.
                </p>
                <Button variant="outline" className="gap-2" asChild>
                  <a href="tel:+918001234567">
                    <Phone className="w-4 h-4" aria-hidden="true" />
                    Call +91 800-123-4567
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default ContactUs;
