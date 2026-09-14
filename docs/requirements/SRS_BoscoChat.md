# SRS BoscoChat

**Source:** `SRS BoscoChat`, Confederación Nacional Española de Antiguos Alumnos y Antiguas Alumnas de Don Bosco, marzo de 2026.

This Markdown document is the repository-readable requirements baseline derived from the project SRS. Requirement identifiers and intent are preserved so agents, tests and pull requests can trace implementation back to the specification.

> The original source is a 66-page PDF supplied to the project. This Markdown baseline is intended for automated development workflows; where wording or interpretation is disputed, consult the approved source PDF.

## 1. Product scope

BoscoChat is a web platform for consultation and exploration of a historical Salesian documentary archive in Spain. The initial corpus consists of digitized historical publications with OCR text. The product evolves in three phases:

1. **Phase 1 / MVP — Documentary search:** registered users, roles, quotas/subscriptions, document ingestion, OCR/indexing, textual search, filters, result fragments and protected integrated PDF viewing.
2. **Phase 2 — Conversational AI:** semantic retrieval, RAG, contextual conversations, documentary citations and links to source pages.
3. **Phase 3 — Visual analysis:** image extraction, face detection/similarity/grouping, contextual identity suggestions, human validation and location/entity enrichment.

Anonymous users cannot execute search or conversational queries. The platform is intended to be modular, cloud-hosted and extensible to additional documentary collections.

## 2. User classes

- Free user
- Pro user
- Premium user
- Advanced user
- Administrator
- Documentary manager

## 3. Functional requirements

### User management

| ID | Requirement |
|---|---|
| RF-USER-01 | Allow new users to register with username, email and password; email must be unique; default role is Free. |
| RF-USER-02 | Authenticate users with email and password and grant access only for valid credentials. |
| RF-USER-03 | Prevent search/chat execution for unauthenticated visitors; offer login/registration and preserve the entered query for execution after authentication. |
| RF-USER-04 | Support Free, Pro, Premium, Advanced, Administrator and Documentary manager roles with role-specific permissions and usage limits. |

### Usage control

| ID | Requirement |
|---|---|
| RF-USAGE-01 | Record each authenticated query, distinguishing documentary search and conversational query, with user, type, timestamp and parameters. |
| RF-USAGE-02 | Apply independent periodic limits for documentary-search and conversational queries. |
| RF-USAGE-03 | Block new queries when a plan limit is reached and offer an upgrade path. |

### Subscriptions and payments

| ID | Requirement |
|---|---|
| RF-SUB-01 | Support Free, Pro, Premium and Advanced plans, defining maximum documentary searches, maximum conversational queries and available functionality. |
| RF-SUB-02 | Allow users to upgrade to a higher plan and apply the change immediately after confirmed payment. |
| RF-PAY-01 | Integrate an external payment gateway for payments, renewals, cancellations and subscription-state events. |
| RF-PAY-02 | Automatically update subscription state from payment events including confirmed payment, renewal, cancellation and payment failure. |

### Documentary search

| ID | Requirement |
|---|---|
| RF-SEARCH-01 | Search OCR corpus by individual keywords or complete phrases; multiple terms default to requiring all terms unless explicit operators are used. |
| RF-SEARCH-02 | Support exact phrase search using quotation delimiters. |
| RF-SEARCH-03 | Support at least AND and OR logical operators, including combined queries. |
| RF-SEARCH-04 | Parse query syntax, apply operators, retrieve relevant indexed fragments and order results by relevance. |
| RF-SEARCH-05 | Filter by one or more publications. |
| RF-SEARCH-06 | Filter by specific publication issue/number. |
| RF-SEARCH-07 | Filter by publication-date range. |
| RF-SEARCH-08 | Filter by author using available corpus metadata. |
| RF-SEARCH-09 | Filter by editorial section. |
| RF-SEARCH-10 | Present results as OCR text fragments and visually highlight matching terms/phrases. |
| RF-SEARCH-11 | Show publication, issue number, publication date and page number for each result. |
| RF-SEARCH-12 | Link each result to the original PDF and open it in an integrated viewer. |

