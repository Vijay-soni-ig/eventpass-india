
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Building2, Globe2, Image as ImageIcon, RefreshCw, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/useAuth";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useOrganizerProfile, useUpdateOrganizerProfile, useUploadOrganizerLogo, useUploadOrganizerCover } from "@/hooks/organizer/useOrganizerProfile";
import { COUNTRIES, INDIA_STATES_AND_UTS } from "@/lib/locationData";
import { resolveHomeRoute } from "@/lib/permissions";

const BUSINESS_TYPES = ["Private Limited","LLP","Proprietorship","Partnership","Trust / Society / Association","Other"];
const SOURCES = [["google","Google"],["instagram","Instagram"],["facebook","Facebook"],["linkedin","LinkedIn"],["youtube","YouTube"],["friend_or_referral","Friend / Referral"],["event_or_exhibition","Event / Exhibition"],["other","Other"]] as const;
const FREQUENCIES = [["one_time","One-time event"],["monthly","Monthly"],["weekly","Weekly"],["daily","Daily"],["seasonal","Seasonal"],["annual","Annual"]] as const;
const SIZES = [["1_50","1–50 people"],["51_100","51–100 people"],["101_500","101–500 people"],["501_1000","501–1,000 people"],["1000_plus","1,000+ people"]] as const;
const STEPS = [
  ["organization-profile","Organization profile","Your organization"],
  ["organization-branding","Organization branding","Your brand"],
  ["organizer-insights","About your events","Your experience"],
  ["organizer-page","Create your organizer page","Public presence"],
] as const;
const slugify = (v: string) => v.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,50);
const pill = (selected: boolean) => selected ? "rounded-full border border-primary bg-primary px-4 py-2 text-sm text-primary-foreground" : "rounded-full border bg-card px-4 py-2 text-sm hover:border-primary/50";

