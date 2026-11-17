import { EPIC_API, parseEpic } from "./epic";
import { parseXray, XRAY_URL } from "./xray";
import { useQuery } from "@tanstack/react-query";
import { parseHp30, parseKp, parseMag, parseOvation, parseWind } from "./model";

const SWPC = "https://services.swpc.noaa.gov";
export const URLS = {
  mag: `${SWPC}/json/rtsw/rtsw_mag_1m.json`,
  wind: `${SWPC}/json/rtsw/rtsw_wind_1m.json`,
  kp: `${SWPC}/products/noaa-planetary-k-index.json`,
  ovation: `${SWPC}/json/ovation_aurora_latest.json`,
  hp30: "https://kp.gfz.de/app/json/",
};

async function getJson(url: string): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20_000);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

const opts = { refetchInterval: 60_000, refetchOnWindowFocus: false, retry: 1, staleTime: 30_000 } as const;

export const useMag = () => useQuery({ queryKey: ["mag"], queryFn: async () => parseMag(await getJson(URLS.mag)), ...opts });
export const useWind = () => useQuery({ queryKey: ["wind"], queryFn: async () => parseWind(await getJson(URLS.wind)), ...opts });
export const useKp = () => useQuery({ queryKey: ["kp"], queryFn: async () => parseKp(await getJson(URLS.kp)), ...opts });
export const useOvation = () =>
  useQuery({ queryKey: ["ovation"], queryFn: async () => parseOvation(await getJson(URLS.ovation)), ...opts });
export const useHp30 = () =>
  useQuery({
    queryKey: ["hp30"],
    queryFn: async () => {
      const end = new Date();
      const start = new Date(end.getTime() - 24 * 3600_000);
      const f = (d: Date) => d.toISOString().slice(0, 19) + "Z";
      return parseHp30(await getJson(`${URLS.hp30}?start=${f(start)}&end=${f(end)}&index=Hp30`));
    },
    ...opts,
    retry: 0,
    refetchInterval: 300_000,
  });


export const useXray = () =>
  useQuery({ queryKey: ["xray"], queryFn: async () => parseXray(await getJson(XRAY_URL)), ...opts });

/** Deferred: only fetched when the gallery is opened. */
export const useEpic = (enabled: boolean) =>
  useQuery({ queryKey: ["epic"], queryFn: async () => parseEpic(await getJson(EPIC_API)), enabled, retry: 1, refetchInterval: enabled ? 15 * 60_000 : false, refetchOnWindowFocus: false, staleTime: 10 * 60_000 });

export const GOES = {
  east: { sat: "GOES-19", code: "G19", label: "GOES-East", lon: "75.2°W", dir: "GOES19" },
  west: { sat: "GOES-18", code: "G18", label: "GOES-West", lon: "137.0°W", dir: "GOES18" },
} as const;
export type GoesKey = keyof typeof GOES;
export const goesImageUrl = (k: GoesKey, size = 1808) => `https://cdn.star.nesdis.noaa.gov/${GOES[k].dir}/ABI/FD/GEOCOLOR/${size}x${size}.jpg`;
export const goesPageUrl = (k: GoesKey) => `https://www.star.nesdis.noaa.gov/GOES/fulldisk.php?sat=${GOES[k].code}`;

/** Server Last-Modified of the "latest" GeoColor file (file update time; the scan time is burned into the image). */
export const useGoesMeta = (k: GoesKey, enabled: boolean) =>
  useQuery({
    queryKey: ["goes", k], enabled, retry: 1, refetchInterval: enabled ? 5 * 60_000 : false, refetchOnWindowFocus: false,
    queryFn: async () => {
      const r = await fetch(goesImageUrl(k, 678), { method: "HEAD", cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const lm = r.headers.get("last-modified");
      const t = lm ? Date.parse(lm) : NaN;
      return { lastModified: Number.isFinite(t) ? t : null };
    },
  });