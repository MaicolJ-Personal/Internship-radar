import { useState, useEffect, useCallback, useRef } from "react";

// ---------- constants ----------
const CATEGORIES = [
  { id: "mechanical", label: "Mechanical / Aerospace", color: "#F5A623" },
  { id: "electrical", label: "Electrical / Hardware", color: "#3ED6B5" },
  { id: "civil", label: "Civil / Structural", color: "#8C7CF0" },
  { id: "computer", label: "Computer / Software", color: "#5FB4F0" },
  { id: "biotech", label: "Biotech / Medtech", color: "#F0709A" },
];

const DEFAULT_COMPANIES = [
  // mechanical / aerospace
  { token: "vardaspace", label: "Varda Space Industries", category: "mechanical" },
  { token: "astranis", label: "Astranis", category: "mechanical" },
  { token: "rocketlab", label: "Rocket Lab", category: "mechanical" },
  { token: "vast", label: "Vast", category: "mechanical" },
  { token: "kairospower", label: "Kairos Power", category: "mechanical" },
  // electrical / hardware
  { token: "neuralink", label: "Neuralink", category: "electrical" },
  { token: "samsungsemiconductor", label: "Samsung Semiconductor", category: "electrical" },
  { token: "markforged", label: "Markforged", category: "electrical" },
  // civil / structural
  { token: "forgen", label: "Forgen", category: "civil" },
  { token: "wight", label: "Wight & Company", category: "civil" },
  { token: "simpsongumpertzheger", label: "Simpson Gumpertz & Heger", category: "civil" },
  // computer / software
  { token: "stripe", label: "Stripe", category: "computer" },
  { token: "airbnb", label: "Airbnb", category: "computer" },
  { token: "doordash", label: "DoorDash", category: "computer" },
  { token: "robinhood", label: "Robinhood", category: "computer" },
  { token: "notion", label: "Notion", category: "computer" },
  { token: "coinbase", label: "Coinbase", category: "computer" },
  // biotech / medtech
  { token: "freenome", label: "Freenome", category: "biotech" },
  { token: "benchling", label: "Benchling", category: "biotech" },
  { token: "10xgenomics", label: "10x Genomics", category: "biotech" },
  { token: "pbinvitation", label: "Pivot Bio", category: "biotech" },
  { token: "schrdinger", label: "Schrödinger", category: "biotech" },
  { token: "noahmedical", label: "Noah Medical", category: "biotech" },
];

const ACCENT = "#F5A623"; // signal amber
const TEAL = "#3ED6B5"; // match/positive
const BG = "#0E1116";
const PANEL = "#161A22";
const LINE = "#242a35";
const TEXT = "#E7EAF0";
const SUBTEXT = "#8B93A3";

function categoryColor(id) {
  return CATEGORIES.find((c) => c.id === id)?.color || SUBTEXT;
}
function categoryLabel(id) {
  return CATEGORIES.find((c) => c.id === id)?.label || "Other";
}

// ---------- storage helpers (namespaced, personal) ----------
async function loadJSON(key, fallback) {
  try {
    const r = await window.storage.get(key, false);
    return r ? JSON.parse(r.value) : fallback;
  } catch {
    return fallback;
  }
}
async function saveJSON(key, value) {
  try {
    await window.storage.set(key, JSON.stringify(value), false);
  } catch (e) {
    console.error("storage set failed", key, e);
  }
}

