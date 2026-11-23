import {describe,expect,it} from "vitest";
import {broadcastSourceState,broadcastStory,canShowMeasurement,observationAge} from "./broadcast";
describe("livestream / 24-7 source integrity",()=>{
 it("never promotes a partial or old upstream feed into current measurements",()=>{
  expect(broadcastSourceState("live","live")).toBe("current");
  expect(broadcastSourceState("live","stale")).toBe("partial");
  expect(broadcastSourceState("loading","live")).toBe("partial");
  expect(broadcastSourceState("stale","disconnected")).toBe("offline");
  expect(canShowMeasurement("live",0)).toBe(true);
  expect(canShowMeasurement("live",-15.2)).toBe(true);
  expect(canShowMeasurement("live",Number.NaN)).toBe(false);
  expect(canShowMeasurement("stale",580)).toBe(false);
  expect(canShowMeasurement("disconnected",580)).toBe(false);
  expect(canShowMeasurement("live",null)).toBe(false);
 });
 it("uses an educational default instead of invented alerts",()=>{
  const story=broadcastStory(3,null,null);
  expect(story.eyebrow).toContain("PLANETARY INDEX");
  expect(story.body).not.toContain("latest NOAA planetary Kp is");
  expect(story.body).toContain("three-hour");
  expect(broadcastStory(4,null,null).body).toContain("model");
 });
 it("a genuinely supplied southward Bz can change the story without promising aurora",()=>{
  const story=broadcastStory(2,-10.5,null);
  expect(story.title).toContain("pointing south");
  expect(story.body).toContain("-10.5 nT");
  expect(story.body).toContain("not an aurora forecast");
  expect(broadcastStory(2,3,null).eyebrow).toContain("MAGNETIC ORIENTATION");
 });
 it("only a supplied storm-level Kp changes the three-hour story",()=>{
  expect(broadcastStory(3,null,5.4).title).toContain("Storm-level");
  expect(broadcastStory(3,null,4.9).title).not.toContain("Storm-level");
  expect(broadcastStory(3,null,5.4).body).toContain("or a formal NOAA warning");
 });
 it("renders elapsed time honestly and handles clock skew",()=>{
  const now=Date.parse("2026-11-23T12:00:00Z");
  expect(observationAge(now,now-11*60000)).toBe("11 min old");
  expect(observationAge(now,now-60*60000)).toBe("1h 0m old");
  expect(observationAge(now,now+10*60000)).toBe("clock mismatch");
  expect(observationAge(now,null)).toBe("timestamp unavailable");
 });
});
