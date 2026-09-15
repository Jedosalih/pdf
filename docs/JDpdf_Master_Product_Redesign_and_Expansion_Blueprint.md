# JDpdf --- Master Product, UX/UI & Platform Expansion Blueprint

**Document type:** Master implementation brief for Claude Code\
**Project:** JDpdf\
**Purpose:** Full product redesign + document-workspace evolution +
feature roadmap\
**Execution style:** Autonomous, end-to-end, production-minded\
**Status:** Existing foundation with 16 verified PDF tools; redesign and
expansion are the next major phase

------------------------------------------------------------------------

## 0. Executive Direction

JDpdf must evolve from a collection of PDF utility pages into a
**professional, multilingual document platform**.

The target product is not a prototype and should not look like one.

The long-term product model is:

> **Upload → Edit → Organize → Convert → Sign → Automate → Manage →
> Export**

JDpdf should support PDFs first, then Office documents and images, while
presenting the user with one coherent **Document Workspace** rather than
dozens of disconnected tool pages.

The redesign must be substantial. Do not merely change colors, button
radius, or spacing. Rework the product's information architecture,
visual hierarchy, navigation, upload experience, tool discovery,
workspace, dashboard, responsive behavior, and reusable design system.

At the same time, preserve the existing processing architecture and the
verified 16 tools unless a change is genuinely required.

The guiding product principle is:

> **One powerful workspace for all documents.**

------------------------------------------------------------------------

# 1. Existing Project --- Do Not Break This Foundation

## Current architecture

``` text
Browser
   ↓
Next.js App / API
   ↓
PostgreSQL Job Row
   ↓
BullMQ / Redis
   ↓
Worker Process
   ↓
qpdf / Ghostscript / Poppler / pdf-lib / other engines
   ↓
Object Storage
   ↓
Polling / Job Status
   ↓
Signed Download URL
```

### Strict layering

-   UI never shells out to processing engines.
-   Workers never import Next.js application code.
-   API routes only validate, create/query jobs, enqueue, and return
    status.
-   API routes must not perform expensive PDF processing inline.
-   Worker handlers own processing.
-   Shared UI workflows should remain shared rather than duplicated.

## Stack

-   Next.js 16 App Router
-   TypeScript strict
-   React
-   Tailwind CSS v4
-   next-intl
-   Prisma 7 with driver adapters
-   PostgreSQL
-   BullMQ
-   Redis
-   Docker
-   MinIO/S3-compatible object storage
-   Existing PDF engines as appropriate

## Existing multilingual support

-   English: `en`
-   Arabic: `ar`
-   Turkish: `tr`
-   Arabic is RTL.

Do not treat Arabic as an afterthought. Every new component and layout
must be RTL-safe.

------------------------------------------------------------------------

# 2. Existing Definition of Done

Every implementation must continue following the project's existing
workflow.

For a new tool or major feature:

1.  Registry entry where applicable.
2.  Worker handler where applicable.
3.  Shared workflow/component reuse.
4.  Translations in all supported locales.
5.  UI/page implementation.
6.  Database changes/migrations if required.
7.  Reseed where required.
8.  Worker Docker rebuild where required.
9.  Real Playwright E2E test.
10. Test actual output/content, not only HTTP status.
11. PostgreSQL spot-check where relevant.
12. `tsc` clean.
13. ESLint clean, excluding only documented pre-existing issues.
14. Production build clean.
15. Run application and inspect real pages.
16. Take screenshots for English and Arabic.
17. Actually inspect the screenshots.
18. Verify RTL visually.
19. Document important architectural/product decisions in
    `docs/DECISIONS.md`.
20. Commit/push only after verification.

"Build passes" is not equivalent to "done."

------------------------------------------------------------------------

# 3. Existing 16 Tools --- Preserve and Improve Presentation

The existing tools are already shipped and verified. Do not casually
rewrite their processing logic.

### Organize

-   Merge PDF
-   Split PDF
-   Rotate PDF
-   Delete Pages
-   Extract Pages
-   Reorder Pages

### Convert

-   JPG to PDF
-   PNG to PDF
-   PDF to JPG
-   PDF to PNG

### Optimize

-   Compress PDF

### Edit

-   Watermark PDF
-   Add Page Numbers
-   Edit PDF Metadata

### Security

-   Protect PDF
-   Unlock PDF

All existing tools must continue working after the redesign.

The redesign should improve:

-   discovery
-   upload UI
-   empty states
-   processing states
-   error states
-   result states
-   mobile usability
-   accessibility
-   visual consistency

Do not introduce separate bespoke UI patterns for every tool.

------------------------------------------------------------------------

# 4. Product Positioning

JDpdf should be positioned as:

> **A modern document workspace for editing, converting, organizing,
> signing, and managing documents.**

Avoid positioning it only as:

> "Free PDF tools"

That can remain part of SEO copy, but it should not define the product
experience.

## Core product pillars

1.  **Edit**
2.  **Convert**
3.  **Organize**
4.  **Optimize**
5.  **Sign**
6.  **Protect**
7.  **OCR**
8.  **Manage**
9.  **AI**
10. **API / Automation**

------------------------------------------------------------------------

# 5. Visual Direction

The current visual design needs a serious redesign.

The target aesthetic:

-   Premium
-   Minimal
-   Professional
-   Calm
-   Fast
-   Product-focused
-   High information clarity
-   Strong typography
-   Generous whitespace
-   Clean borders
-   Restrained shadows
-   Consistent spacing
-   Subtle micro-interactions

