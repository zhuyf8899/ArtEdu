# Design QA

## Comparison target

- Source visual truth: `qa/home-source-figma.jpg` and `qa/library-source-figma.jpg`, captured from the user-provided Figma Make page.
- Rendered implementation: `qa/home-implementation-desktop.jpg` and `qa/library-implementation-desktop.jpg`.
- Combined comparison evidence: `qa/home-comparison.jpg` and `qa/library-comparison.jpg`.
- Viewport: 1440 × 900 CSS px.
- Source pixels: 1440 × 900 at device pixel ratio 1.
- Implementation pixels: 1440 × 900 at device pixel ratio 1.
- Density normalization: none required; source and implementation were captured at equal CSS and pixel dimensions.
- State: desktop, authenticated demo teacher, home with UI 创作 + GPT-4o selected; resource library with all filters selected.
- Responsive evidence: `qa/home-implementation-mobile.jpg`, captured at 390 × 844 CSS px; document width was 375 px inside the browser scrollbar and no horizontal overflow was present.

## Full-view comparison evidence

The final home comparison shows the black, full-width creation stage immediately below the navigation, a centered lime-accent headline, a bordered dark composer, creation-method controls at the upper-left of the composer, and model controls at its lower-left. The implementation retains the source's paper, ink, lime, square-border and compact typographic system.

The implementation intentionally expands the source's single-line prompt into a conversation-aware composer because the requested product behavior is an AI dialog rather than a prompt-only field. This increases the composer height without changing its visual hierarchy or interaction placement.

## Focused region comparison evidence

The resource-library comparison verifies the taxonomy and card region at the same viewport. The implementation keeps the source's compact filter band and bordered card grid, while replacing discipline-only filters with the requested method, author, and tool dimensions. Each visible card repeats those attributes as readable tags and metadata.

## Findings

- No actionable P0, P1, or P2 findings remain.
- P3: The AI composer is vertically taller than the Figma prompt bar. This is an intentional product change that exposes assistant context and a multi-line prompt while preserving the source hierarchy.
- P3: Resource cards use a two-column desktop grid instead of the source's denser three-column grid. This is intentional so author and tool metadata remain readable without truncating core course information.

## Required fidelity surfaces

- Fonts and typography: Space Grotesk and Noto Sans SC preserve the source's dense grotesk display hierarchy, compact UI labels, strong weights, and Chinese readability.
- Spacing and layout rhythm: The hero is full-width below the navigation; the centered composer, filter bands, progress strip, and card grid align to a consistent 1210 px content rhythm.
- Colors and visual tokens: Paper `#f5f0e8`, ink `#0a0a0a`, lime `#aaff00`, hard borders, and minimal shadow treatment match the source direction.
- Image quality and asset fidelity: This screen relies on interface icons rather than custom raster imagery. All icons use the existing Phosphor icon library; no placeholder image assets or handcrafted SVGs were introduced.
- Copy and content: UI 创作、图案生成、Vibe Coding、model names, course authors, and tool labels are present and aligned with the requested domain language.

## Interaction and runtime checks

- Switched among the three creation methods.
- Switched the selected model from GPT-4o to Claude 4.
- Submitted a Vibe Coding prompt; the API created a real generation job and returned its task ID.
- Filtered the resource library to Vibe Coding; one seeded course remained with author and tool metadata.
- Checked the home composer at the 390 px responsive breakpoint with no horizontal overflow.
- Production build completed successfully.
- API TypeScript check passed.
- Sites worker tests passed: 4/4.
- Browser console warnings/errors checked after home and library interactions: none.

## Comparison history

1. Earlier P2: an extra “学习与创作总览” heading and constrained content width pushed the creation stage below the first viewport and materially changed the source's above-the-fold proportions.
2. Fix: removed the redundant home heading, moved the management shortcut into the navigation, and made the black creation stage full-width directly below the header.
3. Post-fix evidence: `qa/home-comparison.jpg` shows the revised hero position and proportion at 1440 × 900; no P0/P1/P2 mismatch remains.

## Implementation checklist

- [x] Central AI conversation composer
- [x] Method selection: UI 创作 / 图案生成 / Vibe Coding
- [x] Model interface selection at lower-left
- [x] Real generation-job submission
- [x] Resource filters by method, author, and tool
- [x] Course metadata tags and Vibe Coding seed resource
- [x] Responsive desktop/mobile layout
- [x] Build, interaction, console, and visual comparison checks

final result: passed
