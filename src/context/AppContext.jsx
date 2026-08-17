import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// AppContext — the one place that owns:
//   - auth state (isLoggedIn / profile) + the shared login modal trigger
//   - My List (saved items) + add/remove/toggle
//
// Previously this lived only inside TopNav, which meant no other component
// (a card's "+" button in Video Streaming, Movies, Theater, Archive) could
// check "is the user logged in" or actually save an item anywhere. Lifting
// it here makes both usable from any component via useApp().
// ---------------------------------------------------------------------------

const AppContext = createContext(null);

function makeTicketId() {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `TCK-${n}`;
}

function makeId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

const SEED_ROOMS = [
  {
    id: "room-bengali-fans",
    title: "Bengali Theatre Fans",
    createdBy: "Movix Team",
    posts: [
      { id: "post-1", author: "Movix Team", text: "Welcome! Share what you've been watching this week.", image: null, likes: 4, replies: [] },
    ],
  },
  {
    id: "room-backstage-stories",
    title: "Backstage Stories",
    createdBy: "Movix Team",
    posts: [
      { id: "post-2", author: "Movix Team", text: "Post your best backstage moments — mishaps welcome.", image: null, likes: 7, replies: [] },
    ],
  },
  {
    id: "room-new-play-recs",
    title: "New Play Recommendations",
    createdBy: "Movix Team",
    posts: [
      { id: "post-3", author: "Movix Team", text: "What should be added to the Ticketing section next?", image: null, likes: 2, replies: [] },
    ],
  },
];

export function AppProvider({ children }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [profile, setProfile] = useState({ name: "", email: "", photo: null, role: "User" });
  const [showLoginModal, setShowLoginModal] = useState(false);

  // The whole site requires login. Whenever isLoggedIn is false — on first
  // load, or right after logging out — force the login modal open. It's
  // non-dismissable in this state (see LoginModal in TopNav.jsx), so there's
  // no way to browse without logging in first.
  useEffect(() => {
    if (!isLoggedIn) setShowLoginModal(true);
  }, [isLoggedIn]);
  const [myList, setMyList] = useState([]); // [{ id, title, image, meta, section }]
  const [tickets, setTickets] = useState([]); // [{ id, subject, description, status, date }]
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [activePlan, setActivePlan] = useState(null);
  const [activeDuration, setActiveDuration] = useState(null); // e.g. "1 Month", "6 Months", "1 Year"
  const [activeScreens, setActiveScreens] = useState(null);
  const [activePrice, setActivePrice] = useState(null);
  const [rewardPoints, setRewardPoints] = useState(250); // demo starting balance, 1 point = ₹1
  const [rooms, setRooms] = useState(SEED_ROOMS);
  const [donations, setDonations] = useState([]); // [{ id, organiserId, organiserName, amount, date }]

  const requestLogin = useCallback(() => setShowLoginModal(true), []);
  const closeLoginModal = useCallback(() => setShowLoginModal(false), []);

  const login = useCallback((name, email, role = "User") => {
    setProfile((p) => ({ ...p, name, email, role }));
    setIsLoggedIn(true);
    setShowLoginModal(false);
  }, []);

  const logout = useCallback(() => {
    setIsLoggedIn(false);
    setProfile({ name: "", email: "", photo: null, role: "User" });
    setIsSubscribed(false);
    setActivePlan(null);
    setActiveDuration(null);
    setActiveScreens(null);
    setActivePrice(null);
  }, []);

  const subscribe = useCallback((planName, durationLabel, screens, price) => {
    setIsSubscribed(true);
    setActivePlan(planName);
    setActiveDuration(durationLabel);
    setActiveScreens(screens);
    setActivePrice(price);
  }, []);

  // Rewards — 1 point = ₹1. Redeeming deducts the used points from the
  // balance; the caller is responsible for computing how many points to use
  // (typically min(balance, order total) so it never goes negative).
  const redeemRewardPoints = useCallback((amount) => {
    setRewardPoints((p) => Math.max(0, p - amount));
  }, []);

  const changePhoto = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setProfile((p) => ({ ...p, photo: reader.result }));
    reader.readAsDataURL(file);
  }, []);

  // Manage Profile page uses this to update name/email without touching
  // isLoggedIn (unlike login(), which is only for the initial sign-in).
  const updateProfile = useCallback((updates) => {
    setProfile((p) => ({ ...p, ...updates }));
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

  // Help Center — demo-only ticket system. Every submitted complaint gets a
  // ticket number and starts "Open"; nothing here reaches a real support
  // backend.
  const addTicket = useCallback((subject, description) => {
    const ticket = {
      id: makeTicketId(),
      subject,
      description,
      status: "Open",
      date: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    };
    setTickets((list) => [ticket, ...list]);
    return ticket;
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
    isLoggedIn, profile, showLoginModal,
    requestLogin, closeLoginModal, login, logout, changePhoto, updateProfile,
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
