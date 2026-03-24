# CarryOn™ — Comprehensive Platform Description

## What It Is
CarryOn is a digital estate planning and family readiness platform built as a native iOS app (with web PWA support). It helps American families organize, protect, and transfer their digital and physical estate assets to their beneficiaries — before they need to. Think of it as "estate planning meets family collaboration" designed for everyday people, not just the wealthy.

## The Problem It Solves
When someone dies or becomes incapacitated, their family is typically left scrambling — trying to locate documents, figure out account passwords, understand insurance policies, and navigate legal processes during an emotionally devastating time. The average American family loses weeks or months (and thousands of dollars) to this chaos. CarryOn eliminates this by giving families a living, organized, secure system they build together while everyone is still healthy.

## Who Uses It

### Benefactors (Primary Users)
The person organizing their estate. They create an estate, upload documents, record messages, set up security, and invite family members. They are the "owner" of the estate.

### Beneficiaries
Family members invited by the benefactor. They have controlled access to view estate documents, messages, and checklists — with permissions set by the benefactor. Beneficiaries can also be benefactors of their own separate estates.

### Admin / Operations
Internal platform management with full user management, analytics, escalation handling, and system health monitoring.

## Core Features

### 1. Estate Dashboard & Guided Onboarding
- 7-step "Getting Started" flow walks new users through setup: add a beneficiary, create a milestone message, upload a document, consult the AI guardian, customize their action checklist, set succession order, and store a digital credential
- Optional steps can be skipped with contextual explanations of how to complete them later
- Readiness Score calculated across multiple dimensions (documents, beneficiaries, messages, security, etc.)

### 2. Document Vault
- Secure upload and storage of estate documents (wills, trusts, insurance policies, deeds, etc.) via AWS S3 with presigned URLs
- Per-document password protection with up to 3 security layers (PIN, password, security question)
- Vault Master Key — a spoken passphrase that can unlock all documents as a recovery mechanism
- In-app PDF viewer and cross-platform download (iOS native share sheet, web browser download)

### 3. Milestone Messages (MM)
- Video and text messages recorded by the benefactor, scheduled for delivery on specific life events (wedding, graduation, birthday, death, etc.)
- Video recording with camera/microphone integration
- Voice-to-text transcription via speech recognition
- Scheduled delivery system with admin review/approval workflow
- Delivery tracking and beneficiary notification

### 4. Estate Guardian AI (EGA)
- AI-powered estate planning assistant (powered by xAI/Grok)
- Conversational interface with full chat history and session management
- Actionable intelligence:
  - **Immediate Action Checklist (IAC) Generation**: AI analyzes the estate and auto-generates prioritized action items for beneficiaries
  - **Vault Analysis**: AI reviews uploaded documents and identifies gaps
  - **Plan of Action**: AI creates customized estate planning roadmaps
  - **Todo Lists**: AI generates task lists based on conversation context
- Real-time task status polling with dashboard banners showing generation progress
- Duplicate detection for generated checklist items
- Export capabilities: conversation PDFs, IAC reports, plans of action, todo lists
- Requires address verification (frosted glass gate redirects to Settings if missing)

### 5. Beneficiary Management
- Invite beneficiaries via email with tokenized invitation links
- Drag-to-reorder succession hierarchy
- Primary beneficiary designation
- Per-beneficiary feature access toggles (document vault, messages, checklist, guardian, etc.)
- Photo upload with S3 storage
- Relationship tracking (spouse, child, parent, sibling, etc.)
- Access request system for beneficiaries wanting expanded permissions

### 6. Immediate Action Checklist (IAC)
- Prioritized list of tasks beneficiaries should complete upon the benefactor's passing or incapacitation
- AI-generated or manually created items
- Accept/reject workflow with feedback
- Reorderable with drag-and-drop
- Activation status tracking

