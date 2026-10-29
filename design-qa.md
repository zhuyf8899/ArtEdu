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

## 2026-10-16 · MORPH content catalog deployment

Scope: replace the three approved legacy course listings with the 13-course handoff catalog; install 19 third-party tool references and preserve three existing platform/specialized entrances. Three new trial courses have nine structured lessons; ten courses remain explicitly coming soon. No source demo progress, fictional authors, prices or approval decisions were imported. Trial content is new editorial material pending educational review, not a fully reviewed teaching resource collection.

Implementation and validation:

- Versioned content manifest, stable legacy mappings, public local covers, read-only plan, exclusive snapshot backup, transactional install/journal and repeat-install protection. Rollback archives imported content rather than deleting history and refuses later editorial changes.
- Actual local DB: 13 published catalog listings, 9 trial lessons, 19 new tool references and 14 approved cases. Before/after counts/digests of eight personal-history/content tables were unchanged. Repeated installation returned alreadyInstalled with no overwrite.
- Rollback-only local database test: all four demo roles receive 13 catalog listings; coming-soon enrollment rejected; one completed lesson of three is 33%; daily task and 900-second estimate recorded; final assignment without an owned work rejected; course/tool search uses canonical metadata. All temporary test-user writes rolled back.
- Browser checks: catalog/filters and readiness, trial course text and diagrams, disabled coming-soon enrollment, course-to-tool query navigation, related-course collapse, global Figma search showing 9 courses plus 1 tool with covers. No live paid AI or real learning-completion writes were performed through the UI.
- Fixed inherited full-height status badge obscuring covers; fixed 36px heading with inherited 22px line-height overlapping its description. Detail hero is now light with explicit text sizes; lesson sections use readable line spacing. Compact desktop catalog switches to one column to avoid cramped covers. Final trial page at the ordinary 912px browser viewport had no document overflow and no failed images.
- Evidence: ignored `apps/api/data/qa/morph-v17/content-catalog/trial-detail.png` and `trial-lesson.png`. Backups and evidence are not public repository inputs.

Final `npm run check`: exit 0, API typecheck, production frontend build and **310 tests passed** (137 API, 6 Sites, 37 chat, 109 platform, 15 import/deployment, 6 reliability). Git whitespace check passed. A transient compile error while the fourth search query was being added was corrected before final typecheck/build/live regression.

Limitations: browser session expiry/401 recurred during private My Space navigation; this pre-existing item remains unresolved and a full personal-space browser acceptance is not claimed. DB preservation and personal-course response mapping were separately verified. Five external-site fetches were inconclusive and are labeled access-verification pending; this is not proof of service downtime. Mobile, full browser E2E work submission, final educational review, and server/container deployment execution remain outside this local acceptance. Existing deploy-script syntax/regression tests passed; no actual staging deployment occurred. Changes remain on local `feat/morph-content-catalog`; no GitHub push or merge this turn.

final result: local content deployment and automated regression passed; private-session/browser continuity remains a disclosed follow-up.

## 2026-10-16 · Skill-tool card fidelity correction

Scope: the desktop skill-tool directory cards at `/studio`, matching the supplied v17 card anatomy while preserving live directory records and existing navigation. No database migration, content reinstall, learning-record mutation or GitHub publication was performed in this correction.

Source visual truth: `C:/Users/64502/Documents/Codex/morph-v17-reference-20261015/MORPH-LAB-完整前端-v17-开发交接-20261015/frontend/skill-tools.html`, rendered from a temporary localhost reference server this turn. Source assets are reused, not recreated. State: light theme, Blender search returning Blender and Tripo. The source demo identity, bookmarks, endorsement badges and unverified prices are not production business data.

Evidence root: `C:/Users/64502/Desktop/codex1/artedu-document-integration/apps/api/data/qa/morph-v17/tool-cards/` (ignored local evidence).

- Full-view comparison: `reference-page.png` (896 × 1063) and `final-page.png` (896 × 1892), captured and opened together. Both use the ordinary 912 × 728 CSS desktop viewport; full-page heights differ because the real platform retains its shared filter controls and working node-workflow directory. The reference sticky navigation appears at its scroll position in the full-page capture; it is not treated as a card defect. Animated banner phase, real identity and live count (22 rather than 19) are expected differences.
- Focused comparison: `final-reference-normalized.png` and `final-cards.png`, both 719 × 490, opened together in one comparison input. Source crop comes from the same-turn 912px reference capture (`reference-page.png`, rectangle 89,433,719,490); implementation crop starts at its actual card row (89,638,719,490). No imagery was redrawn or scaled. Browser reports OS density 1.25; screenshot API emits CSS-sized clips, so no additional density scaling was applied. Card-top alignment removes differing toolbar heights from the comparison. Whole ordinary viewport captures `reference-aligned.png` and `before-aligned.png` are both 897 × 716 including their visible content area.
- Additional evidence: `related-courses.png` (all nine Figma course buttons expanded), `list-912.png` / `list-1280.png` (intermediate list review), and final `final-preview.png` (760 × 650, live all-tools state). Actual layout checks: ordinary 912 × 728 gives two columns; temporary 1280 × 720 desktop gives three columns. Neither had horizontal document overflow. Mobile was explicitly outside this batch.

Comparison history / findings:

1. [P1, resolved] `before-aligned.png`: a separate 112px logo panel allowed a small raster logo to enlarge and overlap the header/body, while the same logo appeared again beside the title. Replaced with the source-style 61px icon container and an explicit 36px contained image, with image-error fallback. Removed the obsolete hero rules. Same original source logos now render sharply at their intended size.
2. [P2, resolved] Missing capability tags and mixed metadata hierarchy. Added separate category badge, functional tags from API catalog metadata, neutral source-derived subtitle, stage/destination row and aligned domain/CTA footer. Related courses remain real and are collapsed behind an accessible count control; no source fake collection state was introduced.
3. [P2, resolved] First implementation comparison exposed an inherited minimum paragraph height in the subtitle and unequal row bottoms. Reset subtitle minimum height and use grid stretch. Final paired card captures show aligned headers and footers. Real shorter descriptions, related-course controls and access-pending labels intentionally change card height compared with the demo's long prose/prices.
4. [P2, resolved] List review exposed a stretched category pill and centered footer in the compact desktop variant. Added `justify-self:start` to categories and restored `space-between` for the footer below 1200px. Existing workflow preview buttons also had low-contrast inherited text; scoped their dark CTA to explicit white text. Final `final-list.png` was opened after the fix: category width 71.34px, CTA height 38px, right edge 782.31px matching its footer edge; workflow CTA computed white on rgb(23,26,47). Temporary reference/wide/popup tabs were closed; the user tab remains on the all-22-tools grid, and the temporary viewport override was reset.

Required fidelity surfaces:

