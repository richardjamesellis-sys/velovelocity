import { useEffect, useState, useMemo } from "react"
import { useTheme } from "next-themes"
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet"
import { AnimatePresence, MotionConfig, motion } from "motion/react"
import {
  Sun,
  Cloud,
  CloudRain,
  CloudLightning,
  CloudFog,
  CloudDrizzle,
  RotateCcw,
  FileUp,
  Navigation,
  TriangleAlert,
  Compass,
  Settings,
  CloudSnow,
  Wind
} from "lucide-react"
import L from "leaflet"

import { GlassDialog, SegmentedControl } from "@/components/ui/components"
import { Scrubber } from "@/components/ui/scrubber"

// Free Map Tile Providers (No API key required, no watermarks)
const MAP_TILES = {
  osm: {
    name: "Standard",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  },
  cyclosm: {
    name: "Cycling",
    url: "https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | <a href="https://www.cyclosm.org">CyclOSM</a>'
  }
}

// Route Point Interface
interface RoutePoint {
  lat: number;
  lon: number;
  ele: number;
  distanceKm?: number;
  distanceMi?: number;
}

interface WeatherData {
  windMph: number | string;
  windKph: number | string;
  windDir: number;
  temp: number | string;
  weatherText: string;
  WeatherIcon: React.ComponentType<any>;
}

function getWeatherDetails(code: number) {
  if (code === 0) return { text: "Clear Sky", Icon: Sun }
  if (code === 1 || code === 2 || code === 3) return { text: "Partly Cloudy", Icon: Cloud }
  if (code === 45 || code === 48) return { text: "Fog", Icon: CloudFog }
  if (code >= 51 && code <= 57) return { text: "Drizzle", Icon: CloudDrizzle }
  if (code >= 61 && code <= 67) return { text: "Rain", Icon: CloudRain }
  if (code >= 71 && code <= 77) return { text: "Snow", Icon: CloudSnow }
  if (code >= 80 && code <= 82) return { text: "Rain Showers", Icon: CloudRain }
  if (code >= 85 && code <= 86) return { text: "Snow Showers", Icon: CloudSnow }
  if (code >= 95 && code <= 99) return { text: "Thunderstorm", Icon: CloudLightning }
  return { text: "Cloudy", Icon: Cloud }
}

