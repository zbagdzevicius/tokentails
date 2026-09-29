---
program: "Creative Europe MEDIA — Video Games and Immersive Content Development 2027"
track: C
status: drafting
frame: eu-cultural
deadline: "2027-02-10T17:00:00+01:00"
url: "https://www.eacea.ec.europa.eu/grants/2021-2027/creative-europe_en"
next: "Deadline is EXPECTED (2026 pattern), confirm when the 2027 call publishes on the Portal; then fund c:plan creative-europe-2027"
created: 2026-09-25
threshold: 70
max_grant: 200000
funding_rate: 0.6
internal_buffer_days: 7
plan_start: 2026-10-17
score_scale: 10
---
# Creative Europe MEDIA — Video Games and Immersive Content Development 2027 — call rules

The 2027 call text is not yet published (the expected call-fiche URL returned 404 on 2026-09-28).
Everything below is quoted from the **2026 call document**, CREA-MEDIA-2026-DEVVGIM, V1.0,
30.09.2025 (https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/crea/wp-call/2026/call-fiche_crea-media-2026-devvgim_en.pdf),
read in full on 2026-09-28. The earlier grid in this file (C1 Relevance 20 ... C7 Budget 5) came
from AI-EXECUTION-PLAN.md and was wrong; it is replaced. Re-run `fund prompt extract` on the 2027
document the day it opens and diff against this table.

## Scoring criteria

| ID | Criterion | Weight | Verbatim quote |
|---|---|---|---|
| C1 | Relevance: originality and creativity | 10 | "Originality and creativity of the concept against existing work, including originality of the story (10 points)" |
| C2 | Relevance: level of innovation | 15 | "Level of innovation, i.e. the extent to which the project pushes the boundaries of the existing offer proposing \"cutting edge\" technique and content, such as use of new or latest technologies or platforms, innovation in gameplay, level of immersion and interactivity, innovation in visual/graphic approach, innovative use of cinematography and viewing (15 points)" |
| C3 | Relevance: sustainability strategy | 5 | "Adequacy of the strategies presented to ensure a more sustainable and environmentally-respectful industry (5 points)" |
| C4 | Relevance: gender balance, inclusion, diversity | 5 | "Adequacy of the strategies to ensure gender balance, inclusion, diversity and representativeness, either in the project/content or in the way of managing the activity (5 points)" |
| C5 | Quality of content and activities | 25 | "Quality of storytelling; Quality of the visual approach (as shown through e.g. artwork, mock-ups, sketches, mood boards); Quality of the graphic and sound design; Accessibility measures for users with disabilities and other impairments; For non-immersive video games: Quality and originality of the gameplay, Integration between gameplay and storytelling, Quality of the level and character design" |
| C6 | Project management: development strategy | 10 | "Adequacy of the development plan, schedule, development budget and foreseen partnerships to the needs of the project" |
| C7 | Project management: financing strategy and feasibility | 10 | "Adequacy of the financing strategy compared to the estimated production costs in terms of awareness of the suitable potential financial partners; Experience or ability of the applicant to secure the necessary co-financing; Potential to attract distributor(s)/publisher(s); Sales potential and revenue streams" |
| C8 | Dissemination: European/international exploitation and distribution | 10 | "Transnational appeal ...; Potential to cross borders taking into account: the experience and the diversity of the creative team, the story and characters or intended cast, the localization strategy; Relevance of the distribution strategy ... and the distribution partners in place or envisaged" |
| C9 | Dissemination: marketing strategy | 10 | "The marketing strategy allowing to reach audiences at an early stage. This includes the definition of unique selling points (USP), target audiences and markets, innovative marketing and audience engagement tools, promotional activities (10 points)" |

"Individual thresholds per criterion: N/A. Overall threshold: 70 points." Passing 70 only makes a
proposal eligible "for funding — within the limits of the available budget". In 2026, 143
proposals passed and asked for EUR 25,673,065.18 against EUR 10,000,000
(https://ec.europa.eu/info/funding-tenders/opportunities/data/topicDetails/crea-media-2026-devvgim.json),
so the real cut-off is well above 70. EACEA's info session says missing information scores 0.

## Limits

- "Proposals are limited to maximum 70 pages (Part B). Evaluators will not consider any additional pages."
- Section limits in draft.md assume roughly 3,000 characters per page.
- Generative AI: "applicants ... must be transparent in disclosing which AI tools were used and how
  they were utilised", and must "Provide a list of sources used to generate content and citations".
- Hand-made key art only in the dossier: internal rule from AI-EXECUTION-PLAN.md, not a call rule.

## Mandatory work packages and deliverables

"The project activities must be organised in the following work packages: WP 1 – Artistic
development (narrative part, characters, graphic approach, etc.) (mandatory); WP 2 – Technical
development (GUI, HUD, etc.) (mandatory); WP 3 – Financing, distribution and marketing activities
(mandatory)". Minimum deliverables: "WP 1 – Updated creative development (treatment, script, bible,
game design document); WP 1 – Declaration on independence and ownership; WP 1 and/or 2 – Update on
key crew/casting; WP 2 – Video of or link to prototype / trial version / trailer / teaser; WP 3 –
Updated financing/budget and production schedules; WP 3 – Updated distribution and marketing
strategies; WP 3 – Interoperable standard identifier".

## Mandatory annexes

Tracked in annexes.md (`fund c:annexes creative-europe-2027`).

## Exclusions

- "The following projects are ineligible: puzzle games, memory games, sports games, racing games,
  running games, rhythm/singing/dancing games, social games, quiz games, party games,
  versus-fighting games, word and spelling games, number games, mind games, even if they have a
  narrative element". **This is the biggest risk for this draft**, whose earlier versions called the
  core loop "memory puzzles".
- "The production phase is ineligible. Production is understood as the phase starting from the
  testing and debugging of the first prototype". "Prototype is understood either as first playable,
  vertical slice, Alpha version or Trial/Demo version." Costs "may only be related to ... the phase
  starting from the first idea until the delivery of the first prototype".
- "In order to be considered narrative, the story must be told or shown throughout the whole game
  ... and not only as an introduction or an ending." "In all cases, the work must be intended for
  commercial exploitation."
- Gambling is not listed as an exclusion in 2026 (the earlier note here was wrong).

## Eligibility gates

- "A European video game production company ... is a company whose main objective and activity is
  video game production/development, (entertainment) software development or audiovisual production
  (or equivalent). Publishing companies are not eligible applicants." The applicant is an MB with
  NACE 58.21 "Publishing of video games" (F-021). The call does not require a UAB; it requires
  that the main activity is development, not publishing.
- Previous work: the coordinator must have "produced or developed a video game ... that has been
  commercially distributed in the period between 01/01/2023 and the deadline", with "a relevant sales
  report showing sales" in that period. "The work must have generated revenues". Work-for-hire,
  personal credits and Early Access titles do not count. If the named previous work fails, "the
  application will be ineligible even if the coordinator is able to provide information on other
  previous works".
- Rights: "No later than on the day of the deadline ... a duly dated and signed contract covering the
  rights to the artistic material included in the application" (or a unilateral declaration where
  the author is the producer, a shareholder or an employee).
- "The start of the production phase of the submitted project has to be scheduled at least 10 months
  after the day of the deadline". So the first prototype cannot be delivered before about
  2027-12-10 if the 2027 deadline is 2027-02-10.
- Lump sum grant, "EUR 200 000 per project", funding rate 60%. Duration "should not normally exceed
  36 months". Prefinancing "normally 70% of the maximum grant amount".