- Typography: source UI font stack retained; 20px/28px, weight 650 titles; 14px/22px descriptions; 12px/18px subtitles/tags/metadata; explicit normal weight on neutral note text. Long names wrap within the title column rather than overlap icons or CTAs.
- Spacing/layout: source 24px padding, 20px radius, 61px logo slot, 12px header gap, 16px content rhythm, subtle footer divider. Compact 912px and wider 1280px grid/list modes checked. Expandable course links wrap inside the card and remain separate from the external anchor.
- Colors/tokens: established MORPH ink/purple/lavender surface retained; AI/3D/interactive/resource category colors follow the source families with darker readable text. White CTA text is explicit, not inherited from classic styles. Real admin `featured` flags alone create recommendation badges.
- Image quality: local handoff brand assets at 36px, `object-fit:contain`, no duplicate enlarged logo. All visible local logos loaded; the broader 22-tool check found no completed broken images. Existing remote/favicon fallback remains for legacy tools.
- Copy/content: API-owned descriptions, tags, URLs, related courses and link-review warnings retained. No pricing claims, fake endorsements or demo bookmark actions. Single directory-level notice explains external navigation, API non-integration, and provider-controlled fees/accounts, replacing repeated per-card disclaimers.

Interactions: category selection, name/tag search, no-results recovery (0 → 22), grid/list switching, expansion of all nine Figma courses and navigation into the real color-course detail, Figma official-site opening in a separate tab, and the workflow card entering management without executing or creating a workflow. Inspected page console returned no error entries in this run. External access and billing are not guaranteed by these navigation checks. Full screen-reader certification, mobile and live administrative content edits were not claimed. Previously disclosed private-session continuity is outside this visual fix and was not bypassed or reported fixed.

Automated acceptance: full `npm run check` passed 313 tests (137 API, 6 Sites, 37 chat, 112 platform, 15 import/deployment, 6 reliability), API typecheck and production frontend build. Final frontend build/regression rerun and `git diff --check` passed. Three added regressions cover card metadata/category mapping, contained logo/collapsed related courses, and separated safe launch controls. Source and final rendered cards were compared after fixes, with no remaining actionable P0/P1/P2 within the agreed card scope. The broader platform is not certified issue-free.

Implementation checklist: compact supplied logos; restore metadata hierarchy; preserve real navigation; collapse course links; align grid/list cards; check desktop evidence; record test results — complete.

final result: passed

## 2026-10-16 · Final course/tool source-copy and layout verification

Scope: the user's final v17 fidelity request: complete tool descriptions, named launch buttons, and a last comparison of desktop course/tool content and cards. This supersedes the shortened-description exception in the preceding card review. It does not certify authentication continuity, mobile, external vendor availability or the whole platform.

### Source and rendered evidence

Visual truth: user-supplied `MORPH-LAB-完整前端-v17-开发交接-20261015.zip`, extracted under `C:/Users/64502/Documents/Codex/morph-v17-reference-20261015/MORPH-LAB-完整前端-v17-开发交接-20261015/frontend/`. The actual `skill-tools.html`, `atomic-courses-particles.html` and `platform-data.js` were inspected, with source pages rendered in the in-app browser. Original supplied logos/covers are reused, not approximated or generated.

Evidence root: `C:/Users/64502/Desktop/codex1/artedu-document-integration/apps/api/data/qa/morph-v17/final-fidelity/` (ignored local QA files).

- Full composition evidence: `tools-source.png` / `tools-final-viewport.png`, and `courses-source.png` / `courses-after-viewport.png`. Source captures are full-page, implementation viewport captures show the top-level hierarchy. These have differing heights and toolbar/business states, and are not claimed pixel-identical. Focused equal-size pairs below isolate the actual cards at the same 1280 × 720 CSS desktop viewport.
- Tool final focus: `tools-final-source.png` and `tools-final-focus.png`, both 680 × 530 px. Light theme, Blender query returning Blender and Tripo. Clips begin at x126/y391 in source and x126/y578 in implementation to align card tops despite different filter sections. Source and implementation were opened together for comparison. API screenshots produce CSS-sized clips despite reported OS density 1.25; no asymmetric scaling, image redraw or additional density conversion was used.
- Course final focus: `courses-final-source.png` and `courses-final-focus.png`, both 1030 × 420 px, all-course state. Source clip x126/y688 and implementation x126/y901 align the first course row. Both were opened in one comparison input. The real cards are approximately 493.9 px wide, 354.8–359.8 px tall, versus approximately 352 px source height; the small height difference retains real tool/lesson metadata in place of demo popularity and progress.
- Final ordinary desktop recheck: 912 × 728 CSS, `final-preview.png` (760 × 680 px) shows live all-22-tools cards; `course-912-final.png` (740 × 390 px) shows the final course classification accent and card. Both saved images were opened and accepted. `course-detail-final.png` shows the actual course detail at this ordinary viewport after its API requests succeeded. No document horizontal overflow was found; course catalog has 13 cards, no completed broken images; tool catalog has 22 cards and zero generic “打开官网” CTAs.

### Findings, fixes and comparison history

1. [P1, resolved; content] Tool body descriptions were abridged relative to the supplied source. Added the versioned `morph-tool-copy-v2` editorial revision with all 19 exact full descriptions and subtitles. Data comes from the API in both directory and search; removed the frontend's duplicate subtitle lookup. Source-to-manifest comparison covered 19 tools and found zero description/subtitle differences. Final paired tool images show full visible paragraphs, not line-clamped excerpts.
2. [P2, resolved; affordance] Generic “打开官网” obscured which destination would open. Each visible launch now says “打开 <actual tool name>”; external links remain separate safe new-tab anchors, internal tools retain existing SPA routing, and node workflow opens management rather than executing a workflow. Long names wrap within the card. The user explicitly requested this CTA difference from the source's action phrases.
3. [P2, resolved; content/hierarchy] Course difficulty terminology, course codes, two-button anatomy and the connection preview differed. Added scoped 入门/进阶/专家 display, source codes, 查看详情 plus a real-state study/planning action, and the DTH-10 method core connected to POS-11/PRD-12/INF-13. Removed the incorrect first-four-array-order preview. Full titles, summaries, categories, difficulty values, durations and covers match all 13 source courses. Real trial/coming-soon/author/history state remains deliberately different from demo records.
4. [P2, resolved; typography] The first focused comparison (`tools-after-focus.png`) exposed inherited 1.4px paragraph letter spacing. Scoped tool descriptions to normal letter spacing/text transform. Re-captured `tools-final-focus.png` against `tools-final-source.png`: full copy now has source-like density and readable wrapping.
5. [P2, resolved; spacing/layout] Initial course focus showed incorrect cover/body proportions and padding; the connection preview was too narrow at wide desktop. Set cover to 30.24%, body padding to 24px, final desktop container to source-like 80%, and wide connection preview to one core plus three horizontal branches. Final course pairs show aligned buttons, proper content margins and full summaries. At ordinary 912px desktop the single-column course layout is deliberate to preserve readable cover/text proportions; tool grid retains two columns. No viewport override remains in the user's tab.

### Five required fidelity surfaces