Reference the product quality level of modern productivity software, but
do not copy another company's UI.

Useful conceptual references:

-   Linear
-   Notion
-   Dropbox
-   Adobe Acrobat
-   Google Drive

JDpdf must have its own identity.

## Explicitly avoid

-   Glassmorphism
-   Excessive gradients
-   Decorative blobs everywhere
-   Excessive floating cards
-   Random animations
-   Giant meaningless illustrations
-   Excessive rounded containers
-   Rainbow UI
-   Excessive shadows
-   "AI startup" visual clichés
-   Huge hero artwork that pushes the actual product interaction below
    the fold

The interface should feel like a serious document application.

------------------------------------------------------------------------

# 6. Brand System

## Logo

Create/refine a simple JDpdf mark based around:

-   J
-   document/page
-   subtle document transformation concept

Do not use a generic oversized PDF icon.

The logo should work at:

-   desktop header
-   mobile header
-   favicon
-   dashboard sidebar
-   editor top bar

## Typography

Use a strong modern sans-serif system.

Recommended:

-   Inter for Latin/UI
-   Tajawal for Arabic

If the repository already has an approved typography setup, consolidate
rather than unnecessarily replace it.

Typography hierarchy must be intentional:

-   Display
-   H1
-   H2
-   H3
-   Body
-   Small
-   Caption
-   Metadata
-   Button labels
-   Tool labels

Arabic typography must have proper line height and RTL spacing.

------------------------------------------------------------------------

# 7. Color System

Keep the palette restrained.

Suggested conceptual tokens:

``` text
Primary
Primary foreground
Background
Surface
Surface elevated
Border
Text
Text muted
Text subtle
Success
Warning
Error
Info
```

Use one strong brand primary for:

-   primary CTA
-   active navigation
-   selected controls
-   progress
-   important links

Do not use the brand color on every element.

Semantic colors are reserved for semantic states.

Dark mode should be supported after the light system is stable.

------------------------------------------------------------------------

# 8. Design System

Create reusable primitives rather than page-specific styling.

Core components:

-   Button
-   IconButton
-   Input
-   Select
-   SearchInput
-   Tabs
-   Dropdown
-   Tooltip
-   Dialog
-   Drawer
-   Toast
-   Alert
-   Badge
-   Card
-   EmptyState
-   Skeleton
-   Progress
-   FileCard
-   FileRow
-   FileDropzone
-   ToolCard
-   ToolCategory
-   Breadcrumb
-   Pagination
-   ContextMenu
-   CommandPalette
-   PageThumbnail
-   DocumentCanvas
-   Toolbar
-   PropertiesPanel
-   Sidebar
-   Topbar
-   MobileBottomNav

Document-specific components should be reusable across tools.

------------------------------------------------------------------------

# 9. Homepage Redesign

The homepage should immediately communicate the product.

## Hero concept

Primary headline direction:

> **Your documents. One powerful workspace.**

Supporting copy:

> Edit, convert, organize, sign and manage your documents --- all in one
> place.

The actual upload interaction should be prominent.

Concept:

``` text
┌──────────────────────────────────────────────┐
│                                              │
│             Drop your file here              │
│                                              │
│       or click to browse your files          │
│                                              │
│             [ Choose a file ]                │
│                                              │
│       PDF · DOCX · XLSX · PPTX · Images      │
│                                              │
└──────────────────────────────────────────────┘
```

The user should be able to begin working without reading a marketing
essay.

## Homepage sections

Recommended order:

1.  Header
2.  Hero
3.  Main upload/dropzone
4.  Popular tools
5.  Why JDpdf
6.  Document workflow
7.  Tool categories
8.  Security/privacy
9.  Optional Pro introduction
10. FAQ
11. Footer

Do not make the homepage excessively long.

------------------------------------------------------------------------

# 10. Header / Navigation

Desktop:

``` text
JDpdf

Tools
Workspace
Pricing
Resources

                 Search
                 Language
                 Log in
                 Sign up
```

The exact labels can be adjusted based on implementation.

Header requirements:

-   clean
-   compact
-   sticky only if it improves UX
-   accessible
-   responsive
-   proper RTL mirroring

------------------------------------------------------------------------

# 11. Global Search

Implement product-wide search.

Users should be able to search:

-   tools
-   documents
-   recent files
-   categories

Example:

``` text
Search tools, documents...        ⌘ K
```

Search examples:

``` text
compress
```

→ Compress PDF

``` text
convert pdf to word
```

→ PDF to Word

``` text
invoice
```

→ matching document in user files

Search must understand aliases where practical.

------------------------------------------------------------------------

# 12. Command Palette

Implement:

-   Ctrl+K
-   Cmd+K

Example:

``` text
Search JDpdf

Edit PDF
Merge PDFs
Compress PDF
Convert to Word
Sign document

Recent documents

Contract.pdf
Invoice.pdf
Resume.docx
```

Keyboard navigation must work.

------------------------------------------------------------------------

# 13. Tools Directory

Create a professional tools directory.

## Categories

### Organize

-   Merge PDF
-   Split PDF
-   Rotate PDF
-   Delete Pages
-   Extract Pages
-   Reorder Pages

### Convert

-   PDF to Word
-   Word to PDF
-   PDF to Excel
-   Excel to PDF
-   PDF to PowerPoint
-   PowerPoint to PDF
-   PDF to JPG
-   PDF to PNG
-   JPG to PDF
-   PNG to PDF
-   PDF to Text
-   HTML to PDF
-   PDF/A conversion

