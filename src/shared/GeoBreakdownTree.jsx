import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

// ---------------------------------------------------------------------------
// GeoBreakdownTree — renders the Country > City > Age group nested tree from
// GET .../revenue/geo-breakdown* (backend: demographics_utils.geo_breakdown).
// Used on both the Admin Revenue Sharing page and the customer/organiser
// Revenue page, for both a single video and the all-videos-combined view —
// same component, just given different data. Collapsed by default except
// the single top-earning country, so the page isn't a wall of rows at first
// glance but the useful answer is visible immediately.
//
// This is deliberately a THIRD view alongside the existing separate
// "Revenue share by country/city/age group" breakdowns, not a replacement:
// those answer "how much from City X in total"; this answers "of City X's
// viewers, which age group" — the nested question those flat lists can't.
// ---------------------------------------------------------------------------

export default function GeoBreakdownTree({ data, colors, emptyLabel = "No revenue events tracked yet." }) {
  const [openCountries, setOpenCountries] = useState(() => new Set(data[0] ? [data[0].country] : []));
  const [openCities, setOpenCities] = useState(() => new Set());

  if (!data || data.length === 0) {
    return <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>{emptyLabel}</p>;
  }

  const toggleCountry = (country) => {
    setOpenCountries((prev) => {
      const next = new Set(prev);
      next.has(country) ? next.delete(country) : next.add(country);
      return next;
    });
  };
  const toggleCity = (key) => {
    setOpenCities((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <div className="overflow-hidden rounded-xl" style={{ border: `1px solid ${colors.border}` }}>
      {data.map((country) => {
        const countryOpen = openCountries.has(country.country);
        return (
          <div key={country.country}>
            <button
              type="button"
              onClick={() => toggleCountry(country.country)}
              className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm"
              style={{ background: colors.headerBg }}
            >
              <span className="flex items-center gap-1.5" style={{ color: colors.text }}>
                {countryOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                {country.country}
              </span>
              <span className="flex items-center gap-4">
                <span style={{ color: colors.subtext }}>{country.viewer_count} viewer{country.viewer_count === 1 ? "" : "s"}</span>
                <span className="font-medium" style={{ color: colors.gold }}>₹{country.creator_earned_rupees}</span>
              </span>
            </button>

            {countryOpen && country.cities.map((city) => {
              const cityKey = `${country.country}|${city.city}`;
              const cityOpen = openCities.has(cityKey);
              return (
                <div key={cityKey}>
                  <button
                    type="button"
                    onClick={() => toggleCity(cityKey)}
                    className="flex w-full items-center justify-between py-2 pl-9 pr-4 text-left text-sm"
                    style={{ borderTop: `1px solid ${colors.border}` }}
                  >
                    <span className="flex items-center gap-1.5" style={{ color: colors.text }}>
                      {cityOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      {city.city}
                    </span>
                    <span className="flex items-center gap-4">
                      <span style={{ color: colors.subtext }}>{city.viewer_count} viewer{city.viewer_count === 1 ? "" : "s"}</span>
                      <span style={{ color: colors.subtext }}>₹{city.creator_earned_rupees}</span>
                    </span>
                  </button>

                  {cityOpen && city.age_groups.map((ag) => (
                    <div
                      key={ag.age_group}
                      className="flex items-center justify-between py-1.5 pl-16 pr-4 text-xs"
                      style={{ borderTop: `1px solid ${colors.border}` }}
                    >
                      <span style={{ color: colors.subtext }}>{ag.age_group}</span>
                      <span className="flex items-center gap-4">
                        <span style={{ color: colors.subtext }}>{ag.viewer_count} viewer{ag.viewer_count === 1 ? "" : "s"}</span>
                        <span style={{ color: colors.subtext }}>₹{ag.creator_earned_rupees}</span>
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
