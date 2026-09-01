# PDF Platform — Master Project Blueprint

## 0. Executive Directive

Build a production-ready, multilingual online PDF tools platform inspired by products such as iLovePDF, Smallpdf, Adobe Acrobat Web, and Sejda.

The platform must allow users to perform common PDF and document operations directly from the browser through a fast, polished, trustworthy web application.

### Primary languages

- Arabic (`ar`)
- English (`en`)
- Turkish (`tr`)

Arabic must support full RTL behavior.

### Primary objective

The first production version must be built and deployable in **less than 48 hours**.

Speed is important, but do not sacrifice:

- Core functionality
- Security
- Responsive design
- SEO fundamentals
- Maintainability
- Architecture quality
- Error handling
- File privacy
- Internationalization

The application must feel like a real established SaaS product, **not an AI-generated template**.

---

# 1. Product Vision

The product is a general-purpose online PDF/document utility platform.

Users should be able to:

- Merge PDFs
- Split PDFs
- Compress PDFs
- Rotate PDFs
- Delete pages
- Extract pages
- Reorder pages
- Convert images to PDF
- Convert PDF pages to images
- Add watermarks
- Add page numbers
- Protect PDFs
- Unlock PDFs when the user knows the password
- Edit PDF metadata
- OCR scanned PDFs
- Convert PDFs to text
- Convert office documents to PDF
- Perform additional document operations through a scalable tool architecture

The architecture must make adding future tools easy.

Do **not** build every possible PDF feature from scratch.

Use mature, battle-tested open-source tools where appropriate.

---

# 2. Product Principles

The platform must follow these principles:

1. Fast
2. Simple
3. Trustworthy
4. Privacy-conscious
5. Mobile-friendly
6. SEO-friendly
7. Multilingual
8. Accessible
9. Scalable
10. Maintainable

The user should understand what each tool does within seconds.

The upload → processing → result flow should be extremely clear.

---

# 3. Recommended Technology Stack

## Frontend

- Next.js
- App Router
- TypeScript
- Tailwind CSS
- React
- `next-intl` or an equivalent robust i18n solution
- CSS variables for design tokens
- `next/font` for typography

## Backend / Web Application

Next.js server-side functionality should handle:

- Authentication
- User management
- API endpoints
- Job creation
- Database operations
- CMS
- SEO
- Tool configuration
- Usage limits
- Subscription entitlements
- Admin operations

Do NOT perform heavy PDF processing directly inside Next.js request handlers.

---

# 4. PDF Processing Architecture

Heavy processing must happen in isolated workers.

Recommended architecture:

```text
Browser
   ↓
Next.js Web App
   ↓
Create Processing Job
   ↓
Database + Queue
   ↓
Redis / BullMQ
   ↓
PDF Worker
   ↓
PDF Processing Engine
   ↓
Object Storage
   ↓
Job Status
   ↓
Browser
   ↓
Download Result
```

The browser must never depend on a long-running HTTP request for heavy PDF processing.

---

# 5. Worker Architecture

Use separate workers for document processing.

Recommended worker ecosystem:

### qpdf

Use for operations such as:

- Merge
- Split
- Rotate
- Page manipulation
- Encryption/decryption where the user provides the password
- Structural PDF transformations

### Ghostscript

Use where appropriate for:

- Compression
- PDF optimization
- Rendering-related operations

### OCRmyPDF + Tesseract

Use for:

- OCR
- Scanned PDF text layers
- Searchable PDFs

### LibreOffice

Use for:

- DOC/DOCX → PDF
- XLS/XLSX → PDF
- PPT/PPTX → PDF
- Other supported office document conversions

### Poppler utilities

Useful for:

- PDF → image
- PDF → text
- Rendering
- PDF inspection

### ImageMagick / Sharp

Use for image processing where appropriate.

Do not use one tool for every operation.

Choose the correct engine for each job.

---

# 6. Security Requirement for PDF Workers

PDF processing is untrusted-input processing.

Every uploaded file must be treated as malicious/untrusted.

Workers must have:

- Process isolation
- Timeouts
- Memory limits
- CPU limits
- Maximum file size
- Maximum page count
- Temporary directory isolation
- Randomized filenames
- No arbitrary path access
- No shell command injection
- No user-controlled command arguments
- Controlled executable arguments
- Automatic cleanup
- Restricted network access where possible

Never pass raw user input directly into shell commands.

Use safe argument arrays / subprocess APIs.

---

# 7. File Storage Architecture

Do NOT store PDF binary data directly inside the database.

Use object storage.

Examples:

- S3-compatible storage
- Cloudflare R2
- AWS S3
- Other compatible object storage

The database should store metadata such as:

```text
File
- id
- userId
- storageKey
- originalName
- mimeType
- size
- pageCount
- checksum
- status
- createdAt
- expiresAt
```

Temporary files must automatically expire.

Result files should have a defined retention policy.

Users must not be able to access another user's files.

Use signed/authorized download URLs.

---

# 8. Database

Recommended:

- PostgreSQL
- Prisma ORM

The schema must be designed for future subscriptions and usage tracking.

Core entities should include at minimum:

```text
User
Session
Role
Permission

Plan
Subscription
SubscriptionEvent
UsageRecord

Tool
ToolTranslation
ToolLimit
ToolSetting

Job
JobEvent

File
FileAccess

Coupon
CouponRedemption

EmailEvent

ContactSubmission

Article
ArticleTranslation
ArticleCategory
ArticleTag

Page
PageTranslation

SeoMetadata

SiteSetting
SiteLanguage

AuditLog

SystemLog
```

Do not over-engineer relationships that are not needed for the first version.

---

