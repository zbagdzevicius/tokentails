'use client';

import { request } from '@/api/api';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

/*
 * Bad Cat Daily moderation (bad-cat/README.md "Known gaps": cameo faces, creator codes and the room feed had
 * backend routes but no CMS screen). Every call is an admin route (AppAuthGuard + PermissionGuard(ADMIN), role 5)
 * under /badcat/admin/*, sent with the lowercase `accesstoken` header by `request`. A failed call (not an admin, or
 * the backend unreachable) returns null, which this page shows as "Nothing to show".
 */

export interface IBadcatFace {
  id: string;
  catCode: string;
  cameoId: string;
  createdAt: string;
  dataUrl: string;
}

export interface IBadcatRoom {
  id: string;
  /** Room codec payload: opens the room in the game. */
  code: string;
  title: string;
  author: string;
  shell: number;
  props: number;
  plays: number;
  reports: number;
  feed: boolean;
  status: string;
  createdAt: string;
}

export interface IBadcatCreatorCode {
  code: string;
  email: string;
  status: string;
}

export interface IBadcatCreatorReport {
  code: string;
  buyers: number;
  grossCents: number;
  netCents: number;
  shareCents: number;
  payable: boolean;
}

export const ROOM_STATUSES = ['pending', 'approved', 'hidden', 'rejected'] as const;

export const badcatAdmin = {
  faces: async () => (await request<{ items: IBadcatFace[] }>('/badcat/admin/faces', 'GET'))?.items ?? null,
  reviewFace: (id: string, decision: 'approve' | 'reject') =>
    request<{ ok: boolean }>(`/badcat/admin/faces/${encodeURIComponent(id)}/${decision}`, 'POST', {}),
  rooms: async (status: string) =>
    (await request<{ items: IBadcatRoom[] }>(`/badcat/admin/rooms?status=${encodeURIComponent(status)}`, 'GET'))?.items ?? null,
  reviewRoom: (id: string, decision: 'approve' | 'reject' | 'hide') =>
    request<{ ok: boolean }>(`/badcat/admin/rooms/${encodeURIComponent(id)}/${decision}`, 'POST', {}),
  creatorCodes: async () => (await request<{ items: IBadcatCreatorCode[] }>('/badcat/admin/creator-codes', 'GET'))?.items ?? null,
  creatorReport: async () =>
    (await request<{ items: IBadcatCreatorReport[] }>('/badcat/admin/creator-codes/report', 'GET'))?.items ?? null,
  reviewCode: (code: string, decision: 'approve' | 'reject') =>
    request<{ ok: boolean }>(`/badcat/admin/creator-codes/${encodeURIComponent(code)}/${decision}`, 'POST', {}),
};

export const dollars = (cents: number) => `$${((Number(cents) || 0) / 100).toFixed(2)}`;

function Off() {
  return <p role="status">Nothing to show. This account is not an admin (role 5), or the backend could not be reached.</p>;
}

