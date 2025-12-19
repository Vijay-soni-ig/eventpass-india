export interface Exhibition {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  fullDescription: string;
  venue: string;
  venueAddress: string;
  city: string;
  category: string;
  startDate: string;
  endDate: string;
  timing: string;
  priceRange: { min: number; max: number };
  tickets: TicketType[];
  images: string[];
  featured: boolean;
  organizer: {
    name: string;
    logo: string;
    description: string;
  };
  faqs: { question: string; answer: string }[];
  rating: number;
  reviews: number;
}

export interface TicketType {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  available: boolean;
  benefits: string[];
}

export const cities = [
  "Mumbai",
  "Delhi",
  "Bangalore",
  "Chennai",
  "Kolkata",
  "Hyderabad",
  "Pune",
  "Ahmedabad",
  "Jaipur",
  "Kochi",
];

export const categories = [
  "Art & Culture",
  "Science & Tech",
  "History & Heritage",
  "Photography",
  "Fashion",
  "Music",
  "Food & Lifestyle",
  "Trade Shows",
];

export const exhibitions: Exhibition[] = [
  {
    id: "1",
    title: "The Future of Art: AI & Creativity",
    subtitle: "Where Technology Meets Imagination",
    description: "Explore the intersection of artificial intelligence and artistic expression in this groundbreaking exhibition featuring works created by human-AI collaboration.",
    fullDescription: `Step into a world where silicon dreams and human creativity merge to create breathtaking visual experiences. This landmark exhibition showcases over 100 pieces created through the collaboration of renowned artists and cutting-edge AI systems.

Witness the evolution of digital art from its earliest forms to the latest generative AI masterpieces. Interactive installations allow visitors to create their own AI-assisted artworks, while expert-led sessions explore the philosophical questions raised by machine creativity.

The exhibition features works from internationally acclaimed artists including Refik Anadol, Mario Klingemann, and emerging Indian digital artists who are pushing the boundaries of what art can be.`,
    venue: "National Gallery of Modern Art",
    venueAddress: "Jaipur House, India Gate, New Delhi - 110003",
    city: "Delhi",
    category: "Art & Culture",
    startDate: "2024-02-15",
    endDate: "2024-04-30",
    timing: "10:00 AM - 6:00 PM (Closed on Mondays)",
    priceRange: { min: 299, max: 1499 },
    tickets: [
      {
        id: "t1",
        name: "General Entry",
        description: "Access to all exhibition halls",
        price: 299,
        available: true,
        benefits: ["All exhibition access", "Audio guide (app)", "Photography allowed"],
      },
      {
        id: "t2",
        name: "Premium Experience",
        description: "Skip the line + exclusive areas",
        price: 799,
        originalPrice: 999,
        available: true,
        benefits: ["Skip-the-line entry", "VIP lounge access", "Exclusive workshop", "Complimentary refreshments"],
      },
      {
        id: "t3",
        name: "Family Pack",
        description: "2 Adults + 2 Children (under 12)",
        price: 1499,
        originalPrice: 1796,
        available: true,
        benefits: ["Family entry (4 members)", "Kids activity zone", "Souvenir guide book", "Priority seating"],
      },
    ],
    images: [
      "https://images.unsplash.com/photo-1541367777708-7905fe3296c0?w=800",
      "https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=800",
      "https://images.unsplash.com/photo-1561214115-f2f134cc4912?w=800",
    ],
    featured: true,
    organizer: {
      name: "Cultural Foundation of India",
      logo: "CFI",
      description: "India's premier cultural organization promoting art and heritage since 1952.",
    },
    faqs: [
      { question: "Is photography allowed?", answer: "Yes, personal photography without flash is permitted in most areas. Professional equipment requires prior permission." },
      { question: "Are guided tours available?", answer: "Yes, guided tours are available at 11 AM, 2 PM, and 4 PM. Advance booking recommended." },
      { question: "Is the venue wheelchair accessible?", answer: "Yes, the entire venue is wheelchair accessible with ramps, elevators, and accessible restrooms." },
      { question: "Can I re-enter after leaving?", answer: "Same-day re-entry is allowed with your original ticket. Please get an exit stamp at the entrance." },
    ],
    rating: 4.8,
    reviews: 1247,
  },
  {
    id: "2",
    title: "Mughal Splendour",
    subtitle: "The Golden Age of Indian Heritage",
    description: "A magnificent showcase of Mughal art, architecture models, and precious artifacts from the golden era of Indian history.",
    fullDescription: `Journey back to the resplendent era of the Mughal Empire through this extraordinary collection of artifacts, miniature paintings, and architectural marvels.

This exhibition brings together rare pieces from private collections and museums across India, including exquisite jewelry worn by Mughal royalty, illuminated manuscripts of Persian poetry, and scale models of iconic monuments.

Experience immersive recreations of the royal courts, complete with period music and ambient sounds that transport you to the 16th century.`,
    venue: "Chhatrapati Shivaji Maharaj Vastu Sangrahalaya",
    venueAddress: "159-161, Mahatma Gandhi Road, Fort, Mumbai - 400023",
    city: "Mumbai",
    category: "History & Heritage",
    startDate: "2024-03-01",
    endDate: "2024-06-15",
    timing: "10:15 AM - 6:00 PM (Open all days)",
    priceRange: { min: 199, max: 899 },
    tickets: [
      {
        id: "t1",
        name: "Standard Entry",
        description: "Full exhibition access",
        price: 199,
        available: true,
        benefits: ["All galleries access", "Self-guided tour"],
      },
      {
        id: "t2",
        name: "Curator's Tour",
        description: "Guided by exhibition curators",
        price: 599,
        available: true,
        benefits: ["Expert-led tour", "Behind-the-scenes access", "Q&A session"],
      },
      {
        id: "t3",
        name: "Royal Experience",
        description: "The complete heritage journey",
        price: 899,
        available: true,
        benefits: ["Private viewing slot", "High tea service", "Exclusive catalog", "Photo opportunity"],
      },
    ],
    images: [
      "https://images.unsplash.com/photo-1564507592333-c60657eea523?w=800",
      "https://images.unsplash.com/photo-1548013146-72479768bada?w=800",
      "https://images.unsplash.com/photo-1585135497273-1a86b09fe70e?w=800",
    ],
    featured: true,
    organizer: {
      name: "Heritage India Trust",
      logo: "HIT",
      description: "Preserving and promoting India's rich cultural heritage for future generations.",
    },
    faqs: [
      { question: "Are children allowed?", answer: "Yes, children of all ages are welcome. Special interactive sessions for kids on weekends." },
      { question: "Is there a cloakroom?", answer: "Yes, secure cloakroom facilities are available at ₹50 per item." },
      { question: "Can I bring food?", answer: "Outside food is not allowed, but the museum has a cafeteria with refreshments." },
    ],
    rating: 4.9,
    reviews: 2156,
  },
  {
    id: "3",
    title: "Tech Horizons 2024",
    subtitle: "Tomorrow's Technology Today",
    description: "Experience the latest innovations in AI, robotics, sustainable tech, and space exploration at India's largest technology exhibition.",
    fullDescription: `Dive into the future at Tech Horizons 2024, where cutting-edge technology meets hands-on experience. From autonomous vehicles to quantum computing demonstrations, witness innovations that will shape our tomorrow.

Interactive zones let you pilot drones, experience VR simulations of Mars colonization, and program your own robots. Leading tech companies showcase their latest products, while startups present revolutionary solutions to global challenges.

Special zones dedicated to sustainability tech, biotechnology, and India's space program make this exhibition a must-visit for tech enthusiasts of all ages.`,
    venue: "Bangalore International Exhibition Centre",
    venueAddress: "10th Mile, Tumkur Road, Madavara Post, Bangalore - 562162",
    city: "Bangalore",
    category: "Science & Tech",
    startDate: "2024-03-20",
    endDate: "2024-04-10",
    timing: "9:00 AM - 8:00 PM",
    priceRange: { min: 499, max: 2499 },
    tickets: [
      {
        id: "t1",
        name: "Day Pass",
        description: "Full day access to all zones",
        price: 499,
        available: true,
        benefits: ["All exhibition zones", "Demo sessions", "Startup showcase"],
      },
      {
        id: "t2",
        name: "Innovator Pass",
        description: "Enhanced tech experience",
        price: 1299,
        originalPrice: 1599,
        available: true,
        benefits: ["Priority access", "VR/AR experiences", "Workshop participation", "Tech kit voucher"],
      },
      {
        id: "t3",
        name: "All-Access Pro",
        description: "The ultimate tech immersion",
        price: 2499,
        available: true,
        benefits: ["3-day access", "Speaker sessions", "Networking lounge", "Exclusive merchandise", "Lunch included"],
      },
    ],
    images: [
      "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800",
      "https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=800",
      "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800",
    ],
    featured: true,
    organizer: {
      name: "Innovation Hub India",
      logo: "IHI",
      description: "Connecting innovators, entrepreneurs, and technology enthusiasts across India.",
    },
    faqs: [
      { question: "Is parking available?", answer: "Yes, ample parking space available at ₹100 for cars and ₹50 for two-wheelers." },
      { question: "Can I buy products at the exhibition?", answer: "Yes, many exhibitors offer products for sale. Digital payment options available." },
      { question: "Are there sessions for students?", answer: "Yes, special student sessions and career guidance workshops available daily at 11 AM." },
    ],
    rating: 4.7,
    reviews: 3421,
  },
  {
    id: "4",
    title: "Lens & Light",
    subtitle: "A Photography Retrospective",
    description: "Celebrating 50 years of Indian photography through the works of legendary photographers who captured the nation's soul.",
    fullDescription: `From the streets of Varanasi to the peaks of the Himalayas, this retrospective showcases the most iconic photographs that have defined India's visual history.

Featuring works by Raghu Rai, Dayanita Singh, and emerging photographers, the exhibition explores themes of identity, urbanization, rural life, and the changing Indian landscape.

Workshops, portfolio reviews, and masterclasses with renowned photographers make this a transformative experience for photography enthusiasts.`,
    venue: "India Habitat Centre",
    venueAddress: "Lodhi Road, New Delhi - 110003",
    city: "Delhi",
    category: "Photography",
    startDate: "2024-04-01",
    endDate: "2024-05-15",
    timing: "11:00 AM - 7:00 PM",
    priceRange: { min: 149, max: 599 },
    tickets: [
      {
        id: "t1",
        name: "Gallery Pass",
        description: "Exhibition viewing",
        price: 149,
        available: true,
        benefits: ["All galleries", "Photography allowed"],
      },
      {
        id: "t2",
        name: "Photographer's Pass",
        description: "For serious enthusiasts",
        price: 399,
        available: true,
        benefits: ["Workshop access", "Portfolio review session", "Printed catalog"],
      },
      {
        id: "t3",
        name: "Masterclass Bundle",
        description: "Learn from the masters",
        price: 599,
        available: false,
        benefits: ["Masterclass sessions", "One-on-one mentoring", "Certificate", "Exhibition catalog"],
      },
    ],
    images: [
      "https://images.unsplash.com/photo-1542038784456-1ea8e935640e?w=800",
      "https://images.unsplash.com/photo-1502982720700-bfff97f2ecac?w=800",
      "https://images.unsplash.com/photo-1500051638674-ff996a0ec29e?w=800",
    ],
    featured: false,
    organizer: {
      name: "Photo Society of India",
      logo: "PSI",
      description: "Promoting the art and craft of photography in India since 1974.",
    },
    faqs: [
      { question: "Can I submit my work for display?", answer: "The main exhibition features curated works, but there's an open gallery section for submissions." },
      { question: "Are prints available for purchase?", answer: "Yes, limited edition prints signed by artists are available at the gallery shop." },
    ],
    rating: 4.6,
    reviews: 892,
  },
  {
    id: "5",
    title: "Fabric of India",
    subtitle: "Textile Heritage Exhibition",
    description: "Discover India's rich textile traditions from ancient Banarasi silks to contemporary sustainable fashion.",
    fullDescription: `Trace the golden thread that connects India's diverse textile traditions in this comprehensive exhibition spanning 3,000 years of craftsmanship.

From the legendary muslin of Dhaka to the intricate Kashmiri pashmina, explore how Indian textiles influenced global fashion and trade routes.

Live demonstrations by master weavers, interactive weaving stations, and a curated fashion show make this a sensory feast for textile lovers.`,
    venue: "The National Museum",
    venueAddress: "Janpath Road, New Delhi - 110001",
    city: "Delhi",
    category: "Fashion",
    startDate: "2024-02-20",
    endDate: "2024-05-30",
    timing: "10:00 AM - 5:00 PM (Closed on Mondays)",
    priceRange: { min: 100, max: 450 },
    tickets: [
      {
        id: "t1",
        name: "Entry Ticket",
        description: "Exhibition access",
        price: 100,
        available: true,
        benefits: ["Gallery access", "Audio guide"],
      },
      {
        id: "t2",
        name: "Weaver's Experience",
        description: "Interactive textile journey",
        price: 300,
        available: true,
        benefits: ["Gallery access", "Weaving demo", "Try-your-hand session", "Small fabric souvenir"],
      },
      {
        id: "t3",
        name: "Designer's Pass",
        description: "For fashion professionals",
        price: 450,
        available: true,
        benefits: ["All access", "Archive viewing", "Trend presentation", "Networking session"],
      },
    ],
    images: [
      "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=800",
      "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=800",
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800",
    ],
    featured: false,
    organizer: {
      name: "Craft Council of India",
      logo: "CCI",
      description: "Championing Indian crafts and artisans for over four decades.",
    },
    faqs: [
      { question: "Can I purchase textiles?", answer: "Yes, an adjoining craft shop features authentic handloom products." },
      { question: "Are there group discounts?", answer: "Groups of 15+ get 20% discount on standard tickets." },
    ],
    rating: 4.5,
    reviews: 567,
  },
  {
    id: "6",
    title: "Flavours of India",
    subtitle: "A Culinary Heritage Exhibition",
    description: "Journey through India's diverse culinary landscape with interactive displays, tastings, and chef demonstrations.",
    fullDescription: `Experience India's incredible food diversity in this immersive exhibition that engages all your senses. From the fiery curries of the South to the refined Awadhi cuisine of the North, explore the stories behind India's beloved dishes.

Interactive smell stations, virtual cooking experiences, and live demonstrations by celebrated chefs bring India's culinary heritage to life.

The exhibition includes a food court featuring authentic regional cuisines, cooking workshops, and a farmers' market celebrating local produce.`,
    venue: "Phoenix Marketcity",
    venueAddress: "Viman Nagar, Pune - 411014",
    city: "Pune",
    category: "Food & Lifestyle",
    startDate: "2024-03-15",
    endDate: "2024-04-15",
    timing: "11:00 AM - 9:00 PM",
    priceRange: { min: 249, max: 999 },
    tickets: [
      {
        id: "t1",
        name: "Taster Pass",
        description: "Exhibition entry with samples",
        price: 249,
        available: true,
        benefits: ["Exhibition access", "5 food samples", "Recipe booklet"],
      },
      {
        id: "t2",
        name: "Foodie Experience",
        description: "The full culinary journey",
        price: 599,
        available: true,
        benefits: ["All tastings", "Cooking demo", "Chef meet & greet", "Spice kit"],
      },
      {
        id: "t3",
        name: "Master Chef Pass",
        description: "Cook with the experts",
        price: 999,
        available: true,
        benefits: ["Hands-on workshop", "Full meal", "Apron & tools", "Certificate", "Recipe cards"],
      },
    ],
    images: [
      "https://images.unsplash.com/photo-1505253758473-96b7015fcd40?w=800",
      "https://images.unsplash.com/photo-1567337710282-00832b415979?w=800",
      "https://images.unsplash.com/photo-1596797038530-2c107229654b?w=800",
    ],
    featured: true,
    organizer: {
      name: "Culinary Arts Foundation",
      logo: "CAF",
      description: "Preserving and promoting India's diverse culinary traditions.",
    },
    faqs: [
      { question: "Are vegetarian options available?", answer: "Absolutely! The exhibition features dedicated vegetarian and vegan sections." },
      { question: "Can I bring children?", answer: "Yes, there's a special kids cooking zone and child-friendly tastings." },
    ],
    rating: 4.7,
    reviews: 1834,
  },
];

export const getExhibitionById = (id: string): Exhibition | undefined => {
  return exhibitions.find((e) => e.id === id);
};

export const getFeaturedExhibitions = (): Exhibition[] => {
  return exhibitions.filter((e) => e.featured);
};

export const getExhibitionsByCity = (city: string): Exhibition[] => {
  return exhibitions.filter((e) => e.city.toLowerCase() === city.toLowerCase());
};

export const getExhibitionsByCategory = (category: string): Exhibition[] => {
  return exhibitions.filter((e) => e.category === category);
};