export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params,setParams] = useSearchParams();
  const { data:onboarding,isLoading,isError,refetch,isFetching } = useOnboarding();
  const { data:organizer } = useOrganizerProfile();
  const updateProfile = useUpdateOrganizerProfile();
  const uploadLogo = useUploadOrganizerLogo();
  const uploadCover = useUploadOrganizerCover();
  const [step,setStep] = useState(0);
  const [errors,setErrors] = useState<Record<string,string>>({});
  const [form,setForm] = useState({
    name:"",businessType:"",country:"",address:"",city:"",state:"",
    description:"",website:"",brandPrimaryColor:"",brandSecondaryColor:"",
    discoverySources:[] as string[],eventFrequency:"",typicalEventSize:"",
    slug:"",publicEmail:"",publicPhone:"",publicProfileEnabled:false,
  });

  useEffect(() => {
    if (!organizer) return;
    setForm(f => ({...f,name:organizer.name||"",businessType:organizer.businessType||"",country:organizer.country||"",
      address:organizer.address||"",city:organizer.city||"",state:organizer.state||"",description:organizer.description||"",
      website:organizer.website||"",brandPrimaryColor:organizer.brandPrimaryColor||"",brandSecondaryColor:organizer.brandSecondaryColor||"",
      discoverySources:organizer.onboardingProfile?.discoverySources||[],eventFrequency:organizer.onboardingProfile?.eventFrequency||"",
      typicalEventSize:organizer.onboardingProfile?.typicalEventSize||"",slug:organizer.slug||"",
      publicEmail:organizer.publicEmail||"",publicPhone:organizer.publicPhone||"",publicProfileEnabled:organizer.publicProfileEnabled||false}));
  },[organizer]);

  useEffect(() => { if (onboarding?.completed) navigate(resolveHomeRoute(user?.roles),{replace:true}); },[onboarding?.completed,navigate,user?.roles]);
  useEffect(() => { const n=Number(params.get("step")); if(Number.isInteger(n)&&n>=0&&n<STEPS.length)setStep(n); },[params]);

  if (isLoading || !organizer) return <LoadingState label="Preparing your organizer setup..." />;
  if (isError || !onboarding) return <ErrorState description="We couldn't load your organizer setup." onRetry={() => refetch()} />;

  const serverStep = onboarding.steps.find(s => s.key===STEPS[step][0]);
  const requiredSteps = onboarding.steps.filter(s => s.required);
  const requiredComplete = requiredSteps.filter(s => s.completed).length;
  const progress = Math.round(((step+1)/STEPS.length)*100);
  const pageUrl = form.slug ? window.location.origin + "/organizers/" + form.slug : "";
  const setStep = (n:number) => { const safe=Math.max(0,Math.min(3,n)); setStepState(safe); };
  const [setStepState] = [setStep]; // keeps navigation logic below explicit
  const go = (n:number) => { const safe=Math.max(0,Math.min(3,n)); setStepState(safe); setParams({step:String(safe)}); setErrors({}); window.scrollTo({top:0,behavior:"smooth"}); };

  const validate = () => {
    const e:Record<string,string>={};
    if(step===0){if(form.name.trim().length<2)e.name="Enter your organization name";if(!form.businessType)e.businessType="Select your business type";if(!form.country)e.country="Select your country";if(form.address.trim().length<5)e.address="Enter your full business address";if(form.city.trim().length<2)e.city="Enter a valid city";if(form.state.trim().length<2)e.state="Enter a valid state / province";}
    if(step===1&&!form.description.trim())e.description="Add a short organization description";
    if(step===3&&form.slug.trim().length<3)e.slug="Choose a page URL with at least 3 characters";
    setErrors(e); return Object.keys(e).length===0;
  };

  const save = () => {
    if(!validate())return;
    updateProfile.mutate({
      name:form.name.trim(),businessType:form.businessType,country:form.country,address:form.address.trim(),city:form.city.trim(),state:form.state.trim(),
      ...(step>=1?{description:form.description.trim(),website:form.website.trim(),brandPrimaryColor:form.brandPrimaryColor||undefined,brandSecondaryColor:form.brandSecondaryColor||undefined}:{}),
      ...(step===2?{discoverySources:form.discoverySources,eventFrequency:form.eventFrequency||null,typicalEventSize:form.typicalEventSize||null,insightsSkipped:false}:{}),
      ...(step===3?{slug:form.slug.trim().toLowerCase(),publicEmail:form.publicEmail.trim(),publicPhone:form.publicPhone.trim(),publicProfileEnabled:form.publicProfileEnabled}:{}),
    },{
      onSuccess:()=>{toast.success(step===3?"Organizer page saved":"Step saved");if(step<3)go(step+1);else void refetch();},
      onError:e=>toast.error(e instanceof Error?e.message:"Failed to save your setup"),
    });
  };
  const skipInsights = () => updateProfile.mutate({insightsSkipped:true},{
    onSuccess:()=>{toast.success("You can add these details later");go(3);},
    onError:e=>toast.error(e instanceof Error?e.message:"Failed to skip this step"),
  });
  const toggleSource = (v:string) => setForm(f=>({...f,discoverySources:f.discoverySources.includes(v)?f.discoverySources.filter(x=>x!==v):[...f.discoverySources,v]}));

  return <div className="min-h-screen bg-background"><main className="mx-auto min-h-screen max-w-7xl px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
    <div className="mb-5 flex items-center justify-between"><Link to="/" className="text-sm text-muted-foreground">ExhibitTix</Link><Button variant="ghost" size="sm" onClick={()=>refetch()} disabled={isFetching} className="gap-2"><RefreshCw className="h-4 w-4"/>Refresh</Button></div>
    <Card className="min-h-[calc(100vh-7rem)] overflow-hidden border-0 shadow-sm lg:grid lg:grid-cols-[44%_56%]">
      <aside className="relative hidden overflow-hidden bg-muted lg:block"><img src="/onboarding/organizer-onboarding.svg" alt="ExhibitTix organizer setup" className="absolute inset-0 h-full w-full object-cover"/><div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"/><div className="absolute bottom-0 p-8 text-white xl:p-10"><p className="text-sm text-white/80">ExhibitTix organizer setup</p><h1 className="mt-2 max-w-lg text-3xl font-semibold">Build your organizer presence before your first event.</h1><p className="mt-3 max-w-lg text-sm text-white/80">Set up your organization, brand, and organizer page first. Event creation comes after onboarding.</p></div></aside>
      <section className="flex min-w-0 flex-col bg-card">
        <div className="border-b px-5 py-5 sm:px-8 lg:px-10"><div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Step {step+1} of {STEPS.length}</p><h2 className="mt-1 text-xl font-semibold sm:text-2xl">{STEPS[step][1]}</h2></div><span className="text-sm text-muted-foreground">{progress}%</span></div><Progress value={progress}/><div className="mt-4 grid grid-cols-4 gap-2">{STEPS.map((s,i)=><button key={s[0]} type="button" onClick={()=>go(i)}><div className={i<=step?"h-1 rounded-full bg-primary":"h-1 rounded-full bg-muted"}/><p className={i===step?"mt-2 hidden text-xs font-medium sm:block":"mt-2 hidden text-xs text-muted-foreground sm:block"}>{i+1}. {s[2]}</p></button>)}</div></div>
        <div className="flex-1 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
          <p className="mb-7 text-sm text-muted-foreground">{step===0?"Start with the information your organizer account needs.":step===1?"Make your organization recognizable and ready to present professionally.":step===2?"Help ExhibitTix understand how you organize events.":"Create the public identity visitors will see when they discover your organization."}</p>

          {step===0 && <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2"><Label>Organization name *</Label><Input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>{errors.name&&<p className="text-xs text-destructive">{errors.name}</p>}</div>
            <div className="space-y-2"><Label>Business type *</Label><Select value={form.businessType||undefined} onValueChange={v=>setForm({...form,businessType:v})}><SelectTrigger><SelectValue placeholder="Select business type"/></SelectTrigger><SelectContent>{BUSINESS_TYPES.map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>{errors.businessType&&<p className="text-xs text-destructive">{errors.businessType}</p>}</div>
            <div className="space-y-2"><Label>Country *</Label><Select value={form.country||undefined} onValueChange={v=>setForm({...form,country:v,state:""})}><SelectTrigger><SelectValue placeholder="Select country"/></SelectTrigger><SelectContent className="max-h-80">{COUNTRIES.map(v=><SelectItem key={v.code} value={v.name}>{v.name}</SelectItem>)}</SelectContent></Select>{errors.country&&<p className="text-xs text-destructive">{errors.country}</p>}</div>
            <div className="space-y-2 sm:col-span-2"><Label>Business address *</Label><Input value={form.address} maxLength={300} onChange={e=>setForm({...form,address:e.target.value})} placeholder="Street, area, city and postal code"/>{errors.address&&<p className="text-xs text-destructive">{errors.address}</p>}</div>
            <div className="space-y-2"><Label>City *</Label><Input value={form.city} onChange={e=>setForm({...form,city:e.target.value})} placeholder="Ahmedabad"/>{errors.city&&<p className="text-xs text-destructive">{errors.city}</p>}</div>
            <div className="space-y-2"><Label>State / Province *</Label>{form.country==="India"?<Select value={form.state||undefined} onValueChange={v=>setForm({...form,state:v})}><SelectTrigger><SelectValue placeholder="Select state / UT"/></SelectTrigger><SelectContent className="max-h-80">{INDIA_STATES_AND_UTS.map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>:<Input value={form.state} onChange={e=>setForm({...form,state:e.target.value})} placeholder="State / province / region"/>}{errors.state&&<p className="text-xs text-destructive">{errors.state}</p>}</div>
          </div>}

          {step===1 && <div className="space-y-6">
            <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label>About your organization *</Label><Textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} rows={5} maxLength={2000} placeholder="Tell visitors what your organization does and what kind of events you host."/>{errors.description&&<p className="text-xs text-destructive">{errors.description}</p>}</div><div className="space-y-2 sm:col-span-2"><Label>Website</Label><Input type="url" value={form.website} onChange={e=>setForm({...form,website:e.target.value})} placeholder="https://example.com"/></div></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border p-4"><div className="flex items-center gap-3"><ImageIcon className="h-5 w-5 text-primary"/><div><p className="text-sm font-medium">Organization logo</p><p className="text-xs text-muted-foreground">Square logo for your brand.</p></div></div><div className="mt-4 flex items-center gap-3">{organizer.logoUrl?<img src={organizer.logoUrl} alt={organizer.name+" logo"} className="h-14 w-14 rounded-lg border object-cover"/>:<div className="flex h-14 w-14 items-center justify-center rounded-lg bg-muted"><Building2 className="h-5 w-5 text-muted-foreground"/></div>}<label className="cursor-pointer"><input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e=>{const file=e.target.files?.[0];if(file)uploadLogo.mutate(file,{onSuccess:()=>toast.success("Logo uploaded"),onError:err=>toast.error(err instanceof Error?err.message:"Upload failed")})}}/><Button type="button" variant="outline" size="sm" asChild><span className="gap-2"><Upload className="h-4 w-4"/>{uploadLogo.isPending?"Uploading...":"Upload"}</span></Button></label></div></div>
              <div className="rounded-xl border p-4"><div className="flex items-center gap-3"><ImageIcon className="h-5 w-5 text-primary"/><div><p className="text-sm font-medium">Cover image</p><p className="text-xs text-muted-foreground">Wide visual for your organizer page.</p></div></div><div className="mt-4 flex items-center gap-3">{organizer.coverImageUrl?<img src={organizer.coverImageUrl} alt={organizer.name+" cover"} className="h-14 w-24 rounded-lg border object-cover"/>:<div className="flex h-14 w-24 items-center justify-center rounded-lg bg-muted"><ImageIcon className="h-5 w-5 text-muted-foreground"/></div>}<label className="cursor-pointer"><input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e=>{const file=e.target.files?.[0];if(file)uploadCover.mutate(file,{onSuccess:()=>toast.success("Cover uploaded"),onError:err=>toast.error(err instanceof Error?err.message:"Upload failed")})}}/><Button type="button" variant="outline" size="sm" asChild><span className="gap-2"><Upload className="h-4 w-4"/>{uploadCover.isPending?"Uploading...":"Upload"}</span></Button></label></div></div>
            </div>
            <div className="rounded-xl border p-4"><div className="mb-4 flex items-center gap-3"><Sparkles className="h-5 w-5 text-primary"/><div><p className="text-sm font-medium">Brand colors</p><p className="text-xs text-muted-foreground">Optional — refine them later.</p></div></div><div className="grid gap-4 sm:grid-cols-2"><Input type="color" value={form.brandPrimaryColor||"#2563eb"} onChange={e=>setForm({...form,brandPrimaryColor:e.target.value})} className="h-10 w-14 p-1"/><Input type="color" value={form.brandSecondaryColor||"#0f172a"} onChange={e=>setForm({...form,brandSecondaryColor:e.target.value})} className="h-10 w-14 p-1"/></div></div>
          </div>}

          {step===2 && <div className="space-y-7">
            <div><Label>How did you discover ExhibitTix?</Label><p className="mt-1 text-xs text-muted-foreground">Select all that apply.</p><div className="mt-3 flex flex-wrap gap-2">{SOURCES.map(([v,l])=><button key={v} type="button" onClick={()=>toggleSource(v)} className={pill(form.discoverySources.includes(v))}>{l}</button>)}</div></div>
            <div><Label>How many events do you host in a year normally?</Label><div className="mt-3 flex flex-wrap gap-2">{FREQUENCIES.map(([v,l])=><button key={v} type="button" onClick={()=>setForm({...form,eventFrequency:v})} className={pill(form.eventFrequency===v)}>{l}</button>)}</div></div>
            <div><Label>On average, how large are your events?</Label><div className="mt-3 flex flex-wrap gap-2">{SIZES.map(([v,l])=><button key={v} type="button" onClick={()=>setForm({...form,typicalEventSize:v})} className={pill(form.typicalEventSize===v)}>{l}</button>)}</div></div>
            <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">This information is private to ExhibitTix and helps improve recommendations and support. You can skip it and add it later.</div>
          </div>}

          {step===3 && <div className="space-y-6">
            <div className="rounded-xl border bg-muted/20 p-4"><div className="flex items-start gap-3"><Globe2 className="mt-0.5 h-5 w-5 text-primary"/><div><p className="font-medium">Your organizer page</p><p className="mt-1 text-sm text-muted-foreground">A home for your organization, contact details, and future events.</p></div></div></div>
            <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label>Organizer page URL *</Label><div className="flex items-center gap-2"><span className="hidden text-sm text-muted-foreground sm:inline">/organizers/</span><Input value={form.slug} onChange={e=>setForm({...form,slug:slugify(e.target.value)})} onBlur={()=>!form.slug&&setForm({...form,slug:slugify(form.name)})} placeholder={slugify(form.name)||"your-organization"}/></div>{pageUrl&&<p className="text-xs text-muted-foreground">Your page: {pageUrl}</p>}{errors.slug&&<p className="text-xs text-destructive">{errors.slug}</p>}</div><div className="space-y-2"><Label>Public email</Label><Input type="email" value={form.publicEmail} onChange={e=>setForm({...form,publicEmail:e.target.value})} placeholder="hello@example.com"/></div><div className="space-y-2"><Label>Public phone</Label><Input value={form.publicPhone} onChange={e=>setForm({...form,publicPhone:e.target.value})} placeholder="+91 ..."/></div></div>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4"><input type="checkbox" checked={form.publicProfileEnabled} onChange={e=>setForm({...form,publicProfileEnabled:e.target.checked})} className="mt-1 h-4 w-4"/><span><span className="block text-sm font-medium">Make my organizer page public now</span><span className="mt-1 block text-xs text-muted-foreground">Optional. You can publish it later.</span></span></label>
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm"><p className="font-medium">After this step</p><p className="mt-1 text-muted-foreground">You enter the organizer dashboard. Creating an event becomes your next action there — it is not required to finish onboarding.</p></div>
          </div>}
        </div>

        <div className="border-t px-5 py-5 sm:px-8 lg:px-10"><div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between"><Button variant="ghost" onClick={()=>go(step-1)} disabled={step===0} className="gap-2"><ArrowLeft className="h-4 w-4"/>Back</Button><div className="flex gap-2">{step===2&&<Button variant="outline" onClick={skipInsights} disabled={updateProfile.isPending}>Skip this step</Button>}{serverStep?.completed&&step<3&&<Button variant="outline" onClick={()=>go(step+1)}>Continue <ArrowRight className="ml-1 h-4 w-4"/></Button>}{step<4&&!serverStep?.completed&&<Button onClick={save} disabled={updateProfile.isPending||uploadLogo.isPending||uploadCover.isPending}>{updateProfile.isPending?"Saving...":step===3?"Save organizer page":"Save and continue"}<ArrowRight className="ml-1 h-4 w-4"/></Button>}{step===3&&serverStep?.completed&&<Button asChild><Link to={resolveHomeRoute(user?.roles)}>Go to dashboard</Link></Button>}</div></div><div className="mt-4 flex justify-between text-xs text-muted-foreground"><span>{requiredComplete} of {requiredSteps.length} required steps complete</span><span>Saved to your account</span></div></div>
      </section>
    </Card>
  </main></div>;
}
