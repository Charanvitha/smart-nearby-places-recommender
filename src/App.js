import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// ✅ Fix marker icon issue in React Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// ✅ Moods (Removed Date, Added Tourist + Stay/Hotels)
const moodConfig = {
  work: {
    label: "Work",
    emoji: "💻",
    type: "amenity",
    tags: ["cafe", "library", "coworking_space"],
    topMatch: "Quiet cafés & libraries are best for work focus.",
  },
  tourist: {
    label: "Tourist",
    emoji: "🗺️",
    type: "tourism",
    tags: ["attraction", "museum", "viewpoint", "zoo", "theme_park"],
    topMatch: "Explore tourist attractions and famous places nearby!",
  },
  quick: {
    label: "Quick Bite",
    emoji: "🍔",
    type: "amenity",
    tags: ["fast_food", "restaurant", "food_court"],
    topMatch: "Fast food & quick restaurants nearby!",
  },
  budget: {
    label: "Budget",
    emoji: "💸",
    type: "amenity",
    tags: ["fast_food", "cafe", "restaurant"],
    topMatch: "Budget-friendly spots (best effort from OSM data).",
  },
  stay: {
    label: "Stay",
    emoji: "🏨",
    type: "tourism",
    tags: ["hotel", "hostel", "guest_house", "motel"],
    topMatch: "Find hotels & stays based on your travel needs.",
  },
};

const DISTANCE_OPTIONS = [
  { label: "1 km", value: 1000 },
  { label: "3 km", value: 3000 },
  { label: "5 km", value: 5000 },
  { label: "10 km", value: 10000 },
  { label: "20 km", value: 20000 },
];

const SORT_OPTIONS = [
  { label: "Relevance (Default)", value: "relevance" },
  { label: "Distance (Near → Far)", value: "distance" },
  { label: "A → Z", value: "az" },
  { label: "Rating (High → Low)", value: "rating" },
];

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function timeSuggestion() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return "🌅 Morning: Try breakfast cafés!";
  if (hour >= 11 && hour < 16) return "🍱 Afternoon: Lunch spots recommended!";
  if (hour >= 16 && hour < 20) return "☕ Evening: Hangout cafés & snacks!";
  return "🌙 Night: Find late dinner places!";
}