# 9. User Roles

At minimum:

### Guest

Can use free tools within anonymous limits.

### User

Can:

- Manage account
- View usage
- View processing history
- Manage subscription
- Access saved preferences

### Admin

Can manage:

- Users
- Tools
- Jobs
- Plans
- Coupons
- Content
- SEO
- Languages
- Contact messages
- Emails
- Settings
- System logs

### Super Admin

Optional for the first version.

---

# 10. Guest Usage System

Do not require registration before allowing basic PDF tools.

Guest users should have a limited free quota.

Use a secure anonymous identifier such as a signed guest ID cookie combined with server-side rate limiting.

Avoid invasive browser fingerprinting.

Example:

```text
Guest:
5–10 free processing operations within a defined period
```

The exact limits should be configurable from the CMS/database.

Do not hardcode business limits into frontend components.

---

# 11. Tool Entitlement System

Every tool must have configurable limits.

Example:

```text
Tool:
compress-pdf

Free:
- max file size
- max pages
- daily usage

Pro:
- larger file size
- more pages
- higher usage
```

The application should not contain scattered conditions such as:

```ts
if (user.plan === "pro")
```

throughout the codebase.

Use a centralized entitlement system.

Example conceptual API:

```ts
canUseTool(user, toolId)
getToolLimits(user, toolId)
getRemainingUsage(user, toolId)
```

---

# 12. MVP Tool List

Prioritize reliable tools.

## Core PDF Tools

### 1. Merge PDF

Combine multiple PDF files into one.

### 2. Split PDF

Split a PDF by:

- Page ranges
- Every N pages
- Individual pages

### 3. Compress PDF

Offer compression levels where technically possible:

- Basic
- Balanced
- Strong

Show estimated/result size when available.

### 4. Rotate PDF

Rotate selected pages or the entire document.

### 5. Delete Pages

Remove selected pages.

### 6. Extract Pages

Extract selected pages into a new PDF.

### 7. Organize PDF

Allow:

- Reordering
- Removing
- Rotating
- Extracting

This can share components with the other page-management tools.

### 8. JPG → PDF

Convert one or multiple images into a PDF.

### 9. PNG → PDF

Same architecture as image → PDF.

### 10. PDF → JPG

Render PDF pages into JPG images.

### 11. PDF → PNG

Render PDF pages into PNG images.

### 12. Watermark PDF

Add text/image watermark.

### 13. Page Numbers

Add configurable page numbers.

### 14. Protect PDF

Allow the user to set a PDF password.

### 15. Unlock PDF

Allow unlocking when the user supplies the correct password.

Do not implement password cracking or password bypassing.

### 16. OCR PDF

Create searchable PDFs from scanned documents.

### 17. PDF → Text

Extract text from PDF.

### 18. PDF Metadata

View/edit supported metadata.

### 19. DOC/DOCX → PDF

Use LibreOffice where suitable.

### 20. XLS/XLSX → PDF

Use LibreOffice where suitable.

### 21. PPT/PPTX → PDF

Use LibreOffice where suitable.

---

# 13. Future Tools

The architecture should allow future implementation of:

- PDF → Word
- PDF → Excel
- PDF → PowerPoint
- PDF → HTML
- PDF → Markdown
- HEIC → PDF
- Image compression
- Image resizing
- Crop PDF
- Repair PDF
- Compare PDF
- Redact PDF
- PDF Forms
- Sign PDF
- Edit PDF
- Annotate PDF

These should not delay the initial launch if they cannot be implemented reliably within the 48-hour target.

---

# 14. AI Features

AI features should be architected as separate services/tools.

Potential future tools:

- Summarize PDF
- Ask questions about PDF
- Translate PDF
- Extract structured information
- Extract tables
- Rewrite document
- Improve document
- Generate document summaries

AI processing should use the same job architecture:

```text
Upload
→ Job
→ AI Worker
→ Result
```

Do not mix AI processing logic into the PDF worker.

AI usage can later use credits.

---

# 15. Tool Registry

Create a centralized tool registry.

Example conceptual structure:

```ts
{
  id: "merge-pdf",
  slug: "merge-pdf",
  category: "pdf",
  inputTypes: ["application/pdf"],
  outputType: "application/pdf",
  processor: "qpdf",
  maxFiles: 20,
  enabled: true,
  guestEnabled: true
}
```

Each tool should define:

- ID
- slug
- category
- icon
- input types
- output type
- processor
- limits
- free access
- premium access
- SEO metadata
- translations
- description
- status

The tool registry must make it easy to add another tool without rebuilding the entire frontend.

---

# 16. Shared Tool UI

All PDF tools must use a common tool framework.

Do NOT create every tool page independently from scratch.

Common flow:

```text
Tool Landing Page
       ↓
Upload Area
       ↓
File Preview
       ↓
Options
       ↓
Start Processing
       ↓
Progress
       ↓
Success
       ↓
Download
```

Reusable components:

- ToolHero
- ToolDescription
- FileDropzone
- FileList
- FilePreview
- PDFPagePreview
- PageSelector
- ProcessingOptions
- ProcessingProgress
- ProcessingError
- ProcessingSuccess
- DownloadButton
- RemoveFileButton
- RetryButton
- RelatedTools
- FAQSection
- TrustSection
- ToolUsageLimitMessage
- UpgradePrompt

---

# 17. Upload UX

The upload experience is one of the most important parts of the product.

It must clearly support:

- Drag & drop
- File picker
- Multiple files where applicable
- File validation
- File size validation
- Unsupported format errors
- Upload progress
- Remove file
- Retry
- Mobile upload

The UI should immediately explain:

- What files are accepted
- Maximum size
- Maximum number of files
- What happens after upload