### Edit

-   Edit PDF
-   Watermark
-   Page Numbers
-   Metadata
-   Redact PDF
-   Fill PDF
-   Annotate PDF

### Optimize

-   Compress PDF
-   Flatten PDF
-   Repair PDF

### Security

-   Protect PDF
-   Unlock PDF
-   Sign PDF
-   Fill & Sign

### OCR

-   OCR PDF
-   Scan to searchable PDF

### Document AI

-   Summarize PDF
-   Ask PDF
-   Extract information
-   Extract tables
-   Translate document
-   Compare documents

The directory should support featured tools and search.

------------------------------------------------------------------------

# 14. Tool Page Standard

Every tool page must share a common structure.

``` text
Breadcrumb

Tool title
Short description

┌──────────────────────────────┐
│                              │
│      Upload / Drop files     │
│                              │
└──────────────────────────────┘

Options

Processing

Result

Related tools
```

Do not create 16 completely different tool pages.

Use shared components and the existing `useToolWorkflow`, `PageGrid`,
`MultiFileTool`, or their equivalents.

------------------------------------------------------------------------

# 15. Upload Experience

Upload is one of the most important interactions.

Support:

-   click to browse
-   drag and drop
-   multiple files where applicable
-   keyboard access
-   mobile file picker
-   clear supported-format information
-   file validation
-   file size validation
-   progress
-   cancellation where feasible
-   retry

States:

1.  Empty
2.  Hover/drag-over
3.  Uploading
4.  Uploaded
5.  Processing
6.  Completed
7.  Failed
8.  Cancelled

Never leave users wondering whether processing is happening.

------------------------------------------------------------------------

# 16. Processing Experience

Processing UI should show:

-   current stage
-   progress where measurable
-   file name
-   file size
-   estimated status only when reliable
-   cancel option if safe
-   retry on recoverable failure

Avoid fake progress.

If exact progress is unavailable, use an honest indeterminate state.

Example:

``` text
Uploading
✓ Uploaded

Processing document...
Preparing pages
Optimizing file

Please keep this tab open.
```

------------------------------------------------------------------------

# 17. Result Experience

After processing:

``` text
Done

Your document is ready.

[ Download ]
[ Edit ]
[ Convert ]
[ Share ]
```

For multi-file workflows:

``` text
Download all
Download ZIP
```

Also provide:

-   process another
-   related tools
-   safe retention explanation

------------------------------------------------------------------------

# 18. Document Workspace --- Core Product Evolution

This is the most important new concept.

Instead of making every operation feel like a standalone tool, JDpdf
should support a central workspace.

Concept:

``` text
Document
   ↓
Workspace
   ├── Edit
   ├── Convert
   ├── Organize
   ├── Sign
   ├── Protect
   ├── OCR
   └── Export
```

Example:

``` text
contract.pdf

[ Edit ] [ Convert ] [ Sign ] [ Export ]
```

The user should not have to repeatedly upload the same document for
every action when a workspace can retain it.

------------------------------------------------------------------------

# 19. PDF Editor

Build a reusable PDF editing foundation.

Conceptual layout:

``` text
┌──────────────────────────────────────────────────────┐
│ JDpdf   contract.pdf       Saved    Undo Redo Export │
├──────────┬───────────────────────────────┬───────────┤
│ Pages    │                               │ Properties│
│          │                               │           │
│  ┌───┐   │                               │ Text      │
│  │ 1 │   │       DOCUMENT CANVAS        │ Font      │
│  └───┘   │                               │ Size      │
│          │                               │ Align     │
│  ┌───┐   │                               │ Spacing   │
│  │ 2 │   │                               │           │
│  └───┘   │                               │ Arrange   │
│          │                               │           │
├──────────┴───────────────────────────────┴───────────┤
│ Select | Text | Image | Draw | Highlight | Shape ... │
└──────────────────────────────────────────────────────┘
```

## Core editing capabilities

-   select
-   text insertion
-   text editing where technically possible
-   text formatting
-   images
-   shapes
-   drawing
-   highlight
-   underline
-   strikethrough
-   links
-   signatures
-   stamps
-   redaction
-   page manipulation
-   undo
-   redo
-   copy
-   paste
-   delete
-   zoom
-   fit width
-   fit page
-   page thumbnails

Do not claim true editing of arbitrary PDF text unless the underlying
PDF model actually supports it correctly.

If a PDF contains scanned/image text:

> OCR first → editable/searchable representation.

------------------------------------------------------------------------

# 20. PDF Editing Technical Reality

PDF is not a native word-processing format.

Do not implement fake editing by simply painting white rectangles over
existing text and calling it text editing.

The implementation must distinguish:

-   native PDF text
-   vector elements
-   raster images
-   annotations
-   OCR-generated text
-   overlay elements

For unsupported direct editing cases, provide an honest workflow.

Potential architecture:

``` text
PDF
 ↓
Parse / Render
 ↓
Document Model
 ├── text
 ├── images
 ├── vectors
 ├── annotations
 └── pages
 ↓
Editor State
 ↓
Export
 ↓
PDF
```

Use the most appropriate existing/open-source libraries for each layer.

Keep processing out of the Next.js request lifecycle.

------------------------------------------------------------------------

# 21. Office Document Editing

Long-term support:

## DOCX

