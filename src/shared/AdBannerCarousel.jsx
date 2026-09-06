import React, { useEffect, useState } from "react";
import { fetchAdBanners } from "../api";

const SLIDE_INTERVAL_MS = 5000;

// ---------------------------------------------------------------------------
// Auto-sliding promo banner shown at the very top of a page — right below
// the nav, above that page's own hero. Fully admin-managed (Admin > Ad
// Banners): image + redirect URL (opens in a new tab) + a start/end date
// window + which page(s) it appears on. Renders nothing at all when there
// are no active banners for this page, so it never leaves an empty gap.
// ---------------------------------------------------------------------------

export default function AdBannerCarousel({ pageKey }) {
  const [banners, setBanners] = useState([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    fetchAdBanners(pageKey).then(setBanners).catch(() => setBanners([]));
  }, [pageKey]);

  useEffect(() => {
    if (banners.length < 2) return;
    const id = setInterval(() => setActive((i) => (i + 1) % banners.length), SLIDE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [banners.length]);

  if (banners.length === 0) return null;
  const banner = banners[active];

  return (
    <div className="relative w-full overflow-hidden" style={{ aspectRatio: "16 / 5", maxHeight: 380 }}>
      {banners.map((b, i) => (
        <a
          key={b.id}
          href={b.redirect_url}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-0 block transition-opacity duration-700 ease-in-out"
          style={{ opacity: i === active ? 1 : 0, pointerEvents: i === active ? "auto" : "none" }}
        >
          <img src={b.image_url} alt="Advertisement" className="h-full w-full object-cover" />
        </a>
      ))}
      {banners.length > 1 && (
        <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
          {banners.map((b, i) => (
            <span
              key={b.id}
              className="h-1.5 w-1.5 rounded-full transition-opacity"
              style={{ background: "#fff", opacity: i === active ? 1 : 0.4 }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
