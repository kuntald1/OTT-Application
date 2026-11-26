import React, { useMemo, useState } from "react";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { COLORS } from "../theme";
import { useApp } from "../context/AppContext";
import SearchBox from "../shared/SearchBox";

// Every room, behind the Community page's "View all". Creating one is
// deliberately not possible here (client's call, Nov 2026) — rooms are
// opened from the admin panel for now, so members join rather than
// start them. The button and its dialog are gone rather than disabled:
// a control that does nothing reads as broken, not as unavailable.
export default function CommunityRoomsPage({ onBack, onOpenRoom }) {
  const { rooms } = useApp();
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      needle
        ? rooms.filter((r) =>
            [r.title, r.createdBy].some((f) => (f || "").toLowerCase().includes(needle))
          )
        : rooms,
    [rooms, needle]
  );

  return (
    <div style={{ background: COLORS.black, fontFamily: "'Geist', -apple-system, sans-serif", minHeight: "100vh" }}>
      <main className="mx-auto max-w-3xl px-6 pb-16 pt-24 sm:px-10 sm:pt-28">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 flex items-center gap-1.5 text-sm font-medium hover:opacity-80"
          style={{ color: COLORS.gold }}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="mb-6">
          <h1 className="text-3xl font-semibold" style={{ color: COLORS.cream }}>Community Rooms</h1>
          <p className="mt-1 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>
            {needle ? `${filtered.length} of ${rooms.length} rooms` : `${rooms.length} rooms`}
          </p>
        </div>

        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Search rooms"
          className="mb-8 max-w-md"
        />

        <div className="flex flex-col gap-3">
          {filtered.length === 0 && (
            <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
              {needle ? `No room matches "${query.trim()}".` : "No rooms yet."}
            </p>
          )}
          {filtered.map((room) => (
            <div
              key={room.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5"
              style={{ background: COLORS.blackSoft, border: "1px solid rgba(212,175,55,0.15)" }}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(212,175,55,0.12)" }}>
                  <MessageCircle className="h-5 w-5" style={{ color: COLORS.gold }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: COLORS.cream }}>{room.title}</p>
                  <p className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
                    Started by {room.createdBy}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenRoom(room.id)}
                className="flex-shrink-0 rounded-full px-5 py-2 text-sm font-medium"
                style={{ border: `1px solid ${COLORS.gold}`, color: COLORS.gold }}
              >
                Join the conversation
              </button>
            </div>
          ))}
        </div>
      </main>

    </div>
  );
}