### 7. Family Tree Visualization
- Animated SVG visualization showing the connection between estates, the benefactor, and beneficiaries
- Scroll-linked or auto-playing CSS animations with hardware-accelerated rendering
- Smooth bezier curves connecting nodes with gold (benefactor→beneficiary) and blue (estate→benefactor) color coding
- Responsive layout with 2-column grid

### 8. Digital Access Vault (Digital Wallet)
- Secure storage for website logins, account credentials, and digital access information
- Encrypted entries accessible to designated beneficiaries

### 9. Security System (Triple Lock)
- Per-section security with up to 3 layers: PIN (numeric keypad), Password, Security Question
- Sections: Document Vault, Milestone Messages, Beneficiary Management, Immediate Action Checklist, Designated Trustee Services
- Vault Master Key as universal recovery mechanism
- Face ID / biometric integration via Capacitor native plugin
- Auto-save toggles for instant security configuration

### 10. Designated Trustee Services (DTS)
- Professional trustee task management system
- Task creation, assignment, status tracking
- Quote and approval workflow
- Multi-item approval with admin oversight

### 11. Transition Certificates
- End-of-life transition documentation
- Certificate upload, review, and approval workflow
- Soft-delete with restore capability
- Admin review pipeline

### 12. Friends, Family & Neighbors (FFN)
- Contact management for important non-beneficiary relationships
- Emergency contact information storage

### 13. Legacy Timeline
- Visual timeline of estate activities and milestones
- Activity tracking across all estate interactions

### 14. Notifications & Push
- Real-time notification system with priority levels (critical, high, normal)
- Push notifications via Capacitor Push Notifications plugin
- VAPID-based web push support
- Unread count polling, mark-as-read, mark-all-read
- Deep-link notifications to relevant app sections

### 15. Support Chat
- In-app customer support messaging system
- Conversation threading with admin response capability
- P1 emergency escalation path

### 16. Subscription & Billing
- Stripe integration for web payments
- Apple In-App Purchase (IAP) support via StoreKit/native-purchases
- Family Plan system: FPO (Family Plan Owner) gets $1/mo benefactor discount, beneficiaries at $3.49 flat rate
- Beta program with free access and feedback collection
- Trial user management

### 17. Admin Dashboard
- Full user management with role editing, session exemptions, account diagnostics
- Hierarchy tree view showing benefactor→beneficiary relationships across the platform
- Estate health diagnostics and orphan cleanup
- Revenue metrics, launch metrics, analytics digest
- Announcement system for platform-wide communications
- Knowledge base management
- xAI credit balance monitoring
- SOC2 compliance reporting
- Security scanning
- Operator management with founder-level access controls

### 18. Operations Center
- Shift-based operations dashboard for support staff
- Escalation queue with resolution workflow
- Team task management
- Shift notes with acknowledgment tracking
- Activity logging and search
- Dashboard events monitoring

## Technical Architecture

### Frontend
- **Framework**: React 18 (Create React App)
- **UI Library**: Shadcn/UI + Radix UI primitives + TailwindCSS
- **Mobile**: Capacitor 6 wrapping the web app for iOS native distribution
- **State Management**: React Context (AuthContext) + local component state
- **Routing**: React Router v6 with role-based route protection
- **API Communication**: Axios with centralized API_URL configuration and auth header injection
- **Caching**: Custom API cache layer with login/logout cache clearing
- **Charts**: Recharts for analytics visualizations
- **PDF**: react-pdf for in-app document viewing
- **Payments**: @stripe/react-stripe-js for payment UI
- **Animations**: CSS keyframe animations with hardware acceleration (transform, opacity)
- **iOS Safe Areas**: Custom utility (`safeArea.js`) measuring `env(safe-area-inset-top)` at runtime, injected into all Radix UI popper components via `collisionPadding`

