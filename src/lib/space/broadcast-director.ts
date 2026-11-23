/** Broadcast-only viewpoint director: editorial camera selection, not data synthesis.
 * URL options are explicit; a fixed shot wins unless director=1 is requested.
 */
export const DIRECTOR_SHOTS=["earth","global","tail","arctic"] as const;
export type DirectorShot=typeof DIRECTOR_SHOTS[number];
export const DIRECTOR_INTERVAL_MS=6*60_000;
export function isDirectorShot(value:string|null):value is DirectorShot{
 return value!==null&&DIRECTOR_SHOTS.some(s=>s===value);
}
export function nextDirectorShot(shot:DirectorShot):DirectorShot{
 const index=DIRECTOR_SHOTS.indexOf(shot);
 return DIRECTOR_SHOTS[(index+1)%DIRECTOR_SHOTS.length]!;
}
/** Default capture is a tour; ?shot=X gives a fixed camera unless explicitly overridden. */
export function useAutoDirector(params:URLSearchParams,reducedMotion:boolean):boolean{
 if(reducedMotion||params.get("motion")==="off")return false;
 const forced=params.get("director");
 if(forced==="0"||forced==="off")return false;
 if(forced==="1")return true;
 return !isDirectorShot(params.get("shot"));
}