// ---------- Greenhouse fetch ----------
async function fetchGreenhouseJobs(token) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(
    token
  )}/jobs?content=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${token}: HTTP ${res.status}`);
  const data = await res.json();
  return (data.jobs || []).map((j) => ({
    id: `gh:${token}:${j.id}`,
    source: "greenhouse",
    company: token,
    title: j.title,
    location: j.location?.name || "Unspecified",
    url: j.absolute_url,
    updated_at: j.updated_at,
    department: (j.departments && j.departments[0]?.name) || "",
  }));
}

function isInternship(title) {
  return /intern(ship)?\b/i.test(title) && !/international/i.test(title);
}

// ---------- community feed (SimplifyJobs Summer2027-Internships) ----------
// Community-maintained list that already scrapes hundreds of companies
// across every ATS (Greenhouse, Lever, Workday, iCIMS, etc), not just the
// ones we track individually. Covers software/hardware-leaning roles.
const SIMPLIFY_FEED_URL =
  "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json";

const HARDWARE_KEYWORDS =
  /\b(hardware|electrical|firmware|embedded|pcb|rf engineer|asic|fpga|silicon|circuit|analog|semiconductor|power electronics)\b/i;
const SOFTWARE_KEYWORDS =
  /\b(software|swe|backend|front.?end|full.?stack|mobile|ios|android|web develop|devops|site reliability|data engineer|machine learning|ml engineer|ai engineer|infrastructure engineer|platform engineer|computer science|cloud engineer|systems engineer|security engineer)\b/i;

function classifyFeedTitle(title) {
  if (HARDWARE_KEYWORDS.test(title)) return "electrical";
  if (SOFTWARE_KEYWORDS.test(title)) return "computer";
  return null; // out of scope for this tool (PM, quant, data science-only, etc)
}

async function fetchSimplifyFeed() {
  const res = await fetch(SIMPLIFY_FEED_URL);
  if (!res.ok) throw new Error(`Simplify feed: HTTP ${res.status}`);
  const data = await res.json();
  const out = [];
  for (const entry of data) {
    if (!entry.active || entry.is_visible === false) continue;
    if (!isInternship(entry.title)) continue;
    const category = classifyFeedTitle(entry.title);
    if (!category) continue;
    out.push({
      id: `simplify:${entry.id}`,
      source: "simplify",
      company: entry.company_name,
      title: entry.title,
      location: (entry.locations && entry.locations.join(", ")) || "Unspecified",
      url: entry.url,
      updated_at: new Date((entry.date_updated || entry.date_posted || 0) * 1000).toISOString(),
      department: "",
      category,
    });
  }
  return out;
}

// ---------- self-hosted Workday feed ----------
// Fill this in once your workday-scraper repo (see README.md in that
// project) has run at least once via its GitHub Action. Format:
// https://raw.githubusercontent.com/<you>/<repo>/main/listings.json
const WORKDAY_FEED_URL = ""; // e.g. "https://raw.githubusercontent.com/yourname/workday-scraper/main/listings.json"

async function fetchWorkdayFeed() {
  if (!WORKDAY_FEED_URL) return [];
  const res = await fetch(WORKDAY_FEED_URL);
  if (!res.ok) throw new Error(`Workday feed: HTTP ${res.status}`);
  const data = await res.json();
  return (data || []).filter((j) => isInternship(j.title));
}

// ---------- find a company's Greenhouse token via web search ----------
async function findGreenhouseToken(companyName) {
  const prompt = `Find the Greenhouse job board token for the company "${companyName}".

Companies that use Greenhouse have a public job board at boards.greenhouse.io/<token> or job-boards.greenhouse.io/<token>. Search the web for this company's careers page or Greenhouse board and identify the exact token — the URL slug right after boards.greenhouse.io/, lowercase, no spaces.

Respond with ONLY a JSON object, no prose, no markdown fences, in this exact shape:
{"token": "the-token-here", "confidence": "high"}
or, if you cannot find a Greenhouse board for this company:
{"token": null, "confidence": "none"}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search_20250305", name: "web_search" }],
    }),
  });
  const data = await response.json();
  const textBlocks = (data.content || []).filter((b) => b.type === "text");
  const lastText = textBlocks[textBlocks.length - 1];
  if (!lastText) throw new Error("No text response from token lookup");
  const clean = lastText.text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ---------- Anthropic call for resume matching ----------
async function scoreJobsAgainstResume(resumeText, jobs) {
  const jobList = jobs
    .slice(0, 25)
    .map((j, i) => `${i}. [${j.company}] ${j.title} — ${j.location}`)
    .join("\n");

  const prompt = `You are matching a student's resume against a list of engineering internship postings.

RESUME:
"""
${resumeText.slice(0, 6000)}
"""

JOB POSTINGS (index. [company] title — location):
${jobList}

For EACH job by index, output a match score from 0-100 (how well the resume's demonstrated skills, projects, and experience fit that role/title/location) and a one-sentence reason (max 20 words, specific, no fluff).

Respond with ONLY a JSON array, no prose, no markdown fences, in this exact shape:
[{"index":0,"score":78,"reason":"..."}]`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await response.json();
  const textBlock = (data.content || []).find((b) => b.type === "text");
  if (!textBlock) throw new Error("No text response from matching model");
  const clean = textBlock.text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ---------- small UI atoms ----------
function ScanDot({ active }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: active ? ACCENT : "#3a4150",
        boxShadow: active ? `0 0 8px ${ACCENT}` : "none",
        marginRight: 8,
        transition: "all .3s",
      }}
    />
  );
}