-   text
-   formatting
-   headings
-   lists
-   tables
-   images
-   links
-   headers/footers
-   page breaks
-   find/replace
-   export PDF

## XLSX

-   cells
-   formulas
-   rows
-   columns
-   formatting
-   tables
-   export PDF

## PPTX

-   slides
-   text
-   images
-   shapes
-   ordering
-   export PDF

Important:

Do not promise browser-native WYSIWYG fidelity until it is verified.

Office rendering is complex. Use an appropriate document
engine/rendering strategy.

------------------------------------------------------------------------

# 22. PDF ↔ Office Conversion

High-priority features:

-   PDF → DOCX
-   DOCX → PDF
-   PDF → XLSX
-   XLSX → PDF
-   PDF → PPTX
-   PPTX → PDF

Conversion quality must be tested with real documents.

Tests should cover:

-   text
-   images
-   tables
-   multiple pages
-   Arabic
-   Turkish
-   English
-   RTL
-   fonts
-   page dimensions

------------------------------------------------------------------------

# 23. OCR

High-priority feature.

Capabilities:

-   image/PDF OCR
-   searchable PDF
-   selectable text
-   language selection
-   English
-   Arabic
-   Turkish
-   mixed-language documents where supported

Workflow:

``` text
Upload
 ↓
Detect / select language
 ↓
OCR
 ↓
Searchable PDF
 ↓
Optional edit
 ↓
Export
```

OCR should be asynchronous through workers.

Never run expensive OCR inline in an API request.

------------------------------------------------------------------------

# 24. Redaction

Build real redaction.

Support:

-   manual redaction
-   text selection where possible
-   permanent content removal
-   metadata cleanup where relevant
-   optional search for sensitive patterns

Examples:

-   passport numbers
-   phone numbers
-   emails
-   addresses
-   IDs

A black rectangle over text is not sufficient.

The exported file must not retain the underlying redacted information.

Create tests that verify the hidden content cannot be extracted from the
resulting PDF.

------------------------------------------------------------------------

# 25. Fill & Sign

Features:

-   typed text
-   checkbox
-   date
-   signature
-   initials
-   image signature
-   drawing signature
-   multiple fields
-   save final PDF

Later:

-   request signature from another person
-   signing workflow
-   audit trail
-   stronger signature mechanisms

Do not imply legally binding digital-signature certification unless
actually implemented.

------------------------------------------------------------------------

# 26. Compare PDF / Documents

Feature:

Upload:

``` text
Version 1
Version 2
```

Show:

-   added text
-   removed text
-   changed text
-   page changes
-   added/removed pages
-   side-by-side view
-   synchronized scrolling where practical

This is especially valuable for:

-   legal
-   contracts
-   business
-   academic documents

------------------------------------------------------------------------

# 27. Repair PDF

Create a repair workflow for malformed PDFs.

Potential actions:

-   rebuild xref
-   repair object references
-   rewrite PDF structure
-   recover readable pages where possible
-   normalize malformed files

Do not guarantee recovery when corruption is unrecoverable.

------------------------------------------------------------------------

# 28. Flatten PDF

Support flattening:

-   annotations
-   form fields
-   markup
-   overlays where appropriate

Make the result behavior explicit.

------------------------------------------------------------------------

# 29. PDF/A

Add conversion to archival formats where practical.

Support common PDF/A targets only after verifying the selected engine's
compliance.

Do not market a file as PDF/A-compliant unless validation confirms it.

------------------------------------------------------------------------

# 30. Batch Processing

This is a major UX feature.

Examples:

``` text
20 PDFs
 ↓
Compress All
 ↓
Download ZIP
```

Also:

-   convert all
-   rotate all
-   watermark all
-   image → PDF batch
-   PDF → image batch

The UI should make batch state obvious.

Worker architecture should use jobs cleanly rather than creating one
giant blocking operation.

------------------------------------------------------------------------

# 31. User Accounts

Phase after the product foundation is stable.

Dashboard should include:

-   Home
-   My Documents
-   Recent
-   Starred
-   Trash
-   All Tools
-   Categories
-   Settings

Example:

``` text
Good morning

What would you like to do?

[ Upload file ]

Quick actions

Edit PDF
Convert
Merge
Compress
Sign
OCR

Recent documents
```

------------------------------------------------------------------------

# 32. My Documents

Document management:

-   upload
-   open
-   rename
-   download
-   delete
-   restore
-   star
-   sort
-   search
-   filter
-   file type
-   modified date

Later:

-   folders
-   sharing
-   team access

------------------------------------------------------------------------

# 33. History

Show recent operations:

``` text
Compress PDF
Contract.pdf
Completed
2 minutes ago
```

Actions:

-   open result
-   download
-   repeat operation
-   delete history item

Respect retention and privacy policies.

------------------------------------------------------------------------

# 34. Storage / Retention

Privacy must be clear.

Design for automatic deletion of temporary processing files.

Document:

-   upload lifecycle
-   processing lifecycle
-   output retention
-   user deletion
-   failed-job cleanup

Never retain files indefinitely by accident.

------------------------------------------------------------------------

# 35. SaaS Plans

Long-term structure:

## Free

-   limited daily/monthly usage
-   lower file-size limits
-   standard queue
-   basic tools

## Pro

-   larger files
-   more processing
-   batch processing
-   OCR
-   advanced tools
-   document history
-   faster queue
-   advanced workspace

## Business

Later:

