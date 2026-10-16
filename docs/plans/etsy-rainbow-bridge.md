# Etsy "Rainbow Bridge" memorial portrait: listing copy

Status: draft, 2026-10-11. Not live. Source plan: [revenue-kickstart.md](revenue-kickstart.md) §4 (the #1
revenue bet). This file holds the paste-ready text for the first three listings: a cat memorial, an
any-pet memorial and a sympathy gift. Each listing is the same product sold under a different keyword
angle.

**Do not publish any listing until `backend/scripts/memorial-portrait.js` has had a timed dry run on
consented test photos.** That script is the fulfilment CLI from revenue-kickstart.md §4 ("What to
build"); its header comment has the exact commands. It works in two steps, with a person choosing a
variant in between:

1. `paint`: 4 billed Gemini calls (`--yes` required) turn 1 to 3 photos into 4 variants, plus a
   contact sheet with the name and dates.
2. `export --pick <n>`: renders the chosen variant at 8x10 in, A4 and 12x16 in (300 dpi) and as a
   phone wallpaper, with no AI call.

Output goes to the git-ignored `backend/scripts/memorial-out/` (see `backend/scripts/.gitignore`),
with a `DELETE-AFTER.txt` date in each order folder. The script does not draft the tribute text,
render the tribute card or make the two extra backgrounds, so the dry run times those steps by hand.
The listings promise delivery within 3 business days, so the dry run must cover a whole order (photo
in, `paint`, a variant picked, `export`, tribute card, extra backgrounds) with the human minutes per
order timed and written down. Until then a sale would be a promise we cannot time. On 2026-10-11 the
script and its `.gitignore` are untracked in the v2 working tree. Whether they are committed with v2
is a human decision.

## Rules this copy follows

- Honest copy (docs/CLAIMS.md and the rules in `tools/copy-lint/lib/rules.mjs`): no shelter, rescue
  or donation claims, no share of sales for any cause (none exists; flywheel.md's "€1 per Etsy order"
  is a plan, not a fact in `facts.json`), no "bestseller", "best", "#1" or review counts, no sales or
  customer counts, no urgency (no "order now", "limited", countdowns or holiday deadlines), no
  "token" or crypto words. If a share for Pink Paw is ever added, it goes into the copy only after the
  first payment exists and a fact backs it.
- The AI disclosure is word for word from revenue-kickstart.md §4, and the item is classified as
  "Designed by" (Etsy creativity standards).
- Delivery is "within 3 business days" (revenue-kickstart.md said 3–5 days; this copy uses the shorter
  promise, so the dry run must show it holds).
- Every title is 140 characters or fewer and every listing has exactly 13 tags of 20 characters or
  fewer (Etsy limits). The counts below were checked with a script on 2026-10-11. One tag in
  revenue-kickstart.md is too long for Etsy ("pet portrait from photo", 23 characters); it is
  "pet portrait photo" here.

## Price (founder call)

Proposed in EUR (the shop is Lithuanian, so its currency is EUR), the same three options on every
listing as Etsy variations:

| Option | What is in it | Price |
|---|---|---|
| Portrait | The memorial portrait with name and dates, print-ready files (8x10 in, A4, 12x16 in at 300 dpi) | €14 |
| Portrait and tribute | Plus a tribute card (about 60 words) and a phone wallpaper | €24 |
| Portrait, tribute and backgrounds | Plus two more background choices | €32 |

**Founder call:** revenue-kickstart.md priced two options at $24.99 and $34.99 (about €21.70 and
€30.40 at the stats rate of 1.15 USD per EUR). €14 matches the `/yourcat` HD portrait card price and
starts lower; €24 and €32 sit near the planned top tier. Pick one ladder before the first listing goes
live and use it on all three listings. The tables and descriptions below use €14 / €24 / €32; change
them together if the founder picks the dollar plan.

## Photos (images 1 to 6, all listings)

From revenue-kickstart.md §4: image 1 is a finished output of a team-owned or consented pet, shown
next to its source photo; images 2 to 6 are a cat example, a dog example, the tribute card, a framed
wall mockup and "how it works" in 3 steps. Use only pets whose owners gave written consent for
marketing use. The cat listing leads with a cat, the any-pet listing with a dog and a cat, the sympathy
listing with the tribute card.

## Listing 1: cat memorial

**Title** (113 characters):

```text
Custom Cat Memorial Portrait from Photo, Rainbow Bridge Cat Painting with Name and Dates, Cat Loss Printable File
```

**Tags** (13, longest 20 characters):

```text
cat memorial, rainbow bridge, cat loss gift, cat memorial gift, loss of cat, custom cat portrait, cat portrait photo, in memory of cat, printable memorial, pet remembrance, cat sympathy gift, pet loss gift, digital cat portrait
```

**Description:**

```text
A custom memorial portrait of your cat, painted from your photos: your cat in a soft rainbow meadow, with their name and dates.

WHAT YOU GET
• A painterly portrait of your cat with their name and dates, as print-ready files: 8x10 in, A4 and 12x16 in, at 300 dpi.
• Choose an option:
  – Portrait: the portrait files (€14).
  – Portrait and tribute: plus a tribute card with a short text about your cat (about 60 words) and a phone wallpaper (€24).
  – Portrait, tribute and backgrounds: plus two more background choices (€32).
• This is a digital file. Nothing is shipped.

HOW TO ORDER
1. Choose your option and check out.
2. Send us 1 to 3 clear photos of your cat through Etsy Messages, with their name and dates. For the tribute, tell us a few things you loved about them.
3. We send you a preview through Messages before the final files. Tell us if anything should change.

DELIVERY
Your files arrive through Etsy within 3 business days of receiving your photos.

REMAKES AND REFUNDS
One free remake is included if the portrait does not look like your cat. Because each portrait is made to order from your photos, we cannot refund it once the files are delivered.

PRINTING TIPS
• Matte or lustre photo paper keeps the colours soft.
• The 8x10 in and 12x16 in files fit standard frames; the A4 file fits an A4 frame.
• Any local print shop or online photo printer can print the files.

HOW THE PORTRAIT IS MADE
Made by our studio with AI image tools using our own prompts; every portrait is selected, checked and finished by a person.
The tribute text is drafted with an AI writing tool from what you tell us and edited by a person. You approve it before delivery.

YOUR PHOTOS
We use your photos only to make your portrait. To make it, they are processed by our AI image provider (Google), which does not use them to train its models. We delete your photos 30 days after delivery; we keep them until then for your free remake. We never show your photos or your portrait anywhere without asking you first. Please send photos of your pet only, with no people in them.
```

## Listing 2: any-pet memorial

**Title** (118 characters):

```text
Custom Pet Memorial Portrait from Photo, Rainbow Bridge Dog or Cat Painting, Pet Loss Keepsake, Printable Digital File
```

**Tags** (13, longest 19 characters):

```text
pet memorial, rainbow bridge, pet loss gift, dog memorial, cat memorial, custom pet portrait, pet portrait photo, in memory of pet, printable memorial, pet remembrance, loss of dog, dog memorial gift, pet memorial art
```

**Description:**

```text
A custom memorial portrait of your dog, cat or other pet, painted from your photos: your pet in a soft rainbow meadow, with their name and dates.

WHAT YOU GET
• A painterly portrait of your pet with their name and dates, as print-ready files: 8x10 in, A4 and 12x16 in, at 300 dpi.
• Choose an option:
  – Portrait: the portrait files (€14).
  – Portrait and tribute: plus a tribute card with a short text about your pet (about 60 words) and a phone wallpaper (€24).
  – Portrait, tribute and backgrounds: plus two more background choices (€32).
• One pet per portrait. This is a digital file. Nothing is shipped.

HOW TO ORDER
1. Choose your option and check out.
2. Send us 1 to 3 clear photos of your pet through Etsy Messages, with their name and dates. For the tribute, tell us a few things you loved about them.
3. We send you a preview through Messages before the final files. Tell us if anything should change.

DELIVERY
Your files arrive through Etsy within 3 business days of receiving your photos.

REMAKES AND REFUNDS
One free remake is included if the portrait does not look like your pet. Because each portrait is made to order from your photos, we cannot refund it once the files are delivered.

PRINTING TIPS
• Matte or lustre photo paper keeps the colours soft.
• The 8x10 in and 12x16 in files fit standard frames; the A4 file fits an A4 frame.
• Any local print shop or online photo printer can print the files.

HOW THE PORTRAIT IS MADE
Made by our studio with AI image tools using our own prompts; every portrait is selected, checked and finished by a person.
The tribute text is drafted with an AI writing tool from what you tell us and edited by a person. You approve it before delivery.

YOUR PHOTOS
We use your photos only to make your portrait. To make it, they are processed by our AI image provider (Google), which does not use them to train its models. We delete your photos 30 days after delivery; we keep them until then for your free remake. We never show your photos or your portrait anywhere without asking you first. Please send photos of your pet only, with no people in them.
```

## Listing 3: sympathy gift

**Title** (123 characters):

```text
Pet Sympathy Gift, Custom Memorial Portrait from Photo, Rainbow Bridge Painting for a Friend Who Lost a Pet, Printable File
```

**Tags** (13, longest 18 characters):

```text
sympathy gift, pet sympathy gift, pet loss gift, pet memorial, rainbow bridge, memorial gift, loss of pet gift, condolence gift, in memory of pet, dog loss gift, cat loss gift, pet remembrance, printable memorial
```

**Description:**

```text
A gift for someone who has lost a pet: a custom memorial portrait painted from photos of their dog, cat or other pet, in a soft rainbow meadow with the pet's name and dates.

WHAT YOU GET
• A painterly portrait of the pet with their name and dates, as print-ready files: 8x10 in, A4 and 12x16 in, at 300 dpi.
• Choose an option:
  – Portrait: the portrait files (€14).
  – Portrait and tribute: plus a tribute card with a short text about the pet (about 60 words) and a phone wallpaper (€24).
  – Portrait, tribute and backgrounds: plus two more background choices (€32).
• The files come to you, so you can print and frame the portrait or pass the files on. This is a digital file. Nothing is shipped.

HOW TO ORDER
1. Choose your option and check out.
2. Send us 1 to 3 clear photos of the pet through Etsy Messages, with their name and dates. For the tribute, tell us a few things the family loved about them.
3. We send you a preview through Messages before the final files. Tell us if anything should change.

DELIVERY
Your files arrive through Etsy within 3 business days of receiving the photos.

REMAKES AND REFUNDS
One free remake is included if the portrait does not look like the pet. Because each portrait is made to order from the photos, we cannot refund it once the files are delivered.

PRINTING TIPS
• Matte or lustre photo paper keeps the colours soft.
• The 8x10 in and 12x16 in files fit standard frames; the A4 file fits an A4 frame.
• Any local print shop or online photo printer can print the files.

HOW THE PORTRAIT IS MADE
Made by our studio with AI image tools using our own prompts; every portrait is selected, checked and finished by a person.
The tribute text is drafted with an AI writing tool from what you tell us and edited by a person. You approve it before delivery.

THE PHOTOS
We use the photos only to make the portrait. To make it, they are processed by our AI image provider (Google), which does not use them to train its models. We delete the photos 30 days after delivery; we keep them until then for the free remake. We never show the photos or the portrait anywhere without asking you first. Please send photos of the pet only, with no people in them, and only photos you are allowed to share.
```

## Founder checklist (in this order)

1. [ ] **Etsy shop open** (LT, Etsy Payments, identity verification done). Owner: You. Check: the shop
   dashboard shows payments enabled.
2. [ ] **VAT question answered by the accountant**: does a custom file sent after purchase count as an
   automatically delivered digital item (Etsy collects the VAT) or does the MB need OSS? Owner: You.
   Check: the accountant's written answer. It also decides the listing type below.
3. [ ] **Listing type and delivery channel chosen**: a digital listing with the files sent after the
   order, or another type the accountant's answer allows. Make "Your files arrive through Etsy" match
   the channel. Owner: You.
4. [ ] **Price ladder picked**: €14 / €24 / €32 or the $24.99 / $34.99 plan (§Price). Owner: You.
5. [ ] **Billed Gemini key** for the memorial work, so "does not use them to train its models" is
   true. Owner: You. Check: Google AI Studio or Cloud console shows billing on the key's project.
6. [ ] **Memorial script dry-run, timed**: run `backend/scripts/memorial-portrait.js` (`paint`, then
   `export --pick <n>`) on consented test photos of 2 cats and 1 dog, then make the tribute card and
   the extra backgrounds by hand. Write down the minutes per order. 3 business days must hold with the
   founder's daily hours. Owner: You run and time it (the script exists; it needs the billed key from
   item 5). **No listing goes live before this.**
7. [ ] **Example images**: image 1 a finished output of a consented pet next to its source photo;
   written marketing consent stored outside the repo. Owner: You.
8. [ ] **Refund wording checked**: "we cannot refund it once the files are delivered" fits Etsy's
   policy for made-to-order items and EU consumer law for personalised goods; set the shop's return
   policy to match. Owner: You.
9. [ ] **Photo handling in place**: an order tracker outside the repo, and a reminder to delete buyer
   photos 30 days after delivery. Owner: You.
10. [ ] **Message templates ready** (order received, preview ready, delivered with one polite review
    ask, remake). Grieving buyers get a human reply. Owner: AI drafts, You send.
11. [ ] **Classification**: "Designed by", AI disclosure pasted unchanged. Owner: You.
12. [ ] **Publish listing 1**, then 2 and 3 after the first order is delivered on time. Owner: You.