function Badge({ children, tone = "default", customColor }) {
  const styles = {
    default: { color: SUBTEXT, borderColor: LINE },
    new: { color: BG, background: ACCENT, borderColor: ACCENT },
    match: { color: BG, background: TEAL, borderColor: TEAL },
    category: { color: customColor, borderColor: customColor },
  };
  const s = styles[tone];
  return (
    <span
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10.5,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        padding: "2px 7px",
        borderRadius: 4,
        border: `1px solid ${s.borderColor}`,
        color: s.color,
        background: s.background || "transparent",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function GuideStep({ n, title, children }) {
  return (
    <div style={{ display: "flex", gap: 16, marginBottom: 22 }}>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 13,
          color: ACCENT,
          fontWeight: 700,
          width: 26,
          flexShrink: 0,
          paddingTop: 2,
        }}
      >
        {n}
      </div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 13.5, color: SUBTEXT, lineHeight: 1.65 }}>{children}</div>
      </div>
    </div>
  );
}

function GuideTab() {
  const codeStyle = {
    fontFamily: "'JetBrains Mono', monospace",
    background: BG,
    border: `1px solid ${LINE}`,
    borderRadius: 5,
    padding: "1px 6px",
    fontSize: 12.5,
    color: TEAL,
  };
  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
        Finding a company's Greenhouse board token
      </div>
      <div style={{ fontSize: 13.5, color: SUBTEXT, marginBottom: 12, lineHeight: 1.6 }}>
        Computer and Electrical/Hardware roles are pulled automatically from
        a community-maintained feed that already covers hundreds of
        companies — no token needed for those. Mechanical, Civil, and
        Biotech/Medtech still rely on tracking individual Greenhouse boards,
        since there's no equivalent community feed for those disciplines
        yet. Every company on Greenhouse has a public job board at{" "}
        <span style={codeStyle}>boards.greenhouse.io/&lt;token&gt;</span>. On
        the Scanner tab, typing a company name into "find & add company" does
        this lookup for you automatically — it searches the web for the
        board, verifies it resolves, and adds it if it works.
      </div>
      <div
        style={{
          fontSize: 13,
          color: SUBTEXT,
          marginBottom: 26,
          lineHeight: 1.6,
          padding: 14,
          background: PANEL,
          border: `1px solid ${LINE}`,
          borderRadius: 8,
        }}
      >
        That lookup isn't perfect — smaller or newer companies sometimes
        won't turn up, or the wrong token gets suggested and fails
        verification. When that happens, "enter a board token directly" on
        the Scanner tab is the fallback, and the steps below walk through
        finding one by hand.
      </div>

      <GuideStep n="01" title="Open the company's careers page">
        Go to the "Careers" or "Jobs" link on the company's website. Many
        companies embed Greenhouse directly, so the URL in your browser might
        already show it.
      </GuideStep>

      <GuideStep n="02" title="Check the URL for the Greenhouse pattern">
        Look for <span style={codeStyle}>boards.greenhouse.io/company-name</span>{" "}
        or <span style={codeStyle}>job-boards.greenhouse.io/company-name</span>.
        Everything after the last slash (before any <span style={codeStyle}>?</span>{" "}
        or job ID) is the token — e.g. in{" "}
        <span style={codeStyle}>boards.greenhouse.io/stripe</span>, the token
        is <span style={codeStyle}>stripe</span>.
      </GuideStep>

      <GuideStep n="03" title="If the careers page looks custom, view page source">
        Some companies skin Greenhouse to match their branding, so the URL
        won't show it. Right-click → "View Page Source" (or Cmd/Ctrl+U) and
        search (Cmd/Ctrl+F) for <span style={codeStyle}>greenhouse</span>. You'll
        usually find a link or script pointing to{" "}
        <span style={codeStyle}>boards-api.greenhouse.io/v1/boards/&lt;token&gt;</span>{" "}
        or an embed tag with the token in it.
      </GuideStep>

      <GuideStep n="04" title="Try the token directly">
        Once you have a candidate token, test it by visiting{" "}
        <span style={codeStyle}>
          https://boards.greenhouse.io/&lt;token&gt;
        </span>{" "}
        in a new tab. If it loads a job list, it's correct — paste it into the
        "add company" box on the Scanner tab.
      </GuideStep>

      <GuideStep n="05" title="Not every company uses Greenhouse">
        Some use Lever, Ashby, or SmartRecruiters (each with their own public
        board format), and many larger or older engineering firms — especially
        in civil and industrial engineering — run on Workday, which doesn't
        expose a scrapeable public board. For those, use the "add manually"
        panel on the Scanner tab so the postings still show up alongside
        everything else.
      </GuideStep>

      <div
        style={{
          marginTop: 8,
          padding: 16,
          background: PANEL,
          border: `1px solid ${LINE}`,
          borderRadius: 8,
          fontSize: 12.5,
          color: SUBTEXT,
          lineHeight: 1.6,
        }}
      >
        <b style={{ color: TEXT }}>Quick sanity check:</b> if a token you add
        shows a red "no board" flag in the sidebar, the token is either wrong
        or that company doesn't run a public Greenhouse board — double-check
        step 4 above before assuming it's broken.
      </div>
    </div>
  );
}

