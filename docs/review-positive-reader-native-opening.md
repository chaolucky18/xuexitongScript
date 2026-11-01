# Positive-range reader and native opening

PARTIAL. Authenticated evidence: manual knowledge-map scrollbar movement produced
platform credit; programmatic equivalence is not established. Recorded native card
opened a playable zhibo tab manually despite nonstandard openUrl policy.

Reader candidates now require positive range before nested ancestry preference.
A zero-range descendant cannot displace the owned positive-range viewport. The
reader rejects lost/negligible range instead of reporting 100% or local completion.
Existing gradual native scroll, reader identity and platform credit checks remain.
No synthetic scroll events or server-completion calls added.

Native card recognition treats an unapproved/placeholder openUrl destination as
unresolved policy, not missing card. Automatic handling attempts its original
click once per card element; explicit manual controls provide a retry. Popup outcome
is unverified, and the notice requires manual return and credit confirmation.

NOT IMPLEMENTED: binding a newly native-opened child without a captured WindowProxy,
new session handshake, automatic close/closure confirmation, one-time refresh and
automatic return. Existing child/owned-popup/companion protocols were not changed;
no claim is made that arbitrary native-opened replay tabs join those sessions or
receive automatic playback recovery. Missing opener stays a manual workflow.
This is an incomplete delivery of the requested live lifecycle, not a live PASS.

Five targeted simulated cases pass: positive reader vs zero descendant, zero-range
failure, document credit gating, owned video credit, native opening/manual retry.
Build/verify/customization/syntax/diff checks passed. Real reader geometry changes,
programmatic scrolling credit and native popup behavior still require user retest.

## Positive HTML/BODY follow-up (baseline 00ebfc5)

Authenticated trace read the outer 34px shell while the nested owned reader
remained at zero with 1789px range. Candidate elimination previously happened
before positive-range filtering: fitting BODY could eliminate scrollable HTML.
Require positive range before innermost selection; admit actual HTML/BODY roots
without requiring CSS overflow:auto. Owned iframe ancestry still excludes outer
shells. Pending src/srcdoc initialization delays commitment. New default document
pauses are 300–1000ms; native 40–120px steps and saved custom settings remain.

Five targeted simulated cases pass, including real nested HTML/BODY geometry,
zero-range rejection, document credit gating, delayed rendering and owned credit.
Build/verify/customization/syntax/diff checks pass. Real-site credit remains untested.

GM lifecycle NOT IMPLEMENTED. The current artifact remains @grant none with its
page globals and existing manual replay fallback intact. Its headless page-world
harness cannot validate the required Tampermonkey isolated-world/page-global
integration. No GM APIs, grants, claim/ack protocol, close confirmation or refresh
path were added or simulated. This is a partial delivery, not completion of task B.
A verified single-userscript sandbox integration is still needed before claiming
no-opener session playback/closing/return works. Existing evidence is preserved.

## GM native replay lifecycle implementation (baseline 0c07d13)

The previous unimplemented status remains historical; this iteration adds the
main-script lifecycle. One generated userscript now requests @sandbox raw,
unsafeWindow, GM value/listener APIs and window.close. Official semantics checked:
https://www.tampermonkey.net/documentation.php?locale=zh.+CN&q=sandbox
https://www.tampermonkey.net/documentation.php?ext=dhdg&q=grant&version=5.1.0
The wrapper explicitly uses unsafeWindow for page globals and the page jQuery
function. GM operations remain lexical capabilities; no general message-to-GM
RPC or global window.open interception was added. Missing GM capabilities retain
ordinary app initialization/manual fallback. Real Tampermonkey raw/sandbox behavior
and userscript-manager closing permission still require authenticated testing.

One pending GM record precedes native clicking. Random session/nonce, generation,
course/lesson identifiers, optional class, 120-second claim deadline and four-hour
safe expiry govern claim/parent-ack. Strictly equal course AND chapter/knowledge
URL identifiers are required on both pages; missing identifiers do not permit
pairing by domain or proximity alone. One claim is acknowledged; duplicates,
unrelated URLs, stale generations and expired sessions cannot become completion.
Only whitelisted URL identifiers are stored, never cookies/full/signed URLs.

Positively recognized recorded Video.js pages can initialize without opener.
After ack: native 1.0x play, pause/stall recovery according to background settings,
actual progress plus a subsequent native ended event are required. Already-ended
players, pagehide and early closing are not completion. Parent heartbeats guard
orphaned sessions; lost communication stops control instead of inventing success.
The optional companion protocol is not used or modified by this workflow.

One ended result precedes a delayed self-close attempt. A surviving replay shows
manual-close instructions; neither calling close nor pagehide proves closure.
The parent independently checks credit after settling, permits one persisted
session-bound refresh, restores verification only and never reopens that session.
Absent credit after refresh stays on the lesson; actual credit enters the existing
completion-first/five-second navigation pipeline. No server progress is fabricated.

Checks: node tests/gm-live-v3.mjs: four focused mocked-GM scenarios pass (no opener,
claim/ack, duplicate/expired/unrelated rejection, ended, early exit, denied close,
credit gating and single refresh). Six filtered Chrome navigation cases pass,
including GM-capability/page-global initialization and frozen audio/document/video
behavior. Build, verify-v3, customization-v3, syntax/diff checks pass. A direct source
comparison confirms frozen reader/audio/recovery/credit/rebinding/navigation method
bodies unchanged. No full historical suite run or authenticated PASS claimed.

Retest real URL identifier availability, Tampermonkey GM raw integration, popup
policy, Video.js recognition, natural end/credit propagation, self-close permission,
background throttling and guarded reload. Closure cannot be independently proven
without a retained child reference; the course relies on ended plus platform credit.

## Session recovery correction (baseline 7389916)

Cancelled/expired attempts and timed-out pending attempts are recoverable only by
explicit retry. A new random session/nonce replaces the inactive attempt and clears
stale claim/pulse keys. Active matched children are protected before manual task
cancellation changes generation. Completed/verify/done states retain their return
and single-refresh guards, including after expiry; they never become replay retries.

Child heartbeats use a separate per-session value (nonce, child, timestamp, sequence),
not the parent's heartbeat. Three minutes without a valid child pulse cancels the
attempt without credit. Pending pairing still times out after two minutes. Recovery
releases the manual-busy lock; it does not automatically reopen any replay. Parent
notices now describe GM pairing rather than unconditionally demanding manual return.

Seven focused GM scenarios pass, including blocked-popup retry, pending timeout,
missing child, protected active child, expiry replacement, terminal guards and the
existing claim/ack/natural-ended/close/refresh sequence. Mocked timers/storage do
not prove real tab closure or Tampermonkey background heartbeat behavior. Browser
throttling beyond the liveness bound can cause a conservative cancellation, never
successful completion. No reader/audio/video/catalog/navigation implementation was
changed; only the live retry guard and live notices accompany the GM state changes.

## Bounded unattended startup recovery (baseline 9fa73c7)

Authenticated passes now include native opening, no-opener GM pairing, 1.0x replay,
ended detection, self-close and parent refresh. The end test used manual seeking;
it proves technical lifecycle only, not full-duration credit. No seeking was added.

Parent startup now replaces only safely stale cancelled/expired/abandoned attempts
automatically, with one durable GM recovery allowance per course/lesson in a
10-minute startup cycle. Fresh pending/claims and active children are retained.
Repeated run/reload may adopt the same parent session identity without reopening;
a parent-instance token retires old watchers instead of cancelling the adopted
session. Manual retry remains possible after the allowance is spent. Completed,
verify and done records retain existing terminal and refreshUsed protections.

GM-authorized opening is once per new session rather than blocked by the old
per-DOM-element open cache. Missing matching identifiers still requires explicit
manual action. Notices distinguish recovery, requested opening, pending pairing,
claim timeout and possible popup restrictions without asserting a popup was blocked.

Eight focused GM scenarios pass, including reinjection/generation adoption,
first startup, single automatic stale recovery, pending/active preservation,
manual fallback, terminals and existing natural-end/credit/refresh paths. Build,
verify/customization/syntax/diff checks pass. Replay controller, claim/ack matching,
closing, return-credit/refresh, audio/document/video/navigation bodies are frozen.
Authenticated unattended startup and Chrome popup policy still need retesting.


## Randomized task pacing and periodic rest (2026-10-29)

Baseline: `4a12681af987e1d73ae57c219835db98949a2443`. Overall status remains **PARTIAL** pending authenticated testing.

### Stage 1 — Configuration and scheduling

- Canonical `nextContent`: 3000–7000ms; `nextLesson`: 2000–8000ms; `nextChapter`: 3000–8000ms, inclusive integer samples.
- Removed fixed 5000ms navigation override. Preview receives the scheduler's exact absolute deadline; no separate preview wait. Assessment deferral uses actual chapter routing once; verified GM return uses the same lesson/chapter route.
- `nextVideo`/`nextAudio`/`nextDocument` delay aliases resolve to `nextContent`; their duplicate range fields are hidden. Their existing feature switches remain. Document scroll intervals remain unchanged and are reading operations, not another transition delay.
- Settings key remains `xuexitong.v3.action-settings.v1`. One-time `pacingVersion:1` migration updates the three approved ranges, adds independently enabled rest defaults, preserves unrelated feature/range preferences and selects `custom` so the old legacy override cannot defeat migration. Users may explicitly select legacy afterward.
- Rest settings: enabled; task target 3–6; duration 300000–420000ms. Changes cancel affected pending execution; explicit rediscovery resumes. Active deadlines are not rerolled when ranges change. Disabling short delays removes remaining ordinary waiting after rediscovery but leaves rest intact. Disabling rest ends that pending rest and resets the work cycle on explicit resumption. Restore Defaults resets preferences, not completion history/deadlines.

### Stage 2 — Isolated coordinator

`createTaskPacingCoordinator` owns count, quota, course-local completion ledger, pending boundary, consumed marker and absolute rest deadline. Execution, cancellation, page watches and revalidation remain in the existing action scheduler. Completed deadlines have one-shot consumption; Stop does not delete accounting or schedule automatic resumption.

Storage is namespaced by course ID. It contains course/lesson IDs, content kind and verified inventory ordinal, or GM session ID; no titles, full URLs, signed media URLs, cookies or account information. Owned inventory recognition is reused, without changing player selection. Unidentifiable content is not counted; changed recorded inventory stops pacing for manual review. Ledger is capped at 4096 entries with explicit local cleanup, rather than eviction that could recount replayed content. Corrupt storage or failed writes stop automatic paced transitions with a diagnostic. Cleanup is an explicit stopped-user action and intentionally removes deduplication history.

### Stage 3 — Minimal hooks

- Owned, context-validated natural video/audio ended: records once before existing verification.
- Owned document's existing verified-bottom callback: records local reading only, without inventing platform credit.
- GM parent `returnCredit`: records session only after the existing natural-ended terminal path and positive platform proof. Child pairing/playback/close implementation is unchanged.
- Within-lesson starts pass one content gate; navigation passes one lesson/chapter gate. Due rest replaces ordinary delay. Refresh/reinjection restores the deadline; an elapsed rest resumes without a short delay. Reconstructed identities are rediscovered and validated, not used to restore old closures.
- Platform-controlled content already playing is not paused; notice explicitly says that transition was not delayed, with rest preserved for a later controlled boundary.
- Existing Chinese notice shows count, exact three-decimal waiting time or absolute rest countdown. Timer throttling can delay execution; millisecond sampling does not guarantee millisecond execution accuracy.

### Stage 4 — Focused evidence

Commands actually executed:

```text
node scripts/build-userscript.mjs
node tests/verify-v3.mjs
node --check v3_optimized.js
node --check tests/task-pacing-v3.mjs
node tests/task-pacing-v3.mjs
  RESULT: 6 focused synthetic pacing groups passed
node tests/customization-v3.mjs
  PASS: fixed 1.0x configuration, assessment detection, unknown-content safety
node tests/gm-live-v3.mjs
  RESULT: 8 focused GM lifecycle checks passed
TEST_FILTER="^pacing|^GM raw|^audio bounded|^knowledge map real|^controls owned document"
node tests/navigation-v3.mjs
  RESULT: 8 passed, 0 failed; Chrome 156, headless, simulated media/timers, network blocked
```

Tests cover sampled bounds, five independent contents, skipped/duplicate evidence, reload/deadline recovery, no stacked rest delay, live-session deduplication, settings migration, Stop/stale timers, actual natural-ended integration and preview/action deadline agreement. The existing GM raw browser case now runs on its synthetic HTTPS origin: `crypto.randomUUID()` is unavailable on the prior insecure blank page. No GM production logic was changed to satisfy that test.

Exact baseline body comparisons also passed for audio rejection/fallback, pause/stall/background guards, document-context validation, attachment credit, navigation eligibility, native opening, catalog navigation and the entire GM child implementation. Full historical suites were not run.

Authenticated acceptance still needed: actual 3–6 task cycles across mixed attachments, long rest through refresh and live return, settings changes while resting and platform-controlled autoplay timing. Ordinal deduplication relies on the unchanged owned inventory; identity-ambiguous layouts fail conservatively. Pacing data is local to the course origin/browser profile, not synchronized across unrelated origins or browser profiles. Multiple simultaneously automated course tabs are not a supported pacing coordination mode.


### Stable native-live pacing identity correction (2026-10-29)

Baseline: `7faceb2858e0e08cd674ddf6cb079f7d23dea3a9`. `_recordPacedLive` now reuses the existing native-card discovery/ownership validator on the current course-card document. Counting requires matching course and unique catalog lesson, a valid owned scope and exactly one native-live task. Its persistent content key is `{course, lesson, kind:"live", inventory:"live", ordinal:0}`; random GM attempt IDs remain exclusively in the unchanged lifecycle protocol. Multiple or unverifiable cards do not contribute a task. If the platform removes the card before credit verification, accounting conservatively omits the item and reports that limitation rather than guessing.

The hook remains exclusively inside the existing positive platform-credit branch after the terminal replay lifecycle. No pairing, playback, close, refresh, popup, delay or navigation logic changed. Previously counted legacy live/session entries in the same now-verified unique-card lesson suppress recounting after upgrade; historical overcounts are not retroactively subtracted.

Focused verification: `node tests/gm-live-v3.mjs` — 9 passed, including two distinct naturally ended/credited GM sessions counting once, a different unique lesson counting separately, media-kind separation, ambiguous/invalid scope rejection and legacy-record suppression. `node tests/task-pacing-v3.mjs` — 6 groups passed. Build and `node tests/verify-v3.mjs` passed with synchronized generated payload. These are synthetic/mocked results, not authenticated platform acceptance. Overall status remains PARTIAL pending user testing.