-   teams
-   shared documents
-   admin controls
-   higher limits
-   API
-   audit features

Do not implement billing until usage accounting is reliable.

------------------------------------------------------------------------

# 36. Usage Metering

Introduce a robust internal usage model before subscriptions.

Track:

-   user
-   operation
-   tool
-   input bytes
-   output bytes
-   page count
-   processing duration
-   status
-   timestamp

Do not depend only on client-side counters.

------------------------------------------------------------------------

# 37. PDF API

The architecture is suitable for an API product.

Potential:

``` text
POST /v1/jobs
GET  /v1/jobs/:id
GET  /v1/jobs/:id/result
```

Later:

-   API keys
-   rate limits
-   usage dashboard
-   webhooks
-   idempotency keys
-   per-tool permissions
-   usage billing

API processing must use the same worker infrastructure.

Do not create a second processing architecture.

------------------------------------------------------------------------

# 38. AI Document Features --- Later

Do not add AI merely as a marketing checkbox.

Potential high-value features:

-   summarize PDF
-   ask questions about document
-   extract key information
-   extract tables
-   translate documents
-   compare documents
-   classify document
-   structured data extraction
-   generate document summary

Example:

``` text
Upload contract.pdf

Ask:
"What is the termination period?"
"What are the payment terms?"
"Summarize the risks."
```

AI should be isolated from core deterministic PDF processing.

------------------------------------------------------------------------

# 39. AI Architecture

Concept:

``` text
Document
 ↓
Text extraction / OCR
 ↓
Chunking
 ↓
AI processing
 ↓
Structured result
 ↓
Workspace UI
```

Never send the entire document blindly to an AI model.

Consider:

-   page references
-   citations to source pages
-   privacy
-   token limits
-   cost
-   caching
-   deletion
-   user consent where appropriate

------------------------------------------------------------------------

# 40. Mobile Design

Do not simply shrink desktop.

## Mobile principles

-   simple navigation
-   large touch targets
-   bottom navigation where appropriate
-   compact tool discovery
-   simplified editor controls
-   bottom sheets for properties
-   horizontal toolbar scrolling
-   page thumbnails accessible without overwhelming the screen

Example:

``` text
JDpdf

Good morning

[ Upload file ]

Edit PDF
Convert
Merge
More

Recent documents
```

Editor on mobile:

-   canvas first
-   tools in bottom toolbar
-   properties in bottom sheet
-   page navigator accessible via drawer/sheet

------------------------------------------------------------------------

# 41. Responsive Breakpoints

Design intentionally for:

-   mobile
-   tablet
-   laptop
-   large desktop

Test at least:

-   360px
-   390px
-   768px
-   1024px
-   1280px
-   1440px+

Avoid layouts that merely technically fit.

------------------------------------------------------------------------

# 42. Accessibility

Minimum:

-   keyboard navigation
-   visible focus
-   semantic HTML
-   proper labels
-   screen-reader labels
-   sufficient contrast
-   reduced-motion support
-   accessible dialogs
-   accessible drag/drop alternatives
-   keyboard-accessible editor controls

Command palette must work without a mouse.

------------------------------------------------------------------------

# 43. Localization

All user-facing text must use the localization system.

Never hardcode visible English strings in components.

Check:

-   English
-   Turkish
-   Arabic RTL

For Arabic:

-   layout mirroring
-   icons where direction matters
-   arrows
-   pagination
-   sidebars
-   editor controls
-   alignment
-   text direction
-   modal placement
-   keyboard behavior

Avoid simply translating English strings mechanically without
considering UI length.

------------------------------------------------------------------------

# 44. SEO

Keep SEO strong for tool pages.

Each tool should have:

-   localized title
-   localized description
-   canonical URL
-   metadata
-   structured content
-   related tools
-   FAQ where useful
-   internal links

Do not create thin pages solely to capture keywords.

The site should progressively add useful supporting content around
important tools.

------------------------------------------------------------------------

# 45. Content Strategy

Build a content architecture for long-term SEO.

Potential sections:

-   PDF guides
-   How-to articles
-   Format explanations
-   Document tips
-   Conversion guides
-   OCR guides
-   Business/legal document workflows

Examples:

-   How to merge PDF files
-   How to convert PDF to Word
-   How to make a PDF searchable
-   How to reduce PDF size
-   How to sign a PDF
-   How to redact a PDF properly

Content must be genuinely useful.

------------------------------------------------------------------------

# 46. Security

Treat document security as a core product requirement.

Consider:

-   upload validation
-   MIME validation
-   extension validation
-   malicious file handling
-   worker sandboxing
-   process timeouts
-   memory limits
-   file-size limits
-   rate limiting
-   job ownership validation
-   signed URLs
-   short-lived download URLs
-   automatic cleanup
-   path traversal prevention
-   command injection prevention
-   safe engine invocation
-   isolated temporary directories

Never trust client-provided filenames.

Never interpolate user input directly into shell commands.

------------------------------------------------------------------------

# 47. Reliability

Workers should handle:

-   retries
-   backoff
-   timeouts
-   dead-letter behavior where appropriate
-   failed job persistence
-   cleanup after failure
-   orphaned object cleanup

A failed job should remain diagnosable without exposing sensitive
document content.

------------------------------------------------------------------------

# 48. Observability

Build internal operational visibility.

Track:

-   job status
-   duration
-   failure reason
-   tool
-   worker
-   queue
-   retries
-   resource consumption

Do not expose sensitive file contents in logs.

