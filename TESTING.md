# iOS Safari memory fix — investigation and verification

Base: `eca670a` (RC1). The baseline HTML is an archived reference and is intentionally unchanged; the entry point to test/deploy is `index.html`.

## Cause identified in code

RC1 `loadBlob` reads the entire compressed file, decodes the entire audio into an `AudioBuffer`, and posts all channel arrays to its worker **without a transfer list**. `slots.A/B.buffer` retain each complete decoded buffer. This means B's analysis can retain A PCM + B PCM + a structured-clone copy of B PCM, plus compressed MP4 input, decoder working memory, and browser overhead. Replacement also keeps the previous slot until success.

780 s × 48,000 frames/s × 2 channels × 4 bytes = 299,520,000 bytes = 285.64 MiB per decoded source. A+B+worker-copy is approximately **856.93 MiB**, before other allocations. Decode actually uses the output context's sample rate; at 44.1 kHz the corresponding values are 262.44/787.31 MiB.

This is a code-confirmed memory amplification consistent with the reported reload, **not proof of a particular iPhone process limit or its termination reason**. No device crash/Jetsam log was provided. Safari's process limit varies; there is no universal MB limit assumed here. WebKit has also recorded crashes around repeated large AudioBuffer decoding: https://bugs.webkit.org/show_bug.cgi?id=230192 .

## Implementation

- Committed slots retain metadata, the original Blob, waveform, spectrum, and RMS envelope. PCM is stored in two-second IndexedDB chunks, with transaction completion awaited before continuing. Storage is local; no upload/dependency/network was added.
- A two-second copy is transferred to the worker at a time. The worker retains only 1,600 waveform extrema per channel, the 100 Hz RMS envelope, and the original globally distributed maximum 64 FFT windows. It uses all samples for waveform/envelope and the same 8,192-point Hann FFT and channel-power averaging as RC1.
- Playback uses `AudioBufferSourceNode` on the original shared Web Audio clock. It reads chunks ahead, with an eight-chunk LRU cache, exact boundary scheduling, and the same offset/common-interval semantics. Slow storage pauses explicitly instead of silently letting the timeline drift.
- Same-content files, even with different names, share an immutable asset after full byte equality in 1 MiB blocks. Name/size/date alone never identifies an asset. Clearing/replacing either slot preserves the other's shared data.
- Loads are serialized. A native decode timeout cannot cancel decoding, so a notice after 45 seconds does **not** release the lock or start another decoder. Worker errors/timeouts reject pending jobs. Failed decode/storage preserves the previous committed slot; incomplete temporary assets are removed.
- Original file/recording Blob and filename still back SAVE AUDIO. AIR REC uses the same loading path. Controls, CSS, tabs, original memo/reference keys and frequency options are unchanged. A temporary-storage disclosure was added to the existing privacy notice.
- Temporary databases are deleted on ordinary page close/reload. BFCache retains the session. With Web Locks and database enumeration, the next use removes abandoned databases without deleting another live tab's assets. An OS process kill cannot run cleanup; unsupported cleanup APIs may leave orphaned data until site data is cleared. No audio is restored into the UI after reopening.

## Remaining limits

**This is not a streaming decoder.** Browser `decodeAudioData` still transiently expands one complete input. A very large/high-channel-count source, large video container, delayed garbage collection, low available device memory, or several other tabs can still exhaust memory. The fix removes steady-state A/B PCM and the full-size worker clone; it does not promise all-length, all-device safety. Further bounding this peak requires container-aware chunk demux/decoding with verified codec delay, edit lists, and Safari compatibility. Arbitrarily slicing MP4 bytes is not a safe substitute.

IndexedDB capacity is now needed for decoded PCM (about 286 MiB per distinct 13-minute stereo/48k source, about 572 MiB for two distinct sources). Private mode, quota exhaustion, and storage errors are reported while preserving existing A/B slots. Browser/OS page caches and native decoder allocations are outside JavaScript's cache bound. Continuous decoding and storage can take time; codec support remains browser dependent. No downsampling, lossy encoding, mono conversion, duration truncation, or same-file prohibition was introduced.

At stereo/48 kHz the application playback LRU holds at most about 5.86 MiB (8 × 2 seconds); scheduled/ramping nodes and a read in flight add small working sets. These are structural bounds, **not measured iPhone RSS**. Analysis results and the RMS envelope still scale modestly with duration.

