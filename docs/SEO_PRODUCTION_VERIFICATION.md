# Production SEO Verification

This repository now has one production SEO verification command and one manual GitHub Actions workflow.

## Automated checks

The verification covers:

1. `/robots.txt` availability and sitemap directive
2. Application-area robots exclusions
3. `/sitemap.xml` availability, content type, XML namespace, and public Event URLs
4. Optional known published Event inclusion
5. Optional known private/draft Event exclusion
6. Lighthouse/PageSpeed SEO score
7. Lighthouse/PageSpeed performance score
8. Rendered title, meta description, canonical, and structured-data audits where Lighthouse exposes them

Run locally:

```bash
SEO_BASE_URL=https://exhibittix.com npm run seo:verify:production
```

For a known published Event and known private/draft Event:

```bash
SEO_BASE_URL=https://exhibittix.com \
SEO_PUBLIC_EVENT_ID=<published-event-id> \
SEO_PRIVATE_EVENT_ID=<private-or-draft-event-id> \
SEO_LIGHTHOUSE_URLS=/,/events,/event/<published-event-id> \
npm run seo:verify:production
```

## GitHub Actions

Run **Production SEO Verification** manually from GitHub Actions and provide the production URL and optional known Event IDs.

## Google Search Console

Search Console requires access to the production property's verified Google account, so it is intentionally not automated in CI.

Once the production domain is verified:

1. Add/verify `https://exhibittix.com/`
2. Submit `https://exhibittix.com/sitemap.xml`
3. Inspect representative public Event URLs
4. Monitor indexing, crawl errors, canonical selection, impressions, clicks, and coverage
5. Re-run the production verification workflow after significant SEO or routing changes

## Important limitation

The application is a client-rendered React SPA. Metadata and JSON-LD are applied in the browser, so production SEO metadata must be validated with a rendered browser/Lighthouse run rather than only inspecting the initial HTML response.

The repository can automate the technical verification and PageSpeed/Lighthouse checks. Google Search Console verification, sitemap submission, and ongoing Search Console monitoring remain external account operations.