Avoid logging:

-   document content
-   passwords
-   secrets
-   signed URLs
-   full sensitive metadata

------------------------------------------------------------------------

# 49. Error UX

Errors should be human-readable.

Bad:

``` text
HTTP 500
```

Better:

``` text
We couldn't process this PDF.

The file may be damaged or protected by a password.

[ Try another file ]
[ Repair PDF ]
```

For technical details, provide an optional support/debug identifier.

------------------------------------------------------------------------

# 50. Empty States

Every empty state needs:

-   clear explanation
-   useful next action
-   relevant CTA

Example:

``` text
No documents yet

Upload a document to start working.

[ Upload file ]
```

Avoid empty pages with only a blank white box.

------------------------------------------------------------------------

# 51. Editor Interaction Principles

The editor should feel predictable.

Essential:

-   Ctrl/Cmd + Z
-   Ctrl/Cmd + Shift + Z
-   Ctrl/Cmd + C
-   Ctrl/Cmd + V
-   Delete / Backspace
-   Escape
-   arrow-key movement where applicable
-   zoom shortcuts where practical

Selection must be visually obvious.

Do not make controls appear/disappear unpredictably.

------------------------------------------------------------------------

# 52. Autosave

For authenticated workspaces:

-   autosave changes
-   show `Saving...`
-   show `Saved`
-   recover from temporary interruptions
-   avoid losing work

Do not claim saved state before persistence succeeds.

------------------------------------------------------------------------

# 53. Export

The user should be able to export from workspace.

Examples:

``` text
Export

PDF
PDF/A
DOCX
JPG
PNG
TXT
```

Only display formats that the current document can actually produce.

------------------------------------------------------------------------

# 54. Navigation Philosophy

The user should always understand:

1.  Where am I?
2.  What document am I working on?
3.  What can I do next?
4.  Is my work saved?
5.  How do I get the final file?

Avoid dead-end pages.

------------------------------------------------------------------------

# 55. Recommended Product Information Architecture

``` text
/
├── /tools
│   ├── /organize
│   ├── /convert
│   ├── /edit
│   ├── /optimize
│   ├── /security
│   ├── /ocr
│   └── /ai
│
├── /workspace
│   ├── /documents
│   ├── /recent
│   ├── /starred
│   └── /trash
│
├── /editor
│
├── /pricing
├── /resources
└── /account
```

Adapt this to the existing Next.js routing conventions rather than
forcing an unnecessary rewrite.

------------------------------------------------------------------------

# 56. Implementation Priority

Do not implement everything in random order.

## Priority 1 --- Product/UI Foundation

-   complete visual redesign
-   design system
-   homepage
-   header
-   tools directory
-   global search
-   command palette
-   shared upload component
-   shared processing/result states
-   responsive system
-   Arabic RTL validation

## Priority 2 --- Document Workspace

-   auth foundation
-   dashboard
-   documents
-   history
-   workspace shell
-   autosave model
-   document lifecycle

## Priority 3 --- Highest-value document features

-   PDF → DOCX
-   DOCX → PDF
-   OCR
-   Edit PDF
-   Batch processing
-   Redact PDF
-   Fill & Sign

## Priority 4 --- Additional conversions

-   PDF → XLSX
-   XLSX → PDF
-   PDF → PPTX
-   PPTX → PDF
-   PDF → TXT
-   HTML → PDF
-   PDF/A

## Priority 5 --- Advanced document operations

-   Compare
-   Repair
-   Flatten
-   annotations
-   advanced forms

## Priority 6 --- Commercial platform

-   usage metering
-   plans
-   billing
-   Pro
-   Business
-   API

## Priority 7 --- AI

-   Ask PDF
-   Summarize
-   Extract
-   Translate
-   AI comparison

------------------------------------------------------------------------

# 57. Important Execution Rule

The project should be implemented **autonomously**.

Do not repeatedly stop and ask for approval for every small step.

Analyze the existing repository first.

Then:

1.  inspect architecture
2.  inspect existing components
3.  inspect current routes
4.  inspect registry
5.  inspect worker architecture
6.  inspect tests
7.  inspect translations
8.  inspect current screenshots/pages
9.  identify conflicts
10. create an implementation plan
11. implement in logical dependency order
12. test continuously
13. document decisions
14. verify visually
15. fix issues
16. finish with a concise implementation report

If a requirement conflicts with an existing architectural rule, preserve
the architectural rule unless there is a strong documented reason to
change it.

------------------------------------------------------------------------

# 58. Do Not Rewrite Working Systems Unnecessarily

Before changing any subsystem, determine whether it is:

-   presentation
-   domain logic
-   infrastructure
-   processing
-   persistence
-   security
-   testing

Prefer adapting the presentation layer around proven processing logic.

Do not rewrite working worker handlers merely to make code look cleaner.

Do not replace libraries without a demonstrated reason.

Do not remove existing tests.

Do not weaken the current definition of done.

------------------------------------------------------------------------

# 59. Shared Architecture Principle

Prefer:

``` text
Shared Core
    ↓
Shared UI primitives
    ↓
Shared workflow
    ↓
Tool-specific configuration
```

over:

``` text
Tool A custom implementation
Tool B custom implementation
Tool C custom implementation
...
```

If a pattern appears twice, evaluate whether it belongs in shared
infrastructure.

------------------------------------------------------------------------

# 60. Testing Expansion

Every new major feature requires real tests.

Examples:

## OCR

