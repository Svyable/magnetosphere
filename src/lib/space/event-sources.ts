/** Verified discovery endpoints, not downloaded/validated event-specific data. */
export type ArchiveSource={id:string;name:string;provider:string;url:string;coverage:string;resolution:string;kind:"solar"|"upstream"|"geomagnetic"|"ground";notes:string};
export const EVENT_ARCHIVES:ArchiveSource[]=[
 {id:"omni-hour",name:"OMNI hourly near-Earth solar wind",provider:"NASA SPDF",url:"https://omniweb.gsfc.nasa.gov/ow.html",coverage:"1963 onward",resolution:"Hourly",kind:"upstream",notes:"Merged, cross-normalized near-Earth measurements; some L1 observations are shifted to modeled Earth arrival time. Missing values and time-shift provenance require inspection."},
 {id:"omni-high",name:"OMNI high-resolution solar wind",provider:"NASA SPDF",url:"https://omniweb.gsfc.nasa.gov/ow_min.html",coverage:"1981 onward",resolution:"1 or 5 minutes",kind:"upstream",notes:"Availability varies by spacecraft and parameter; shifted to bow-shock nose, not an unprocessed L1 clock."},
 {id:"gfz-kp",name:"Planetary Kp and ap archive",provider:"GFZ Potsdam",url:"https://kp.gfz.de/en/data",coverage:"1932 onward",resolution:"3-hour Kp",kind:"geomagnetic",notes:"Distinguish definitive and nowcast data; Kp is planetary, not a station measurement."},
 {id:"usgs-ground",name:"USGS observatory magnetic-field data",provider:"USGS",url:"https://geomag.usgs.gov/ws/data/",coverage:"Station-dependent",resolution:"1 second, 1 minute or 1 hour",kind:"ground",notes:"Select station, interval, component, and variation/definitive processing. Historical coverage is station-dependent; H is not Kp."},
 {id:"ncei-flare",name:"Historical GOES X-ray flare reports",provider:"NOAA NCEI",url:"https://www.ncei.noaa.gov/products/space-weather/legacy-data/solar-flares-events",coverage:"1975–2017 for legacy GOES X-ray flare reports",resolution:"Event reports",kind:"solar",notes:"Legacy reports are not a continuous irradiance time series; later events require modern GOES archives."},
 {id:"ncei-swpc",name:"Historical NOAA SWPC products",provider:"NOAA NCEI",url:"https://www.spaceweather.gov/content/data-access",coverage:"Product-dependent",resolution:"Product-dependent",kind:"solar",notes:"Use issued-time products for historical forecasts; never substitute a present-day rolling forecast for the original."},
 {id:"isgi",name:"Dst and auroral electrojet indices",provider:"ISGI",url:"https://isgi.unistra.fr/data_download.php/indices_kp.php",coverage:"Dst since 1957; AE since 1957",resolution:"Index-dependent",kind:"geomagnetic",notes:"Download flow may request an email; AE coverage has known gaps including much of 1988–1989."}
];
export type ArchiveKey=typeof EVENT_ARCHIVES[number]["id"];
export const EVENT_DATASETS:Record<string,string[]>={
 "quebec-1989":["omni-hour","omni-high","gfz-kp","usgs-ground","isgi"],
 "halloween-2003":["omni-hour","omni-high","gfz-kp","usgs-ground","ncei-flare","isgi"],
 "may-2024":["omni-hour","omni-high","gfz-kp","usgs-ground","ncei-swpc","isgi"],
 "carrington-1859":["isgi"],
 "bastille-2000":["omni-hour","omni-high","gfz-kp","usgs-ground","ncei-flare","isgi"],
 "st-patricks-2015":["omni-hour","omni-high","gfz-kp","usgs-ground","ncei-flare","isgi"],
 "feb-2022":["omni-hour","omni-high","gfz-kp","usgs-ground","ncei-swpc","isgi"]
};
export function archivesForEvent(id:string){return (EVENT_DATASETS[id]??[]).map(key=>EVENT_ARCHIVES.find(s=>s.id===key)).filter((s):s is ArchiveSource=>!!s);}
