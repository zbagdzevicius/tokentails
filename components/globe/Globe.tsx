import React, { useEffect, useRef, useState, useMemo } from "react";
import * as d3 from "d3";

import * as topojson from "topojson-client";
import { CatAbilityType, cardsColor } from "@/models/cats";

export interface CountryData {
  id: string; // ISO numeric code or Name
  name: string;
}

export interface PartnershipData {
  countryName: string;
  status: "active" | "pending";
  description: string;
  since?: string;
  generatedInsight?: string;
}

export interface GeoJsonFeature {
  type: string;
  id: string;
  properties: {
    name: string;
  };
  geometry: {
    type: string;
    coordinates: any[];
  };
}

export enum ModalType {
  NONE,
  COUNTRY_DETAIL,
  ADD_PARTNERSHIP,
}

const INITIAL_PARTNERSHIPS: PartnershipData[] = [
  {
    countryName: "United States of America",
    status: "active",
    description: "HQ Node. Mainframe access established.",
    since: "1985",
  },
  {
    countryName: "Japan",
    status: "active",
    description: "Tokyo Uplink. Robotics division sync complete.",
    since: "1992",
  },
  {
    countryName: "Brazil",
    status: "pending",
    description: "Data stream initializing via Amazonia fiber.",
    since: "2024",
  },
];

