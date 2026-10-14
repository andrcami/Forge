# Testing — the layers, what each owns, and how ceremony scales

Generic know-how the generated `qa` skill links to. The project's own skill
holds its commands, paths, and flow-to-test map; this file holds the reasoning.

## The layers

| Layer | Owns | Does not own | Speed budget |
|---|---|---|---|
| **Unit** | Logic with branches: parsing, calculation, state machines, validation | Wiring, I/O, framework glue — mocking those tests the mock | whole suite in seconds |
| **Integration** | One service against its real store and its real framework: endpoints, queries, migrations, auth checks, transactions | Other services (stub them at the contract) | a minute or two |
| **Contract** | The shape of what this service sends to and accepts from a dependency, including the dependency failing, slow, or returning an unexpected schema | Whether the dependency is correct | fast |
| **End-to-end (UI)** | A core flow from the scope, driven through the real UI in a real browser, against a real backend | Every edge case — those belong a layer down | minutes; parallel |
| **UI/UX QA** | Accessibility, visual regression, responsive layout, keyboard paths, reduced motion, design-token conformance | Behaviour — an e2e test asserts the flow, a UX check asserts how it looks and who can use it | minutes |

Push every check to the lowest layer that can see the failure. An e2e test that
asserts a validation message's exact text is a unit test running slowly.

## What decides the tests — the scope, not the code

- **Each v1 core flow gets one e2e test** that walks it end to end, named after
  the flow. The scope's flow list is the e2e suite's table of contents; a flow
  without a test is unverified, a test without a flow is a candidate for deletion.
- **Each success criterion that is observable in the product** becomes an
  assertion somewhere — usually integration, sometimes e2e.
- **Each riskiest assumption** that v1 is meant to test gets the instrumentation
  or check that reports on it.
- **Each binding architecture decision with a failure mode** (tenant isolation,
  idempotency, auth at every layer) gets an integration test that would fail if
  someone broke it.

## Per-feature checklist

- Happy path; boundary values (empty, zero, one, max); invalid input; the error
  that should be raised and when
- Endpoints: success, malformed (400), unauthenticated (401), unauthorised (403),
  missing (404), validation (422)
- Auth re-checked at every layer that acts on a resource, not only at the edge
- Multi-tenant products: tenant A cannot read, list, or infer tenant B's data —
  including through search, counts, and error messages
- Concurrency where the domain has it: two writers, the retry, the duplicate
  webhook

## Scaling by size class

| Class | Unit | Integration | E2E | UI/UX QA |
|---|---|---|---|---|
| `throwaway` | optional | — | — | — |
| `tool` | logic with branches | endpoints + store | one smoke test per v1 core flow, one browser | axe scan on each flow's pages |
| `product` | as tool | as tool + contract tests per dependency | every v1 core flow, Chromium + WebKit + one mobile viewport | axe on every page state, visual regression at the `DESIGN.md` breakpoints in each theme, keyboard path per flow, reduced-motion pass |

## Rules that hold everywhere

- **A test that never ran is not green.** Check the runner's include glob covers
  every test directory — a directory outside it passes forever.
- **No sleeps.** Wait on a condition: an element, a response, a state. A sleep is
  a flake with a timer.
- **Retries diagnose, never hide.** A test that needs a retry to pass is a failing
  test. CI may retry once to capture a trace; a pass-on-retry is reported, not
  ignored.
- **Own your data.** Each test creates what it needs and does not depend on
  another test's leftovers or on order.
- **Control time and randomness.** Freeze the clock and seed generators wherever
  output depends on them.
- **Never skip, disable, or quarantine a test to get green.** Fix it, or delete
  it with a reason when the behaviour it checked was removed.
