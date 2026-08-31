import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  getToken,
  setToken,
  registerUser,
  loginUser,
  loginWithOtp as apiLoginWithOtp,
  fetchCurrentUser,
  updateCurrentUser,
  uploadProfilePhoto,
  createTicket,
  fetchTickets,
  createSubscription,
  fetchMySubscription,
  fetchCommunityRooms,
  createCommunityRoom,
  fetchMyList,
  toggleMyListItem,
  removeMyListItem,
} from "../api";
// ---------------------------------------------------------------------------
// AppContext — the one place that owns:
//   - auth state (isLoggedIn / profile) + the shared login modal trigger
//   - My List (saved items) + add/remove/toggle
//   - Support tickets (Help Center) — persisted to the backend
//   - Subscription status — persisted to the backend
//   - Community rooms (summary list only — post/reply/like details are
//     fetched page-locally by CommunityRoomPage when a room is opened)
//
// Auth, profile edits (including photo), tickets, subscriptions, and
// community rooms are all backed by the real theomy API (FastAPI +
// Postgres). My List and donations remain demo-only/in-memory.
// ---------------------------------------------------------------------------
const AppContext = createContext(null);
function makeId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

// Maps a backend UserOut object to the shape the rest of the app expects
// from `profile`. profile_photo_url from the backend (a real, persisted
// URL like "/api/uploads/profile_photos/<uuid>.jpg") takes priority; falls
// back to whatever was already in local state (e.g. a fresh upload we just
// applied optimistically) if the backend hasn't got one yet.
function toProfile(user, existingPhoto = null) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    country: user.country || "India",
    role: user.role,
    photo: user.profile_photo_url || existingPhoto,
    rewardPoints: user.reward_points_balance ?? 0,
    can_live_stream: user.can_live_stream ?? false,
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
  const [profile, setProfile] = useState({ id: null, name: "", email: "", photo: null, role: "user", country: "India" });
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
  const [activeCurrency, setActiveCurrency] = useState("INR");
  const [rooms, setRooms] = useState([]); // summary list: {id, title, createdBy, postCount} — fetched from backend
  const [donations, setDonations] = useState([]); // [{ id, organiserId, organiserName, amount, date }]

  // Community rooms are public (viewable without login), so fetch the
  // summary list once on mount regardless of auth state.
  useEffect(() => {
    fetchCommunityRooms()
      .then((data) =>
        setRooms(
          data.map((r) => ({
            id: r.id,
            title: r.title,
            createdBy: r.created_by_name,
            postCount: r.post_count,
          }))
        )
      )
      .catch(() => setRooms([]));
  }, []);

  // Re-fetches just the current subscription and updates state — used both
  // by loadUserData (session restore) and directly after a successful
  // Razorpay payment, so the "You're on plan X" banner and Subscription
  // details update immediately without a full page reload.
  const refreshSubscription = useCallback(async () => {
    try {
      const sub = await fetchMySubscription();
      if (sub) {
        setIsSubscribed(true);
        setActivePlan(sub.plan_name);
        setActiveDuration(sub.duration_label);
        setActiveScreens(sub.screens);
        setActivePrice(Number(sub.price));
        setActiveCurrency(sub.currency || "INR");
      } else {
        setIsSubscribed(false);
      }
    } catch {
      // Non-fatal — Subscription page just shows no active plan if this fails
    }
  }, []);

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
      const items = await fetchMyList();
      setMyList(items.map((i) => ({ id: i.item_id, title: i.title, image: i.image_url, meta: i.meta, section: i.section })));
    } catch {
      // Non-fatal — My List just shows empty if this fails
    }

    await refreshSubscription();
  }, [refreshSubscription]);

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

  // Fired by api.js the instant any authenticated request comes back
  // 401 while we're still holding a token — most commonly because this
  // same account just logged in elsewhere (single-session enforcement,
  // see backend User.active_session_token) and this tab's token no
  // longer matches. Surfaces why, instead of a silent/confusing logout.
  useEffect(() => {
    const handleSessionEnded = (e) => {
      setIsLoggedIn(false);
      setProfile({ id: null, name: "", email: "", photo: null, role: "user", country: "India" });
      setAuthError(e.detail || "You've been logged out.");
    };
    window.addEventListener("auth:sessionEnded", handleSessionEnded);
    return () => window.removeEventListener("auth:sessionEnded", handleSessionEnded);
  }, []);

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

  // Phone + WhatsApp OTP login (India) — no password involved. Throws on
  // failure (invalid/expired code, or no account exists with that phone)
  // so the modal can show the error inline.
  const loginWithOtp = useCallback(async (phone, otp) => {
    setAuthError("");
    const data = await apiLoginWithOtp(phone, otp);
    setToken(data.access_token);
    setProfile((p) => toProfile(data.user, p.photo));
    setIsLoggedIn(true);
    setShowLoginModal(false);
    loadUserData();
  }, [loadUserData]);

  // Real registration against the backend. Phone is optional UNLESS
  // country is India, in which case the caller must have already
  // completed WhatsApp OTP verification and pass the code here — the
  // backend re-validates it server-side regardless.
  const register = useCallback(async ({ name, email, password, phone, country, otp, role }) => {
    setAuthError("");
    const data = await registerUser({ name, email, password, phone, country, otp, role });
    setToken(data.access_token);
    setProfile((p) => toProfile(data.user, p.photo));
    setIsLoggedIn(true);
    setShowLoginModal(false);
    loadUserData();
  }, [loadUserData]);

  const logout = useCallback(() => {
    setToken(null);
    setIsLoggedIn(false);
    setProfile({ id: null, name: "", email: "", photo: null, role: "user", country: "India" });
    setTickets([]);
    setMyList([]);
    setIsSubscribed(false);
    setActivePlan(null);
    setActiveDuration(null);
    setActiveScreens(null);
    setActivePrice(null);
    setActiveCurrency("INR");
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

  // Reward points are now a real backend-tracked balance (1 point = ₹1),
  // earned automatically on successful subscription payments and
  // deducted automatically when redeemed at checkout — both happen
  // server-side in the payment-verification endpoint, never here. After
  // a successful payment, call this to pull the updated balance (and any
  // other profile fields that might have changed) from the backend.
  const refreshProfile = useCallback(async () => {
    try {
      const user = await fetchCurrentUser();
      setProfile((p) => toProfile(user, p.photo));
    } catch {
      // Non-fatal — the page just keeps showing the last-known balance
    }
  }, []);

  // Uploads the photo to the backend and stores the real, persisted URL —
  // survives refresh/logout/other devices, unlike the old local-only
  // FileReader preview. Throws on failure so the caller can show an error.
  const changePhoto = useCallback(async (file) => {
    if (!file) return;
    const user = await uploadProfilePhoto(file);
    setProfile((p) => toProfile(user, p.photo));
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
  // Optimistic: updates local state immediately (so the button feels
  // instant), then syncs to the backend in the background — reverting
  // the optimistic change if that call fails, so the UI never claims
  // something is saved when it actually isn't.
  const toggleListItem = useCallback((item) => {
    const wasInList = myList.some((i) => i.id === item.id);
    setMyList((list) => (wasInList ? list.filter((i) => i.id !== item.id) : [...list, item]));

    toggleMyListItem(item).catch(() => {
      // Revert on failure
      setMyList((list) => {
        const stillHasIt = list.some((i) => i.id === item.id);
        if (wasInList && !stillHasIt) return [...list, item]; // put it back
        if (!wasInList && stillHasIt) return list.filter((i) => i.id !== item.id); // take it back out
        return list;
      });
    });
  }, [myList]);

  const removeFromList = useCallback((id) => {
    const removedItem = myList.find((i) => i.id === id);
    setMyList((list) => list.filter((i) => i.id !== id));
    removeMyListItem(id).catch(() => {
      if (removedItem) setMyList((list) => (list.some((i) => i.id === id) ? list : [...list, removedItem]));
    });
  }, [myList]);

  // Help Center — persists the complaint as a real ticket on the backend.
  // Throws on failure so the page can show an error; on success, prepends
  // the new ticket (mapped to the display shape) to the local list.
  const addTicket = useCallback(async (subject, description) => {
    const ticket = await createTicket({ subject, description });
    const display = toTicketDisplay(ticket);
    setTickets((list) => [display, ...list]);
    return display;
  }, []);

  // Community Rooms — persisted to the backend. createRoom returns the
  // new room's id so the caller can navigate straight into it. Posting,
  // replying, and liking within a room are handled page-locally by
  // CommunityRoomPage (which fetches that one room's full detail),
  // rather than living in this global list.
  const createRoom = useCallback(async (title) => {
    const room = await createCommunityRoom(title);
    setRooms((list) => [
      { id: room.id, title: room.title, createdBy: room.created_by_name, postCount: room.post_count },
      ...list,
    ]);
    return room.id;
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
    requestLogin, closeLoginModal, login, loginWithOtp, register, logout, changePhoto, updateProfile,
    myList, isInList, toggleListItem, removeFromList,
    tickets, addTicket,
    isSubscribed, activePlan, activeDuration, activeScreens, activePrice, activeCurrency, subscribe, refreshSubscription,
    refreshProfile,
    rooms, createRoom,
    donations, addDonation,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp() must be used inside <AppProvider>");
  return ctx;
}