---

# 18. Processing UX

Never leave users wondering whether the application is working.

Show:

- Upload progress
- Processing status
- Progress percentage where available
- Current step
- Error state
- Retry
- Cancel where supported

Example:

```text
Uploading...
Processing...
Optimizing PDF...
Finalizing...
Ready
```

For operations where exact progress is unavailable, use a truthful indeterminate progress state.

Do not fake percentages.

---

# 19. Result UX

After successful processing:

- Show success state
- Show output filename
- Show file size
- Show download button
- Show secondary actions
- Show "Process another file"
- Show related tools

Example:

```text
Your PDF is ready.

[Download PDF]

[Compress another PDF]
[Merge another PDF]
```

---

# 20. Design Direction

The design must feel:

- Professional
- Modern
- Human-designed
- Calm
- Trustworthy
- Fast
- Clean
- Product-focused

Avoid the generic "AI SaaS" aesthetic.

Do NOT overuse:

- Glassmorphism
- Huge gradients
- Excessive rounded cards
- Excessive floating blobs
- Neon colors
- Random animations
- Giant typography
- Decorative elements with no purpose
- AI-generated-looking illustrations

The product should look like a mature productivity tool.

---

# 21. Design System

Create a centralized design system.

Define:

### Colors

- Primary
- Primary hover
- Secondary
- Background
- Surface
- Border
- Text
- Muted text
- Success
- Warning
- Error
- Info

### Typography

Use:

- Inter for English
- Cairo for Arabic
- Test Inter for Turkish and use the most appropriate consistent configuration

Define:

- Display
- H1
- H2
- H3
- Body
- Small
- Caption
- Button

### Spacing

Use a consistent spacing scale.

### Radius

Define a small set of approved radius values.

### Shadows

Use subtle, controlled shadows.

### Buttons

Define:

- Primary
- Secondary
- Ghost
- Destructive
- Disabled
- Loading

### Inputs

Define:

- Default
- Focus
- Error
- Disabled

### Cards

Use consistent card structure.

### Modals

Use one consistent modal system.

### Alerts

Define success/error/warning/info states.

---

# 22. Responsive Design

The platform must be fully responsive.

Design mobile-first.

Test at minimum:

- 320px
- 375px
- 390px
- 414px
- 768px
- 1024px
- 1280px
- 1440px+

Pay particular attention to:

- Upload zones
- PDF page thumbnails
- Tool controls
- Navigation
- Pricing
- Tables
- CMS dashboard
- Modals
- File lists

Do not simply shrink desktop layouts.

Mobile layouts should be intentionally designed.

---

# 23. RTL

Arabic must use proper RTL behavior.

Do not implement RTL by manually reversing individual components.

Use:

```html
dir="rtl"
```

and logical CSS properties where possible.

Prefer:

```css
margin-inline-start
padding-inline-end
inset-inline-start
```

instead of left/right-specific assumptions.

Icons and directional controls must be reviewed for RTL correctness.

---

# 24. Navigation

Main navigation should provide access to:

- PDF Tools
- Image Tools
- Pricing
- Blog
- About
- Contact

Authenticated users:

- Dashboard
- Account
- Usage
- Subscription
- History

Admin users:

- Admin Dashboard

Mobile navigation must be simple.

---

# 25. Homepage

Homepage should communicate the value proposition immediately.

Recommended structure:

1. Header
2. Hero
3. Main upload/tool discovery area
4. Popular tools
5. Tool categories
6. Why use the platform
7. Privacy/security section
8. How it works
9. FAQ
10. Blog/Insights
11. CTA
12. Footer

Do not make the homepage excessively long.

The primary CTA should be obvious.

---

# 26. Tool Landing Pages

Every tool must have its own SEO-friendly landing page.

Example:

```text
/en/merge-pdf
/en/compress-pdf
/en/split-pdf

/ar/merge-pdf
/ar/compress-pdf
/ar/split-pdf

/tr/merge-pdf
/tr/compress-pdf
/tr/split-pdf
```

Each page should contain:

- SEO title
- Meta description
- H1
- Tool interface
- Explanation
- How to use
- Features
- Supported files
- Privacy information
- FAQ
- Related tools
- Internal links
- Structured data where appropriate

Avoid thin pages containing only an upload box.

---

# 27. SEO Strategy

SEO is a first-class requirement.

Implement:

- Clean URLs
- Localized URLs
- Canonical URLs
- hreflang
- Sitemap
- robots.txt
- Metadata
- Open Graph
- Twitter/X metadata
- Structured data
- Breadcrumbs
- FAQ schema where valid
- Semantic HTML
- Correct heading hierarchy
- Internal linking
- Image optimization
- Fast page load
- Core Web Vitals awareness

---

# 28. Multilingual SEO

For every localized page:

```text
ar
en
tr
```

Generate:

- localized title
- localized description
- localized headings
- localized content
- canonical
- hreflang

Do not simply translate metadata mechanically and leave the page structure broken.

Arabic, Turkish and English pages should each read naturally.

---

# 29. SEO Content Architecture

Build content clusters around:

### PDF Tools

- Merge PDF
- Split PDF
- Compress PDF
- Rotate PDF
- PDF to JPG
- JPG to PDF
- etc.

### PDF Education

Articles explaining:

- How to merge PDFs
- How to compress PDF files
- How to reduce PDF size
- How to convert PDF to images
- How to make a PDF searchable
- How to protect a PDF
- etc.

### Use Cases

Examples:

- Students
- Lawyers
- Businesses
- Designers
- Office workers
- Freelancers

Do not generate low-quality mass SEO pages.

Quality is more important than page count.

