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
  "Lucknow",
  "Chandigarh",
  "Goa",
  "Udaipur",
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
  "Automotive",
  "Nature & Wildlife",
  "Sports & Gaming",
  "Kids & Family",
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
    startDate: "2025-01-15",
    endDate: "2025-06-30",
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
    startDate: "2025-01-01",
    endDate: "2025-06-15",
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
    startDate: "2025-01-20",
    endDate: "2025-06-10",
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
    startDate: "2025-02-01",
    endDate: "2025-07-15",
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
    startDate: "2025-01-20",
    endDate: "2025-06-30",
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
    startDate: "2025-01-15",
    endDate: "2025-06-15",
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
  {
    id: "7",
    title: "Auto Expo India 2024",
    subtitle: "The Future of Mobility",
    description: "India's biggest automotive exhibition featuring EVs, concept cars, supercars, and the latest in automotive technology.",
    fullDescription: `Experience the thrill of the automobile industry at Auto Expo India 2024. From cutting-edge electric vehicles to stunning concept cars, witness the future of mobility unfold before your eyes.

Test drive the latest EVs, explore autonomous driving technology, and get up close with supercars from the world's most prestigious brands. Special pavilions dedicated to sustainable mobility and Indian automotive innovation.

Meet industry experts, attend panel discussions on the future of transportation, and discover career opportunities in the automotive sector.`,
    venue: "India Expo Mart",
    venueAddress: "Plot No. 23-25 & 27-29, Knowledge Park II, Greater Noida - 201306",
    city: "Delhi",
    category: "Automotive",
    startDate: "2025-02-05",
    endDate: "2025-06-14",
    timing: "10:00 AM - 7:00 PM",
    priceRange: { min: 350, max: 1999 },
    tickets: [
      {
        id: "t1",
        name: "General Admission",
        description: "Full exhibition access",
        price: 350,
        available: true,
        benefits: ["All halls access", "Brand showcases", "Live demos"],
      },
      {
        id: "t2",
        name: "Enthusiast Pass",
        description: "For true car lovers",
        price: 999,
        originalPrice: 1299,
        available: true,
        benefits: ["Priority entry", "Supercar zone", "Test drive slots", "Merchandise voucher"],
      },
      {
        id: "t3",
        name: "VIP Experience",
        description: "The ultimate auto experience",
        price: 1999,
        available: true,
        benefits: ["Exclusive preview day", "Meet designers", "Premium test drives", "Lunch included", "Gift hamper"],
      },
    ],
    images: [
      "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800",
      "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800",
      "https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=800",
    ],
    featured: true,
    organizer: {
      name: "Society of Indian Automobile Manufacturers",
      logo: "SIAM",
      description: "Representing India's automotive industry since 1960.",
    },
    faqs: [
      { question: "Can I test drive vehicles?", answer: "Yes, test drives are available for select models. Pre-registration recommended." },
      { question: "Is there parking?", answer: "Dedicated parking available at ₹150 per vehicle. Shuttle services from metro station." },
    ],
    rating: 4.6,
    reviews: 4521,
  },
  {
    id: "8",
    title: "Wildlife Photography Exhibition",
    subtitle: "Through the Lens of the Wild",
    description: "Award-winning wildlife photographs from India's national parks and sanctuaries, featuring rare species and conservation stories.",
    fullDescription: `Immerse yourself in the breathtaking beauty of India's wildlife through the lenses of the country's finest wildlife photographers. This exhibition showcases stunning images from the depths of Western Ghats to the heights of the Himalayas.

Featuring works from Wildlife Photographer of the Year contestants and Sanctuary Asia award winners, the exhibition tells compelling stories of conservation, habitat preservation, and the delicate balance of ecosystems.

Educational sessions, conservation talks, and photography workshops make this a must-visit for nature enthusiasts.`,
    venue: "Karnataka Chitrakala Parishath",
    venueAddress: "Kumara Krupa Road, Bangalore - 560001",
    city: "Bangalore",
    category: "Nature & Wildlife",
    startDate: "2025-01-10",
    endDate: "2025-06-25",
    timing: "10:00 AM - 6:00 PM",
    priceRange: { min: 150, max: 500 },
    tickets: [
      {
        id: "t1",
        name: "Exhibition Entry",
        description: "Gallery viewing",
        price: 150,
        available: true,
        benefits: ["All galleries", "Conservation info"],
      },
      {
        id: "t2",
        name: "Nature Lover Pass",
        description: "Enhanced experience",
        price: 350,
        available: true,
        benefits: ["Exhibition access", "Documentary screening", "Conservation talk", "Photo book"],
      },
      {
        id: "t3",
        name: "Photographer's Special",
        description: "Learn wildlife photography",
        price: 500,
        available: true,
        benefits: ["All access", "Photography workshop", "Field trip info", "Certificate"],
      },
    ],
    images: [
      "https://images.unsplash.com/photo-1474511320723-9a56873571b7?w=800",
      "https://images.unsplash.com/photo-1549366021-9f761d450615?w=800",
      "https://images.unsplash.com/photo-1456926631375-92c8ce872def?w=800",
    ],
    featured: false,
    organizer: {
      name: "Wildlife Conservation Society India",
      logo: "WCSI",
      description: "Dedicated to protecting India's wildlife and wild places.",
    },
    faqs: [
      { question: "Is this suitable for children?", answer: "Absolutely! The exhibition includes a dedicated kids section with interactive learning." },
      { question: "Can I purchase prints?", answer: "Yes, prints are available with proceeds supporting conservation projects." },
    ],
    rating: 4.8,
    reviews: 723,
  },
  {
    id: "9",
    title: "Gaming & Esports Festival",
    subtitle: "Play. Compete. Win.",
    description: "India's largest gaming festival featuring esports tournaments, gaming zones, VR experiences, and meet-ups with top streamers.",
    fullDescription: `Enter the ultimate gaming paradise at India's biggest Gaming & Esports Festival. Compete in major tournaments across titles like BGMI, Valorant, and FIFA, with prize pools worth lakhs.

Experience the latest gaming hardware, try unreleased games, and immerse yourself in VR worlds. Meet your favorite streamers, content creators, and professional esports players.

Cosplay competitions, retro gaming zones, and career workshops in gaming and esports development make this a comprehensive celebration of gaming culture.`,
    venue: "Hitex Exhibition Centre",
    venueAddress: "Izzat Nagar, Kondapur, Hyderabad - 500084",
    city: "Hyderabad",
    category: "Sports & Gaming",
    startDate: "2025-02-20",
    endDate: "2025-06-23",
    timing: "10:00 AM - 10:00 PM",
    priceRange: { min: 299, max: 1499 },
    tickets: [
      {
        id: "t1",
        name: "Gamer Pass",
        description: "General festival access",
        price: 299,
        available: true,
        benefits: ["All zones access", "Free play areas", "Streamer meetups"],
      },
      {
        id: "t2",
        name: "Pro Gamer Pass",
        description: "Enhanced gaming experience",
        price: 799,
        available: true,
        benefits: ["Priority access", "Tournament registration", "Gaming gear discount", "Pro player sessions"],
      },
      {
        id: "t3",
        name: "Champion Pass",
        description: "The ultimate gaming experience",
        price: 1499,
        available: true,
        benefits: ["VIP lounge", "All tournaments", "Premium hardware access", "Exclusive merchandise", "Meet & greet"],
      },
    ],
    images: [
      "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800",
      "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=800",
      "https://images.unsplash.com/photo-1493711662062-fa541f7f2f21?w=800",
    ],
    featured: true,
    organizer: {
      name: "Esports Federation of India",
      logo: "ESFI",
      description: "Promoting competitive gaming and esports ecosystem in India.",
    },
    faqs: [
      { question: "Do I need to bring my own equipment?", answer: "No, all gaming equipment is provided. You can bring your own peripherals if preferred." },
      { question: "How do I register for tournaments?", answer: "Tournament registration opens 2 weeks before the event. Pro and Champion pass holders get early access." },
    ],
    rating: 4.5,
    reviews: 2890,
  },
  {
    id: "10",
    title: "DinoWorld Adventure",
    subtitle: "Journey to the Prehistoric Era",
    description: "An immersive dinosaur exhibition featuring life-size animatronic dinosaurs, fossil displays, and interactive educational zones for kids.",
    fullDescription: `Travel back 65 million years to when dinosaurs ruled the Earth! DinoWorld Adventure brings prehistoric creatures to life with stunning animatronic displays, authentic fossil replicas, and immersive environments.

Watch a T-Rex roar, see Velociraptors hunt, and marvel at the massive Brachiosaurus. Our paleontology lab lets young explorers dig for fossils, while the 4D theater shows the dramatic story of dinosaur extinction.

Educational workshops, dino-themed activities, and photo opportunities with your favorite prehistoric creatures make this perfect for families.`,
    venue: "VR Chennai Mall",
    venueAddress: "100 Feet Bypass Road, Velachery, Chennai - 600042",
    city: "Chennai",
    category: "Kids & Family",
    startDate: "2025-01-01",
    endDate: "2025-07-31",
    timing: "10:00 AM - 9:00 PM",
    priceRange: { min: 399, max: 1299 },
    tickets: [
      {
        id: "t1",
        name: "Explorer Ticket",
        description: "Basic exhibition access",
        price: 399,
        available: true,
        benefits: ["Exhibition walkthrough", "Photo zones", "Dino facts booklet"],
      },
      {
        id: "t2",
        name: "Paleontologist Pack",
        description: "Interactive experience",
        price: 799,
        available: true,
        benefits: ["All exhibits", "Fossil dig experience", "4D theater", "Dino toy"],
      },
      {
        id: "t3",
        name: "Family Safari",
        description: "2 Adults + 2 Kids",
        price: 1299,
        originalPrice: 1596,
        available: true,
        benefits: ["Family entry", "All activities", "Photo package", "Dino meal voucher", "Souvenir kit"],
      },
    ],
    images: [
      "https://images.unsplash.com/photo-1519880856348-763a8b40aa79?w=800",
      "https://images.unsplash.com/photo-1606567595334-d39972c85dfd?w=800",
      "https://images.unsplash.com/photo-1525877442103-5ddb2089b2bb?w=800",
    ],
    featured: false,
    organizer: {
      name: "Science Edutainment India",
      logo: "SEI",
      description: "Making learning fun through interactive science experiences.",
    },
    faqs: [
      { question: "Is it scary for young children?", answer: "The exhibition is designed for all ages. Some animatronics may be exciting but not frightening. Staff are available to guide families." },
      { question: "How long does the experience take?", answer: "Plan for 2-3 hours to enjoy all exhibits and activities." },
    ],
    rating: 4.7,
    reviews: 3156,
  },
  {
    id: "11",
    title: "Classical Music Festival",
    subtitle: "Celebrating Indian Ragas",
    description: "A 10-day celebration of Indian classical music featuring legendary artists, emerging talents, and fusion performances.",
    fullDescription: `Experience the soul-stirring beauty of Indian classical music at this prestigious festival. From the intricate ragas of Hindustani classical to the rhythmic complexity of Carnatic music, witness performances by living legends.

Evening concerts under the stars, morning meditation with music, and intimate baithak-style performances create an atmosphere of spiritual and artistic communion.

Workshops, lectures, and interactive sessions with maestros make this festival both a celebration and a learning experience.`,
    venue: "Sawai Gandharva Bhimsen Mahotsav Grounds",
    venueAddress: "Shivajinagar, Pune - 411005",
    city: "Pune",
    category: "Music",
    startDate: "2025-02-10",
    endDate: "2025-06-20",
    timing: "6:00 PM - 11:00 PM",
    priceRange: { min: 500, max: 3999 },
    tickets: [
      {
        id: "t1",
        name: "Single Evening Pass",
        description: "One night concert",
        price: 500,
        available: true,
        benefits: ["Evening concert", "General seating"],
      },
      {
        id: "t2",
        name: "Weekend Pass",
        description: "3 consecutive evenings",
        price: 1299,
        available: true,
        benefits: ["3 concerts", "Better seating", "Program booklet"],
      },
      {
        id: "t3",
        name: "Season Pass",
        description: "All 10 days",
        price: 3999,
        available: true,
        benefits: ["All concerts", "Premium seating", "Workshop access", "Meet artists", "Exclusive dinner"],
      },
    ],
    images: [
      "https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=800",
      "https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=800",
      "https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=800",
    ],
    featured: false,
    organizer: {
      name: "Sawai Gandharva Festival Committee",
      logo: "SGF",
      description: "Preserving and promoting Indian classical music traditions.",
    },
    faqs: [
      { question: "Can I bring recording equipment?", answer: "Personal recording is not permitted. Official recordings may be available for purchase." },
      { question: "Is there seating arrangement?", answer: "Traditional floor seating with mats. Chair seating available for premium passes." },
    ],
    rating: 4.9,
    reviews: 1567,
  },
  {
    id: "12",
    title: "Jewellery India Trade Fair",
    subtitle: "Sparkle & Elegance",
    description: "India's premier B2B jewellery trade fair featuring the finest collections from manufacturers, designers, and artisans.",
    fullDescription: `Discover the brilliance of India's jewellery industry at this prestigious trade fair. From traditional temple jewellery to contemporary diamond designs, explore collections from over 500 exhibitors.

Network with manufacturers, wholesalers, and retailers from across the country and abroad. Witness live demonstrations of traditional jewellery-making techniques and the latest CAD/CAM technologies.

While primarily B2B, special consumer days allow retail buyers to access exclusive collections and special prices.`,
    venue: "Bombay Exhibition Centre",
    venueAddress: "NSE Complex, Goregaon East, Mumbai - 400063",
    city: "Mumbai",
    category: "Trade Shows",
    startDate: "2025-02-08",
    endDate: "2025-06-12",
    timing: "10:00 AM - 7:00 PM",
    priceRange: { min: 200, max: 2500 },
    tickets: [
      {
        id: "t1",
        name: "Visitor Pass (Consumer Day)",
        description: "Last 2 days only",
        price: 200,
        available: true,
        benefits: ["Exhibition access", "Shopping privilege"],
      },
      {
        id: "t2",
        name: "Trade Visitor",
        description: "For industry professionals",
        price: 500,
        available: true,
        benefits: ["All 5 days", "Business lounge", "Directory access"],
      },
      {
        id: "t3",
        name: "VIP Buyer Pass",
        description: "Premium trade access",
        price: 2500,
        available: true,
        benefits: ["Priority networking", "Private showings", "Dinner events", "Transport service"],
      },
    ],
    images: [
      "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=800",
      "https://images.unsplash.com/photo-1573408301185-9146fe634ad0?w=800",
      "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800",
    ],
    featured: false,
    organizer: {
      name: "Gem & Jewellery Export Promotion Council",
      logo: "GJEPC",
      description: "Promoting India's gem and jewellery exports globally.",
    },
    faqs: [
      { question: "Can I make purchases?", answer: "Consumer days allow retail purchases. B2B days are for trade transactions only." },
      { question: "Is there security for high-value items?", answer: "State-of-the-art security measures are in place throughout the venue." },
    ],
    rating: 4.4,
    reviews: 892,
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

export const getPriceRange = (): { min: number; max: number } => {
  const prices = exhibitions.flatMap((e) => [e.priceRange.min, e.priceRange.max]);
  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
  };
};
