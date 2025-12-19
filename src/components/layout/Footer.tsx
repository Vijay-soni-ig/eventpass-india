import { Link } from "react-router-dom";
import { Ticket, Mail, Phone, MapPin, Facebook, Twitter, Instagram, Youtube } from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-foreground text-background">
      <div className="container mx-auto py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Brand */}
          <div>
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <Ticket className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-display text-2xl text-background">ExhibitTix</span>
            </Link>
            <p className="text-background/70 mb-6">
              India's premier platform for discovering and booking tickets to exhibitions, museums, and cultural events.
            </p>
            <div className="flex gap-4">
              <a href="#" className="w-10 h-10 rounded-full bg-background/10 flex items-center justify-center hover:bg-background/20 transition-colors">
                <Facebook className="w-5 h-5" />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-background/10 flex items-center justify-center hover:bg-background/20 transition-colors">
                <Twitter className="w-5 h-5" />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-background/10 flex items-center justify-center hover:bg-background/20 transition-colors">
                <Instagram className="w-5 h-5" />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-background/10 flex items-center justify-center hover:bg-background/20 transition-colors">
                <Youtube className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-display text-lg mb-4">Explore</h4>
            <ul className="space-y-3">
              <li><Link to="/exhibitions" className="text-background/70 hover:text-background transition-colors">All Exhibitions</Link></li>
              <li><Link to="/exhibitions?category=Art%20%26%20Culture" className="text-background/70 hover:text-background transition-colors">Art & Culture</Link></li>
              <li><Link to="/exhibitions?category=Science%20%26%20Tech" className="text-background/70 hover:text-background transition-colors">Science & Technology</Link></li>
              <li><Link to="/exhibitions?category=History%20%26%20Heritage" className="text-background/70 hover:text-background transition-colors">History & Heritage</Link></li>
              <li><Link to="/exhibitions" className="text-background/70 hover:text-background transition-colors">Photography</Link></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="font-display text-lg mb-4">Support</h4>
            <ul className="space-y-3">
              <li><a href="#" className="text-background/70 hover:text-background transition-colors">Help Center</a></li>
              <li><a href="#" className="text-background/70 hover:text-background transition-colors">Cancellation Policy</a></li>
              <li><a href="#" className="text-background/70 hover:text-background transition-colors">Refund Status</a></li>
              <li><a href="#" className="text-background/70 hover:text-background transition-colors">Terms of Service</a></li>
              <li><a href="#" className="text-background/70 hover:text-background transition-colors">Privacy Policy</a></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-display text-lg mb-4">Contact Us</h4>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-accent mt-0.5" />
                <span className="text-background/70">WeWork Galaxy, 43, Residency Rd, Bangalore - 560025</span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-accent" />
                <a href="tel:+918001234567" className="text-background/70 hover:text-background transition-colors">+91 800-123-4567</a>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-accent" />
                <a href="mailto:support@exhibittix.com" className="text-background/70 hover:text-background transition-colors">support@exhibittix.com</a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-background/10 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-background/50 text-sm">
            © 2024 ExhibitTix. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/Visa.svg/200px-Visa.svg.png" alt="Visa" className="h-6 opacity-70" />
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Mastercard-logo.svg/200px-Mastercard-logo.svg.png" alt="Mastercard" className="h-6 opacity-70" />
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/UPI-Logo-vector.svg/200px-UPI-Logo-vector.svg.png" alt="UPI" className="h-6 opacity-70" />
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
