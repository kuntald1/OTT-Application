import React, { useEffect, useMemo, useState } from "react";
import { MessageCircle, HandCoins, Users, PenLine } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR, NAV_CLEARANCE_CLASS } from "../theme";
import { fetchBlogs } from "../api";
import SearchBox from "../shared/SearchBox";
import { useApp } from "../context/AppContext";
import PageHero from "../shared/PageHero";

const COMMUNITY_THEME = {
  fallbackBg: COLORS.black,
  scrim: "linear-gradient(180deg, rgba(61,0,13,0.35) 0%, rgba(61,0,13,0.15) 35%, rgba(61,0,13,0.85) 100%)",
  glow: `radial-gradient(ellipse at 15% 100%, ${COLORS.burgundy}55 0%, transparent 45%), radial-gradient(ellipse at 100% 0%, ${COLORS.burgundy}40 0%, transparent 40%)`,
  vignette: `radial-gradient(circle, transparent 40%, ${COLORS.black} 100%)`,
};

// ---------------------------------------------------------------------------
// Community — a standalone page, reached via the "Community" nav link.
// Hero, then Blog and Community Room side by side (two columns on larger
// screens, stacked on mobile), then Donation.
//
// The page itself is always viewable without a subscription — browsing,
// reading blog posts, and seeing what rooms exist all work. Only the
// INTERACTIVE actions (Join a room, Create Room, Donate) are gated: logged
// in first, then require an active subscription, same pattern as content
// playback elsewhere in the site.
// ---------------------------------------------------------------------------

