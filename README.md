# Smart Nearby Places Recommender 🗺️

A location-based web application that recommends nearby places based on user mood using **OpenStreetMap + Overpass API**.  
Built with **React + Leaflet** and includes filters, sorting, favorites, offline caching and place details.

## 🔗 Links
- Live Demo: https://smartnearby-placesrecommender.netlify.app/
- GitHub Repo: https://github.com/Charanvitha/smart-nearby-places-recommender

---

## 🚀 Features
- 📍 Real-time location detection (with fallback location)
- 😊 Mood-based place recommendations:
  - Work → cafés, libraries, coworking spaces
  - Quick Bite → fast food, restaurants
  - Budget → budget-friendly eateries (best-effort)
  - Tourist → tourist attractions & sightseeing spots
  - Stay → hotels / guest houses (for travel stay)
- 🎯 "Top match for your mood" smart suggestion banner
- 🧭 Filters & Sorting:
  - Distance (1 / 3 / 5 / 10 / 20 km)
  - Sort by relevance / distance / A-Z / rating
  - Search results by place name
- ⭐ Favorites / Saved Places tab (localStorage)
- 📝 Reviews system (users can give ratings + feedback)
- 📌 Place details panel
- 📤 Share on WhatsApp
- 📍 Directions button (opens Google Maps)
- 💾 Offline support: caches last search results

---

## 🛠️ Tech Stack
- React.js
- Leaflet + React Leaflet (OpenStreetMap tiles)
- Overpass API (place discovery)
- localStorage (favorites + offline cache + reviews)

---

## 📦 Installation & Run
```bash
npm install
npm start