## Reproduce automated checks

Requires Node.js, no npm packages:

```sh
node tools/build.mjs
node tests/regression.mjs
node tests/audio-context.mjs
node tests/server.mjs
```

Open `http://127.0.0.1:8765/tests` and click RUN NATIVE TESTS. The test harness uses a synthetic MediaStream for recording, never a physical microphone, and adds no code to the shipped HTML. Only the harness permits same-origin fixture fetches; the production CSP is unchanged. Browser tests intentionally write test memo/reference values and restore their previous values.

To run RUN 13 MIN MP4 TEST, place `13min.mp4` and `13min-distinct.mp4` in the checkout's sibling `fixtures/` directory. Fixtures used here: synthetic 780-second H.264 16×16/1fps video with AAC 48kHz stereo audio. The second fixture is a remux with different container metadata, forcing independent byte identity and an independent decode. It is not a second acoustic performance. Example using FFmpeg:

```sh
ffmpeg -f lavfi -i 'color=c=black:s=16x16:r=1:d=780' -f lavfi -i 'aevalsrc=0.15*sin(2*PI*440*t)*(0.6+0.4*sin(2*PI*0.37*t))|0.15*sin(2*PI*880*t):s=48000:d=780' -c:v libx264 -preset ultrafast -c:a aac -b:a 96k -movflags +faststart ../fixtures/13min.mp4
ffmpeg -i ../fixtures/13min.mp4 -map 0 -c copy -metadata title='independent source fixture' ../fixtures/13min-distinct.mp4
```

The standalone HTML embeds `memory-audio.js`, `stream-analysis.js` and `audio-context.js`; edit these sources, then run `node tools/build.mjs`. No runtime external script is required.

## Required iPhone acceptance test (not performed here)

Executed on 2026-09-27: 9 Node regression groups passed; 26 native browser checks passed in the Windows Codex in-app browser, including sample-exact offline rendering across a chunk boundary and synthetic-input MediaRecorder; 7 long-MP4 checks passed (same source and independent remux). These do not constitute iPhone/Safari device verification or an RSS measurement.

Record iPhone model, iOS/Safari version, source size/codec/duration, free storage and whether normal/private mode. Use the original failing MP4, not only the small synthetic video fixture.

1. Load the original 13-minute MP4 into A then the same file into B; repeat B replacement and CLEAR/reload at least five times. Verify no reload and original SAVE AUDIO output.
2. Load a genuinely different long MP4 into B with A retained; repeat replacement. Test long WAV/M4A and AIR REC as well. Watch process memory using connected Safari Web Inspector/device tooling where available.
3. Play continuously across several chunk boundaries and the entire file; listen for clicks/dropouts. Switch A/B repeatedly at the beginning, middle and end. Check seeking, PAUSE/STOP, manual ±1/±10 ms, positive/negative offsets and AUTO SYNC against known signals.
4. Verify waveform and both frequency displays, stereo content and levels, recording stop/interruption, SAVE AUDIO, reference and memo. Background/foreground the page and verify the existing pause/record-stop behavior.
5. Test decode failure, low storage/private mode, rapid switching/seek/STOP while reads are pending, reload/close, and two tabs. Confirm no wrong slot replacement, stale playback, loss of the other slot, or restoration of expired audio.

Do not mark this as iPhone-verified until those device tests pass.

## Follow-up: foreground AudioContext recovery

The previous `audio()` resumed only `suspended` and immediately rejected any non-`running` state. iOS Safari can report `interrupted`, settle the resume promise before its state transition, or leave resume pending. WebKit reports also describe `running` with a non-advancing clock. References: https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state , https://bugs.webkit.org/show_bug.cgi?id=281566 and https://bugs.webkit.org/show_bug.cgi?id=263627 .

The output lifecycle now resumes non-closed contexts on an explicit PLAY/REC attempt, observes `statechange` and the audio clock, and bounds each recovery wait at 2.5 seconds. Rejection, closed output or an unresponsive context leads to one replacement per attempt; `close()` is requested on the old context without waiting indefinitely for it. Duplicate requests share one recovery. A failed fresh context can be resumed on the next explicit tap (Safari may consume transient activation during an asynchronous recovery). There is no unbounded retry or automatic foreground playback.