### Prior-completion catalog reconstruction repair (2026-10-29)

Baseline `90f89a06135503bb1c169ac4fbcf379e8789dd0c`. Code and synthetic reproduction confirm that `_schedule` rejected detached prior-credit nodes before the task-specific verifier could run, and that the verifier rebound only a temporary clone. `_schedule` now accepts an optional task-specific validator, used only by the 250ms prior-platform-completion callback. Other callers retain the original stale-node guard. `_priorCompletionValid` validates a detached-node candidate completely before updating the original record and completion reference; it retains route, generation, topology, title, fresh credit and contradiction checks, requires the original content document, and rejects replacement of a connected chapter. `_checkPriorCompletion` consumes the rebound record rather than captured obsolete nodes.

Focused checks: 11 selected browser simulations passed (same/different/duplicate catalog identity, no new task count, unchanged pending deadline, pacing, audio, document/knowledge-map and ordinary video); 6 pacing groups and 9 GM lifecycle cases passed. Build/synchronization and syntax passed. Tests explicitly invoke the captured 250ms callback between DOM replacement and unrelated lifecycle callbacks. No reader, media, GM, pacing or eligibility implementation was changed. Authenticated DOM replacement remains a supported hypothesis; actual lesson navigation requires user retesting. STATUS PARTIAL.


### Completed live and attachment readiness repair (2026-10-29)

Baseline `24c7d3b9b578730c9616280902a4a4ffc4923adb`. Positive platform credit on a matching done GM session now releases startup to ordinary prior-completion handling without stopping, reopening, counting or refreshing. Missing credit stops with an inconsistency notice. begin's fresh terminal branch re-enters the existing prior-credit check, not a recursive run.

Added `_classifyAttachmentReadiness` and `_waitForAttachmentReadiness`: only pending recognized attachment iframes with observable loading/initial about:blank evidence qualify, with a 10-second limit and existing generation/identity cancellation. Unsupported/inaccessible or unknown reason combinations remain blocked; no assumption that access failures are temporary. Prior-credit processing defers while that positive loading evidence exists, then resumes existing play/prior-completion checks. This deliberately does not claim to fix unidentified authenticated unsupported/inaccessible reasons.

Evidence: 12 selected browser simulations, 10 GM lifecycle checks and 6 pacing groups passed; build/synchronization passed. The new readiness test covers classification, not a complete authenticated loading-to-credit transition or every timeout/cancellation scenario. Frozen reader/media/pacing/GM-child implementations were not edited. STATUS PARTIAL: real completed-live continuation and document failure require user retesting, preferably with actual media reasons when still blocked.


### Follow-up terminal routing and document-only readiness (2026-10-29)

Baseline `38c656987f7495b9618094da9c6dab183757065a`. The FIRST reachable GM begin terminal branch now delegates fresh done+credit to the existing prior-completion verifier, with safe stopping if it remains inconclusive. restore still releases ordinary startup; no replay, recount or second refresh. The earlier duplicate terminal block remains unchanged to avoid altering pending/active recovery paths.

Document-only loading no longer depends on media.pending. Classification uses platformTaskAdapter scope validation and documentViewer loading on recognized owned PDF boundaries. Unknown unsupported/inaccessible reasons remain blocked. WAITING_ATTACHMENT is included in play's waiting guard. Attachment failure notices include up to five restricted-format reason codes, never URLs or page data.

Executed: 10 GM lifecycle cases (including restore AND begin done routing), 6 pacing groups, 12 selected browser cases plus 3 Stop/route/timeout readiness cases passed. The classifier fixture now uses an actual native PDF boundary and loading inner document, pending=false. Build/source synchronization and syntax passed. Remaining test limitation: completed loading-to-credit and incomplete loading-to-reader are not newly covered end-to-end; existing completed-credit and actual document reading cases pass separately. The authenticated underlying media reasons remain unknown, so real-world coverage is PARTIAL. Frozen scrolling/media/GM child/pacing implementations were not edited.


### Document entry-credit and observation lifecycle (2026-10-29)

Baseline `10363532f5cb1dd05500e17cf4df8612ab8f807c`. `_observeCredit` now supplies its own stable route/ID/title/chapter/topology/document validator to `_schedule`, rebinding its actual observation node only when the original is detached and the replacement unique. Generic timer guards remain unchanged. `playCurrentIndex` captures the target's pre-click authoritative status; `_checkPriorCompletion` defers historical skipping for matching non-completed entry snapshots with owned unprocessed documents. Actual reading and genuine bottom callbacks remain unchanged. Historical already-green lessons retain normal skipping. Snapshots are in-memory; a full reload without the pre-entry observation cannot establish the origin of historical credit.

Four new browser simulations passed: on-entry green positive-range document still reads; same/different/duplicate observation reconstruction. Eleven selected prior/media/pacing browser regressions and ten GM lifecycle checks passed; six pacing groups and build/synchronization passed. Exact reader/pacing/GM-child source comparisons passed. New document test verifies reading starts and advances, but is not an authenticated full-bottom session; the existing bottom tests remain separate. STATUS PARTIAL pending actual platform retest. The authenticated catalog replacement event remains a hypothesis, while the scheduled-node defect is reproducible synthetically.


### Unattended-recovery request: partial click-cancellation correction (2026-10-29)

Baseline `a3099858781b1f3d550a9b6400389dfda3f3247e`. The pending-action click watcher now requires event.isTrusted before treating a click as user cancellation. Programmatic clicks do not themselves cancel; existing mutation/context and route validation remain unchanged. Seven selected browser simulations passed, including a generated click preserving the deadline followed by an actual trusted mouse click cancelling. Six pacing groups and build/synchronization passed.

This is only the source-backed false-click fix. The requested three-attempt recovery coordinator, durable tab-scoped budget, guarded reload, sustained-progress reset and persisted Stop/Resume protocol ARE NOT IMPLEMENTED. Existing failures can still require manual recovery. No unattended-recovery acceptance is claimed; the task remains incomplete and PARTIAL. No playback, GM, reader, pacing or credit implementation was changed.


### Bounded unattended recovery implementation (2026-10-29)

Baseline `2b444b2c4f81d9ec65bf2b4593f83bd654770806`. Added isolated createUnattendedRecoveryCoordinator and typed action cancellation. Watchers distinguish trusted user interaction, stale context, frame replacement, route and unload. Generated clicks remain non-cancelling; mutations cancel only on existing validation failure. Scheduler stale-fire cancellation is typed context-stale.

Session key xuexitong.v3.unattended-recovery.v1 stores version, verified course/class/lesson context (plus title/topology/route path), attempts, stage, reloadUsed, safe reason, stopped and cycle. No media URL or credentials. Attempts are persisted before one-second stabilization/action. Stage 1 rediscovery uses play; stage 2 uses run; stage 3 reloads once. Fifteen-second unresolved observations authorize subsequent attempts, never unconditional chaining. Reload/reinjection does not reset attempts. Invalid state fails stopped. A changed lesson gets an independent sequence. Explicit Stop handlers persist the marker; internal stopAutomation does not. Resume clears the marker explicitly. Page/route events cancel timers; destruction disposes them.

Recovery is allowed only for typed stale/frame/readiness failures with current unique task context, no unsupported/inaccessible/assessment/verification evidence, no competing/active media, no active document/live, no rest/credit/navigation. Reload also refuses an entry-credit snapshot or external/platform completion record. If unsafe, no reload is attempted. Media progress requires the currently selected owned player advancing across 3–10 seconds, paused/seeking false and plausible rate; real document progress and genuine task completion also reset the sequence. Pacing algorithms are unchanged. Monitoring polls do not count tasks.

Executed: deterministic coordinator test covers attempts 1/2/3, no fourth attempt or second reload, reinjection budget, persisted Stop, Resume, rejected unsafe recovery and progress reset. Six pacing groups, ten GM cases and twelve selected browser regressions passed. Exact reader/pacing/GM-child body comparisons passed. Build/synchronization passed. Browser recovery stages with actual reload, long-running progress and Tampermonkey remain unverified; tests of coordinator policy are mocked. Overall authenticated acceptance remains PARTIAL.


### Recovery review control-flow correction (2026-10-29)

Baseline `93f17b8db65ddf51bb260832081f5d3709adb353`. Budget identity now contains only course/class/unique lesson. A separate route/title/chapter/topology fingerprint validates pending recovery execution; it does not renew the budget. Temporarily absent identity retains saved attempts. Restore validates additional persisted fields. During observation, a new safe failure cancels that observer and advances the same sequence; an already waiting attempt returns handled without duplicate scheduling. Terminal blocking cancels and persists terminal recovery state. Storage failure notification is reentrancy guarded. Initial scheduler validation uses context-stale consistently with later validation.

Actual-app regression now exercises initial failed video-start validation, stage-1 retry, a second failure while observation is active, retained budget after cloned catalog and terminal cancellation. Existing deterministic three-attempt/one-reload, persistence/Stop/progress test and six pacing groups passed; ten GM cases passed. Selected browser run passed 12 cases with one storage-error recursion failure; that failure was corrected and the document/recovery cases rerun successfully. Exact reader/pacing/GM-child comparisons passed; build/synchronization passed. Real application reload/reinjection and sustained progress acceptance remain unverified end-to-end, beyond isolated policy tests. STATUS PARTIAL pending authenticated testing.


### Terminal recovery startup and late-progress guard (2026-10-29)

Baseline `ff2592cf4df15037eb45cd07194e3d9a33e0574d`. Shared `_recoveryEntryAllowed` checks restored stopped AND terminal status before bootstrap GM restore/startup, run and play. It displays the requested terminal notice and keeps automatic work stopped. Explicit Resume is the existing reset path. confirmProgress now rejects disposed, terminal, stopped or identity-mismatched callbacks; valid active progress remains accepted. Missing identity retains terminal state; positively changed lesson restores a fresh budget through existing restore semantics.

Actual-app browser simulation persisted attempt-3 terminal state into a fresh page bootstrap, reinjected twice, exercised direct run/play, cloned catalog, late progress and the existing Resume button. Eight selected browser cases passed, including audio fallback, ordinary video, pacing/deadlines and trusted-click cancellation. Audio tests now use a storage-capable synthetic origin and explicitly resume their deliberate retry, consistent with the new terminal rule rather than implicitly bypassing it via app.run. Six pacing groups plus recovery policy and missing/different-identity tests passed; ten GM cases passed. Build/synchronization, syntax and exact reader/pacing/GM-child comparisons passed. Fresh-page simulation transfers stored bytes rather than using a real browser reload; authenticated/Tampermonkey acceptance remains PARTIAL.


### Adaptive per-document traversal (2026-10-29)

Baseline `ec0105633c6998583e00300f9c880702da12a08a`. Shared readDocument samples one integer 5000–7000ms when traversal starts and uses performance.now elapsed/duration against the current positive scroll range. Document-step scheduling uses the existing action scheduler with a 100ms override, independently of transition/rest pacing. Stable real bottom is rechecked after 250ms; blocked scrolling cannot complete on elapsed time alone. Dynamic extent is recalculated each increment. Timer throttling/rendering can exceed the target. No discovery changes or new panView support.

Deterministic tests passed for 80/800/80000px ranges at duration minimum, maximum and a millisecond sample (5382ms), intermediate positions and one draw/session, growing extent, Stop, stale context and unscrollable viewport. Six pacing groups, recovery policy tests, ten GM cases and eight selected browser regressions passed. Build/synchronization passed. Exact discovery/recovery/pacing/GM-child comparisons passed. Historical document tests using frozen wall clocks were not run; new reader tests advance the actual injected monotonic clock. Authenticated timing, lazy-rendered real documents and throttled tabs remain PARTIAL.


### Mixed native-audio module composition (2026-10-29)

Baseline `1f494175915bb17285769c722d5fc44498148c79`. Removed unconditional unsupported-mixed-attachments and primary-autoplay-attribute-only rejection. Actual competing playback remains blocked. `_processSupportedTask` now returns media dispatch for BOTH video and audio pending inventory items, preventing a later document from overtaking earlier audio. Ordered inventory and all ownership checks remain intact. No playback engines were changed.

The obsolete mixed-audio BLOCK expectation was replaced by six actual-dispatch browser scenarios: video/audio; audio/video; audio/document; document/audio; video/document/audio/document; audio/audio/video/document. These drive natural-ended callbacks and monotonic document traversal through successive attachments, retaining the current lesson without platform credit. Scenarios also check two genuinely active players block and inactive recognized autoplay siblings do not. Eight existing selected browser regressions, six pacing groups, recovery/reader tests and ten GM tests passed; build/synchronization and syntax passed. Exact discovery-reader/recovery/pacing/GM-child bodies remained unchanged apart from the intended media inventory policy.

Audio historical credit remains unknown: existing evidence establishes a video-specific wrapper adapter, not authenticated equivalent audio attachment markers. No speculative audio-credit skip was introduced. Thus an audio previously credited only through an unverified attachment icon is not skipped; same-run genuine natural-ended handling remains supported. Authenticated mixed-module acceptance and native audio historical completion evidence remain PARTIAL. No mixed-live support or panView adapter was added.


### Optional compatibility adapters — phases A/B/C (2026-10-29)

Baseline `706a8616981a006abe5ee615fb8dac9b6ebf49a9`. A1 inspected existing owned inventory, dispatcher, document viewer, scheduler, recovery and pacing contracts. A2 reference is OCS branch 5.0, commit da5c0775a9d055724149ff505eae75bd85d334f9, packages/scripts/src/projects/cx.ts (the requested master path is absent). No OCS code was imported or transplanted.

Evidence matrix (all candidate matches are PUBLICLY_REPORTED_STRUCTURE, not authenticated Chaoxing proof):

| Candidate | Public source evidence | Ownership requirement | Operation / completion |
| --- | --- | --- | --- |
| Book | cx.ts lines 81,215,414: insertbook, /readsvr/book/mooc, ReadWeb comment | accessible root-owned ans attachment, book metadata, Chaoxing HTTPS reader route, ReadWeb | Recognition only; native sequential controls and credit unknown |
| Timed reader | lines 376–406: reader, readerPager, pagejump, timing | root-owned attachment, approved reader route, all selectors, integer timing 1–86400s | Recognition only; observed native next-page control and dwell/credit unknown |
| Audio slideshow | lines 1619,2260–2273: swiper-container/swiper-slide and audio | one accessible owned attachment with both structures, no existing handler claim | Recognition only; association, page transition and dual completion unknown |
| Hyperlink | lines 1620,1750: hyperlink | accessible root-owned attachment with hyperlink UI | Recognition only; destinations parsed, unsafe schemes flagged, never opened |
| Flash | line 81: insertflash module | root-owned attachment with explicit module metadata | Unsupported legacy diagnostic; no runtime or credit |

