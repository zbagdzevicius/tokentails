import * as React from "react";

export enum JoystickShape {
  Circle = "circle",
  Square = "square",
  AxisY = "axisY",
  AxisX = "axisX",
}

export const shapeBoundsFactory = (
  absoluteX: number,
  relativeX: number,
  baseSize: number,
  parentRect: DOMRect
) => {
  relativeX = getWithinBounds(
    absoluteX - parentRect.left - baseSize * 1.25,
    baseSize
  );
  return relativeX;
};

const getWithinBounds = (value: number, baseSize: number): number => {
  const halfBaseSize = baseSize;
  if (value > halfBaseSize) {
    return halfBaseSize;
  }
  if (value < -halfBaseSize) {
    return halfBaseSize * -1;
  }
  return value;
};

export interface IJoystickProps {
  size?: number;
  stickSize?: number;
  baseColor?: string;
  stickColor?: string;
  throttle?: number;
  disabled?: boolean;
  sticky?: boolean;
  move?: (event: IJoystickUpdateEvent) => void;
  stop?: (event: IJoystickUpdateEvent) => void;
  start?: (event: IJoystickUpdateEvent) => void;
  stickImage?: string;
  baseImage?: string;
  followCursor?: boolean;
  baseShape?: JoystickShape;
  stickShape?: JoystickShape;
  controlPlaneShape?: JoystickShape;
  minDistance?: number;
  pos?: { x: number; y: number };
}

enum InteractionEvents {
  PointerDown = "pointerdown",
  PointerMove = "pointermove",
  PointerUp = "pointerup",
}

export interface IJoystickUpdateEvent {
  type: "move" | "stop" | "start";
  // TODO: these could just be optional, but this may be a breaking change
  x: number | null;
  direction: JoystickDirection | null;
}

export interface IJoystickState {
  dragging: boolean;
  coordinates?: IJoystickCoordinates;
}

export type JoystickDirection = "DISABLED" | "RIGHT" | "LEFT";

export interface IJoystickCoordinates {
  relativeX: number;
  axisX: number;
  direction: JoystickDirection;
}

class Joystick extends React.Component<IJoystickProps, IJoystickState> {
  private readonly _stickRef: React.RefObject<HTMLButtonElement> =
    React.createRef();
  private readonly _baseRef: React.RefObject<HTMLDivElement> =
    React.createRef();
  private _baseSize: number = 90;
  private frameId: number | null = null;

  private _parentRect!: DOMRect;
  private _pointerId: number | null = null;
  private _mounted = false;

  constructor(props: IJoystickProps) {
    super(props);
    this.state = {
      dragging: false,
    };
  }

  componentWillUnmount() {
    this._mounted = false;
    if (this.props.followCursor) {
      window.removeEventListener(InteractionEvents.PointerMove, (event) =>
        this._pointerMove(event)
      );
    }
    if (this.frameId !== null) {
      window.cancelAnimationFrame(this.frameId);
    }
  }

  componentDidMount() {
    this._mounted = true;
    if (this.props.followCursor) {
      //@ts-ignore
      this._parentRect = this._baseRef.current.getBoundingClientRect();

      this.setState({
        dragging: true,
      });

      window.addEventListener(InteractionEvents.PointerMove, (event) =>
        this._pointerMove(event)
      );
    }
  }

  /**
   * Update position of joystick - set state and trigger DOM manipulation
   * @param coordinates
   * @private
   */
  private _updatePos(coordinates: IJoystickCoordinates) {
    this.frameId = window.requestAnimationFrame(() => {
      if (this._mounted) {
        this.setState({
          coordinates,
        });
      }
    });
  }

  /**
   * Handle pointerdown event
   * @param e PointerEvent
   * @private
   */
  private _pointerDown(e: PointerEvent) {
    //@ts-ignore
    this._parentRect = this._baseRef.current.getBoundingClientRect();

    this.setState({
      dragging: true,
    });

    window.addEventListener(InteractionEvents.PointerUp, this._pointerUp);
    window.addEventListener(InteractionEvents.PointerMove, this._pointerMove);
    this._pointerId = e.pointerId;
    //@ts-ignore
    this._stickRef.current.setPointerCapture(e.pointerId);

    this.updatePosition(e);
  }