Only output nodes/clock and the bounded playback cache are retired. The old-clock cursor is saved first; A/B asset IDs, PCM database, original blobs, waveform/spectrum/envelopes, offset, memo and reference remain intact. Sources fading out during A/B switching are also disconnected when pausing/rebuilding. Active AIR REC contexts are never replaced during a recording. Background/pagehide cancels pending resumes and pending PLAY requests even before playback starts. BFCache returns stay paused; normal page unload keeps the existing storage cleanup behavior. File loading (`audio(false)`) never resumes output.

Run `node tests/audio-context.mjs` for 16 deterministic cases: suspended/interrupted delayed statechange; rejected/thrown/pending/settled-but-stuck resume; frozen running clock; closed context; concurrent taps; failed replacement then successful next tap; background/STOP cancellation; no auto-resume; file decode isolation; active recording protection. Deadline timers are accelerated in these unit tests only.

In the native browser harness, run the existing native and 13-minute MP4 suites, then RUN OUTPUT RECOVERY TESTS. This keeps both long assets loaded and simulates visibility/page lifecycle transitions. It uses actual `suspend()`, actual replacement contexts and actual IndexedDB playback; only the unresponsive Safari state is injected on the retired context. Checks cover suspended resume, replacement, closed output, cursor/offset/asset/analysis/memo/reference preservation, context ownership of new nodes, bounded cache and BFCache pause/replay. Simulation does not reproduce iPhone audio-session permissions or prove physical speaker output on iOS.

Additional device acceptance: load both original 13-minute MP4s, play and set a nonzero offset, switch tabs/apps or lock the screen, return, verify silence until PLAY, then test A and B without reloading the files. Repeat five times, including immediate backgrounding during A/B crossfade and during recovery. Check manual/AUTO sync, recorder start/stop after recovery, SAVE AUDIO and memo/reference. If Safari still prevents the newly created context from starting in the delayed attempt, the error requests a fresh explicit tap; no source data is discarded.

Follow-up execution (2026-09-27, Windows in-app browser): the existing 9 Node regression groups, 26 native browser checks and 7 long-MP4 checks were rerun and passed. The new 16 deterministic output scenarios and 12 native recovery checks passed; the latter ran with both independent 13-minute assets loaded. The 26 native checks were also rerun after context replacement to exercise recording and storage on the new context. No iPhone device was connected; device verification of this follow-up remains outstanding.

## Compact workspace checkpoint — 2026-09-28 (historical; superseded below)

The current delta preserves existing source/transport/sync/recording/memo controls and moves them within the same DOM. COMPARE, DIFF and MEMO have explicit arrow/tab buttons, without navigation/history writes or swipe listeners. AIR REC remains a separate auxiliary screen; REFERENCE remains a memo subview. Long explanations are retained in HELP. Existing canvases move into a viewport-sized native dialog and return to their original positions; this does not request OS/browser fullscreen or force device orientation. iPhone browser chrome may remain visible.

DIFF FOCUS compares raw, existing sampled average spectra in 1/3-octave bands, displaying B minus A and ranking the three largest absolute differences. Both sources must exceed -100 dBFS in the band and support its upper edge below Nyquist. This is not a synchronized common-interval reanalysis, a perceptual significance test, or a judgment of sound quality. The existing FFT resolution also limits low-frequency detail. Waveforms now overlay A/B on the same axis; playback emphasis remains.

GAIN MATCH is explicitly **pending user choice of RMS versus LUFS basis**, with the placeholder disabled. No gain algorithm or ON/OFF acceptance is claimed. Proposed existing-data path: RMS envelopes on the synchronized common interval, jointly audible blocks, editable analysis interval/noise floor, attenuation of the louder side only. It cannot be described as BS.1770 LUFS or environmental-noise separation. Choosing LUFS requires additional weighted/gated analysis instead. Do not publish this checkpoint as a completed GAIN MATCH release.

