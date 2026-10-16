# MORPH LAB v17 desktop integration — design QA

Date: 2026-10-15

First-batch result: **passed** for the initial desktop integration batch only. This is not an acceptance of all seven supplied pages or of paid AI/write workflows.

## Scope and reference

User-provided MORPH LAB v17 frontend is the visual source. Its local reference was served at `http://127.0.0.1:4381/`; implementation was checked at `http://localhost:4173/`. Screens reviewed: shared navigation/account menu, starfield home/composer, course catalog, case catalog and tool catalog. Existing learning atlas, course/case details, creation execution and admin were checked for integration regressions, not declared fully restyled.

Reference and implementation captures used the same 1440 × 900 desktop viewport. PNG content dimensions were 1425 × 891 on both sides; side-by-side contact sheets resize both equally to 1000 px wide, without asymmetric scaling or cropping. Additional layout bounds were checked at 1280 × 800 and 1920 × 1080. Mobile is excluded at the user's request.

Evidence is local and ignored by Git under `apps/api/data/qa/morph-v17/`:

- `source-{home,courses,community,tools}.png`: original supplied pages.
- `app-{home,courses,community,tools}.png`: integrated pages with actual ArtEdu data.
- `compare-{home,courses,community,tools}.png`: paired source/implementation views.
- `compare-header-focus.png`: focused navigation/heading comparison.
- `full-check.log`: complete automated check output, exit code 0.

## Visual assessment

| Surface | Outcome | Evidence / deliberate differences |
| --- | --- | --- |
| Shared chrome | Passed | Dark navigation, bright brand, route highlighting and account menu; actual role/name/quota and search added instead of a static demo identity. |
| Home | Passed | Original Canvas starfield, background assets, headline, tabs and translucent composer retained. Default chat, registered model and real attachment action replace demo defaults/unimplemented voice. Animation phase naturally varies between captures. |
| Courses | Passed | Source header, category toolbar, cover/body cards, legible author/tools and real progress. Shows 3 existing courses, not 13 demo records. |
| Cases | Passed | Source title/network atmosphere and restrained cards; retains the previously requested three-column equal grid and featured/community split, rather than the supplied four-column masonry. Actual 14 cases preserved. |
| Tools | Passed | Source header/floating workflow decoration, compact filter/search row and three-column cards. Shows 8 real links; no fabricated pricing, descriptions or tags. Grid/list and empty-state recovery checked. |

## Corrections made during comparison

1. P2: legacy global CSS forced a single tool column. Added scoped grid rules and confirmed three columns plus list mode.
2. P2: course cover cropping and toolbar wrapping reduced readability. Used actual uploaded covers first, known project artwork as fallback, and corrected fit/width behavior.
3. P2: inherited glass/backdrop layers obscured filter text. Removed backdrop blur from catalog controls and rechecked readable labels.
4. P2: legacy brand color reduced contrast on the dark navigation. Explicit scoped white brand styling verified in the focused header comparison.
5. P1: standalone chat's old full-viewport height put the send control below the viewport after adding navigation. Deducted the 56 px navigation height; send control bottom was 874.2 px at 900 px viewport height and 774.2 px at 800 px height.
6. P2: tool search/filter rows consumed excessive vertical space. Consolidated desktop controls into one grid row and rechecked the final tool comparison and absence of horizontal overflow.

No unresolved P0/P1/P2 visual issue was observed in the accepted first-batch surfaces. Minor brand-symbol differences and live Canvas variation are acceptable; the account/search additions and real-data cardinality are intentional, not fidelity defects.

## Functional and regression checks

- Four demo roles authenticated and each read 14 published cases / 3 courses; authentication protections unchanged. Login/reload/logout checked through same-origin HTTP without exposing tokens.
- Browser checked course search/clear/detail, case detail and media gallery/Escape, tool search/no-result recovery/grid-list, account menu/Escape, preserved learning atlas and creation entry.
- Admin loaded without `.morph-v17` scope applied; existing admin layout retained.
- Search UI module labels and course covers aligned with the new navigation/catalog while preserving classic mode.
- Original Canvas code now cleans up animation frames, observers, timers and event listeners on unmount.
- `npm run check`: API typecheck, frontend production build and **293 automated tests passed** (137 API, 6 Sites, 37 chat, 100 platform, 7 case import, 6 reliability).
- An additional production build and whitespace check were run after the final CSS-only adjustment.

## Explicit limitations / next batch

No paid model generation, actual publishing, course completion or review decision was performed. No inference that these write flows are end-to-end accepted. No demo learning scores or records imported. Full curriculum planning, v17 personal space/portrait and full creation workspace layout remain subsequent batches. Existing knowledge graph and business data are intentionally preserved. No GitHub push or merge was requested or performed in this turn.

## Follow-up: shared catalog controls and tool cards