### Backend
- **Framework**: FastAPI (Python) with async/await throughout
- **Database**: MongoDB via Motor (async driver)
- **Authentication**: JWT tokens with bcrypt password hashing, optional TOTP-based OTP, WebAuthn support
- **Session Management**: Single-session enforcement with force-login override, 24-hour stale session cleanup
- **File Storage**: AWS S3 with presigned URL generation for uploads and downloads
- **Email**: Resend API for transactional emails (invitations, OTP, notifications)
- **AI**: xAI (Grok) for Estate Guardian AI conversations and content generation
- **Security**: Rate limiting middleware (IP-based tiered limits), account lockout (25 failed attempts / 5 min with admin exemption), CORS, security headers
- **Encryption**: AES encryption for sensitive vault entries
- **Background Jobs**: EGA task tracking with polling-based status updates
- **Compliance**: GDPR/CCPA data export, deletion requests, consent tracking, incident logging, retention policies, sensitive access logging

### Infrastructure & Deployment
- **Backend Hosting**: Railway
- **Frontend Hosting**: Vercel
- **Database**: MongoDB Atlas
- **File Storage**: AWS S3
- **iOS Distribution**: CodeMagic CI/CD → App Store Connect → TestFlight/App Store
- **OTA Updates**: Capgo for live JavaScript bundle updates without App Store review
- **Domain**: carryon.us
- **CI/CD**: GitHub Actions for linting (ruff + ESLint) on push

### Mobile (iOS)
- **Native Shell**: Capacitor 6 with iOS 15.0 minimum deployment target
- **Plugins**: Camera, Filesystem, Push Notifications, Share, Status Bar, Native Biometric (Face ID), Share Target (Share Extension), Capacitor Updater (Capgo), Native Purchases (StoreKit)
- **Privacy**: Full PrivacyInfo.xcprivacy manifest declaring all collected data types and accessed APIs
- **Entitlements**: Push notifications (production), associated domains (webcredentials), app groups (share extension)
- **Share Extension**: Swift-based extension for receiving shared files (PDFs, images) from other apps into the Document Vault

### Data & Compliance
- **Privacy**: No tracking, no third-party data sharing
- **Encryption**: Documents encrypted at rest (S3 SSE), vault entries AES-encrypted, passwords bcrypt-hashed, PINs bcrypt-hashed
- **Audit Trail**: Comprehensive activity logging across all estate operations
- **Data Portability**: Full data export in JSON format
- **Right to Deletion**: Automated deletion request processing with admin review
- **SOC2**: Compliance reporting dashboard with security scan capabilities

## Scale of the Codebase
- **Backend**: ~15 route files, ~14 service modules, ~1005 test cases
- **Frontend**: ~27 page components, extensive Shadcn/UI component library
- **API Endpoints**: ~200+ REST endpoints covering all features
- **Database Collections**: users, estates, beneficiaries, documents, messages, checklists, digital_wallet, notifications, ega_tasks, chat sessions, transition certificates, family plans, support conversations, activity logs, compliance records, and more

## Business Model
- **Freemium**: Beta period currently free for all users
- **Planned Pricing**: Subscription-based (Stripe for web, Apple IAP for iOS)
- **Family Plans**: Discounted group pricing — benefactor at reduced rate, beneficiaries at flat $3.49/mo
- **Professional Services**: Designated Trustee Services as potential revenue vertical

## Competitive Positioning
CarryOn differentiates from traditional estate planning tools (Everplans, Trust & Will, etc.) through:
1. **AI-First**: Estate Guardian AI that actively analyzes, recommends, and generates actionable plans — not just a static document repository
2. **Family Collaboration**: Multi-user platform where benefactors and beneficiaries interact in real-time, not a single-user form-filling tool
3. **Milestone Messages**: Emotional/legacy component (video messages for future life events) that no competitor offers at this depth
4. **Triple Lock Security**: Per-section multi-layer security that gives benefactors granular control over who sees what and when
5. **Mobile-Native**: Full iOS app with Face ID, push notifications, share extension, and OTA updates — not just a responsive website
6. **Guided Experience**: 7-step onboarding with AI-powered checklist generation makes it accessible to non-technical users
7. **Operations Infrastructure**: Built-in admin/ops tooling for scaling customer support from day one
