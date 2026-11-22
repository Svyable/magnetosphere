import {describe,it,expect} from "vitest";
import {REPLAY_EVENTS,eventById,replayPosition} from "./replay";
import {archivesForEvent} from "./event-sources";
describe("curated historical event replay",()=>{
 it("contains sourced, ordered, UTC-date stages",()=>{
  expect(REPLAY_EVENTS.length).toBeGreaterThanOrEqual(6);
  for(const event of REPLAY_EVENTS){
   expect(event.stages.length).toBeGreaterThanOrEqual(3);
   expect(archivesForEvent(event.id).length).toBeGreaterThanOrEqual(3);
   expect(archivesForEvent(event.id).every(a=>a.url.startsWith("https://"))).toBe(true);
   const times=event.stages.map(s=>Date.parse(s.at+"T12:00:00Z"));
   expect(times.every(Number.isFinite)).toBe(true);
   expect(times).toEqual([...times].sort((a,b)=>a-b));
   for(const stage of event.stages){
    expect(stage.source).toMatch(/^https:\/\//);
    expect(stage.detail.length).toBeGreaterThan(30);
   }
   expect(replayPosition(event,0)).toBe(0);
   expect(replayPosition(event,event.stages.length-1)).toBe(1);
  }
 });
 it("does not invent a fallback event for unknown identifiers",()=>{
  expect(eventById("not-a-storm")).toBeNull();
 });
});