---

# 30. Google Search Console

The platform should be prepared for Google Search Console.

Support:

- Verification
- Sitemap submission
- Search performance monitoring
- Indexed pages
- Search queries
- Clicks
- Impressions
- CTR
- Position

If direct Search Console API integration is implemented, use proper OAuth/service configuration and store credentials securely.

The CMS should have an SEO/analytics area for relevant metrics.

---

# 31. Analytics

Implement privacy-conscious analytics.

At minimum:

- Page views
- Tool page visits
- Tool starts
- Successful jobs
- Failed jobs
- Downloads
- Conversion funnel
- Signups
- Subscription conversions

Useful funnel:

```text
Landing Page
↓
Upload
↓
Processing
↓
Success
↓
Download
↓
Signup
↓
Upgrade
```

Track tool-level performance.

Example:

```text
merge-pdf:
1,000 visits
650 uploads
600 successful jobs
550 downloads
45 signups
12 upgrades
```

---

# 32. CMS

The CMS must be a real operational dashboard.

Do not build only a blog editor.

Admin dashboard sections:

```text
Dashboard
Users
Subscriptions
Plans
Coupons
Tools
Jobs
Files
Emails
Campaigns
Contact Messages
Blog
Pages
SEO
Languages
Analytics
System Logs
Settings
```

---

# 33. CMS Dashboard

Dashboard should show:

- Total users
- New users
- Active subscriptions
- Revenue
- Processing jobs
- Successful jobs
- Failed jobs
- Storage usage
- Most-used tools
- Most-visited pages
- Conversion rate
- Recent activity
- System health

The dashboard should be useful, not decorative.

---

# 34. User Management

Admins should be able to:

- Search users
- Filter users
- View user details
- Disable/enable accounts
- Change role
- View subscription
- View usage
- View jobs
- View account activity
- Reset password where appropriate
- Review account status

Do not expose passwords or sensitive authentication secrets.

---

# 35. Subscription System

The application must be architected for subscriptions even if monetization is initially disabled.

Recommended product structure:

### Free

Limited usage.

### Pro

Higher limits and premium functionality.

### Business

Future option.

Do not launch with many confusing plans.

Start simple.

---

# 36. Pricing Philosophy

Pricing should be based on perceived customer value rather than simply infrastructure cost.

Use:

- Simple plans
- Clear benefits
- Natural upgrade path
- Transparent limits
- Annual savings
- Regional pricing where appropriate
- Local payment methods when supported

Do not use fake discounts.

Do not create fake countdown timers.

Do not use manipulative dark patterns.

A discount must be real and clearly explained.

---

# 37. Free-to-Paid Conversion

The free plan should allow users to experience the product.

Conversion opportunities can appear when:

- User reaches quota
- User needs a premium tool
- User uploads a large file
- User processes many files
- User needs advanced OCR/conversion
- User wants higher limits

Upgrade messaging should explain exactly what the user gets.

Example:

```text
You've reached today's free limit.

Pro gives you:
✓ Higher limits
✓ Larger files
✓ Faster processing
✓ Advanced tools
✓ Ad-free experience

[Upgrade to Pro]
```

Do not block the product aggressively.

---

# 38. Payments

Build payment logic behind an abstraction.

Do not hard-code the entire application around one provider.

Potential providers can be evaluated before implementation.

The architecture should support:

```text
Payment Provider
↓
Checkout
↓
Webhook
↓
Subscription
↓
Entitlement Update
```

All payment events must be validated server-side.

Never trust payment status from the browser.

---

# 39. Email System

Prepare transactional email support.

Emails may include:

- Welcome
- Email verification
- Password reset
- Subscription confirmation
- Payment receipt
- Subscription cancellation
- Usage notifications
- Security notifications
- Contact confirmations

Use a proper transactional email provider.

Email sending must be server-side.

Track email events.

---

# 40. Authentication

Support:

- Email/password registration
- Login
- Logout
- Email verification
- Forgot password
- Password reset
- Session management

Security requirements:

- Secure password hashing
- Secure cookies
- CSRF protection where applicable
- Rate limiting
- Login abuse protection
- Password reset tokens with expiration
- Single-use reset tokens
- No user enumeration where practical

---

# 41. Rate Limiting

Rate limit:

- Login
- Registration
- Password reset
- OTP/email operations
- File uploads
- Job creation
- API endpoints
- Contact forms

Use Redis where appropriate.

Rate limits should be configurable.

---

# 42. File Upload Security

Validate:

- MIME type
- File extension
- Magic bytes/file signature
- File size
- Page count
- Filename
- Content where appropriate

Never trust:

```text
file.name
file.type
```

alone.

Store uploads using generated storage keys.

Never use user-provided filenames as filesystem paths.

---

# 43. Malware / Abuse Protection

Where practical, consider scanning uploaded files before processing.

Potential solution:

- ClamAV
- Isolated processing containers

The architecture should make malware scanning pluggable.

---

# 44. Privacy

PDF documents may contain highly sensitive information.

The platform must communicate a clear privacy policy.

Important principles:

- Process only what is required
- Do not inspect document content unnecessarily
- Automatically delete temporary files
- Define retention periods
- Secure storage
- HTTPS
- Access control
- No cross-user file access
- Do not expose file URLs publicly

Privacy messaging should be visible near upload functionality.

---

# 45. URL-to-PDF / External URL Processing

If a future feature allows users to convert URLs into PDFs:

Treat it as a major SSRF risk.

Never allow arbitrary server-side requests without strong controls.

Block:

- localhost
- private IP ranges
- internal services
- cloud metadata endpoints
- internal DNS targets

