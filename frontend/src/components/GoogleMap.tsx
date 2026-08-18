/**
 * Google Map Component - Optional, uses VITE_GOOGLE_MAPS_API_KEY if provided
 * Falls back to custom SVG MapView if no key
 * 
 * City-based: When user selects city (e.g., Lahore), map centers on that city's coordinates
 */

import { useEffect, useRef, useState } from "react";
import { isGoogleMapsAvailable, type Coords } from "@/lib/location";
import { MapView, type MapMarker } from "./MapView";

interface GoogleMapProps {
  center?: Coords;
  markers?: MapMarker[];
  pin?: { x: number; y: number } | null;
  onPinMove?: (x: number, y: number) => void;
  className?: string;
  zoom?: number;
  children?: React.ReactNode;
  useGoogleMaps?: boolean; // Force use Google Maps even if available, or false to force custom
}

export function GoogleMapView({
  center,
  markers = [],
  pin,
  onPinMove,
  className = "absolute inset-0",
  zoom = 14,
  children,
  useGoogleMaps = true,
}: GoogleMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [googleMap, setGoogleMap] = useState<google.maps.Map | null>(null);

  const shouldUseGoogle = useGoogleMaps && isGoogleMapsAvailable() && center;

  useEffect(() => {
    if (!shouldUseGoogle || !mapRef.current) return;

    // Check if Google Maps JS already loaded
    if ((window as any).google && (window as any).google.maps) {
      initMap();
      return;
    }

    // Load Google Maps JS API
    const apiKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      setMapLoaded(true);
      initMap();
    };
    script.onerror = () => {
      console.warn("Failed to load Google Maps JS API, falling back to custom map");
      setMapLoaded(false);
    };
    document.head.appendChild(script);

    return () => {
      // Cleanup not needed for script, but remove listeners
    };
  }, [shouldUseGoogle, center?.lat, center?.lng]);

  const initMap = () => {
    if (!mapRef.current || !center || !(window as any).google) return;

    const map = new (window as any).google.maps.Map(mapRef.current, {
      center: { lat: center.lat, lng: center.lng },
      zoom: zoom,
      disableDefaultUI: false,
      zoomControl: true,
      streetViewControl: false,
      mapTypeControl: false,
      styles: [
        {
          featureType: "poi",
          elementType: "labels",
          stylers: [{ visibility: "off" }],
        },
      ],
    });

    setGoogleMap(map);

    // Add markers
    markers.forEach((m) => {
      if (m.kind === "user") {
        new (window as any).google.maps.Marker({
          position: { lat: center.lat, lng: center.lng },
          map: map,
          title: "You are here",
          icon: {
            path: (window as any).google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#229786",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 3,
          },
        });
      } else if (m.kind === "provider" && m.category) {
        // For provider markers, we need to convert x,y back to lat/lng? For simplicity, skip for now
        // Custom SVG map handles x,y better
      }
    });

    // Click to move pin (if onPinMove provided)
    if (onPinMove && center) {
      map.addListener("click", (e: any) => {
        if (e.latLng) {
          const clickedLat = e.latLng.lat();
          const clickedLng = e.latLng.lng();
          // Convert lat/lng to x,y offset from center for compatibility
          // For Google Maps, we directly use lat/lng, but we need x,y for existing logic
          // Approximate conversion
          const { coordsToOffset } = require("@/lib/location");
          const offset = coordsToOffset({ lat: clickedLat, lng: clickedLng }, center);
          const clampedX = Math.max(4, Math.min(96, offset.x));
          const clampedY = Math.max(4, Math.min(96, offset.y));
          onPinMove(clampedX, clampedY);
        }
      });
    }
  };

  // Update center when city changes
  useEffect(() => {
    if (googleMap && center) {
      googleMap.setCenter({ lat: center.lat, lng: center.lng });
    }
  }, [center?.lat, center?.lng, googleMap]);

  if (shouldUseGoogle && center) {
    return (
      <div className={`relative overflow-hidden bg-ink-100 ${className}`}>
        <div ref={mapRef} className="absolute inset-0 h-full w-full" />
        {pin && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg">
              📍
            </div>
          </div>
        )}
        {children}
        {!mapLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-ink-50/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-ink-200 border-t-brand-600" />
              <p className="text-xs text-ink-500">Loading {center ? `${center.lat.toFixed(2)}, ${center.lng.toFixed(2)} map...` : 'map...'}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Fallback to custom SVG map (no API key or no center)
  return (
    <MapView className={className} markers={markers} pin={pin} onPinMove={onPinMove}>
      {children}
    </MapView>
  );
}

/* Simple Google Maps Embed via iframe - No JS API needed, just API key for embed */
export function GoogleMapsEmbed({ coords, zoom = 14, className = "absolute inset-0" }: { coords: Coords; zoom?: number; className?: string }) {
  const apiKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY;
  
  if (!apiKey || apiKey === 'REPLACE_WITH_YOUR_KEY') {
    // Fallback to OSM embed
    return (
      <iframe
        className={className}
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${coords.lng - 0.02}%2C${coords.lat - 0.02}%2C${coords.lng + 0.02}%2C${coords.lat + 0.02}&layer=mapnik&marker=${coords.lat}%2C${coords.lng}`}
        style={{ border: 0 }}
        title="Map"
      />
    );
  }

  return (
    <iframe
      className={className}
      src={`https://www.google.com/maps/embed/v1/view?key=${apiKey}&center=${coords.lat},${coords.lng}&zoom=${zoom}`}
      style={{ border: 0 }}
      allowFullScreen
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      title="Google Map"
    />
  );
}
