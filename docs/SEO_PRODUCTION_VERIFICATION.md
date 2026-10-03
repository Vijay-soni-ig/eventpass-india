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

## What the verifier checks (and its exit codes)

Beyond the list above, the verifier checks that:

- `robots.txt` applies to all crawlers, has every private-area rule (`/auth`, `/dashboard`, `/saved-events`, `/account/`, `/host/`, `/organizer/`, `/organizer# Production SEO Verification

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

, `/exhibitor-dashboard`, `/platform`, `/book/`, `/my-tickets`), blocks none of the public pages (using Google's prefix and `# Production SEO Verification

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

 matching, which is what catches `Disallow: /organizer` also blocking `/organizers`), and declares this site's own sitemap.
- The sitemap URLs are well formed, unique, on this site's origin (no localhost or other host), HTTPS, list the marketing pages, and contain no private, `/organizer-demo` or `/exhibition/:id` URLs.
- The homepage's raw HTML has the expected title, description, a single canonical equal to `<site>/`, the Open Graph and Twitter card tags, no `noindex`, and valid JSON-LD with URLs on this site.
- Optional `SEO_ARCHIVED_EVENT_ID` (like `SEO_PRIVATE_EVENT_ID`) must be absent from the sitemap.

The expected homepage title and description can be overridden with `SEO_EXPECT_HOME_TITLE` and `SEO_EXPECT_HOME_DESCRIPTION` when the copy changes.

PageSpeed: anonymous calls are rate limited by Google. Provide `SEO_PAGESPEED_API_KEY` (the workflow reads the `PAGESPEED_API_KEY` repository secret, which is optional). The 0.90 thresholds are unchanged. If PageSpeed cannot be reached the run reports `BLOCKED`, still prints every other result, and exits with code 2. It is never reported as a pass.

| Exit code | Meaning |
|---|---|
| 0 | Every check passed |
| 1 | At least one check failed, or the site was unreachable |
| 2 | No check failed, but PageSpeed could not be run: verification is incomplete |

The checks are themselves tested (`server/tests/productionSeoVerifier.test.ts`) against a stand-in site, including deliberately broken variants.

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