Source: https://github.com/ocsjs/ocsjs/blob/da5c0775a9d055724149ff505eae75bd85d334f9/packages/scripts/src/projects/cx.ts . CONFIRMED_STRUCTURE applies only to inspecting this public source, not live platform DOM. Discussion/interactive categories remain UNVERIFIED_ASSUMPTION and research-only.

B1 adds inspectAdditionalAttachment reporting kind, exact boundary, document/lineage, position, confidence, executable=false, null operation target, diagnostic and scope validator. Existing video/audio/document handlers have priority. Multiple candidate matches return no claim. Recognized new items enter the same ordered inventory but block execution with a manual diagnostic; no new navigation/completion engine. B2–B5 are isolated recognition-only adapters because sequential native controls and platform completion are not evidenced. No guessed controls, page jumps, forced mute, APIs, arbitrary link opening or external runtimes were added. Existing accepted behavior is retained.

C1: one sanitized synthetic fixture and a focused browser group cover five positive structures, existing-handler exclusion, ownership scope and unsafe URL scheme. Fourteen selected browser cases passed including all six mixed dispatcher compositions, normal video/audio, pacing and terminal recovery. Six pacing groups, reader/recovery tests and ten GM cases passed. Build/synchronization and exact frozen reader/discovery/recovery/pacing/GM-child comparisons passed. New page/slide execution is unavailable by design: no transitions or completed tasks are claimed. Negative near-match/ordering matrices and authenticated new-type layouts are not exhaustively tested. STATUS PARTIAL pending actual platform evidence; no new executable reader type is claimed.


### Phase C1 actual discovery integration correction (2026-10-29)

Baseline `9037328c4d0bb44fb31a046c9d85a5b5d1856374`. New tests use actual iframe src attributes, same-origin routed HTTPS documents, and the real videoAdapter inventory/application run. Five adapter groups verify manual-specific diagnostics, no navigation/counting, existing video/audio/document siblings retaining ownership/order, missing required selectors, unrelated UI, invalid metadata, inaccessible documents, stale lesson and detached owner. The missing-selector case for selector-free legacy Flash instead removes required metadata. Network routes serve local synthetic markup under the course origin; this is not evidence that cross-origin live platform readers are accessible.

Tests exposed a concrete defect: additional task scope only validated owner/document, allowing the captured task to remain valid after lesson replacement. Production change is limited to wrapping that scope with captured lesson ID/node uniqueness and current course frame/document. Existing modules are unchanged. Thirteen selected existing browser cases passed; all five expanded integration groups passed after correcting a test-only Document/body insertBefore mistake. Six pacing groups, recovery/reader policy checks, ten GM cases, build/synchronization and syntax passed. Exact frozen discovery/reader/recovery/pacing/GM-child bodies compare equal. Recognition-only tasks create no operations or completion signals. Explicit replacement-owner and full cross-origin sandbox matrices remain limited to detached/unavailable scope cases; no authenticated compatibility claim. STATUS PARTIAL pending real-platform acceptance.


### First delivery batch: A1/A2/A3/C1 only (2026-10-30)

Baseline `9ab8a42cc642a964c7a5423e84f0773380586ac5`. PARTIAL EXECUTION IS NOT YET ENABLED. No active dispatcher or navigation gate was relaxed.

A1 audit: discover produces global unsupported/inaccessible/pending/navigationSafe; `_discoverMedia` additionally rejects inventory mutation. `_discoverAttachmentTask`, `_processSupportedTask`, play and `_getVideoEl` depend on that discovery; `_refreshVideoContext` retains selected player/frame identity. `_continueCompleted` and `_verifyExternal` reject unknown or unsafe inventory before existing progression. `_navigationEligible`/`_externalNavigationEligible` retain whole-lesson credit and complete required task checks. `_checkPriorCompletion`/`_priorCompletionValid` retain established authoritative historical credit. `_pacedIdentity` and recovery also reject unsafe media. These gates are intentionally untouched.

A2/A3: added read-only `_planningSnapshot()` backed by createLessonPlan. Original discover output remains authoritative; the planning view includes separately root-owned unknown frames without changing active inventory. Classes are EXECUTABLE_KNOWN, DEFERRED_RECOGNIZED, DEFERRED_UNKNOWN, LOADING and GLOBAL_UNSAFE. Unknown/manual reasons may be localized only in the planning view after accessible independent frame boundaries and stable lesson/course are verified; extra/unassigned frame documents, root non-attachment content, active media, verification and all other unsafe reasons yield global unsafe. The returned objects/arrays are frozen; DOM references are in-memory only. Scope invalidates on route/lesson/title/chapter/frame/document/owner/order changes, duplicate IDs, access failures and changed safety outcome. Executable means candidate eligibility for future integration, never authorization now.

C1: createDecisionJournal exposed internally as `_decisionJournal`; append/read/clear plus ephemeral reference(input). Stored format `{version:1,events:[...]}` contains timestamp, random session/opaque lesson refs, ordinal and allowlisted type/kind/reason/evidence only. References are random UUIDs, not raw or reversibly encoded IDs. Unrecognized fields and free-form text are rejected. Pruning filters age over 7 days and retains newest 200 within conservative UTF-16 128KiB cap. Consecutive equivalent polling events deduplicate. append returns durable only after write/readback confirmation; failure returns explicit false. No execution, completion or navigation logic reads journal history; no automatic logging/dispatcher crossing is enabled yet. Failure to initialize diagnostics is isolated from normal playback.

Tests: nineteen selected actual-browser integration/regression groups passed, including known video/audio/document classes, isolated unknown and recognized types, active-media/inaccessible global unsafe, lesson/owner/order invalidation and unchanged blocked runtime. Six pacing groups, recovery/reader tests, ten GM cases and journal reload/age/count/size/dedup/privacy/storage-failure tests passed. Synthetic pages only, not authenticated Chaoxing acceptance. Explicit UI and complete lifecycle/event emission are out of this batch. Conservative root ownership excludes layouts not yet provable; no new executor or completion authority.


### First-batch review corrections: classification continuity and journal provenance (2026-10-30)

Baseline `8c6574050eaaa6232c95a04e74f08de9c807a28f`. Only createLessonPlan and createDecisionJournal production bodies changed. Snapshot scope now compares refreshed kind, classification, execution eligibility, reason, relevant module/type metadata and selected media target; same-frame selector loss or recognition transitions invalidate old snapshots. Incidental text is not compared. Managed single media is allowed only with matching selected player, active app, lesson/player context, generation, player document and unchanged source. Seeking, unowned activation and competing players remain unsafe. Root wrappers are restricted to ans-attach-ct with exactly one owner and one ans-job-icon and no unexpected direct children/nested wrappers, matching existing verified wrapper fixtures.

Journal append rejects caller timestamp/session fields and assigns generated values after caller data. These are local provenance constraints, not cryptographic authenticity or protection against page/localStorage tampering.

Focused verification: 21 selected actual-browser simulated groups passed, including known managed video/audio paused-to-playing continuity, metadata mutation, verified/misleading wrappers, five recognized structures losing selectors/metadata in the SAME document, unknown/active/inaccessible classification and existing compositions/terminal recovery/pacing. Six pacing groups, reader/recovery/journal tests, reserved-field override tests and ten GM cases passed. Build/synchronization and syntax passed. Full source comparison outside the two factories is exact: no original execution/navigation gate changed. Unknown-to-known and all possible platform wrapper permutations are not exhaustively tested; layout support remains deliberately narrow. PARTIAL EXECUTION REMAINS DISABLED. Authenticated acceptance remains PARTIAL.


### Second batch B1/B2/B3/C3 partial-session integration (2026-10-31)

Baseline `e0c414497a2c091515a1356549d64870fbae5c07`. Added per-lesson `_partialSession`, `_partialSelect`, `_partialEvent`, `_waitPartialTasks` and internal `recheckCurrentLesson`. Sessions require a fully validated planning snapshot with deferred tasks, no global hazard and no pre-existing whole-lesson credit. Raw discovery unsupported flags are preserved. The local media view carries explicit `localExecutionEligible` only under validated session scope; execution/context/completion gates recognize that scoped exception while navigation has an independent unconditional session veto. Current completion context may be inspected after known tasks finish, but waiting state permits no new task start. Existing all-known behavior stays on its original path.

Selection traverses original ordinals. Every crossed deferred boundary requires durable TASK_DEFERRED confirmation before later known work; unknown stays unresolved. Decisions are remembered only in the in-memory session, never read back as completion. Known pending tasks remain ordered. Local pacing identity uses original inventory position, not filtered-list index. Deferred tasks add no rest completions. Managed audio startup is accepted by the planner only with its existing selected-player context, without changing audio playback implementation. Known loading does not become deferred; it is routed to existing bounded startup observation.

After all eligible known tasks, WAITING_MANUAL_TASKS cancels recovery observation and reports unresolved ordinals. nextUnit and both navigation eligibility paths reject active partial sessions. Opportunistic green credit cannot release that veto. Explicit recheck validates current plan; fresh authoritative whole-lesson credit releases the session to existing prior-completion navigation; without credit it stays waiting or processes remaining known work. Historical green lessons bypass partial-session creation. No per-unknown attachment credit is fabricated.

Journal events include inventory, recognition, durable deferral, continuation, task start, local completion, observed platform-credit skips, invalid context/global blocking, manual recheck and manual waiting. No URLs/text/account data are added to journal. Existing append allowlists/privacy/caps unchanged. Diagnostic clear does not modify completion sets. Stop revokes the session and suspends recreation until explicit run. A separate tab-local partial-pause marker records only course/lesson context (not DOM/local-ended evidence); startup after matching refresh pauses for explicit recheck rather than replaying journal history. Corrupt marker fails paused. This is a pause guard, not execution/completion authority. No diagnostic settings UI was added.

Focused evidence: 19 selected browser simulations passed: all requested ordered unknown patterns, recognized Flash handoff, six all-known compositions, no navigation without credit, no additional unknown task count, journal clear and manual recheck without/with simulated platform credit, required journal storage failure, audio fallback, ordinary video, pacing/rest and terminal recovery. Six pacing groups, adaptive reader/recovery/journal tests, ten GM cases, build/synchronization and syntax passed. Exact document discovery, shared reader, journal, recovery factory, pacing and GM-child comparisons passed. Existing positive-only recognition tests that expected global blocking are superseded in this batch only where safe partial sessions apply; a complete historical browser suite was not run.

Remaining verification: actual refresh/reinjection pause behavior for partial sessions, every owner-replacement/cross-origin/security combination and full deferred recovery event diagnostics are not exhaustively integrated-test covered. The C2 UI and D final acceptance remain out of scope. Scoped partial execution is enabled for verified independent accessible inventory only; authenticated platform acceptance remains PARTIAL. No new module executor, guessed completion API or direct catalog navigation was added.


### Partial-session lifecycle review corrections B3/C3 (2026-10-31)

Baseline `4cd9f48c54ea2b3045defe949756fca8ee7e5d1b`. Three targeted changes:

1. Explicit recheck independently constructs a fresh planning snapshot; it validates original course/lesson/title/topology when the original session remains, plus saved pause identity and current unique safe scope. It never transfers old owners. It cancels old actions; without authoritative whole-lesson credit it remains waiting, with credit it clears the pause and enters ordinary run/prior-credit verification. Newly discovered incomplete tasks after manual replacement conservatively remain manual rather than automatically replaying prior work.
2. Normal run checks the unresolved pause BEFORE resetting completion sets and drops stale authorization only after that gate. Repeated run/Stop/run stays waiting and cannot silently replay known work. Explicit recheck is the only pause-release path.
3. Shared `_partialPauseApplies` is used by boot and run. Missing/unreliable current lesson identity and malformed markers remain paused. A positively verified unrelated course/lesson removes the old marker. No local-ended evidence is stored or restored; pause consumes no recovery budget.

Evidence: thirteen partial/composition/storage cases passed, including unknown owner replacement before both no-credit and positive-credit recheck, repeated run/Stop/run, journal clear, and userscript reinjection with unchanged play counts. Eight selected ordinary/recovery/pacing browser cases passed, including a real page.reload() with the active catalog node deliberately absent at bootstrap, then appearing later; startup remained waiting and attempt count remained zero. Six pacing groups, recovery/reader/journal checks and ten GM cases passed. Build/synchronization and syntax passed. Exact document discovery, reader, journal, recovery, pacing and GM-child bodies are unchanged. No C2 UI or adapter added. STATUS PARTIAL pending authenticated platform acceptance; simulated platform credit and synthetic documents do not prove real-site behavior.


### B3 explicit recheck with removed completed attachment owners (2026-10-31)

Baseline `e2d33dcd1e529b624dafddbb19cedb9ca9139c6b`. recheckCurrentLesson now separates catalog/lesson identity validation from fresh local-execution planning. Positive authoritative credit is checked through the existing `_priorCompletionValid` before releasing pause into ordinary run/`_checkPriorCompletion`, even if attachment owners disappeared. It rejects activity/seeking, verification, inaccessible frame conditions, duplicate IDs, course mismatch and changed original session route/frame/document/title/topology. The session now captures route in memory for that validation. No-credit paths remain manual waiting; missing owners never count as completed or authorize execution. createLessonPlan remains unchanged and conservative; no direct nextUnit call was introduced.

Six new actual-app browser scenarios passed: removed owners with credit, no credit, password verification UI, duplicate active catalog IDs, wrong course, and active independent audio. Pacing count remains zero. Nineteen partial/composition/reload/recheck cases passed in the targeted run; thirteen playback/pacing/recovery and new-boundary cases passed after final route guard. Six pacing groups, reader/recovery/journal tests and ten GM cases passed. Build/synchronization/syntax passed. Exact whole-source comparison confirms runtime unchanged outside recheck and the session route capture. Removal remains a source/test boundary, not an authenticated layout observation. STATUS PARTIAL pending real Chaoxing acceptance. No C2 UI or new executor.


### Final batch C2/D1/D2/D3 diagnostics and integration (2026-10-31)

Baseline `94b26728e3350438645bc59f6476610f5c6927ab`. Existing settings panel now contains one collapsible 任务记录与诊断 section. It reports current partial-plan classifications, unresolved positions/reasons, local processed count and separately observed catalog credit. A stale/unavailable in-memory partial plan displays 等待重新检测；不能从历史日志恢复完成状态. Normal all-known lessons without an active partial plan are deliberately shown as inventory unavailable, rather than reconstructing completion from history.