export default function CommunityPage({ onNavigate }) {
  const { rooms, isLoggedIn, isSubscribed, requestLogin } = useApp();
  const [blogPosts, setBlogPosts] = useState([]);
  useEffect(() => {
    fetchBlogs().then(setBlogPosts).catch(() => setBlogPosts([]));
  }, []);

  // A search box per column. Each narrows only its own list, and the
  // same box appears again at the top of the full-list page that
  // column's "View all" opens — see shared/SearchBox.jsx.
  const [blogQuery, setBlogQuery] = useState("");
  const [roomQuery, setRoomQuery] = useState("");

  // Searching the summary and the author as well as the title, because
  // "that piece by Sujoy" is how people actually look for a post.
  const matches = (fields, query) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return fields.some((f) => (f || "").toLowerCase().includes(needle));
  };
  const filteredPosts = useMemo(
    () => blogPosts.filter((p) => matches([p.title, p.excerpt, p.author_name], blogQuery)),
    [blogPosts, blogQuery]
  );
  const filteredRooms = useMemo(
    () => rooms.filter((r) => matches([r.title, r.createdBy], roomQuery)),
    [rooms, roomQuery]
  );

  const previewPosts = filteredPosts.slice(0, 3);
  const previewRooms = filteredRooms.slice(0, 3);

  const formatDate = (iso) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  const requireSubscription = (fn) => (...args) => {
    if (!isLoggedIn) {
      requestLogin();
      return;
    }
    if (!isSubscribed) {
      onNavigate?.("subscription");
      return;
    }
    fn(...args);
  };

  const handleViewAllBlog = requireSubscription(() => onNavigate?.("blogList"));
  // Writing needs an account but NOT a subscription — a reader who
  // wants to contribute shouldn't have to buy a plan to be allowed to,
  // which is why this isn't wrapped in requireSubscription like the
  // reading actions around it. The editor itself lives on the Blog
  // page, so this opens that and lets them write there.
  const handleWriteBlog = () => {
    if (!isLoggedIn) {
      requestLogin();
      return;
    }
    onNavigate?.("blogList", { startWriting: true });
  };
  const handleReadMore = requireSubscription((postId) => onNavigate?.("blogDetail", { postId }));
  const handleViewAllRooms = requireSubscription(() => onNavigate?.("communityRooms"));
  const handleJoinRoom = requireSubscription((roomId) => onNavigate?.("communityRoom", { roomId }));
  const handleDonate = requireSubscription(() => onNavigate?.("donation"));

  return (
    <div style={{ background: COLORS.black, fontFamily: "'Geist', -apple-system, sans-serif", minHeight: "100vh" }}>
      {/* ---------------- Hero ---------------- */}
      <PageHero pageKey="community" theme={COMMUNITY_THEME} />

      {/* ---------------- Blog + Community Room, side by side ---------------- */}
      <section className={`px-6 py-12 sm:px-10 ${NAV_CLEARANCE_CLASS}`}>
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-8">
          {/* Blog column */}
          <div>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-2xl font-semibold" style={{ color: COLORS.cream }}>
                <span className="h-5 w-1 rounded-full" style={{ background: `linear-gradient(180deg, ${COLORS.gold}, ${COLORS.burgundyLight}, ${COLORS.burgundyDark})` }} />
                Blog
              </h2>
              <button type="button" onClick={handleViewAllBlog} className="text-sm font-medium hover:opacity-80" style={{ color: COLORS.gold }}>
                View all →
              </button>
            </div>
            <SearchBox
              value={blogQuery}
              onChange={setBlogQuery}
              placeholder="Search posts"
              className="mb-4"
            />
            <div className="flex flex-col gap-4">
              {previewPosts.length === 0 && (
                <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
                  {blogQuery.trim() ? "No post matches that." : "No posts yet."}
                </p>
              )}
              {previewPosts.map((post) => (
                <article
                  key={post.id}
                  className="rounded-2xl p-5 transition-transform duration-300 hover:-translate-y-1"
                  style={{ background: COLORS.blackSoft, border: "1px solid rgba(212,175,55,0.15)" }}
                >
                  <p className="text-xs" style={{ color: "rgba(245,235,221,0.45)" }}>{formatDate(post.published_at)}</p>
                  <h3 className="mt-1.5 text-base font-semibold leading-snug" style={{ color: COLORS.cream }}>{post.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "rgba(245,235,221,0.65)" }}>{post.excerpt}</p>
                  <button
                    type="button"
                    onClick={() => handleReadMore(post.id)}
                    className="mt-3 text-sm font-medium hover:opacity-80"
                    style={{ color: COLORS.gold }}
                  >
                    Read more →
                  </button>
                </article>
              ))}

              {/* Under the posts, not above them: this column is for
                  reading, and the invitation to write belongs after
                  you've seen what the blog is. The Blog page behind
                  "View all" has the same button at the top, where
                  someone who went looking for it will be. */}
              <button
                type="button"
                onClick={handleWriteBlog}
                className="flex items-center justify-center gap-2 rounded-2xl p-4 transition-colors hover:bg-white/5"
                style={{ border: "1.5px dashed rgba(212,175,55,0.4)" }}
              >
                <PenLine className="h-4 w-4" style={{ color: COLORS.gold }} />
                <p className="text-sm font-semibold" style={{ color: COLORS.gold }}>Create Blog</p>
              </button>
            </div>
          </div>

          {/* Community Room column */}
          <div className="lg:border-l lg:pl-8" style={{ borderColor: "rgba(212,175,55,0.15)" }}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-2xl font-semibold" style={{ color: COLORS.cream }}>
                <span className="h-5 w-1 rounded-full" style={{ background: `linear-gradient(180deg, ${COLORS.gold}, ${COLORS.burgundyLight}, ${COLORS.burgundyDark})` }} />
                Community Room
              </h2>
              <button type="button" onClick={handleViewAllRooms} className="text-sm font-medium hover:opacity-80" style={{ color: COLORS.gold }}>
                View all →
              </button>
            </div>
            <p className="mb-5 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>
              Join a room to post and reply.
            </p>

            <SearchBox
              value={roomQuery}
              onChange={setRoomQuery}
              placeholder="Search rooms"
              className="mb-4"
            />
            <div className="flex flex-col gap-3">
              {previewRooms.length === 0 && (
                <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
                  {roomQuery.trim() ? "No room matches that." : "No rooms yet."}
                </p>
              )}
              {previewRooms.map((room) => (
                <div
                  key={room.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4"
                  style={{ background: COLORS.blackSoft, border: "1px solid rgba(212,175,55,0.15)" }}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(212,175,55,0.12)" }}>
                      <MessageCircle className="h-4 w-4" style={{ color: COLORS.gold }} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: COLORS.cream }}>{room.title}</p>
                      <p className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>Started by {room.createdBy}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleJoinRoom(room.id)}
                    className="flex-shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold"
                    style={{ border: `1px solid ${COLORS.gold}`, color: COLORS.gold }}
                  >
                    Join the conversation
                  </button>
                </div>
              ))}

              {/* Create Room is deliberately absent from the public site
                  (client's call, Nov 2026) — rooms are opened by the
                  admin panel for now, so members join rather than start
                  them. Removed rather than disabled: a dashed card that
                  does nothing reads as broken, not as unavailable. The
                  same card is gone from the View all page. */}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Donation ---------------- */}
      <section className="px-6 py-16 sm:px-10" style={{ background: COLORS.blackSoft }}>
        <div className="mx-auto flex max-w-3xl flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(212,175,55,0.12)" }}>
              <HandCoins className="h-5 w-5" style={{ color: COLORS.gold }} />
            </div>
            <div>
              <p className="text-lg font-semibold" style={{ color: COLORS.cream }}>Support a Plays Organiser</p>
              <p className="mt-1 max-w-md text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>
                Donate directly to organisers running independent theatre programs.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDonate}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-full px-6 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
          >
            <Users className="h-4 w-4" /> View Organisers
          </button>
        </div>
      </section>

      {/* ---------------- Footer ---------------- */}
      <footer className="px-6 py-12 sm:px-10" style={{ borderTop: "1px solid rgba(212,175,55,0.12)" }}>
        <p className="text-sm font-semibold" style={{ color: COLORS.cream }}>theomy Community</p>
        <p className="mt-1 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
          Posts, photos, and discussions shown here are demo content — no real accounts or posts exist yet.
        </p>
      </footer>
    </div>
  );
}
