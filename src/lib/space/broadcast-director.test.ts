import {describe,expect,it} from "vitest";
import {DIRECTOR_INTERVAL_MS,DIRECTOR_SHOTS,isDirectorShot,nextDirectorShot,useAutoDirector} from "./broadcast-director";
const p=(query:string)=>new URLSearchParams(query);
describe("unattended broadcast camera director",()=>{
 it("cycles through only known, scientifically labeled viewpoints",()=>{
  expect(DIRECTOR_SHOTS).toEqual(["earth","global","tail","arctic"]);
  expect(DIRECTOR_INTERVAL_MS).toBe(6*60_000);
  expect(DIRECTOR_SHOTS.map(s=>nextDirectorShot(s))).toEqual(["global","tail","arctic","earth"]);
  expect(isDirectorShot("earth")).toBe(true);
  expect(isDirectorShot("nonsense")).toBe(false);
  expect(isDirectorShot(null)).toBe(false);
 });
 it("defaults to an autonomous tour while respecting operator fixed camera requests",()=>{
  expect(useAutoDirector(p("broadcast=1"),false)).toBe(true);
  expect(useAutoDirector(p("broadcast=1&shot=global"),false)).toBe(false);
  expect(useAutoDirector(p("broadcast=1&shot=tail&director=1"),false)).toBe(true);
  expect(useAutoDirector(p("broadcast=1&director=0"),false)).toBe(false);
  expect(useAutoDirector(p("broadcast=1&director=off"),false)).toBe(false);
  expect(useAutoDirector(p("broadcast=1&director=1&motion=off"),false)).toBe(false);
  expect(useAutoDirector(p("broadcast=1&director=1"),true)).toBe(false);
 });
});
