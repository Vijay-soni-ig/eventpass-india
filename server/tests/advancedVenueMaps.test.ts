// AVM-11 interactive venue map regression tests
import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { startTestServer } from "./helpers/testServer";

let baseUrl:string; let stop:()=>Promise<void>; const ts=Date.now();
before(async()=>{({baseUrl,stop}=await startTestServer());});
after(async()=>{await stop();});

async function bootstrap(label:string){
  const r=await fetch(`${baseUrl}/api/auth/signup`,{method:"POST",headers:{"Content-Type":"application/json","X-Test-Rate-Limit-Key":`avm11-${label}`},body:JSON.stringify({email:`avm11-${label}-${ts}@example.com`,password:"TestPassword123!",fullName:`AVM11 ${label}`,userType:"exhibitor"})});
  const b=await r.json(); assert.equal(r.status,201); return b.token as string;
}
async function venue(t:string,l:string){
  const r=await fetch(`${baseUrl}/api/venues`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${t}`},body:JSON.stringify({name:`AVM11 Venue ${l} ${ts}`})});
  assert.equal(r.status,201); return (await r.json()).venue.id as string;
}

test("AVM-11 map CRUD, object validation and publish lifecycle",async()=>{
  const t=await bootstrap("crud"),v=await venue(t,"crud");
  const bad=await fetch(`${baseUrl}/api/venue-maps/venues/${v}/maps`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${t}`},body:JSON.stringify({name:"Bad",canvasWidth:0,canvasHeight:100})});
  assert.equal(bad.status,400);
  const r=await fetch(`${baseUrl}/api/venue-maps/venues/${v}/maps`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${t}`},body:JSON.stringify({name:"Main Map",canvasWidth:1200,canvasHeight:800})});
  assert.equal(r.status,201); const map=(await r.json()).map;
  const obj=await fetch(`${baseUrl}/api/venue-maps/maps/${map.id}/objects`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${t}`},body:JSON.stringify({type:"custom",label:"Registration",x:10,y:20,width:120,height:60})});
  assert.equal(obj.status,201);
  const pub=await fetch(`${baseUrl}/api/venue-maps/maps/${map.id}/publish`,{method:"POST",headers:{Authorization:`Bearer ${t}`}});
  assert.equal(pub.status,200); assert.equal((await pub.json()).map.status,"published");
  const blocked=await fetch(`${baseUrl}/api/venue-maps/maps/${map.id}/objects`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${t}`},body:JSON.stringify({type:"custom",x:1,y:1,width:10,height:10})});
  assert.equal(blocked.status,400);
});

test("AVM-11 tenant isolation",async()=>{
  const owner=await bootstrap("owner"),other=await bootstrap("other"),v=await venue(owner,"owner");
  const r=await fetch(`${baseUrl}/api/venue-maps/venues/${v}/maps`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${owner}`},body:JSON.stringify({name:"Private Map",canvasWidth:100,canvasHeight:100})});
  assert.equal(r.status,201); const id=(await r.json()).map.id;
  const read=await fetch(`${baseUrl}/api/venue-maps/venues/${v}/maps`,{headers:{Authorization:`Bearer ${other}`}});
  assert.equal(read.status,404);
  const patch=await fetch(`${baseUrl}/api/venue-maps/maps/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json",Authorization:`Bearer ${other}`},body:JSON.stringify({name:"Hacked"})});
  assert.equal(patch.status,404);
});
