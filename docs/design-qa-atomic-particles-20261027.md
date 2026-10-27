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
