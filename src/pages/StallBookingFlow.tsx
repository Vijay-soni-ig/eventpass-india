import { useParams, Link } from "react-router-dom";
import { Building2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { usePublicExhibition } from "@/hooks/usePublicExhibitions";

// Stalls are no longer bought directly by visitors here — they're allocated
// to exhibitor businesses through an application/approval workflow
// (apply on the exhibition page -> organizer approves -> select a stall ->
// pay). This page now just points visitors to the right place instead of
// serving a booking form against a removed endpoint.
const StallBookingFlow = () => {
  const { id } = useParams<{ id: string }>();
  const { data: exhibition } = usePublicExhibition(id);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto py-20">
        <Card className="max-w-lg mx-auto">
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Building2 className="w-8 h-8 text-primary" />
            </div>
            <h1 className="font-display text-2xl">Exhibiting works a little differently now</h1>
            <p className="text-muted-foreground">
              Stalls are no longer booked directly. To exhibit{exhibition ? ` at ${exhibition.name}` : ""}, apply from
              the exhibition page — the organizer reviews applications, and approved exhibitors then pick their own
              stall and pay.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              {id && (
                <Link to={`/exhibition/${id}`}>
                  <Button className="gap-2">
                    Go to Exhibition Page
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              )}
              <Link to="/exhibitor-dashboard/participations">
                <Button variant="outline">View My Applications</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
      <Footer />
    </div>
  );
};

export default StallBookingFlow;
