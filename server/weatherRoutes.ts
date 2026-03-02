import { type Express, type Request, type Response } from 'express';
import { requireAdmin } from './adminRoutes';

// ── Types ──

interface WeatherDay {
  date: string;
  tempHigh: number;
  tempLow: number;
  conditionMain: string;
  conditionDesc: string;
  precipChance: number;
  icon: string;
}

interface WeatherForecast {
  days: WeatherDay[];
  location: string;
  source: 'owm';
}

interface WeatherCache {
  data: WeatherForecast;
  fetchedAt: number;
  cacheKey: string;
}

// ── Cache ──

const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
let cache: WeatherCache | null = null;

export function resetWeatherCache() {
  cache = null;
}

// ── Helpers ──

/** Convert a unix timestamp to a local-date string using the OWM timezone offset */
function toLocalDateStr(unixSeconds: number, tzOffsetSeconds: number): string {
  const localMs = (unixSeconds + tzOffsetSeconds) * 1000;
  return new Date(localMs).toISOString().split('T')[0];
}

// ── OWM data transformation ──

function transformOWMForecast(owmData: any, currentWeather: any | null, lat: string, lon: string): WeatherForecast {
  const tzOffset: number = owmData.city?.timezone ?? 0;
  const todayStr = toLocalDateStr(Math.floor(Date.now() / 1000), tzOffset);

  const dayMap = new Map<string, { temps: number[]; conditions: string[]; descs: string[]; pops: number[]; icons: string[] }>();

  for (const slot of owmData.list || []) {
    if (!slot.dt) continue;
    const date = toLocalDateStr(slot.dt, tzOffset);

    let entry = dayMap.get(date);
    if (!entry) {
      entry = { temps: [], conditions: [], descs: [], pops: [], icons: [] };
      dayMap.set(date, entry);
    }

    entry.temps.push(slot.main?.temp ?? 0);
    if (slot.weather?.[0]) {
      entry.conditions.push(slot.weather[0].main || 'Clear');
      entry.descs.push(slot.weather[0].description || '');
      entry.icons.push(slot.weather[0].icon || '01d');
    }
    entry.pops.push((slot.pop ?? 0) * 100);
  }

  const days: WeatherDay[] = [];
  for (const [date, entry] of dayMap) {
    // Dominant condition: most frequent conditionMain
    const condFreq = new Map<string, number>();
    for (const c of entry.conditions) {
      condFreq.set(c, (condFreq.get(c) || 0) + 1);
    }
    let dominantCond = 'Clear';
    let maxFreq = 0;
    for (const [cond, freq] of condFreq) {
      if (freq > maxFreq) { dominantCond = cond; maxFreq = freq; }
    }

    // Find description and icon matching the dominant condition
    const condIdx = entry.conditions.indexOf(dominantCond);
    const desc = condIdx >= 0 ? entry.descs[condIdx] : '';
    const icon = condIdx >= 0 ? entry.icons[condIdx] : '01d';

    days.push({
      date,
      tempHigh: Math.round(Math.max(...entry.temps)),
      tempLow: Math.round(Math.min(...entry.temps)),
      conditionMain: dominantCond,
      conditionDesc: desc,
      precipChance: Math.round(entry.pops.reduce((a, b) => a + b, 0) / entry.pops.length),
      icon,
    });
  }

  // Ensure today is always present using current weather data
  if (currentWeather?.main) {
    const existing = days.find(d => d.date === todayStr);
    if (!existing) {
      days.push({
        date: todayStr,
        tempHigh: Math.round(currentWeather.main.temp_max ?? currentWeather.main.temp ?? 0),
        tempLow: Math.round(currentWeather.main.temp_min ?? currentWeather.main.temp ?? 0),
        conditionMain: currentWeather.weather?.[0]?.main || 'Clear',
        conditionDesc: currentWeather.weather?.[0]?.description || '',
        precipChance: 0,
        icon: currentWeather.weather?.[0]?.icon || '01d',
      });
    } else {
      // Update today's conditions from current weather (more accurate than forecast)
      existing.conditionMain = currentWeather.weather?.[0]?.main || existing.conditionMain;
      existing.conditionDesc = currentWeather.weather?.[0]?.description || existing.conditionDesc;
      existing.icon = currentWeather.weather?.[0]?.icon || existing.icon;
    }
  }

  // Sort by date
  days.sort((a, b) => a.date.localeCompare(b.date));

  return {
    days,
    location: owmData.city?.name || currentWeather?.name || `${lat},${lon}`,
    source: 'owm',
  };
}

// ── Shared fetch logic ──

async function getWeatherData(): Promise<{ error?: string; data?: WeatherForecast }> {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY;
  if (!apiKey) return { error: 'not_configured' };

  const location = process.env.WEATHER_LOCATION;
  if (!location) return { error: 'no_location' };

  const [lat, lon] = location.split(',').map(s => s.trim());
  if (!lat || !lon) return { error: 'no_location' };

  const cacheKey = `${lat},${lon}`;

  // Check cache
  if (cache && cache.cacheKey === cacheKey && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return { data: cache.data };
  }

  // Fetch current weather + forecast in parallel
  try {
    const baseParams = `lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&appid=${encodeURIComponent(apiKey)}&units=imperial`;
    const [currentRes, forecastRes] = await Promise.all([
      fetch(`https://api.openweathermap.org/data/2.5/weather?${baseParams}`),
      fetch(`https://api.openweathermap.org/data/2.5/forecast?${baseParams}&cnt=40`),
    ]);

    if (!forecastRes.ok) {
      const text = await forecastRes.text().catch(() => forecastRes.status.toString());
      console.error(`[Weather] OWM API returned ${forecastRes.status}: ${text.slice(0, 200)}`);
      return { error: 'api_error' };
    }

    const [currentWeather, owmData] = await Promise.all([
      currentRes.ok ? currentRes.json() : null,
      forecastRes.json(),
    ]);
    const forecast = transformOWMForecast(owmData, currentWeather, lat, lon);

    // Update cache
    cache = { data: forecast, fetchedAt: Date.now(), cacheKey };

    return { data: forecast };
  } catch (err: any) {
    console.error('[Weather] Fetch error:', err.message);
    return { error: 'fetch_error' };
  }
}

// ── Route handler ──

function handleWeatherRequest(_req: Request, res: Response) {
  getWeatherData().then(result => {
    if (result.error) {
      return res.json({ error: result.error, days: [] });
    }
    res.json(result.data);
  }).catch(err => {
    console.error('[Weather] Unexpected error:', err);
    res.json({ error: 'fetch_error', days: [] });
  });
}

// ── Registration ──

export function registerWeatherRoutes(app: Express) {
  // Admin weather endpoint
  app.get('/api/admin/weather', requireAdmin, (req, res) => handleWeatherRequest(req, res));

  // Team weather endpoint (requires driver auth via session)
  app.get('/api/team/weather', (req: Request, res: Response) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    handleWeatherRequest(req, res);
  });
}