Re-run: `node tests/regression.mjs` (9 groups), `node tests/audio-context.mjs` (16), `node tests/comparison.mjs` (difference arithmetic/floor/Nyquist and no-swipe/history invariants): all passed. Browser harness: 26 native checks, 7 long-MP4 checks, 12 recovery checks with both long assets, and 26 new WORKSPACE checks passed. The latter exercise original file inputs, AUTO/MANUAL SYNC controls, page-state retention, all five fullscreen canvases and restoration, focus-band selection, HELP, MEMO and AIR REC navigation. Native close events are awaited rather than assuming a fixed animation duration. GAIN MATCH is excluded until implemented.

Using the Browser skill, responsive testing at 390×844 (375 CSS px content with desktop scrollbar) measured unloaded COMPARE document height 2544→903 px (~65% reduction). At 844×390 fullscreen the graph was ~821×318 px and the close control remained in view. These are Windows in-app browser results, not physical iPhone Safari tests. Device acceptance still requires actual back-edge gesture, browser toolbar changes, orientation changes, file chooser, microphone permissions, background return and gain-match listening once implemented. No Analyzer changes were made.

## Automatic FILE / AIR REC GAIN MATCH — 2026-09-29

The latest requested two-path algorithm is implemented; the historical algorithm-selection blocker above is resolved. No method selector is exposed. Slot acquisition is explicit (`inputKind`), independent of file name or shared PCM asset identity. File selection is FILE, the real MediaRecorder completion path is AIR REC. If either slot is AIR REC, both are compared using AIR's joint energy mask, disclosed as mixed input. Reimported recordings are FILE because their origin cannot reliably be inferred from audio bytes/names.

