import { Badge } from "@/components/ui/badge";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const PrivacyPolicy = () => {
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
            Privacy Policy
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
            <h2>1. Introduction</h2>
            <p>
              ExhibitTix Technologies Private Limited ("ExhibitTix", "we", "us", or "our") is committed to 
              protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and 
              safeguard your information when you use our platform.
            </p>
            <p>
              By using ExhibitTix, you agree to the collection and use of information in accordance with 
              this policy. If you do not agree, please do not use our services.
            </p>

            <h2>2. Information We Collect</h2>
            <h3>2.1 Personal Information</h3>
            <p>We may collect the following personal information:</p>
            <ul>
              <li>Name, email address, and phone number</li>
              <li>Billing and payment information</li>
              <li>Demographic information (age, gender, location)</li>
              <li>Profile picture and preferences</li>
              <li>Booking history and transaction details</li>
            </ul>

            <h3>2.2 Automatically Collected Information</h3>
            <p>When you use our platform, we automatically collect:</p>
            <ul>
              <li>Device information (type, operating system, browser)</li>
              <li>IP address and location data</li>
              <li>Usage data (pages visited, time spent, clicks)</li>
              <li>Cookies and similar tracking technologies</li>
            </ul>

            <h3>2.3 Information from Third Parties</h3>
            <p>
              We may receive information from payment processors, social media platforms (if you sign in 
              using them), and marketing partners.
            </p>

            <h2>3. How We Use Your Information</h2>
            <p>We use the collected information to:</p>
            <ul>
              <li>Process bookings and payments</li>
              <li>Send booking confirmations and QR tickets</li>
              <li>Communicate about your account and transactions</li>
              <li>Provide customer support</li>
              <li>Personalize your experience and recommendations</li>
              <li>Send promotional communications (with your consent)</li>
              <li>Analyze usage patterns to improve our services</li>
              <li>Detect and prevent fraud</li>
              <li>Comply with legal obligations</li>
            </ul>

            <h2>4. Information Sharing</h2>
            <h3>4.1 With Exhibition Organizers</h3>
            <p>
              When you book tickets, we share necessary information (name, contact details, booking details) 
              with the exhibition organizer to facilitate your visit.
            </p>

            <h3>4.2 With Service Providers</h3>
            <p>
              We share information with third-party service providers who assist us with payment processing, 
              email delivery, analytics, and customer support.
            </p>

            <h3>4.3 Legal Requirements</h3>
            <p>
              We may disclose information if required by law, court order, or government regulation, or 
              to protect our rights and safety.
            </p>

            <h3>4.4 Business Transfers</h3>
            <p>
              In case of merger, acquisition, or sale of assets, your information may be transferred to 
              the acquiring entity.
            </p>

            <h2>5. Data Security</h2>
            <p>
              We implement industry-standard security measures to protect your information:
            </p>
            <ul>
              <li>256-bit SSL encryption for data transmission</li>
              <li>Secure payment processing (PCI-DSS compliant)</li>
              <li>Regular security audits and monitoring</li>
              <li>Access controls and authentication</li>
              <li>Data encryption at rest</li>
            </ul>
            <p>
              However, no method of transmission over the internet is 100% secure. We cannot guarantee 
              absolute security but strive to use commercially acceptable means to protect your data.
            </p>

            <h2>6. Cookies and Tracking</h2>
            <p>We use cookies and similar technologies to:</p>
            <ul>
              <li>Keep you logged in</li>
              <li>Remember your preferences</li>
              <li>Analyze site usage</li>
              <li>Deliver relevant advertisements</li>
            </ul>
            <p>
              You can control cookies through your browser settings. Disabling cookies may affect some 
              features of our platform.
            </p>

            <h2>7. Your Rights</h2>
            <p>You have the right to:</p>
            <ul>
              <li><strong>Access:</strong> Request a copy of your personal data</li>
              <li><strong>Correction:</strong> Update or correct inaccurate data</li>
              <li><strong>Deletion:</strong> Request deletion of your data (subject to legal requirements)</li>
              <li><strong>Opt-out:</strong> Unsubscribe from marketing communications</li>
              <li><strong>Portability:</strong> Receive your data in a structured format</li>
              <li><strong>Withdraw consent:</strong> Revoke previously given consent</li>
            </ul>
            <p>
              To exercise these rights, contact us at privacy@exhibittix.com.
            </p>

            <h2>8. Data Retention</h2>
            <p>
              We retain your personal information for as long as your account is active or as needed to 
              provide services. We may retain certain information for legal compliance, dispute resolution, 
              and business purposes (typically 5-7 years).
            </p>

            <h2>9. Children's Privacy</h2>
            <p>
              Our services are not intended for children under 13. We do not knowingly collect personal 
              information from children. If you believe a child has provided us with personal information, 
              please contact us.
            </p>

            <h2>10. International Users</h2>
            <p>
              ExhibitTix is based in India. If you access our services from outside India, your information 
              may be transferred to and processed in India, where data protection laws may differ from your country.
            </p>

            <h2>11. Third-Party Links</h2>
            <p>
              Our platform may contain links to third-party websites. We are not responsible for their 
              privacy practices. We encourage you to read their privacy policies.
            </p>

            <h2>12. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy periodically. We will notify you of significant changes 
              via email or through the Platform. Your continued use after changes constitutes acceptance.
            </p>

            <h2>13. Contact Us</h2>
            <p>
              For privacy-related questions or to exercise your rights, please contact our Data Protection Officer:
            </p>
            <ul>
              <li>Email: privacy@exhibittix.com</li>
              <li>Phone: +91 800-123-4567</li>
              <li>Address: 123 Tech Park, SG Highway, Ahmedabad, Gujarat 380015, India</li>
            </ul>

            <h2>14. Grievance Officer</h2>
            <p>
              In accordance with Information Technology Act 2000 and rules made thereunder, the name and 
              contact details of the Grievance Officer are:
            </p>
            <ul>
              <li>Name: Rahul Sharma</li>
              <li>Email: grievance@exhibittix.com</li>
              <li>Phone: +91 800-123-4567</li>
            </ul>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default PrivacyPolicy;
