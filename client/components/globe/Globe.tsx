import * as d3 from "d3";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { cdnFile } from "../../constants/utils";
import * as topojson from "topojson-client";
import { atlasIdsFor, countryName } from "./iso";
import { useReducedMotion } from "./useReducedMotion";
import type { MultiPolygon, Polygon } from "geojson";
import type { GeometryCollection, Topology } from "topojson-specification";

export type GeoJsonFeature = d3.ExtendedFeature<
  Polygon | MultiPolygon,
  { name: string }
>;

export interface PixelGlobeProps {
  /**
   * ISO alpha-2 codes of the active partner shelters, from the impact snapshot
   * (`shelters.countries`, plan F7.7). Exactly these are highlighted; nothing is hardcoded.
   */
  countries: readonly string[];
}

// Canvas size and globe radius for the pixel look.
const RENDER_SIZE = 1024;
const GLOBE_RADIUS = RENDER_SIZE * 0.42;

export const PixelGlobe = ({ countries: partnerCodes }: PixelGlobeProps) => {
  const [countries, setCountries] = useState<GeoJsonFeature[]>([]);
  // world-atlas ids are ISO numeric codes; the snapshot speaks alpha-2.
  const codesKey = partnerCodes.join(",");
  const partnerIds = useMemo(
    () => atlasIdsFor(codesKey ? codesKey.split(",") : []),
    [codesKey]
  );
  const [isInView, setIsInView] = useState(false);
  // Reduced motion: no spin; the globe still turns when dragged (review 3f #5).
  const reducedMotion = useReducedMotion();

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load World Topology
    fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
      .then((res) => res.json())
      .then(
        (
          worldData: Topology<{
            countries: GeometryCollection<GeoJsonFeature["properties"]>;
          }>
        ) => {
          const featureCollection = topojson.feature(
            worldData,
            worldData.objects.countries
          );
          setCountries(featureCollection.features as GeoJsonFeature[]);
        }
      )
      // The globe is decoration; the count and the list beside it carry the facts.
      .catch(() => {});
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


  // Pre-calculate centroids and area
  const countriesWithCentroids = useMemo(() => {
    return countries.map((feature) => {
      let centroid = d3.geoCentroid(feature);
      let area = d3.geoArea(feature);

      if (feature.geometry.type === "MultiPolygon") {
        const coordinates = feature.geometry.coordinates;
        let maxArea = 0;
        let largestPolyCoords = coordinates[0];

        coordinates.forEach((polyCoords) => {
          const tempFeature: d3.ExtendedFeature<Polygon> = {
            type: "Feature",
            properties: null,
            geometry: { type: "Polygon", coordinates: polyCoords },
          };
          const polyArea = d3.geoArea(tempFeature);
          if (polyArea > maxArea) {
            maxArea = polyArea;
            largestPolyCoords = polyCoords;
          }
        });

        const largestPolyFeature: d3.ExtendedFeature<Polygon> = {
          type: "Feature",
          properties: null,
          geometry: { type: "Polygon", coordinates: largestPolyCoords },
        };
        centroid = d3.geoCentroid(largestPolyFeature);
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
    if (!isInView || reducedMotion) return;

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
  }, [isDragging, isInView, reducedMotion]);

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
      path({ type: "Sphere" });
      context.fill();

      // 3. Countries - translucent blue-white continents
      countriesWithCentroids.forEach((feature) => {
        const isHovered = feature.properties.name === hoveredCountry;

        context.beginPath();
        path(feature);

        // Default: translucent blue-white for continents
        if (feature.id !== undefined && partnerIds.has(String(feature.id))) {
          // US: Yellow glow matching globe
          context.fillStyle = isHovered
            ? "rgba(252, 236, 187, 0.7)"
            : "rgba(252, 236, 187, 0.6)";

          // Stroke for partnered countries
          drawNeonGlow(() => path(feature), "#FCECBB", 1);
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
        () => path({ type: "Sphere" }),
        "#FCECBB", // Yellow neon
        6
      );
    };

    render();
  }, [
    countriesWithCentroids,
    rotation,
    hoveredCountry,
    time,
    isInView,
    partnerIds,
  ]);

  // Drag handling. d3-drag takes the mouse only: its touch listeners cancel touchmove, so a
  // vertical swipe over a full-width phone globe would not scroll the page (review 3f #5).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const drag = d3
      .drag<HTMLCanvasElement, unknown>()
      .touchable(() => false)
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

  // Touch: `touch-action: pan-y` leaves vertical swipes to the browser (it sends pointercancel),
  // and horizontal moves turn the globe.
  const touchX = useRef<number | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== "touch") return;
    touchX.current = e.clientX;
    setIsDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== "touch" || touchX.current === null) return;
    const dx = e.clientX - touchX.current;
    touchX.current = e.clientX;
    setRotation((curr) => [curr[0] + dx * 0.25, curr[1]]);
  };
  const endTouch = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== "touch") return;
    touchX.current = null;
    setIsDragging(false);
  };

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
        d3.geoContains(country, invert)
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
        role="img"
        aria-label={
          partnerCodes.length
            ? `Globe. Partner shelter countries: ${partnerCodes
                .map(countryName)
                .join(", ")}`
            : "Globe"
        }
        width={RENDER_SIZE}
        height={RENDER_SIZE}
        style={{
          imageRendering: "pixelated",
          cursor: hoveredCountry ? "pointer" : isDragging ? "grabbing" : "grab",
        }}
        onMouseMove={handleMouseMove}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endTouch}
        onPointerCancel={endTouch}
        className="touch-pan-y w-[min(400px,100vw)] h-[min(400px,100vw)] md:w-[600px] md:h-[600px]"
      />

      {hoveredCountry && (
        <div className="absolute top-0 font-primary glow text-p1 md:text-h5 text-tt-cream bg-black/25 px-4 py-2 rounded-full">
          {hoveredCountry}
        </div>
      )}
    </div>
  );
};