Scope: user-approved refinements from the three-page audit, not a new visual direction. Sources are the supplied MORPH v17 tool page plus the captured course/community/tool audit and accepted recommendations. Preserve real ArtEdu catalogs rather than importing the static demo's 19 tools or identity.

Evidence root: `apps/api/data/qa/morph-v17/catalog-refinement/`.

- Source: `source-tools-1440.png`; implementation: `tools-final-1440.png`; full-view paired evidence: `compare-tools-final.png`.
- Both captures use 1440 × 900 CSS viewport and produce 1425 × 891 px PNGs. The paired view scales both equally to 1000 px width. No asymmetric scaling. Same default/all-category state; actual tool names/counts intentionally differ.
- `courses-final-1440.png` (connection preview deliberately collapsed), `community-final-1440.png`, and `tools-final-1440.png` show each final desktop surface.
- `shared-controls-comparison.png` contains focused crops in course/community/tool order, without rescaling, to assess label size, selected state, counters, search alignment and result rows. The different panel heights reflect real extra filters, not inconsistent button sizing.
- `courses-selected.png`, `community-final-912.png`, `tools-final-912.png`, `tools-list-912.png` record additional narrow-desktop/interaction states; the first tool screenshots predate the font/icon refinements and are not final typography evidence.

### Findings and fixes

- P2: three unrelated filter styles. Replaced them with the shared `CatalogControls` component; all category buttons use 14 px type, 38 px height, the same dark selected state/counter and 44 px search field. Read-only card labels remain lighter and smaller.
- P2: community hierarchy was crowded and “大类” ambiguous. Separated section jump links, dimension choices and actual categories; renamed dimensions to 作品领域 / 设计方法 / 创作工具 / 艺术方向. Long lists collapse after eight options while retaining any active option. Expanded/selected semantics are explicit.
- P2: narrow-desktop tool cards forced titles to wrap. Added a dedicated source-informed tool card, 300 px minimum height, two columns below 1200 px and three on wider desktop. Domain/footer separator and actual open behavior are visible; icons use the established library or genuine favicon, not invented brand artwork.
- P2: inherited 750-weight tool descriptions were too heavy. Set 400 explicitly; final browser computed style confirms 400. Retested with final wide screenshot.
- P2: slow remote favicons left an empty icon box. The library icon now stays visible until the genuine favicon loads, with the existing source fallback order retained. Classic rendering remains unchanged. Updated the old exact-function-signature assertion to recognize the added optional progressive flag and assert the new loading behavior.
- P2: the workflow shortcut is a button, while other tool cards are links; a legacy button rule centered its inner header/labels. Explicit stretch/start alignment now gives both element types the same left-aligned grid-card structure; the final captures were refreshed after this correction.
- P2: course connection preview consumed too much space for users browsing the catalog. Added an accessible expand/collapse control without deleting the graph entry or claiming preview lines are prerequisites.

### Required fidelity surfaces

- Typography: original site font stack retained; category labels 14/20, tool titles 20/28, description 14/23 at weight 400. Narrow desktop titles no longer break into isolated words due to a forced three-column grid.
- Spacing/layout: shared 20 px filter panel padding, 8 px category gaps, aligned search and consistent result/clear row; equal tool cards with 24 px padding and footer alignment. Source-inspired tool layout is intentionally shorter where the live directory has less metadata.
- Colors/tokens: existing dark ink, lavender surfaces, muted purple and lime accents retained. Selected filters also expose programmatic pressed state, so color is not the only signal.
- Image/assets: original page effects and supplied artwork unchanged. Genuine favicons overlay a visible library-icon fallback; no fabricated pricing, badges, logos or review counts introduced.
- Copy/content: all counts reflect current API records (3 courses, 14 cases, 8 tools). “站内工具” describes destination, independently from same/new-tab launch mode. External links say 打开官网; workflow shortcut says 节点工作流 and retains the existing manager callback.

### Interaction / regression evidence

Browser verified course category + tool filtering (1/3), clear back to 3/3, empty-query recovery; case dimension switching, expanding a long list, selecting Midjourney (1/14), retaining it after collapse, search empty state and clear back to 14/14; tools category (2/8), Figma search (1/8), empty state, grid/list switching and Enter-key activation. External link target is `_blank`; station creation opens the existing chat workspace and the workflow card opens the existing manager without creating a run. Both course preview states work.

Final automated `npm run check` exits 0: API typecheck/build and 296 tests (137 API, 6 Sites, 37 chat, 103 platform, 7 import, 6 reliability). One intermediate static signature assertion failed after adding progressive icons; it was updated with explicit loading/fallback assertions and the full suite reran successfully. Browser console contains a historical Vite hot-update import error while new files were being added, not an error on the final loaded page. No paid AI, publication, moderation, migration or database rewrite performed.

No actionable P0/P1/P2 issue remains in the accepted three-page desktop refinement. Full mobile, screen-reader and exhaustive write-flow testing remain excluded. Fine-grained metadata enrichment and full v17 personal-space/curriculum integration remain subsequent work, not fabricated here.

