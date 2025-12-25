import { useState } from "react";
import { Link } from "react-router-dom";
import { 
  Search, Ticket, CreditCard, Calendar, Shield, Building2, 
  HelpCircle, ChevronRight, ArrowRight, MessageSquare, Phone, Mail
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const HelpCenter = () => {
  const [searchQuery, setSearchQuery] = useState("");

  const categories = [
    {
      icon: Ticket,
      title: "Booking Tickets",
      description: "Learn how to book, manage, and cancel tickets",
      articles: 12,
      link: "/help/booking",
    },
    {
      icon: CreditCard,
      title: "Payments & Refunds",
      description: "Payment methods, refund policies, and invoices",
      articles: 8,
      link: "/help/payments",
    },
    {
      icon: Calendar,
      title: "Event Information",
      description: "Event timings, venue details, and what to expect",
      articles: 10,
      link: "/help/events",
    },
    {
      icon: Shield,
      title: "Account & Security",
      description: "Manage your account, password, and privacy",
      articles: 6,
      link: "/help/account",
    },
    {
      icon: Building2,
      title: "For Exhibitors",
      description: "Listing events, managing bookings, and analytics",
      articles: 15,
      link: "/help/exhibitors",
    },
    {
      icon: HelpCircle,
      title: "General FAQs",
      description: "Common questions and troubleshooting",
      articles: 20,
      link: "/help/faqs",
    },
  ];

  const popularFaqs = [
    {
      question: "How do I book tickets for an exhibition?",
      answer: "Booking tickets is simple: 1) Search for your exhibition 2) Select your ticket type and quantity 3) Choose your visit date 4) Enter your details 5) Pay securely. You'll receive instant confirmation with a QR code via email.",
    },
    {
      question: "Can I cancel or reschedule my booking?",
      answer: "Yes! You can cancel your booking up to 24 hours before the event for a full refund. For rescheduling, cancel your current booking and make a new one for your preferred date. Visit your Dashboard to manage bookings.",
    },
    {
      question: "What payment methods are accepted?",
      answer: "We accept UPI (Google Pay, PhonePe, Paytm), Credit/Debit Cards (Visa, Mastercard, RuPay), Net Banking from all major banks, and select wallet options. All payments are secured with 256-bit SSL encryption.",
    },
    {
      question: "How do I get my tickets after booking?",
      answer: "Immediately after payment, you'll receive an email with your e-tickets containing a QR code. You can also view and download tickets from your Dashboard. Simply show the QR code at the venue entrance for contactless entry.",
    },
    {
      question: "What if the exhibition is cancelled?",
      answer: "If an exhibition is cancelled by the organizer, you'll automatically receive a full refund within 5-7 business days. We'll notify you via email and SMS about the cancellation and refund status.",
    },
    {
      question: "How do I list my exhibition on ExhibitTix?",
      answer: "Create an exhibitor account, go to 'Create Exhibition', fill in your event details, upload images, set up ticket types and pricing, configure stall options if applicable, and submit for review. Once approved, your exhibition goes live!",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero Section */}
      <section className="py-16 gradient-hero">
        <div className="container mx-auto text-center">
          <Badge className="mb-4 bg-primary-foreground/20 text-primary-foreground border-0">
            Help Center
          </Badge>
          <h1 className="font-display text-4xl md:text-5xl font-bold text-primary-foreground mb-4">
            How Can We Help?
          </h1>
          <p className="text-primary-foreground/80 text-lg max-w-2xl mx-auto mb-8">
            Find answers to common questions or get in touch with our support team.
          </p>

          {/* Search Bar */}
          <div className="max-w-xl mx-auto">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search for help..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-14 text-base bg-background rounded-xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Help Categories */}
      <section className="section-padding">
        <div className="container mx-auto">
          <h2 className="section-title text-center mb-10">Browse by Topic</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {categories.map((category, index) => (
              <Link key={index} to={category.link}>
                <Card className="card-premium h-full group">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                        <category.icon className="w-6 h-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold mb-1 group-hover:text-primary transition-colors">
                          {category.title}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-2">{category.description}</p>
                        <p className="text-xs text-primary">{category.articles} articles</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Popular FAQs */}
      <section className="section-padding bg-muted/30">
        <div className="container mx-auto">
          <div className="section-header">
            <h2 className="section-title">Frequently Asked Questions</h2>
            <p className="section-subtitle">Quick answers to common questions</p>
          </div>

          <div className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible className="space-y-4">
              {popularFaqs.map((faq, index) => (
                <AccordionItem 
                  key={index} 
                  value={`faq-${index}`}
                  className="bg-card rounded-xl border px-6 shadow-sm"
                >
                  <AccordionTrigger className="hover:no-underline text-left">
                    <span className="font-medium">{faq.question}</span>
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* Contact Support */}
      <section className="section-padding">
        <div className="container mx-auto">
          <div className="text-center mb-10">
            <h2 className="section-title">Still Need Help?</h2>
            <p className="section-subtitle">Our support team is here for you</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <Card className="card-premium text-center">
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">Live Chat</h3>
                <p className="text-sm text-muted-foreground mb-4">Chat with our support team in real-time</p>
                <Button variant="outline" className="w-full">Start Chat</Button>
              </CardContent>
            </Card>

            <Card className="card-premium text-center">
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">Email Support</h3>
                <p className="text-sm text-muted-foreground mb-4">Get a response within 24 hours</p>
                <Link to="/contact">
                  <Button variant="outline" className="w-full">Send Email</Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="card-premium text-center">
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Phone className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">Phone Support</h3>
                <p className="text-sm text-muted-foreground mb-4">Mon-Sat, 9 AM - 7 PM IST</p>
                <Button variant="outline" className="w-full">+91 800-123-4567</Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default HelpCenter;
