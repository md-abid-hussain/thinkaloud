---
id: web-services
name: Web services
teaches: Services that offer an HTTP API to clients and hold state behind it (a URL shortener, a rate limiter, a pastebin).
runs_as: http-server
oracle: spec
---

## What this type teaches

- **HTTP semantics:** methods, status codes and headers, and what each tells clients, browsers and caches.
- **The API contract:** request and response shape, validation at the edge, error responses that say what's wrong.
- **Idempotency and retries:** which requests are safe to repeat, and how to make one safe.
- **State:** where data lives, what survives a restart, and races between requests.
- **Time and limits:** counting requests over windows, fairness, clocks.
- **The edge:** what input you accept, and what your service could be abused for.

## Not this

- A web framework's API, routing syntax or ORM.
- Deployment and CI, unless the step is about them.

## Stage 0

- **What:** the endpoints in words, and what each one promises.
- **Why:** who calls this service, and what they rely on.
- **How:** where the state lives, and what happens when two requests arrive at once.

## Step questions

Shapes that work:
- A client retries after a timeout.
- Two requests race.
- A status-code choice, and what a client, cache or browser does with it.
- The service restarts, or runs as two instances.

Example (rate limiter, the token bucket step):
- **Question:** A mobile app comes back online and fires a burst of requests at once. With a token bucket, why are some
  accepted straight away and the rest rejected, and what should a well-behaved client do with the rejections?
- **looks_for:** the bucket holds saved-up tokens, so a burst up to its size passes · once it's empty, requests are
  rejected until tokens refill at the steady rate · 429 tells the client to slow down, ideally saying when to retry · the
  bucket allows short bursts but limits the average rate

## Check

- **runs_as http-server.** The contract says the service listens on PORT from the environment.
- **Oracle spec:** a sequence of requests, each with the expected status (a set when the page allows either, such as
  200 or 201), headers (such as Location) and body fields. Values from one response feed the next, such as the key
  from a create used to follow it.
- **Redirects** are never followed automatically. The check looks at the redirect itself.
- **Restarts** are tested only when the step asks for persistence.
- **Time-based behaviour** needs a short window, set through the contract.