- Fonts/typography: preserved the supplied UI font system, title/body hierarchy, readable normal letter spacing, full multiline descriptions and contained long names. Course codes use a compact monospace secondary role. No oversized/duplicated brand logo competes with titles.
- Spacing/layout: tool cards retain 24px padding, 20px radius, 61px logo slot with 36px contained original logo, category/description/tag/meta/footer separation. Course covers and padded body follow the source proportions; metadata and paired actions are left-aligned. Rows stretch without clipped text. Wider 1280px and ordinary 912px desktop states were checked.
- Colors/tokens: MORPH lavender/ink/purple theme retained; source category families remain distinct. Course category is purple, codes/secondary meta muted, dark launch buttons explicitly use white text. Existing workflow dark buttons also retain explicit contrast. No new palette is introduced.
- Image quality: actual local source assets, contained logos, original course covers; no div art or custom logo replacement. Final catalog image check found no broken completed images. External favicon/legacy fallback remains only for preserved legacy tools.
- Copy/content: 13-course and 19-tool editorial fields were compared to source with zero targeted differences. No fabricated source teachers, demo completion percentages, popularity, prices or endorsement/bookmark state was imported. Supplier performance/free-access wording is restored user-supplied editorial text, not a new independent verification. The directory notice still explains external navigation versus API integration and provider-controlled accounts/fees/access.

### Functional, database and regression verification

1. Directory browsing — healthy in accepted final state: all 22 tools, full source descriptions and named actions; card/list, filtering, related courses and safe navigation remain wired to existing handlers. This run also verified normal sign-in followed by global search for “多人实时协作” finding Figma with the full canonical description and cover. No paid generation or workflow execution was invoked.
2. Course catalog/detail — healthy after runtime recovery: 13 course cards and correct preview, source difficulty/code and detail/study actions. The final ordinary browser click into 色彩构成基础 returned its three real trial lessons, source summary, tool links and disabled completion gates for an unenrolled account. No enrollment/completion/submission was performed in this UI review.
3. Data installation — healthy: immutable v1 checksum remains unchanged. V2 writes only the 19 tools' detail/subtitle metadata after an exclusive backup and transaction; plan rejects conflicting/missing/edited content. Re-install returns alreadyInstalled for both versions. Actual local DB verification matched 13 course metadata records and 19 tool revisions, retained 14 published cases, and matched eight personal-history table counts/digests.
4. Rollback safety — healthy: the actual v2 rollback ran within an outer always-rolled-back local transaction, restoring all 19 original descriptions inside the test and leaving the live revision active afterward. Deep object equality handles JSONB key order without weakening later-edit protection. No real history was changed.

Final full `npm run check`: exit 0, API typecheck, frontend production build and **318 tests passed** (137 API, 6 Sites, 37 chat, 113 platform, 19 import/deployment, 6 reliability). Log: `acceptance.log`. Whitespace check passed.

Console/runtime limits: earlier HMR briefly reported a missing `morphCourseLevel` export while files were being edited; final build and a subsequent full browser reload loaded the final module correctly, with no new instance of that error. During the final course-detail click, Vite returned HTTP 500 because the local watched API was restarting (proxy ECONNREFUSED at 21:49:12, API ready 21:49:13). After readiness, both `/api/courses/morph-course-col-01` and `/api/me/works` returned 200 and the accepted final detail screenshot has no alert or overflow. This was runtime recovery, not a claimed code fix for all transient outages. The separately observed pre-existing session/401 continuity problem still requires occasional re-login and is not claimed fixed here.

No remaining actionable P0/P1/P2 in the agreed desktop source-copy/card scope. Mobile, full screen-reader/zoom certification, final educational approval, external vendor performance/availability and production deployment remain excluded. Three trial courses are pending educational review; ten remain coming soon. No GitHub push/merge was performed for this local batch.

Implementation checklist: restore exact editorial copy; keep versioned backup/idempotence/rollback; named launch controls; course metadata and preview; fix spacing/proportions; compare final source/implementation; exercise real read-only flows; preserve history; run full regression — complete.

final result: passed

## 2026-10-17 — Six supplied handoff differences

### Comparison target and evidence

Scope: the six screenshots supplied on 2026-10-17: curriculum entry, course status pill, course filter rows, course footer actions, tool recommendation entry, and curriculum composer. This is not a claim that every screen and every production integration is identical to the standalone demo.

Source truth: `C:/Users/64502/Documents/Codex/morph-v17-reference-20261015/MORPH-LAB-完整前端-v17-开发交接-20261015/frontend/` — `atomic-courses-particles.html`, `skill-tools.html`, `curriculum.html`, their scripts and styles. Original source assets, text, font stack and design tokens were inspected directly. No new image assets were needed.

Evidence directory: `design-qa-assets/handoff-six-details-20261017/`. Captured in the in-app browser at a 1440 × 1000 CSS desktop viewport, reported devicePixelRatio approximately 1. The browser returns JPEG bytes; the evidence files use `.jpg` extensions. Source and implementation were emitted together in each comparison input, not judged from code alone.

- Course full views: `courses-source-final.jpg` / `courses-final.jpg`, both 1425 × 990 raster pixels. Equal raster size; no resampling needed. `course-card-source.jpg` / `course-card-app.jpg` are focused first-card crops, 558 × 352 / 558 × 354 pixels. The 2px height difference is the live card border, not content clipping.
- Composer full views: `composer-source-final.jpg` / `composer-final.jpg`, both 1440 × 1000 pixels. Both show the empty welcome state, three topic suggestions and the goal form. The final saved file was reopened to confirm it shows the composer, not the previous route's compositor frame.
- Tool full views: `tools-source-final.jpg` / `tools-final.jpg`, both 1425 × 990 pixels. Focus is the restored dark recommendation CTA in the banner. Actual tool data, order, 22 real entries and existing browse controls remain intentionally API-owned; the source has 19 demo entries. No source popularity, pricing, endorsement or fake bookmarks were imported.
- Recommendation dialog: `tool-form-source-final.jpg` (1425 × 990) / `tool-form-final.jpg` (1440 × 1000); `tool-form-normalized.jpg` is a 1425 × 990 density-normalized comparison copy. Both show the native modal open; the implementation additionally shows the saved draft's non-sensitive Figma fields. The explanatory local-draft notice is intentionally explicit. Close-control contrast and focus are visible in the final capture.
- Interaction evidence: `composer-result.jpg`, `saved-path-note.jpg`. Intermediate `*-before` and `*-v1` captures are iteration records, not accepted final delivery images. In particular `tools-before.jpg` was caught during loading and was not used to judge final fidelity.

### Findings and iteration history

