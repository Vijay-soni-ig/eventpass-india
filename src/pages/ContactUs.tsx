import { useState } from "react";
import { Mail, Phone, MapPin, Clock, Send, MessageSquare, Building2, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const ContactUs = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
    userType: "visitor",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Message sent! We'll get back to you within 24 hours.");
    setFormData({ name: "", email: "", phone: "", subject: "", message: "", userType: "visitor" });
  };

  const contactInfo = [
    {
      icon: Mail,
      title: "Email Us",
      detail: "support@exhibittix.com",
      subDetail: "We respond within 24 hours",
    },
    {
      icon: Phone,
      title: "Call Us",
      detail: "+91 800-123-4567",
      subDetail: "Mon-Sat, 9 AM - 7 PM IST",
    },
    {
      icon: MapPin,
      title: "Visit Us",
      detail: "123 Tech Park, SG Highway",
      subDetail: "Ahmedabad, Gujarat 380015",
    },
    {
      icon: Clock,
      title: "Business Hours",
      detail: "Monday - Saturday",
      subDetail: "9:00 AM - 7:00 PM IST",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero Section */}
      <section className="py-16 gradient-hero">
        <div className="container mx-auto text-center">
          <Badge className="mb-4 bg-primary-foreground/20 text-primary-foreground border-0">
            Get in Touch
          </Badge>
          <h1 className="font-display text-4xl md:text-5xl font-bold text-primary-foreground mb-4">
            Contact Us
          </h1>
          <p className="text-primary-foreground/80 text-lg max-w-2xl mx-auto">
            Have questions? We'd love to hear from you. Send us a message and we'll respond as soon as possible.
          </p>
        </div>
      </section>

      {/* Contact Info Cards */}
      <section className="py-12 -mt-8">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {contactInfo.map((info, index) => (
              <Card key={index} className="card-premium">
                <CardContent className="p-5 text-center">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <info.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-1">{info.title}</h3>
                  <p className="text-foreground font-medium">{info.detail}</p>
                  <p className="text-sm text-muted-foreground">{info.subDetail}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Form */}
      <section className="section-padding bg-muted/30">
        <div className="container mx-auto">
          <div className="grid lg:grid-cols-2 gap-12">
            <div>
              <h2 className="section-title text-left mb-4">Send Us a Message</h2>
              <p className="text-muted-foreground mb-8">
                Fill out the form below and our team will get back to you within 24 hours. 
                For urgent queries, please call us directly.
              </p>

              <Card className="border-0 shadow-lg">
                <CardContent className="p-6">
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                      <Label className="text-sm font-medium">I am a</Label>
                      <RadioGroup
                        value={formData.userType}
                        onValueChange={(value) => setFormData({ ...formData, userType: value })}
                        className="flex gap-4 mt-2"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="visitor" id="visitor" />
                          <Label htmlFor="visitor" className="flex items-center gap-2 cursor-pointer">
                            <Ticket className="w-4 h-4" />
                            Visitor
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="exhibitor" id="exhibitor" />
                          <Label htmlFor="exhibitor" className="flex items-center gap-2 cursor-pointer">
                            <Building2 className="w-4 h-4" />
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
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className="mt-1.5"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="your@email.com"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          className="mt-1.5"
                          required
                        />
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
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          className="mt-1.5"
                        />
                      </div>
                      <div>
                        <Label htmlFor="subject">Subject</Label>
                        <Input
                          id="subject"
                          placeholder="How can we help?"
                          value={formData.subject}
                          onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                          className="mt-1.5"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="message">Message</Label>
                      <Textarea
                        id="message"
                        placeholder="Tell us more about your query..."
                        value={formData.message}
                        onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                        className="mt-1.5 min-h-[120px]"
                        required
                      />
                    </div>

                    <Button type="submit" size="lg" className="w-full gap-2">
                      <Send className="w-4 h-4" />
                      Send Message
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            {/* FAQ Preview */}
            <div>
              <h2 className="section-title text-left mb-4">Quick Help</h2>
              <p className="text-muted-foreground mb-8">
                Find answers to common questions before reaching out.
              </p>

              <div className="space-y-4">
                {[
                  { q: "How do I book tickets?", a: "Simply find your exhibition, select tickets, and pay securely online. You'll receive instant confirmation." },
                  { q: "Can I cancel my booking?", a: "Yes, you can cancel up to 24 hours before the event for a full refund. Visit your dashboard to manage bookings." },
                  { q: "How do I list my exhibition?", a: "Create an exhibitor account, add your exhibition details, set up tickets and pricing, and you're live!" },
                  { q: "Is my payment secure?", a: "Absolutely. We use 256-bit SSL encryption and partner with trusted payment gateways like Razorpay." },
                  { q: "How do I contact support?", a: "You can email us, call our helpline, or fill out this contact form. We respond within 24 hours." },
                ].map((faq, index) => (
                  <Card key={index} className="card-premium">
                    <CardContent className="p-4">
                      <div className="flex gap-3">
                        <MessageSquare className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-medium mb-1">{faq.q}</h4>
                          <p className="text-sm text-muted-foreground">{faq.a}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="mt-8 p-6 rounded-xl bg-primary/10 border border-primary/20">
                <h4 className="font-semibold mb-2">Need Immediate Help?</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Our support team is available Monday to Saturday, 9 AM to 7 PM IST.
                </p>
                <Button variant="outline" className="gap-2">
                  <Phone className="w-4 h-4" />
                  Call +91 800-123-4567
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
