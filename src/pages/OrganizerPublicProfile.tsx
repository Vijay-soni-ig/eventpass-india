import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { MapPin, Globe, Mail, Phone, Share2, BadgeCheck, Instagram, Facebook, Linkedin, Twitter, Youtube, Link2, Images } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ExhibitionCard from "@/components/ExhibitionCard";
import { FollowButton } from "@/components/organizer/FollowButton";
import { GalleryLightbox } from "@/components/organizer/GalleryLightbox";
import { usePublicOrganizer, usePublicOrganizerEvents, usePublicOrganizerGallery } from "@/hooks/usePublicOrganizer";
import { Calendar } from "lucide-react";
import type { OrganizerGalleryMedia } from "@/types/exhibitor";

const SOCIAL_ICONS: Record<string, typeof Instagram> = {
  instagram: Instagram,
  facebook: Facebook,
  linkedin: Linkedin,
  twitter: Twitter,
  youtube: Youtube,
  other: Link2,
};

function EventsList({ slug, type }: { slug: string; type: "upcoming" | "past" }) {
  const { data, isLoading } = usePublicOrganizerEvents(slug, type);

  if (isLoading) return <LoadingState label="Loading events..." />;
  if (!data || data.exhibitions.length === 0) {
    return (
      <EmptyState
        icon={Calendar}
        title={type === "upcoming" ? "No upcoming events" : "No past events"}
        description={
          type === "upcoming"
            ? "This organizer hasn't published any upcoming events yet."
            : "This organizer has no completed events yet."
        }
      />
    );
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {data.exhibitions.map((exhibition) => (
        <ExhibitionCard key={exhibition.id} exhibition={exhibition} />
      ))}
    </div>
  );
}

function GalleryGrid({ slug }: { slug: string }) {
  const { data: items, isLoading } = usePublicOrganizerGallery(slug);
  const [lightboxItem, setLightboxItem] = useState<OrganizerGalleryMedia | null>(null);

  if (isLoading) return <LoadingState label="Loading gallery..." />;
  if (!items || items.length === 0) {
    return (
      <EmptyState
        icon={Images}
        title="No gallery images yet"
        description="This organizer hasn't added any photos to their gallery yet."
      />
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => setLightboxItem(item)}
            className="relative aspect-square rounded-lg overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            aria-label={`View ${item.caption || "gallery image"} full size`}
          >
            <img
              src={item.imageUrl}
              alt={item.altText || item.caption || "Organizer gallery image"}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            {item.isFeatured && (
              <span className="absolute top-2 right-2 bg-primary text-primary-foreground text-[10px] font-medium px-1.5 py-0.5 rounded-full">
                Featured
              </span>
            )}
          </button>
        ))}
      </div>
      <GalleryLightbox item={lightboxItem} onClose={() => setLightboxItem(null)} />
    </>
  );
}

