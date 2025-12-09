"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getAirportCoordinates } from "@/lib/airports";

interface Controller {
  callsign: string;
  name: string;
  facility: string;
  frequency: string;
  latitude?: number | null;
  longitude?: number | null;
  locationName?: string | null;
  isInactive?: boolean;
}

interface Pilot {
  callsign: string;
  name: string;
  departure: string;
  arrival: string;
  aircraft: string;
  altitude: number;
  groundspeed: number;
  heading: number;
  latitude: number;
  longitude: number;
  etaMinutes?: number | null;
  etaTime?: string | null;
  distanceToArrival?: number | null;
}

interface LiveMapProps {
  controllers: Controller[];
  pilots: Pilot[];
}

export default function LiveMap({ controllers, pilots }: LiveMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const polylinesRef = useRef<L.Polyline[]>([]);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Initialize map centered on Pakistan
    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, {
        center: [30.3753, 69.3451], // Center of Pakistan
        zoom: 6,
        zoomControl: true,
      });

      // Add tile layer (OpenStreetMap)
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(mapRef.current);
    }

    const map = mapRef.current;

    // Clear existing markers and polylines
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    polylinesRef.current.forEach((polyline) => polyline.remove());
    polylinesRef.current = [];

    // Create custom icons
    const controllerIcon = L.divIcon({
      className: "custom-controller-icon",
      html: `<div style="
        background: #00c853;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 2px solid #fff;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      "></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });

    const inactiveControllerIcon = L.divIcon({
      className: "custom-controller-icon-inactive",
      html: `<div style="
        background: #ef4444;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 2px solid #fff;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      "></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });

    // Create pilot icon function that rotates based on heading
    const createPilotIcon = (heading: number) => {
      return L.divIcon({
        className: "custom-pilot-icon",
        html: `<div style="
          position: relative;
          width: 20px;
          height: 20px;
        ">
          <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(${heading}deg);
            width: 0;
            height: 0;
            border-left: 6px solid transparent;
            border-right: 6px solid transparent;
            border-bottom: 12px solid #2196f3;
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
          "></div>
        </div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
    };

    // Add controller markers
    controllers.forEach((controller) => {
      if (controller.latitude && controller.longitude) {
        const marker = L.marker([controller.latitude, controller.longitude], {
          icon: controller.isInactive ? inactiveControllerIcon : controllerIcon,
        }).addTo(map);

        const popupContent = `
          <div style="color: #000; font-family: system-ui; min-width: 200px;">
            <strong style="color: #00c853; font-size: 14px;">🎧 ${controller.callsign}</strong><br/>
            <span style="font-size: 12px;"><strong>Controller:</strong> ${controller.name || "Unknown"}</span><br/>
            <span style="font-size: 12px;"><strong>Position:</strong> ${controller.facility}</span><br/>
            <span style="font-size: 12px;"><strong>Frequency:</strong> ${controller.frequency}</span><br/>
            ${controller.locationName ? `<span style="font-size: 12px;"><strong>Location:</strong> ${controller.locationName}</span>` : ""}
          </div>
        `;
        marker.bindPopup(popupContent);
        markersRef.current.push(marker);
      }
    });

    // Add pilot markers and route lines
    pilots.forEach((pilot) => {
      if (pilot.latitude && pilot.longitude) {
        // Create icon rotated to show heading
        const icon = createPilotIcon(pilot.heading || 0);
        const marker = L.marker([pilot.latitude, pilot.longitude], {
          icon: icon,
        }).addTo(map);

        const etaDisplay = pilot.etaMinutes !== null && pilot.etaMinutes !== undefined 
          ? `<span style="font-size: 12px;"><strong>Landing ETA:</strong> <span style="color: #00c853; font-weight: 600;">${pilot.etaTime}</span> (${pilot.etaMinutes} min)</span><br/>`
          : "";
        const distanceDisplay = pilot.distanceToArrival !== null && pilot.distanceToArrival !== undefined
          ? `<span style="font-size: 12px;"><strong>Distance:</strong> ${pilot.distanceToArrival} nm</span><br/>`
          : "";
        
        const popupContent = `
          <div style="color: #000; font-family: system-ui; min-width: 200px;">
            <strong style="color: #2196f3; font-size: 14px;">✈️ ${pilot.callsign}</strong><br/>
            <span style="font-size: 12px;"><strong>Pilot:</strong> ${pilot.name || "Unknown"}</span><br/>
            <span style="font-size: 12px;"><strong>Route:</strong> ${pilot.departure} → ${pilot.arrival}</span><br/>
            <span style="font-size: 12px;"><strong>Aircraft:</strong> ${pilot.aircraft}</span><br/>
            <span style="font-size: 12px;"><strong>Altitude:</strong> FL${Math.round(pilot.altitude / 100)}</span><br/>
            <span style="font-size: 12px;"><strong>Heading:</strong> ${Math.round(pilot.heading || 0)}°</span><br/>
            <span style="font-size: 12px;"><strong>Speed:</strong> ${pilot.groundspeed || 0} kt</span><br/>
            ${distanceDisplay}
            ${etaDisplay}
          </div>
        `;
        marker.bindPopup(popupContent);
        markersRef.current.push(marker);

        // Add direction arrow showing movement (if moving)
        if (pilot.groundspeed > 10 && pilot.heading !== undefined) {
          // Calculate end point of arrow based on heading and speed
          const arrowLength = Math.min(pilot.groundspeed / 10, 50); // Scale arrow length by speed, max 50km
          const headingRad = (pilot.heading * Math.PI) / 180;
          
          // Approximate: 1 degree lat ≈ 111 km, 1 degree lon ≈ 111 km * cos(lat)
          const latOffset = (arrowLength / 111) * Math.cos(headingRad);
          const lonOffset = (arrowLength / (111 * Math.cos((pilot.latitude * Math.PI) / 180))) * Math.sin(headingRad);
          
          const arrowEndLat = pilot.latitude + latOffset;
          const arrowEndLon = pilot.longitude + lonOffset;

          // Draw direction arrow
          const directionArrow = L.polyline(
            [[pilot.latitude, pilot.longitude], [arrowEndLat, arrowEndLon]],
            {
              color: "#2196f3",
              weight: 3,
              opacity: 0.8,
            }
          ).addTo(map);
          polylinesRef.current.push(directionArrow);
        }

        // Draw route line from departure to current position, and from current position to arrival
        const depCoords = getAirportCoordinates(pilot.departure);
        const arrCoords = getAirportCoordinates(pilot.arrival);
        const currentPos: [number, number] = [pilot.latitude, pilot.longitude];

        // Line from departure to current position (if we have departure coordinates)
        if (depCoords) {
          const routeLine1 = L.polyline(
            [[depCoords.lat, depCoords.lon], currentPos],
            {
              color: "#2196f3",
              weight: 2,
              opacity: 0.6,
              dashArray: "5, 5",
            }
          ).addTo(map);
          polylinesRef.current.push(routeLine1);
        }

        // Line from current position to arrival (if we have arrival coordinates)
        if (arrCoords) {
          const routeLine2 = L.polyline(
            [currentPos, [arrCoords.lat, arrCoords.lon]],
            {
              color: "#00c853",
              weight: 2,
              opacity: 0.6,
              dashArray: "5, 5",
            }
          ).addTo(map);
          polylinesRef.current.push(routeLine2);
        }

        // If we have both departure and arrival, also show the full planned route
        if (depCoords && arrCoords) {
          const fullRoute = L.polyline(
            [[depCoords.lat, depCoords.lon], [arrCoords.lat, arrCoords.lon]],
            {
              color: "#94a3b8",
              weight: 1,
              opacity: 0.3,
              dashArray: "10, 10",
            }
          ).addTo(map);
          polylinesRef.current.push(fullRoute);
        }
      }
    });

    // Fit map to show all markers and routes
    const allFeatures = [...markersRef.current, ...polylinesRef.current];
    if (allFeatures.length > 0) {
      const group = new L.FeatureGroup(allFeatures);
      map.fitBounds(group.getBounds().pad(0.1));
    }

    return () => {
      // Cleanup on unmount
      markersRef.current.forEach((marker) => marker.remove());
      polylinesRef.current.forEach((polyline) => polyline.remove());
    };
  }, [controllers, pilots]);

  return (
    <div
      ref={mapContainerRef}
      style={{
        width: "100%",
        height: "500px",
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid #334155",
        background: "#1e293b",
      }}
    />
  );
}