Trusted user controls: 复制诊断报告 uses native clipboard with a visible readonly selectable textarea fallback; 清除诊断历史 invokes journal.clear only; 重新核对当前小节 calls existing recheckCurrentLesson without clearing markers or directly navigating. Copy exports version 3.4.0, generation time, opaque report session, current state, sanitized task summaries and allowlisted chronological events. It does not export lesson/course IDs, URLs, body content or HTML. Dynamic text uses textContent. Diagnostic refresh errors cannot interrupt ordinary safety notices/playback. No extra panel or persistent logger was added.

Code review exposed inaccurate evidence labels in `_partialEvent`: TASK_LOCAL_COMPLETED had owned-inventory evidence. It now uses local-operation; TASK_PLATFORM_CREDITED uses platform-marker. Natural-ended processing never emits platform-credit status on that basis alone. Existing journal schema/privacy/caps remain unchanged.

Executed browser groups: 29-case composition/recognition/planning/manual-recheck/reload/UI run passed after correcting a diagnostics read() assumption exposed by the intentional storage-failure stub. Nine selected runtime/UI/storage regressions passed; five UI/prior-node-rebinding checks passed (these runs overlap, not additive unique coverage). All eleven requested learning compositions are represented, plus the original video/audio pair. UI tests cover exact mount count, unresolved count, secret/token/URL/body exclusion, actual trusted clicks, both clipboard success/failure, clear preserving marker/state, recheck without credit, and copy/clear preserving ongoing media play count. Known task count excludes deferred tasks; completion-event evidence labels are asserted. Six pacing groups, reader/recovery/journal policy tests and ten GM cases passed. Build/source sync, syntax and diff checks passed; frozen document discovery, reader, journal, recovery/pacing factories and GM child bodies are exact.

Obsolete tests asserting BLOCKED for safe recognition-only owners now expect WAITING_MANUAL_TASKS; mixed recognized+known cases allow the approved known execution or bounded loading states, retaining no-navigation/no-count assertions. No expectation was removed to accept unsafe navigation. Full historical navigation-v3.mjs and preserved-v3.mjs suites were not executed: some legacy fixtures rely on old global-block behavior or frozen-time pixel-reader timing. The selected runs and deterministic reader tests are the actual evidence; the complete requested safety matrix is not claimed exhaustively certified. Genuine cross-origin active frames, all storage readback/retention attack variants and authenticated browser compatibility remain unverified. Overall STATUS PARTIAL, with no current failure in the executed post-fix checks.

Usage: expand 学习设置 → 任务记录与诊断. Review local vs platform credit separately. Copy sanitized JSON for diagnosis. Clear removes history only. After manual handling, click 重新核对当前小节; normal existing credit/identity/navigation checks decide whether continuation is permitted. Missing credit remains manual waiting. Never interpret exported history as evidence that a lesson was credited.


### Final D1/D2/D3 attempt — lesson-level blocking diagnostics (2026-10-31)

Baseline `5ee97211889c93c402047eefac3bef90d40fb0e2`. Overall STATUS FAIL: diagnostic correction implemented, complete synthetic acceptance not achieved.

_block now emits GLOBAL_BLOCKED without a partial session using opaque references, fixed unsafe-scope reason, evidence none and explicit `{kind:"lesson", ordinal:null}`. It never persists the raw block message or pretends an attachment identity is verified. Repeated blocks use existing deduplication/caps. Current block appears separately in report.currentBlock and the summary; stored events remain historical only. Failed storage cannot prevent blocking. No execution or credit decision changed.

Four actual-app tests pass for unowned content, inaccessible frames, password controls and failed diagnostic storage; they drive existing bounded readiness retries to the real terminal block. Exports exclude injected secret and URL text.

Historical fixture repairs: customization supplies missing browser storage/URL/lifecycle APIs, explicitly resets its controlled manual retry and tests terminal play reentry as PAUSED rather than silently bypassing it. Optional bridge tests explicitly select/reselect the separate companion adapter rather than assume the native GM path does so. WAITING_LIVE and fail-closed assertions remain. Navigation fixtures use a storage-capable HTTPS origin; named fixture initialization helpers explicitly resume their controlled retry, without changing actual automatic/recovery test assertions. No cases were deleted or filtered in the following complete-file executions.

| Complete command | Final observed outcome |
| --- | --- |
| `node tests/preserved-v3.mjs` | exit 1; FAIL at first assertion |
| `node tests/verify-v3.mjs` | exit 0; PASS |
| `node tests/customization-v3.mjs` | exit 0; PASS |
| `node tests/task-pacing-v3.mjs` | exit 0; RESULT: 6 focused synthetic pacing groups passed; not authenticated browser acceptance. |
| `node tests/bridge-v3.mjs` | exit 0; RESULT: 31 passed, 0 failed; mocked GM storage across openerless Chrome pages; one local WAV natural-ended case; no Tampermonkey or authenticated platform. |
| `node tests/gm-live-v3.mjs` | exit 0; RESULT: 10 focused GM lifecycle checks passed; mocked GM/tabs, not Tampermonkey acceptance. |
| `node tests/native-entry-v3.mjs` | exit 1; RESULT: 2 passed; 17 failed. Synthetic entry/manual-fallback evidence only. |
| `node tests/recorded-live-v3.mjs` | exit 0; RESULT: 21 passed; 0 failed. Synthetic browser evidence only. |
| `node tests/navigation-v3.mjs` | exit 1; RESULT: 387 passed, 148 failed; local Chrome DOM tests, simulated media/timers, no live platform. |

Final navigation: 535 cases, 387 passed / 148 failed (before environment repair: 109/426). Native-entry: 2 passed / 17 failed. Preserved aborts at its first assertion. Task-pacing has six core groups plus six reader/recovery/journal groups. Other counts are shown above. No unresolved suite is labeled PASS.

Failure triage: preserved is a historical whole-source projection mismatch against b880e877 after reviewed runtime changes; checks were NOT blanket-disabled. Native-entry retains old manual-only/no-native-click/BLOCKED expectations, but its 17 failed assertions have not all been independently re-proven or repaired. Navigation's 148 failures include old delay/reader/terminal-state contracts, null-player/callback fixture failures and ownership/credit assertions whose causes remain unestablished. They must NOT all be called harmless obsolete tests. Exact unresolved test names follow. The task is incomplete until these failures are resolved.

Final logs stay local: `D:\Ddoc\ChatGPT\学习通\work\acceptance-last\` for non-navigation suites, `D:\Ddoc\ChatGPT\学习通\work\navigation-storage-origin.log` for the last complete navigation run, and `results-final.json` for consolidated outcomes. Superseded timeout runs were interrupted and do not count as completed final results; repaired bridge file subsequently completed all 31 cases. No logs were uploaded.

D1 matrix (focused synthetic observations, NOT complete certification):

| # | Scenario | Evidence/status |
| --- | --- | --- |
| 1 | Unknown beginning/middle/end | Composition cases pass |
| 2 | Multiple unknowns | Composition passes |
| 3 | Recognized manual type | Recognition and Flash handoff pass; book handoff not certified |
| 4 | All-known compositions | Ordered dispatcher cases pass |
| 5 | Owner replacement | Manual recheck passes; during-play cases incomplete |
| 6 | Same-document recognition | Planning continuity passes |
| 7 | Frame/document replacement | Historical callback failures unresolved |
| 8 | Order mutation | Planning invalidation passes |
| 9 | Lesson/course mutation | Manual mismatch rejection passes; automatic cases incomplete |
| 10 | Duplicate IDs | Snapshot/manual recheck rejects |
| 11 | Valid/misleading wrappers | Planning tests pass |
| 12 | Cross-origin/inaccessible | Inaccessible blocking passes; actual foreign isolation unverified |
| 13 | Managed active media | Planning tests pass |
| 14 | Competing/unowned active | Competition/manual-credit rejection passes |
| 15 | Authentication | Password blocks and diagnoses |
| 16 | Assessment | VM detection passes; historical failures unresolved |
| 17 | Delayed readiness | Full-file failures unresolved |
| 18 | Local completion/no credit | Manual waiting passes |
| 19 | Prior whole-lesson credit | Historical failures unresolved |
| 20 | Recheck credit/no credit | Focused cases pass |
| 21 | Removed owners | Focused cases pass |
| 22 | Stop/Run/reload/reinjection | Partial/terminal cases pass; full lifecycle failures remain |
| 23 | Delayed catalog on reload | Actual page reload pause passes |
| 24 | Stale callbacks | Unit cancellation passes; full navigation failures remain |
| 25 | Quota/write/readback | Failed-store blocking and journal contract pass; not every variant certified |
| 26 | Journal clear | Does not release unresolved state |
| 27 | Recovery budget/terminal | Focused policy/app cases pass |
| 28 | UI controls/privacy | Focused copy/fallback/clear/recheck/privacy pass |

Build/source synchronization and syntax pass. Exact runtime comparison outside journal schema, block logging and diagnostic presentation is unchanged from baseline. Source acceptance: diagnostic correction scoped/tested, overall acceptance incomplete. Synthetic acceptance: FAIL. Authenticated Chaoxing: UNVERIFIED. No master/tag/release/PR/Issue/upstream changes.

<details><summary>Exact unresolved complete-suite failures</summary>

**preserved**

- `AssertionError [ERR_ASSERTION]: all code outside declared controls/document/countdown changes remains identical` — unresolved.

**native-entry**

- `FAIL: built-in profile finds only the unique native card and leaves live disabled by default` — unresolved.
- `FAIL: repeated discovery/run/events cannot invoke the original handler or open duplicate windows` — unresolved.
- `FAIL: manual fallback leaves the registered handler intact and executes its original sequence once` — unresolved.
- `FAIL: asynchronous #openUrl creation remains platform-owned; inspection never reruns the handler` — unresolved.
- `FAIL: inspection follows replacement/dynamic destinations without changing links or business listeners` — unresolved.
- `FAIL: ambiguous/unsupported native entry stops: duplicate` — unresolved.
- `FAIL: ambiguous/unsupported native entry stops: wrong-card` — unresolved.
- `FAIL: ambiguous/unsupported native entry stops: bad-url` — unresolved.
- `FAIL: ambiguous/unsupported native entry stops: duplicate-open` — unresolved.
- `FAIL: disposed native handoff stays inert after destroy; bounded discovery expired safely` — unresolved.
- `FAIL: disposed native handoff stays inert after pagehide; bounded discovery expired safely` — unresolved.
- `FAIL: disposed native handoff stays inert after manual-click; bounded discovery expired safely` — unresolved.
- `FAIL: disposed native handoff stays inert after replace-entry; bounded discovery expired safely` — unresolved.
- `FAIL: disposed native handoff stays inert after change-task; bounded discovery expired safely` — unresolved.
- `FAIL: disposed native handoff stays inert after settings; bounded discovery expired safely` — unresolved.
- `FAIL: disposed native handoff stays inert after bad-destination; bounded discovery expired safely` — unresolved.
- `FAIL: native _blank popup has no opener in tested Chrome; no ownership or course credit is inferred` — unresolved.

**navigation**