This feature should not be added to the MVP unless it can be implemented securely.

---

# 46. Error Handling

Every job needs explicit states:

```text
QUEUED
UPLOADING
PROCESSING
COMPLETED
FAILED
CANCELLED
EXPIRED
```

Errors should be:

- User-friendly
- Actionable
- Logged internally
- Safe
- Non-sensitive

Never expose raw stack traces to users.

---

# 47. Job System

Job record example:

```text
Job
- id
- userId
- guestId
- toolId
- status
- progress
- inputFileIds
- outputFileIds
- errorCode
- createdAt
- startedAt
- completedAt
- expiresAt
```

Use idempotency where appropriate.

If a request is accidentally submitted twice, avoid unnecessary duplicate jobs when possible.

---

# 48. Queue System

Recommended:

- Redis
- BullMQ

Queue categories can eventually include:

```text
pdf-processing
ocr
office-conversion
image-processing
ai-processing
email
cleanup
```

Workers should be independently scalable.

---

# 49. Cleanup System

Create automated cleanup jobs.

Clean:

- Temporary files
- Expired output files
- Abandoned uploads
- Old job records according to policy
- Expired sessions
- Temporary OCR artifacts

Do not allow storage to grow indefinitely.

---

# 50. Admin Tool Management

Admins should eventually be able to configure:

- Tool enabled/disabled
- Tool visibility
- Free limits
- Pro limits
- Maximum file size
- Maximum page count
- Tool title
- Description
- SEO metadata
- Translations
- Featured status
- Category
- Sort order

Avoid requiring code changes for basic commercial configuration.

---

# 51. Content Management

CMS should support multilingual:

```text
Article
ArticleTranslation
```

Each article can have:

- Title
- Slug
- Excerpt
- Content
- Cover image
- Author
- Category
- Tags
- SEO title
- SEO description
- Canonical
- Published status
- Published date

---

# 52. Image Management

Uploaded images should be optimized.

Use:

- WebP where appropriate
- Responsive image sizes
- Next/Image where appropriate
- Controlled dimensions
- File-size validation

Avoid huge unoptimized images.

---

# 53. Accessibility

Target strong WCAG compliance.

At minimum:

- Keyboard navigation
- Visible focus states
- Proper labels
- Semantic HTML
- Accessible dialogs
- Accessible error messages
- Screen-reader-friendly controls
- Sufficient contrast
- No color-only meaning
- Reduced-motion consideration

Do not sacrifice accessibility for visual design.

---

# 54. Performance

Performance is a core requirement.

Optimize:

- JS bundle size
- Images
- Fonts
- Server rendering
- Database queries
- API latency
- Queue performance
- PDF worker throughput

Avoid unnecessary client-side JavaScript.

Use server components where appropriate.

Use client components only where interactivity requires them.

---

# 55. Caching

Use appropriate caching for:

- Tool metadata
- Static content
- Public pages
- Blog pages
- Site settings

Do not cache user-specific/private data incorrectly.

After CMS updates, invalidate the correct public caches.

Avoid stale SEO/content pages after publishing changes.

---

# 56. Project Structure

Recommended conceptual structure:

```text
/
├── app/
│   ├── [locale]/
│   │   ├── page.tsx
│   │   ├── tools/
│   │   ├── pricing/
│   │   ├── blog/
│   │   ├── account/
│   │   └── ...
│   ├── admin/
│   └── api/
│
├── components/
│   ├── ui/
│   ├── tools/
│   ├── upload/
│   ├── pdf/
│   ├── navigation/
│   ├── marketing/
│   └── admin/
│
├── lib/
│   ├── auth/
│   ├── db/
│   ├── storage/
│   ├── queue/
│   ├── entitlements/
│   ├── seo/
│   ├── i18n/
│   ├── security/
│   └── analytics/
│
├── workers/
│   ├── pdf/
│   ├── ocr/
│   ├── office/
│   ├── image/
│   └── cleanup/
│
├── prisma/
│   └── schema.prisma
│
├── messages/
│   ├── ar/
│   ├── en/
│   └── tr/
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DESIGN_SYSTEM.md
│   ├── SEO_STRATEGY.md
│   ├── SECURITY.md
│   ├── TOOL_REGISTRY.md
│   ├── TEST_PLAN.md
│   ├── MONETIZATION.md
│   └── DECISIONS.md
│
├── skills/
│   ├── ui-design/
│   ├── pdf-engine/
│   ├── seo/
│   ├── security/
│   ├── i18n/
│   ├── qa/
│   └── monetization/
│
├── docker/
│
├── docker-compose.yml
│
├── AGENTS.md
└── README.md
```

Adjust the exact structure if the chosen implementation requires it, but maintain clear separation of responsibilities.

---

# 57. Agent / Skills System

This project must use a research-first agent workflow.

Before implementing a major area, the responsible agent must research current best practices.

Workflow:

```text
Research
↓
Document findings
↓
Plan
↓
Implement
↓
Test
↓
Review
↓
Fix
↓
Verify
```

Do not blindly generate code.

---

# 58. Required Skills

Create project-level skill documents.

## `skills/ui-design/SKILL.md`

Responsibilities:

Research:

- Modern productivity SaaS design
- PDF tool UX
- Upload UX
- File management UX
- Mobile PDF workflows
- Accessibility
- Typography
- Design systems
- Conversion-focused UX

Output:

```text
docs/DESIGN_RESEARCH.md
```

Then implement the design system.

---

## `skills/pdf-engine/SKILL.md`

Research:

- qpdf
- Ghostscript
- Poppler
- OCRmyPDF
- Tesseract
- LibreOffice
- PDF security
- PDF processing limitations

Define:

