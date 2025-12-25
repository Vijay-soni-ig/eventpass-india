import { Badge } from "@/components/ui/badge";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const TermsOfService = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero Section */}
      <section className="py-16 gradient-hero">
        <div className="container mx-auto text-center">
          <Badge className="mb-4 bg-primary-foreground/20 text-primary-foreground border-0">
            Legal
          </Badge>
          <h1 className="font-display text-4xl md:text-5xl font-bold text-primary-foreground mb-4">
            Terms of Service
          </h1>
          <p className="text-primary-foreground/80 text-lg">
            Last updated: January 1, 2024
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="section-padding">
        <div className="container mx-auto">
          <div className="max-w-3xl mx-auto prose prose-neutral dark:prose-invert">
            <h2>1. Acceptance of Terms</h2>
            <p>
              Welcome to ExhibitTix. By accessing or using our platform, you agree to be bound by these 
              Terms of Service ("Terms"). If you do not agree to these Terms, please do not use our services.
            </p>
            <p>
              ExhibitTix is operated by ExhibitTix Technologies Private Limited ("Company", "we", "us", or "our"), 
              a company registered in India. These Terms govern your use of our website, mobile applications, 
              and all related services (collectively, the "Platform").
            </p>

            <h2>2. Description of Services</h2>
            <p>
              ExhibitTix is an online platform that connects visitors with exhibition organizers. Our services include:
            </p>
            <ul>
              <li>Exhibition discovery and ticket booking for visitors</li>
              <li>Exhibition listing and ticket management for organizers</li>
              <li>Stall booking services for trade exhibitions</li>
              <li>Payment processing and refund management</li>
              <li>QR-based entry management</li>
            </ul>

            <h2>3. User Accounts</h2>
            <h3>3.1 Account Creation</h3>
            <p>
              To access certain features, you must create an account. You agree to provide accurate, 
              current, and complete information during registration and to update such information to keep it accurate.
            </p>
            <h3>3.2 Account Security</h3>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials and for all 
              activities that occur under your account. Notify us immediately of any unauthorized use.
            </p>
            <h3>3.3 Account Types</h3>
            <p>
              We offer different account types for visitors and exhibitors. Each account type has specific 
              features and obligations as described in the Platform.
            </p>

            <h2>4. Booking and Payments</h2>
            <h3>4.1 Ticket Purchases</h3>
            <p>
              When you purchase tickets, you agree to pay the specified price plus any applicable fees. 
              All prices are in Indian Rupees (INR) unless otherwise stated.
            </p>
            <h3>4.2 Payment Processing</h3>
            <p>
              We use third-party payment processors. By making a payment, you agree to their terms of service. 
              We are not responsible for payment processing errors by third parties.
            </p>
            <h3>4.3 Refunds</h3>
            <p>
              Refunds are subject to our Refund Policy. Generally, cancellations made 24+ hours before the 
              event are eligible for a full refund.
            </p>

            <h2>5. For Exhibitors</h2>
            <h3>5.1 Listing Requirements</h3>
            <p>
              Exhibitors must provide accurate information about their events. Misleading or false information 
              may result in listing removal and account suspension.
            </p>
            <h3>5.2 Commission and Fees</h3>
            <p>
              Exhibitors agree to pay the platform commission (currently 5% per ticket) plus payment gateway 
              charges. Commission rates may change with prior notice.
            </p>
            <h3>5.3 Event Cancellation</h3>
            <p>
              If you cancel an event, you must notify us immediately. Full refunds will be issued to all 
              ticket holders, and you may be liable for processing costs.
            </p>

            <h2>6. Prohibited Activities</h2>
            <p>You agree not to:</p>
            <ul>
              <li>Use the Platform for any illegal purpose</li>
              <li>Violate any applicable laws or regulations</li>
              <li>Infringe on intellectual property rights</li>
              <li>Transmit viruses or malicious code</li>
              <li>Attempt to gain unauthorized access to our systems</li>
              <li>Engage in fraudulent ticket reselling</li>
              <li>Create fake reviews or ratings</li>
              <li>Impersonate another person or entity</li>
            </ul>

            <h2>7. Intellectual Property</h2>
            <p>
              All content on the Platform, including logos, text, graphics, and software, is the property 
              of ExhibitTix or its licensors. You may not use, copy, or distribute this content without permission.
            </p>

            <h2>8. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, ExhibitTix shall not be liable for any indirect, 
              incidental, special, consequential, or punitive damages arising from your use of the Platform.
            </p>
            <p>
              Our total liability shall not exceed the amount you paid us in the 12 months preceding the claim.
            </p>

            <h2>9. Dispute Resolution</h2>
            <p>
              Any disputes arising from these Terms shall be resolved through arbitration in Ahmedabad, 
              Gujarat, India, in accordance with the Arbitration and Conciliation Act, 1996.
            </p>

            <h2>10. Governing Law</h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of India. 
              Courts in Ahmedabad, Gujarat shall have exclusive jurisdiction.
            </p>

            <h2>11. Changes to Terms</h2>
            <p>
              We may modify these Terms at any time. We will notify you of significant changes via email 
              or through the Platform. Continued use after changes constitutes acceptance.
            </p>

            <h2>12. Contact Information</h2>
            <p>
              For questions about these Terms, please contact us at:
            </p>
            <ul>
              <li>Email: legal@exhibittix.com</li>
              <li>Phone: +91 800-123-4567</li>
              <li>Address: 123 Tech Park, SG Highway, Ahmedabad, Gujarat 380015</li>
            </ul>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default TermsOfService;