1. [P1 resolved — navigation/copy] The lime course connection CTA incorrectly opened the professional portrait. Restored “AI 编排课程体系” and a dedicated `/curriculum` route with refreshable `?topic=` goals. The unrelated retired graph entry remains removed.
2. [P2 resolved — status hierarchy] Long readiness labels overrode the source-style progress pill. Restored dark in-progress, lime completed and light not-started treatments. Text derives from real progress; coming-soon and archived states retain truthful labels. Trial readiness moved to concise secondary metadata. Source sample 60%/100% records and demo teachers are deliberately not copied.
3. [P2 resolved — layout density] The course catalog added three dropdown filters, an always-visible count row and a large wrapper absent from the handoff. Removed the dropdowns; restored the compact category/search layout and seven source directions, including empty categories. Counts remain accessible; selected/empty states still expose clear-filter controls. Moved the truthful trial/course-readiness explanation below the grid instead of above the connection preview.
4. [P2 resolved — card footer] Extra lesson/method and tool/code metadata disrupted the source anatomy and pushed buttons out of alignment. Simplified the card and restored paired detail/study buttons aligned at the end of the footer. Trial entry uses the source “开始学习” label but still opens the real trial detail and does not silently enrol or complete a lesson. Coming-soon cards use “查看规划”. No fictitious view/favourite metrics replace the removed metadata.
5. [P1 resolved — missing action] Restored “推荐一个工具” in the tool banner. Implemented the handoff's local draft form using an account-scoped storage key, http(s) URL validation, length limits, visible errors and an honest not-submitted/not-published notice. This is not an admin publishing API.
6. [P1 resolved — missing page] Restored the composer hierarchy, lavender surface, 960px welcome panel, three topic shortcuts, goal input and dark submit button. Recommendations use the handoff's editorial course-code order resolved against live API IDs. They neither call a paid model nor fabricate course readiness or learning progress. Paths can open their real course details and save to the existing personal learning-note service.
7. [P2 resolved in second comparison — spacing/contrast] First composer comparison showed an overly wide content-box panel, gradient background and disabled grey primary CTA. Corrected the panel to border-box 960px, source lavender background, source-like header spacing and dark native-required submit control. The first dialog comparison exposed a white-on-white close icon; it now explicitly uses ink color and retains a focus ring. Post-fix evidence is in the final composer/dialog pairs.
8. [P2 resolved — preview surface] Restored the source's 28px backdrop blur on the connection preview and normal-weight eyebrow. Removed the substituted portrait CTA and extra expand/note rows to match the handoff preview composition.

### Required fidelity surfaces

- Fonts/typography: supplied PingFang SC / Microsoft YaHei / Inter system stack; 36/44 page heading, 24/32 section heading, 20/28 course title, 14/22 body and 12/18 metadata. Full descriptions remain readable, with no word-by-word vertical wrapping. Focus outlines are retained.
- Spacing/layout: same 80% desktop content width, one-plus-three preview arrangement, compact filter/search row, 30.24% course cover, 24px card padding and paired footer actions. Composer retains a 960px centered panel with clearly separated suggestions/input/notice. Native modal remains viewport-bounded and scrollable.
- Colors/tokens: source ink `#171a2f`, purple `#6554e8`, lime `#d8f845`, lavender `#eceaf7` and border `#dddff0`; state colours reflect real state, not source demo progress. Primary controls and close icon have explicit foreground/background contrast.
- Image/asset fidelity: existing original course covers and source banner effects remain; no new div artwork or generated placeholder imagery. Final course DOM check: 13 cards and zero completed broken images. Library Sparkle/Arrow/Spinner icons replace the source's UI glyphs; no custom SVG artwork was authored.
- Copy/content: the requested CTA names, composer headings, supporting copy, goal suggestions and model-service notice follow the handoff. Real author-confirmation, trial/coming-soon state, absent popularity and local-draft disclosures are intentional product constraints. Course/tool data, IDs, backend permissions and case records were not replaced with demo data.

### Functional and regression checks

- Catalog: empty “美术史” category shows an empty state; clear filters restores all 13 courses. “开始学习” opens 色彩构成基础 with three real trial lessons, “加入试学” and disabled completion gates; no enrolment or completion was performed.
- Composer: information-chart path produces five current course IDs and 285 planned minutes; product path produces four current IDs and 375 planned minutes. Unknown “音乐编曲” offers supported-direction recovery. Refresh preserves the selected topic. Stable-code resolution, partial/empty catalogs, archived exclusion and genuine status are covered by added unit tests.
- Personal save: saved one “产品设计 · 学习路径” note to the current student account and opened the existing notes view to verify its four real course references. This is an ordinary learning note, not a completed course, task or inferred capability.
- Tool draft: saved a Figma recommendation locally, reopened and verified name/URL/reason restored. Escape and close both close the modal and return focus to the recommendation trigger. Account isolation, corrupt/blocked storage handling, unsafe protocols/credential-bearing URLs and length validation are covered by tests. No recommendation was published or transmitted to an administrator.
- Final `npm run check`: exit 0; API typecheck, production frontend build and **324 tests passed** (137 API, 6 Sites, 37 chat, 119 platform, 19 import/deployment, 6 reliability). Log: `apps/api/data/qa/local-20261017/handoff-check-final.log`. `git diff --check` passed.
- Browser console inspection found two earlier Vite hot-reload failures while referenced new files were being created (03:09 / 03:12 UTC). Subsequent module loading, full-route refresh, normal interactions and final production build succeeded; no later runtime error was observed in this verification. This is not a claim to have fixed the previously known session-continuity issue.
- Temporary viewport reset was requested and the reference tab was closed; the live platform tab is retained on `/curriculum`. Final checked desktop document had no horizontal overflow. No mobile certification, paid AI integration, admin recommendation workflow, GitHub push or merge was performed in this task.

### Follow-up polish / intentional differences

[P3] The Phosphor Spinner has fewer rays than the handoff's Unicode welcome star; it preserves the compact purple visual role using the existing icon system. Small panel-height/footer and native form-control rendering differences remain within the source hierarchy. No P0/P1/P2 issue remains in the six requested correction areas. Other module-specific filters, real directory counts/order and admin/classic interfaces were not redesigned as part of these six screenshots.

Implementation checklist: source inspection; six corrections; truthful state; working curriculum and draft flows; paired full/focused screenshots; contrast repair; regression checks; retain local preview — complete.

final result: passed

## 2026-10-18 — course progress synchronization and handoff states

Scope: the reported 67% detail / “未开始” catalog inconsistency, and the handoff's progress badge, bar and action. This is not a new whole-platform or mobile acceptance.

### Evidence and comparison

- User problem screenshots: `F:/屏幕截图 2026-10-18 120008.png` and `F:/屏幕截图 2026-10-18 120012.png`.
- Visual truth: supplied `frontend/atomic-courses-particles.html`, `platform.js` and `platform.css` under `C:/Users/64502/Documents/Codex/morph-v17-reference-20261015/MORPH-LAB-完整前端-v17-开发交接-20261015/`; opened read-only on port 4381. The reference's own local demo control was used to show its 100% color-course state; it does not contact ArtEdu.
- Local evidence directory: `apps/api/data/qa/course-progress-20261018/` (ignored). `catalog-67.jpg` and `detail-67.jpg` show the actual account's unchanged 67%, two completed lessons out of three, “进行中” and “继续学习”.
- `source-complete-card.jpg` and `fixture-100-card.jpg` were opened together for the focused source/implementation comparison. Both use the same course, source cover, completed state and 1280×720 CSS viewport, DPR 1.25. Source card CSS bounds: 493.91×352; implementation: 494×353.6. Resulting clips: 493×352 / 494×353 pixels; compared without asymmetric rescaling. The approx. 1px border/rounding difference is intentional browser/rendering variance.
- Full implementation views: `fixture-0.jpg`, `fixture-67.jpg`, `fixture-100.jpg`; the fixture reuses the real component and immutable save-response merge, never an API or account record. Real page captures are 815×777 pixels from an 830×792 CSS viewport, DPR 1.25; their browser viewport is narrower than the reference, so global page proportions are not claimed as a same-size comparison.