- `FAIL permissive inactive preview with errors does not discard the pending fifth PDF: Expected values to be strictly equal:` — unresolved.
- `FAIL diagnostic ordered audio attachments honor independent nextAudio=true: Expected values to be strictly equal:` — unresolved.
- `FAIL audio native primary and inactive secondary preserve fixed speed and marker-gated natural completion: Expected values to be strictly equal:` — unresolved.
- `FAIL multi-attachment document-only startup preserves disabled PDF as pending: Expected values to be strictly equal:` — unresolved.
- `FAIL sidebar assessment remains unanswered and unsupported live remains manual: Expected values to be strictly equal:` — unresolved.
- `FAIL multi-attachment inventory preserves ordered four videos and pending PDF: Expected values to be strictly equal:` — unresolved.
- `FAIL automatic startup has bounded failure and a safe manual retry without stale boot actions: page.evaluate: TypeError: Cannot read properties of null (reading '__plays')` — unresolved.
- `FAIL complex explicit synthetic ownership selects active player and never wakes inactive player: Expected values to be strictly deep-equal:` — unresolved.
- `FAIL complex ownership distinguishes task boundaries from UI: visible-inactive: Expected values to be strictly equal:` — unresolved.
- `FAIL complex ownership distinguishes task boundaries from UI: playing-inactive: Expected values to be strictly equal:` — unresolved.
- `FAIL complex ownership distinguishes task boundaries from UI: no-active-player: Expected values to be strictly equal:` — unresolved.
- `FAIL complex ownership distinguishes task boundaries from UI: unknown-audio: Expected values to be strictly equal:` — unresolved.
- `FAIL complex ownership distinguishes task boundaries from UI: unknown-leaf: Expected values to be strictly equal:` — unresolved.
- `FAIL complex ownership distinguishes task boundaries from UI: wrapper-form: Expected values to be strictly equal:` — unresolved.
- `FAIL complex ownership distinguishes task boundaries from UI: inaccessible: Expected values to be strictly equal:` — unresolved.
- `FAIL complex ownership distinguishes task boundaries from UI: unverified: Expected values to be strictly equal:` — unresolved.
- `FAIL complex ownership distinguishes task boundaries from UI: unclassified-audio: Expected values to be strictly equal:` — unresolved.
- `FAIL complex ownership loss stops old callbacks rather than switching players: Expected values to be strictly deep-equal:` — unresolved.
- `FAIL automatic startup completion and catalog replacement navigate once; complex profile=false: Expected values to be strictly deep-equal:` — unresolved.
- `FAIL automatic startup completion and catalog replacement navigate once; complex profile=true: Expected values to be strictly deep-equal:` — unresolved.
- `FAIL catalog rerender playing: actual next-task click and normal playback: Expected values to be strictly deep-equal:` — unresolved.
- `FAIL catalog rerender before-ended: actual next-task click and normal playback: Expected values to be strictly deep-equal:` — unresolved.
- `FAIL catalog rerender monitor-first: actual next-task click and normal playback: Expected values to be strictly deep-equal:` — unresolved.
- `FAIL catalog rerender after-ended: actual next-task click and normal playback: Expected values to be strictly deep-equal:` — unresolved.
- `FAIL catalog rerender late-marker: actual next-task click and normal playback: Expected values to be strictly deep-equal:` — unresolved.
- `FAIL catalog rerender cooldown: actual next-task click and normal playback: Expected values to be strictly deep-equal:` — unresolved.
- `FAIL catalog rerender cooldown-tree: actual next-task click and normal playback: Expected values to be strictly deep-equal:` — unresolved.
- `FAIL catalog rerender chapter: actual next-task click and normal playback: Expected values to be strictly deep-equal:` — unresolved.
- `FAIL catalog rerender tree: actual next-task click and normal playback: Expected values to be strictly deep-equal:` — unresolved.
- `FAIL catalog rerender chapter-no-ids: actual next-task click and normal playback: Expected values to be strictly deep-equal:` — unresolved.
- `FAIL catalog rerender tree-no-ids: actual next-task click and normal playback: Expected values to be strictly deep-equal:` — unresolved.
- `FAIL catalog rerender cooldown-tree-no-ids: actual next-task click and normal playback: Expected values to be strictly deep-equal:` — unresolved.
- `FAIL catalog rerender nested audition video survives leaf replacement without a chapter ID: Expected values to be strictly deep-equal:` — unresolved.
- `FAIL audition exception permits legitimate ended plus platform marker only: Expected values to be strictly equal:` — unresolved.
- `FAIL audition classification is rechecked when previously inactive audio starts playing: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL private sample-03: inert outer structure and safe fallback: The expression evaluated to a falsy value:` — unresolved.
- `FAIL private sample-04: inert outer structure and safe fallback: The expression evaluated to a falsy value:` — unresolved.
- `FAIL private sample-07: inert outer structure and safe fallback: The expression evaluated to a falsy value:` — unresolved.
- `FAIL private sample-08: inert outer structure and safe fallback: The expression evaluated to a falsy value:` — unresolved.
- `FAIL synthetic 1 videos: dynamic discovery, natural end, platform confirmation: Expected values to be strictly equal:` — unresolved.
- `FAIL synthetic 3 videos: dynamic discovery, natural end, platform confirmation: Expected values to be strictly equal:` — unresolved.
- `FAIL synthetic 4 videos: dynamic discovery, natural end, platform confirmation: Expected values to be strictly equal:` — unresolved.
- `FAIL synthetic duplicate ended and monitor callbacks schedule one completion: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic unsupported multi-tab completion stops: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic navigation target: lock, active-node change and new iframe required: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic navigation not acknowledged: bounded stop: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic destroy cancels callbacks and removes guards: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic conflict: positive unfinished count overrides completed icon: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic user changes chapter before old completion: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic video completion while navigation is pending is ignored: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic course has chapters with 1/3/4 videos, one transition each: Expected values to be strictly equal:` — unresolved.
- `FAIL synthetic stale completion after player replacement cannot navigate: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic unrelated iframe update cannot acknowledge chapter navigation: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic content title changes during completion verification: stop: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic large-directory completion advances leaf 37 to leaf 38 only: Expected values to be strictly equal:` — unresolved.
- `FAIL synthetic cooldown integer milliseconds 5000: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic cooldown integer milliseconds 12000: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic cooldown integer milliseconds 5327: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic cooldown integer milliseconds 9684: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic independent random draw for every eligible navigation: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic duplicate completion and nextUnit schedule only one cooldown: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic cooldown cancellation and stale callback: destroy: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic cooldown cancellation and stale callback: block: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic cooldown cancellation and stale callback: click: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic cooldown cancellation and stale callback: chapter: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic cooldown cancellation and stale callback: title: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic cooldown cancellation and stale callback: pagehide: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic cooldown cancellation and stale callback: popstate: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic cooldown cancellation and stale callback: unsupported-task: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic cooldown cancellation and stale callback: player-replacement: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic cooldown cancellation and stale callback: target-removal: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic cooldown cancellation and stale callback: assessment: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic cooldown cancellation and stale callback: replay: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic cooldown cancellation and stale callback: content-reload: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic cooldown cancellation and stale callback: nested-click: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic cooldown cancellation and stale callback: completion-marker: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic expiry revalidates completion even without a mutation event: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic expiry revalidates task ended state and generation: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic run invalidates stale cooldown generation: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic disabled cooldown navigates without drawing randomness: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic invalid cooldown range 7000/5000 safely blocks: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic invalid cooldown range 1.5/12000 safely blocks: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic invalid cooldown range 0/2147483648 safely blocks: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic cooldown does not weaken fixed rate or background recovery: page.evaluate: TypeError: Cannot read properties of null (reading '__plays')` — unresolved.
- `FAIL synthetic successful cooldown callback cannot navigate twice: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic configurable fixed integer range is respected: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic document scrolls incrementally from start to actual bottom without platform polling: Expected values to be strictly equal:` — unresolved.
- `FAIL synthetic multiple documents finish locally then await navigation cooldown: The expression evaluated to a falsy value:` — unresolved.
- `FAIL synthetic mixed document/video keeps video confirmation requirement: Expected values to be strictly equal:` — unresolved.
- `FAIL synthetic optional chapter-end 章节测验 stays unfinished and targets next chapter: Expected values to be strictly equal:` — unresolved.
- `FAIL synthetic optional chapter-end 章节测试 stays unfinished and targets next chapter: Expected values to be strictly equal:` — unresolved.
- `FAIL synthetic optional chapter-end 本章自测 stays unfinished and targets next chapter: Expected values to be strictly equal:` — unresolved.
- `FAIL synthetic ambiguous/mandatory assessment stops: 身份验证/true/true: Expected values to be strictly equal:` — unresolved.
- `FAIL synthetic ambiguous/mandatory assessment stops: 考试/true/true: Expected values to be strictly equal:` — unresolved.
- `FAIL synthetic ambiguous/mandatory assessment stops: 章节测验/true/false: Expected values to be strictly equal:` — unresolved.
- `FAIL deferred consecutive assessments preserve next learning order; next chapter=false: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL deferred consecutive assessments preserve next learning order; next chapter=true: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL recorded cross-origin popup late platform marker controls parent continuation: Expected values to be strictly equal:` — unresolved.
- `FAIL synthetic live ended: associated child closes, marker then cooldown, normal video resumes: Expected values to be strictly equal:` — unresolved.
- `FAIL synthetic live near-end: associated child closes, marker then cooldown, normal video resumes: Expected values to be strictly equal:` — unresolved.
- `FAIL synthetic blocked popup and cross-origin live entry never retry or advance: Expected values to be strictly equal:` — unresolved.
- `FAIL synthetic true live session-finished evidence hands off without invented duration: Expected values to be strictly equal:` — unresolved.
- `FAIL synthetic finished video bypasses only trailing optional assessment into next chapter: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL synthetic finished document bypasses only trailing optional assessment into next chapter: Expected values to be strictly equal:` — unresolved.
- `FAIL synthetic live closure never closes an unrelated tab: Expected values to be strictly equal:` — unresolved.
- `FAIL synthetic assessment-only chapter defers without changing unfinished status: Expected "actual" to be strictly unequal to:` — unresolved.
- `FAIL synthetic verification inside an optional assessment prevents handoff: Expected values to be strictly equal:` — unresolved.
- `FAIL action settings nextVideo minimum integer bound: Expected values to be strictly deep-equal:` — unresolved.
- `FAIL action settings nextVideo maximum integer bound: Expected values to be strictly deep-equal:` — unresolved.
- `FAIL action settings documentScroll minimum integer bound: Expected values to be strictly deep-equal:` — unresolved.
- `FAIL action settings documentScroll maximum integer bound: Expected values to be strictly deep-equal:` — unresolved.
- `FAIL action settings nextDocument minimum integer bound: Expected values to be strictly deep-equal:` — unresolved.
- `FAIL action settings nextDocument maximum integer bound: Expected values to be strictly deep-equal:` — unresolved.
- `FAIL action settings nextLesson minimum integer bound: Expected values to be strictly deep-equal:` — unresolved.
- `FAIL action settings nextLesson maximum integer bound: Expected values to be strictly deep-equal:` — unresolved.
- `FAIL action settings nextChapter minimum integer bound: Expected values to be strictly deep-equal:` — unresolved.
- `FAIL action settings nextChapter maximum integer bound: Expected values to be strictly deep-equal:` — unresolved.
- `FAIL action settings independently draw single-millisecond values and log three decimals: Expected values to be strictly deep-equal:` — unresolved.
- `FAIL action settings within-lesson next video uses only nextVideo category: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL action settings navigation precedence nextLesson creates one timer and click: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL action settings navigation precedence nextChapter creates one timer and click: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL action settings navigation precedence assessment creates one timer and click: page.evaluate: TypeError: Cannot read properties of undefined (reading 'category')` — unresolved.
- `FAIL action settings next document first step has one nextDocument delay: Expected values to be strictly equal:` — unresolved.
- `FAIL action settings live open and return are delayed once with no stacked catalog cooldown: Expected values to be strictly equal:` — unresolved.
- `FAIL action settings cancellation user rejects stale callbacks: Expected values to be strictly equal:` — unresolved.
- `FAIL action settings UI mounts compact, expands, validates and restores defaults: locator.evaluate: Error: strict mode violation: locator('#xuexitong-v3-settings').locator('details') resolved to 3 elements:` — unresolved.
- `FAIL action settings panel clicks do not cancel actions until a relevant setting changes: locator.click: Error: strict mode violation: locator('#xuexitong-v3-settings').locator('summary') resolved to 3 elements:` — unresolved.
- `FAIL action settings persist whitelisted fields across a new document without account data: locator.click: Error: strict mode violation: locator('#xuexitong-v3-settings').locator('summary') resolved to 3 elements:` — unresolved.
- `FAIL action settings edits never restart a completed task: page.evaluate: TypeError: Cannot set properties of null (setting '__ended')` — unresolved.
- `FAIL action settings disabling next chapter also cancels a pending assessment handoff: Expected values to be strictly equal:` — unresolved.
- `FAIL action settings zero-delay document steps remain incremental and nonblocking: Expected values to be strictly deep-equal:` — unresolved.
- `FAIL repair A exact four video and PDF inventory waits only for selected readiness; owned UI nonblocking: Expected values to be strictly equal:` — unresolved.
- `FAIL repair B missing-count does not prove full lesson complete: Expected values to be strictly equal:` — unresolved.
- `FAIL repair B missing-marker does not prove full lesson complete: Expected values to be strictly equal:` — unresolved.
- `FAIL repair B document change invalidates prior credit before navigation: Expected values to be strictly equal:` — unresolved.
- `FAIL repair B completed lesson uses shared navigation and rejects repeated completed identity: Expected values to be strictly equal:` — unresolved.
- `FAIL controls manual type hint retries BLOCKED once, respects type and stops without parallel playback: Expected values to be strictly equal:` — unresolved.
- `FAIL controls five-second navigation preview replaces legacy delay; stop and stale identity prevent clicks: Expected values to be strictly equal:` — unresolved.
- `FAIL controls owned document scroll is gradual; local bottom without platform credit cannot navigate: The expression evaluated to a falsy value:` — unresolved.
- `FAIL controls delayed document rendering resumes bounded wait and credited reading gets navigation preview: Expected values to be strictly equal:` — unresolved.
- `FAIL controls native approved-origin replay link opens only by explicit action; text-only cards stay unsupported: Expected values to be strictly equal:` — unresolved.
- `FAIL credit marker-only text lesson advances without media; contradictory count prevents bypass: Expected values to be strictly equal:` — unresolved.
- `FAIL credit unknown text lesson observes delayed marker without inventing completion: Expected values to be strictly equal:` — unresolved.
- `FAIL lifecycle startup wait accepts delayed credit without waiting for media: Expected values to be strictly equal:` — unresolved.
- `FAIL resumption frame load keeps countdown; in-course route changes resume unfinished video: Expected values to be strictly equal:` — unresolved.
- `FAIL document continuity catalog replacement same: Expected values to be strictly equal:` — unresolved.
- `FAIL knowledge map real positive HTML is not displaced by fitting BODY or outer shell: The expression evaluated to a falsy value:` — unresolved.
- `FAIL entry credit does not replace actual positive-range document reading: The expression evaluated to a falsy value:` — unresolved.

</details>

### D1/D2/D3 complete-suite reconciliation (baseline 47fa242)

STATUS: PARTIAL; no production implementation changed. Earlier failure lists above
remain historical evidence, not the result of this reconciliation run.

The accepted frozen comparison baseline is
`5ee97211889c93c402047eefac3bef90d40fb0e2`. The old preservation projection's
first divergence was the IIFE/window boundary and GM initialization, followed by
catalog-credit ownership checks. Those are authorized changes after its older
`b880e877`/`e907cdda` snapshots, not proof that the current diagnostic patch changed
playback. The replacement asserts exact equality for 21 named methods and six
bounded code regions (27 comparisons), plus independent 1.0x/partial-navigation
veto checks. Boundary existence is asserted; there is no unconditional PASS.
Intentionally evolved planning/partial/diagnostic methods remain subject to
application-path integration tests, including the unresolved results below.

| Family | Classification and observed failure | Correction / boundary |
| --- | --- | --- |
| Action ranges and panel selectors | B: nextVideo expected 500–1500ms, actual accepted 3000–7000ms; strict locator found three details/summary elements | Assert current category ranges and target the outer panel; no scheduling source change |
| Cooldown initial state | A/B: fixture marked lesson already completed, leaving `_videoEl` null under prior-credit shortcut | Start unfinished; introduce real fixture marker with genuine ended dispatch |
| Cooldown callbacks | D: callbacks fired without advancing Date.now although pacing checks absolute deadlines | Store integer deadlines, advance simulated wall clock when firing; use the same monotonic clock for elapsed reader time |
| Complex ownership | A: injected verified adapter after prior block, actual PAUSED_AUTOMATION instead of PLAYING/BLOCKED | Explicit fixture Resume before revalidation; preserve ownership and no-wakeup assertions |
| Catalog reconstruction | A/D: new iframe inspected before browser load event; selected video null | Yield to browser iframe load and advance pending callbacks; retain one-click, new-player and 1.0x assertions |
| Native entry | A/B: historical manual-fallback suite invoked newer automatic opening path | Explicitly instantiate existing manual-only adapter; retain native-handler, popup-ownership and no-false-completion assertions. Only expected unsupported-entry refusal is caught |
| Preservation | B: obsolete whole-file projection rejected approved GM/catalog/planning integrations | Exact reviewed frozen-component boundary described above |
| Remaining failures | E: not established as production regressions or obsolete expectations | Unchanged failed assertions remain visible; no blanket state replacement |

Controlled identity comparison: adding only `?courseId=synthetic` to the ordinary
navigation fixture left the selected 122-case families at 55 PASS / 67 FAIL.
An original-HEAD native-entry temporary copy with only that URL change remained
2 PASS / 17 FAIL. The committed default ordinary URLs are unchanged. Optional
`FIXTURE_COURSE_ID=1` is a test comparison hook, not a production identity fallback.