-   scanned PDF
-   Arabic
-   Turkish
-   English
-   searchable output
-   actual text extraction verification

## PDF → DOCX

-   multiple pages
-   text
-   image
-   tables
-   RTL

## Redaction

-   verify original sensitive text is absent from output

## Editor

-   add text
-   move element
-   delete element
-   undo
-   redo
-   export
-   reopen exported PDF

## Batch

-   10+ files
-   partial failure
-   retry
-   ZIP output
-   database state

------------------------------------------------------------------------

# 61. Visual Verification

This is mandatory.

For each major UI milestone:

1.  run the app
2.  inspect English
3.  inspect Arabic
4.  inspect Turkish
5.  inspect desktop
6.  inspect mobile
7.  capture screenshots
8.  actually inspect screenshots
9.  fix visible issues
10. repeat

A page that compiles but visually breaks is not complete.

Pay special attention to:

-   invisible sections
-   overflow
-   clipped text
-   incorrect RTL
-   broken modals
-   editor canvas scaling
-   mobile toolbars
-   typography
-   contrast
-   spacing

------------------------------------------------------------------------

# 62. Performance

The product should feel fast.

Prioritize:

-   server rendering where appropriate
-   lazy loading heavy editor modules
-   dynamic import for expensive engines/UI
-   image optimization
-   minimal client JavaScript where possible
-   avoid shipping entire editor libraries to every tool page
-   avoid unnecessary re-renders
-   virtualize long document/page lists where necessary

PDF editors and Office previews should not make the homepage huge.

------------------------------------------------------------------------

# 63. Progressive Loading

For heavy features:

``` text
Page shell
 ↓
Workspace UI
 ↓
Editor module
 ↓
Document rendering
```

Do not block the entire application while loading a heavy editor.

------------------------------------------------------------------------

# 64. Feature Flags / Registry

Continue using the registry pattern for tools.

New tools should initially be disabled until:

-   handler exists
-   UI exists
-   translations exist
-   test exists
-   production verification exists

Then enable them.

------------------------------------------------------------------------

# 65. Database Discipline

Any database change requires:

-   migration
-   schema verification
-   relevant seed/update
-   production-safe reasoning
-   test coverage where relevant
-   documentation in `docs/DECISIONS.md`

Never silently mutate production schema.

------------------------------------------------------------------------

# 66. Documentation

Update:

-   `docs/DECISIONS.md`
-   relevant technical documentation
-   feature documentation
-   environment documentation if new variables are introduced

Do not create huge documentation for trivial changes.

For major architecture decisions, record:

-   problem
-   options considered
-   selected approach
-   reason
-   consequences

------------------------------------------------------------------------

# 67. Environment Variables

If new environment variables are required:

-   update example env documentation
-   validate startup configuration
-   distinguish required vs optional
-   never commit secrets
-   fail clearly when a required production variable is missing

------------------------------------------------------------------------

# 68. Security/Privacy Product Messaging

JDpdf handles user documents.

The UI should communicate trust without making unsupported claims.

Useful concepts:

-   secure processing
-   automatic cleanup
-   private workspace
-   controlled downloads
-   encrypted transport

Only claim encryption-at-rest or specific retention periods if actually
implemented.

------------------------------------------------------------------------

# 69. Landing Page Copy Philosophy

Avoid generic SaaS language such as:

> "Revolutionize your workflow with cutting-edge AI."

Prefer concrete language:

> Edit, convert, sign, and organize documents in one workspace.

Users should understand the product within seconds.

------------------------------------------------------------------------

# 70. Tool Discovery UX

Each tool card should communicate:

-   icon
-   tool name
-   one-line description
-   category
-   optional "Popular" / "New" badge

Avoid long descriptions.

------------------------------------------------------------------------

# 71. Dashboard Quick Actions

Recommended:

-   Edit PDF
-   Convert
-   Merge
-   Compress
-   Sign
-   OCR

These should be the first actions users see.

------------------------------------------------------------------------

# 72. Recent Documents

Display:

-   file icon/type
-   name
-   last action
-   time
-   size where useful
-   action menu

Do not clutter rows with unnecessary metadata.

------------------------------------------------------------------------

# 73. Pricing UX

Pricing should explain:

-   what is free
-   what requires Pro
-   file limits
-   usage
-   batch
-   OCR
-   advanced features

Avoid deceptive countdowns or fake urgency.

------------------------------------------------------------------------

# 74. Future Collaboration

Later:

-   shared documents
-   comments
-   annotations
-   mentions
-   team folders
-   roles
-   permissions
-   audit trail

Do not implement collaboration before the single-user workspace is
solid.

------------------------------------------------------------------------

# 75. Future Integrations

Potential:

-   Google Drive
-   Dropbox
-   OneDrive
-   email import
-   API
-   webhooks

Integrations should be optional and isolated.

Do not make third-party integrations a requirement for core
functionality.

------------------------------------------------------------------------

# 76. Product Quality Bar

JDpdf should pass this test:

### First-time visitor

Can understand the product in under 10 seconds.

### First file

Can upload a document without instructions.

### Processing

Knows what is happening.

### Result

Knows what to do next.

### Returning user

Can find previous documents immediately.

### Power user

Can use keyboard shortcuts and command search.

### Mobile user

Can complete common operations without fighting the UI.

### Arabic user

Gets a genuinely RTL-aware experience, not a mirrored English page with
broken details.

------------------------------------------------------------------------

# 77. What "Professional" Means for This Product