export const PixelGlobe = () => {
  const [countries, setCountries] = useState<GeoJsonFeature[]>([]);
  const [partnerships, setPartnerships] =
    useState<PartnershipData[]>(INITIAL_PARTNERSHIPS);
  const [selectedCountry, setSelectedCountry] = useState<GeoJsonFeature | null>(
    null
  );

  const partnershipStatusMap = partnerships.reduce((acc, p) => {
    acc[p.countryName] = p.status;
    return acc;
  }, {} as Record<string, string>);

  useEffect(() => {
    // Load World Topology
    fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
      .then((res) => res.json())
      .then((worldData) => {
        // @ts-ignore - topojson typings are tricky in single file
        const featureCollection = topojson.feature(
          worldData,
          worldData.objects.countries
        );
        setCountries((featureCollection as any).features);
      });
  }, []);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rotation, setRotation] = useState<[number, number]>([0, 0]);
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [time, setTime] = useState(0);

  // Constants for the pixel look
  const RENDER_SIZE = 1024;
  const DISPLAY_SIZE = 600;
  const GLOBE_RADIUS = RENDER_SIZE * 0.42;

  // Pre-calculate centroids and area
  const countriesWithCentroids = useMemo(() => {
    return countries.map((feature) => {
      let centroid = d3.geoCentroid(feature as any);
      let area = d3.geoArea(feature as any);

      if (feature.geometry.type === "MultiPolygon") {
        const coordinates = feature.geometry.coordinates;
        let maxArea = 0;
        let largestPolyCoords = coordinates[0];

        coordinates.forEach((polyCoords: any) => {
          const tempFeature = {
            type: "Feature",
            geometry: { type: "Polygon", coordinates: polyCoords },
          };
          const polyArea = d3.geoArea(tempFeature as any);
          if (polyArea > maxArea) {
            maxArea = polyArea;
            largestPolyCoords = polyCoords;
          }
        });

        const largestPolyFeature = {
          type: "Feature",
          geometry: { type: "Polygon", coordinates: largestPolyCoords },
        };
        centroid = d3.geoCentroid(largestPolyFeature as any);
        area = maxArea;
      }

      return {
        ...feature,
        properties: {
          ...feature.properties,
          centroid: centroid,
          area: area,
        },
      };
    });
  }, [countries]);

  // Automatic Rotation and Animation Time - throttled for performance
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = 0;
    const animate = (currentTime: number) => {
      // Throttle to ~30fps for smoother performance
      if (currentTime - lastTime >= 33) {
        setTime((t) => t + 0.03);
        if (!isDragging) {
          setRotation((curr) => [curr[0] + 0.1, curr[1]]);
        }
        lastTime = currentTime;
      }
      animationFrameId = requestAnimationFrame(animate);
    };
    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isDragging]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || countriesWithCentroids.length === 0) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const projection = d3
      .geoOrthographic()
      .scale(GLOBE_RADIUS)
      .rotate([rotation[0], rotation[1]])
      .translate([RENDER_SIZE / 2, RENDER_SIZE / 2]);

    const path = d3.geoPath(projection, context);

    const drawPixelRect = (
      x: number,
      y: number,
      w: number,
      h: number,
      color: string
    ) => {
      context.fillStyle = color;
      context.fillRect(
        Math.round(x),
        Math.round(y),
        Math.round(w),
        Math.round(h)
      );
    };

    // Cache color conversions
    const colorCache = new Map<string, { r: number; g: number; b: number }>();
    const parseColor = (glowColor: string) => {
      if (colorCache.has(glowColor)) {
        return colorCache.get(glowColor)!;
      }
      let r: number, g: number, b: number;
      if (glowColor.startsWith("#")) {
        const hex = glowColor.replace("#", "");
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
      } else if (glowColor.startsWith("rgba")) {
        const matches = glowColor.match(/\d+/g);
        if (matches) {
          r = parseInt(matches[0]);
          g = parseInt(matches[1]);
          b = parseInt(matches[2]);
        } else {
          r = 0;
          g = 255;
          b = 255;
        }
      } else {
        r = 0;
        g = 255;
        b = 255;
      }
      const result = { r, g, b };
      colorCache.set(glowColor, result);
      return result;
    };

    // Optimized neon glow with smooth gradient effect
    const drawNeonGlow = (
      drawPath: () => void,
      glowColor: string,
      baseLineWidth: number = 2
    ) => {
      // More layers for smoother gradient, drawn from outer to inner
      const glowLayers = [
        { width: baseLineWidth * 12, opacity: 0.05 },
        { width: baseLineWidth * 10, opacity: 0.1 },
        { width: baseLineWidth * 8, opacity: 0.15 },
        { width: baseLineWidth * 6, opacity: 0.25 },
        { width: baseLineWidth * 4, opacity: 0.4 },
        { width: baseLineWidth * 2.5, opacity: 0.6 },
        { width: baseLineWidth * 1.5, opacity: 0.8 },
        { width: baseLineWidth, opacity: 1.0 },
      ];

      const { r, g, b } = parseColor(glowColor);

      // Draw from outer to inner for proper gradient layering
      glowLayers.forEach((layer) => {
        context.beginPath();
        drawPath();
        context.strokeStyle = `rgba(${r}, ${g}, ${b}, ${layer.opacity})`;
        context.lineWidth = layer.width;
        context.stroke();
      });
    };

    // Draw cat traits inside the globe - reduced count for performance
    const drawCatTraitsInsideGlobe = () => {
      const catTypes = Object.values(CatAbilityType);
      const traitCount = 10; // Reduced from 20 to 10

      const rot = projection.rotate();
      for (let i = 0; i < traitCount; i++) {
        const traitType = catTypes[i % catTypes.length];
        const color = cardsColor[traitType] || "#ffffff";

        // Create geographic positions that will be properly projected
        const baseLon = ((time * 5 + i * (360 / traitCount)) % 360) - 180;
        const baseLat = Math.sin(time * 0.15 + i * 0.3) * 60;
        const lon = baseLon + Math.sin(time * 0.2 + i) * 10;
        const lat = baseLat + Math.cos(time * 0.25 + i) * 15;

        const proj = projection([lon, lat]);
        if (!proj) continue;

        const distance = d3.geoDistance([lon, lat], [-rot[0], -rot[1]]);
        if (distance < 1.4) {
          const x = proj[0];
          const y = proj[1];
          const size = 6 + Math.sin(time * 2 + i) * 2;
          const alpha = 0.6 + Math.sin(time * 3 + i) * 0.3;

          const { r, g, b } = parseColor(color);
          context.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
          drawPixelRect(x - size / 2, y - size / 2, size, size, color);
        }
      }
    };

    // Draw cat traits orbiting around the globe - optimized
    const drawCatTraitsAroundGlobe = () => {
      const catTypes = Object.values(CatAbilityType);
      const orbitCount = catTypes.length;

      catTypes.forEach((traitType, index) => {
        const color = cardsColor[traitType] || "#ffffff";
        const { r, g, b } = parseColor(color);

        const orbitSpeed = 0.2 + (index % 3) * 0.1;
        const orbitAngle =
          (time * orbitSpeed + (index * Math.PI * 2) / orbitCount) %
          (Math.PI * 2);
        const inclination = Math.sin(index * 0.7) * 0.4;
        const distance = GLOBE_RADIUS * (1.25 + (index % 3) * 0.1);

        const x = RENDER_SIZE / 2 + Math.cos(orbitAngle) * distance;
        const y =
          RENDER_SIZE / 2 + Math.sin(orbitAngle) * distance * inclination;

        const size = 12 + Math.sin(time * 3 + index) * 3;

        // Reduced trail from 5 to 3 points
        for (let i = 1; i < 4; i++) {
          const trailAngle = orbitAngle - i * 0.05;
          const trailX = RENDER_SIZE / 2 + Math.cos(trailAngle) * distance;
          const trailY =
            RENDER_SIZE / 2 + Math.sin(trailAngle) * distance * inclination;
          const trailAlpha = (1 - i / 4) * 0.3;
          context.fillStyle = `rgba(${r}, ${g}, ${b}, ${trailAlpha})`;
          drawPixelRect(trailX - 3, trailY - 3, 6, 6, color);
        }

        // Draw main trait icon
        context.fillStyle = color;
        drawPixelRect(x - size / 2, y - size / 2, size, size, color);
      });
    };

    const drawParticleTrails = () => {
      // Reduced particle counts for performance
      const yellowTrailPoints = 15; // Reduced from 30
      for (let i = 0; i < yellowTrailPoints; i++) {
        const t = (time * 0.3 + i * 0.1) % (Math.PI * 2);
        const angle = t + Math.PI / 4;
        const radius = GLOBE_RADIUS * 1.15;
        const x = RENDER_SIZE / 2 + Math.cos(angle) * radius;
        const y = RENDER_SIZE / 2 + Math.sin(angle) * radius * 0.6;
        const alpha = (1 - i / yellowTrailPoints) * 0.8;
        const size = 3;
        context.fillStyle = `rgba(252, 236, 187, ${alpha})`;
        context.fillRect(x - size / 2, y - size / 2, size, size);
      }

      const purpleTrailPoints = 12; // Reduced from 25
      for (let i = 0; i < purpleTrailPoints; i++) {
        const t = (time * -0.25 + i * 0.12) % (Math.PI * 2);
        const angle = t - Math.PI / 3;
        const radius = GLOBE_RADIUS * 1.2;
        const x = RENDER_SIZE / 2 + Math.cos(angle) * radius;
        const y = RENDER_SIZE / 2 + Math.sin(angle) * radius * 0.7;
        const alpha = (1 - i / purpleTrailPoints) * 0.7;
        const size = 4;
        context.fillStyle = `rgba(192, 132, 252, ${alpha})`;
        context.fillRect(x - size / 2, y - size / 2, size, size);
      }
    };

    const drawPixelatedFace = (lon: number, lat: number) => {
      const proj = projection([lon, lat]);
      if (!proj) return;

      const r = projection.rotate();
      const distance = d3.geoDistance([lon, lat], [-r[0], -r[1]]);
      if (distance > 1.4) return;

      const x = proj[0];
      const y = proj[1];
      const faceSize = 12;

      // Light brown face background
      context.fillStyle = "#d4a574";
      context.fillRect(x - faceSize / 2, y - faceSize / 2, faceSize, faceSize);

      // Black square eyes
      context.fillStyle = "#000000";
      context.fillRect(x - faceSize / 2 + 2, y - faceSize / 2 + 2, 3, 3);
      context.fillRect(x + faceSize / 2 - 5, y - faceSize / 2 + 2, 3, 3);

      // Black square mouth
      context.fillRect(x - 2, y + faceSize / 2 - 4, 4, 2);
    };

    const drawBrazilSparkles = (feature: any) => {
      if (feature.properties.name !== "Brazil") return;

      context.save();
      context.beginPath();
      path(feature as any);
      context.clip();

      // Reduced sparkle count for performance
      const sparkleCount = 12; // Reduced from 25
      const rot = projection.rotate();
      for (let i = 0; i < sparkleCount; i++) {
        const t = (time * 2 + i * 0.25) % (Math.PI * 2);
        const lon = -55 + Math.sin(t) * 8;
        const lat = -10 + Math.cos(t) * 6;
        const brazilProj = projection([lon, lat]);

        if (
          brazilProj &&
          d3.geoDistance([lon, lat], [-rot[0], -rot[1]]) < 1.4
        ) {
          const sparkleSize = 2 + Math.sin(time * 5 + i) * 1.5;
          const sparkleAlpha = 0.7 + Math.sin(time * 4 + i) * 0.2;
          context.fillStyle = `rgba(255, 200, 100, ${sparkleAlpha})`;
          context.fillRect(
            brazilProj[0] - sparkleSize / 2,
            brazilProj[1] - sparkleSize / 2,
            sparkleSize,
            sparkleSize
          );
        }
      }

      context.restore();
    };

    const render = () => {
      context.clearRect(0, 0, RENDER_SIZE, RENDER_SIZE);

      // 1. Draw particle trails and sparkles
      drawParticleTrails();

      // 2. Globe - translucent with glowing wireframe
      // Base sphere with soft yellow interior glow
      const grd = context.createRadialGradient(
        RENDER_SIZE / 2,
        RENDER_SIZE / 2,
        GLOBE_RADIUS * 0.3,
        RENDER_SIZE / 2,
        RENDER_SIZE / 2,
        GLOBE_RADIUS
      );
      grd.addColorStop(0, "rgba(252, 236, 187, 0.3)");
      grd.addColorStop(0.5, "rgba(252, 236, 187, 0.15)");
      grd.addColorStop(1, "rgba(252, 236, 187, 0.05)");
      context.fillStyle = grd;
      context.beginPath();
      path({ type: "Sphere" } as any);
      context.fill();

      // Simplified wireframe grid - single layer for performance
      context.beginPath();
      path(d3.geoGraticule()());
      context.strokeStyle = "rgba(252, 236, 187, 0.6)";
      context.lineWidth = 1.5;
      context.stroke();

      // Draw cat traits inside the globe
      drawCatTraitsInsideGlobe();

      // 3. Countries - translucent blue-white continents
      countriesWithCentroids.forEach((feature) => {
        const isHovered = feature.properties.name === hoveredCountry;
        const countryName = feature.properties.name;

        context.beginPath();
        path(feature as any);

        // Default: translucent blue-white for continents
        if (countryName === "United States of America") {
          // US: Yellow glow matching globe
          context.fillStyle = isHovered
            ? "rgba(252, 236, 187, 0.7)"
            : "rgba(252, 236, 187, 0.6)";
        } else if (countryName === "Brazil") {
          // Brazil: Yellow glow matching globe
          context.fillStyle = isHovered
            ? "rgba(252, 236, 187, 0.7)"
            : "rgba(252, 236, 187, 0.6)";
        } else {
          // Other countries: translucent blue-white
          context.fillStyle = isHovered
            ? "rgba(200, 220, 255, 0.4)"
            : "rgba(180, 200, 255, 0.3)";
        }

        context.fill();

        // Only apply neon glow to major countries for performance
        if (
          countryName === "United States of America" ||
          countryName === "Brazil"
        ) {
          // Use same yellow glow as globe
          drawNeonGlow(() => path(feature as any), "#FCECBB", 1);
        } else {
          // Simple stroke for other countries
          context.lineWidth = 1;
          context.strokeStyle = "rgba(252, 236, 187, 0.4)";
          context.stroke();
        }
      });

      // Draw US pixelated face
      countriesWithCentroids.forEach((feature) => {
        if (feature.properties.name === "United States of America") {
          const [lon, lat] = feature.properties.centroid;
          drawPixelatedFace(lon, lat);
        }
      });

      // Draw Brazil sparkles
      countriesWithCentroids.forEach((feature) => {
        if (feature.properties.name === "Brazil") {
          context.save();
          drawBrazilSparkles(feature);
        }
      });

      // Draw cat traits orbiting around the globe
      drawCatTraitsAroundGlobe();

      // 4. Globe outline with optimized neon glow
      drawNeonGlow(
        () => path({ type: "Sphere" } as any),
        "#FCECBB", // Yellow neon
        6
      );
    };

    render();
  }, [
    countriesWithCentroids,
    rotation,
    hoveredCountry,
    partnershipStatusMap,
    time,
  ]);

  // Drag Handling
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const drag = d3
      .drag<HTMLCanvasElement, unknown>()
      .on("start", () => setIsDragging(true))
      .on("drag", (event) => {
        const sensitivity = 0.25;
        setRotation((curr) => {
          const newLambda = curr[0] + event.dx * sensitivity;
          const newPhi = Math.max(
            -90,
            Math.min(90, curr[1] + event.dy * sensitivity)
          );
          return [newLambda, newPhi];
        });
      })
      .on("end", () => setIsDragging(false));
    d3.select(canvas).call(drag);
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (RENDER_SIZE / rect.width);
    const y = (e.clientY - rect.top) * (RENDER_SIZE / rect.height);
    const projection = d3
      .geoOrthographic()
      .scale(GLOBE_RADIUS)
      .rotate([rotation[0], rotation[1]])
      .translate([RENDER_SIZE / 2, RENDER_SIZE / 2]);
    const invert = projection.invert?.([x, y]);
    if (invert) {
      const found = countriesWithCentroids.find((country) =>
        d3.geoContains(country as any, invert)
      );
      setHoveredCountry(found ? found.properties.name : null);
    } else {
      setHoveredCountry(null);
    }
  };

  return (
    <div className="relative flex justify-center items-center">
      <canvas
        ref={canvasRef}
        width={RENDER_SIZE}
        height={RENDER_SIZE}
        style={{
          width: DISPLAY_SIZE,
          height: DISPLAY_SIZE,
          imageRendering: "pixelated",
          cursor: hoveredCountry ? "pointer" : isDragging ? "grabbing" : "grab",
        }}
        onMouseMove={handleMouseMove}
        onClick={() =>
          hoveredCountry &&
          setSelectedCountry(
            countriesWithCentroids.find(
              (c) => c.properties.name === hoveredCountry
            )!
          )
        }
        className="touch-none"
      />

      <div className="absolute -top-24">
        <img src="/meme-cats/meme-23.gif" className="w-48" />
      </div>
      {hoveredCountry && (
        <div className="absolute top-0 font-primary glow text-h5 text-yellow-300 bg-black/25 px-4 py-2 rounded-full">
          {hoveredCountry}
        </div>
      )}
    </div>
  );
};
