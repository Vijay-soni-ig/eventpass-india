import { Link } from "react-router-dom";
import { Ticket, Mail, Phone, MapPin, Facebook, Twitter, Instagram, Linkedin, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const Footer = () => {
  return (
    <footer className="bg-foreground text-background">
      {/* Newsletter Section */}
      <div className="border-b border-background/10">
        <div className="container mx-auto py-12">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h3 className="font-display text-2xl font-semibold mb-2">Stay Updated</h3>
              <p className="text-background/60">Get the latest exhibitions and exclusive offers in your inbox.</p>
            </div>
            <form className="flex gap-2 w-full md:w-auto">
              <Input 
                type="email" 
                placeholder="Enter your email" 
                className="bg-background/10 border-background/20 text-background placeholder:text-background/40 min-w-[240px]"
              />
              <Button variant="accent" className="shrink-0">
                Subscribe
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </form>
          </div>
        </div>
      </div>

      <div className="container mx-auto py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link to="/" className="flex items-center gap-2.5 mb-5">
              <div className="w-10 h-10 rounded-xl gradient-hero flex items-center justify-center">
                <Ticket className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-display text-2xl font-bold text-background">
                Exhibit<span className="text-primary">Tix</span>
              </span>
            </Link>
            <p className="text-background/60 mb-6 max-w-sm">
              India's premier platform for discovering, booking, and organizing exhibitions, trade fairs, and cultural events.
            </p>
            <div className="flex gap-3">
              <a href="#" className="w-10 h-10 rounded-lg bg-background/10 flex items-center justify-center hover:bg-background/20 transition-colors">
                <Facebook className="w-4 h-4" />
              </a>
              <a href="#" className="w-10 h-10 rounded-lg bg-background/10 flex items-center justify-center hover:bg-background/20 transition-colors">
                <Twitter className="w-4 h-4" />
              </a>
              <a href="#" className="w-10 h-10 rounded-lg bg-background/10 flex items-center justify-center hover:bg-background/20 transition-colors">
                <Instagram className="w-4 h-4" />
              </a>
              <a href="#" className="w-10 h-10 rounded-lg bg-background/10 flex items-center justify-center hover:bg-background/20 transition-colors">
                <Linkedin className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-display font-semibold mb-4">For Visitors</h4>
            <ul className="space-y-3">
              <li><Link to="/exhibitions" className="text-background/60 hover:text-background transition-colors text-sm">Browse Exhibitions</Link></li>
              <li><Link to="/how-booking-works" className="text-background/60 hover:text-background transition-colors text-sm">How Booking Works</Link></li>
              <li><Link to="/dashboard" className="text-background/60 hover:text-background transition-colors text-sm">My Tickets</Link></li>
              <li><Link to="/refund-policy" className="text-background/60 hover:text-background transition-colors text-sm">Refund Policy</Link></li>
            </ul>
          </div>

          {/* For Exhibitors */}
          <div>
            <h4 className="font-display font-semibold mb-4">For Exhibitors</h4>
            <ul className="space-y-3">
              <li><Link to="/exhibitors" className="text-background/60 hover:text-background transition-colors text-sm">Why List With Us</Link></li>
              <li><Link to="/how-exhibitions-work" className="text-background/60 hover:text-background transition-colors text-sm">How It Works</Link></li>
              <li><Link to="/exhibitor-dashboard/create" className="text-background/60 hover:text-background transition-colors text-sm">Create Exhibition</Link></li>
              <li><Link to="/exhibitor-dashboard" className="text-background/60 hover:text-background transition-colors text-sm">Exhibitor Dashboard</Link></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="font-display font-semibold mb-4">Support</h4>
            <ul className="space-y-3">
              <li><Link to="/help" className="text-background/60 hover:text-background transition-colors text-sm">Help Center</Link></li>
              <li><Link to="/contact" className="text-background/60 hover:text-background transition-colors text-sm">Contact Us</Link></li>
              <li><Link to="/about" className="text-background/60 hover:text-background transition-colors text-sm">About Us</Link></li>
              <li><Link to="/terms" className="text-background/60 hover:text-background transition-colors text-sm">Terms of Service</Link></li>
              <li><Link to="/privacy" className="text-background/60 hover:text-background transition-colors text-sm">Privacy Policy</Link></li>
            </ul>
          </div>
        </div>

        {/* Contact Info */}
        <div className="border-t border-background/10 mt-12 pt-8">
          <div className="flex flex-col lg:flex-row justify-between gap-6">
            <div className="flex flex-wrap gap-6 text-sm">
              <a href="mailto:support@exhibittix.com" className="flex items-center gap-2 text-background/60 hover:text-background transition-colors">
                <Mail className="w-4 h-4 text-primary" />
                support@exhibittix.com
              </a>
              <a href="tel:+918001234567" className="flex items-center gap-2 text-background/60 hover:text-background transition-colors">
                <Phone className="w-4 h-4 text-primary" />
                +91 800-123-4567
              </a>
              <span className="flex items-center gap-2 text-background/60">
                <MapPin className="w-4 h-4 text-primary" />
                Ahmedabad, Gujarat, India
              </span>
            </div>
            
            <div className="flex items-center gap-4">
              <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/Visa.svg/200px-Visa.svg.png" alt="Visa" className="h-5 opacity-60" />
              <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Mastercard-logo.svg/200px-Mastercard-logo.svg.png" alt="Mastercard" className="h-5 opacity-60" />
              <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/UPI-Logo-vector.svg/200px-UPI-Logo-vector.svg.png" alt="UPI" className="h-5 opacity-60" />
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-background/10 mt-8 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-background/40 text-sm">
            © 2024 ExhibitTix. All rights reserved. Made with ❤️ in India
          </p>
          <div className="flex items-center gap-6 text-sm">
            <Link to="/terms" className="text-background/60 hover:text-background transition-colors">Terms</Link>
            <Link to="/privacy" className="text-background/60 hover:text-background transition-colors">Privacy</Link>
            <Link to="/refund-policy" className="text-background/60 hover:text-background transition-colors">Refunds</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;