### Findings and fixes

1. [P1 resolved — stale state] The API had retained 67%; a fresh catalog request already showed it. Completing a lesson only replaced the selected detail, leaving the mounted catalog and parent/home data stale. All successful enroll/progress/submission responses now update the detail, the corresponding existing catalog item and the parent's course record. Returning via the back button or browser history revalidates the catalog. Request IDs prevent an older catalog fetch from overwriting a successful save.
2. [P2 resolved — completion style] The card did not apply the source's complete progress treatment. One shared progress interpretation now drives the badge, numeric bar and button; purple indicates in-progress, green `#388a47` indicates completed, and the source lime badge accompanies “已完成 / 回顾课程”. Native progress elements have names and value text, so color is not the only signal. The paired post-fix focused captures verify this treatment.
3. [P2 resolved — detail feedback] Detail now displays “2 / 3 课时已完成”, a native named progress bar, and “进行中” rather than only “已加入学习”. Completed detail uses the same green bar/lime status. Trial copy now correctly says progress is saved, without implying teacher-reviewed or professional certification.
4. [P2 resolved — aggregation consistency] The courses service's personal-enrollment query ignored lessons with no progress row. It now includes zero for those lessons, matching catalog/detail and the learning-space query. No schema, stored progress, lesson requirements or completion authorization was changed.

### Required fidelity surfaces

- Typography: existing system Chinese font stack, 20/28 course titles, 14/22 descriptions and 12px metadata/badges retained. Percentages use tabular numerals. No vertical word wrapping or truncation introduced.
- Spacing/layout: original cover/body proportions, card padding, rounded boundary and paired actions retained. Compared full scenes and focused card states; the actual 67% page has no horizontal overflow. No new progress dashboard or extra filter row was added.
- Colors/tokens: handoff ink, purple, lime badge and exact complete-bar green are reused. Zero, partial and completed states are also expressed in words and button labels.
- Images/assets: original supplied SVG course cover retained; no new images, placeholder artwork or decorative SVG were generated. The fixture's initial fallback cover was replaced with the real asset before final focused QA.
- Copy/content: actual authors and review readiness remain API-owned. Reference popularity metrics and fictitious teacher identity are deliberately absent. The progress bar sits lower because those demo metrics are not inserted; this is an intentional product constraint, not progress-style drift.

### Verification and boundaries

- Actual UI: detail at 67%, return to catalog, filtered card at 67%, refresh and “继续学习” opening the same three lessons. The third work-submission requirement and disabled completion gate remain intact.
- Isolated browser fixture: 0→67→100 updates the real card's label, bar, percentage and CTA immediately, without real enrollment/progress writes. A development-only duplicate-root warning during fixture hot edits was corrected with HMR unmount cleanup; no production root code was changed.
- Regression: shared normalization, 0/67/100 labels/actions, invalid/negative/non-finite input, 99.9% not completed, immutable metadata-preserving merge, unknown ID exclusion, synchronization wiring and real React server-rendered card markup tested. Backend query checks include current-user scoping, published lessons and zero-valued unrecorded lessons.
- Final `npm run check`: exit 0; API typecheck, frontend production build and **329 tests passed** (138 API, 6 Sites, 37 chat, 123 platform, 19 import/deployment, 6 reliability). Log: `apps/api/data/qa/course-progress-20261018/check.log`. `git diff --check` passed.
- Local API was rebuilt and restarted only to load the query correction; original database/volume/uploads were preserved, no seed/migration, progress completion, submitted work, model request, GitHub push or merge performed. Normal demo-account sign-in was used after observed session invalidation; this task does not claim to resolve the previously known session-continuity issue.
- Real 100% completion was not forced on this user's 67% course. Completed rendering is proven by the isolated actual-component fixture and automated tests, not by modifying the user's remaining lesson or bypassing its work-submission gate.

Implementation checklist: repair state synchronization; unify progress state/styles; preserve genuine records and completion gates; compare source/implementation; run regression suite — complete.

final result: passed

## 2026-10-18 · Post-integration functional polish

- Scope: first-pass audit of major user routes, seven personal-space views and eight admin modules. Current-run screenshots and per-page findings are indexed in `docs/integration-audit-2026-10-18.md`; media is under `apps/api/data/qa/integration-audit-20261018/`.
- Preserved the handoff visual system. Repaired desktop search card compression, canonical author attribution and case/workflow deep links, personal-space first-use empty state/zero-progress classification, compact quota header, form legibility, truthful demo-mode copy and available-course launch from curriculum results. Public gallery auxiliary-load resilience and interaction synchronization have automated coverage.
- Actual browser checks: creator search returns Fertile Matrices by Robin Champenois; result opens the exact work, reload retains it, return restores 4 curated and 10 community cases, and an invalid work has retry/back recovery. At 830px search body is about 340px wide and at 1440px about 475px, without page horizontal overflow. My-courses first-use CTA and quota header visually confirmed. Curriculum reports 3 available/2 planned and opens the color course without enrollment.
- Final full regression: `npm run check` exit 0; 336 tests pass (139 API, 12 Sites/integration, 37 chat, 123 platform, 19 content/deployment, 6 reliability). Production frontend build and API typecheck pass. `git diff --check` passes. Final browser console error query was empty.
- API rebuilt/restarted with model execution disabled; database, cases, files and existing progress retained. No migration/seed, review/publish/report decision, Bridge token creation, paid generation or GitHub mutation.
- Not a complete write-path, mobile or WCAG certification. Remaining admin readability/filtering, unsaved-edit guards, server pagination and content-verification recommendations are explicitly recorded rather than claimed repaired.

Functional-polish verification result: passed within the stated scope.

## 2026-10-18 · MORPH v17 platform UI unification

### Scope and method

