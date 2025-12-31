// Helper function to get future dates relative to current date
const getFutureDate = (daysFromNow: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().split('T')[0];
};

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
    startDate: getFutureDate(7),
    endDate: getFutureDate(120),
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
    startDate: getFutureDate(3),
    endDate: getFutureDate(150),
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
    title: "Tech Horizons 2025",
    subtitle: "Tomorrow's Technology Today",
    description: "Experience the latest innovations in AI, robotics, sustainable tech, and space exploration at India's largest technology exhibition.",
    fullDescription: `Dive into the future at Tech Horizons 2025, where cutting-edge technology meets hands-on experience. From autonomous vehicles to quantum computing demonstrations, witness innovations that will shape our tomorrow.

Interactive zones let you pilot drones, experience VR simulations of Mars colonization, and program your own robots. Leading tech companies showcase their latest products, while startups present revolutionary solutions to global challenges.

Special zones dedicated to sustainability tech, biotechnology, and India's space program make this exhibition a must-visit for tech enthusiasts of all ages.`,
    venue: "Bangalore International Exhibition Centre",
    venueAddress: "10th Mile, Tumkur Road, Madavara Post, Bangalore - 562162",
    city: "Bangalore",
    category: "Science & Tech",
    startDate: getFutureDate(14),
    endDate: getFutureDate(100),
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
    startDate: getFutureDate(21),
    endDate: getFutureDate(180),
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
    startDate: getFutureDate(10),
    endDate: getFutureDate(160),
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
    startDate: getFutureDate(5),
    endDate: getFutureDate(90),
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
      { question: "Are dietary restrictions accommodated?", answer: "Yes, vegetarian, vegan, and gluten-free options are clearly labeled and available." },
      { question: "Can children participate in workshops?", answer: "Kids' cooking workshops for ages 6-12 are available on weekends." },
    ],
    rating: 4.7,
    reviews: 1834,
  },
  {
    id: "7",
    title: "Auto Expo India",
    subtitle: "The Future of Mobility",
    description: "India's biggest automotive exhibition featuring latest cars, bikes, EVs, and concept vehicles from global manufacturers.",
    fullDescription: `Rev up your engines for India's most anticipated automotive extravaganza! Auto Expo India brings together the world's leading automobile manufacturers under one roof.

Experience the thrill of sitting in concept cars, test driving EVs, and witnessing the unveiling of vehicles that will define the future of mobility.

From luxury supercars to affordable family vehicles, from racing bikes to electric scooters - explore everything on wheels at this spectacular showcase.`,
    venue: "India Expo Mart",
    venueAddress: "Plot No. 23-25 & 27-29, Knowledge Park II, Greater Noida - 201306",
    city: "Delhi",
    category: "Automotive",
    startDate: getFutureDate(30),
    endDate: getFutureDate(45),
    timing: "10:00 AM - 7:00 PM",
    priceRange: { min: 350, max: 1999 },
    tickets: [
      {
        id: "t1",
        name: "Visitor Pass",
        description: "General exhibition access",
        price: 350,
        available: true,
        benefits: ["All pavilions access", "Product launches", "Photo zones"],
      },
      {
        id: "t2",
        name: "Enthusiast Pass",
        description: "For auto lovers",
        price: 999,
        originalPrice: 1299,
        available: true,
        benefits: ["Priority entry", "Test drive slots", "Merchandise discount", "VIP lounge"],
      },
      {
        id: "t3",
        name: "Premium Experience",
        description: "The ultimate auto experience",
        price: 1999,
        available: true,
        benefits: ["Skip all queues", "Exclusive unveilings", "Meet designers", "Gift hamper", "Parking included"],
      },
    ],
    images: [
      "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800",
      "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800",
      "https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=800",
    ],
    featured: true,
    organizer: {
      name: "SIAM Events",
      logo: "SIAM",
      description: "Society of Indian Automobile Manufacturers - representing the Indian automobile industry.",
    },
    faqs: [
      { question: "Can I test drive vehicles?", answer: "Yes, test drives are available for select vehicles. Prior booking recommended for popular models." },
      { question: "Is there parking available?", answer: "Yes, extensive parking available at ₹150 for cars and ₹50 for two-wheelers per day." },
    ],
    rating: 4.6,
    reviews: 4521,
  },
  {
    id: "8",
    title: "Wildlife Photography Exhibition",
    subtitle: "Through the Lens of Nature",
    description: "Stunning wildlife photography from India's finest nature photographers capturing the beauty of our natural heritage.",
    fullDescription: `Embark on a visual safari through India's diverse ecosystems in this breathtaking exhibition of wildlife photography.

From the majestic tigers of Ranthambore to the dancing peacocks of Rajasthan, from the snow leopards of Ladakh to the marine life of the Andamans - experience India's wildlife as never before.

The exhibition features award-winning photographs, conservation stories, and interactive sessions with wildlife photographers and conservationists.`,
    venue: "Karnataka Chitrakala Parishath",
    venueAddress: "Kumara Krupa Road, Bangalore - 560001",
    city: "Bangalore",
    category: "Nature & Wildlife",
    startDate: getFutureDate(12),
    endDate: getFutureDate(75),
    timing: "10:00 AM - 6:00 PM",
    priceRange: { min: 150, max: 500 },
    tickets: [
      {
        id: "t1",
        name: "Gallery Entry",
        description: "Exhibition viewing",
        price: 150,
        available: true,
        benefits: ["All galleries", "Audio commentary"],
      },
      {
        id: "t2",
        name: "Nature Lover Pass",
        description: "Enhanced experience",
        price: 350,
        available: true,
        benefits: ["Gallery access", "Documentary screening", "Conservation talk", "Photo calendar"],
      },
      {
        id: "t3",
        name: "Photographer's Special",
        description: "For photography enthusiasts",
        price: 500,
        available: true,
        benefits: ["All access", "Workshop with photographers", "Editing session", "Signed print"],
      },
    ],
    images: [
      "https://images.unsplash.com/photo-1474511320723-9a56873571b7?w=800",
      "https://images.unsplash.com/photo-1549366021-9f761d450615?w=800",
      "https://images.unsplash.com/photo-1456926631375-92c8ce872def?w=800",
    ],
    featured: false,
    organizer: {
      name: "Wildlife Conservation Trust",
      logo: "WCT",
      description: "Dedicated to protecting India's wildlife and natural habitats since 1983.",
    },
    faqs: [
      { question: "Can I buy prints?", answer: "Yes, limited edition prints are available. A portion of proceeds goes to wildlife conservation." },
      { question: "Are there activities for children?", answer: "Yes, special wildlife quizzes and coloring activities for children on weekends." },
    ],
    rating: 4.8,
    reviews: 756,
  },
  {
    id: "9",
    title: "Gaming & Comic Con",
    subtitle: "The Ultimate Pop Culture Festival",
    description: "India's biggest gaming and pop culture convention featuring esports, cosplay, celebrity guests, and exclusive merchandise.",
    fullDescription: `Level up your experience at India's most epic pop culture celebration! Gaming & Comic Con brings together gamers, comic lovers, anime fans, and pop culture enthusiasts for an unforgettable weekend.

Compete in esports tournaments, meet your favorite content creators, attend panels with comic artists and voice actors, and shop exclusive merchandise from your favorite franchises.

Cosplay competitions, gaming zones with the latest releases, VR experiences, and surprise celebrity appearances make this the must-attend event for every fan.`,
    venue: "HITEX Exhibition Centre",
    venueAddress: "Izzat Nagar, Kondapur, Hyderabad - 500084",
    city: "Hyderabad",
    category: "Sports & Gaming",
    startDate: getFutureDate(45),
    endDate: getFutureDate(48),
    timing: "10:00 AM - 10:00 PM",
    priceRange: { min: 299, max: 1499 },
    tickets: [
      {
        id: "t1",
        name: "Day Pass",
        description: "Single day entry",
        price: 299,
        available: true,
        benefits: ["All zones access", "Gaming areas", "Stage shows"],
      },
      {
        id: "t2",
        name: "Weekend Pass",
        description: "Both days access",
        price: 499,
        originalPrice: 598,
        available: true,
        benefits: ["2-day access", "Priority gaming", "Cosplay area", "Merchandise discount"],
      },
      {
        id: "t3",
        name: "Ultimate Fan Pass",
        description: "The complete experience",
        price: 1499,
        available: true,
        benefits: ["Skip queues", "Meet & greet", "Exclusive panels", "Limited merch", "Photo ops"],
      },
    ],
    images: [
      "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=800",
      "https://images.unsplash.com/photo-1493711662062-fa541f7f60d4?w=800",
      "https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf?w=800",
    ],
    featured: true,
    organizer: {
      name: "Comic Con India",
      logo: "CCI",
      description: "Bringing global pop culture experiences to Indian fans since 2011.",
    },
    faqs: [
      { question: "Can I come in cosplay?", answer: "Absolutely! Cosplay is encouraged. There are changing rooms and a dedicated cosplay zone." },
      { question: "Are esports tournaments open to all?", answer: "Registration required for tournaments. Casual gaming zones are open to all attendees." },
    ],
    rating: 4.5,
    reviews: 2987,
  },
  {
    id: "10",
    title: "Children's Science Festival",
    subtitle: "Learn, Play, Discover",
    description: "An interactive science exhibition designed for young minds with hands-on experiments, shows, and educational fun.",
    fullDescription: `Ignite the scientist within your child at this extraordinary festival of discovery and wonder!

Designed for children aged 5-14, this interactive exhibition makes science fun through hands-on experiments, live demonstrations, and engaging shows that bring scientific concepts to life.

From building simple robots to understanding the solar system, from chemistry magic shows to dinosaur exhibits - every corner offers a new adventure in learning.`,
    venue: "VR Chennai Mall",
    venueAddress: "100 Feet Bypass Road, Velachery, Chennai - 600042",
    city: "Chennai",
    category: "Kids & Family",
    startDate: getFutureDate(8),
    endDate: getFutureDate(200),
    timing: "10:00 AM - 9:00 PM",
    priceRange: { min: 399, max: 1299 },
    tickets: [
      {
        id: "t1",
        name: "Young Scientist",
        description: "Child entry (5-14 years)",
        price: 399,
        available: true,
        benefits: ["All exhibits", "3 experiments", "Science show", "Activity book"],
      },
      {
        id: "t2",
        name: "Family Explorer",
        description: "2 Adults + 2 Children",
        price: 999,
        originalPrice: 1196,
        available: true,
        benefits: ["Family entry", "All experiments", "Planetarium show", "Take-home kit"],
      },
      {
        id: "t3",
        name: "Junior Genius Camp",
        description: "Full day program",
        price: 1299,
        available: true,
        benefits: ["5-hour program", "Lunch included", "Certificate", "Science kit", "Group activities"],
      },
    ],
    images: [
      "https://images.unsplash.com/photo-1567168544230-ce56c8e88f70?w=800",
      "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=800",
      "https://images.unsplash.com/photo-1559757175-0eb30cd8c063?w=800",
    ],
    featured: false,
    organizer: {
      name: "Young Minds Foundation",
      logo: "YMF",
      description: "Making science education accessible and enjoyable for children across India.",
    },
    faqs: [
      { question: "Is adult supervision required?", answer: "Children under 8 must be accompanied by an adult. Older children can explore independently." },
      { question: "Are there facilities for toddlers?", answer: "A special sensory zone for ages 3-5 is available. Stroller parking and nursing rooms provided." },
    ],
    rating: 4.9,
    reviews: 1523,
  },
  {
    id: "11",
    title: "Classical Music Festival",
    subtitle: "Melodies of the Masters",
    description: "Experience the divine sounds of Indian classical music with performances by legendary artists and rising stars.",
    fullDescription: `Immerse yourself in the rich tradition of Indian classical music at this prestigious festival bringing together masters of both Hindustani and Carnatic music.

Evening ragas under the stars, morning mehfils in heritage settings, and intimate jugalbandis between legendary artists create an atmosphere of pure musical bliss.

Workshops, lecture-demonstrations, and masterclasses offer deeper insights into the intricacies of Indian classical music traditions.`,
    venue: "Sawai Gandharva Hall",
    venueAddress: "Shivajinagar, Pune - 411005",
    city: "Pune",
    category: "Music",
    startDate: getFutureDate(60),
    endDate: getFutureDate(70),
    timing: "6:00 PM - 11:00 PM",
    priceRange: { min: 500, max: 3999 },
    tickets: [
      {
        id: "t1",
        name: "Single Evening",
        description: "One concert",
        price: 500,
        available: true,
        benefits: ["Concert access", "Program booklet"],
      },
      {
        id: "t2",
        name: "Weekend Pass",
        description: "All weekend concerts",
        price: 1999,
        originalPrice: 2500,
        available: true,
        benefits: ["3 concerts", "Reserved seating", "Meet artists", "CD collection"],
      },
      {
        id: "t3",
        name: "Rasika Pass",
        description: "The complete musical journey",
        price: 3999,
        available: true,
        benefits: ["All concerts", "Front row", "Green room access", "Dinner with artists", "Signed memorabilia"],
      },
    ],
    images: [
      "https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=800",
      "https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=800",
      "https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=800",
    ],
    featured: false,
    organizer: {
      name: "Saptak Music Foundation",
      logo: "SMF",
      description: "Dedicated to preserving and promoting Indian classical music traditions.",
    },
    faqs: [
      { question: "Are recordings allowed?", answer: "Audio/video recording is not permitted during performances." },
      { question: "What's the dress code?", answer: "Smart casuals recommended. Traditional attire welcome and appreciated." },
    ],
    rating: 4.9,
    reviews: 892,
  },
  {
    id: "12",
    title: "India Property Expo",
    subtitle: "Your Dream Home Awaits",
    description: "India's largest real estate exhibition featuring premium properties, home loans, and interior solutions under one roof.",
    fullDescription: `Find your perfect home at India's most comprehensive real estate exhibition! Over 200 developers showcase residential and commercial properties from across India.

Compare projects, meet developers directly, explore virtual property tours, and avail exclusive expo discounts on bookings.

Financial institutions offer on-the-spot loan approvals, while interior designers and home automation experts help you envision your dream living space.`,
    venue: "Bombay Exhibition Centre",
    venueAddress: "NSE Complex, Goregaon East, Mumbai - 400063",
    city: "Mumbai",
    category: "Trade Shows",
    startDate: getFutureDate(25),
    endDate: getFutureDate(30),
    timing: "10:00 AM - 7:00 PM",
    priceRange: { min: 200, max: 2500 },
    tickets: [
      {
        id: "t1",
        name: "Visitor Entry",
        description: "General access",
        price: 200,
        available: true,
        benefits: ["All stalls access", "Property brochures", "Free consultation"],
      },
      {
        id: "t2",
        name: "Homebuyer Pass",
        description: "For serious buyers",
        price: 999,
        available: true,
        benefits: ["Priority appointments", "Loan pre-approval", "Legal consultation", "Site visit voucher"],
      },
      {
        id: "t3",
        name: "Investor Package",
        description: "Premium investor services",
        price: 2500,
        available: true,
        benefits: ["VIP lounge", "Exclusive deals", "Portfolio consultation", "Lunch included", "Developer meetings"],
      },
    ],
    images: [
      "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800",
      "https://images.unsplash.com/photo-1582407947304-fd86f028f716?w=800",
      "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800",
    ],
    featured: false,
    organizer: {
      name: "CREDAI Events",
      logo: "CREDAI",
      description: "Confederation of Real Estate Developers' Associations of India.",
    },
    faqs: [
      { question: "Can I book properties at the expo?", answer: "Yes, many developers offer exclusive expo-only prices and booking facilities." },
      { question: "Are home loans available on-site?", answer: "Yes, major banks and NBFCs offer on-the-spot loan approvals and processing." },
    ],
    rating: 4.3,
    reviews: 1245,
  },
];

export const getExhibitionById = (id: string): Exhibition | undefined => {
  return exhibitions.find((e) => e.id === id);
};

export const getExhibitionsByCity = (city: string): Exhibition[] => {
  return exhibitions.filter((e) => e.city.toLowerCase() === city.toLowerCase());
};

export const getExhibitionsByCategory = (category: string): Exhibition[] => {
  return exhibitions.filter((e) => e.category.toLowerCase() === category.toLowerCase());
};

export const getFeaturedExhibitions = (): Exhibition[] => {
  return exhibitions.filter((e) => e.featured);
};

export const getUpcomingExhibitions = (): Exhibition[] => {
  const today = new Date();
  return exhibitions.filter((e) => new Date(e.startDate) >= today).slice(0, 6);
};

export const getPriceRange = (): { min: number; max: number } => {
  const allPrices = exhibitions.flatMap(e => [e.priceRange.min, e.priceRange.max]);
  return {
    min: Math.min(...allPrices),
    max: Math.max(...allPrices),
  };
};
