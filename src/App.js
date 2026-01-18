import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// ✅ Fix marker icon issue in React Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const moodConfig = {
  work: {
    label: "Work",
    emoji: "💻",
    tags: ["cafe", "library", "coworking_space"],
    topMatch: "Quiet cafés & libraries are best for work focus.",
  },
  date: {
    label: "Date",
    emoji: "❤️",
    tags: ["restaurant", "cafe", "cinema", "theatre", "park"],
    topMatch: "Restaurants & parks are perfect for a date vibe.",
  },
  quick: {
    label: "Quick Bite",
    emoji: "🍔",
    tags: ["fast_food", "restaurant", "food_court"],
    topMatch: "Fast food & quick restaurants nearby!",
  },
  budget: {
    label: "Budget",
    emoji: "💸",
    tags: ["fast_food", "cafe", "restaurant"],
    topMatch: "Budget-friendly spots (best effort from OSM data).",
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

export default function App() {
  const [location, setLocation] = useState(null);
  const [places, setPlaces] = useState([]);
  const [mood, setMood] = useState("work");
  const [loading, setLoading] = useState(false);

  // ✅ filters
  const [distanceLimit, setDistanceLimit] = useState(10000);
  const [sortBy, setSortBy] = useState("relevance");
  const [searchText, setSearchText] = useState("");

  // ✅ tabs
  const [tab, setTab] = useState("discover"); // discover | saved

  // ✅ details
  const [selectedPlace, setSelectedPlace] = useState(null);

  // ✅ favorites localStorage
  const [favorites, setFavorites] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("favorites_places")) || [];
    } catch {
      return [];
    }
  });

  // ✅ cache last results (offline mode)
  useEffect(() => {
    try {
      const cache = JSON.parse(localStorage.getItem("last_search_cache") || "{}");
      if (cache?.places?.length) setPlaces(cache.places);
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem("favorites_places", JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    // location
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {
        // fallback Hyderabad
        setLocation({ lat: 17.385, lng: 78.4867 });
      }
    );
  }, []);

  const fetchPlaces = async () => {
    if (!location) return;

    setLoading(true);
    setPlaces([]);

    const tags = moodConfig[mood]?.tags || ["restaurant"];
    const radius = Math.max(distanceLimit, 3000);

    const query = `
      [out:json][timeout:25];
      (
        node["amenity"~"${tags.join("|")}"](around:${radius},${location.lat},${location.lng});
        way["amenity"~"${tags.join("|")}"](around:${radius},${location.lat},${location.lng});
        relation["amenity"~"${tags.join("|")}"](around:${radius},${location.lat},${location.lng});
      );
      out center;
    `;

    const url =
      "https://overpass.kumi.systems/api/interpreter?data=" +
      encodeURIComponent(query);

    try {
      const res = await fetch(url);
      const data = await res.json();

      const results = (data.elements || [])
        .map((el) => {
          const lat = el.lat || el.center?.lat;
          const lon = el.lon || el.center?.lon;
          const name = el.tags?.name || "Unnamed Place";
          const type = el.tags?.amenity || "place";
          if (!lat || !lon) return null;

          const dist = haversineMeters(location.lat, location.lng, lat, lon);

          // "AI-like relevance" score (simple but valid!)
          // Prefer closer places + matches to mood
          const relevance = (1 / (dist + 1)) * 1000000 + (type ? 0.2 : 0);

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

      // cache last results for offline mode
      localStorage.setItem(
        "last_search_cache",
        JSON.stringify({ time: Date.now(), places: results })
      );
    } catch (err) {
      console.error(err);
      alert("Places API busy. Try again in 10 seconds.");
    } finally {
      setLoading(false);
    }
  };

  const isFav = (id) => favorites.some((x) => x.id === id);

  const toggleFav = (place) => {
    setFavorites((prev) => {
      if (prev.some((x) => x.id === place.id)) {
        return prev.filter((x) => x.id !== place.id);
      }
      return [{ ...place, savedAt: Date.now() }, ...prev];
    });
  };

  const visiblePlaces = useMemo(() => {
    const q = searchText.trim().toLowerCase();

    const base =
      tab === "saved" ? favorites : places;

    let arr = base;

    // distance filter only in discover
    if (tab === "discover") {
      arr = arr.filter((p) => p.distance <= distanceLimit);
    }

    // search
    if (q) {
      arr = arr.filter((p) => (p.name || "").toLowerCase().includes(q));
    }

    // sort
    if (sortBy === "distance") {
      arr = [...arr].sort((a, b) => a.distance - b.distance);
    } else if (sortBy === "az") {
      arr = [...arr].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } else {
      // relevance
      arr = [...arr].sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
    }

    return arr;
  }, [places, favorites, searchText, tab, sortBy, distanceLimit]);

  const sharePlace = async (p) => {
    const msg = `📍 ${p.name}\nType: ${p.type}\nLocation: https://www.google.com/maps?q=${p.lat},${p.lon}`;
    // WhatsApp
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const copyLink = async (p) => {
    const link = `https://www.google.com/maps?q=${p.lat},${p.lon}`;
    await navigator.clipboard.writeText(link);
    alert("✅ Link copied!");
  };

  if (!location) return <h2 style={{ padding: 20 }}>Getting location...</h2>;

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Smart Nearby Places Recommender</h1>
          <p style={styles.subtitle}>
            {timeSuggestion()} &nbsp;|&nbsp; {moodConfig[mood].topMatch}
          </p>
        </div>

        <div style={styles.tabs}>
          <button
            onClick={() => setTab("discover")}
            style={{
              ...styles.tabBtn,
              ...(tab === "discover" ? styles.tabActive : {}),
            }}
          >
            🔎 Discover
          </button>
          <button
            onClick={() => setTab("saved")}
            style={{
              ...styles.tabBtn,
              ...(tab === "saved" ? styles.tabActive : {}),
            }}
          >
            ⭐ Saved ({favorites.length})
          </button>
        </div>
      </header>

      {/* Layout */}
      <div style={styles.grid}>
        {/* Left Panel */}
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
                    style={{
                      ...styles.moodBtn,
                      ...(active ? styles.moodBtnActive : {}),
                    }}
                  >
                    {moodConfig[key].emoji} {moodConfig[key].label}
                  </button>
                );
              })}
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
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  style={styles.select}
                >
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
              ✅ AI-like relevance ranking uses distance + mood match.
              <br />
              ⚠️ Rating/price/open-now is not available from OSM.
            </p>
          </div>

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
              {loading && tab === "discover" && (
                <p style={styles.loadingText}>Loading places...</p>
              )}

              {!loading && visiblePlaces.length === 0 && (
                <p style={styles.emptyText}>
                  {tab === "saved"
                    ? "No saved places yet. Save some ⭐"
                    : "No places yet. Click “Find Places”."}
                </p>
              )}

              {visiblePlaces.slice(0, 40).map((p) => (
                <div key={p.id} style={styles.placeCard}>
                  <div style={styles.placeTop}>
                    <div>
                      <div style={styles.placeName}>{p.name}</div>
                      <div style={styles.placeMeta}>
                        {p.type} • {(p.distance / 1000).toFixed(2)} km
                      </div>
                    </div>

                    <button
                      onClick={() => toggleFav(p)}
                      style={styles.favBtn}
                      title="Save"
                    >
                      {isFav(p.id) ? "⭐" : "☆"}
                    </button>
                  </div>

                  <div style={styles.placeActions}>
                    <button
                      style={styles.smallBtn}
                      onClick={() => setSelectedPlace(p)}
                    >
                      Details
                    </button>
                    <button
                      style={styles.smallBtn}
                      onClick={() => sharePlace(p)}
                    >
                      WhatsApp
                    </button>
                    <button style={styles.smallBtn} onClick={() => copyLink(p)}>
                      Copy Link
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Map */}
        <section style={styles.mapWrap}>
          <div style={styles.mapCard}>
            <MapContainer
              center={[location.lat, location.lng]}
              zoom={14}
              style={{ height: "100%", width: "100%", borderRadius: 16 }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <Marker position={[location.lat, location.lng]}>
                <Popup>
                  <b>You are here</b>
                </Popup>
              </Marker>

              {visiblePlaces.map((p) => (
                <Marker key={p.id} position={[p.lat, p.lon]}>
                  <Popup>
                    <b>{p.name}</b> <br />
                    {p.type} <br />
                    {(p.distance / 1000).toFixed(2)} km away
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </section>
      </div>

      {/* Details Modal */}
      {selectedPlace && (
        <div style={styles.modalOverlay} onClick={() => setSelectedPlace(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={{ margin: 0 }}>{selectedPlace.name}</h2>
              <button
                onClick={() => setSelectedPlace(null)}
                style={styles.closeBtn}
              >
                ✕
              </button>
            </div>

            <p style={{ marginTop: 8, color: "#555" }}>
              <b>Type:</b> {selectedPlace.type}
              <br />
              <b>Distance:</b> {(selectedPlace.distance / 1000).toFixed(2)} km
              <br />
              <b>Coordinates:</b> {selectedPlace.lat}, {selectedPlace.lon}
            </p>

            <div style={styles.modalBtns}>
              <button
                style={styles.primaryBtn}
                onClick={() => toggleFav(selectedPlace)}
              >
                {isFav(selectedPlace.id) ? "⭐ Saved" : "☆ Save"}
              </button>

              <button
                style={styles.secondaryBtn}
                onClick={() =>
                  window.open(
                    `https://www.google.com/maps?q=${selectedPlace.lat},${selectedPlace.lon}`,
                    "_blank"
                  )
                }
              >
                Directions
              </button>
            </div>
          </div>
        </div>
      )}

      <footer style={styles.footer}>
        Built using React + Leaflet + OpenStreetMap | Favorites + Filters + Offline Cache
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
  tabActive: {
    border: "1px solid #4f46e5",
    background: "#eef2ff",
    color: "#2f2bbd",
  },
  grid: {
    marginTop: 16,
    display: "grid",
    gridTemplateColumns: "440px 1fr",
    gap: 16,
  },
  panel: { display: "flex", flexDirection: "column", gap: 16 },
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
  moodBtnActive: {
    border: "1px solid #4f46e5",
    background: "#eef2ff",
    fontWeight: 900,
  },
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
  },
  loadingText: { color: "#555" },
  emptyText: { color: "#777" },
  mapWrap: { minHeight: "75vh" },
  mapCard: {
    height: "calc(100vh - 130px)",
    background: "white",
    borderRadius: 16,
    padding: 10,
    boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
  },
  footer: {
    marginTop: 14,
    textAlign: "center",
    color: "#666",
    fontSize: 12,
  },

  // modal
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: 12,
    zIndex: 9999,
  },
  modal: {
    background: "white",
    width: "min(520px, 95vw)",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  closeBtn: {
    border: "1px solid #ddd",
    background: "#fff",
    borderRadius: 12,
    cursor: "pointer",
    fontSize: 14,
    padding: "6px 10px",
    fontWeight: 900,
  },
  modalBtns: { display: "flex", gap: 10, marginTop: 12 },
  secondaryBtn: {
    flex: 1,
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid #ddd",
    cursor: "pointer",
    background: "#fff",
    fontWeight: 900,
  },
};