- User requested implementation of the integration audit recommendations and removal of reachable legacy UI styling. Extended the existing handoff system, not a new visual direction. Current-run source and implementation captures were inspected before and after changes. No new imagery, visual variants, source instruction execution or delegated asset work was necessary.
- Reference: supplied v17 frontend `platform.css`, `ui-system.css`, `workspace-native.css` and actual `chat.html` / skill-tools pages, temporarily served locally. Implementation: existing ArtEdu components plus `admin-console/src/morph/platform-unified.css`, not replacement static pages.
- Full numbered browser pass, findings, screenshot index, accepted differences and limits: `docs/ui-unification-2026-10-18.md`. Evidence is local-only in ignored `apps/api/data/qa/ui-unification-20261018/` to avoid automatically publishing account screenshots.
- Compared source `57-handoff-creation-1280.jpg` and implementation `58-creation-final-1280.jpg` together in the same visual inspection call. Requested CSS viewport 1280×720; capture outputs are respectively 1265×712 and 1280×720, an approximately 1.2% capture scaling difference. This is a style/fidelity extension pass, not a claim of pixel-identical screenshots. Additional desktop views: 1024×768 and 1440×900. No image editing or artificial viewport cropping to hide problems.

### Findings and iteration

1. [P1 resolved] Quota drawer initialized from an absent user and could offer hard-coded limits instead of actual values. Model now resets on selected account/current limits, preserves zero versus unlimited, prohibits incomplete/unchanged submissions and confirms before writing. Actual student daily 20/month and concurrency unlimited, then teacher unlimited values were verified; no save occurred. Final `54-quota-final-theme.jpg`.
2. [P2 resolved] Admin old thick black/beige, tiny type and duplicate main offset replaced by navy/lavender/white tokens; sidebar independently scrolls. All eight modules inspected. Course filters, real canonical author labels, archive-last ordering, no-result reset and below-list empty review area verified. Final `52-admin-courses-final.jpg`, narrow `51-admin-courses-1024.jpg`.
3. [P2 resolved] Creative workspace old palette and empty-thread bottom scrolling clipped the initial icon on a short screen. Reused source two-column glass panels; empty thread starts at top and genuine composer stays visible. Rejected v1/v2 captures retained for traceability; final `58-creation-final-1280.jpg` and `50-creation-1024.jpg` show fixes.
4. [P2 resolved] Body-level editors/feedback missed shell styling; note empty state and course/case controls retained old borders/colors. Shared body scope now covers these surfaces, without recoloring artwork. Unsaved course, case and note inputs tested through cancel-leave/reopen with exact text retained, then cleared without saving. Confirmation Escape/Tab focus support added. Proof `11-unsaved-course-dialog.jpg`.
5. [P2 resolved] Knowledge sidebar crowded the form, login heading stranded its last character, 404 was top-left, and image-canvas header text was dark on dark. Layout/typography scoped fixes verified with `20-admin-knowledge-final.jpg`, `41-login-final.jpg`, `47-not-found-final.jpg`, `56-canvas-final-1024.jpg`.
6. [P2 resolved] Workflow preview focused only the first node; edit node widths overlapped existing coordinates. Preview now fits all nodes until execution; edit cards 250px fit existing spacing without changing positions. React Flow dragHandle now belongs to mapped nodes, not a forwarded DOM prop. Reopened real three-node editor without new warning. Proof `43-workflow-preview-final.jpg`, `48-workflow-editor-final.jpg`.

### Required fidelity surfaces

- Typography: Chinese system font stack; operational body/forms 14px, readable 12–13px metadata, non-fragmenting headings, 32px login introduction. No artwork text/cover asset modification. Confirmation, forms and controls keep accessible names and visible focus treatment.
- Spacing/layout: source rounded panel boundaries and thin separators retained; wider real tables, 246px dark navigation, 250px knowledge/creation sidebars; filters wrap below 1199px. At 1280×720 the actual creative composer lies within viewport (bottom about 667px) and body scroll width equals viewport. No mobile layout claim.
- Colors/tokens: ink `#111838`, purple `#6554e8`, lime `#d8f845`, border `#e2e0f6`, page `#eceaf7`; specialized graphs stay navy with semantic node accents and lightbox stays black. Warnings retain a restrained semantic amber instead of being recolored misleadingly.
- Images/assets: existing handoff cover and gallery assets reused. No generated bitmap, rewritten artwork, fake branding or placeholder assets. Backend has no supplied screen to clone, so it intentionally extends reference tokens rather than inventing a claimed reference match.
- Content: real courses, tools, account limits, authors, provenance and permissions remain authoritative. Actual workspace modes/model/file controls preserved instead of static source demo copy. Account images and private draft are not submitted to external services. “Trial” is not relabeled as reviewed certification.

### Verification and limits

- Final `npm run check` exit 0, API typecheck and production frontend build pass; **343 tests passed**: 139 API, 19 Sites/integration/UI, 37 chat, 123 platform, 19 deployment/content, 6 reliability. New UI suite has seven tests. Log `apps/api/data/qa/ui-unification-20261018/check-final.log`. `git diff --check` passes.
- User routes, seven space views, eight admin modules, editors, case/media viewer, image canvas, workflow preview/editor and isolated actual login component inspected. Current admin's empty course/note records were not mistaken for the teacher's missing progress. Existing teacher 67% record was not changed.
- Previous dragHandle console entry remains in browser history, but revisiting corrected editor produced no new entry; temporary audit tab error query was empty. No erasure of errors or fabricated clean log history.
- No database switch/reset/seed/migration, quota save, role or status change, review/publish/report decision, Bridge token, paid model call, workflow save/run or GitHub mutation. Existing private workflow draft preserved; unsaved test text cleared locally.
- Browser history Back/Forward edge cases, actual quota/write/review/publish flows, real paid generation, mobile and full WCAG verification remain explicitly untested. Server-side pagination/complete author facets and content-review/professional-portrait evidence are subsequent feature work, not silently claimed completed.

Implementation checklist: inspect reference and current screens; extend tokens to reachable old surfaces; fix verified interaction defects; inspect desktop iterations; run full regression; preserve data and document boundaries — complete.

final result: passed within the documented desktop and non-destructive verification scope.

---

# MORPH LAB 原子课程集成视觉与功能核对

Reference: https://morph-lab-design-platform.wj27398.chatgpt.site/atomic-courses-particles

Date: 2026-10-27. Scope: desktop atomic learning surface in the existing ArtEdu application.

## Evidence

- Fixed comparison viewport: 1280 × 900 CSS px, deviceScaleFactor 1; source and implementation images are both 1280 × 900 physical px. Also checked 1440 × 1000 and 1920 × 1000.
- Full composition comparison: `design-qa-assets/atomic-particles-20261027/15-comparison-desktop.jpg`.
- Focused source/implementation card comparison: `design-qa-assets/atomic-particles-20261027/16-comparison-card.jpg`.
- Implementation states: `11-overview.jpg`, `12-atom-detail.jpg`, `13-teacher-upload.jpg`, `14-student-reflection.jpg` in the same folder.
- Browser checks: `browser-verification.json` in the same folder. Both source and local site were inspected in the in-app browser; final fixed-size checks used the user's previously authorized Playwright fallback.

## Findings resolved

