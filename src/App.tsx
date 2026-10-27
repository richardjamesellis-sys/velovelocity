import { useEffect, useState, useMemo } from "react"
import { useTheme } from "next-themes"
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet"
import { 
  Sun, 
  Cloud, 
  CloudRain, 
  CloudLightning, 
  CloudFog, 
  CloudDrizzle, 
  RefreshCw, 
  UploadCloud, 
  Navigation,
  SunDim,
  FileWarning,
  Compass,
  Settings,
  CloudSnow
} from "lucide-react"
import L from "leaflet"

import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/components"

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

// Custom blue pin icon using Leaflet's DivIcon to avoid Vite asset resolution issues
const customMarkerIcon = L.divIcon({
  className: "custom-div-marker",
  html: `
    <div class="relative flex items-center justify-center">
      <svg width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg" class="drop-shadow-md">
        <path d="M16 0C7.16 0 0 7.16 0 16C0 28 16 42 16 42C16 42 32 28 32 16C32 7.16 24.84 0 16 0Z" fill="#3b82f6"/>
        <circle cx="16" cy="16" r="6" fill="white"/>
      </svg>
      <div class="absolute -bottom-1 w-3.5 h-1 bg-black/40 blur-[1px] rounded-full"></div>
    </div>
  `,
  iconSize: [32, 42],
  iconAnchor: [16, 42],
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
  const { setTheme, resolvedTheme } = useTheme()
  
  // State variables (Starts empty with no default route loaded)
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [locationName, setLocationName] = useState("No Route Loaded");
  const [activeIndex, setActiveIndex] = useState(0);
  const [isCustomRoute, setIsCustomRoute] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
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

  // Refresh toggle: preserves GPX route points and location, resets activeIndex to 0
  const handleRefresh = () => {
    if (routePoints.length === 0) return;
    setIsRefreshing(true);
    setActiveIndex(0);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  };

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
      weatherText: weatherLoading ? "Loading weather forecast..." : "No route loaded",
      WeatherIcon: Compass
    };
  }, [milestoneWeatherData, milestoneActiveIndex, weatherLoading]);

  return (
    <div className="min-h-screen flex items-center justify-center relative p-4 transition-colors duration-300">
      
      {/* Background Animated Particles */}
      <div className="background-animation">
        <div className="wind-particle p1"></div>
        <div className="wind-particle p2"></div>
        <div className="wind-particle p3"></div>
        <div className="wind-particle p4"></div>
        <div className="wind-particle p5"></div>
      </div>

      {/* Main Container Card */}
      <div 
        onDragOver={handleDragOver}
        className="w-full max-w-md relative p-1"
      >
        <Card className="bg-[#0f172a]/80 dark:bg-slate-950/60 backdrop-blur-2xl border border-slate-800/80 dark:border-white/10 shadow-2xl rounded-[32px] overflow-hidden text-white transition-all duration-300 relative">
          
          {/* Settings trigger top-right */}
          <div className="absolute top-6 right-6 z-20">
            <Dialog>
              <DialogTrigger asChild>
                <button 
                  className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all outline-none"
                  title="Open Settings"
                >
                  <Settings className="w-5 h-5" />
                </button>
              </DialogTrigger>
              <DialogContent className="bg-slate-900/90 dark:bg-slate-950/90 border border-slate-800/85 text-white backdrop-blur-xl rounded-2xl p-6 max-w-xs sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle className="text-lg font-bold">Settings</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-5 py-4">
                  {/* Wind speed unit toggle */}
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-medium text-slate-300">Wind Speed Unit</span>
                    <div className="flex items-center bg-white/5 rounded-lg p-1 border border-white/10">
                      <button
                        onClick={() => setWindUnit('mph')}
                        className={`text-xs px-3 py-1.5 rounded-md font-semibold transition-all ${
                          windUnit === 'mph'
                            ? 'bg-blue-500 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        MPH
                      </button>
                      <button
                        onClick={() => setWindUnit('kph')}
                        className={`text-xs px-3 py-1.5 rounded-md font-semibold transition-all ${
                          windUnit === 'kph'
                            ? 'bg-blue-500 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        KPH
                      </button>
                    </div>
                  </div>

                  {/* Theme toggle */}
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-medium text-slate-300">Appearance</span>
                    <button
                      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                      className="flex items-center gap-2 text-xs font-semibold py-1.5 px-3 bg-white/5 hover:bg-white/10 active:bg-white/15 rounded-lg border border-white/10 text-slate-300 hover:text-white transition-all duration-200"
                    >
                      {resolvedTheme === 'dark' ? (
                        <>
                          <Sun className="w-3.5 h-3.5 text-blue-400" />
                          <span>Light Mode</span>
                        </>
                      ) : (
                        <>
                          <SunDim className="w-3.5 h-3.5 text-blue-400" />
                          <span>Dark Mode</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Map Style toggle */}
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-medium text-slate-300">Map Style</span>
                    <div className="flex items-center bg-white/5 rounded-lg p-1 border border-white/10">
                      <button
                        onClick={() => setMapStyle('osm')}
                        className={`text-xs px-3 py-1.5 rounded-md font-semibold transition-all ${
                          mapStyle === 'osm'
                            ? 'bg-blue-500 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Standard
                      </button>
                      <button
                        onClick={() => setMapStyle('cyclosm')}
                        className={`text-xs px-3 py-1.5 rounded-md font-semibold transition-all ${
                          mapStyle === 'cyclosm'
                            ? 'bg-blue-500 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Cycling
                      </button>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <CardHeader className="text-center pb-2 pt-8">
            <CardTitle className="italic text-3xl font-extrabold tracking-wider text-white" style={{ fontFamily: "'Montserrat', sans-serif" }}>
              VeloVelocity
            </CardTitle>
            
            {/* Location Indicators */}
            <div className="flex items-center justify-center mt-2">
              <h2 className="text-xl font-medium tracking-wide text-slate-100">
                {locationName}
              </h2>
            </div>
          </CardHeader>

          <CardContent className="flex flex-col items-center gap-4 px-6 pb-8">
            
            {/* GPX File Upload Zone (Moved above the map) */}
            <div className="w-full pb-2 flex gap-2">
              <label className="flex-grow flex items-center justify-center gap-2 cursor-pointer text-xs font-semibold py-2.5 px-4 bg-white/5 hover:bg-white/10 active:bg-white/15 rounded-xl border border-white/10 text-slate-300 hover:text-white transition-all duration-200 text-center">
                <UploadCloud className="w-4 h-4 text-blue-400" />
                <span>{isCustomRoute ? "Upload new .GPX" : "Upload .GPX route"}</span>
                <input
                  type="file"
                  accept=".gpx"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
              
              {isCustomRoute && (
                <button
                  onClick={handleClearRoute}
                  className="px-3 py-2 bg-red-950/20 hover:bg-red-950/40 active:scale-95 rounded-xl border border-red-500/20 text-red-300 text-xs font-semibold transition-all duration-200"
                  title="Clear current route"
                >
                  Clear Route
                </button>
              )}
            </div>

            {/* Map Container */}
            <div className="relative w-full h-80 rounded-2xl overflow-hidden border border-slate-800/80 shadow-inner z-0">
              <MapContainer 
                center={[52.3364, -2.0598]} 
                zoom={12} 
                className="w-full h-full" 
                zoomControl={true} 
                attributionControl={false}
              >
                <TileLayer 
                  key={mapStyle} 
                  url={MAP_TILES[mapStyle].url} 
                  attribution={MAP_TILES[mapStyle].attribution} 
                />
                
                {routePoints.length > 0 && (
                  <>
                    {/* Route Polyline (Outline weight set to 2) */}
                    <Polyline 
                      positions={routePoints.map(p => [p.lat, p.lon])} 
                      color="#3b82f6" 
                      weight={2} 
                      opacity={0.85}
                    />

                    {/* Highlighted active marker */}
                    {activePoint && (
                      <Marker 
                        position={[activePoint.lat, activePoint.lon]} 
                        icon={customMarkerIcon} 
                      />
                    )}

                    {/* Dynamic map focus bounds */}
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

            {/* Error Message */}
            {errorMessage && (
              <div className="w-full flex items-center gap-2 p-3 bg-red-950/40 border border-red-500/20 rounded-xl text-red-300 text-xs font-medium">
                <FileWarning className="w-4 h-4 shrink-0 text-red-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Scrub Slider Container (Positioned just below the map) */}
            <div className="w-full bg-slate-900/40 border border-white/5 rounded-2xl p-4 mt-1 flex flex-col gap-3">
              {activePoint ? (
                <>
                  {/* Slider Metrics Info Header */}
                  <div className="flex items-center justify-between text-xs text-slate-400 font-medium px-1 animate-in fade-in duration-300">
                    <div className="flex items-center gap-1">
                      <Compass className="w-3.5 h-3.5 text-blue-400" />
                      <span>
                        {activePoint?.distanceMi || 0} mi / {routePointsWithDetails[routePointsWithDetails.length - 1]?.distanceMi || 0} mi
                      </span>
                    </div>
                    <span>Elev: {Math.round(activePoint?.ele || 0)}m</span>
                  </div>

                  {/* Custom ShadCN-styled Timeline Slider */}
                  <div className="relative w-full flex items-center h-5">
                    {/* Background Track */}
                    <div className="absolute left-0 right-0 h-1.5 rounded-full bg-white/10 pointer-events-none" />
                    
                    {/* Active Slider Fill Track */}
                    <div 
                      className="absolute left-0 h-1.5 rounded-full bg-blue-500 pointer-events-none" 
                      style={{ 
                        width: milestoneIndices.length > 1 
                          ? `${(milestoneActiveIndex / (milestoneIndices.length - 1)) * 100}%` 
                          : '0%' 
                      }}
                    />
                    
                    {/* Native Range input overlaid invisible for standard interactions */}
                    <input
                      type="range"
                      min={0}
                      max={milestoneIndices.length > 0 ? milestoneIndices.length - 1 : 0}
                      value={milestoneActiveIndex}
                      onChange={(e) => {
                        const idx = Number(e.target.value);
                        setActiveIndex(milestoneIndices[idx]);
                      }}
                      className="absolute inset-x-0 w-full h-5 opacity-0 cursor-pointer z-10"
                    />
                    
                    {/* Slider Circle Thumb */}
                    <div 
                      className="absolute w-4 h-4 rounded-full border border-blue-400 bg-white shadow-md pointer-events-none transition-transform z-0"
                      style={{ 
                        left: milestoneIndices.length > 1 
                          ? `calc(${(milestoneActiveIndex / (milestoneIndices.length - 1)) * 100}% - 8px)` 
                          : '0%'
                      }}
                    />
                  </div>
                </>
              ) : (
                <div className="text-center text-xs text-slate-500 font-medium py-1.5">
                  No GPX route loaded to scrub.
                </div>
              )}
            </div>

            {/* Weather Metrics Card */}
            <div className="w-full bg-[#090d16] border border-white/5 rounded-2xl p-5 shadow-lg flex flex-col gap-4 animate-in fade-in duration-300">
              
              {/* Wind Speed MPH / KPH Grid (Toggled in Settings View) */}
              <div className="flex flex-col items-center justify-center py-2 text-center">
                <span className="text-[56px] leading-none font-bold text-blue-500 tracking-tighter">
                  {windUnit === 'mph' ? weather.windMph : weather.windKph}
                </span>
                <span className="text-xs uppercase tracking-wider font-semibold text-slate-400 mt-2">
                  {windUnit.toUpperCase()}
                </span>
              </div>

              {/* Horizontal Divider Line */}
              <div className="w-full h-[1px] bg-white/10" />

              {/* Temperature and Condition Description */}
              <div className="flex items-center justify-center gap-2 text-slate-100 font-medium text-lg">
                <weather.WeatherIcon className="w-6 h-6 text-blue-400" />
                {activePoint ? (
                  <>
                    <span>{weather.temp}°C</span>
                    <span className="text-slate-500 font-normal">•</span>
                    <span>{weather.weatherText}</span>
                  </>
                ) : (
                  <span className="text-slate-400 text-sm">Upload a GPX file to start</span>
                )}
              </div>
            </div>

            {/* Wind Degree + Arrow Vane (Only displayed if active route exists) */}
            {activePoint && (
              <div className="flex flex-col items-center gap-1.5 mt-1 animate-in fade-in duration-300">
                <div className="flex items-center justify-center gap-2 text-slate-300 font-semibold text-sm">
                  <Navigation 
                    className="w-5 h-5 text-blue-400 transition-transform duration-200" 
                    style={{ transform: `rotate(${weather.windDir - 45}deg)` }}
                  />
                  <span>{weather.windDir}° {getCardinalDirection(weather.windDir)}</span>
                </div>
              </div>
            )}

            {/* Refresh Button Zone (Hairline border removed, only rendered if route loaded) */}
            {routePoints.length > 0 && (
              <div className="w-full mt-2 flex justify-center animate-in fade-in duration-300">
                <button 
                  onClick={handleRefresh}
                  className="p-2 text-slate-500 hover:text-blue-400 active:scale-90 transition-all outline-none"
                  title="Refresh timeline (preserves custom route)"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>
            )}

          </CardContent>
        </Card>
      </div>

      {/* Drag & Drop Overlay Portal */}
      {isDragging && (
        <div 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6"
        >
          <div className="border-2 border-dashed border-blue-500 rounded-3xl p-12 bg-slate-900/50 flex flex-col items-center gap-4 text-center max-w-sm pointer-events-none animate-in fade-in zoom-in-95">
            <UploadCloud className="w-16 h-16 text-blue-400 animate-bounce" />
            <h3 className="text-xl font-bold text-white">Import Route</h3>
            <p className="text-sm text-slate-400">
              Drop your .GPX file anywhere on the screen to parse track points and view weather stats.
            </p>
          </div>
        </div>
      )}
      
    </div>
  )
}