- Which engine handles each tool
- Input/output constraints
- Error handling
- Security limits
- Worker architecture

Output:

```text
docs/PDF_ENGINE.md
```

---

## `skills/seo/SKILL.md`

Research:

- PDF tool search intent
- Competitor SEO
- Search result patterns
- Programmatic SEO risks
- Multilingual SEO
- hreflang
- Structured data
- Internal linking
- Core Web Vitals

Output:

```text
docs/SEO_STRATEGY.md
docs/KEYWORD_MAP.md
```

Do not create spammy AI-generated SEO pages.

---

## `skills/security/SKILL.md`

Research:

- Untrusted PDF processing
- File upload security
- SSRF
- command injection
- sandboxing
- authentication
- rate limiting
- object storage security
- privacy

Output:

```text
docs/SECURITY.md
```

---

## `skills/i18n/SKILL.md`

Define:

- Routing
- Translation structure
- RTL
- Locale-specific metadata
- Number/date formatting
- SEO/hreflang
- Fallback behavior

Output:

```text
docs/I18N.md
```

---

## `skills/qa/SKILL.md`

Define tests for:

- Unit
- Integration
- E2E
- Responsive
- Accessibility
- Security
- PDF correctness
- Multilingual behavior
- SEO
- Performance

Output:

```text
docs/TEST_PLAN.md
```

---

## `skills/saas-monetization/SKILL.md`

Research:

- SaaS pricing
- Freemium
- Usage-based pricing
- Value metrics
- Subscription conversion
- Discounts
- Annual plans
- Regional pricing
- Upgrade UX

Output:

```text
docs/MONETIZATION.md
docs/PRICING_STRATEGY.md
```

Do not copy competitors blindly.

---

# 59. Agent Ownership

To avoid conflicts, agents must have clear ownership.

### Agent A — Architecture / Backend

Own:

```text
lib/
prisma/
API
queue integration
auth
database
```

### Agent B — Frontend / Design

Own:

```text
components/
app UI
design system
responsive layouts
tool UI
```

### Agent C — PDF Workers

Own:

```text
workers/
Docker worker configuration
PDF processing
OCR
Office conversion
```

### Agent D — SEO / i18n

Own:

```text
messages/
SEO utilities
metadata
sitemap
robots
hreflang
localized pages
```

### Agent E — CMS

Own:

```text
admin/
CMS components
content management
tool management
user management
```

### Agent F — QA / Security

Own:

```text
tests/
security verification
performance checks
E2E
responsive verification
```

Agents must not casually edit files owned by another agent.

---

# 60. Git / Collaboration Rules

Use separate branches or worktrees for independent agents.

Never have multiple agents simultaneously modifying the same files without coordination.

Every agent must:

1. Read `AGENTS.md`
2. Read the relevant skill
3. Read architecture decisions
4. Check current repository state
5. Implement only assigned scope
6. Run tests
7. Report changes
8. Avoid unrelated refactors

No unnecessary rewrites.

---

# 61. AGENTS.md Requirements

Create a root-level `AGENTS.md`.

It must state:

- Project purpose
- Stack
- Architecture
- Coding standards
- Directory ownership
- Security requirements
- Testing requirements
- i18n requirements
- Design requirements
- Git rules
- "Do not" rules
- Definition of done

Every coding agent must read this file first.

---

# 62. Research Rules

When an agent is instructed to research:

Use authoritative/current sources whenever possible.

Prefer:

1. Official documentation
2. Official standards
3. Major engineering documentation
4. High-quality technical publications
5. Established product UX research
6. Competitor analysis

Do not copy code blindly from random websites.

Record important decisions in documentation.

---

# 63. No Unnecessary Dependencies

Do not add dependencies just because they are convenient.

Before installing a package:

1. Check whether the functionality already exists.
2. Check package maturity.
3. Check maintenance status.
4. Check license.
5. Check bundle/server impact.
6. Check whether it is necessary.

Keep the dependency tree controlled.

---

# 64. Licensing

Before using a PDF processing library, verify its license and commercial compatibility.

Pay particular attention to:

- qpdf
- Ghostscript
- OCRmyPDF
- Tesseract
- Poppler
- LibreOffice
- ImageMagick

Document relevant licensing decisions.

Do not introduce a dependency with licensing restrictions that conflict with the intended commercial SaaS.

---

# 65. Testing Strategy

At minimum:

### Unit tests

For:

- Entitlements
- Usage limits
- Tool registry
- Validation
- Security utilities
- SEO generation
- Locale logic

### Integration tests

For:

- Upload
- Job creation
- Queue
- Worker
- Storage
- Database
- Authentication

### E2E tests

Critical flows:

```text
Guest → Merge PDF → Download
Guest → Compress PDF → Download
User → Register → Login
User → Upload → Process
User → View usage
Admin → Login → Manage tool
Admin → Publish content
```

---

# 66. PDF Test Corpus

Create test PDFs covering:

- Single-page PDF
- Multi-page PDF
- Large PDF
- Scanned PDF
- Password-protected PDF
- Rotated pages
- Different page sizes
- Image-heavy PDF
- Text-heavy PDF
- Corrupted/invalid PDF
- Arabic PDF
- Turkish PDF
- English PDF

Use these for automated and manual testing.

---

# 67. QA Definition of Done

A feature is NOT complete merely because the code compiles.

Definition of done:

- Works
- Tested
- Responsive
- Accessible
- Localized
- SEO-ready where applicable
- Secure
- Handles errors
- No console errors
- No obvious performance problems
- No broken loading states
- No broken empty states
- No broken mobile states

---

# 68. 48-Hour Execution Plan

## Phase 0 — Research + Foundation