async function fetchWithRetry(url, tries = 3, delayMs = 3000) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Network response not ok");
      return await res.json();
    } catch (err) {
      if (attempt === tries) throw err;
      alert(`⚠️ API busy. Retrying (${attempt}/${tries}) in ${delayMs / 1000} seconds...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

export default function App() {
  const [location, setLocation] = useState(null);

  // ✅ Search other locations
  const [customLocation, setCustomLocation] = useState("");
  const [searchCenter, setSearchCenter] = useState(null); // {lat, lng, label}

  const [places, setPlaces] = useState([]);
  const [mood, setMood] = useState("work");
  const [loading, setLoading] = useState(false);

  // ✅ filters
  const [distanceLimit, setDistanceLimit] = useState(10000);
  const [sortBy, setSortBy] = useState("relevance");
  const [searchText, setSearchText] = useState("");

  // ✅ tabs
  const [tab, setTab] = useState("discover"); // discover | saved

  // ✅ selected place (Details)
  const [selectedPlace, setSelectedPlace] = useState(null);

  // ✅ favorites localStorage
  const [favorites, setFavorites] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("favorites_places")) || [];
    } catch {
      return [];
    }
  });

  // ✅ reviews localStorage
  const [reviews, setReviews] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("place_reviews")) || {};
    } catch {
      return {};
    }
  });

  const [reviewStars, setReviewStars] = useState(5);
  const [reviewText, setReviewText] = useState("");

  useEffect(() => {
    localStorage.setItem("favorites_places", JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem("place_reviews", JSON.stringify(reviews));
  }, [reviews]);

  // ✅ offline cache
  useEffect(() => {
    try {
      const cache = JSON.parse(localStorage.getItem("last_search_cache") || "{}");
      if (cache?.places?.length) setPlaces(cache.places);
      if (cache?.searchCenter) setSearchCenter(cache.searchCenter);
    } catch {}
  }, []);

  // ✅ detect location
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocation(loc);
        setSearchCenter({ ...loc, label: "Your Location" });
      },
      () => {
        const fallback = { lat: 17.385, lng: 78.4867 };
        setLocation(fallback);
        setSearchCenter({ ...fallback, label: "Hyderabad (Fallback)" });
      }
    );
  }, []);

  const getReviewStats = (placeId) => {
    const list = reviews[placeId] || [];
    if (!list.length) return { avg: 0, count: 0 };
    const sum = list.reduce((acc, r) => acc + (r.stars || 0), 0);
    return { avg: sum / list.length, count: list.length };
  };

  const addReview = (placeId) => {
    const text = reviewText.trim();
    if (!text) {
      alert("Please type a review comment.");
      return;
    }

    const newReview = {
      stars: reviewStars,
      text,
      time: Date.now(),
    };

    setReviews((prev) => {
      const old = prev[placeId] || [];
      return { ...prev, [placeId]: [newReview, ...old] };
    });

    setReviewStars(5);
    setReviewText("");
    alert("✅ Review added!");
  };

  // ✅ search other location using nominatim
  const findOtherLocation = async () => {
    const q = customLocation.trim();
    if (!q) return;

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`;
      const data = await fetchWithRetry(url, 2, 2000);

      if (!data || data.length === 0) {
        alert("Location not found. Try another name.");
        return;
      }

      const newCenter = {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        label: data[0].display_name,
      };

      setSearchCenter(newCenter);
      alert("✅ Location set! Now click 'Find Places'");
      localStorage.setItem("last_search_cache", JSON.stringify({ time: Date.now(), places, searchCenter: newCenter }));
    } catch (err) {
      console.error(err);
      alert("Failed to search location.");
    }
  };

  const fetchPlaces = async () => {
    if (!searchCenter) return;

    setLoading(true);
    setPlaces([]);
    setSelectedPlace(null);

    const config = moodConfig[mood];
    const tags = config?.tags || ["restaurant"];
    const radius = Math.max(distanceLimit, 3000);

    // ✅ Overpass: tourism/amenity based query
    const key = config.type; // amenity OR tourism
    const query = `
      [out:json][timeout:25];
      (
        node["${key}"~"${tags.join("|")}"](around:${radius},${searchCenter.lat},${searchCenter.lng});
        way["${key}"~"${tags.join("|")}"](around:${radius},${searchCenter.lat},${searchCenter.lng});
        relation["${key}"~"${tags.join("|")}"](around:${radius},${searchCenter.lat},${searchCenter.lng});
      );
      out center;
    `;

    const url = "https://overpass.kumi.systems/api/interpreter?data=" + encodeURIComponent(query);

    try {
      const data = await fetchWithRetry(url, 3, 3000);

      const results = (data.elements || [])
        .map((el) => {
          const lat = el.lat || el.center?.lat;
          const lon = el.lon || el.center?.lon;
          const name = el.tags?.name || "Unnamed Place";
          const type = el.tags?.amenity || el.tags?.tourism || "place";
          if (!lat || !lon) return null;

          const dist = haversineMeters(searchCenter.lat, searchCenter.lng, lat, lon);
          const relevance = (1 / (dist + 1)) * 1000000;

          return {
            id: el.id,
            name,
            type,
            lat,
            lon,
            distance: dist,
            relevance,
            tags: el.tags || {},
          };
        })
        .filter(Boolean);

      setPlaces(results);

      localStorage.setItem(
        "last_search_cache",
        JSON.stringify({ time: Date.now(), places: results, searchCenter })
      );
    } catch (err) {
      console.error(err);
      alert("❌ Places API busy for too long. Try again later.");
    } finally {
      setLoading(false);
    }
  };

  const isFav = (id) => favorites.some((x) => x.id === id);

  const toggleFav = (place) => {
    setFavorites((prev) => {
      if (prev.some((x) => x.id === place.id)) return prev.filter((x) => x.id !== place.id);
      return [{ ...place, savedAt: Date.now() }, ...prev];
    });
  };

  const visiblePlaces = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const base = tab === "saved" ? favorites : places;
    let arr = base;

    if (tab === "discover") arr = arr.filter((p) => p.distance <= distanceLimit);

    if (q) arr = arr.filter((p) => (p.name || "").toLowerCase().includes(q));

    if (sortBy === "distance") arr = [...arr].sort((a, b) => a.distance - b.distance);
    else if (sortBy === "az") arr = [...arr].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    else if (sortBy === "rating") {
      arr = [...arr].sort((a, b) => getReviewStats(b.id).avg - getReviewStats(a.id).avg);
    } else {
      arr = [...arr].sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
    }

    return arr;
  }, [places, favorites, searchText, tab, sortBy, distanceLimit, reviews]);

  const sharePlace = (p) => {
    const msg = `📍 ${p.name}\nType: ${p.type}\nLocation: https://www.google.com/maps?q=${p.lat},${p.lon}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  if (!location || !searchCenter) return <h2 style={{ padding: 20 }}>Getting location...</h2>;

  return (
    <div style={styles.page}>
      {/* HEADER */}
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Smart Nearby Places Recommender</h1>
          <p style={styles.subtitle}>
            {timeSuggestion()} &nbsp;|&nbsp; {moodConfig[mood].topMatch}
          </p>
          <p style={{ margin: "6px 0 0", color: "#555", fontSize: 12 }}>
            📍 Searching near: <b>{searchCenter.label || "Selected location"}</b>
          </p>
        </div>

        <div style={styles.tabs}>
          <button
            onClick={() => setTab("discover")}
            style={{ ...styles.tabBtn, ...(tab === "discover" ? styles.tabActive : {}) }}
          >
            🔎 Discover
          </button>
          <button
            onClick={() => setTab("saved")}
            style={{ ...styles.tabBtn, ...(tab === "saved" ? styles.tabActive : {}) }}
          >
            ⭐ Saved ({favorites.length})
          </button>
        </div>
      </header>

      {/* MAIN GRID */}
      <div style={styles.grid}>
        {/* LEFT PANEL */}
        <aside style={styles.panel}>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Mood</h3>

            <div style={styles.moodRow}>
              {Object.keys(moodConfig).map((key) => {
                const active = key === mood;
                return (
                  <button
                    key={key}
                    onClick={() => setMood(key)}
                    style={{ ...styles.moodBtn, ...(active ? styles.moodBtnActive : {}) }}
                  >
                    {moodConfig[key].emoji} {moodConfig[key].label}
                  </button>
                );
              })}
            </div>

            {/* Search other location */}
            <label style={styles.label}>Search other location</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                placeholder="Example: Bangalore / Hyderabad"
                value={customLocation}
                onChange={(e) => setCustomLocation(e.target.value)}
                style={{ ...styles.search, marginTop: 0 }}
              />
              <button style={styles.smallBtn} onClick={findOtherLocation}>
                Search
              </button>
            </div>

            <div style={styles.controlsRow}>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>Distance</label>
                <select
                  value={distanceLimit}
                  onChange={(e) => setDistanceLimit(Number(e.target.value))}
                  style={styles.select}
                  disabled={tab === "saved"}
                >
                  {DISTANCE_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      Within {d.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ flex: 1 }}>
                <label style={styles.label}>Sort</label>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={styles.select}>
                  {SORT_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={fetchPlaces}
              style={styles.primaryBtn}
              disabled={tab === "saved"}
              title={tab === "saved" ? "Switch to Discover to search places" : ""}
            >
              {loading ? "Searching..." : "Find Places"}
            </button>

            <p style={styles.smallNote}>
              ✅ Includes Tourist Places + Hotels + Reviews + API Retry.
            </p>
          </div>

          {/* LIST */}
          <div style={styles.card}>
            <div style={styles.rowBetween}>
              <h3 style={styles.cardTitle}>
                {tab === "saved" ? "Saved Places" : "Recommendations"}
              </h3>
              <span style={styles.countPill}>{visiblePlaces.length}</span>
            </div>

            <input
              placeholder="Search places..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={styles.search}
            />

            <div style={styles.list}>
              {loading && tab === "discover" && <p style={styles.loadingText}>Loading places...</p>}

              {!loading && visiblePlaces.length === 0 && (
                <p style={styles.emptyText}>
                  {tab === "saved"
                    ? "No saved places yet. Save some ⭐"
                    : "No places yet. Click “Find Places”."}
                </p>
              )}

              {visiblePlaces.slice(0, 60).map((p) => {
                const stat = getReviewStats(p.id);
                const active = selectedPlace?.id === p.id;

                return (
                  <div
                    key={p.id}
                    style={{
                      ...styles.placeCard,
                      ...(active ? styles.placeCardActive : {}),
                    }}
                  >
                    <div style={styles.placeTop}>
                      <div>
                        <div style={styles.placeName}>{p.name}</div>

                        <div style={styles.placeMeta}>
                          {p.type} • {(p.distance / 1000).toFixed(2)} km
                        </div>

                        <div style={{ marginTop: 4, fontSize: 12, color: "#444" }}>
                          ⭐{" "}
                          {stat.avg
                            ? `${stat.avg.toFixed(1)} (${stat.count} reviews)`
                            : "No rating yet"}
                        </div>
                      </div>

                      <button onClick={() => toggleFav(p)} style={styles.favBtn} title="Save">
                        {isFav(p.id) ? "⭐" : "☆"}
                      </button>
                    </div>

                    <div style={styles.placeActions}>
                      <button style={styles.smallBtn} onClick={() => setSelectedPlace(p)}>
                        Open
                      </button>

                      <button style={styles.smallBtn} onClick={() => sharePlace(p)}>
                        WhatsApp
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* RIGHT SIDE (MAP + DETAILS) */}
        <section style={styles.rightSide}>
          {/* MAP */}
          <div style={styles.mapCard}>
            <MapContainer
              center={[searchCenter.lat, searchCenter.lng]}
              zoom={13}
              style={{ height: "100%", width: "100%", borderRadius: 16 }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <Marker position={[searchCenter.lat, searchCenter.lng]}>
                <Popup>
                  <b>Search Center</b> <br />
                  {searchCenter.label || "Selected location"}
                </Popup>
              </Marker>

              {visiblePlaces.map((p) => (
                <Marker
                  key={p.id}
                  position={[p.lat, p.lon]}
                  eventHandlers={{
                    click: () => setSelectedPlace(p),
                  }}
                >
                  <Popup>
                    <b>{p.name}</b> <br />
                    {p.type} <br />
                    {(p.distance / 1000).toFixed(2)} km away
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

          {/* DETAILS AREA */}
          <div style={styles.detailsCard}>
            {!selectedPlace ? (
              <div style={{ color: "#666", fontWeight: 800 }}>
                ✅ Click any place from the list or map to view full details here
              </div>
            ) : (
              <>
                <div style={styles.detailsHeader}>
                  <div>
                    <h2 style={{ margin: 0 }}>{selectedPlace.name}</h2>
                    <div style={{ color: "#666", marginTop: 4 }}>
                      {selectedPlace.type} • {(selectedPlace.distance / 1000).toFixed(2)} km
                    </div>
                    <div style={{ marginTop: 8, fontSize: 13 }}>
                      ⭐{" "}
                      {getReviewStats(selectedPlace.id).avg
                        ? `${getReviewStats(selectedPlace.id).avg.toFixed(1)} (${getReviewStats(selectedPlace.id).count} reviews)`
                        : "No rating yet"}
                    </div>
                  </div>

                  <button
                    onClick={() => toggleFav(selectedPlace)}
                    style={styles.saveBigBtn}
                  >
                    {isFav(selectedPlace.id) ? "⭐ Saved" : "☆ Save"}
                  </button>
                </div>

                <div style={styles.detailsBtns}>
                  <button style={styles.secondaryBtn} onClick={() => sharePlace(selectedPlace)}>
                    WhatsApp
                  </button>

                  <button
                    style={styles.secondaryBtn}
                    onClick={() =>
                      window.open(
                        `https://www.google.com/maps/dir/?api=1&origin=${searchCenter.lat},${searchCenter.lng}&destination=${selectedPlace.lat},${selectedPlace.lon}&travelmode=walking`,
                        "_blank"
                      )
                    }
                  >
                    🚶 Walk
                  </button>

                  <button
                    style={styles.secondaryBtn}
                    onClick={() =>
                      window.open(
                        `https://www.google.com/maps/dir/?api=1&origin=${searchCenter.lat},${searchCenter.lng}&destination=${selectedPlace.lat},${selectedPlace.lon}&travelmode=driving`,
                        "_blank"
                      )
                    }
                  >
                    🚗 Drive
                  </button>
                </div>

                {/* REVIEWS */}
                <hr style={{ border: "none", borderTop: "1px solid #eee", margin: "16px 0" }} />
                <h3 style={{ margin: "0 0 10px" }}>Reviews</h3>

                <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                  <select
                    value={reviewStars}
                    onChange={(e) => setReviewStars(Number(e.target.value))}
                    style={styles.select}
                  >
                    <option value={5}>⭐⭐⭐⭐⭐ (5)</option>
                    <option value={4}>⭐⭐⭐⭐ (4)</option>
                    <option value={3}>⭐⭐⭐ (3)</option>
                    <option value={2}>⭐⭐ (2)</option>
                    <option value={1}>⭐ (1)</option>
                  </select>

                  <button style={styles.smallBtn} onClick={() => addReview(selectedPlace.id)}>
                    Add Review
                  </button>
                </div>

                <textarea
                  placeholder="Write your review..."
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  rows={3}
                  style={styles.reviewBox}
                />

                <div style={{ maxHeight: 180, overflow: "auto", paddingRight: 6 }}>
                  {(reviews[selectedPlace.id] || []).length === 0 ? (
                    <p style={{ color: "#777", margin: 0 }}>No reviews yet. Be the first!</p>
                  ) : (
                    (reviews[selectedPlace.id] || []).slice(0, 15).map((r, idx) => (
                      <div key={idx} style={styles.reviewItem}>
                        <div style={{ fontWeight: 900, fontSize: 13 }}>
                          {"⭐".repeat(r.stars)}{" "}
                          <span style={{ color: "#777", fontWeight: 600, marginLeft: 6 }}>
                            {new Date(r.time).toLocaleString()}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, marginTop: 4 }}>{r.text}</div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      <footer style={styles.footer}>
        Built using React + Leaflet + OpenStreetMap | Tourist + Hotels + Reviews + Favorites + API Retry
      </footer>
    </div>
  );
}

