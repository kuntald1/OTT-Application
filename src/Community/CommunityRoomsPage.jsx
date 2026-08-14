import React, { useState } from "react";
import { ArrowLeft, MessageCircle, Plus } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "../theme";
import { useApp } from "../context/AppContext";

export default function CommunityRoomsPage({ onBack, onOpenRoom }) {
  const { rooms, createRoom, isLoggedIn, requestLogin, profile } = useApp();
  const [showCreate, setShowCreate] = useState(false);

  const handleCreateClick = () => {
    if (!isLoggedIn) {
      requestLogin();
      return;
    }
    setShowCreate(true);
  };

  const handleCreated = (roomId) => {
    setShowCreate(false);
    onOpenRoom(roomId);
  };

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

        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold" style={{ color: COLORS.cream }}>Community Rooms</h1>
            <p className="mt-1 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>{rooms.length} rooms</p>
          </div>
          <button
            type="button"
            onClick={handleCreateClick}
            className="flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
          >
            <Plus className="h-4 w-4" /> Create Room
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {rooms.map((room) => (
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
                    {room.posts.length} {room.posts.length === 1 ? "post" : "posts"} · Started by {room.createdBy}
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

      {showCreate && (
        <CreateRoomModal
          onClose={() => setShowCreate(false)}
          onCreate={(title) => handleCreated(createRoom(title, profile.name))}
        />
      )}
    </div>
  );
}

function CreateRoomModal({ onClose, onCreate }) {
  const [title, setTitle] = useState("");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl p-6"
        style={{ background: COLORS.blackSoft, border: `1px solid rgba(212,175,55,0.2)` }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-xl font-semibold" style={{ color: COLORS.cream }}>Create a room</h2>
        <input
          type="text"
          placeholder="Room title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border px-4 py-2.5 text-sm outline-none"
          style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
        />
        <div className="mt-4 flex items-center justify-between">
          <button onClick={onClose} className="text-xs hover:opacity-80" style={{ color: "rgba(245,235,221,0.5)" }}>Cancel</button>
          <button
            disabled={!title.trim()}
            onClick={() => onCreate(title.trim())}
            className="rounded-full px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
          >
            Create room
          </button>
        </div>
      </div>
    </div>
  );
}
