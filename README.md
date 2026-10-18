# system-design-chronicle
Visual system design guide from fundamentals to GenAI: RAG, agents and LLM serving, plus Netflix, Discord and Stripe case studies. Interactive and offline.


A personal knowledge base for learning and practicing system design.

## Structure

| Folder | Contents |
|---|---|
| [`00-framework.md`](00-framework.md) | Step-by-step approach for any design problem |
| [`01-fundamentals/`](01-fundamentals/) | Core concepts: scalability, CAP, consistency, estimation |
| [`02-building-blocks/`](02-building-blocks/) | Reusable components: load balancers, caches, queues, databases |
| [`03-case-studies/`](03-case-studies/) | End-to-end designs of real systems |
| [`templates/`](templates/) | Blank template for new case studies |
| [`diagrams/`](diagrams/) | Exported diagrams (Mermaid is preferred inline) |
| [`resources.md`](resources.md) | Books, papers, blogs, courses |

## Fundamentals

- [Scalability](01-fundamentals/scalability.md)
- [CAP & PACELC](01-fundamentals/cap-theorem.md)
- [Consistency Models](01-fundamentals/consistency-models.md)
- [Back-of-the-Envelope Estimation](01-fundamentals/estimation.md)

## Building Blocks

- [Load Balancing](02-building-blocks/load-balancing.md)
- [Caching](02-building-blocks/caching.md)
- [Databases & Sharding](02-building-blocks/databases.md)
- [Message Queues](02-building-blocks/message-queues.md)
- [Consistent Hashing](02-building-blocks/consistent-hashing.md)
- [Rate Limiting](02-building-blocks/rate-limiting.md)

## Case Studies

| # | System | Status |
|---|---|---|
| 1 | [URL Shortener](03-case-studies/url-shortener.md) | ✅ Done |
| 2 | Rate Limiter Service | ⬜ Todo |
| 3 | Key-Value Store | ⬜ Todo |
| 4 | Chat System (WhatsApp) | ⬜ Todo |
| 5 | News Feed (Twitter/X) | ⬜ Todo |
| 6 | Notification Service | ⬜ Todo |
| 7 | Web Crawler | ⬜ Todo |
| 8 | Video Streaming (YouTube) | ⬜ Todo |
| 9 | Ride Sharing (Uber) | ⬜ Todo |
| 10 | Distributed File Storage (S3) | ⬜ Todo |

To start a new one: `cp templates/case-study-template.md 03-case-studies/<name>.md`

## 📜 Interactive website — The System Design Chronicle

`site/` is a dependency-free interactive learning site (animated architecture diagrams, step-through request flows, chaos/failure mode, live capacity calculators, simulators, quizzes, progress tracking).

🌐 **Live:** https://yogeshagrawal11.github.io/system-design-chronicle/

```bash
open site/index.html                         # works straight from disk
# or: python3 -m http.server -d site 8000   → http://localhost:8000
```

Authoring: see `site/tools/AUTHORING.md`. After adding data files run `python3 site/tools/build.py` (links scripts into index.html) and `node site/tools/validate.js`.

### Deployment

Every push to `main` that touches `site/` is validated and published to GitHub Pages by `.github/workflows/pages.yml`.
One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
