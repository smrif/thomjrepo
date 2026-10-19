# Link Preview Illustration

Deployed October 13, 2026 as Worker `77cf3d9c-0919-4344-be19-2eac962cda2c`.
Previous version: `d0452630-30ee-4b89-ae29-34a8c275b9e0`.

The homepage now declares one preferred Open Graph image and a matching Twitter
large-image card in the initial HTML head. Crawlers do not need to execute app
JavaScript, sign in, or guess among screenshots and page images.

- Preferred image: `https://whosedayapp.com/assets/homepage/share-preview-v1.jpg`.
- Source: the existing `assets/homepage/evening-journal.webp` illustration.
- Format: JPEG, 1536 × 1024, approximately 352 KB. Converted without cropping so
  the journal/table illustration retains its original composition.
- Metadata includes canonical URL, title, description, image URL/type/dimensions,
  alt text, and matching Twitter image metadata.
- Canonical and legacy app links identify `https://whosedayapp.com/` and use its
  public absolute HTTPS image URL. No preview-specific client state is required.

This is the website's preferred image, not a guarantee that every messaging app
will honor it or replace a cached card. Client-selected cropping and previously
cached previews remain outside the app's control. Existing sent messages may keep
their old cards; a new message may also reuse cached metadata. There is no
site-controlled universal cache purge for recipients' messaging apps.

For a future image change, publish a new versioned filename and update both
Open Graph and Twitter URLs. Keep old image URLs available for cached clients.

Verification: all 30 local release results passed. After publishing, all 32
production static files matched `dist` byte-for-byte. Requests using Applebot,
Facebook and Twitter crawler user-agent strings received HTTP 200 and the same
single preferred image in server-delivered metadata; the image returned HTTP 200
with `image/jpeg`. Mobile/desktop signup/login navigation and canonical/legacy
domain checks also passed. These are crawler-response checks, not a claim that
actual Messages/WhatsApp caches were refreshed or every client rendered a card.

Sources: [Apple rich previews for Messages](https://developer.apple.com/documentation/technotes/tn3156-create-rich-previews-for-messages),
[Open Graph image metadata](https://ogp.me/).