Differential source comparison used the same four representative cases against
both `94b26728e3350438645bc59f6476610f5c6927ab` and
`5ee97211889c93c402047eefac3bef90d40fb0e2` via `REGRESSION_REF`:
one updated range case passed, while complex ownership, catalog reconstruction
and null-player cooldown failed on both. This establishes that those three
representative failures predate the latest diagnostics; it does NOT classify
all remaining failures as pre-existing.

A preliminary complete run suffered Chrome target crashes and was discarded as
acceptance evidence. The final complete files run serially with TEST_FILTER,
REGRESSION_REF and FIXTURE_COURSE_ID unset. Browser version: Chrome 156.0.8078.76.
Private fixtures remain locally excluded; only sanitized test code and this
review history are published.

Final complete-file results (no TEST_FILTER):

| Command | Final result | Starting result where applicable |
| --- | --- | --- |
| `node tests/navigation-v3.mjs` | 455 PASS / 80 FAIL (535 attempted, no browser-closure errors) | 387 PASS / 148 FAIL |
| `node tests/preserved-v3.mjs` | PASS: 27 exact frozen comparisons plus speed/veto assertions | Failed first historical whole-file projection |
| `node tests/verify-v3.mjs` | PASS: syntax and generated payload equality | PASS |
| `node tests/customization-v3.mjs` | PASS | PASS |
| `node tests/task-pacing-v3.mjs` | PASS: six pacing groups plus recovery/reader/journal checks | PASS |
| `node tests/bridge-v3.mjs` | 31 PASS / 0 FAIL | PASS |
| `node tests/gm-live-v3.mjs` | 10 PASS / 0 FAIL | PASS |
| `node tests/native-entry-v3.mjs` | 19 PASS / 0 FAIL | 2 PASS / 17 FAIL |
| `node tests/recorded-live-v3.mjs` | 21 PASS / 0 FAIL | PASS |

Final navigation reduced the original failures by 68. The final eight other
files passed in full; native-entry was rerun in full after correcting optional
access to absent task lists. The final navigation rerun includes the corrected
6001-wide random sample denominator and all outer-panel selectors. Intermediate
browser-unavailable runs are not counted as integration acceptance.

Critical safe-partial checks passed in the final full run: video -> unknown ->
audio -> document -> video; unknown remains unresolved; journal-write failure
prevents crossing; reload and unresolved identity remain paused; all six
missing-owner recheck cases (credit/no-credit/verification/duplicate/course/active)
retain their safety assertions; diagnostics and global-block journal cases pass.
These results do not repair or erase the older failed cases listed below.

Additional commands: `node scripts/build-userscript.mjs`; `node --check` for source,
generated userscript and all three changed test files; `git diff --check`.
All passed. Source and generated userscript have no Git diff against 47fa242;
all production functions and modules are unchanged in this correction.

Acceptance conclusions:
- Source preservation: PASS for the explicitly documented frozen comparisons;
  overall implementation acceptance remains PARTIAL.
- Synthetic integration: FAIL (80 assertions/fixture errors remain); not PASS.
- Authenticated Chaoxing acceptance: NOT RUN, still PARTIAL pending user testing.

#### Remaining failure ledger

Each row is an unresolved assertion/fixture error from the final complete run.
The first available actual/expected difference is included. Attribution remains
E (incomplete evidence), rather than guessing a runtime regression or relabeling
an expected blocked state. Null-player failures need startup/completion fixture
preconditions distinguished from genuine runtime defects; pending/unknown and
transition-state differences need the current planning/credit contract checked.
No test was suppressed to manufacture a PASS. Full raw logs stay local under
`work/acceptance-reconciled/` outside the repository; no private HTML is published.

| Unresolved test / first failure | First actual/expected difference, where supplied |
| --- | --- |
| permissive inactive preview with errors does not discard the pending fifth PDF: Expected values to be strictly equal: | + actual - expected<br>+ 'unknown'<br>- 'pending' |
| diagnostic ordered audio attachments honor independent nextAudio=true: Expected values to be strictly equal: | + actual - expected<br>+ undefined<br>- 'nextAudio' |
| audio native primary and inactive secondary preserve fixed speed and marker-gated natural completion: Expected values to be strictly equal: | + actual - expected<br>+ 'ADVANCING'<br>- 'NAVIGATION_COOLDOWN' |
| multi-attachment document-only startup preserves disabled PDF as pending: Expected values to be strictly equal: | + actual - expected<br>+ 'unknown'<br>- 'pending' |
| sidebar assessment remains unanswered and unsupported live remains manual: Expected values to be strictly equal: | + actual - expected<br>+ 'PAUSED_AUTOMATION'<br>- 'BLOCKED' |
| multi-attachment inventory preserves ordered four videos and pending PDF: Expected values to be strictly equal: | + actual - expected<br>+ 'unknown'<br>- 'pending' |
| automatic startup has bounded failure and a safe manual retry without stale boot actions: page.evaluate: TypeError: Cannot read properties of null (reading '__plays') | See first failure at left; no actual/expected diff supplied |
| catalog rerender nested audition video survives leaf replacement without a chapter ID: page.evaluate: TypeError: Cannot read properties of null (reading 'playbackRate') | See first failure at left; no actual/expected diff supplied |
| audition exception permits legitimate ended plus platform marker only: Expected values to be strictly equal: | + actual - expected<br>+ 'VERIFYING_PLATFORM_COMPLETION'<br>- 'PLAYING' |
| audition classification is rechecked when previously inactive audio starts playing: page.evaluate: TypeError: Cannot set properties of null (setting '__ended') | See first failure at left; no actual/expected diff supplied |
| private sample-03: inert outer structure and safe fallback: The expression evaluated to a falsy value: | See first failure at left; no actual/expected diff supplied |
| private sample-04: inert outer structure and safe fallback: The expression evaluated to a falsy value: | See first failure at left; no actual/expected diff supplied |
| private sample-07: inert outer structure and safe fallback: The expression evaluated to a falsy value: | See first failure at left; no actual/expected diff supplied |
| private sample-08: inert outer structure and safe fallback: The expression evaluated to a falsy value: | See first failure at left; no actual/expected diff supplied |
| synthetic 1 videos: dynamic discovery, natural end, platform confirmation: Expected values to be strictly equal: | + actual - expected<br>+ 'VERIFYING_PLATFORM_COMPLETION'<br>- 'PLAYING' |
| synthetic 3 videos: dynamic discovery, natural end, platform confirmation: Expected values to be strictly equal: | + actual - expected<br>+ 'VERIFYING_PLATFORM_COMPLETION'<br>- 'PLAYING' |
| synthetic 4 videos: dynamic discovery, natural end, platform confirmation: Expected values to be strictly equal: | + actual - expected<br>+ 'VERIFYING_PLATFORM_COMPLETION'<br>- 'PLAYING' |
| synthetic duplicate ended and monitor callbacks schedule one completion: page.evaluate: TypeError: Cannot set properties of null (setting '__ended') | See first failure at left; no actual/expected diff supplied |
| synthetic unsupported multi-tab completion stops: page.evaluate: TypeError: Cannot set properties of null (setting '__ended') | See first failure at left; no actual/expected diff supplied |
| synthetic navigation target: lock, active-node change and new iframe required: page.evaluate: TypeError: Cannot set properties of null (setting '__ended') | See first failure at left; no actual/expected diff supplied |
| synthetic navigation not acknowledged: bounded stop: page.evaluate: TypeError: Cannot set properties of null (setting '__ended') | See first failure at left; no actual/expected diff supplied |
| synthetic destroy cancels callbacks and removes guards: page.evaluate: TypeError: Cannot set properties of null (setting '__ended') | See first failure at left; no actual/expected diff supplied |
| synthetic conflict: positive unfinished count overrides completed icon: page.evaluate: TypeError: Cannot set properties of null (setting '__ended') | See first failure at left; no actual/expected diff supplied |
| synthetic user changes chapter before old completion: page.evaluate: TypeError: Cannot set properties of null (setting '__ended') | See first failure at left; no actual/expected diff supplied |
| synthetic video completion while navigation is pending is ignored: page.evaluate: TypeError: Cannot set properties of null (setting '__ended') | See first failure at left; no actual/expected diff supplied |
| synthetic course has chapters with 1/3/4 videos, one transition each: Expected values to be strictly equal: | + actual - expected<br>+ 'VERIFYING_PLATFORM_COMPLETION'<br>- 'PLAYING' |
| synthetic stale completion after player replacement cannot navigate: page.evaluate: TypeError: Cannot set properties of null (setting '__ended') | See first failure at left; no actual/expected diff supplied |
| synthetic unrelated iframe update cannot acknowledge chapter navigation: page.evaluate: TypeError: Cannot set properties of null (setting '__ended') | See first failure at left; no actual/expected diff supplied |
| synthetic content title changes during completion verification: stop: page.evaluate: TypeError: Cannot set properties of null (setting '__ended') | See first failure at left; no actual/expected diff supplied |
| synthetic large-directory completion advances leaf 37 to leaf 38 only: Expected values to be strictly equal: | + actual - expected<br>+ 'ADVANCING'<br>- 'PLAYING' |
| synthetic independent random draw for every eligible navigation: page.evaluate: TypeError: Cannot set properties of null (setting '__ended') | See first failure at left; no actual/expected diff supplied |
| synthetic cooldown cancellation and stale callback: chapter: Expected values to be strictly equal: | + actual - expected<br>+ 'PAUSED_AUTOMATION'<br>- 'BLOCKED' |
| synthetic disabled cooldown navigates without drawing randomness: page.evaluate: TypeError: Cannot set properties of null (setting '__ended') | See first failure at left; no actual/expected diff supplied |
| synthetic invalid cooldown range 7000/5000 safely blocks: Expected values to be strictly equal: | + actual - expected<br>+ 'VERIFYING_COMPLETION'<br>- 'BLOCKED' |
| synthetic invalid cooldown range 1.5/12000 safely blocks: Expected values to be strictly equal: | + actual - expected<br>+ 'VERIFYING_COMPLETION'<br>- 'BLOCKED' |
| synthetic invalid cooldown range 0/2147483648 safely blocks: Expected values to be strictly equal: | + actual - expected<br>+ 'VERIFYING_COMPLETION'<br>- 'BLOCKED' |
| synthetic successful cooldown callback cannot navigate twice: Expected values to be strictly equal: | 0 !== 1 |
| synthetic document scrolls incrementally from start to actual bottom without platform polling: Expected values to be strictly equal: | + actual - expected<br>+ 'READING_DOCUMENT'<br>- 'NAVIGATION_COOLDOWN' |
| synthetic multiple documents finish locally then await navigation cooldown: Expected values to be strictly deep-equal: | + actual - expected<br>+   0,<br>+   0<br>-   600,<br>-   600 |
| synthetic mixed document/video keeps video confirmation requirement: Expected values to be strictly equal: | + actual - expected<br>+ 'READING_DOCUMENT'<br>- 'PLAYING' |
| synthetic ambiguous/mandatory assessment stops: 身份验证/true/true: Expected values to be strictly equal: | + actual - expected<br>+ 'PAUSED_AUTOMATION'<br>- 'BLOCKED' |
| synthetic ambiguous/mandatory assessment stops: 考试/true/true: Expected values to be strictly equal: | + actual - expected<br>+ 'PAUSED_AUTOMATION'<br>- 'BLOCKED' |
| synthetic ambiguous/mandatory assessment stops: 章节测验/true/false: Expected values to be strictly equal: | + actual - expected<br>+ 'PAUSED_AUTOMATION'<br>- 'BLOCKED' |
| deferred consecutive assessments preserve next learning order; next chapter=false: page.evaluate: TypeError: Cannot set properties of null (setting '__ended') | See first failure at left; no actual/expected diff supplied |
| deferred consecutive assessments preserve next learning order; next chapter=true: page.evaluate: TypeError: Cannot set properties of null (setting '__ended') | See first failure at left; no actual/expected diff supplied |
| recorded cross-origin popup late platform marker controls parent continuation: Expected values to be strictly equal: | + actual - expected<br>+ 'NAVIGATION_COOLDOWN'<br>- 'PLAYING' |
| synthetic live ended: associated child closes, marker then cooldown, normal video resumes: Expected values to be strictly equal: | + actual - expected<br>+ 'NAVIGATION_COOLDOWN'<br>- 'PLAYING' |
| synthetic live near-end: associated child closes, marker then cooldown, normal video resumes: Expected values to be strictly equal: | + actual - expected<br>+ 'NAVIGATION_COOLDOWN'<br>- 'PLAYING' |
| synthetic blocked popup and cross-origin live entry never retry or advance: Expected values to be strictly equal: | + actual - expected<br>+ 'PAUSED_AUTOMATION'<br>- 'BLOCKED' |
| synthetic true live session-finished evidence hands off without invented duration: Expected values to be strictly equal: | + actual - expected<br>+ 'NAVIGATION_COOLDOWN'<br>- 'PLAYING' |
| synthetic finished video bypasses only trailing optional assessment into next chapter: page.evaluate: TypeError: Cannot set properties of null (setting '__ended') | See first failure at left; no actual/expected diff supplied |
| synthetic finished document bypasses only trailing optional assessment into next chapter: Expected values to be strictly equal: | + actual - expected<br>+ 'READING_DOCUMENT'<br>- 'NAVIGATION_COOLDOWN' |
| synthetic live closure never closes an unrelated tab: Expected values to be strictly equal: | + actual - expected<br>+ 'NAVIGATION_COOLDOWN'<br>- 'PLAYING' |
| synthetic assessment-only chapter defers without changing unfinished status: Expected "actual" to be strictly unequal to: | See first failure at left; no actual/expected diff supplied |
| synthetic verification inside an optional assessment prevents handoff: Expected values to be strictly equal: | + actual - expected<br>+ 'NAVIGATION_COOLDOWN'<br>- 'BLOCKED' |
| action settings within-lesson next video uses only nextVideo category: page.evaluate: TypeError: Cannot set properties of null (setting '__ended') | See first failure at left; no actual/expected diff supplied |
| action settings navigation precedence nextLesson creates one timer and click: page.evaluate: TypeError: Cannot set properties of null (setting '__ended') | See first failure at left; no actual/expected diff supplied |
| action settings navigation precedence nextChapter creates one timer and click: page.evaluate: TypeError: Cannot set properties of null (setting '__ended') | See first failure at left; no actual/expected diff supplied |
| action settings navigation precedence assessment creates one timer and click: page.evaluate: TypeError: Cannot read properties of undefined (reading 'category') | See first failure at left; no actual/expected diff supplied |
| action settings next document first step has one nextDocument delay: Expected values to be strictly equal: | + actual - expected<br>+ 'documentScroll'<br>- 'nextDocument' |
| action settings live open and return are delayed once with no stacked catalog cooldown: Expected values to be strictly equal: | true !== false |
| action settings cancellation user rejects stale callbacks: Expected values to be strictly equal: | 1 !== 0 |
| action settings UI mounts compact, expands, validates and restores defaults: Expected values to be strictly equal: | 7 !== 11 |
| action settings edits never restart a completed task: page.evaluate: TypeError: Cannot set properties of null (setting '__ended') | See first failure at left; no actual/expected diff supplied |
| action settings disabling next chapter also cancels a pending assessment handoff: Expected values to be strictly equal: | 1 !== 0 |
| action settings zero-delay document steps remain incremental and nonblocking: Expected values to be strictly deep-equal: | + actual - expected<br>+   100<br>-   0 |
| repair A exact four video and PDF inventory waits only for selected readiness; owned UI nonblocking: Expected values to be strictly equal: | + actual - expected<br>+ 'unknown'<br>- 'pending' |
| repair B missing-count does not prove full lesson complete: Expected values to be strictly equal: | + actual - expected<br>+ 'FINISHED'<br>- 'PLAYING' |
| repair B missing-marker does not prove full lesson complete: Expected values to be strictly equal: | + actual - expected<br>+ 'WAITING_CREDIT'<br>- 'PLAYING' |
| repair B document change invalidates prior credit before navigation: Expected values to be strictly equal: | + actual - expected<br>+ 'ADVANCING'<br>- 'BLOCKED' |
| repair B completed lesson uses shared navigation and rejects repeated completed identity: Expected values to be strictly equal: | + actual - expected<br>+ 'VERIFYING_PLATFORM_COMPLETION'<br>- 'BLOCKED' |
| controls manual type hint retries BLOCKED once, respects type and stops without parallel playback: Expected values to be strictly equal: | + actual - expected<br>+ 'PAUSED_AUTOMATION'<br>- 'PLAYING' |
| controls five-second navigation preview replaces legacy delay; stop and stale identity prevent clicks: Expected values to be strictly equal: | + actual - expected<br>+ 'ADVANCING'<br>- 'NAVIGATION_COOLDOWN' |
| controls delayed document rendering resumes bounded wait and credited reading gets navigation preview: Expected values to be strictly equal: | + actual - expected<br>+ 'WAITING_ATTACHMENT'<br>- 'WAITING_DOCUMENT' |
| controls native approved-origin replay link opens only by explicit action; text-only cards stay unsupported: Expected values to be strictly equal: | 1 !== 0 |
| credit marker-only text lesson advances without media; contradictory count prevents bypass: Expected values to be strictly equal: | + actual - expected<br>+ 'ADVANCING'<br>- 'NAVIGATION_COOLDOWN' |
| credit unknown text lesson observes delayed marker without inventing completion: Expected values to be strictly equal: | + actual - expected<br>+ 'ADVANCING'<br>- 'NAVIGATION_COOLDOWN' |
| lifecycle startup wait accepts delayed credit without waiting for media: Expected values to be strictly equal: | + actual - expected<br>+ 'ADVANCING'<br>- 'NAVIGATION_COOLDOWN' |
| resumption frame load keeps countdown; in-course route changes resume unfinished video: Expected values to be strictly equal: | + actual - expected<br>+ 'ADVANCING'<br>- 'NAVIGATION_COOLDOWN' |
| document continuity catalog replacement same: Expected values to be strictly equal: | + actual - expected<br>+ 'READING_DOCUMENT'<br>- 'NAVIGATION_COOLDOWN' |

