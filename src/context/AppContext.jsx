import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  getToken,
  setToken,
  registerUser,
  loginUser,
  fetchCurrentUser,
  updateCurrentUser,
  createTicket,
  fetchTickets,
  createSubscription,
  fetchMySubscription,
} from "../api";
// ---------------------------------------------------------------------------
// AppContext — the one place that owns:
//   - auth state (isLoggedIn / profile) + the shared login modal trigger
//   - My List (saved items) + add/remove/toggle
//   - Support tickets (Help Center) — persisted to the backend
//   - Subscription status — persisted to the backend (no payment gateway
//     yet, activation is immediate)
//
// Auth, profile edits, tickets, and subscriptions are all backed by the
// real theomy API (FastAPI + Postgres). My List, community rooms, and
// donations remain demo-only/in-memory, unchanged from before.
// ---------------------------------------------------------------------------
const AppContext = createContext(null);
function makeId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}
const SEED_ROOMS = [
  {
    id: "room-bengali-fans",
    title: "Bengali Theatre Fans",
    createdBy: "theomy Team",
    posts: [
      { id: "post-1", author: "theomy Team", text: "Welcome! Share what you've been watching this week.", image: null, likes: 4, replies: [] },
    ],
  },
  {
    id: "room-backstage-stories",
    title: "Backstage Stories",
    createdBy: "theomy Team",
    posts: [
      { id: "post-2", author: "theomy Team", text: "Post your best backstage moments — mishaps welcome.", image: null, likes: 7, replies: [] },
    ],
  },
  {
    id: "room-new-play-recs",
    title: "New Play Recommendations",
    createdBy: "theomy Team",
    posts: [
      { id: "post-3", author: "theomy Team", text: "What should be added to the Ticketing section next?", image: null, likes: 2, replies: [] },
    ],
  },
];

// Maps a backend UserOut object to the shape the rest of the app expects
// from `profile` (photo isn't part of the backend yet, so it stays local).
function toProfile(user, existingPhoto = null) {
  return {
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    role: user.role,
    photo: existingPhoto,
  };
}

function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Maps a backend TicketOut to the shape HelpCenterPage already expects
// (id, subject, description, status, date) so that page needs no changes.
function toTicketDisplay(ticket) {
  return {
    id: ticket.ticket_number,
    subject: ticket.subject,
    description: ticket.description || "",
    status: ticket.status,
    date: formatDate(ticket.created_at),
  };
}