// Apple Maps–style location dot (DivIcon avoids Vite asset resolution issues)
const customMarkerIcon = L.divIcon({
  className: "custom-div-marker",
  html: `<div class="vv-marker"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

// Helper: Haversine distance in km
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Helper: Cardinal Direction from Degree
function getCardinalDirection(angle: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(((angle %= 360) < 0 ? angle + 360 : angle) / 22.5) % 16;
  return directions[index];
}

// GPX XML Parser
function parseGPX(text: string): RoutePoint[] {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(text, "text/xml");
  
  let pointsEl = xmlDoc.getElementsByTagName("trkpt");
  if (pointsEl.length === 0) {
    pointsEl = xmlDoc.getElementsByTagName("rtept");
  }
  if (pointsEl.length === 0) {
    pointsEl = xmlDoc.getElementsByTagName("wpt");
  }
  
  const points: RoutePoint[] = [];
  for (let i = 0; i < pointsEl.length; i++) {
    const el = pointsEl[i];
    const latAttr = el.getAttribute("lat");
    const lonAttr = el.getAttribute("lon");
    if (latAttr && lonAttr) {
      const lat = parseFloat(latAttr);
      const lon = parseFloat(lonAttr);
      const eleEl = el.getElementsByTagName("ele")[0];
      const ele = eleEl ? parseFloat(eleEl.textContent || "0") : 0;
      points.push({ lat, lon, ele });
    }
  }
  return points;
}

// Map Controller for resetting view and tracking active points
function MapController({ 
  points, 
  activePoint 
}: { 
  points: RoutePoint[]; 
  activePoint: RoutePoint; 
}) {
  const map = useMap();

  // Fit bounds when the route points update
  useEffect(() => {
    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map(p => [p.lat, p.lon]));
      map.fitBounds(bounds, { padding: [40, 40], animate: true, duration: 1.5 });
    }
  }, [points, map]);

  // Center/Pan when scrubbing the active point (always centered by default)
  useEffect(() => {
    if (activePoint) {
      map.invalidateSize();
      map.setView([activePoint.lat, activePoint.lon], map.getZoom(), { animate: false });
    }
  }, [activePoint, map]);

  return null;
}

function generateMockWeatherForPoint(index: number, activePoint: RoutePoint) {
  if (!activePoint) return {
    windMph: 15.9,
    windKph: 25.6,
    windDir: 188,
    temp: 11.6,
    weatherText: "Drizzle",
    WeatherIcon: CloudDrizzle
  };

  if (index === 0) {
    return {
      windMph: 15.9,
      windKph: 25.6,
      windDir: 188,
      temp: 11.6,
      weatherText: "Drizzle",
      WeatherIcon: CloudDrizzle
    };
  }

  const seed = (index * 17) % 100;
  const windMph = 15.9 + Math.sin(index / 6) * 4.5 + (seed % 4) * 0.3;
  const windKph = windMph * 1.609344;
  const windDir = Math.round((188 + Math.sin(index / 10) * 35 + seed * 0.5 + 360) % 360);
  const temp = 11.6 + Math.sin(index / 8) * 1.8 + (seed % 3) * 0.1;
  
  const conds = [
    { text: "Drizzle", Icon: CloudDrizzle },
    { text: "Light Rain", Icon: CloudRain },
    { text: "Partly Cloudy", Icon: Cloud },
    { text: "Mist", Icon: CloudFog },
    { text: "Clear Sky", Icon: Sun }
  ];
  const cond = conds[Math.floor(Math.abs(Math.sin(index / 4)) * conds.length) % conds.length];

  return {
    windMph: parseFloat(windMph.toFixed(1)),
    windKph: parseFloat(windKph.toFixed(1)),
    windDir,
    temp: parseFloat(temp.toFixed(1)),
    weatherText: cond.text,
    WeatherIcon: cond.Icon
  };
}

export default function App() {
  const { theme, setTheme } = useTheme()
  const [settingsOpen, setSettingsOpen] = useState(false)
  
  // State variables (Starts empty with no default route loaded)
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [locationName, setLocationName] = useState("No Route Loaded");
  const [activeIndex, setActiveIndex] = useState(0);
  const [isCustomRoute, setIsCustomRoute] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [windUnit, setWindUnit] = useState<'mph' | 'kph'>('mph');
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [milestoneWeatherData, setMilestoneWeatherData] = useState<WeatherData[]>([]);
  const [mapStyle, setMapStyle] = useState<'osm' | 'cyclosm'>('osm');

  // Compute distance tracking along the route points
  const routePointsWithDetails = useMemo(() => {
    let totalDist = 0;
    return routePoints.map((pt, i) => {
      if (i > 0) {
        const prev = routePoints[i - 1];
        totalDist += calculateDistance(prev.lat, prev.lon, pt.lat, pt.lon);
      }
      return {
        ...pt,
        distanceKm: parseFloat(totalDist.toFixed(2)),
        distanceMi: parseFloat((totalDist * 0.621371).toFixed(2))
      };
    });
  }, [routePoints]);

  const activePoint = routePointsWithDetails[activeIndex] || null;

  // Compute 5-mile milestone point indices along the route
  const milestoneIndices = useMemo(() => {
    if (routePointsWithDetails.length === 0) return [];
    const step = 5; // miles
    const indices: number[] = [0];
    let nextTarget = step;
    
    for (let i = 0; i < routePointsWithDetails.length; i++) {
      const currentDist = routePointsWithDetails[i].distanceMi || 0;
      if (currentDist >= nextTarget) {
        const prevDist = routePointsWithDetails[i - 1]?.distanceMi || 0;
        const indexToAdd = (nextTarget - prevDist < currentDist - nextTarget) ? i - 1 : i;
        
        if (indices[indices.length - 1] !== indexToAdd) {
          indices.push(indexToAdd);
        }
        nextTarget += step;
      }
    }
    
    const lastIndex = routePointsWithDetails.length - 1;
    if (indices[indices.length - 1] !== lastIndex) {
      indices.push(lastIndex);
    }
    return indices;
  }, [routePointsWithDetails]);

  // Derived index of the active point inside milestoneIndices
  const milestoneActiveIndex = useMemo(() => {
    const idx = milestoneIndices.indexOf(activeIndex);
    return idx !== -1 ? idx : 0;
  }, [activeIndex, milestoneIndices]);

  // Fetch real weather for milestones from Open-Meteo API
  useEffect(() => {
    if (routePointsWithDetails.length === 0 || milestoneIndices.length === 0) {
      setMilestoneWeatherData([]);
      return;
    }

    const fetchRouteWeather = async () => {
      setWeatherLoading(true);
      setErrorMessage(null);
      
      try {
        const milestones = milestoneIndices.map(idx => routePointsWithDetails[idx]);
        const lats = milestones.map(m => m.lat).join(",");
        const lons = milestones.map(m => m.lon).join(",");
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current_weather=true`;
        
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch real-time weather data.");
        
        const data = await res.json();
        const results = Array.isArray(data) ? data : [data];
        
        const formattedWeather: WeatherData[] = results.map((item) => {
          const cw = item.current_weather;
          const kph = cw.windspeed;
          const mph = parseFloat((kph * 0.6213711).toFixed(1));
          const details = getWeatherDetails(cw.weathercode);
          
          return {
            windMph: mph,
            windKph: parseFloat(kph.toFixed(1)),
            windDir: cw.winddirection,
            temp: parseFloat(cw.temperature.toFixed(1)),
            weatherText: details.text,
            WeatherIcon: details.Icon
          };
        });
        
        setMilestoneWeatherData(formattedWeather);
      } catch (err: any) {
        console.error(err);
        setErrorMessage(err.message || "Failed to retrieve real-time weather. Showing estimate weather.");
        
        const fallback = milestoneIndices.map((idx) => {
          return generateMockWeatherForPoint(idx, routePointsWithDetails[idx]);
        });
        setMilestoneWeatherData(fallback);
      } finally {
        setWeatherLoading(false);
      }
    };

    fetchRouteWeather();
  }, [routePointsWithDetails, milestoneIndices]);

  // Geocode location names based on track coordinates
  const reverseGeocode = async (lat: number, lon: number) => {
    try {
      const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
      if (res.ok) {
        const data = await res.json();
        const name = data.city || data.locality || data.village || data.admin1 || "Custom Route";
        setLocationName(name);
      }
    } catch {
      setLocationName("Custom Route");
    }
  };

  // Drag and drop file handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setErrorMessage(null);
    
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".gpx")) {
      processGPXFile(file);
    } else {
      setErrorMessage("Please upload a valid .GPX file");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    const file = e.target.files?.[0];
    if (file) {
      processGPXFile(file);
    }
  };

  const processGPXFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      try {
        const points = parseGPX(text);
        if (points.length === 0) {
          throw new Error("No coordinate track points found in GPX.");
        }
        setRoutePoints(points);
        setActiveIndex(0);
        setIsCustomRoute(true);
        
        // Use XML parsed name if available, otherwise geocode
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");
        const gpxName = xmlDoc.getElementsByTagName("name")[0]?.textContent;
        if (gpxName && gpxName.trim().length > 0) {
          setLocationName(gpxName);
        } else {
          reverseGeocode(points[0].lat, points[0].lon);
        }
      } catch (err: any) {
        setErrorMessage(err.message || "Failed to parse the GPX file.");
      }
    };
    reader.readAsText(file);
  };

  // Jump the timeline back to the start of the route
  const handleBackToStart = () => setActiveIndex(0);

  // Clear route state back to empty
  const handleClearRoute = () => {
    setRoutePoints([]);
    setLocationName("No Route Loaded");
    setActiveIndex(0);
    setIsCustomRoute(false);
    setErrorMessage(null);
  };

  // Derived active weather details for the current timeline position
  const weather = useMemo(() => {
    return milestoneWeatherData[milestoneActiveIndex] || {
      windMph: "--",
      windKph: "--",
      windDir: 0,
      temp: "--",
      weatherText: weatherLoading ? "Loading forecast…" : "No route loaded",
      WeatherIcon: Compass
    };
  }, [milestoneWeatherData, milestoneActiveIndex, weatherLoading]);

  const totalMi = routePointsWithDetails[routePointsWithDetails.length - 1]?.distanceMi || 0;
  const unitLabel = windUnit === 'mph' ? 'mph' : 'km/h';
  const stopLabel = activeIndex === 0
    ? 'Start'
    : milestoneActiveIndex === milestoneIndices.length - 1 ? 'Finish' : `Mile ${activePoint?.distanceMi ?? 0}`;

  return (
    <MotionConfig reducedMotion="user">
    <div
      onDragOver={handleDragOver}
      className="min-h-screen flex items-center justify-center relative px-4 py-6 sm:py-10"
    >

      {/* Background: soft glow with slow wind streaks */}
      <div className="background-animation" aria-hidden="true">
        <div className="wind-particle p1"></div>
        <div className="wind-particle p2"></div>
        <div className="wind-particle p3"></div>
        <div className="wind-particle p4"></div>
        <div className="wind-particle p5"></div>
      </div>

      {/* Main glass card */}
      <main className="glass w-full max-w-md rounded-[36px] p-3 text-label">

        {/* Header */}
        <header className="flex items-start justify-between gap-3 px-3 pt-3 pb-4">
          <div className="min-w-0">
            <h1 className="text-title1">VeloVelocity</h1>
            <p className={`text-body mt-0.5 truncate ${activePoint ? 'text-label' : 'text-label-2'}`}>
              {locationName}
            </p>
          </div>

          <GlassDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            title="Settings"
            trigger={
              <button
                className="press mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fill-3 text-label-2"
                aria-label="Settings"
              >
                <Settings className="h-[18px] w-[18px]" strokeWidth={2.2} />
              </button>
            }
          >
            <div className="section divide-y divide-separator overflow-hidden">
              <div className="flex min-h-[52px] items-center justify-between gap-4 px-4 py-2">
                <span className="text-subhead">Wind speed</span>
                <SegmentedControl
                  id="unit"
                  label="Wind speed unit"
                  value={windUnit}
                  onChange={setWindUnit}
                  options={[{ value: 'mph', label: 'mph' }, { value: 'kph', label: 'km/h' }]}
                />
              </div>
              <div className="flex min-h-[52px] items-center justify-between gap-4 px-4 py-2">
                <span className="text-subhead">Map</span>
                <SegmentedControl
                  id="map"
                  label="Map style"
                  value={mapStyle}
                  onChange={setMapStyle}
                  options={[{ value: 'osm', label: 'Standard' }, { value: 'cyclosm', label: 'Cycling' }]}
                />
              </div>
              <div className="flex min-h-[52px] items-center justify-between gap-4 px-4 py-2">
                <span className="text-subhead">Appearance</span>
                <SegmentedControl
                  id="theme"
                  label="Appearance"
                  value={theme as 'light' | 'dark' | 'system' | undefined}
                  onChange={setTheme}
                  options={[
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                    { value: 'system', label: 'Auto' }
                  ]}
                />
              </div>
            </div>
            <p className="text-footnote px-4 pt-2 pb-1 text-label-2">
              Auto matches your device's appearance.
            </p>
          </GlassDialog>
        </header>

        <div className="flex flex-col gap-3">

          {/* Route import */}
          <div className="flex gap-2">
            <label className="press flex h-11 flex-grow cursor-pointer items-center justify-center gap-2 rounded-full bg-tint-fill text-subhead font-semibold text-tint has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-tint">
              <FileUp className="h-[18px] w-[18px]" strokeWidth={2.2} />
              <span>{isCustomRoute ? "Choose another route" : "Choose GPX route"}</span>
              <input
                type="file"
                accept=".gpx"
                onChange={handleFileChange}
                className="sr-only"
              />
            </label>

            {isCustomRoute && (
              <button
                onClick={handleClearRoute}
                className="press h-11 rounded-full bg-fill-3 px-5 text-subhead font-semibold text-red"
              >
                Clear
              </button>
            )}
          </div>

          {/* Map */}
          <div className="relative z-0 h-80 w-full overflow-hidden rounded-[24px]">
            <MapContainer
              center={[52.3364, -2.0598]}
              zoom={12}
              className="h-full w-full"
              zoomControl={true}
              attributionControl={true}
            >
              <TileLayer
                key={mapStyle}
                url={MAP_TILES[mapStyle].url}
                attribution={MAP_TILES[mapStyle].attribution}
              />

              {routePoints.length > 0 && (
                <>
                  {/* Route line with a casing, like Apple Maps */}
                  <Polyline
                    positions={routePoints.map(p => [p.lat, p.lon])}
                    pathOptions={{ className: "vv-route-casing", weight: 7, opacity: 0.9, lineCap: "round", lineJoin: "round" }}
                  />
                  <Polyline
                    positions={routePoints.map(p => [p.lat, p.lon])}
                    pathOptions={{ className: "vv-route", weight: 4, opacity: 1, lineCap: "round", lineJoin: "round" }}
                  />

                  {activePoint && (
                    <Marker
                      position={[activePoint.lat, activePoint.lon]}
                      icon={customMarkerIcon}
                    />
                  )}

                  {activePoint && (
                    <MapController
                      points={routePoints}
                      activePoint={activePoint}
                    />
                  )}
                </>
              )}
            </MapContainer>
          </div>

          {/* Error */}
          <AnimatePresence initial={false}>
            {errorMessage && (
              <motion.div
                role="alert"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                className="overflow-hidden"
              >
                <div className="flex items-start gap-2.5 rounded-[18px] bg-red-fill px-4 py-3 text-footnote font-medium text-red">
                  <TriangleAlert className="mt-px h-4 w-4 shrink-0" strokeWidth={2.2} />
                  <span>{errorMessage}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Route position */}
          <section className="section px-4 pt-3 pb-1">
            {activePoint ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-headline tabular-nums">{stopLabel}</p>
                    <p className="text-footnote text-label-2 tabular-nums">
                      <span className="whitespace-nowrap">{activePoint.distanceMi || 0} of {totalMi} mi</span>
                      {" · "}
                      <span className="whitespace-nowrap">{Math.round(activePoint.ele || 0)} m elevation</span>
                    </p>
                  </div>
                  <button
                    onClick={handleBackToStart}
                    disabled={activeIndex === 0}
                    className="press flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-fill-3 px-3 text-footnote font-semibold text-tint"
                  >
                    <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.5} />
                    Back to start
                  </button>
                </div>

                <Scrubber
                  className="mt-1"
                  label="Position along route"
                  count={milestoneIndices.length}
                  value={milestoneActiveIndex}
                  valueText={`${stopLabel}, ${activePoint.distanceMi || 0} of ${totalMi} miles`}
                  onChange={(idx) => setActiveIndex(milestoneIndices[idx])}
                />
              </>
            ) : (
              <p className="text-footnote py-3 pb-4 text-center text-label-2">
                Choose a GPX route to scrub along it in 5-mile steps.
              </p>
            )}
          </section>

          {/* Wind */}
          <section className="section px-5 pt-4 pb-4">
            <div className="flex items-center gap-1.5 text-footnote font-medium text-label-2">
              <Wind className="h-3.5 w-3.5" strokeWidth={2.4} />
              <span>Wind</span>
              {weatherLoading && <span className="ml-auto">Updating…</span>}
            </div>

            <div className="flex items-end justify-between gap-4 pt-2">
              <div className="flex items-baseline gap-1.5">
                <span className="text-hero">
                  {windUnit === 'mph' ? weather.windMph : weather.windKph}
                </span>
                <span className="text-body font-medium text-label-2">{unitLabel}</span>
              </div>

              {activePoint && (
                <div className="flex flex-col items-center gap-1 pb-2">
                  <WindArrow degrees={weather.windDir} />
                  <span className="text-footnote font-semibold tabular-nums text-label-2">
                    {weather.windDir}° {getCardinalDirection(weather.windDir)}
                  </span>
                </div>
              )}
            </div>

            <div className="my-3 h-px bg-separator" />

            <div className="flex items-center justify-between gap-3 text-subhead">
              {activePoint ? (
                <>
                  <span className="flex items-center gap-2">
                    <weather.WeatherIcon className="h-5 w-5 text-tint" strokeWidth={2} />
                    <span>{weather.weatherText}</span>
                  </span>
                  <span className="font-semibold tabular-nums">{weather.temp}°C</span>
                </>
              ) : (
                <span className="text-label-2">Wind and weather appear here for each 5-mile point.</span>
              )}
            </div>
          </section>

        </div>
      </main>

      {/* Drag & drop overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-6 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.94 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.94 }}
              transition={{ type: "spring", bounce: 0, duration: 0.35 }}
              className="glass-thick pointer-events-none flex max-w-sm flex-col items-center gap-3 rounded-[32px] border-2 border-dashed border-tint px-10 py-12 text-center"
            >
              <FileUp className="h-12 w-12 text-tint" strokeWidth={1.6} />
              <h3 className="text-title1">Drop to import</h3>
              <p className="text-subhead text-label-2">
                Release your .gpx file to load the route and its wind forecast.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
    </MotionConfig>
  )
}

// Wind direction arrow that turns the short way round with a spring
function WindArrow({ degrees }: { degrees: number }) {
  const [prev, setPrev] = useState(degrees);
  const [angle, setAngle] = useState(degrees);
  if (degrees !== prev) {
    setPrev(degrees);
    setAngle(angle + ((((degrees - angle) % 360) + 540) % 360) - 180);
  }

  return (
    <motion.span
      className="flex h-8 w-8 items-center justify-center rounded-full bg-tint-fill text-tint"
      animate={{ rotate: angle - 45 }}
      initial={false}
      transition={{ type: "spring", bounce: 0, duration: 0.6 }}
      aria-hidden="true"
    >
      <Navigation className="h-4 w-4" strokeWidth={2.4} fill="currentColor" />
    </motion.span>
  );
}
