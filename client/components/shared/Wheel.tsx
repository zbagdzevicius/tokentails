import { cdnFile } from "@/constants/utils";
import { loadGameFonts, ttCanvasFont } from "@/components/typography";
import React, {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  forwardRef,
} from "react";

type Values = 1 | 5 | 10 | 25 | 50 | 100 | 250 | 1000;

interface WheelComponentProps {
  segments: Values[];
  segColors: string[];
  winningSegment?: Values | null;
  onFinished: (segment: Values) => void;
  primaryColor?: string;
  contrastColor?: string;
  buttonText?: string;
  isOnlyOnce?: boolean;
}

/** The wheel's display scale for a viewport (the canvas is drawn at 1000 x 800 px). */
const wheelScale = (width: number, height: number): number => {
  // Short landscape phones: the whole wheel fits beside the result without scrolling.
  if (height < 500) return 0.3;
  if (width < 640) return 0.36;
  if (width < 1024) return 0.46;
  return 0.5;
};

export interface WheelRef {
  spin: () => void;
}

const WheelComponent = forwardRef<WheelRef, WheelComponentProps>(
  (
    {
      segments,
      segColors,
      winningSegment = null,
      onFinished,
      primaryColor = "#8e4a41",
      contrastColor = "white",
      isOnlyOnce = false,
    },
    ref,
  ) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isFinished, setFinished] = useState(false);
    const [isStarted, setIsStarted] = useState(false);
    // The right size from the first frame: starting at 1 drew a 1000 px wheel that shrank in
    // over 0.3 s, so the modal opened oversized and jumped.
    const [scale, setScale] = useState(() =>
      typeof window === "undefined" ? 0.36 : wheelScale(window.innerWidth, window.innerHeight),
    );
    const winningSegmentRef = useRef(winningSegment);

    useEffect(() => {
      winningSegmentRef.current = winningSegment;
    }, [winningSegment]);

    const wheelState = useRef<{
      currentSegment: Values | "";
      timerHandle: number;
      angleCurrent: number;
      angleDelta: number;
      spinStart: number;
      frames: number;
      decStart: number;
      startDecAngle: number;
      lastTickTime: number;
    }>({
      currentSegment: "",
      timerHandle: 0,
      angleCurrent: 0,
      angleDelta: 0,
      spinStart: 0,
      frames: 0,
      decStart: 0,
      startDecAngle: 0,
      lastTickTime: 0,
    });

    const size = 18.125; // 290px / 16 = 18.125rem
    const timerDelay = segments.length;
    const maxSpeed = Math.PI / segments.length;
    const upTime = segments.length * 200;
    const downTime = segments.length * 300;
    const centerX = 31.25;
    const centerY = 25;

    // Handle responsive scaling
    useEffect(() => {
      const updateScale = () => setScale(wheelScale(window.innerWidth, window.innerHeight));

      updateScale();
      window.addEventListener("resize", updateScale);
      return () => window.removeEventListener("resize", updateScale);
    }, []);

    const initCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
    };

    const onTimerTick = () => {
      const now = new Date().getTime();
      const dt = wheelState.current.lastTickTime
        ? now - wheelState.current.lastTickTime
        : timerDelay;
      wheelState.current.lastTickTime = now;

      wheelState.current.frames++;
      draw();

      const duration = now - wheelState.current.spinStart;
      let finished = false;

      if (duration < upTime) {
        // Acceleration phase
        const progress = duration / upTime;
        wheelState.current.angleDelta =
          maxSpeed * Math.sin((progress * Math.PI) / 2);
        wheelState.current.angleCurrent +=
          wheelState.current.angleDelta * (dt / timerDelay);
      } else {
        if (winningSegmentRef.current) {
          if (wheelState.current.decStart === 0) {
            const winIndex = segments.indexOf(winningSegmentRef.current);

            if (winIndex !== -1) {
              const targetAngle =
                (1.5 * Math.PI -
                  (winIndex + 0.5) * ((2 * Math.PI) / segments.length)) %
                (2 * Math.PI);
              const normalizedTarget =
                targetAngle < 0 ? targetAngle + 2 * Math.PI : targetAngle;

              const decSteps = downTime / timerDelay;
              const decDist = (maxSpeed * decSteps * 2) / Math.PI;
              const requiredDist = decDist % (2 * Math.PI);

              let currentDistToTarget =
                (normalizedTarget - wheelState.current.angleCurrent) %
                (2 * Math.PI);
              if (currentDistToTarget < 0) currentDistToTarget += 2 * Math.PI;

              const distError =
                (requiredDist - currentDistToTarget + 2 * Math.PI) %
                (2 * Math.PI);

              if (
                distError < maxSpeed &&
                wheelState.current.frames > segments.length * 2
              ) {
                wheelState.current.decStart = now;
                // Align startDecAngle exactly with the target path to ensure zero offset at the end.
                wheelState.current.startDecAngle = normalizedTarget - decDist;
              }
            }
            wheelState.current.angleDelta = maxSpeed;
            wheelState.current.angleCurrent +=
              wheelState.current.angleDelta * (dt / timerDelay);
          } else {
            // Decelerating phase using precise integral displacement
            const decDuration = now - wheelState.current.decStart;
            if (decDuration >= downTime) {
              finished = true;
              // Snap to exact target to ensure winning segment is centered
              const winIndex = segments.indexOf(winningSegmentRef.current);
              const targetAngle =
                (1.5 * Math.PI -
                  (winIndex + 0.5) * ((2 * Math.PI) / segments.length)) %
                (2 * Math.PI);
              wheelState.current.angleCurrent =
                targetAngle < 0 ? targetAngle + 2 * Math.PI : targetAngle;
              wheelState.current.angleDelta = 0;
            } else {
              const decSteps = downTime / timerDelay;
              const totalDecDist = (maxSpeed * decSteps * 2) / Math.PI;
              const currentDecDist =
                totalDecDist *
                Math.sin((decDuration / downTime) * (Math.PI / 2));
              wheelState.current.angleCurrent =
                wheelState.current.startDecAngle + currentDecDist;

              // For the needle display during deceleration
              wheelState.current.angleDelta =
                maxSpeed * Math.cos((decDuration / downTime) * (Math.PI / 2));
            }
          }
        } else {
          // No winning segment provided yet, keep spinning at max speed
          wheelState.current.angleDelta = maxSpeed;
          wheelState.current.angleCurrent +=
            wheelState.current.angleDelta * (dt / timerDelay);
        }
      }

      while (wheelState.current.angleCurrent >= Math.PI * 2) {
        wheelState.current.angleCurrent -= Math.PI * 2;
      }
      while (wheelState.current.angleCurrent < 0) {
        wheelState.current.angleCurrent += Math.PI * 2;
      }

      if (finished) {
        setFinished(true);
        if (wheelState.current.currentSegment !== "") {
          onFinished(wheelState.current.currentSegment as Values);
        }
        clearInterval(wheelState.current.timerHandle);
        wheelState.current.timerHandle = 0;
      }
    };

    const wheelDraw = () => {
      clear();
      drawWheel();
      drawNeedle();
    };

    const draw = () => {
      clear();
      drawWheel();
      drawNeedle();
    };

    const drawSegment = (
      ctx: CanvasRenderingContext2D,
      key: number,
      lastAngle: number,
      angle: number,
    ) => {
      const value = segments[key];
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(centerX * 16, centerY * 16);
      ctx.arc(centerX * 16, centerY * 16, size * 16, lastAngle, angle, false);
      ctx.lineTo(centerX * 16, centerY * 16);
      ctx.closePath();
      ctx.fillStyle = segColors[key];
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#8e4a41";
      ctx.stroke();
      ctx.save();
      ctx.translate(centerX * 16, centerY * 16);
      const mid = (lastAngle + angle) / 2;
      ctx.rotate(mid);
      // Every number reads upright: on the left half of the wheel (mid-angle between 90 and 270
      // degrees) the label turns half a turn, so "50" never reads as "05". Both halves sit against
      // the rim, inside the frame art, and run toward the hub.
      const turn = ((mid % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const flipped = turn > Math.PI / 2 && turn < (3 * Math.PI) / 2;
      const label = String(value);
      // The frame art covers the outer ~40 px of the drawn disc: start just inside it.
      const rimX = size * 16 - 46;
      if (flipped) ctx.rotate(Math.PI);
      ctx.textAlign = flipped ? "left" : "right";
      const x = flipped ? -rimX : rimX;
      // Plan G12: the brand `title` face (Passion One 900), not an undeclared family.
      // Canvas px: the wheel is drawn at 1000 px and shown at 0.3-0.5x, so 54 reads as 16-27 CSS px.
      // Dark ink on the light segments with a thin cream rim: readable at the 0.36x phone scale.
      // A four-digit prize gets a smaller face so it stays inside its slice.
      ctx.font = ttCanvasFont("title", label.length >= 4 ? 40 : 52);
      ctx.strokeStyle = "#fff4dc";
      ctx.lineWidth = 6;
      ctx.lineJoin = "round";
      ctx.strokeText(label, x, 0);
      ctx.fillStyle = "#552000";
      ctx.fillText(label, x, 0);

      // Two restores for the two saves above (the segment's and the label's), so the context
      // stack does not grow by one per segment per frame.
      ctx.restore();
      ctx.restore();
    };

    const drawWheel = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      let lastAngle = wheelState.current.angleCurrent;
      const len = segments.length;
      const PI2 = Math.PI * 2;

      ctx.lineWidth = 3;
      ctx.strokeStyle = "#8e4a41";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.font = ttCanvasFont("title", 48);

      for (let i = 1; i <= len; i++) {
        const angle = PI2 * (i / len) + wheelState.current.angleCurrent;
        drawSegment(ctx, i - 1, lastAngle, angle);
        lastAngle = angle;
      }

      // Draw a center circle
      // ctx.beginPath();
      // ctx.arc(centerX * 16, centerY * 16, 3.125 * 16, 0, PI2, false); // 50px = 3.125rem
      // ctx.closePath();
      // ctx.fillStyle = primaryColor;
      // ctx.lineWidth = 10;
      // ctx.strokeStyle = contrastColor;
      // ctx.fill();
      // ctx.fillStyle = contrastColor;
      // ctx.textAlign = "center";
      // ctx.fillText(buttonText, centerX * 16, centerY * 16 + 3);
      // ctx.stroke();

      ctx.beginPath();
      ctx.arc(centerX * 16, centerY * 16, size * 16, 0, PI2, false);
      ctx.closePath();
      ctx.lineWidth = 10;
      ctx.strokeStyle = primaryColor;
      ctx.stroke();
    };

    const drawNeedle = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.lineWidth = 1;
      ctx.strokeStyle = contrastColor;
      ctx.fillStyle = contrastColor;
      ctx.beginPath();
      ctx.moveTo(centerX * 16 + 20, centerY * 16 - 50);
      ctx.lineTo(centerX * 16 - 20, centerY * 16 - 50);
      ctx.lineTo(centerX * 16, centerY * 16 - 70);
      ctx.closePath();
      ctx.fill();

      const needlePos = 1.5 * Math.PI;
      let normalizedAngle =
        (needlePos - wheelState.current.angleCurrent) % (2 * Math.PI);
      if (normalizedAngle < 0) normalizedAngle += 2 * Math.PI;

      const segSize = (2 * Math.PI) / segments.length;
      const i = Math.floor(normalizedAngle / segSize) % segments.length;

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = primaryColor;
      ctx.font = ttCanvasFont("title", 40);
      wheelState.current.currentSegment = segments[i];

      if (isStarted) {
        ctx.fillText(
          wheelState.current.currentSegment.toString(),
          centerX * 16 + 10,
          centerY * 16 + size * 16 + 50,
        );
      }
    };

    const clear = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, 62.5 * 16, 50 * 16);
    };

    useEffect(() => {
      initCanvas();
      wheelDraw();
      // Draw again once the brand face is in: a canvas keeps whatever face it drew with.
      let alive = true;
      void loadGameFonts().then(() => {
        if (alive && wheelState.current.timerHandle === 0) wheelDraw();
      });
      return () => {
        alive = false;
      };
    }, []);

    const spin = () => {
      if (wheelState.current.timerHandle !== 0) return;
      if (isFinished && isOnlyOnce) return;

      setFinished(false);
      setIsStarted(true);
      const now = new Date().getTime();
      wheelState.current.spinStart = now;
      wheelState.current.lastTickTime = now;
      wheelState.current.frames = 0;
      wheelState.current.decStart = 0;
      wheelState.current.startDecAngle = 0;
      wheelState.current.timerHandle = window.setInterval(
        onTimerTick,
        timerDelay,
      );
    };

    useImperativeHandle(ref, () => ({
      spin,
    }));

    return (
      <div className="flex items-center justify-center w-full">
        <div
          id="wheel"
          className="relative"
          style={{
            width: `${62.5 * scale}rem`,
            height: `${50 * scale}rem`,
            transition: "width 0.3s ease-in-out, height 0.3s ease-in-out",
          }}
        >
          <div
            className="relative"
            style={{
              width: "62.5rem",
              height: "50rem",
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            <canvas
              ref={canvasRef}
              id="canvas"
              width={62.5 * 16}
              height={50 * 16}
              className="absolute top-0 left-0 w-full h-full"
              style={{
                pointerEvents: isFinished && isOnlyOnce ? "none" : "auto",
                cursor: isFinished && isOnlyOnce ? "default" : "pointer",
              }}
            />
            <img
              src={cdnFile("roulette/roulette-outbound.webp")}
              alt="Roulette border"
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
              style={{
                objectFit: "contain",
              }}
            />
          </div>
        </div>
      </div>
    );
  },
);

WheelComponent.displayName = "WheelComponent";

export default WheelComponent;
