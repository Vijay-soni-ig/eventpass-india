import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl:string; let stop:()=>Promise<void>; const ts=Date.now();
before(async()=>{({baseUrl,stop}=await startTestServer());}); after(async()=>{await stop();});
async function signup(label:string){const r=await fetch(baseUrl+"/api/auth/signup",{method:"POST",headers:{"Content-Type":"application/json","X-Test-Rate-Limit-Key":"vendor-spec-"+label},body:JSON.stringify({email:"vendor-spec-"+label+"-"+ts+"@example.com",password:"TestPassword123!",fullName:"Vendor "+label,userType:"exhibitor"})});return {token:(await r.json()).token as string};}
async function bootstrap(label:string){const {token}=await signup(label);const r=await fetch(baseUrl+"/api/exhibitions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({name:"Vendor event "+label+" "+ts,status:"draft",visibility:"public",ticketTypes:[],stalls:[]})});return {token,eventId:(await r.json()).exhibition.eventId as string};}
async function enable(token:string,eventId:string){const r=await fetch(baseUrl+"/api/events/"+eventId+"/modules/VENDORS",{method:"PUT",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({enabled:true})});assert.equal(r.status,200);}
async function createVendor(token:string,eventId:string,name:string){const r=await fetch(baseUrl+"/api/events/"+eventId+"/vendors",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({name,isPublic:true})});assert.equal(r.status,201);return (await r.json()).vendor.id as string;}

test("vendor services and profile specialization",async()=>{
 const {token,eventId}=await bootstrap("crud"); await enable(token,eventId);
 const service=await fetch(baseUrl+"/api/events/"+eventId+"/vendor-services",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({name:"Catering",category:"Food",description:"Event catering"})});assert.equal(service.status,201);const serviceId=(await service.json()).service.id;
 const vendorId=await createVendor(token,eventId,"Acme Catering");
 const profile=await fetch(baseUrl+"/api/events/"+eventId+"/vendors/"+vendorId+"/profile",{method:"PUT",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({contactName:"Asha",contactEmail:"asha@example.com",serviceArea:"Ahmedabad",serviceIds:[serviceId]})});assert.equal(profile.status,200);
 const body=await profile.json();assert.equal(body.profile.services.length,1);assert.equal(body.profile.services[0].service.name,"Catering");
 const list=await fetch(baseUrl+"/api/events/"+eventId+"/vendor-services",{headers:{Authorization:"Bearer "+token}});assert.equal((await list.json()).services.length,1);
});
test("vendor specialization validates same-event active services",async()=>{
 const a=await bootstrap("a");const b=await bootstrap("b");await enable(a.token,a.eventId);await enable(b.token,b.eventId);
 const vendor=await createVendor(a.token,a.eventId,"Vendor A");
 const foreign=await fetch(baseUrl+"/api/events/"+b.eventId+"/vendor-services",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+b.token},body:JSON.stringify({name:"Cleaning"})});assert.equal(foreign.status,201);const foreignId=(await foreign.json()).service.id;
 const bad=await fetch(baseUrl+"/api/events/"+a.eventId+"/vendors/"+vendor+"/profile",{method:"PUT",headers:{"Content-Type":"application/json",Authorization:"Bearer "+a.token},body:JSON.stringify({serviceIds:[foreignId]})});assert.equal(bad.status,400);
 const cross=await fetch(baseUrl+"/api/events/"+a.eventId+"/vendor-services",{headers:{Authorization:"Bearer "+b.token}});assert.equal(cross.status,404);
});
test("public specialized vendor directory exposes only safe active data",async()=>{
 const {token,eventId}=await bootstrap("public");await enable(token,eventId);const service=await fetch(baseUrl+"/api/events/"+eventId+"/vendor-services",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({name:"AV Rental"})});const sid=(await service.json()).service.id;const vendor=await createVendor(token,eventId,"Public Vendor");
 await fetch(baseUrl+"/api/events/"+eventId+"/vendors/"+vendor+"/profile",{method:"PUT",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({contactName:"Private Contact",contactEmail:"private@example.com",contactPhone:"9999999999",serviceIds:[sid]})});
 await prisma.event.update({where:{id:eventId},data:{status:"PUBLISHED",visibility:"public"}});
 const r=await fetch(baseUrl+"/api/public/events/"+eventId+"/vendors/specialized");assert.equal(r.status,200);const body=await r.json();assert.equal(body.vendors.length,1);assert.equal(body.vendors[0].name,"Public Vendor");assert.equal(body.vendors[0].vendorProfile.contactEmail,undefined);assert.equal(body.vendors[0].vendorProfile.services[0].service.name,"AV Rental");
});