const OrganizerPublicProfile = () => {
  const { slug } = useParams<{ slug: string }>();
  const { data: organizer, isLoading } = usePublicOrganizer(slug);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: organizer?.name, url });
        return;
      } catch {
        // user cancelled the native share sheet — fall through to nothing
        return;
      }
    }
    await navigator.clipboard.writeText(url);
    toast.success("Profile link copied to clipboard");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <LoadingState label="Loading organizer profile..." />
        <Footer />
      </div>
    );
  }

  if (!organizer) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto py-20 text-center">
          <h1 className="font-display text-3xl mb-4">Organizer Not Found</h1>
          <p className="text-muted-foreground mb-6">
            This organizer profile doesn't exist or isn't public.
          </p>
          <Link to="/exhibitions">
            <Button>Browse Exhibitions</Button>
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  const isVerified = organizer.kycStatus === "verified";
  const location = [organizer.city, organizer.state].filter(Boolean).join(", ");
  const socialLinks = organizer.socialLinks ?? [];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Cover */}
      <div className="relative aspect-[3/1] bg-muted">
        {organizer.coverImageUrl && (
          <img src={organizer.coverImageUrl} alt="" className="w-full h-full object-cover" />
        )}
      </div>

      <div className="container mx-auto px-4">
        <div className="relative -mt-12 flex flex-col sm:flex-row items-start sm:items-end gap-4 pb-6">
          <Avatar className="w-24 h-24 border-4 border-background bg-card shrink-0">
            <AvatarImage src={organizer.logoUrl ?? undefined} alt={organizer.name} />
            <AvatarFallback className="text-2xl font-semibold">{organizer.name.charAt(0)}</AvatarFallback>
          </Avatar>

          <div className="flex-1 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl md:text-3xl">{organizer.name}</h1>
              {isVerified && (
                <span className="inline-flex items-center gap-1 text-sm font-medium text-success">
                  <BadgeCheck className="w-4 h-4" />
                  Verified Organizer
                </span>
              )}
            </div>
            {location && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                <MapPin className="w-3.5 h-3.5" />
                {location}
              </div>
            )}
            {organizer.description && (
              <p className="text-muted-foreground mt-2 max-w-2xl">{organizer.description}</p>
            )}
            <p className="text-sm text-muted-foreground mt-2">
              <span className="font-semibold text-foreground">{organizer._count?.follows ?? 0}</span> Followers
              {typeof organizer._count?.exhibitions === "number" && (
                <>
                  {" "}· <span className="font-semibold text-foreground">{organizer._count.exhibitions}</span> Events
                </>
              )}
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <FollowButton organizerId={organizer.id} slug={slug!} />
            <Button variant="outline" size="icon" onClick={handleShare} aria-label="Share profile">
              <Share2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <Tabs defaultValue="upcoming" className="pb-16">
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming Events</TabsTrigger>
            <TabsTrigger value="past">Past Events</TabsTrigger>
            <TabsTrigger value="gallery">Gallery</TabsTrigger>
            <TabsTrigger value="about">About</TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="mt-6">
            <EventsList slug={slug!} type="upcoming" />
          </TabsContent>

          <TabsContent value="past" className="mt-6">
            <EventsList slug={slug!} type="past" />
          </TabsContent>

          <TabsContent value="gallery" className="mt-6">
            <GalleryGrid slug={slug!} />
          </TabsContent>

          <TabsContent value="about" className="mt-6 max-w-2xl space-y-4">
            {organizer.description && <p className="text-muted-foreground">{organizer.description}</p>}

            <div className="space-y-2 text-sm">
              {organizer.website && (
                <a
                  href={organizer.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
                >
                  <Globe className="w-4 h-4" />
                  {organizer.website}
                </a>
              )}
              {organizer.publicEmail && (
                <a href={`mailto:${organizer.publicEmail}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                  <Mail className="w-4 h-4" />
                  {organizer.publicEmail}
                </a>
              )}
              {organizer.publicPhone && (
                <a href={`tel:${organizer.publicPhone}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                  <Phone className="w-4 h-4" />
                  {organizer.publicPhone}
                </a>
              )}
              {location && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="w-4 h-4" />
                  {[location, organizer.country].filter(Boolean).join(", ")}
                </div>
              )}
            </div>

            {socialLinks.length > 0 && (
              <div className="flex gap-3">
                {socialLinks.map((link) => {
                  const Icon = SOCIAL_ICONS[link.platform] ?? Link2;
                  return (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/70"
                      aria-label={link.platform}
                    >
                      <Icon className="w-4 h-4" />
                    </a>
                  );
                })}
              </div>
            )}

            {!organizer.description && !organizer.website && !organizer.publicEmail && !organizer.publicPhone && socialLinks.length === 0 && (
              <p className="text-sm text-muted-foreground">This organizer hasn't added any public details yet.</p>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Footer />
    </div>
  );
};

export default OrganizerPublicProfile;