### Document viewing

| ID | Requirement |
|---|---|
| RF-DOC-01 | Provide an integrated PDF viewer supporting page navigation, zoom and scrolling. |
| RF-DOC-02 | Open a document directly on the page containing the selected search fragment. |
| RF-DOC-03 | Prevent direct PDF download from the viewing interface and insert an invisible watermark containing metadata of the consulting user. |
| RF-DOC-04 | Protect document access through authenticated backend-controlled authorization; documents must not be directly accessible through external links. |

### Conversational system

| ID | Requirement |
|---|---|
| RF-CHAT-01 | Provide a natural-language conversational interface with generated answer, documentary citations and links to originals. |
| RF-CHAT-02 | Maintain conversation context so follow-up questions can depend on prior exchanges; maintain session history. |
| RF-CHAT-03 | Persist conversation history including conversation/user IDs, questions, generated answers and documentary references. |
| RF-CHAT-04 | Count every conversational question as a conversational query for usage control. |
| RF-CHAT-05 | Consume one conversational quota unit per query and block queries after the limit. |
| RF-CHAT-06 | Present generated answers in a structured format containing answer text, citations and document links. |
| RF-CHAT-07 | Make citations interactive and open the corresponding source page in the integrated document viewer. |

### RAG

| ID | Requirement |
|---|---|
| RF-RAG-01 | Retrieve the most relevant corpus fragments before generating a conversational answer and provide them as model context. |
| RF-RAG-02 | Generate natural-language answers constrained to retrieved corpus content; do not assert information unsupported by available documentary content. |
| RF-RAG-03 | Include explicit citations with publication, issue, date and page, linked to the source document. |
| RF-RAG-04 | Open source documents in the integrated viewer directly on the cited page. |
| RF-RAG-05 | Reduce hallucinations by constraining context to retrieved fragments, requiring citations and verifying that citations correspond to real system documents. |

### Documentary corpus management

| ID | Requirement |
|---|---|
| RF-DOCMGMT-01 | Allow Documentary managers and Administrators to upload complete publication PDFs with publication, issue/volume, date, author(s) where applicable and section where available; ingestion starts automatically. |
| RF-DOCMGMT-02 | Ingest by storing PDF, generating page representations, extracting/importing OCR, chunking OCR text and indexing fragments for search/chat. |
| RF-DOCMGMT-03 | Extract PDF images as independent resources associated to source page, with image ID, source document, page and page coordinates. |
| RF-DOCMGMT-04 | Allow Documentary managers to edit page OCR manually and retain change traceability. |

### Historical entities and AI review

| ID | Requirement |
|---|---|
| RF-ENTITY-01 | Allow Documentary managers to create Person entities with name, variants and basic biographical information. |
| RF-ENTITY-02 | Allow creation of Location entities with name, description and coordinates when available. |
| RF-AI-01 | Detect faces automatically in corpus images and generate potential image-person associations. |
| RF-AI-02 | Allow Documentary managers to approve, correct, merge or reject automatically generated person associations. |
| RF-AI-03 | Automatically group images containing similar faces, with groups reviewable/modifiable by Documentary managers. |
| RF-AI-04 | Suggest image-person associations when a person's name appears in related document text; suggestions require confirmation/rejection. |

### Administration

| ID | Requirement |
|---|---|
| RF-ADMIN-01 | Allow Administrators to create accounts, change roles, suspend accounts and delete accounts. |
| RF-ADMIN-02 | Allow Administrators to inspect and modify user subscription state when necessary. |
| RF-ADMIN-03 | Provide administration monitoring for query counts, conversational use, user activity and system-resource consumption. |

## 4. Non-functional requirements