1. **P1, header overlay:** the inherited banner allowed its decorative canvas and pseudo-element to cover the network beneath it. Added a clipped stacking context and constrained the banner overlay height. Verified title/network text remains unobscured.
2. **P2, network readability:** the initial six-row layout shrank labels too much. Reflowed teaching atoms into three-row columns and retained pan/zoom/reset controls and version-aware node links.
3. **P2, card geometry:** first draft used a proportional cover and moved the illustration down. The actual source uses a fixed 200 px cover, 180 × 290 source illustration at its origin, and its lower caption at 258 px. Corrected those measurements and recaptured the card comparison.
4. **P2, content filtering:** an empty category looked like the platform had no published content. Added a matching-results message and a visible clear-filters action; classification, progress state and search are applied before pagination.
5. **P2, illustration copy clipping:** compacted the source-inspired course planning panel's label/value typography so all three contribution types remain visible.

## Required fidelity surfaces

- **Typography:** Noto Sans SC / PingFang SC / Microsoft YaHei stack; source-aligned 36 px heading, 24 px network intro, 20 px card headings, 14 px body and 12 px classification/contributor text. Long live-data titles may wrap rather than being clipped.
- **Spacing/layout:** 80% desktop content width, 24 px column gaps, 20 px card/panel radii, fixed source cover geometry. Controls wrap without horizontal document overflow at checked desktop sizes. The existing role-based workflow tabs are intentionally additional.
- **Colors/tokens:** source lavender `#eceaf7`, white cards, dark `#171a2f` controls, purple `#6554e8` accents and lime `#d8f845` selected/completion accents. Semantic progress uses actual evidence rather than example percentages.
- **Assets:** original source SVG covers and paper illustration copied locally and inspected in rendered screenshots. Header uses the project's existing MORPH network effect. Relationship graphics are interactive data visualization of stored relationships. No source artwork has been replaced by an approximate CSS drawing.
- **Copy/content:** real published atoms and courses replace sample records, example faculty names and synthetic percentages. Student/teacher/admin actions retain their actual visibility and server authorization. Empty states explain the current result and offer recovery.

## Interaction and accessibility checks

1. Catalog and knowledge network — passed; matching desktop palette, actual versioned nodes, functional links.
2. Classification/search/progress — passed; empty result recovery and filtered counts checked, including a 26-record pagination fixture in a rolled-back transaction.
3. Card overview — passed; native dialog, accessible name, Escape dismissal, focus restoration, actual learning link.
4. Teacher and student contribution forms — passed; correct roles, source-atom selector, attachment control and existing draft/review flow retained.
5. Desktop layout — passed at 1280, 1440 and 1920 widths; no page overflow. Browser page exceptions: 0.

## Accepted differences and limits

- Actual catalog has fewer courses and a different relationship topology than the mock. These are content differences required by real platform data, not missing visual elements.
- Existing course library, personal learning, contributions, moderation and grading remain accessible as workflow tabs; they push the first card row lower than in the static reference.
- Interactive graph includes controls, a version-aware course selector and library attribution. It does not claim that every decorative relationship from the source exists in the platform.
- Mobile-specific design and a full accessibility certification are outside this desktop-focused verification. Existing responsive fallback remains.
- P3: the established navigation uses the project's existing Phosphor brand mark and functional global search rather than replacing the whole site's chrome during this learning-surface integration.

Implementation checklist: source assets local; real-data links; permissions preserved; no reset of learning records; front/back builds passed; 21 atomic tests, 145 platform tests, 254 API tests and rollback integration passed.

final result: passed

---

# Strict source fidelity revision — 2026-10-27

The preceding visual implementation was rejected by the user because the generated grid and simplified planning panel diverged from the target. This revision replaces that composition and is the current acceptance record.

Source: the same user-supplied `/atomic-courses-particles` page. Implementation: local `/learning?library=atoms`.

## Current evidence

`design-qa-assets/atomic-strict-20261027/comparison-network.jpg`, `comparison-1280.jpg`, `comparison-1920.jpg` and `comparison-card.jpg` were generated from source and local screenshots at matching CSS viewports and inspected together. Device scale is 1. The detailed measurements and browser checks are `geometry-1280.json` and `verification.json` in that folder.

At 1280 × 900, the following document-coordinate measurements match the source:

- Network panel: x 126.5, y 280, width 1012, height 400.
- Left planning panel: x 147.5, y 301, width 230, height 500.
- Original graph: x 397.5, y 401.484375, width 720, height 299.0033 (subpixel rounding only).
- Filter/search row: x 126.5, y 708, width 1012, height 102.
- First card: x 126.5, y 834, width 494, height 352.

## Fixes from the rejected pass

- **P1 resolved:** removed generated grid layout and rebuilt from the source's original 1204 × 500 composition, original anchor coordinates, curve artwork and portraits. The left paper composition is copied from source elements and assets.
- **P1 resolved:** removed the persistent additional tabs/toolbars from the catalog's first screen. Their existing functions are available through the search field's ellipsis menu; detail, submission and review views retain their workflow navigation.
- **P2 resolved:** preserved the source's scrollbar gutter, heading font metrics, 3:1 filter/search ratio, counter line heights and borderless 352 px card geometry.
- **P2 resolved:** CSS variables that serialize as empty longhands now use the actual source computed values; white paper backgrounds, white graph border and lavender canvas are restored.
- **P2 resolved:** local bookmark icons use the source foreground color and indicate browser-local, account-scoped storage. Long titles are capped at two lines with full text available in detail.

## Required fidelity surfaces

Typography, spacing/layout rhythm, colors/tokens, original asset quality and content were checked in the combined source/implementation comparisons. Actual source illustration files and contributor images are local, not approximate drawings. The visual course map is explicitly a curriculum-planning reference; real published materials are resolved separately when clicked. Catalog records and progress remain real platform data.

Browser verification passed: source-node public-resource dialog, management menu, teacher editor/attachments, instant search/clear, bookmark toggle, overview Escape, reflection source selector/attachments, and 1280/1440/1920 overflow checks. Browser page errors: 0. The atomic suite now passes 22 tests, platform suite 145 tests; final frontend build passed.

Accepted differences: local published-resource counts, titles, authors and personal progress differ from source examples. The shared site navigation retains the established brand icon, functional global search and real account label. No remaining P0/P1/P2 issue in the requested course-map composition. Mobile-specific design is not certified by this desktop pass.

final result: passed

## 2026-10-28 交接系列课程详情补全
原稿课程页已按原始元素树与素材集成：10次课、19处课程节点、34处下级知识内容。组件浏览器核对1440x1000，搜索、展开、教学安排/团队、Esc关闭与学习跳转通过，页面异常0、横向溢出0。原稿样式与5件SVG素材本地保存，未执行源站脚本。云端前端构建与资源核验通过，API与数据库未改动。完整说明见 docs/handoff-series-ui-20261028.md。
final result: passed
## 2026-10-29 — unified learning entrance

Visual target: the two user-provided 2026-10-29 screenshots, with the approved redesign brief: retain the second screen's MORPH assets/palette while consolidating the first screen's courses and navigation. This is an intentional layout redesign, not a claim of pixel-for-pixel identity with both conflicting source screens.