FILE: continuous two-stage K-weighting in the existing worker, preserving filter state across chunks; per-channel weighted power is stored as ~10 ms energy bins. Mono/stereo/quad/5.1 use standard Web Audio speaker order; LFE is excluded and surrounds weighted 1.41. Unsupported layouts disable only FILE GAIN MATCH, without silently falling back to RMS or removing playback. Common-interval integration uses fractional energy bins (not full-source loudness); 400 ms blocks, 100 ms hop, -70 LUFS absolute gate followed by -10 LU relative gate on each side. A partial final block is omitted. This is a BS.1770-based comparative measure, not certified compliance. References: [ITU BS.1770-4](https://www.itu.int/dms_pubrec/itu-r/rec/bs/R-REC-BS.1770-4-201510-S!!PDF-E.pdf), [De Man coefficient parameterization](https://github.com/csteinmetz1/pyloudnorm/blob/master/pyloudnorm/iirfilter.py).

AIR: the existing channel-mean RMS envelope is squared/integrated into the same 400/100 ms common-time blocks. Each side's threshold is the higher of -60 dBFS or 30 dB below its 90th-percentile block energy. Only jointly valid blocks contribute to either original level. This is an operational silence/low-level gate, not a noise separator or calibrated SPL measurement. Constant room noise, device AGC and differing source content may still influence the comparison.

Both: larger side attenuated, quieter side unity, no upward gain. A separate output GainNode preserves the existing source scheduling and fades. ON/OFF applies a 20 ms ramp to current and fading output nodes; OFF ends at exact unity. Context replacement recreates the node with the retained match setting. Sync/source changes invalidate/recompute the result; invalid/short (<400 ms) common intervals turn matching OFF. Original PCM, graph analysis, reference, memo and downloaded source bytes are unchanged. Original Level and applied Match Offset remain visible in the short GAIN MATCH help, including OFF state. ABOUT / HOW IT WORKS is a separate dialog, outside the page sequence, with all requested topics.

Memory/CPU: additional worker per-sample filter calculations; no second whole-file decode and no extra retained PCM. 780 seconds at 100 Hz needs ~624 kB of retained K-energy per distinct asset; same-file A/B shares it. Temporary integration/gating arrays are small summaries, not audio buffers. Windows native MP4 decode + all analysis + IDB took 5.51 seconds in the final run (previous run 5.64); this is not an iPhone timing/RSS result. The existing transient full-source native decoder remains a known large-file limit.

Final commands: `node tests/regression.mjs` (9 groups), `node tests/audio-context.mjs` (16 cases), `node tests/gain-match.mjs` (11 groups), `node tests/comparison.mjs` (2 groups): passed. Browser: 27 native checks, 10 long-MP4 checks, 12 long-asset output recovery checks, 26 workspace checks, and GAIN MATCH suite (24 dedicated checks plus the 12 recovery checks) passed. Additional navigation test opens Tool from a real landing link, switches internal pages, invokes browser History Back and verifies the landing page returns. No production history mutation or swipe listener was added.

Test corrections (not product changes): the original periodic envelope appropriately produced ambiguous AUTO SYNC; a deterministic aperiodic envelope now tests a unique 0 ms result. Comparison duration assertions use native decoded frame duration rather than assuming exactly 8 seconds after resampling. Playback checks allow its existing 60 ms scheduled-start lead. Fade-unity checks wait on actual AudioContext time rather than a wall timer. They exclude already-ended/disconnected inputs, whose silent subgraph AudioParams may keep the last rendered value; the diagnostic captured three still-active fading entries at unity while ended entries retained stale values. Native dialog close events are awaited.

Browser-skill visual verification: 390×844 portrait, 844×390 landscape, short help/level values, long ABOUT without horizontal overflow, modal return, DIFF fullscreen close and MEMO navigation. COMPARE remains 903 px high versus baseline 2544 px at the same width; landscape canvas ~821×318 px. Physical iPhone Safari, microphone permission UI, real back-edge gestures, physical speaker output, and original user MP4 RSS remain unverified. Perform the device acceptance steps above before note distribution; simulation is not a substitute for the device test.

## Approved reference / LISTEN / bands / landscape controls — 2026-09-30

Based on PR #3, preserving its complete memory, output-recovery and FILE/AIR GAIN MATCH implementation. The user-approved reference image determines the portrait hierarchy: logo/help, title and explicit arrows, main overlaid spectrum with band labels and integrated difference region, small waveform/playhead/time/seek, A/B source cards, two-column DIFF/Smoothing/GAIN MATCH/AUTO SYNC controls, MEMO shortcut, bottom LISTEN/COMPARE/DIFF/MEMO navigation. Existing PLAY/PAUSE/STOP controls remain available below the panel. Numeric plots show actual dBFS/power differences, not the illustrative values or ±dB axis in the reference artwork. Difference direction remains the existing B minus A and is explicitly labelled.

LISTEN shows the same sources, waveform and transport without the analysis graph. MANUAL SYNC, AIR REC, source SAVE and full waveform remain accessible from the tools menu; no source, memo or analysis is cleared by navigation. There are no production history writes, touch/page-swipe listeners or Analyzer changes. Additional display settings open from the **lower Smoothing panel**, not a new graph-top toolbar, to preserve the fixed reference hierarchy and avoid extra permanent rows. At 390×844, loaded COMPARE document height measured 873 px versus the original baseline 2544 px; the main graph is about 304 px tall. This is responsive reference-based layout, not a screenshot pasted into the UI.

Music Default edges are exactly `[20,60,250,500,2000,8000,20000]` Hz, named SUB/BASS/LOW MID/MID/HIGH MID/TREBLE. Custom edits seven strictly increasing finite edges within 20–20k, persists under `amct_bands_v1`, and resets to Default. Corrupt/unsupported saved settings fall back safely. These labels are Tool's music-production grouping, not universally standardized boundaries. STANDARD retains the existing 31 nominal ISO 266 / IEC 61260-style 1/3-octave centers. Its analysis remains fixed 1/3 octave; it is not claimed to be a compliant filter bank. In STANDARD the music labels remain only a position guide. Music DIFF uses the selected six ranges; STANDARD DIFF retains the existing 1/3-octave computation. Sub-resolution custom bins and unsupported Nyquist ranges are unavailable rather than fabricated.

`band-display.js`, `realtime-view.js`, and `fixed-ui.js` are embedded by the existing standalone build. Playback-position visualization uses a **separate** Worker with an 8192-point Hann FFT per channel, channel-power averaging, and approximately 10 Hz requests for both aligned A/B positions. Only the current small windows are copied from the existing two-second/eight-entry PCM cache; no whole-file re-decode or second persistent PCM store. Completed frames retain spectrum/asset metadata only, never an extra source Blob or waveform/envelope copy. A/B frames are published together, and stale load/seek/context/offset results are rejected. A 5-second visual-worker timeout falls back to clearly labelled average analysis without breaking playback or the import worker. It is not a guarantee against OS termination.

MUSIC Smoothing is display-frequency averaging OFF/1/6/1/3 octave; temporal interpolation of the line is display-only. GAIN MATCH and original analysis are untouched. Integrated COMPARE DIFF uses current unsmoothed power differences during playback and average power when paused; its bars auto-scale, with actual numeric peak differences. The separate DIFF page remains whole-source distributed-sample average analysis, explicitly explained in ABOUT. Neither is a calibrated room response, SPL measurement, common-interval full reanalysis, or an AI quality judgment. FFT resolution, the finite time window, interpolation delay and browser/IDB speed limit temporal/frequency detail. Extra CPU is required for visual FFT and drawing; **iPhone thermal load/RSS/frame rate have not been measured**.

Expanded graphs are landscape-only viewport dialogs. Portrait requests show a cancellable rotation instruction; the actual landscape viewport opens the graph. Returning to portrait restores canvas/waveform to their original DOM homes and shows the same rotation guidance. No CSS fake rotation or assumption that iOS allows programmatic orientation lock. Browser chrome may remain; this is not a guaranteed OS Fullscreen API session. See [MDN orientation lock restrictions](https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock). All five original canvases remain expandable. The graph has a small waveform and one control row with **explicit ◀/▶ buttons** and three pages: transport/A-B/±5-second seek/STOP/gain; AUTO/MANUAL sync/gain/smoothing; display mode/Default-Custom/edit/DIFF. Only one row is visible. Closing preserves active playback and the same nodes/cursor. Native modal focus/close behavior remains in use.

### Final automated and browser execution

- `node tools/build.mjs` then `node tests/regression.mjs`: 9 groups PASS.
- `node tests/audio-context.mjs`: all 16 scenarios PASS.
- `node tests/gain-match.mjs`: 11 groups PASS.
- `node tests/comparison.mjs`: 2 groups PASS.
- `node tests/bands.mjs`: 3 groups PASS (defaults/validation/persistence parsing, accurate Hann FFT/channel averaging/silence, landscape/buttons/no-history invariants).
- `git diff --check`: PASS (only a local CRLF advisory).
- Start `node tests/server.mjs`, open `/tests` at 844×390 and click **RUN ALL LANDSCAPE TESTS**: **143 checks PASS in one continuous run**: native 27, long MP4 10, long-asset output recovery 13, workspace 27, GAIN MATCH 37 (24 + 13 recovery), bands/LISTEN/fullscreen 29. No FAIL lines. Latest 13-minute decode + all import analysis + IDB commit: 4.53 seconds on Windows, not an iPhone benchmark.
- Portrait bands/LISTEN suite: 23 checks PASS, including refusal to open portrait fullscreen and cancellation of rotation request.
- Actual UI: edit SUB/BASS boundary to 80 Hz, save, reload the page, reopen editor: 80 Hz and Custom mode retained; restore Default afterwards.
- Actual navigation: enter Tool through `/navigation-landing`, switch LISTEN/COMPARE/DIFF/MEMO internally, invoke Back: the real landing page returns.
- Actual viewport rotation: open expanded COMPARE, resize portrait: graph dialog closed, rotate dialog open, canvas parent `compareVisual` and waveform parent `.wrap`; resize landscape: graph dialog reopened and canvas parent `graphHost`; close returns to normal UI. Screenshots visually inspected at 390×844 and 844×390.

Regression-test adaptations follow the approved changes: four main pages instead of three; small waveform always below the graph instead of a frequency/waveform tab switch; full-graph checks run in landscape. Existing 1/3-octave DIFF test explicitly selects STANDARD rather than assuming the former default (the two-tone fixture has only two valid wide music bands). No existing audio assertions were removed. A new regression covers immediate fullscreen GAIN MATCH label/state updates.

### Still required before device distribution

Physical **iPhone Safari is unverified**. Test the user's original MP4, microphone permission and actual speaker output, rotations with orientation lock/browser-toolbar changes, back-edge gestures, background/app-switch recovery, low storage and long continuous playback. Repeated memory-limit failure during the existing one-file transient decode remains possible; this patch preserves the serialized decoding and bounded retained playback cache but cannot promise Safari never reloads. AIR provenance limitations, noise/AGC limitations and all preceding output-recovery safeguards remain as documented above.

## Follow-up: compact page header — 2026-09-30

User-requested CSS-only reduction of the LISTEN/COMPARE/DIFF/MEMO page header. Shared heading font is 14px (previously 27px, or 24px on narrow screens); page arrows are 28×28px (previously 48×53px). Header row plus bottom margin is 32px, approximately half of the previous 63px. LISTEN's short description and DIFF's short scope description use smaller type and margins. The logo row, audio logic, graph dimensions, source cards, controls and bottom navigation are unchanged.

Measured with Browser at 390×844: all four pages have a 28px header row, 14px title and 28px arrow height, without horizontal overflow. COMPARE graph top moved from 126px to 94.67px; graph height remained 303.83px, mini waveform strip 70.33px and main control grid 162px. Document height changed from 873px to 844px, eliminating the portrait scrollbar at this viewport. The available content width naturally increased when the desktop scrollbar disappeared; no component width rule was changed. Screenshot visually checked. This remains browser viewport testing, not physical iPhone certification.

Rebuilt standalone HTML and reran all five Node suites (9/16/11/2/3 groups/scenarios), plus `git diff --check`: PASS. Used actual bottom-navigation buttons to verify all four header layouts. The earlier 143 audio/browser checks are the pre-header checkpoint; this CSS-only follow-up did not alter or rerun their audio-processing code.

## Follow-up: fullscreen follows the current page — 2026-09-30

Cause: the shared waveform-strip expand button and display-settings expand action both hardcoded `expandGraph('spectrum','COMPARE')`. This displayed COMPARE content even while the active page was LISTEN or DIFF. They now share `expandCurrentPage`: LISTEN → original A/B waveform canvas; COMPARE → spectrum canvas; DIFF → difference canvas. No page navigation occurs. Existing dedicated graph buttons and landscape-only/portrait-rotation guidance are retained.

LISTEN fullscreen uses the large original synchronized A/B waveform and its animated playhead. The duplicated mini waveform is hidden only in this fullscreen variant; current/total time becomes 16px and the retained seek control has 32px height. The clock label updates even while the mini canvas is hidden. Closing removes this variant and restores the original DOM locations. The normal screen, compact headers, audio graph, source buffers, timeline/origin, gain matching and sync code are unchanged.

Added **RUN PAGE FULLSCREEN TESTS** to the browser harness and the aggregate landscape suite. It invokes the actual shared expand button on all three pages while B is playing with gain attenuation and a +125ms sync offset. Assertions verify correct canvas/active page, no COMPARE canvas in LISTEN, exact transport/AudioContext/source/origin/gain-result identities across open/close, advancing time, enlarged time/seek controls, and functional LISTEN seeking with position retained on return.

Validation: all five Node suites PASS (9/16/11/2/3), `git diff --check` PASS, and the full browser landscape run **161 checks PASS** (previous 143 plus new 18). This includes native recording/save, 13-minute same/distinct MP4, output-context recovery and gain matching, not just routing checks. Browser viewport testing is not physical iPhone Safari certification.

Portrait routing: all 3 pages retain their own target while waiting for landscape (3 additional checks PASS). Actual UI verification: click LISTEN expand at 390×844, rotate viewport to 844×390, and inspect the resulting large waveform/time/seek with no spectrum. Screenshot checked. The prior compact-header change is preserved.

## Follow-up: Photos/camera video input and LISTEN preview — 2026-09-30

Retained fix list: #5 compact shared headers; #6 current-page fullscreen (LISTEN waveform, COMPARE spectrum, DIFF differences); this follow-up adds video input/preview without replacing either. The base is merged main `c1fa0b158c4311d218838aad96e248707c01aac1`.

### Diagnosis and scope

Previously every picked movie went directly to `decodeAudioData` as a complete video container, without inspecting its tracks or extracting audio. A native container decode failure prevented committing the slot. The File input was cleared immediately after selection, before asynchronous reading completed. There was no video metadata or display path at all. This patch hardens these concrete gaps; **the user's physical iPhone picker failure has not been reproduced here, so neither early clearing nor container decoding is claimed as the single proven device root cause**. Standard File references normally survive input clearing. Empty/incomplete payloads, read/decode/storage errors now have stage-specific messages and retain the previous slot.

`media-input.js` inspects actual ISO BMFF/QuickTime tracks, including files with missing MIME types, with a bounded 32 MiB index. For regular single-audio-track AAC/ALAC MP4/MOV, it creates an audio-only container using original compressed audio Blob slices and patched chunk offsets, retaining timing/edit tables. No transcoding, whole-video ArrayBuffer, server upload, or second whole PCM asset is introduced. Fragmented containers and other audio codecs keep the native decode path. The original movie Blob remains available for SAVE and preview. Shared byte-identical A/B input still shares its PCM asset. Picker input is cleared only after import finishes, allowing repeated selection of the same file.

`video-preview.js` uses one muted/inline video element for the active LISTEN slot only. It follows the existing Web Audio clock plus B's sync offset, pauses/seeks with transport, and hides stale frames during source changes or significant drift. Small drift uses bounded rate correction. Leaving LISTEN, entering waveform fullscreen, importing audio or backgrounding releases the visual source/URL. Only the original Blob is referenced; the encoded video is not duplicated. Other pages, audio-only LISTEN layout, audio output nodes, gain algorithms and sync algorithm are unchanged. An audio/WebM AIR REC is explicitly not classified as a video by extension. Unsupported visual codecs/autoplay failures show a message and retry without discarding decoded audio.

### Reproduction

Run the original five Node suites plus `node tests/media-input.mjs` (10 new parser tests). Generate the small synthetic camera-like fixture outside the repo at `../fixtures/camera.mov` using an available FFmpeg executable:

```
ffmpeg -f lavfi -i testsrc2=size=320x180:rate=30 -f lavfi -i sine=frequency=440:sample_rate=48000 -t 12 -c:v libx264 -pix_fmt yuv420p -c:a aac -ac 2 -movflags +faststart ../fixtures/camera.mov
```

Start `node tests/server.mjs`, open `/tests` in landscape, and run **RUN ALL LANDSCAPE TESTS** (including the existing 13-minute fixtures). **RUN VIDEO INPUT TESTS** can also run separately. Real native File/DataTransfer input handlers are exercised with QuickTime MIME and empty MIME. These simulate browser-delivered files; they do not operate an iPhone camera or Photos picker.

New checks cover sample-exact native-versus-extracted MOV audio and equal duration; A/B commits and delayed input clearing; shared same-file PCM and unchanged source blob; muted single preview; PLAY/PAUSE/STOP/SEEK; A/B video replacement; positive/negative manual offset; automatic sync result; FILE gain state; release on COMPARE/DIFF/MEMO; waveform fullscreen/return; background suspension/explicit resume; failed-payload slot preservation; audio-only and AIR WebM classification; bounded cache. Existing recording/save, context replacement, gain, bands, DIFF, memo and long-file tests remain in the aggregate suite.

### Remaining device/format limits

Validation result: all six Node suites PASS (9/16/11/2/3 existing groups/scenarios plus 10 new media cases). Full browser landscape aggregate **191 checks PASS** (161 existing + 30 video checks), including both distinct 13-minute MP4 assets and background video recovery. `git diff --check` PASS. This is desktop native-browser testing, not a physical Safari result.

- Physical iPhone Safari Photos-library selection and **Take Video** are still unverified. Test the original failing files and freshly captured MOV/MP4 on the target iPhone, both slots, with iCloud originals fully downloaded. Empty/non-delivered OS picker files cannot be reconstructed by the web app.
- Safari must support the actual audio/video codecs; a `.mov`/`.mp4` extension does not guarantee this. Silent videos cannot participate in audio comparison. Multiple audio tracks are rejected explicitly rather than silently choosing an unintended track. Oversized/malformed indices are rejected. Legacy/fragmented containers depend on native decoding.
- Separate native audio/video clocks cannot promise sample-accurate video sync. The preview corrects drift and hides outdated frames; tests use a 150 ms visible-frame tolerance, not a claim of perceptually perfect lip-sync on every device. Low-power/autoplay restrictions may require the visible retry action.
- The existing one-file transient full audio decode still exists. Serial decoding, chunked retained PCM and the eight-chunk cache are preserved, but high-resolution video decoding adds native decoder memory and device memory reloads cannot be ruled out. No second video buffer is created by this patch.
- LISTEN fullscreen continues to enlarge the waveform, as explicitly requested in fix #2; normal LISTEN is where movie frames are displayed.