### D1/D2/D3 status, startup and callback-contract repair (baseline 6ea9ca9)

This entry supersedes neither the historical evidence nor the acceptance gate.
The starting branch and remote were both verified at
`6ea9ca9fbdb455dbddcabff950c0c889376c4331` after fetching the review branch.

Production correction: `_discoverMedia()` now separates attachment execution
state from platform-credit evidence. `videoAdapter.discover()` creates pending
attachments, but the old enrichment assigned `_attachmentCredit(null)` to a PDF's
status and overwrote pending with unknown. `task.platformCredit` now holds that
independent evidence; an unexecuted item stays pending, genuine local-ended and
verified platform-completed statuses retain their meanings. No pending/unknown
item becomes completed. The status consumer is the inventory display;
`_mediaDone`, `_attachmentCredit`, `_priorProof`, `_verifyExternal` and navigation
eligibility remain the decision makers, unchanged. The pending-fifth-PDF test
also asserts unknown platform credit, no processed-task entry and no whole-lesson
completion authority.

Exact source comparison against the starting commit, removing only the
`_discoverMedia` method from both sides, passed. Therefore playback, audio
fallback, fixed speed, document/knowledge-map readers, pacing, recovery,
assessment policy, journal, sidebar/catalog handling and GM implementation are
unchanged in Git-normalized source outside this declared boundary. The existing 27 frozen
component comparisons also passed. The generated userscript is rebuilt from the
source; metadata/grants are unchanged.

Representative null-player investigation (temporary trace removed from tests):

| Fixture before boot | Actual app state before expected selection | Discovery | First divergence / correction |
| --- | --- | --- | --- |
| One unique active node; completion icon present; unfinished input absent | VERIFYING_PLATFORM_COMPLETION; selected=false; playing=false; one timer; recovery=idle | One primary video; unsupported=false | `run -> _checkPriorCompletion` intentionally returns before `play/_getVideoEl`; it does not fail media recognition. Natural-playback fixtures now enter unfinished. Synthetic platform credit is introduced explicitly, independently of ended, and only before the final item ends in multi-video lessons |
| Same completed entry in duplicate-ended and changed-lesson cases | Same VERIFYING_PLATFORM_COMPLETION and null selected player | Primary player still present and owned | The test dereferenced an intentionally unselected player. Correct the initial fixture, retain duplicate/stale-event assertions; do not disable the prior-credit shortcut |
| Missing course iframe; unfinished input=1; no completion icon | WAITING_STARTUP; no player; one timer; recovery=idle | Zero media; unsupported=true while root absent | Bounded failure becomes terminal. A manual retry must call existing `resumeExplicitly()` before `run`; old boot callbacks still cannot act |

No successful playback is fabricated: the existing simulated player still has
to fulfill play, and original played-once, ended, platform-marker, competing
media and stale-context assertions remain. Whole-lesson pre-completed shortcut
fixtures are not globally changed. Future chapters in the 1/3/4-video test now
start unfinished too; credit is introduced at their final media event only.

Demonstrated timing defects were confined to test infrastructure:
- Old flush copied all callbacks then removed every timer up front. An earlier
  callback could no longer cancel a later copied callback. Flush now checks each
  ID immediately before invocation and consumes it individually, preserving
  deadline order, monotonic/wall-clock advancement and microtask progression.
- Newly queued timers remain for the next flush round. A focused regression
  proves an earlier callback cancels a later one and a new callback is deferred.
- Synthetic course-frame replacement now awaits its actual load event before
  exercising acknowledgement timers, including the nested audition case.
- The mixed document/video fixture's 30-step budget predated elapsed traversal;
  it now allows the current elapsed-time reader to finish, without changing the
  reader or relaxing its later missing-platform-credit rejection.

Proven obsolete expectations: nextVideo uses the canonical nextContent range
(3000-7000ms), and the compact panel has seven visible delay categories rather
than separate alias fields; an invalid nextLesson minimum preserves the current
2000ms default, not the historic 1000ms. Safety-state expected strings were not
bulk-replaced.

Native integration now has a focused real application-entry test in addition to
manual fallback factory tests. It invokes `app.run -> _openNativeLink ->
gmLive.begin`, verifies one original native-handler invocation, a pending GM
record with seq=0/refreshUsed=false, no navigation, no parent close attempt and
no platform-completion record. Reentry retains the same pending session and
does not reopen. GM storage and the native relation handler are synthetic stubs;
this is not Tampermonkey or authenticated opening/child-completion evidence.
Notice-panel and settings task-status text assertions are restored on the manual
fallback path; the GM application test checks the pairing notice.

Document fixture experiments using native wrappers did not establish equivalent
viewer readiness and were reverted. Their failures are not called production
reader regressions or silently converted into PASS. Unresolved reader/credit,
assessment and state-machine cases are retained in the ledger below.


#### Final complete-file run for this correction

All nine files below ran after the last test correction, without TEST_FILTER,
REGRESSION_REF, FIXTURE_COURSE_ID or temporary tracing. Node exit codes and
results are retained locally under work/acceptance-followup-final outside Git.

| Command | Exit | Result |
| --- | --- | --- |
| node tests/preserved-v3.mjs | 0 | PASS: 27 frozen comparisons plus speed/partial veto |
| node tests/verify-v3.mjs | 0 | PASS: syntax and generated payload synchronization |
| node tests/customization-v3.mjs | 0 | PASS |
| node tests/task-pacing-v3.mjs | 0 | RESULT: 6 focused synthetic pacing groups passed; not authenticated browser acceptance. |
| node tests/bridge-v3.mjs | 0 | RESULT: 31 passed, 0 failed; mocked GM storage across openerless Chrome pages; one local WAV natural-ended case; no Tampermonkey or authenticated platform. |
| node tests/gm-live-v3.mjs | 0 | RESULT: 10 focused GM lifecycle checks passed; mocked GM/tabs, not Tampermonkey acceptance. |
| node tests/native-entry-v3.mjs | 0 | RESULT: 20 passed; 0 failed. Synthetic native entry/manual fallback and mocked-GM application evidence only. |
| node tests/recorded-live-v3.mjs | 0 | RESULT: 21 passed; 0 failed. Synthetic browser evidence only. |
| node tests/navigation-v3.mjs | 1 | RESULT: 490 passed, 46 failed; local Chrome DOM tests, simulated media/timers, no live platform. |

Historical failures: 80. Resolved: 34. Still failing: 46.
The navigation inventory is 536 cases (the original 535 plus one focused
timer-cancellation regression). Native-entry is 20 cases (19 preserved plus
one actual-app GM entry test). No historical behavioral case was removed.

P1/F1/F2/F3/F4/O1 refer to the source and fixture evidence immediately above.
For F1, completion markers are test-only explicit platform observations;
they are not created by production code or inferred from missing media.
The nextVideo category test also updates its obsolete 500ms bound to the
current canonical 3000ms bound while preserving one-action assertions.

Remaining E cases include attachment action categories, waiting/blocked
recovery states, prior-credit fixture contracts, synthetic readers and
live/assessment handoff timing. Their exact differences follow. A passing
ownership/discovery helper or frozen comparison does not resolve them.
No STATE assertion was broadened to an allowed set to hide a failure.

STATUS: PARTIAL. Scoped source preservation passes; complete synthetic
integration acceptance FAILS until the remaining failures are resolved.
Authenticated Chaoxing/Tampermonkey acceptance is NOT RUN and remains PARTIAL.

Build, source/generated syntax, changed-test syntax and diff checks passed.
Private HTML remains excluded; only source, generated payload, the two test
files and this existing review history are published.

#### Exact reconciliation of all 80 prior failures