- Typography: preserved the existing Chinese system/Noto stack; 32 px page title, 20 px card headings, 14 px descriptions, readable secondary labels.
- Layout: one two-tab navigation; a collapsed network panel; common search/category/state rhythm and two-column resource cards. The first atom row is visible in the initial desktop viewport. Verified 1280, 1440 and 1920 widths.
- Color: source lavender, white cards, dark primary actions, purple secondary actions and lime completion/network accents retained.
- Artwork: all course SVGs, source node portraits, network lines and source illustration are reused; no replacement generated art or approximate drawings.
- Content: clear labels for trial courses, outlines and planned courses. Resource identity and progress remain separate; source examples are not learner evidence.
- Resolved P1: the legacy flex card's zero-width body conflicted with the unified grid, causing vertical text. Explicit body width, padding and grid rules fixed it; inspected the new screenshots and measured body widths.
- Resolved P2: the source network's fixed height cropped its side action. Expanded height now includes the full introduction; the route action is visible and correctly named.
- Resolved P2: atomic cards previously redirected 17 source atoms to the whole course. Cards now open their own versions; real course usage is available inside detail.

Accepted browser evidence: `design-qa-assets/unified-learning-20261029/atoms-1440.png`, `courses-all-1440.png`, `courses-1280.png`, `courses-1440.png`, `courses-1920.png`, `network-expanded-1440.png`, `verification.json`. Screenshots were opened and inspected; source comparisons use the screenshots provided in the active request. The source captures have different widths and states, so no exact-coordinate fidelity claim is made.

Primary component interactions: course/atom switch, category/open-state counts, query and progress filters, 67% legacy progress, course detail and related-atom search, direct atom detail and course relation, source network expand/collapse, contribution source/attachments, legacy-list alias. All passed, browser page errors 0. The separate ten-session course view also passed its existing browser checks.

Production authentication, real submission/approval writes, paid model calls, mobile-specific design and a full accessibility certification were not exercised. Existing permissions and data services were not changed. No remaining P0/P1/P2 in the requested desktop catalog consolidation; broader content/teacher-assignment gaps remain in the separate version audit.

final result: passed

## 2026-10-29 — progress-based professional portrait

Visual target: user-supplied F:/屏幕截图 2026-10-29 115608.png (2242×1135 source, 2048×1037 displayed), dark left radar and pale right panels on MORPH lavender. This is the approved data-driven adaptation, not a claim of pixel identity with sample scores. No new raster artwork is needed: the radar is a native canvas data visualization and icons use the existing Phosphor set.

- Typography: existing Chinese font stack, 20–24px headings, 14px controls/body, 12–13px evidence metadata. Inspected full-view and readable card/summary regions.
- Spacing/layout: dark radar and a 1.85:1 sidebar grid, 24px gaps, consistent 18–24px radii; evidence cards below. Checked 1280/1440/1920 desktop widths, no horizontal overflow and all radar labels within chart bounds. Screenshots use CSS pixels/deviceScaleFactor1; source and local viewport differ, so comparison is composition rather than coordinate matching.
- Color: lavender canvas, dark #14172d radar, purple line, lime coverage indicator, pale cards and dark actions retained. Empty/null labels are distinct from a measured0%.
- Image quality: chart renders at native device pixel ratio up to2, no raster chart enlargement; existing brand assets unchanged.
- Copy/content: sample ability scores, interests, modality counts and badges replaced by real record counts, denominator explanations and actionable next learning. Existing course67% remains course progress; teacher practice verification is separate.

Resolved P1: route coverage now uses pinned versions and suppresses ratios if a required version is unavailable. Time filtering cannot erase prerequisite evidence. Resolved P1: plan creation updates the parent personal-space task list immediately, verified by navigating from the real MyLearning component to PlanManager. Resolved P2: unknown directions, missing feedback/teacher evidence and optional service failures display explicit states instead of fabricated values. Account changes clear old learner data and stale requests.

Accepted evidence: professional-portrait-20261029/portrait-1440.png, route-1440.png, legacy-1440.png, desktop-1280.png, desktop-1440.png, desktop-1920.png, empty-1440.png, integrated-plan.png and verification.json. Opened and inspected rendered captures against the supplied composition, including dense evidence cards and empty state. 12 model tests,157 platform tests,19 Sites compatibility tests passed. Browser interactions cover scope/time controls, direction evidence, practice toggle, exact version navigation,25-course pagination, plan success/failure retry, actual parent task navigation, refresh, optional/required errors and account switching; console errors0.

Accepted differences: six existing professional direction labels plus actual legacy categories replace the reference's eight unsupported ability scores. Evidence details and transparent completion formulas are added. Production authenticated learning/teacher writes, paid model calls and mobile-specific design are not certified by this component pass. No remaining P0/P1/P2 in the requested desktop phase.

final result: passed

## 2026-10-29 — final desktop overlap and interaction audit

Visual grounding: user's supplied F:/屏幕截图 2026-10-29 125302.png and fresh actual-component captures under design-qa-assets/platform-final-20261029/. Existing MORPH design is retained; this is a repair pass, not a new visual direction. IAB connection timed out; used the previously authorized Playwright fallback.

24 page entrances and33 measured states captured. Accepted before/after evidence includes case-video-scroll, short-search, short-atom, document-preview and report-dialog. Captures were opened and inspected, including workflow/admin empty states, course cards, actual sample Word/PPT rendering, long feedback, student reflection form and media controls. Known fixture schema errors were corrected and rejected as product findings.

Typography: old7–10px search and workflow/admin auxiliary text replaced by12–14px supporting text and readable actions. Layout rhythm: bounded search/feedback panels, static reading navigation, flexible document frame, consistent18px surfaces and40px actions. Colors: lavender, purple, white surfaces and dark primary actions preserved. Image quality: original platform assets and an authorized local video reused, no fabricated artwork. Copy: source filenames remain available for download only; progress and the distinction between rule suggestions and model generation are unchanged.

Resolved: case navigation67px overlap ->0; search panel bottom853px ->704px in a720px window; feedback panel2387px ->680px with internal scrolling; document frame previously28px outside dialog ->within bounds; report background scroll301px ->0; download now triggers native download and preserves page; quota dialogs receive focus management/Escape and return focus. Localized overview review dates and additional legacy auxiliary typography cleaned up.

Full numbered findings, recommendations, accepted screenshot flow and limits are in docs/platform-final-audit-20261029.md. Browser verification and production build must complete before deployment. Production authenticated business writes and paid model calls are not part of this pass; no claim of mobile or full accessibility certification.

final result: passed

Final modal-stack verification: all remaining manual body locks now share pageScrollLock. Nested review/image Escape and simultaneous route unmount passed, with body overflow restored. Final production build and160 platform/52 chat tests rerun after these changes;19 Sites tests passed earlier in this same audit.

Deployment verified: final-ui-audit-20261029-r2, entry index-Bw3y5BS2.js matches local build, HTML no-store. API image unchanged;19 works/9 featured/43 media/30 atoms/13 legacy published courses retained.