| ID | Requirement |
|---|---|
| RNF-PERF-01 | Documentary search target response time: < 2 seconds for indexed-corpus queries. |
| RNF-PERF-02 | Conversational response target: < 12 seconds from user submission, including retrieval, context construction and generation. |
| RNF-PERF-03 | Web platform initial load target: < 2 seconds under normal network conditions. |
| RNF-SCALE-01 | Initially support up to 50 concurrent users; architecture should permit growth to 1,000-2,000 concurrent users. |
| RNF-SCALE-02 | Permit progressive addition of publications/collections without redesigning the data model or storage architecture. |
| RNF-AVAIL-01 | Minimum platform availability: 90% during normal operational periods. |
| RNF-AVAIL-02 | Plan maintenance to minimize user impact and, where possible, perform it during low-activity periods. |
| RNF-SEC-01 | Use secure authentication; passwords must be stored using suitable cryptographic password hashing. |
| RNF-SEC-02 | Stored documents must not be directly accessible outside the platform; backend must verify user permissions before viewing. |
| RNF-SEC-03 | Prevent unauthorized access using controls such as session control, token verification and access-attempt limiting. |
| RNF-DATA-01 | Comply with EU GDPR for personal-data processing. |
| RNF-DATA-02 | Design facial-recognition functionality considering legal restrictions on biometric data; automatic identification requires human supervision/validation. |
| RNF-USE-01 | Provide an intuitive, understandable interface suitable for users with limited technical knowledge. |
| RNF-USE-02 | Present search results and generated answers clearly and structurally, always including documentary-source references where applicable. |
| RNF-MAINT-01 | Use a modular architecture so individual components can be modified/replaced without affecting the whole platform. |
| RNF-MAINT-02 | Allow new functionality and AI systems to be incorporated without complete platform redesign. |

## 5. Data model baseline

The SRS defines these principal entities:

- Publication
- Publication issue/number
- Page
- Text fragment/chunk
- Image
- Person
- Person appearance
- Location
- User
- Subscription
- Query log

The model distinguishes original documentary data, structural data, AI-generated data and operational user/usage data.

## 6. Target architecture from the SRS

The intended system is modular and distributed with these layers/components:

- Web client
- Application backend/API
- Authentication, roles and quota control
- Subscriptions/payment integration
- Documentary retrieval/search engine
- Semantic retrieval/vector index
- RAG answer generation
- Document-processing/ingestion pipeline
- Computer-vision module
- Primary structured database
- Protected object/document storage for PDF/pages/images
- Monitoring/observability

The source architecture diagram names **Stripe** for subscriptions/payments. External AI/image providers should remain replaceable behind service boundaries.

## 7. Cloud/infrastructure requirements

The SRS expects cloud infrastructure that can scale components independently, with application servers, primary database, object/document storage, documentary search/indexing, vector storage, external AI services and image storage/processing. Documents must not be directly internet-accessible. Communications between components must be protected and infrastructure monitored for use, load, latency and resource consumption.

BoscoChat's repository project profile currently sets AWS as the target cloud. Concrete AWS service choices remain implementation/architecture decisions unless separately approved.

## 8. Implementation roadmap

### Phase 1 — MVP: Documentary search

- Registration/authentication
- Roles
- Usage quotas
- Subscription integration
- Document upload
- Automatic ingestion
- OCR extraction/import
- Chunking and textual indexing
- Keyword search
- Exact phrases
- AND/OR operators
- Documentary filters
- Fragment result presentation
- Integrated PDF viewer
- Open at result page
- Download restriction/protected document access

### Phase 2 — Conversational AI

- Conversational interface
- Contextual conversations/history
- Semantic retrieval
- RAG response generation
- Documentary citations
- Direct links to source documents/pages
- Conversational-query logging and quota control

### Phase 3 — Visual analysis and entities

- Automatic image extraction
- Face detection
- Similar-face grouping
- Possible identity suggestions
- Image-person associations
- Documentary-manager review
- Contextual location/entity enrichment

## 9. Traceability policy

- Preserve `RF-*` and `RNF-*` IDs in backlog stories, tests and PRs.
- A story may implement several closely related SRS requirements, but each requirement must be traceable to at least one story and verification artifact.
- Missing mapping is a `TRACE-GAP`.
- The approved source SRS takes precedence over paraphrases in this Markdown file when there is a semantic conflict.
