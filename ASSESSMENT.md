# Full Stack Developer – Technical Skills Assessment

## Overview

This assessment evaluates Senior Full Stack Developer candidates across:

- Frontend engineering
- Backend API design
- Database modeling
- Authentication
- AI integration
- System architecture

The target is a **SaaS-style web application**.

You are **not** expected to build a production-ready system. The goal is to understand:

- Your architectural thinking
- Your ability to translate product requirements into a working end-to-end system
- Your code quality, structure, and maintainability
- Your ability to build clean, usable user interfaces
- Your approach to integrating third-party services (including AI APIs)
- Your decision-making and tradeoff analysis

A **functional prototype** demonstrating the core workflows is sufficient.

---

## Time Expectations

- Complete and submit this assessment within **72 hours** of receiving it
- The follow-up discussion (review/interview) will last approximately **30 minutes**

---

## Submission Instructions

**Required:**

1. Push your code to a GitHub repository (private or public)
2. Share the Git repository URL after pushing your code
3. Provide a publicly viewable README or documentation
4. Deploy your prototype and share a **live demo link**

**Optional but good to have:**

- Provide a short recorded demo video demonstrating the system

### Documentation must clearly explain

- High-level architecture
- How to run the project locally
- Key design decisions and tradeoffs
- Assumptions and known limitations

---

## Assessment Objective

Build a simplified end-to-end web application that includes an **AI-assisted chatbot for appointment booking**.

The emphasis is on:

- Clean frontend/backend separation
- Practical API and database design
- Thoughtful UI and UX implementation
- Sensible integration of an AI service (not AI research)

---

## Core Deliverables

### 1. Frontend Application

**Technology:** React or Next.js

**Requirements:**

- A web page with an embedded chatbot UI
- Real-time or near-real-time chat experience (WebSockets or polling)
- Basic user authentication (signup/login using JWT or session)
- Appointment booking UI (form-based or conversational)
- Clean, well-structured, and visually usable UI
- Reasonable attention to layout, spacing, typography, and interactions

**Evaluation focus:**

- Component structure and state management
- API integration patterns
- Handling async flows and errors
- Conversation-driven UX design
- UI clarity, usability, and polish appropriate for an engineer

---

### 2. Backend API

**Technology:** Node.js with Express (or equivalent framework)

**Requirements:**

REST APIs for:

- Authentication
- Chat messages
- Appointment creation and retrieval

Also required:

- JWT or session-based authentication
- Middleware for:
  - Request validation
  - Logging
  - Basic rate limiting
- Proper error handling and HTTP status codes

**Evaluation focus:**

- API clarity and consistency
- Security awareness
- Separation of concerns
- Code organization and maintainability
- Clear service boundaries

---

### 3. AI Integration Service

**Technology:** Any AI provider API (Mistral is recommended, as it provides a free API key)

**Requirements:**

Integrate an LLM to assist with:

- Understanding appointment requests
- Extracting booking details from user messages
- Multi-turn conversation support (simple memory is sufficient)
- Fallback to structured forms if user input is incomplete or ambiguous
- Log AI interactions for debugging or analytics (console or database)

> **Note:** You are not expected to build advanced prompt engineering, agent frameworks, or complex orchestration. The focus is on clean, practical AI integration, not experimentation or research.

**Evaluation focus:**

- Practical AI usage
- Error handling and guardrails
- Clear boundaries between AI calls and business logic

---

### 4. Database Design

**Technology:** PostgreSQL

**Requirements:** Provide SQL schema (DDL) for:

| Table | Purpose |
|---|---|
| `users` | Authentication and profile data |
| `appointments` | Scheduling data and status |
| `chat_sessions` | Conversation history and metadata |

Also include:

- Sample insert statements
- Indexing strategy
- Notes on performance considerations
- Optional: multi-tenancy support (`business_id`)

**Evaluation focus:**

- Data modeling quality
- Normalization and constraints
- Scalability awareness
- SaaS-ready schema thinking

---

## Technical Skills Being Assessed

- **Frontend Engineering:** React/Next.js patterns, state management, UX implementation
- **Backend Engineering:** API design, authentication, middleware
- **Database Design:** Relational modeling, indexing, performance awareness
- **AI Integration:** Responsible and pragmatic LLM usage
- **System Architecture:** End-to-end integration and service boundaries
- **Problem Solving:** UX, technical tradeoffs, and decision-making

---

## Evaluation Criteria

### Will not be evaluated

- Production-scale optimizations
- Advanced visual design or branding polish

### Will be evaluated

- Clarity of thought and documentation
- Code readability and structure
- Sensible architectural decisions
- Quality of UI implementation and usability
- Attention to layout, spacing, and interaction details
- Realistic use of AI in a product workflow
- Ability to explain and defend tradeoffs

The UI does not need to be designer-level, but it must be clean, usable, and thoughtfully implemented, reflecting senior-level full stack standards.

---

## Final Note

This assessment is designed to reflect **how you think and build**, not how much you can implement in a week.

Make reasonable assumptions, document them clearly, and prioritize **clean, intentional engineering** over unnecessary complexity.

---

## Implied Core Workflow

The document does not list numbered user stories, but the required deliverables imply this flow:

1. User signs up or logs in
2. User opens a page with an embedded chatbot
3. User talks to the bot about booking an appointment
4. The LLM understands the request and extracts booking details across multiple turns
5. If details are missing or ambiguous, the UI falls back to a structured form
6. An appointment is created and can be retrieved later
7. Chat history is stored; AI interactions are logged

---

## Submission Checklist

- [ ] GitHub repository (private or public)
- [ ] Repository URL shared
- [ ] Public README covering architecture, local setup, tradeoffs, assumptions, and limitations
- [ ] Live deployed demo link
- [ ] Optional: short recorded demo video
- [ ] Frontend: chatbot UI, auth, booking UI, usable layout
- [ ] Real-time or near-real-time chat (WebSockets or polling)
- [ ] Backend: REST APIs for auth, chat, and appointments
- [ ] Auth via JWT or session
- [ ] Middleware: validation, logging, rate limiting
- [ ] Proper error handling and HTTP status codes
- [ ] AI extracts booking details with multi-turn memory
- [ ] Form fallback when input is incomplete or ambiguous
- [ ] AI interactions logged
- [ ] PostgreSQL DDL for `users`, `appointments`, `chat_sessions`
- [ ] Sample inserts, indexing strategy, performance notes
- [ ] Optional: `business_id` multi-tenancy
