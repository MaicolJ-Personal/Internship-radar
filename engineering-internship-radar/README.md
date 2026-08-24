# Workday internship scraper

Pulls internship postings directly from Workday's own internal JSON API
(the one each company's careers *page* calls under the hood) rather than
rendering pages in a browser. Runs on a schedule via GitHub Actions and
commits the results as `listings.json`, so the intern-radar tool can read
it the same way it reads the SimplifyJobs community feed.

## Setup

1. Create a new **public** GitHub repo and push these files to it
   (public matters — it's what makes `listings.json` readable from
   `raw.githubusercontent.com` without any authentication).
2. In the repo's Settings → Actions → General, under "Workflow
   permissions," choose **Read and write permissions** (needed so the
   scheduled job can commit `listings.json` back to the repo).
3. That's it — the workflow in `.github/workflows/scrape.yml` runs
   automatically every hour. You can also trigger it manually from the
   **Actions** tab (`Scrape Workday internships` → `Run workflow`).
4. Once it's run once, your data will be readable at:
   ```
   https://raw.githubusercontent.com/<your-username>/<your-repo>/main/listings.json
   ```

## Adding more companies

Each entry in `companies.json` needs a `tenant`, `wd_host`, and `site`.
To find these for a new company:

1. Open the company's careers page and search for any posting.
2. Open browser dev tools → **Network** tab, then reload or search
   again.
3. Look for a request to a URL shaped like:
   ```
   https://<tenant>.<wd_host>.myworkdayjobs.com/wday/cxs/<tenant>/<site>/jobs
   ```
4. Copy `tenant`, `wd_host` (e.g. `wd1`, `wd5`), and `site` into a new
   entry in `companies.json`, along with a `label` and a `category`
   (`mechanical`, `civil`, `electrical`, `computer`, or `biotech` — same
   categories the intern-radar tool uses) and a `base_url` (the page
   URL you started from, without a trailing slash).
5. Run `python scrape_workday.py` locally to confirm it picks up
   postings before committing.

## Notes and etiquette

- This hits Workday's public API directly rather than scraping rendered
  HTML — it's lighter-weight than browser automation, but it's still an
  automated request pattern a company didn't necessarily design for
  outside use. The script sends a descriptive User-Agent, waits between
  requests, and caps pagination per company — please don't remove those
  safeguards or drop the delay to make it faster.
- Whether scraping a given company's careers site is allowed depends on
  that company's terms of service. This is a personal internship-search
  tool, not a redistribution service — worth keeping in mind if you
  scale this up or make the output public-facing beyond your own use.
- If a company stops returning results, it's more likely their tenant
  config changed than a bug in the script — re-run the "find the
  endpoint" steps above for that company.

## Output schema

Each entry in `listings.json` matches the job schema intern-radar
already expects:

```json
{
  "id": "workday:boeing:/job/...",
  "source": "workday",
  "company": "Boeing",
  "title": "Internship - Engineering",
  "location": "Seattle, WA",
  "url": "https://boeing.wd1.myworkdayjobs.com/en-US/INTERN/job/...",
  "updated_at": "2026-08-24T12:00:00+00:00",
  "department": "",
  "category": "mechanical"
}
```