export function AppProvider({ children }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [profile, setProfile] = useState({ name: "", email: "", photo: null, role: "User" });
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [authLoading, setAuthLoading] = useState(true); // true while we check for an existing session
  const [authError, setAuthError] = useState("");

  const [myList, setMyList] = useState([]); // [{ id, title, image, meta, section }]
  const [tickets, setTickets] = useState([]); // loaded from backend once logged in
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [activePlan, setActivePlan] = useState(null);
  const [activeDuration, setActiveDuration] = useState(null); // e.g. "1 Month", "6 Months", "1 Year"
  const [activeScreens, setActiveScreens] = useState(null);
  const [activePrice, setActivePrice] = useState(null);
  const [rewardPoints, setRewardPoints] = useState(250); // demo starting balance, 1 point = ₹1
  const [rooms, setRooms] = useState(SEED_ROOMS);
  const [donations, setDonations] = useState([]); // [{ id, organiserId, organiserName, amount, date }]

  // Pulls tickets + current subscription from the backend — called once
  // right after we know who's logged in (session restore, or right after
  // login/register/OAuth completes).
  const loadUserData = useCallback(async () => {
    try {
      const ticketList = await fetchTickets();
      setTickets(ticketList.map(toTicketDisplay));
    } catch {
      // Non-fatal — Help Center just shows no tickets if this fails
    }

    try {
      const sub = await fetchMySubscription();
      if (sub) {
        setIsSubscribed(true);
        setActivePlan(sub.plan_name);
        setActiveDuration(sub.duration_label);
        setActiveScreens(sub.screens);
        setActivePrice(Number(sub.price));
      } else {
        setIsSubscribed(false);
      }
    } catch {
      // Non-fatal — Subscription page just shows no active plan if this fails
    }
  }, []);

  // On first load: if there's a token in the URL (just arrived from a
  // Google/Facebook redirect), save it and clean the URL. Then, whichever
  // way we got a token (URL or a previous session in localStorage), verify
  // it against /auth/me and restore the session.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    if (urlToken) {
      setToken(urlToken);
      params.delete("token");
      const cleanUrl =
        window.location.pathname +
        (params.toString() ? `?${params.toString()}` : "") +
        window.location.hash;
      window.history.replaceState({}, "", cleanUrl);
    }

    const token = getToken();
    if (!token) {
      setAuthLoading(false);
      return;
    }

    fetchCurrentUser()
      .then((user) => {
        setProfile((p) => toProfile(user, p.photo));
        setIsLoggedIn(true);
        return loadUserData();
      })
      .catch(() => {
        // Token expired/invalid — clear it and let them log in again
        setToken(null);
      })
      .finally(() => setAuthLoading(false));
  }, [loadUserData]);

  // The whole site requires login. Whenever isLoggedIn is false — on first
  // load (once we've finished checking for an existing session), or right
  // after logging out — force the login modal open. It's non-dismissable in
  // this state (see LoginModal in TopNav.jsx), so there's no way to browse
  // without logging in first.
  useEffect(() => {
    if (!authLoading && !isLoggedIn) setShowLoginModal(true);
  }, [authLoading, isLoggedIn]);

  const requestLogin = useCallback(() => setShowLoginModal(true), []);
  const closeLoginModal = useCallback(() => setShowLoginModal(false), []);

  // Real email+password login against the backend. Throws on failure so
  // the modal can show the error inline; caller is responsible for catching.
  const login = useCallback(async (email, password) => {
    setAuthError("");
    const data = await loginUser({ email, password });
    setToken(data.access_token);
    setProfile((p) => toProfile(data.user, p.photo));
    setIsLoggedIn(true);
    setShowLoginModal(false);
    loadUserData();
  }, [loadUserData]);

  // Real registration against the backend. Phone is optional — pass "" or
  // undefined if not provided, the API treats both as "not given".
  const register = useCallback(async ({ name, email, password, phone, role }) => {
    setAuthError("");
    const data = await registerUser({ name, email, password, phone, role });
    setToken(data.access_token);
    setProfile((p) => toProfile(data.user, p.photo));
    setIsLoggedIn(true);
    setShowLoginModal(false);
    loadUserData();
  }, [loadUserData]);

  const logout = useCallback(() => {
    setToken(null);
    setIsLoggedIn(false);
    setProfile({ name: "", email: "", photo: null, role: "User" });
    setTickets([]);
    setIsSubscribed(false);
    setActivePlan(null);
    setActiveDuration(null);
    setActiveScreens(null);
    setActivePrice(null);
  }, []);

  // Persists the plan choice to the backend (no payment gateway yet — this
  // activates immediately). Throws on failure so the caller can surface it.
  const subscribe = useCallback(async (planName, durationLabel, screens, price) => {
    const sub = await createSubscription({ planName, durationLabel, screens, price });
    setIsSubscribed(true);
    setActivePlan(sub.plan_name);
    setActiveDuration(sub.duration_label);
    setActiveScreens(sub.screens);
    setActivePrice(Number(sub.price));
  }, []);

  // Rewards — 1 point = ₹1. Redeeming deducts the used points from the
  // balance; the caller is responsible for computing how many points to use
  // (typically min(balance, order total) so it never goes negative).
  // Still local-only — no rewards ledger on the backend yet.
  const redeemRewardPoints = useCallback((amount) => {
    setRewardPoints((p) => Math.max(0, p - amount));
  }, []);

  const changePhoto = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setProfile((p) => ({ ...p, photo: reader.result }));
    reader.readAsDataURL(file);
  }, []);

  // Manage Profile page uses this to save name/email/phone to the backend.
  // Throws on failure (e.g. email already taken) so the page can show the
  // error inline.
  const updateProfile = useCallback(async (updates) => {
    const user = await updateCurrentUser({
      name: updates.name,
      email: updates.email,
      phone: updates.phone,
    });
    setProfile((p) => toProfile(user, p.photo));
  }, []);

  const isInList = useCallback((id) => myList.some((item) => item.id === id), [myList]);

  // Requires login first — callers should already have checked isLoggedIn
  // and called requestLogin() if not, but this guards regardless.
  const toggleListItem = useCallback((item) => {
    setMyList((list) => {
      const exists = list.some((i) => i.id === item.id);
      return exists ? list.filter((i) => i.id !== item.id) : [...list, item];
    });
  }, []);

  const removeFromList = useCallback((id) => {
    setMyList((list) => list.filter((i) => i.id !== id));
  }, []);

  // Help Center — persists the complaint as a real ticket on the backend.
  // Throws on failure so the page can show an error; on success, prepends
  // the new ticket (mapped to the display shape) to the local list.
  const addTicket = useCallback(async (subject, description) => {
    const ticket = await createTicket({ subject, description });
    const display = toTicketDisplay(ticket);
    setTickets((list) => [display, ...list]);
    return display;
  }, []);

  // Community Rooms — demo-only, in-memory. createRoom returns the new
  // room's id so the caller can navigate straight into it.
  const createRoom = useCallback((title, creatorName) => {
    const room = { id: makeId("room"), title, createdBy: creatorName || "You", posts: [] };
    setRooms((list) => [room, ...list]);
    return room.id;
  }, []);

  const addPostToRoom = useCallback((roomId, { text, image, video, author }) => {
    setRooms((list) =>
      list.map((r) =>
        r.id === roomId
          ? { ...r, posts: [{ id: makeId("post"), author: author || "You", text, image, video, likes: 0, replies: [] }, ...r.posts] }
          : r
      )
    );
  }, []);

  const toggleLikePost = useCallback((roomId, postId) => {
    setRooms((list) =>
      list.map((r) =>
        r.id !== roomId
          ? r
          : { ...r, posts: r.posts.map((p) => (p.id === postId ? { ...p, likes: p.likes + (p._liked ? -1 : 1), _liked: !p._liked } : p)) }
      )
    );
  }, []);

  const addReplyToPost = useCallback((roomId, postId, text, author) => {
    setRooms((list) =>
      list.map((r) =>
        r.id !== roomId
          ? r
          : { ...r, posts: r.posts.map((p) => (p.id === postId ? { ...p, replies: [...p.replies, { id: makeId("reply"), author: author || "You", text }] } : p)) }
      )
    );
  }, []);

  // Donations — demo-only, no real payment processor behind this.
  const addDonation = useCallback((organiserId, organiserName, amount) => {
    const donation = {
      id: makeId("don"),
      organiserId,
      organiserName,
      amount,
      date: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    };
    setDonations((list) => [donation, ...list]);
    return donation;
  }, []);

  const value = {
    isLoggedIn, profile, showLoginModal, authLoading, authError,
    requestLogin, closeLoginModal, login, register, logout, changePhoto, updateProfile,
    myList, isInList, toggleListItem, removeFromList,
    tickets, addTicket,
    isSubscribed, activePlan, activeDuration, activeScreens, activePrice, subscribe,
    rewardPoints, redeemRewardPoints,
    rooms, createRoom, addPostToRoom, toggleLikePost, addReplyToPost,
    donations, addDonation,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp() must be used inside <AppProvider>");
  return ctx;
}