  /**
   * Use ArcTan2 (4 Quadrant inverse tangent) to identify the direction the joystick is pointing
   * https://docs.oracle.com/cd/B12037_01/olap.101/b10339/x_arcsin003.htm
   * @param atan2: number
   * @private
   */
  private _getDirection(relativeX: number): JoystickDirection {
    // CREATE FALLBACK SO IT WON'T MOVE
    if (relativeX > 0) {
      return "RIGHT";
    }

    return "LEFT";
  }

  private updatePosition(event: PointerEvent) {
    const absoluteX = event.clientX;
    let relativeX = absoluteX - this._parentRect.left - this._baseSize * 1.25;
    const direction = this._getDirection(relativeX);

    relativeX = shapeBoundsFactory(
      absoluteX,
      relativeX,
      this._baseSize,
      this._parentRect
    );

    const joystickUpdate = new CustomEvent("joystick-direction", {
      detail: { direction },
    });
    window.dispatchEvent(joystickUpdate);
    this._updatePos({
      relativeX: relativeX,
      direction,
      axisX: absoluteX - this._parentRect.left,
    });
  }
  /**
   * Calculate X/Y and ArcTan within the bounds of the joystick
   * @param event
   * @private
   */
  private _pointerMove = (event: PointerEvent) => {
    event.preventDefault();
    if (this.state.dragging) {
      if (!this.props.followCursor && event.pointerId !== this._pointerId)
        return;

      this.updatePosition(event);
    }
  };

  /**
   * Handle pointer up and de-register listen events
   * @private
   */
  private _pointerUp = (event: PointerEvent) => {
    if (event.pointerId !== this._pointerId) return;
    const stateUpdate = {
      dragging: false,
    } as any;

    const joystickUpdate = new CustomEvent("joystick-direction", {
      detail: { direction: InteractionEvents.PointerDown },
    });
    window.dispatchEvent(joystickUpdate);
    stateUpdate.coordinates = undefined;
    this.frameId = window.requestAnimationFrame(() => {
      if (this._mounted) {
        this.setState(stateUpdate);
      }
    });

    window.removeEventListener(InteractionEvents.PointerUp, this._pointerUp);
    window.removeEventListener(
      InteractionEvents.PointerMove,
      this._pointerMove
    );
    this._pointerId = null;
    if (this.props.stop) {
      this.props.stop({
        type: "stop",
        // @ts-ignore
        x: null,
        // @ts-ignore
        direction: null,
      });
    }
  };
  /**
   * Calculate base styles for pad
   * @private
   */
  private _getBaseStyle(): any {
    const padStyle = {
      borderRadius: "24px",
      height: `${this._baseSize}px`,
      width: `${this._baseSize * 2.5}px`,
      background: "#FCECBB",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
    } as any;
    if (this.props.baseImage) {
      padStyle.background = `url(${this.props.baseImage})`;
      padStyle.backgroundSize = "100%";
    }
    return padStyle;
  }

  /**
   * Calculate  base styles for joystick and translate
   * @private
   */
  private _getStickStyle(): any {
    let stickStyle = {
      cursor: "move",
      height: "100%",
      width: "100%",
      border: "none",
      flexShrink: 0,
      touchAction: "none",
    } as any;

    if (this.state.coordinates !== undefined) {
      stickStyle = Object.assign({}, stickStyle, {
        position: "absolute",
        transform: `translate3d(${this.state.coordinates.relativeX}px, 0px, 0)`,
      });
    }
    return stickStyle;
  }

  render() {
    const baseStyle = this._getBaseStyle();
    const stickStyle = this._getStickStyle();
    return (
      <div
        data-testid="joystick-base"
        className="z-[100] ml-2 mb-4 relative"
        ref={this._baseRef}
        style={baseStyle}
      >
        <div className="absolute right-4 z-0 opacity-50">
          <img src="icons/arrow.webp" className="w-12" />
        </div>
        <div className="absolute left-4 z-0  opacity-50 rotate-180">
          <img src="icons/arrow.webp" className="w-12" />
        </div>
        <button
          ref={this._stickRef}
          disabled={this.props.disabled}
          onPointerDown={(event: any) => this._pointerDown(event)}
          className="z-10 outline-none"
          style={stickStyle}
        >
          <div className="flex w-full justify-center">
            <img className="w-12" draggable="false" src="logo/paw.png" />
          </div>
        </button>
      </div>
    );
  }
}

export { Joystick };