export function FacesTable({ items, onReview }: { items: IBadcatFace[] | null; onReview(id: string, d: 'approve' | 'reject'): void }) {
  if (!items) return <Off />;
  if (!items.length) return <p role="status">No faces waiting.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Face</TableHead>
          <TableHead>Cat code</TableHead>
          <TableHead>Sent</TableHead>
          <TableHead>Decision</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((face) => (
          <TableRow key={face.id}>
            <TableCell>
              <img src={face.dataUrl} alt={`Face for ${face.catCode}`} width={64} height={64} />
            </TableCell>
            <TableCell>{face.catCode}</TableCell>
            <TableCell>{new Date(face.createdAt).toLocaleString()}</TableCell>
            <TableCell className="flex gap-2">
              <Button size="sm" onClick={() => onReview(face.id, 'approve')}>
                Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => onReview(face.id, 'reject')}>
                Reject
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function RoomsTable({
  items,
  onReview,
}: {
  items: IBadcatRoom[] | null;
  onReview(id: string, d: 'approve' | 'reject' | 'hide'): void;
}) {
  if (!items) return <Off />;
  if (!items.length) return <p role="status">No rooms here.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Room</TableHead>
          <TableHead>Author</TableHead>
          <TableHead>Props</TableHead>
          <TableHead>Plays</TableHead>
          <TableHead>Reports</TableHead>
          <TableHead>Feed</TableHead>
          <TableHead>Decision</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((room) => (
          <TableRow key={room.id}>
            <TableCell>
              <a href={`https://tokentails.com/badcat/r?r=${encodeURIComponent(room.code)}`} target="_blank" rel="noreferrer">
                {room.title}
              </a>
            </TableCell>
            <TableCell>{room.author || '–'}</TableCell>
            <TableCell>{room.props}</TableCell>
            <TableCell>{room.plays}</TableCell>
            <TableCell className={room.reports > 0 ? 'font-bold text-destructive' : undefined}>{room.reports}</TableCell>
            <TableCell>{room.feed ? 'asked' : 'link only'}</TableCell>
            <TableCell className="flex gap-2">
              {room.status !== 'approved' && (
                <Button size="sm" onClick={() => onReview(room.id, 'approve')}>
                  Approve
                </Button>
              )}
              {room.status !== 'hidden' && (
                <Button size="sm" variant="outline" onClick={() => onReview(room.id, 'hide')}>
                  Hide
                </Button>
              )}
              {room.status !== 'rejected' && (
                <Button size="sm" variant="outline" onClick={() => onReview(room.id, 'reject')}>
                  Reject
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function CreatorTable({
  codes,
  report,
  onReview,
}: {
  codes: IBadcatCreatorCode[] | null;
  report: IBadcatCreatorReport[] | null;
  onReview(code: string, d: 'approve' | 'reject'): void;
}) {
  if (!codes) return <Off />;
  if (!codes.length) return <p role="status">No creator codes yet.</p>;
  const byCode = new Map((report ?? []).map((r) => [r.code, r]));
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Buyers</TableHead>
          <TableHead>Gross</TableHead>
          <TableHead>Share (20 % of net)</TableHead>
          <TableHead>Decision</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {codes.map((code) => {
          const r = byCode.get(code.code);
          return (
            <TableRow key={code.code}>
              <TableCell>{code.code}</TableCell>
              <TableCell>{code.email}</TableCell>
              <TableCell>{code.status}</TableCell>
              <TableCell>{r?.buyers ?? 0}</TableCell>
              <TableCell>{dollars(r?.grossCents ?? 0)}</TableCell>
              <TableCell className={r?.payable ? 'font-bold' : undefined}>
                {dollars(r?.shareCents ?? 0)}
                {r?.payable ? ' (payable)' : ''}
              </TableCell>
              <TableCell className="flex gap-2">
                {code.status === 'pending' && (
                  <>
                    <Button size="sm" onClick={() => onReview(code.code, 'approve')}>
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onReview(code.code, 'reject')}>
                      Reject
                    </Button>
                  </>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export default function BadcatAdminPage() {
  const client = useQueryClient();
  const [roomStatus, setRoomStatus] = useState<string>('pending');
  const faces = useQuery({ queryKey: ['badcat-faces'], queryFn: badcatAdmin.faces });
  const rooms = useQuery({ queryKey: ['badcat-rooms', roomStatus], queryFn: () => badcatAdmin.rooms(roomStatus) });
  const codes = useQuery({ queryKey: ['badcat-codes'], queryFn: badcatAdmin.creatorCodes });
  const report = useQuery({ queryKey: ['badcat-report'], queryFn: badcatAdmin.creatorReport });
  const refresh = (key: string) => void client.invalidateQueries({ queryKey: [key] });

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold">Bad Cat Daily</h1>
        <p className="text-sm text-muted-foreground">
          Cameo faces wait here until approved. Player rooms sent to the feed passed the server&apos;s Room Maker
          checks and a replay of the maker&apos;s clear run; approve the ones that are fine to show to everyone.
          Creator codes earn 20 % of net for each buyer&apos;s first 6 months; payouts are manual from $25.
        </p>
      </div>

      <section className="grid gap-2">
        <h2 className="text-xl font-semibold">Cameo faces</h2>
        {faces.isLoading ? (
          <p role="status">Loading…</p>
        ) : (
          <FacesTable
            items={faces.data ?? null}
            onReview={(id, d) => void badcatAdmin.reviewFace(id, d).then(() => refresh('badcat-faces'))}
          />
        )}
      </section>

      <section className="grid gap-2">
        <h2 className="text-xl font-semibold">Room feed</h2>
        <div className="flex gap-2" role="group" aria-label="Room status">
          {ROOM_STATUSES.map((s) => (
            <Button key={s} size="sm" variant={s === roomStatus ? 'default' : 'outline'} onClick={() => setRoomStatus(s)}>
              {s}
            </Button>
          ))}
        </div>
        {rooms.isLoading ? (
          <p role="status">Loading…</p>
        ) : (
          <RoomsTable
            items={rooms.data ?? null}
            onReview={(id, d) => void badcatAdmin.reviewRoom(id, d).then(() => refresh('badcat-rooms'))}
          />
        )}
      </section>

      <section className="grid gap-2">
        <h2 className="text-xl font-semibold">Creator codes</h2>
        {codes.isLoading ? (
          <p role="status">Loading…</p>
        ) : (
          <CreatorTable
            codes={codes.data ?? null}
            report={report.data ?? null}
            onReview={(code, d) =>
              void badcatAdmin.reviewCode(code, d).then(() => {
                refresh('badcat-codes');
                refresh('badcat-report');
              })
            }
          />
        )}
      </section>
    </div>
  );
}
