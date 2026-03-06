const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const properties = require("./data/properties");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const inquiries = [];
const listings = [];
const requestCounts = new Map();

const parseNumber = (value) => {
  if (value === null || value === undefined || value === "") return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const sendJson = (res, status, payload) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
};

const sendFile = (res, filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
  };

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(data);
  });
};

const parseBody = (req) =>
  new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) reject(new Error("Payload too large"));
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });

const handleRateLimit = (req, res) => {
  const ip = req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const minute = 60000;
  const maxRequests = 120;

  const entry = requestCounts.get(ip) || { count: 0, start: now };
  if (now - entry.start > minute) {
    entry.count = 0;
    entry.start = now;
  }

  entry.count += 1;
  requestCounts.set(ip, entry);

  if (entry.count > maxRequests) {
    sendJson(res, 429, { error: "Too many requests. Try again soon." });
    return true;
  }
  return false;
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith("/api") && handleRateLimit(req, res)) {
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/properties") {
    const q = url.searchParams.get("q");
    const area = url.searchParams.get("area");
    const type = url.searchParams.get("type");
    const purpose = url.searchParams.get("purpose");
    const min = parseNumber(url.searchParams.get("minPrice"));
    const max = parseNumber(url.searchParams.get("maxPrice"));
    const verified = url.searchParams.get("verified");
    const diasporaReady = url.searchParams.get("diasporaReady");
    const sort = url.searchParams.get("sort") || "relevance";

    let results = properties.filter((p) => {
      const queryMatch =
        !q ||
        [p.title, p.area, p.description, ...(p.tags || [])]
          .join(" ")
          .toLowerCase()
          .includes(String(q).toLowerCase());
      const areaMatch = !area || p.area.toLowerCase() === area.toLowerCase();
      const typeMatch = !type || p.type.toLowerCase() === type.toLowerCase();
      const purposeMatch = !purpose || p.purpose === purpose;
      const minMatch = min === undefined || p.priceNgn >= min;
      const maxMatch = max === undefined || p.priceNgn <= max;
      const verifiedMatch = verified === null || String(p.verified) === verified.toLowerCase();
      const diasporaMatch =
        diasporaReady === null || String(p.diasporaReady) === diasporaReady.toLowerCase();

      return (
        queryMatch &&
        areaMatch &&
        typeMatch &&
        purposeMatch &&
        minMatch &&
        maxMatch &&
        verifiedMatch &&
        diasporaMatch
      );
    });

    const sorters = {
      newest: (a, b) => b.id.localeCompare(a.id),
      price_asc: (a, b) => a.priceNgn - b.priceNgn,
      price_desc: (a, b) => b.priceNgn - a.priceNgn,
      roi_desc: (a, b) => b.roiPercent - a.roiPercent,
      relevance: (a, b) => Number(b.verified) - Number(a.verified) || b.developerScore - a.developerScore,
    };

    results = results.sort(sorters[sort] || sorters.relevance);
    sendJson(res, 200, { total: results.length, results });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/intelligence/summary") {
    const verifiedCount = properties.filter((p) => p.verified).length;
    const avgRoi = properties.reduce((sum, p) => sum + p.roiPercent, 0) / properties.length;
    const avgYield = properties.reduce((sum, p) => sum + p.rentYieldPercent, 0) / properties.length;
    sendJson(res, 200, {
      market: "Lagos",
      trackedListings: properties.length,
      verifiedCount,
      averageRoiPercent: Number(avgRoi.toFixed(2)),
      averageYieldPercent: Number(avgYield.toFixed(2)),
      insight:
        "Prime districts in Lagos are showing strong rental demand, while verified listings outperform unverified assets in investor conversion.",
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/listings") {
    try {
      const body = await parseBody(req);
      const { title, area, type, purpose, priceNgn, contactEmail } = body;
      if (!title || !area || !type || !purpose || !priceNgn || !contactEmail) {
        sendJson(res, 400, { error: "Missing required fields for listing." });
        return;
      }
      const listing = {
        id: `user-${Date.now()}`,
        title,
        area,
        type,
        purpose,
        priceNgn: Number(priceNgn),
        contactEmail,
        verificationStatus: "pending",
        createdAt: new Date().toISOString(),
      };
      listings.push(listing);
      sendJson(res, 201, { message: "Listing submitted for verification.", listing });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/inquiries") {
    try {
      const body = await parseBody(req);
      const { propertyId, name, email, budgetNgn, message, diasporaBuyer } = body;
      if (!propertyId || !name || !email || !message) {
        sendJson(res, 400, { error: "Missing required inquiry fields." });
        return;
      }
      const inquiry = {
        id: `inq-${Date.now()}`,
        propertyId,
        name,
        email,
        budgetNgn: budgetNgn ? Number(budgetNgn) : null,
        message,
        diasporaBuyer: Boolean(diasporaBuyer),
        createdAt: new Date().toISOString(),
      };
      inquiries.push(inquiry);
      sendJson(res, 201, {
        message: "Inquiry received. Our advisory desk will contact you shortly.",
        inquiry,
      });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/metrics") {
    sendJson(res, 200, {
      inquiries: inquiries.length,
      newListings: listings.length,
      diasporaInquiries: inquiries.filter((i) => i.diasporaBuyer).length,
    });
    return;
  }

  const sanitizedPath = path.normalize(url.pathname).replace(/^\/+/, "");
  const filePath = path.join(PUBLIC_DIR, sanitizedPath);
  if (sanitizedPath && filePath.startsWith(PUBLIC_DIR) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    sendFile(res, filePath);
    return;
  }

  sendFile(res, path.join(PUBLIC_DIR, "index.html"));
});

server.listen(PORT, () => {
  console.log(`Lagos marketplace server running on http://localhost:${PORT}`);
});
