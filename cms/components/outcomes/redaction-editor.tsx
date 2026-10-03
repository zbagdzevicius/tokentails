'use client';

import { normalizeRegion } from '@/api/outcomes-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IRedactionRegion } from '@/models/outcome';
import { useEffect, useId, useRef, useState } from 'react';

export interface RedactionEditorProps {
  /** Uploads the photo with the boxes; the server strips metadata and pixelates them. */
  onSave: (file: File, regions: IRedactionRegion[]) => Promise<boolean>;
  disabled?: boolean;
}

/**
 * Draw boxes over anything that must not be public (faces, documents, addresses, plates) and send the
 * photo. The original never leaves this browser except to the backend's redaction step; the public
 * site only ever gets the processed copy, and only after a second reviewer approves it.
 */
export function RedactionEditor({ onSave, disabled }: RedactionEditorProps) {
  const uid = useId();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [regions, setRegions] = useState<IRedactionRegion[]>([]);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [current, setCurrent] = useState<IRedactionRegion | null>(null);
  const [busy, setBusy] = useState(false);
  // Keyboard alternative to dragging: a box in percent of the photo's width and height.
  const [typed, setTyped] = useState({ x: '', y: '', w: '', h: '' });
  const area = useRef<HTMLDivElement>(null);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview]
  );

  const point = (event: React.PointerEvent) => {
    const rect = area.current!.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height
    };
  };

  const pick = (next: File | null) => {
    setFile(next);
    setRegions([]);
    setPreview(next ? URL.createObjectURL(next) : null);
  };

  const typedBox = (): IRedactionRegion | null => {
    const n = (v: string) => Number(v) / 100;
    if (Object.values(typed).some((v) => v.trim() === '' || !Number.isFinite(Number(v)))) {
      return null;
    }
    return normalizeRegion(
      { x: n(typed.x), y: n(typed.y) },
      { x: n(typed.x) + n(typed.w), y: n(typed.y) + n(typed.h) }
    );
  };

  const addTyped = () => {
    const box = typedBox();
    if (!box) return;
    setRegions((list) => [...list, box]);
    setTyped({ x: '', y: '', w: '', h: '' });
  };

  const save = async () => {
    if (!file || busy) return;
    setBusy(true);
    const ok = await onSave(file, regions);
    setBusy(false);
    if (ok) pick(null);
  };

  return (
    <div className="grid gap-3">
      <label htmlFor={`${uid}-file`} className="text-sm font-bold">
        Photo (JPEG, PNG or WebP, up to 10 MB)
      </label>
      <input
        id={`${uid}-file`}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="text-sm"
        disabled={disabled}
        onChange={(e) => pick(e.target.files?.[0] || null)}
      />
      {preview && (
        <>
          <p className="text-sm text-muted-foreground" id={`${uid}-help`}>
            Drag over each face, document, address, house number or plate. Those
            areas are pixelated on the server, and every photo loses its
            location and camera data.
          </p>
          <div
            ref={area}
            className="relative w-full max-w-xl touch-none select-none overflow-hidden rounded-md border"
            aria-describedby={`${uid}-help`}
            data-testid="redaction-area"
            onDragStart={(e) => e.preventDefault()}
            onPointerCancel={() => {
              setDrag(null);
              setCurrent(null);
            }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture?.(e.pointerId);
              setDrag(point(e));
            }}
            onPointerMove={(e) =>
              drag && setCurrent(normalizeRegion(drag, point(e)))
            }
            onPointerUp={(e) => {
              if (drag) {
                const box = normalizeRegion(drag, point(e));
                if (box) setRegions((list) => [...list, box]);
              }
              setDrag(null);
              setCurrent(null);
            }}
          >
            <img
              src={preview}
              alt="Photo to redact"
              className="pointer-events-none block w-full"
              draggable={false}
            />
            {[...regions, ...(current ? [current] : [])].map((r, i) => (
              <span
                key={i}
                aria-hidden
                className="absolute border-2 border-rose-500 bg-black/70"
                style={{
                  left: `${r.x * 100}%`,
                  top: `${r.y * 100}%`,
                  width: `${r.w * 100}%`,
                  height: `${r.h * 100}%`
                }}
              />
            ))}
          </div>
          <fieldset className="grid gap-2" aria-describedby={`${uid}-keys`}>
            <legend className="text-sm font-bold">Add a box without a pointer</legend>
            <p className="text-sm text-muted-foreground" id={`${uid}-keys`}>
              In percent of the photo: left edge, top edge, width and height (0 to 100).
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  ['x', 'Left %'],
                  ['y', 'Top %'],
                  ['w', 'Width %'],
                  ['h', 'Height %']
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="grid gap-1 text-sm" htmlFor={`${uid}-${key}`}>
                  {label}
                  <Input
                    id={`${uid}-${key}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step="any"
                    value={typed[key]}
                    disabled={disabled}
                    onChange={(e) => setTyped((t) => ({ ...t, [key]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTyped();
                      }
                    }}
                  />
                </label>
              ))}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-auto justify-self-start text-sm"
              disabled={disabled || !typedBox()}
              onClick={addTyped}
            >
              Add box
            </Button>
          </fieldset>
          {regions.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Boxes to pixelate">
              {regions.map((_, i) => (
                <li key={i}>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-auto text-sm"
                    onClick={() =>
                      setRegions((list) => list.filter((__, j) => j !== i))
                    }
                  >
                    Remove box {i + 1}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Button
            className="sm:w-auto sm:justify-self-start"
            disabled={busy || disabled}
            onClick={save}
          >
            {busy
              ? 'Processing…'
              : `Process photo${regions.length ? ` (${regions.length} box${regions.length === 1 ? '' : 'es'})` : ''}`}
          </Button>
        </>
      )}
    </div>
  );
}
