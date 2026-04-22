import * as d3 from "d3";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { cdnFile } from "../../constants/utils";
import * as topojson from "topojson-client";

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

export const INITIAL_PARTNERSHIPS: string[] = [
  "United States of America",
  "United Kingdom",
  "Lithuania",
  "Colombia",
  "Poland",
  "Greece",
  "Vietnam",
  "Japan",
  "France",
];

export const PixelGlobe = () => {
  const [countries, setCountries] = useState<GeoJsonFeature[]>([]);
  const [partnerships, setPartnerships] =
    useState<string[]>(INITIAL_PARTNERSHIPS);
  const [isInView, setIsInView] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

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

  // Intersection Observer to detect when component is in view
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsInView(entry.isIntersecting);
        });
      },
      {
        threshold: 0.1, // Trigger when at least 10% is visible
        rootMargin: "50px", // Start rendering slightly before it comes into view
      }
    );

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, []);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rotation, setRotation] = useState<[number, number]>([0, 0]);
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [time, setTime] = useState(0);

  // Constants for the pixel look - reduced on mobile for performance
  const RENDER_SIZE = 1024;
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
  // Only animate when component is in view
  useEffect(() => {
    if (!isInView) return;

    let animationFrameId: number;
    let lastTime = 0;
    const animate = (currentTime: number) => {
      // Throttle based on device type
      if (currentTime - lastTime >= 50) {
        setTime((t) => t + 0.02);
        if (!isDragging) {
          setRotation((curr) => [curr[0] + 0.1, curr[1]]);
        }
        lastTime = currentTime;
      }
      animationFrameId = requestAnimationFrame(animate);
    };
    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isDragging, isInView]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || countriesWithCentroids.length === 0 || !isInView) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const projection = d3
      .geoOrthographic()
      .scale(GLOBE_RADIUS)
      .rotate([rotation[0], rotation[1]])
      .translate([RENDER_SIZE / 2, RENDER_SIZE / 2]);

    const path = d3.geoPath(projection, context);

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
    // Simplified on mobile for performance
    const drawNeonGlow = (
      drawPath: () => void,
      glowColor: string,
      baseLineWidth: number = 2
    ) => {
      const { r, g, b } = parseColor(glowColor);

      // More layers for smoother gradient on desktop, drawn from outer to inner
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
      glowLayers.forEach((layer) => {
        context.beginPath();
        drawPath();
        context.strokeStyle = `rgba(${r}, ${g}, ${b}, ${layer.opacity})`;
        context.lineWidth = layer.width;
        context.stroke();
      });
    };

    const render = () => {
      context.clearRect(0, 0, RENDER_SIZE, RENDER_SIZE);

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

      // 3. Countries - translucent blue-white continents
      countriesWithCentroids.forEach((feature) => {
        const isHovered = feature.properties.name === hoveredCountry;
        const countryName = feature.properties.name;

        context.beginPath();
        path(feature as any);

        // Default: translucent blue-white for continents
        if (partnerships.includes(countryName)) {
          // US: Yellow glow matching globe
          context.fillStyle = isHovered
            ? "rgba(252, 236, 187, 0.7)"
            : "rgba(252, 236, 187, 0.6)";

          // Stroke for partnered countries
          drawNeonGlow(() => path(feature as any), "#FCECBB", 1);
        } else {
          // Other countries: translucent blue-white
          context.fillStyle = isHovered
            ? "rgba(200, 220, 255, 0.4)"
            : "rgba(180, 200, 255, 0.3)";

          // Stroke for other countries
          context.lineWidth = 1;
          context.strokeStyle = "rgba(252, 236, 187, 0.4)";
          context.stroke();
        }

        context.fill();
      });

      // 4. Globe outline with optimized neon glow
      drawNeonGlow(
        () => path({ type: "Sphere" } as any),
        "#FCECBB", // Yellow neon
        6
      );
    };

    render();
  }, [countriesWithCentroids, rotation, hoveredCountry, time, isInView]);

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
    <div
      ref={containerRef}
      className="relative flex justify-center items-center"
    >
      <div className="absolute -top-[96px] md:-top-[86px]">
        <img
          src={cdnFile("tail/mascot-point-right.webp")}
          className="w-[144px]"
          draggable={false}
        />
      </div>
      <canvas
        ref={canvasRef}
        width={RENDER_SIZE}
        height={RENDER_SIZE}
        style={{
          imageRendering: "pixelated",
          cursor: hoveredCountry ? "pointer" : isDragging ? "grabbing" : "grab",
        }}
        onMouseMove={handleMouseMove}
        onClick={() => hoveredCountry}
        className="touch-none w-[400px] h-[400px] md:w-[600px] md:h-[600px]"
      />

      {hoveredCountry && (
        <div className="absolute top-0 font-primary glow text-p1 md:text-h5 text-yellow-300 bg-black/25 px-4 py-2 rounded-full">
          {hoveredCountry}
        </div>
      )}
    </div>
  );
};