Target: 1–2 hours

Create:

```text
AGENTS.md
ARCHITECTURE.md
DESIGN_RESEARCH.md
PDF_ENGINE.md
SEO_STRATEGY.md
SECURITY.md
I18N.md
TEST_PLAN.md
MONETIZATION.md
```

Initialize:

- Next.js
- TypeScript
- Tailwind
- i18n
- PostgreSQL
- Prisma
- Redis
- Queue
- Docker

---

## Phase 1 — Design System + Core Architecture

Target: 4–6 hours

Build:

- Global styles
- Typography
- Colors
- Buttons
- Inputs
- Cards
- Modal
- Toast
- Navigation
- Footer
- Layout
- RTL
- Responsive foundations

At the same time:

- Database schema
- Storage abstraction
- Queue abstraction
- Tool registry

---

## Phase 2 — Upload + Processing Engine

Target: 6–8 hours

Implement:

- Upload
- Validation
- Storage
- Job creation
- Queue
- Worker
- Progress/status
- Result storage
- Download
- Cleanup

First working tools:

1. Merge
2. Split
3. Compress
4. Rotate
5. Delete pages
6. Extract pages

---

## Phase 3 — Additional Tools

Target: 6–8 hours

Implement:

- JPG → PDF
- PNG → PDF
- PDF → JPG
- PDF → PNG
- Watermark
- Page numbers
- Protect
- Unlock
- PDF → Text
- Metadata
- Office → PDF
- OCR

Prioritize reliability.

If a complex conversion cannot be made reliable within the deadline, do not fake it.

---

## Phase 4 — Authentication + Usage

Target: 3–4 hours

Implement:

- Registration
- Login
- Logout
- Password reset
- Sessions
- Guest usage
- User usage
- Tool entitlements
- Usage dashboard

---

## Phase 5 — CMS

Target: 4–5 hours

Implement:

- Admin authentication
- Dashboard
- Users
- Tools
- Jobs
- Plans
- Content
- SEO
- Contact messages
- Settings

Focus on functional management rather than decorative dashboards.

---

## Phase 6 — SEO + i18n

Target: 3–4 hours

Implement:

- `/ar`
- `/en`
- `/tr`
- Localized tool pages
- Metadata
- Canonicals
- hreflang
- Sitemap
- Robots
- Structured data
- Internal linking
- Blog foundation

---

## Phase 7 — Final QA + Deployment

Target: 4–6 hours

Run:

- TypeScript
- ESLint
- Unit tests
- Integration tests
- E2E tests
- Build
- PDF tests
- Mobile tests
- RTL tests
- Accessibility checks
- Security checks
- Performance checks

Then deploy.

---

# 69. Priority System

If time becomes limited:

## P0 — Must work

- Homepage
- Tool pages
- Upload
- Processing
- Download
- Merge
- Split
- Compress
- Rotate
- Delete/extract/reorder
- Image → PDF
- PDF → image
- Authentication
- Basic CMS
- Arabic/English/Turkish
- SEO fundamentals
- Security
- Production deployment

## P1 — Important

- OCR
- Watermark
- Page numbers
- Protect
- Unlock
- Metadata
- Office → PDF
- Usage dashboard
- Advanced CMS
- Analytics

## P2 — Can wait

- PDF → Word
- PDF → Excel
- PDF → PowerPoint
- Repair PDF
- Compare
- Redact
- AI features
- Advanced subscriptions
- Advanced campaigns

Never sacrifice P0 reliability to add P2 features.

---

# 70. Deployment Architecture

Production should conceptually contain:

```text
Internet
   ↓
CDN / Reverse Proxy
   ↓
Next.js Web App
   ↓
PostgreSQL
   ↓
Redis
   ↓
Workers
   ↓
Object Storage
```

Workers should be independently deployable.

Do not run heavy PDF processing inside the same web process.

---

# 71. Environment Variables

Use environment variables for:

```text
DATABASE_URL
REDIS_URL

STORAGE_ENDPOINT
STORAGE_BUCKET
STORAGE_ACCESS_KEY
STORAGE_SECRET_KEY

AUTH_SECRET

EMAIL_API_KEY

ANALYTICS_KEYS

PAYMENT_PROVIDER_KEYS

SEARCH_CONSOLE_KEYS
```

Never commit secrets.

Provide:

```text
.env.example
```

with placeholders only.

---

# 72. Logging

Use structured logging.

Log:

- Job ID
- Tool ID
- User/guest identifier where appropriate
- Processing duration
- Worker
- Result
- Error code

Do not log:

- Passwords
- Authentication tokens
- PDF contents
- Sensitive document data

---

# 73. Monitoring

Production should eventually have:

- Error monitoring
- Worker monitoring
- Queue monitoring
- Database monitoring
- Storage monitoring
- Job success/failure rates

Useful metrics:

```text
job_success_rate
job_failure_rate
average_processing_time
queue_wait_time
storage_usage
active_users
conversion_rate
```

---

# 74. Marketing Requirements

The platform should have a strong acquisition foundation.

Important channels:

- Organic SEO
- Tool-specific search traffic
- Blog/content
- Social content
- Direct sharing
- Referral opportunities
- Product-led growth

Every successful tool action should make it easy to use another related tool.

Example:

```text
Compress PDF
→ Merge PDF
→ Split PDF
→ PDF to JPG
```

This increases session depth without annoying the user.

---

# 75. Internal Linking

Every tool page should link to related tools.

Example:

```text
Merge PDF
Related:
- Split PDF
- Compress PDF
- Rotate PDF
- Organize PDF
```

Blog articles should link to tools.

Tools should link to relevant educational content.