const styles = {
  page: {
    fontFamily: "system-ui, Arial",
    background: "#f6f7fb",
    minHeight: "100vh",
    padding: "18px",
  },
  header: {
    background: "white",
    padding: "16px 18px",
    borderRadius: 16,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
    gap: 12,
  },
  title: { margin: 0, fontSize: 22 },
  subtitle: { margin: "6px 0 0", color: "#666", fontSize: 13, lineHeight: 1.4 },
  tabs: { display: "flex", gap: 8 },
  tabBtn: {
    border: "1px solid #ddd",
    background: "#fff",
    borderRadius: 999,
    padding: "8px 12px",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13,
  },
  tabActive: { border: "1px solid #4f46e5", background: "#eef2ff", color: "#2f2bbd" },

  // ✅ Equal left-right (fits desktop)
  grid: {
    marginTop: 16,
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
  },

  panel: { display: "flex", flexDirection: "column", gap: 16 },
  rightSide: { display: "flex", flexDirection: "column", gap: 16 },

  card: {
    background: "white",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
  },
  cardTitle: { margin: 0, fontSize: 16 },

  moodRow: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 },
  moodBtn: {
    border: "1px solid #ddd",
    padding: "8px 10px",
    borderRadius: 12,
    cursor: "pointer",
    background: "#fff",
    fontSize: 13,
  },
  moodBtnActive: { border: "1px solid #4f46e5", background: "#eef2ff", fontWeight: 900 },

  controlsRow: { display: "flex", gap: 10, marginTop: 14 },
  label: { display: "block", marginBottom: 6, color: "#444", fontSize: 13 },

  select: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    outline: "none",
  },

  primaryBtn: {
    width: "100%",
    marginTop: 14,
    padding: "10px 12px",
    borderRadius: 14,
    border: "none",
    cursor: "pointer",
    background: "#4f46e5",
    color: "white",
    fontWeight: 900,
  },

  smallNote: { margin: "10px 0 0", color: "#777", fontSize: 12 },

  rowBetween: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  countPill: {
    padding: "4px 10px",
    borderRadius: 999,
    background: "#eef2ff",
    fontWeight: 900,
    color: "#4f46e5",
    fontSize: 13,
  },

  search: {
    marginTop: 10,
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    outline: "none",
  },

  list: {
    marginTop: 12,
    maxHeight: "46vh",
    overflow: "auto",
    paddingRight: 6,
  },

  placeCard: {
    border: "1px solid #eee",
    borderRadius: 14,
    padding: "10px 12px",
    marginBottom: 10,
    background: "#fff",
    cursor: "pointer",
  },

  placeCardActive: {
    border: "2px solid #4f46e5",
    boxShadow: "0 10px 25px rgba(79,70,229,0.2)",
  },

  placeTop: { display: "flex", justifyContent: "space-between", gap: 10 },
  placeName: { fontWeight: 900, fontSize: 14 },
  placeMeta: { color: "#777", fontSize: 12, marginTop: 3 },

  favBtn: {
    border: "1px solid #ddd",
    background: "#fff",
    borderRadius: 12,
    cursor: "pointer",
    fontSize: 18,
    padding: "4px 10px",
    height: 36,
  },

  placeActions: { display: "flex", gap: 8, marginTop: 10 },

  smallBtn: {
    border: "1px solid #ddd",
    background: "#fff",
    borderRadius: 12,
    cursor: "pointer",
    fontSize: 12,
    padding: "6px 10px",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },

  loadingText: { color: "#555" },
  emptyText: { color: "#777" },

  mapCard: {
    height: "45vh",
    background: "white",
    borderRadius: 16,
    padding: 10,
    boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
  },

  detailsCard: {
    background: "white",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
    minHeight: "40vh",
  },

  detailsHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
  },

  saveBigBtn: {
    border: "1px solid #ddd",
    background: "#fff",
    borderRadius: 14,
    cursor: "pointer",
    padding: "10px 14px",
    fontWeight: 900,
    height: 42,
  },

  detailsBtns: { display: "flex", gap: 10, marginTop: 12 },

  secondaryBtn: {
    flex: 1,
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid #ddd",
    cursor: "pointer",
    background: "#fff",
    fontWeight: 900,
  },

  reviewBox: {
    width: "100%",
    border: "1px solid #ddd",
    borderRadius: 12,
    padding: 10,
    outline: "none",
    marginBottom: 10,
    resize: "vertical",
  },

  reviewItem: {
    border: "1px solid #eee",
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },

  footer: {
    marginTop: 14,
    textAlign: "center",
    color: "#666",
    fontSize: 12,
  },
};
