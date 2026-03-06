const propertiesEl = document.getElementById("properties");
const form = document.getElementById("search-form");
const statsEl = document.getElementById("stats");
const listingCountEl = document.getElementById("listing-count");

const formatNgn = (value) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);

const renderProperties = (items) => {
  listingCountEl.textContent = `${items.length} property listing(s) found`;
  propertiesEl.innerHTML = items
    .map(
      (p) => `
    <article class="card">
      <img src="${p.image}" alt="${p.title}" loading="lazy" />
      <div class="card-content">
        <h3>${p.title}</h3>
        <p>${p.area} • ${p.type} • For ${p.purpose}</p>
        <p><strong>${formatNgn(p.priceNgn)}</strong></p>
        <p>${p.beds || "-"} beds • ${p.baths || "-"} baths • ${p.sizeSqm} sqm</p>
        <p>${p.description}</p>
        <div class="badges">
          ${p.verified ? '<span class="badge">Verified</span>' : '<span class="badge">Unverified</span>'}
          <span class="badge">ROI ${p.roiPercent}%</span>
          <span class="badge">Yield ${p.rentYieldPercent}%</span>
          ${p.diasporaReady ? '<span class="badge">Diaspora Ready</span>' : ""}
          ${p.remoteInspection ? '<span class="badge">Remote Inspection</span>' : ""}
        </div>
      </div>
    </article>
  `
    )
    .join("");
};

const loadIntelligence = async () => {
  const response = await fetch("/api/intelligence/summary");
  const data = await response.json();

  statsEl.innerHTML = `
    <div class="stat"><small>Tracked Listings</small><h3>${data.trackedListings}</h3></div>
    <div class="stat"><small>Verified Listings</small><h3>${data.verifiedCount}</h3></div>
    <div class="stat"><small>Avg ROI</small><h3>${data.averageRoiPercent}%</h3></div>
    <div class="stat"><small>Avg Yield</small><h3>${data.averageYieldPercent}%</h3></div>
  `;
};

const loadProperties = async (params = new URLSearchParams()) => {
  const response = await fetch(`/api/properties?${params.toString()}`);
  const data = await response.json();
  renderProperties(data.results || []);
};

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const params = new URLSearchParams();
  ["q", "purpose", "type", "minPrice", "maxPrice", "sort"].forEach((id) => {
    const value = document.getElementById(id).value;
    if (value) params.set(id, value);
  });
  if (document.getElementById("verified").checked) params.set("verified", "true");
  if (document.getElementById("diasporaReady").checked) params.set("diasporaReady", "true");

  loadProperties(params);
});

document.getElementById("listing-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target).entries());
  const response = await fetch("/api/listings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  document.getElementById("listing-feedback").textContent = data.message || data.error;
  if (response.ok) event.target.reset();
});

document.getElementById("inquiry-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(event.target);
  const payload = Object.fromEntries(formData.entries());
  payload.diasporaBuyer = formData.get("diasporaBuyer") === "on";

  const response = await fetch("/api/inquiries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  document.getElementById("inquiry-feedback").textContent = data.message || data.error;
  if (response.ok) event.target.reset();
});

loadIntelligence();
loadProperties();