This should be systematic.

---

# 76. Trust Signals

The interface should communicate:

- Secure processing
- Privacy
- Automatic deletion
- No unnecessary registration
- Supported formats
- Reliable processing

Do not make unverifiable security claims.

Do not claim "100% secure" or similar absolute statements.

---

# 77. Ads

If advertising is used later:

- Keep ads visually separate from the tool interface.
- Never make ads look like download buttons.
- Never interfere with file processing.
- Avoid excessive ad density.
- Consider an ad-free paid plan.

The core product experience must remain usable.

---

# 78. Subscription UX

When monetization is enabled:

Pricing page should clearly show:

```text
Free
Pro
```

Show:

- Price
- Billing period
- Limits
- Features
- Savings
- Upgrade CTA

Annual pricing can provide legitimate savings.

Avoid artificial urgency.

---

# 79. Future Business Plan

Eventually support:

- Team accounts
- Shared billing
- Team members
- Admin roles
- Usage analytics
- Higher limits
- API access
- Priority processing
- Enterprise support

Do not implement full enterprise infrastructure in the first 48 hours.

---

# 80. API Future Architecture

The application should eventually expose APIs for:

```text
Create job
Upload file
Check job
Download result
```

API authentication could use:

- API keys
- OAuth
- Signed requests

But this is future scope.

Do not allow unauthenticated arbitrary processing APIs.

---

# 81. Code Quality Rules

Use:

- TypeScript strict mode
- Clear naming
- Small reusable functions
- Strong typing
- Server/client separation
- Centralized validation
- Centralized errors
- Centralized entitlements
- Centralized tool definitions

Avoid:

- Giant components
- Duplicate tool logic
- Hardcoded limits
- Hardcoded translations
- Business logic inside UI
- Unnecessary global state
- Magic numbers
- Copy-pasted tool pages

---

# 82. No Premature Abstraction

Do not create a massive framework before the first tools work.

Build the smallest reusable abstraction that supports the current requirements.

Extract shared patterns after seeing them repeated.

The goal is:

```text
Reusable
≠
Over-engineered
```

---

# 83. Product Quality Standard

Before declaring the project complete, ask:

### User experience

- Is it obvious what the site does?
- Is uploading easy?
- Is processing status clear?
- Is downloading obvious?
- Does mobile work properly?

### Technical

- Are PDF jobs isolated?
- Are files protected?
- Are expired files deleted?
- Are limits enforced server-side?
- Are jobs resilient?

### SEO

- Does every tool have a proper landing page?
- Are localized pages correct?
- Are canonical/hreflang correct?
- Is the sitemap working?

### Business

- Can users register?
- Can usage be tracked?
- Can plans be configured?
- Can subscriptions be added later?

### CMS

- Can admins manage users?
- Can admins manage tools?
- Can admins manage content?
- Can admins manage SEO?

---

# 84. Important Product Decision

Do NOT attempt to clone every feature of iLovePDF during the first 48 hours.

The objective is to build:

> A polished, reliable, multilingual PDF platform with a strong architecture that can rapidly grow into a complete document-processing SaaS.

The first release should prioritize **quality of the core workflow** over raw feature count.

---

# 85. Final Agent Instruction

You are not simply being asked to generate a website.

You are building the foundation of a commercial SaaS product.

Before implementing any major subsystem:

1. Research the best current approach.
2. Document important findings.
3. Choose the simplest robust implementation.
4. Implement it.
5. Test it.
6. Review it for security and UX.
7. Fix problems.
8. Verify production behavior.

Do not invent unsupported claims.

Do not blindly copy competitors.

Do not use fake functionality.

Do not use placeholder UI for features that appear to work.

If a feature cannot be reliably implemented within the deadline, either:
- simplify it,
- defer it,
- or clearly mark it as unavailable.

Never ship a fake implementation.

---

# 86. Final Definition of Success

The project is successful when a real user can:

```text
Open the website
↓
Choose Arabic / English / Turkish
↓
Find a PDF tool
↓
Upload a PDF
↓
See clear progress
↓
Have the PDF processed successfully
↓
Download the result
↓
Use another tool
```

while an administrator can:

```text
Login
↓
View dashboard
↓
Manage users
↓
Manage tools
↓
Manage limits
↓
Manage content
↓
Manage SEO
↓
View jobs
↓
View system activity
```

and the platform is ready for:

```text
Subscriptions
Payments
Email
Analytics
Google Search Console
More PDF tools
AI features
Business accounts
API access
```

without requiring a complete architectural rewrite.

---

# 87. Immediate Execution Order

Start in exactly this order:

```text
1. Inspect repository/environment
2. Create AGENTS.md
3. Research and create project documentation
4. Finalize architecture
5. Initialize Next.js + TypeScript + Tailwind + i18n
6. Configure PostgreSQL + Prisma
7. Configure Redis + queue
8. Configure object storage abstraction
9. Create tool registry
10. Create design system
11. Build upload flow
12. Build job system
13. Build PDF worker
14. Ship Merge PDF end-to-end
15. Ship Split PDF
16. Ship Compress PDF
17. Ship page-management tools
18. Ship image/PDF tools
19. Ship remaining P1 tools
20. Add authentication
21. Add usage/entitlements
22. Build CMS
23. Add multilingual SEO
24. Add analytics foundation
25. Run complete QA
26. Security review
27. Production build
28. Deploy
29. Verify production manually
30. Fix all P0/P1 issues
```

**Do not spend the first several hours polishing secondary UI details before the first complete PDF workflow works end-to-end.**

The first milestone is:

> **Upload PDF → Process PDF → Download PDF**

Once that works reliably, expand horizontally.