Catalog-refinement result: passed

## 2026-10-16 · My space integration, first personal-space batch

User confirmed removing the existing user-facing knowledge-graph page/entry while retaining the professional portrait and underlying records. The new MORPH space defaults to a personal overview. The graph components, historical model tests and administrative APIs are retained for data safety/classic rollback, not exposed as a graph entry in the new space. Legacy `atlas` links render the portrait instead of a blank page. This section is the latest acceptance scope; earlier batch descriptions are historical.

### Visual truth and evidence

Source: supplied v17 `frontend/profile.html` (its original cover asset, identity layout and dark portrait/light evidence composition). Implementation: `/my-learning`, `/my-learning?view=portrait` and retained management views. Current evidence root: `apps/api/data/qa/morph-v17/my-space-integration/`.

- `source-profile.png` and `overview-final.png`: both 1440×900 CSS viewport; both PNGs 1425×891 px. `compare-full.png` scales both equally to 1000 px width, without asymmetric scaling.
- `compare-identity.png`: equal, unscaled 1140×310 px crops (x140, y350) from source and implementation for identity/typography/credit/metadata review. Cover heights differ deliberately; the crop is not used to claim identical avatar position.
- `portrait.png`, `notes.png`, `plan-final.png` record actual signed-in teacher views. `plan.png` is pre-fix evidence; its black task headings were rejected and replaced.

### Required fidelity surfaces and deliberate differences

Typography: same established platform font stack, 32 px name, 24 px section headings and 13–14 px body/management text. No demo identity or school information is imported. Spacing: source cover/identity/statistics composition retained; cover is deliberately shortened to 270 px to leave room for the horizontal management navigation. Detail tabs use a compact identity header rather than repeating the large cover. Colors: lavender/ink/purple/lime tokens retained, replacing old green/black management styling. Images: original supplied `digital-organism-cover-v1.png` is used directly with a clear default-cover alt; course images use the shared course component. Missing work imagery has an honest empty state rather than unrelated artwork. Copy/content: account, roles, courses, progress, quota, notes and personal submissions come from existing APIs. Collected cases remain separate from original creation records and preserve original authors.

The professional portrait is explicitly a **real-record/evidence version**, not an assessed ability radar. The source's static radar scores, badges, followers and copy counts are not production facts and are not rendered. Actual completed lesson topics, course progress, workflow completion/configuration and growth records replace those unsupported values. Personal profile editing and avatar/cover upload remain a later account-profile API batch; no inert Edit button or browser-only profile persistence is exposed.

### Iteration history

- P2: old personal page shell/graph conflicted with the selected profile structure. Added the source-informed cover/identity header, overview and URL-addressable horizontal views; removed the conflicting graph entry in the new frontend. Underlying records/components were not deleted.
- P2: old task-group black headers produced dark-on-dark headings in the new space. Replaced them with light lavender headers and explicit readable label/count colors; verified `plan-final.png` after the correction.
- P2: legacy selected-filter child text could remain dark. Added an explicit scoped selected-label foreground and retained keyboard focus indication.
- P2: learning aggregation can omit local-media cover URLs. Favorites are enriched from the canonical public catalog **only for IDs already favorited by this account**; no extra public works are inserted into a private list. Absent canonical covers remain an explicit empty state. Added a regression test.
- Lifecycle: protected against stale asynchronous account responses and prevents rendering another account's learning payload; optional own-work load failures get a dedicated retry state instead of silently claiming zero works.

### Functional verification and limits

Browser checked overview/portrait/course/plan/note/works/favorites navigation, URL query state, browser Back, course complete filter (1/3), empty result (0/3), clear recovery (3/3), work-source selector, and authenticated legacy graph URL mapping (portrait selected, zero graph navigation buttons). Existing forms and delete confirmations remain wired to the original business methods; no save/delete/completion was submitted during this QA. Existing notes and tasks remained visible. No schema, model key, authentication protection, paid generation or published content changed.

Final `npm run check`: exit 0; API typecheck, frontend production build and **302 tests passed** (137 API, 6 Sites, 37 chat, 109 platform, 7 case import, 6 reliability). Whitespace check passed. Initial Vite hot-update import errors occurred while the new stylesheet was not yet created; a fresh load after the successful build rendered the final components. A pre-existing session continuity problem was observed during direct navigation and required re-login; authenticated old-link rendering passed, but persistent sign-in is not claimed fixed or fully accepted by this visual batch.

Mobile, full screen-reader certification, account-profile write APIs, ability scoring/radar assessment and live destructive/write workflows remain outside this batch. Existing administrative knowledge configuration remains untouched. No GitHub push/merge was performed.

The five visual surfaces were reviewed using the paired full view, identity focus and actual portrait/management views. No unresolved actionable P0/P1/P2 visual issue remains within this desktop/real-record scope; authentication continuity is a separately disclosed pre-existing regression item, not hidden as a successful auth test.

final result: passed
