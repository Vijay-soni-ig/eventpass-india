import { useState } from "react";
import { Link } from "react-router-dom";
import { 
  Building2, Plus, BarChart3, Ticket, Users, Calendar,
  TrendingUp, Settings, FileText, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const ExhibitorDashboard = () => {
  const [activeTab, setActiveTab] = useState("overview");

  const stats = [
    { label: "Total Revenue", value: "₹2,45,000", change: "+12%", icon: TrendingUp },
    { label: "Tickets Sold", value: "1,234", change: "+8%", icon: Ticket },
    { label: "Active Events", value: "3", change: "0", icon: Calendar },
    { label: "Total Visitors", value: "5,678", change: "+15%", icon: Users },
  ];

  const exhibitions = [
    { id: 1, name: "Ahmedabad Art Fair 2024", status: "active", tickets: 456, revenue: "₹89,000" },
    { id: 2, name: "Gujarat Trade Expo", status: "draft", tickets: 0, revenue: "₹0" },
    { id: 3, name: "Textile Exhibition", status: "completed", tickets: 778, revenue: "₹1,56,000" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="container mx-auto py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <aside className="lg:w-64 shrink-0">
            <nav className="space-y-1">
              {[
                { id: "overview", label: "Dashboard", icon: BarChart3 },
                { id: "exhibitions", label: "My Exhibitions", icon: Building2 },
                { id: "create", label: "Create Exhibition", icon: Plus },
                { id: "tickets", label: "Ticket Sales", icon: Ticket },
                { id: "settings", label: "Settings", icon: Settings },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === item.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-foreground"
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </button>
              ))}
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1">
            {activeTab === "overview" && (
              <div className="space-y-6">
                <h1 className="font-display text-2xl font-bold">Dashboard Overview</h1>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {stats.map((stat, index) => (
                    <Card key={index} className="card-premium">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <stat.icon className="w-5 h-5 text-muted-foreground" />
                          <Badge variant="secondary" className="text-xs">{stat.change}</Badge>
                        </div>
                        <p className="text-2xl font-bold">{stat.value}</p>
                        <p className="text-sm text-muted-foreground">{stat.label}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <Card className="card-premium">
                  <CardHeader>
                    <CardTitle className="text-lg">Recent Exhibitions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {exhibitions.map((event) => (
                        <div key={event.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                          <div>
                            <p className="font-medium">{event.name}</p>
                            <p className="text-sm text-muted-foreground">{event.tickets} tickets • {event.revenue}</p>
                          </div>
                          <Badge variant={event.status === "active" ? "default" : "secondary"}>
                            {event.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === "create" && (
              <div className="space-y-6">
                <h1 className="font-display text-2xl font-bold">Create Exhibition</h1>
                <Card className="card-premium">
                  <CardContent className="p-6 space-y-6">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium mb-2 block">Exhibition Name</label>
                        <Input placeholder="e.g., Gujarat Art Fair 2024" />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-2 block">Category</label>
                        <Input placeholder="e.g., Art & Culture" />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">Description</label>
                      <Textarea placeholder="Describe your exhibition..." rows={4} />
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium mb-2 block">City</label>
                        <Input placeholder="e.g., Ahmedabad" />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-2 block">Venue</label>
                        <Input placeholder="e.g., GMDC Ground" />
                      </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium mb-2 block">Start Date</label>
                        <Input type="date" />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-2 block">End Date</label>
                        <Input type="date" />
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <Button variant="default">Publish Exhibition</Button>
                      <Button variant="outline">Save as Draft</Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {(activeTab === "exhibitions" || activeTab === "tickets" || activeTab === "settings") && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">This section is coming soon.</p>
              </div>
            )}
          </main>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default ExhibitorDashboard;