| Historical test | Classification | Final result / first remaining difference |
| --- | --- | --- |
| permissive inactive preview with errors does not discard the pending fifth PDF | Proven production defect: pending/credit conflation (P1) | PASS; original safety assertions retained |
| diagnostic ordered audio attachments honor independent nextAudio=true | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ undefined<br>- 'nextAudio' |
| audio native primary and inactive secondary preserve fixed speed and marker-gated natural completion | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ 'ADVANCING'<br>- 'NAVIGATION_COOLDOWN' |
| multi-attachment document-only startup preserves disabled PDF as pending | Proven production defect: pending/credit conflation (P1) | PASS; original safety assertions retained |
| sidebar assessment remains unanswered and unsupported live remains manual | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ 'PAUSED_AUTOMATION'<br>- 'BLOCKED' |
| multi-attachment inventory preserves ordered four videos and pending PDF | Proven production defect: pending/credit conflation (P1) | PASS; original safety assertions retained |
| automatic startup has bounded failure and a safe manual retry without stale boot actions | Proven fixture defect: explicit terminal Resume (F3) | PASS; original safety assertions retained |
| catalog rerender nested audition video survives leaf replacement without a chapter ID | Proven fixture defect: real iframe load (F2) | PASS; original safety assertions retained |
| audition exception permits legitimate ended plus platform marker only | Proven fixture defect: unfinished playback/explicit credit (F1) | PASS; original safety assertions retained |
| audition classification is rechecked when previously inactive audio starts playing | Proven fixture defect: unfinished playback/explicit credit (F1) | PASS; original safety assertions retained |
| private sample-03: inert outer structure and safe fallback | Unresolved: insufficient evidence (E) | FAIL: The expression evaluated to a falsy value: |
| private sample-04: inert outer structure and safe fallback | Unresolved: insufficient evidence (E) | FAIL: The expression evaluated to a falsy value: |
| private sample-07: inert outer structure and safe fallback | Unresolved: insufficient evidence (E) | FAIL: The expression evaluated to a falsy value: |
| private sample-08: inert outer structure and safe fallback | Unresolved: insufficient evidence (E) | FAIL: The expression evaluated to a falsy value: |
| synthetic 1 videos: dynamic discovery, natural end, platform confirmation | Proven fixture defect: unfinished playback/explicit credit (F1) | PASS; original safety assertions retained |
| synthetic 3 videos: dynamic discovery, natural end, platform confirmation | Proven fixture defect: unfinished playback/explicit credit (F1) | PASS; original safety assertions retained |
| synthetic 4 videos: dynamic discovery, natural end, platform confirmation | Proven fixture defect: unfinished playback/explicit credit (F1) | PASS; original safety assertions retained |
| synthetic duplicate ended and monitor callbacks schedule one completion | Proven fixture defect: unfinished playback/explicit credit (F1) | PASS; original safety assertions retained |
| synthetic unsupported multi-tab completion stops | Proven fixture defect: unfinished playback/explicit credit (F1) | PASS; original safety assertions retained |
| synthetic navigation target: lock, active-node change and new iframe required | Proven fixture defect: unfinished playback/explicit credit (F1) | PASS; original safety assertions retained |
| synthetic navigation not acknowledged: bounded stop | Proven fixture defect: unfinished playback/explicit credit (F1) | PASS; original safety assertions retained |
| synthetic destroy cancels callbacks and removes guards | Proven fixture defect: unfinished playback/explicit credit (F1) | PASS; original safety assertions retained |
| synthetic conflict: positive unfinished count overrides completed icon | Proven fixture defect: unfinished playback/explicit credit (F1) | PASS; original safety assertions retained |
| synthetic user changes chapter before old completion | Proven fixture defect: unfinished playback/explicit credit (F1) | PASS; original safety assertions retained |
| synthetic video completion while navigation is pending is ignored | Proven fixture defect: unfinished playback/explicit credit (F1) | PASS; original safety assertions retained |
| synthetic course has chapters with 1/3/4 videos, one transition each | Proven fixture defect: unfinished playback/explicit credit (F1) | PASS; original safety assertions retained |
| synthetic stale completion after player replacement cannot navigate | Proven fixture defect: unfinished playback/explicit credit (F1) | PASS; original safety assertions retained |
| synthetic unrelated iframe update cannot acknowledge chapter navigation | Proven fixture defect: unfinished playback/explicit credit (F1) | PASS; original safety assertions retained |
| synthetic content title changes during completion verification: stop | Proven fixture defect: unfinished playback/explicit credit (F1) | PASS; original safety assertions retained |
| synthetic large-directory completion advances leaf 37 to leaf 38 only | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ 'ADVANCING'<br>- 'PLAYING' |
| synthetic independent random draw for every eligible navigation | Proven fixture defect: unfinished playback/explicit credit (F1) | PASS; original safety assertions retained |
| synthetic cooldown cancellation and stale callback: chapter | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ 'PAUSED_AUTOMATION'<br>- 'BLOCKED' |
| synthetic disabled cooldown navigates without drawing randomness | Proven fixture defect: unfinished playback/explicit credit (F1) | PASS; original safety assertions retained |
| synthetic invalid cooldown range 7000/5000 safely blocks | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ 'VERIFYING_COMPLETION'<br>- 'BLOCKED' |
| synthetic invalid cooldown range 1.5/12000 safely blocks | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ 'VERIFYING_COMPLETION'<br>- 'BLOCKED' |
| synthetic invalid cooldown range 0/2147483648 safely blocks | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ 'VERIFYING_COMPLETION'<br>- 'BLOCKED' |
| synthetic successful cooldown callback cannot navigate twice | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>0 !== 1 |
| synthetic document scrolls incrementally from start to actual bottom without platform polling | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ 'READING_DOCUMENT'<br>- 'NAVIGATION_COOLDOWN' |
| synthetic multiple documents finish locally then await navigation cooldown | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly deep-equal:<br>+   0,<br>+   0<br>-   600,<br>-   600 |
| synthetic mixed document/video keeps video confirmation requirement | Proven fixture defect: elapsed traversal budget (F4) | PASS; original safety assertions retained |
| synthetic ambiguous/mandatory assessment stops: 身份验证/true/true | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ 'PAUSED_AUTOMATION'<br>- 'BLOCKED' |
| synthetic ambiguous/mandatory assessment stops: 考试/true/true | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ 'PAUSED_AUTOMATION'<br>- 'BLOCKED' |
| synthetic ambiguous/mandatory assessment stops: 章节测验/true/false | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ 'PAUSED_AUTOMATION'<br>- 'BLOCKED' |
| deferred consecutive assessments preserve next learning order; next chapter=false | Proven fixture defect: unfinished playback/explicit credit (F1) | PASS; original safety assertions retained |
| deferred consecutive assessments preserve next learning order; next chapter=true | Proven fixture defect: unfinished playback/explicit credit (F1) | PASS; original safety assertions retained |
| recorded cross-origin popup late platform marker controls parent continuation | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ 'NAVIGATION_COOLDOWN'<br>- 'PLAYING' |
| synthetic live ended: associated child closes, marker then cooldown, normal video resumes | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ 'NAVIGATION_COOLDOWN'<br>- 'PLAYING' |
| synthetic live near-end: associated child closes, marker then cooldown, normal video resumes | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ 'NAVIGATION_COOLDOWN'<br>- 'PLAYING' |
| synthetic blocked popup and cross-origin live entry never retry or advance | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ 'PAUSED_AUTOMATION'<br>- 'BLOCKED' |
| synthetic true live session-finished evidence hands off without invented duration | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ 'NAVIGATION_COOLDOWN'<br>- 'PLAYING' |
| synthetic finished video bypasses only trailing optional assessment into next chapter | Proven fixture defect: unfinished playback/explicit credit (F1) | PASS; original safety assertions retained |
| synthetic finished document bypasses only trailing optional assessment into next chapter | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ 'READING_DOCUMENT'<br>- 'NAVIGATION_COOLDOWN' |
| synthetic live closure never closes an unrelated tab | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ 'NAVIGATION_COOLDOWN'<br>- 'PLAYING' |
| synthetic assessment-only chapter defers without changing unfinished status | Unresolved: insufficient evidence (E) | FAIL: Expected "actual" to be strictly unequal to:<br>'BLOCKED' |
| synthetic verification inside an optional assessment prevents handoff | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ 'NAVIGATION_COOLDOWN'<br>- 'BLOCKED' |
| action settings within-lesson next video uses only nextVideo category | Proven fixture defect: unfinished playback/explicit credit (F1) | PASS; original safety assertions retained |
| action settings navigation precedence nextLesson creates one timer and click | Proven fixture defect: unfinished playback/explicit credit (F1) | PASS; original safety assertions retained |
| action settings navigation precedence nextChapter creates one timer and click | Proven fixture defect: unfinished playback/explicit credit (F1) | PASS; original safety assertions retained |
| action settings navigation precedence assessment creates one timer and click | Unresolved: insufficient evidence (E) | FAIL: page.evaluate: TypeError: Cannot read properties of undefined (reading 'category') |
| action settings next document first step has one nextDocument delay | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ 'documentScroll'<br>- 'nextDocument' |
| action settings live open and return are delayed once with no stacked catalog cooldown | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>true !== false |
| action settings cancellation user rejects stale callbacks | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>1 !== 0 |
| action settings UI mounts compact, expands, validates and restores defaults | Proven obsolete expectation: canonical UI/defaults (O1) | PASS; original safety assertions retained |
| action settings edits never restart a completed task | Proven fixture defect: unfinished playback/explicit credit (F1) | PASS; original safety assertions retained |
| action settings disabling next chapter also cancels a pending assessment handoff | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>1 !== 0 |
| action settings zero-delay document steps remain incremental and nonblocking | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly deep-equal:<br>+   100<br>-   0 |
| repair A exact four video and PDF inventory waits only for selected readiness; owned UI nonblocking | Proven production defect: pending/credit conflation (P1) | PASS; original safety assertions retained |
| repair B missing-count does not prove full lesson complete | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ 'FINISHED'<br>- 'PLAYING' |
| repair B missing-marker does not prove full lesson complete | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ 'WAITING_CREDIT'<br>- 'PLAYING' |
| repair B document change invalidates prior credit before navigation | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ 'ADVANCING'<br>- 'BLOCKED' |
| repair B completed lesson uses shared navigation and rejects repeated completed identity | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ 'VERIFYING_PLATFORM_COMPLETION'<br>- 'BLOCKED' |
| controls manual type hint retries BLOCKED once, respects type and stops without parallel playback | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ 'PAUSED_AUTOMATION'<br>- 'PLAYING' |
| controls five-second navigation preview replaces legacy delay; stop and stale identity prevent clicks | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ 'ADVANCING'<br>- 'NAVIGATION_COOLDOWN' |
| controls delayed document rendering resumes bounded wait and credited reading gets navigation preview | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ 'WAITING_ATTACHMENT'<br>- 'WAITING_DOCUMENT' |
| controls native approved-origin replay link opens only by explicit action; text-only cards stay unsupported | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>1 !== 0 |
| credit marker-only text lesson advances without media; contradictory count prevents bypass | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ 'ADVANCING'<br>- 'NAVIGATION_COOLDOWN' |
| credit unknown text lesson observes delayed marker without inventing completion | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ 'ADVANCING'<br>- 'NAVIGATION_COOLDOWN' |
| lifecycle startup wait accepts delayed credit without waiting for media | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ 'ADVANCING'<br>- 'NAVIGATION_COOLDOWN' |
| resumption frame load keeps countdown; in-course route changes resume unfinished video | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ 'ADVANCING'<br>- 'NAVIGATION_COOLDOWN' |
| document continuity catalog replacement same | Unresolved: insufficient evidence (E) | FAIL: Expected values to be strictly equal:<br>+ 'READING_DOCUMENT'<br>- 'NAVIGATION_COOLDOWN' |

### Bounded unattended audio failure recovery (baseline be35bec)

STATUS: PARTIAL pending authenticated Chrome/Chaoxing retesting. This is the
scoped audio correction, not a reopening of the historical 46-failure project.
Local and fetched remote review HEAD were both verified as
`be35bec5a4473a92139f98577bd8d65912f60838` before editing.

Canonical source: `D:\xuexitongScript-master\v3_optimized.js`.
Canonical installable: `D:\xuexitongScript-master\v3_optimized.user.js`.
The installable was regenerated only by `node scripts/build-userscript.mjs`.
Its actual disk SHA-256 after generation:
`CB74E06C58F6D68C8C4F75C6A006E6FDF9BE5799948EC5669237B4C3FF5CBAB0`.
No alternate production source, installable, backup or output directory was
created. The separate optional `xuexitong-live-bridge.user.js` is unchanged.

Authorized changes:
- `run()` initializes per-attempt `_failedAudioPlayers`, failure scope and latest
  diagnostic record. Confirmed lesson transitions already reenter this run path.
- `_audioPlayRejected()` retains the original audible-first/one-time muted
  fallback block. A non-policy rejection with readyState < 2 and no MediaError
  may wait once for canplay/loadeddata or 250ms checks, with a 5000ms wall deadline.
  The sole new ready retry uses normal `play(true)` and may use one muted fallback
  if that fresh audible attempt receives NotAllowedError. No load(), seek,
  synthetic click, server update, repeated policy timer or automatic unmute of
  successful muted playback is introduced.
- Readiness cleanup removes timers/listeners on Stop, source/element/document,
  route/generation or feature invalidation. `_clearAudioNotice()` invokes that
  audio-specific cleanup as part of existing cancellation.
- Exhaustion records the exact player and rejection category. A WeakSet is not
  completion authority; captured inventory entries retain each failed audio's
  category. Failure never enters completed/processed sets or pacing counts.
- Audio-only hooks in `_discoverAttachmentTask()` and `_getVideoEl()` consider
  following native inventory items only after an exhausted owned audio. Empty
  failure scope follows the exact prior selection/dispatch code. Later items
  use the unchanged normal audio/video start path or verified document adapter.
- `_audioStopUnresolved()` cancels recovery observation and uses existing Stop
  cleanup, clears stale playback context and shows a nonblocking unresolved
  notice. It never calls nextUnit(). Native player controls and the existing
  explicit Resume/re-detect control remain optional recovery; no click is needed
  for automatic muted fallback or the readiness cycle.

Continuation requires the same unique lesson/course/topology, URL, card frame
and root, an unchanged captured attachment snapshot, exact ordered owners,
players/documents and sources, and paused/non-seeking/non-ended failed players.
Unknown/inaccessible/ambiguous/active content, reordered/replaced inventories,
missing course identity, disabled features and unverified document viewers stop
continuation. No catalog click is authorized by failure. Natural completion of a
later player still cannot turn the first failed player into completed content.
An explicit fresh run may retry; an existing whole-lesson-credit shortcut retains
its original independent validation, rather than using failure records.

Protected dependency: when an actual partial session is active, exhaustion stops
instead of adding a second selection policy. Its durable pause marker remains;
continuation there would require ChatGPT to authorize changes to `_partialSelect`
or its plan invariants. No such changes were made. A standalone audio without a
verified ordered native inventory also stops rather than guessing a later task.

Preservation evidence in `tests/audio-failure-v3.mjs`: exact source equality to
be35bec outside the explicitly authorized functions; exact run/cleanup bodies
after removing their single initialization/cleanup hooks; exact normal selector
and attachment dispatcher after removing the failure-specific hooks; and exact
original one-time muted-fallback block. Protected completion functions, ordinary
video, successful audio setup/monitoring, document/knowledge-map readers,
partial-session policy, pacing, journal, navigation, GM and live bridge are not
edited. No existing regression test or expectation was changed.

Observed commands/results (existing Playwright/JQUERY_PATH environment):

| Command | Observed result |
| --- | --- |
| `node tests/audio-failure-v3.mjs` | 27 focused Chrome cases PASS plus frozen-source/fallback comparisons |
| `node tests/navigation-v3.mjs` with the playback/completion filter below | 14 PASS / 0 FAIL |
| `node tests/navigation-v3.mjs` with `TEST_FILTER=^audio bounded fallback promise` | 2 PASS / 0 FAIL |
| Final combined playback/completion filter plus pending-fallback tests | 16 PASS / 0 FAIL on final source |
| `node tests/customization-v3.mjs` | PASS: fixed speed, assessment detection and unknown-content VM checks |
| `node tests/task-pacing-v3.mjs` | PASS: six pacing groups plus recovery, reader and journal checks |
| `node tests/gm-live-v3.mjs` | 10 focused lifecycle checks PASS |
| `node scripts/build-userscript.mjs` and `node tests/verify-v3.mjs` | PASS: canonical payload/metadata synchronization and syntax |
| `node --check tests/audio-failure-v3.mjs` and `git diff --check` | PASS |

Playback/completion filter used:
`^synthetic (fixed normal rate|blur/visibilitychange|unexpected pause|stall detection|muted fallback|completion absent|delayed platform completion)|^audio automatic readiness|^repair C audible initial|^composable dispatcher (audio -> video|audio -> document|video -> unknown -> audio -> document -> video)$`

New cases cover audible success; exactly one muted policy fallback; bounded dual
rejection; one ready-event retry and fresh policy fallback; no second readiness
cycle; timeout; Stop/route/source/element/owner/generation/feature cancellation;
owned following audio/video once; unresolved first media after genuine later
ended; unknown/inaccessible/reordered/partial/disabled boundaries; explicit fresh
run; multiple failed identities/categories; the existing native document reader;
Stop/reentry generation rejection, verified post-document generation handoff,
and genuine ended plus independently supplied synthetic platform marker.
The unknown independent fixture is classified by the existing partial planner
and ends paused; inaccessible/reordered inventory stops at existing global
blocking. These are explicit boundary outcomes, not weakened legacy assertions.

All browser media, errors and permission outcomes are simulated. Tests establish
neither actual browser autoplay policy nor authenticated credit. The full
historical suite was intentionally not rerun; its prior 46 failures are not
claimed resolved or unchanged in count. Older tests requiring final
WAITING_AUDIO_GESTURE and the historical whole-audio-handler equality are not
acceptance criteria for this authorized unattended failure contract; their files
are retained unchanged. This delivery uses the focused cases and explicit frozen
boundaries above, and remains ready for independent ChatGPT source review and
user real-platform testing, not authenticated acceptance.