Professional does not mean:

-   more colors
-   more animations
-   more cards
-   more gradients
-   more text

Professional means:

-   predictable interaction
-   visual hierarchy
-   excellent typography
-   fast feedback
-   reliable processing
-   clear errors
-   consistent components
-   good defaults
-   accessibility
-   strong information architecture
-   trustworthy privacy behavior

------------------------------------------------------------------------

# 78. Claude Code --- Working Instructions

When implementing this blueprint:

### First

Read:

-   `AGENTS.md`
-   `PDF Platform — Master Project Blueprint.md`
-   `docs/DECISIONS.md`
-   package manifests
-   existing architecture
-   existing tool registry
-   worker handlers
-   shared workflow components
-   tests
-   translations

Do not assume the blueprint is more current than the repository.

The repository plus `AGENTS.md` and `docs/DECISIONS.md` are
authoritative for existing implementation details.

### Then

Create an internal implementation plan.

Do not stop for confirmation after each item.

### Then

Implement in dependency order.

### During implementation

-   reuse existing abstractions
-   preserve working features
-   avoid duplication
-   keep TypeScript strict
-   keep APIs thin
-   keep workers isolated
-   add tests
-   update translations
-   update documentation

### Before finishing

Run:

-   app typecheck
-   worker typecheck
-   ESLint
-   production builds
-   relevant E2E tests
-   complete regression suite where practical

Then run the actual application and visually inspect:

-   English homepage
-   Arabic homepage
-   English tools
-   Arabic tools
-   dashboard
-   workspace/editor
-   mobile layouts

Fix all obvious visual defects before declaring completion.

------------------------------------------------------------------------

# 79. Claude Code --- Handling Scope

This document intentionally contains a large target scope.

Do not fake completion.

If a feature cannot be implemented safely in the current repository
because it requires a major dependency, engine, or infrastructure
decision:

1.  investigate it
2.  implement everything that is safely implementable
3.  document the blocker
4.  add the correct architecture/interfaces where useful
5.  do not mark the feature as production-ready
6.  do not ship a fake implementation

The goal is **verified progress**, not a large diff.

------------------------------------------------------------------------

# 80. Claude Code --- Never Do These

-   Do not delete working tools.
-   Do not remove existing E2E tests.
-   Do not bypass workers for expensive processing.
-   Do not put processing logic into Next.js API routes.
-   Do not import Next.js application code into workers.
-   Do not introduce fake progress.
-   Do not claim unsupported PDF editing.
-   Do not fake redaction.
-   Do not store secrets in code.
-   Do not hardcode translations.
-   Do not create separate duplicated workflows unnecessarily.
-   Do not introduce glassmorphism/gradient-heavy UI.
-   Do not sacrifice mobile for desktop.
-   Do not sacrifice Arabic RTL for English.
-   Do not declare success only because build passes.
-   Do not stop asking for approval for routine implementation steps.

------------------------------------------------------------------------

# 81. Suggested End State

The eventual JDpdf experience should feel like:

``` text
                         JDpdf
                           │
              ┌────────────┴────────────┐
              │                         │
          Documents                   Tools
              │                         │
        ┌─────┴─────┐        ┌─────────┴─────────┐
        │           │        │         │          │
      Recent      Workspace Edit    Convert    Organize
                    │
              ┌─────┼───────────────┐
              │     │       │       │
             PDF   DOCX    XLSX    PPTX
              │
       ┌──────┼─────────┐
       │      │         │
      Edit   OCR      Sign
       │      │         │
       └──────┼─────────┘
              │
            Export
```

The user should think:

> "This is where I work with documents."

Not:

> "This is a website with a bunch of PDF buttons."

------------------------------------------------------------------------

# 82. Final Product Vision

JDpdf should become a **multilingual document operating workspace**.

The immediate goal is not to build every possible feature at once.

The immediate goal is to establish the product foundation that makes all
those features feel like one product:

``` text
Strong visual identity
        +
Excellent upload UX
        +
Shared tool system
        +
Document workspace
        +
Professional editor
        +
Reliable processing
        +
Accounts/files/history
        +
Conversions/OCR/signing
        +
SaaS infrastructure
        +
Eventually AI
```

The existing 16 tools are the foundation.

The redesign is the new shell.

The workspace is the product.

------------------------------------------------------------------------

# 83. Immediate Execution Order

Start with:

### Step 1

Audit the repository and current UI.

### Step 2

Create/standardize the JDpdf design system.

### Step 3

Redesign the homepage.

### Step 4

Redesign navigation and tools directory.

### Step 5

Standardize upload / processing / result experiences.

### Step 6

Implement dashboard/workspace foundations without breaking current
tools.

### Step 7

Implement the first real editor foundation.

### Step 8

Add PDF → DOCX, DOCX → PDF, OCR, batch processing, and advanced editing
according to dependency order.

### Step 9

Add auth, documents, history, and usage infrastructure.

### Step 10

Continue with advanced tools, SaaS, API, and AI.

At every stage, preserve verified functionality.

------------------------------------------------------------------------

# 84. Final Instruction to the Implementer

Treat this document as the **product direction**, not permission to
blindly rewrite the repository.

Use engineering judgment.

Inspect first.

Plan.

Implement.

Test.

Visually verify.

Fix.

Document.

Then continue.

The desired result is not the largest possible code change.

The desired result is a **cohesive, production-quality JDpdf platform
that users would genuinely choose to use.**