export default function InternRadar() {
  const [activeTab, setActiveTab] = useState("scanner"); // 'scanner' | 'guide'
  const [companies, setCompanies] = useState(DEFAULT_COMPANIES);
  const [companyNameInput, setCompanyNameInput] = useState("");
  const [newCategory, setNewCategory] = useState("computer");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [showManualToken, setShowManualToken] = useState(false);
  const [newToken, setNewToken] = useState("");
  const [jobs, setJobs] = useState([]);
  const [seenIds, setSeenIds] = useState(new Set());
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [locationFilter, setLocationFilter] = useState("");
  const [keywordFilter, setKeywordFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [resumeText, setResumeText] = useState("");
  const [matches, setMatches] = useState(null);
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState("");
  const [manualEntries, setManualEntries] = useState([]);
  const [manualForm, setManualForm] = useState({
    company: "",
    title: "",
    location: "",
    url: "",
    category: "computer",
  });
  const [showManualForm, setShowManualForm] = useState(false);
  const [lastScan, setLastScan] = useState(null);
  const [feedJobs, setFeedJobs] = useState([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [feedLastFetch, setFeedLastFetch] = useState(null);
  const initialized = useRef(false);

  useEffect(() => {
    (async () => {
      const [storedCompanies, storedSeen, storedResume, storedManual] =
        await Promise.all([
          loadJSON("companies", null),
          loadJSON("seen-ids", []),
          loadJSON("resume-text", ""),
          loadJSON("manual-entries", []),
        ]);
      if (storedCompanies) setCompanies(storedCompanies);
      setSeenIds(new Set(storedSeen));
      setResumeText(storedResume);
      setManualEntries(storedManual);
      initialized.current = true;
      runScan(storedCompanies || DEFAULT_COMPANIES, new Set(storedSeen));
      runFeedFetch();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runFeedFetch = useCallback(async () => {
    setFeedLoading(true);
    setFeedError("");
    try {
      const [simplify, workday] = await Promise.all([
        fetchSimplifyFeed().catch(() => {
          throw new Error("simplify");
        }),
        fetchWorkdayFeed().catch(() => []), // don't fail the whole fetch if the optional feed is unset/down
      ]);
      setFeedJobs([...simplify, ...workday]);
      setFeedLastFetch(new Date());
    } catch (e) {
      setFeedError("Community feed unavailable right now — showing tracked companies only.");
    }
    setFeedLoading(false);
  }, []);

  const runScan = useCallback(async (companyList, seenSet) => {
    setLoading(true);
    setErrors([]);
    const results = [];
    const errs = [];
    for (const c of companyList) {
      try {
        const jl = await fetchGreenhouseJobs(c.token);
        results.push(...jl.filter((j) => isInternship(j.title)));
      } catch (e) {
        errs.push(c.token);
      }
    }
    results.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    setJobs(results);
    setErrors(errs);
    setLoading(false);
    setLastScan(new Date());
  }, []);

  const handleRescan = () => {
    runScan(companies, seenIds);
    runFeedFetch();
  };

  const addCompanyByToken = async (token, label, category) => {
    const t = token.trim().toLowerCase().replace(/\s+/g, "-");
    if (!t || companies.some((c) => c.token === t)) return false;
    const updated = [...companies, { token: t, label: label || t, category }];
    setCompanies(updated);
    await saveJSON("companies", updated);
    runScan(updated, seenIds);
    return true;
  };

  const handleFindAndAddCompany = async () => {
    const name = companyNameInput.trim();
    if (!name) return;
    setLookupError("");
    setLookupLoading(true);
    try {
      const result = await findGreenhouseToken(name);
      if (!result.token) {
        setLookupError(
          `Couldn't find a Greenhouse board for "${name}" — it may use a different ATS (Workday, Lever, etc). Add it manually instead, or enter the token directly below.`
        );
        setLookupLoading(false);
        return;
      }
      // verify the token actually resolves before adding it
      try {
        await fetchGreenhouseJobs(result.token);
      } catch {
        setLookupError(
          `Found a likely token ("${result.token}") but it didn't resolve — enter the token directly below if you know it.`
        );
        setLookupLoading(false);
        return;
      }
      const added = await addCompanyByToken(result.token, name, newCategory);
      if (!added) {
        setLookupError(`"${result.token}" is already tracked.`);
      } else {
        setCompanyNameInput("");
      }
    } catch (e) {
      setLookupError("Lookup failed — try again, or enter the token directly below.");
    }
    setLookupLoading(false);
  };

  const handleAddCompany = async () => {
    const added = await addCompanyByToken(newToken, newToken.trim().toLowerCase(), newCategory);
    if (added) setNewToken("");
  };

  const handleRemoveCompany = async (token) => {
    const updated = companies.filter((c) => c.token !== token);
    setCompanies(updated);
    await saveJSON("companies", updated);
    setJobs((prev) => prev.filter((j) => j.company !== token));
  };

  const handleMarkAllSeen = async () => {
    const ids = new Set(seenIds);
    jobs.forEach((j) => ids.add(j.id));
    feedJobs.forEach((j) => ids.add(j.id));
    setSeenIds(ids);
    await saveJSON("seen-ids", Array.from(ids));
  };

  const handleResumeSave = async (text) => {
    setResumeText(text);
    await saveJSON("resume-text", text);
  };

  const handleAddManual = async () => {
    if (!manualForm.title.trim() || !manualForm.company.trim()) return;
    const entry = {
      id: `manual:${Date.now()}`,
      source: "manual",
      company: manualForm.company,
      title: manualForm.title,
      location: manualForm.location || "Unspecified",
      url: manualForm.url,
      updated_at: new Date().toISOString(),
      department: "",
      category: manualForm.category,
    };
    const updated = [entry, ...manualEntries];
    setManualEntries(updated);
    await saveJSON("manual-entries", updated);
    setManualForm({ company: "", title: "", location: "", url: "", category: "computer" });
    setShowManualForm(false);
  };

  const handleRemoveManual = async (id) => {
    const updated = manualEntries.filter((m) => m.id !== id);
    setManualEntries(updated);
    await saveJSON("manual-entries", updated);
  };

  const companyCategory = (token) =>
    companies.find((c) => c.token === token)?.category || "computer";

  const greenhouseAndManual = [...manualEntries, ...jobs].map((j) => ({
    ...j,
    category: j.category || companyCategory(j.company),
  }));

  const seenKeys = new Set(
    greenhouseAndManual.map((j) => `${j.company}::${j.title}`.toLowerCase())
  );
  const dedupedFeedJobs = feedJobs.filter(
    (j) => !seenKeys.has(`${j.company}::${j.title}`.toLowerCase())
  );

  const allJobs = [...greenhouseAndManual, ...dedupedFeedJobs];

  const filtered = allJobs.filter((j) => {
    const locOk =
      !locationFilter ||
      j.location.toLowerCase().includes(locationFilter.toLowerCase());
    const kwOk =
      !keywordFilter ||
      (j.title + " " + j.department)
        .toLowerCase()
        .includes(keywordFilter.toLowerCase());
    const catOk = categoryFilter === "all" || j.category === categoryFilter;
    return locOk && kwOk && catOk;
  });

  const handleMatch = async () => {
    if (!resumeText.trim()) {
      setMatchError("Paste your resume text first.");
      return;
    }
    setMatching(true);
    setMatchError("");
    try {
      const scored = await scoreJobsAgainstResume(resumeText, filtered);
      const map = {};
      scored.forEach((s) => (map[s.index] = s));
      setMatches(map);
    } catch (e) {
      setMatchError("Matching failed — try again in a moment.");
    }
    setMatching(false);
  };

  const displayJobs = matches
    ? filtered
        .map((j, i) => ({ ...j, _match: matches[i] }))
        .sort((a, b) => (b._match?.score || -1) - (a._match?.score || -1))
    : filtered;

  const companiesByCategory = CATEGORIES.map((cat) => ({
    ...cat,
    companies: companies.filter((c) => c.category === cat.id),
  }));

  return (
    <div
      style={{
        fontFamily: "'Inter', -apple-system, sans-serif",
        background: BG,
        color: TEXT,
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <link
        rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/jetbrains-mono/2.304/jetbrains-mono.min.css"
      />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
      />

      {/* header */}
      <div
        style={{
          borderBottom: `1px solid ${LINE}`,
          padding: "22px 28px 0",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ paddingBottom: 18 }}>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              color: ACCENT,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            intern radar
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }}>
            Engineering internship scanner
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, paddingBottom: 18 }}>
          {activeTab === "scanner" && (
            <>
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11.5,
                  color: SUBTEXT,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <ScanDot active={loading || feedLoading} />
                {loading || feedLoading
                  ? "scanning…"
                  : lastScan
                  ? `last scan ${lastScan.toLocaleTimeString()}`
                  : "idle"}
              </div>
              <button
                onClick={handleRescan}
                disabled={loading || feedLoading}
                style={{
                  background: "transparent",
                  border: `1px solid ${ACCENT}`,
                  color: ACCENT,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12,
                  padding: "8px 14px",
                  borderRadius: 6,
                  cursor: loading || feedLoading ? "default" : "pointer",
                  opacity: loading || feedLoading ? 0.5 : 1,
                }}
              >
                rescan now
              </button>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: 4, width: "100%" }}>
          {[
            { id: "scanner", label: "Scanner" },
            { id: "guide", label: "Find board tokens" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                background: "transparent",
                border: "none",
                borderBottom:
                  activeTab === t.id ? `2px solid ${ACCENT}` : "2px solid transparent",
                color: activeTab === t.id ? TEXT : SUBTEXT,
                fontSize: 13,
                fontWeight: 600,
                padding: "0 4px 12px",
                marginRight: 20,
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "guide" ? (
        <div style={{ padding: "28px" }}>
          <GuideTab />
        </div>
      ) : (
        <div style={{ display: "flex", flex: 1, minHeight: 0, flexWrap: "wrap" }}>
          {/* sidebar */}
          <div
            style={{
              width: 300,
              minWidth: 270,
              borderRight: `1px solid ${LINE}`,
              padding: "22px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 22,
            }}
          >
            <div>
              <div style={sectionLabel}>tracked companies (greenhouse)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {companiesByCategory
                  .filter((cat) => cat.companies.length > 0)
                  .map((cat) => (
                    <div key={cat.id}>
                      <div
                        style={{
                          fontSize: 10.5,
                          fontFamily: "'JetBrains Mono', monospace",
                          color: cat.color,
                          marginBottom: 5,
                          letterSpacing: 0.3,
                        }}
                      >
                        {cat.label}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {cat.companies.map((c) => (
                          <div
                            key={c.token}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              background: PANEL,
                              border: `1px solid ${LINE}`,
                              borderRadius: 6,
                              padding: "6px 10px",
                              fontSize: 13,
                            }}
                          >
                            <span
                              style={{
                                color: errors.includes(c.token) ? "#e05a5a" : TEXT,
                              }}
                            >
                              {c.token}
                              {errors.includes(c.token) && (
                                <span style={{ color: "#e05a5a", fontSize: 10.5, marginLeft: 6 }}>
                                  no board
                                </span>
                              )}
                            </span>
                            <button
                              onClick={() => handleRemoveCompany(c.token)}
                              style={removeBtnStyle}
                              title="Remove"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                <input
                  value={companyNameInput}
                  onChange={(e) => setCompanyNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !lookupLoading && handleFindAndAddCompany()}
                  placeholder="company name"
                  style={inputStyle}
                />
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  style={{ ...inputStyle, flex: "0 0 auto", cursor: "pointer" }}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleFindAndAddCompany}
                disabled={lookupLoading}
                style={{
                  ...addBtnStyleFull,
                  marginTop: 6,
                  opacity: lookupLoading ? 0.6 : 1,
                  cursor: lookupLoading ? "default" : "pointer",
                }}
              >
                {lookupLoading ? "looking up token…" : "find & add company"}
              </button>

              {lookupError && (
                <div style={{ fontSize: 11.5, color: "#e0a15a", marginTop: 8, lineHeight: 1.5 }}>
                  {lookupError}
                </div>
              )}

              <div style={{ fontSize: 11, color: SUBTEXT, marginTop: 8 }}>
                <span
                  onClick={() => setShowManualToken((v) => !v)}
                  style={{ color: ACCENT, cursor: "pointer", textDecoration: "underline" }}
                >
                  {showManualToken ? "hide" : "enter a board token directly"}
                </span>
              </div>

              {showManualToken && (
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <input
                    value={newToken}
                    onChange={(e) => setNewToken(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddCompany()}
                    placeholder="board token"
                    style={inputStyle}
                  />
                  <button onClick={handleAddCompany} style={addBtnStyle}>
                    add
                  </button>
                </div>
              )}

              <div style={{ fontSize: 11, color: SUBTEXT, marginTop: 6, lineHeight: 1.5 }}>
                Not sure what a board token is? See the{" "}
                <span
                  onClick={() => setActiveTab("guide")}
                  style={{ color: ACCENT, cursor: "pointer", textDecoration: "underline" }}
                >
                  Find board tokens
                </span>{" "}
                tab.
              </div>
            </div>

            <div>
              <div style={sectionLabel}>filters</div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{ ...inputStyle, width: "100%", marginBottom: 8, cursor: "pointer" }}
              >
                <option value="all">All disciplines</option>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <input
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                placeholder="location contains…"
                style={{ ...inputStyle, width: "100%", marginBottom: 8 }}
              />
              <input
                value={keywordFilter}
                onChange={(e) => setKeywordFilter(e.target.value)}
                placeholder="title/dept keyword…"
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>

            <div>
              <div style={sectionLabel}>community feed (computer & electrical)</div>
              <div style={{ fontSize: 11.5, color: SUBTEXT, lineHeight: 1.6, marginBottom: 6 }}>
                Software and hardware roles are also pulled from{" "}
                <a
                  href="https://github.com/SimplifyJobs/Summer2027-Internships"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: ACCENT }}
                >
                  SimplifyJobs/Summer2027-Internships
                </a>
                , a community-maintained list that scrapes hundreds of
                companies across every ATS — not just the ones tracked on the
                left. A separate self-hosted Workday scraper (see the
                companion "workday-scraper" project) can plug in here too for
                mechanical, civil, and biotech companies on Workday — set its
                URL in <code>WORKDAY_FEED_URL</code> once that repo's Action
                has run.
              </div>
              <div style={{ fontSize: 11, color: SUBTEXT }}>
                {feedLoading
                  ? "fetching…"
                  : feedLastFetch
                  ? `${feedJobs.length} roles · fetched ${feedLastFetch.toLocaleTimeString()}`
                  : "not fetched yet"}
              </div>
              {feedError && (
                <div style={{ fontSize: 11.5, color: "#e0a15a", marginTop: 6, lineHeight: 1.5 }}>
                  {feedError}
                </div>
              )}
            </div>

            <div>
              <div style={sectionLabel}>workday & other sources</div>
              <div style={{ fontSize: 11.5, color: SUBTEXT, lineHeight: 1.6, marginBottom: 8 }}>
                Workday and most one-off career pages block browser scraping —
                add postings you find there manually and they'll be scored
                alongside everything else.
              </div>
              {!showManualForm ? (
                <button onClick={() => setShowManualForm(true)} style={addBtnStyleFull}>
                  + add manually
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <input
                    placeholder="company"
                    value={manualForm.company}
                    onChange={(e) => setManualForm({ ...manualForm, company: e.target.value })}
                    style={{ ...inputStyle, width: "100%" }}
                  />
                  <input
                    placeholder="role title"
                    value={manualForm.title}
                    onChange={(e) => setManualForm({ ...manualForm, title: e.target.value })}
                    style={{ ...inputStyle, width: "100%" }}
                  />
                  <input
                    placeholder="location"
                    value={manualForm.location}
                    onChange={(e) => setManualForm({ ...manualForm, location: e.target.value })}
                    style={{ ...inputStyle, width: "100%" }}
                  />
                  <input
                    placeholder="posting url (optional)"
                    value={manualForm.url}
                    onChange={(e) => setManualForm({ ...manualForm, url: e.target.value })}
                    style={{ ...inputStyle, width: "100%" }}
                  />
                  <select
                    value={manualForm.category}
                    onChange={(e) => setManualForm({ ...manualForm, category: e.target.value })}
                    style={{ ...inputStyle, width: "100%", cursor: "pointer" }}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={handleAddManual} style={addBtnStyle}>
                      save
                    </button>
                    <button
                      onClick={() => setShowManualForm(false)}
                      style={{ ...addBtnStyle, borderColor: LINE, color: SUBTEXT }}
                    >
                      cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* main */}
          <div style={{ flex: 1, minWidth: 320, padding: "22px 28px" }}>
            {/* resume matcher */}
            <div
              style={{
                background: PANEL,
                border: `1px solid ${LINE}`,
                borderRadius: 10,
                padding: 18,
                marginBottom: 22,
              }}
            >
              <div style={{ ...sectionLabel, marginBottom: 10 }}>resume match</div>
              <textarea
                value={resumeText}
                onChange={(e) => handleResumeSave(e.target.value)}
                placeholder="Paste your resume text here — skills, projects, coursework, past roles…"
                style={{
                  width: "100%",
                  minHeight: 90,
                  background: BG,
                  border: `1px solid ${LINE}`,
                  borderRadius: 6,
                  color: TEXT,
                  fontSize: 13,
                  padding: 10,
                  fontFamily: "'Inter', sans-serif",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
                <button
                  onClick={handleMatch}
                  disabled={matching}
                  style={{
                    background: TEAL,
                    border: "none",
                    color: "#08211b",
                    fontWeight: 600,
                    fontSize: 13,
                    padding: "9px 16px",
                    borderRadius: 6,
                    cursor: matching ? "default" : "pointer",
                    opacity: matching ? 0.6 : 1,
                  }}
                >
                  {matching ? "scoring…" : `score ${filtered.length} listed jobs`}
                </button>
                {matches && (
                  <button
                    onClick={() => setMatches(null)}
                    style={{
                      background: "transparent",
                      border: `1px solid ${LINE}`,
                      color: SUBTEXT,
                      fontSize: 12,
                      padding: "8px 12px",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    clear scores
                  </button>
                )}
                {matchError && <span style={{ color: "#e05a5a", fontSize: 12 }}>{matchError}</span>}
              </div>
              <div style={{ fontSize: 11, color: SUBTEXT, marginTop: 8 }}>
                Scoring uses Claude to compare your resume against currently
                filtered postings (max 25 at a time). Nothing leaves your
                browser except the resume text sent for scoring.
              </div>
            </div>

            {/* job list header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <div style={{ fontSize: 13, color: SUBTEXT }}>
                {displayJobs.length} internship{displayJobs.length === 1 ? "" : "s"} listed
              </div>
              {(jobs.some((j) => !seenIds.has(j.id)) ||
                feedJobs.some((j) => !seenIds.has(j.id))) && (
                <button onClick={handleMarkAllSeen} style={{ ...addBtnStyle }}>
                  mark all seen
                </button>
              )}
            </div>

            {/* job cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {displayJobs.length === 0 && !loading && (
                <div style={{ color: SUBTEXT, fontSize: 13, padding: "20px 0" }}>
                  No postings match right now. Try clearing filters, adding
                  more companies, or rescanning.
                </div>
              )}
              {displayJobs.map((j) => {
                const isNew =
                  (j.source === "greenhouse" || j.source === "simplify" || j.source === "workday") &&
                  !seenIds.has(j.id);
                return (
                  <a
                    key={j.id}
                    href={j.url || undefined}
                    target={j.url ? "_blank" : undefined}
                    rel="noreferrer"
                    style={{
                      display: "block",
                      background: PANEL,
                      border: `1px solid ${LINE}`,
                      borderRadius: 8,
                      padding: "14px 16px",
                      textDecoration: "none",
                      color: TEXT,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 3 }}>
                          {j.title}
                        </div>
                        <div style={{ fontSize: 12.5, color: SUBTEXT }}>
                          {j.company} · {j.location}
                          {j.department ? ` · ${j.department}` : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <Badge tone="category" customColor={categoryColor(j.category)}>
                          {categoryLabel(j.category).split(" / ")[0]}
                        </Badge>
                        {j._match && <Badge tone="match">{j._match.score}% fit</Badge>}
                        {isNew && <Badge tone="new">new</Badge>}
                        {j.source === "manual" && <Badge>manual</Badge>}
                        {j.source === "simplify" && <Badge>community feed</Badge>}
                        {j.source === "workday" && <Badge>workday feed</Badge>}
                      </div>
                    </div>
                    {j._match?.reason && (
                      <div style={{ fontSize: 12, color: TEAL, marginTop: 8, lineHeight: 1.5 }}>
                        {j._match.reason}
                      </div>
                    )}
                    {j.source === "manual" && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          handleRemoveManual(j.id);
                        }}
                        style={{ ...removeBtnStyle, marginTop: 8 }}
                      >
                        remove
                      </button>
                    )}
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const sectionLabel = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 10.5,
  letterSpacing: 0.8,
  textTransform: "uppercase",
  color: SUBTEXT,
  marginBottom: 10,
};

const inputStyle = {
  background: BG,
  border: `1px solid ${LINE}`,
  borderRadius: 6,
  color: TEXT,
  fontSize: 12.5,
  padding: "7px 9px",
  outline: "none",
  boxSizing: "border-box",
  flex: 1,
};

const addBtnStyle = {
  background: "transparent",
  border: `1px solid ${ACCENT}`,
  color: ACCENT,
  fontSize: 12,
  padding: "7px 12px",
  borderRadius: 6,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const addBtnStyleFull = { ...addBtnStyle, width: "100%" };

const removeBtnStyle = {
  background: "transparent",
  border: "none",
  color: SUBTEXT,
  fontSize: 16,
  lineHeight: 1,
  cursor: "pointer",
  padding: "0 4px",
};
