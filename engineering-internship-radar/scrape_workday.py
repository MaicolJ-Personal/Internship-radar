"""
Workday internship scraper
---------------------------
Hits each company's Workday CXS JSON API directly (the same endpoint the
company's own careers site calls under the hood) rather than rendering
pages in a browser. Paginates through results, filters for internship
titles, and writes a combined JSON file shaped to match the job schema
used by the intern-radar tool.

Usage:
    python scrape_workday.py

Reads:  companies.json
Writes: listings.json

If a company in companies.json stops returning results, Workday most
likely changed something about that tenant's site config — re-check the
Network tab on their careers page (see README.md) rather than assuming
the script is broken everywhere.
"""

import json
import re
import time
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

COMPANIES_FILE = Path(__file__).parent / "companies.json"
OUTPUT_FILE = Path(__file__).parent / "listings.json"

PAGE_SIZE = 20
REQUEST_DELAY_SECONDS = 1.0  # be polite between requests
MAX_PAGES_PER_COMPANY = 25  # safety cap (500 postings) so a bug can't loop forever

INTERN_PATTERN = re.compile(r"\bintern(ship)?\b", re.IGNORECASE)
INTERNATIONAL_PATTERN = re.compile(r"\binternational\b", re.IGNORECASE)

HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": "intern-radar-workday-scraper/1.0 (personal internship search tool)",
}


def is_internship(title: str) -> bool:
    return bool(INTERN_PATTERN.search(title)) and not bool(
        INTERNATIONAL_PATTERN.search(title)
    )


def fetch_company_postings(company: dict, session: requests.Session) -> tuple[list[dict], list[str]]:
    """Fetch and filter internship postings for a single company."""
    cxs_url = (
        f"https://{company['tenant']}.{company['wd_host']}.myworkdayjobs.com"
        f"/wday/cxs/{company['tenant']}/{company['site']}/jobs"
    )

    # Some Workday tenants sit behind bot protection that returns a
    # non-empty "total" but an empty jobPostings array unless the request
    # carries a session cookie from having loaded the careers page first.
    # Visiting the page once (per company) picks that cookie up.
    try:
        session.get(company["base_url"], headers=HEADERS, timeout=15)
    except requests.RequestException:
        pass  # if this fails, we still try the API call below as-is

    post_headers = {**HEADERS, "Referer": company["base_url"]}

    postings = []
    sample_titles = []
    offset = 0

    for _ in range(MAX_PAGES_PER_COMPANY):
        body = {
            "appliedFacets": {},
            "limit": PAGE_SIZE,
            "offset": offset,
            "searchText": "",
        }
        resp = session.post(cxs_url, headers=post_headers, json=body, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        if offset == 0:
            total_reported = data.get("total", "?")
            print(
                f"       {company['label']}: API reports {total_reported} total posting(s) at this site"
            )

        job_postings = data.get("jobPostings", [])
        if not job_postings:
            break

        for job in job_postings:
            title = job.get("title", "")
            if len(sample_titles) < 5:
                sample_titles.append(title)
            if not is_internship(title):
                continue
            external_path = job.get("externalPath", "")
            postings.append(
                {
                    "id": f"workday:{company['tenant']}:{external_path}",
                    "source": "workday",
                    "company": company["label"],
                    "title": title,
                    "location": job.get("locationsText", "Unspecified"),
                    "url": company["base_url"] + external_path,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "department": "",
                    "category": company["category"],
                }
            )

        total = data.get("total", 0)
        offset += PAGE_SIZE
        if offset >= total:
            break

        time.sleep(REQUEST_DELAY_SECONDS)

    return postings, sample_titles


def main():
    companies = json.loads(COMPANIES_FILE.read_text())
    all_postings = []
    failures = []
    session = requests.Session()

    for company in companies:
        label = company["label"]
        try:
            postings, sample_titles = fetch_company_postings(company, session)
            print(f"[ok]   {label}: {len(postings)} internship posting(s)")
            if not postings and sample_titles:
                print(f"       no titles matched 'intern' — sample titles seen: {sample_titles}")
            elif not postings and not sample_titles:
                print(
                    "       API reported postings but returned none — likely still blocked "
                    "(bot protection); check manually in a browser if this persists"
                )
            all_postings.extend(postings)
        except requests.RequestException as e:
            print(f"[fail] {label}: {e}", file=sys.stderr)
            failures.append(label)
        time.sleep(REQUEST_DELAY_SECONDS)

    OUTPUT_FILE.write_text(json.dumps(all_postings, indent=2))
    print(f"\nWrote {len(all_postings)} postings to {OUTPUT_FILE}")
    if failures:
        print(f"Failed companies (check their tenant/site config): {failures}")


if __name__ == "__main__":
    main()
