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

## Follow-up requests ④–⑫ — 2026-09-30

Base: merged PR #7, main `19e07739f2d1efec6b464d5a6ba0b12b4d33c174`. Earlier sections are historical checkpoints; this section supersedes their whole-average-only DIFF, default 1/6 smoothing, flat help, MEMO reference subview, and fullscreen-video release descriptions.

### ④ Input investigation — NOT device-confirmed fixed

The reported physical iPhone Photos/Take Video failure remains unreproduced and its exact cause is **not identified**. No iPhone-produced failing File or device log was available for this change. We requested a shareable failing movie, iOS version and error message. Do not interpret synthetic MOV/File tests as completion of this device issue.

Added `input-diagnostics.js`: source dialog → **入力診断（端末内のみ）** records actual picker click/input/change/cancel events, File constructor/name/MIME/size/lastModified, actual container track types/codecs, route, errors and completion. It includes the user agent/build in an editable-selection read-only log for manual copying; it never uploads anything. Filenames may be private: review before sharing. Browsers do not reliably label which native picker source produced a File; we do not infer Photos/camera provenance from a guessed extension. Input and change events share one in-flight import; selection clears only on completion. Failed ArrayBuffer reads can retry through FileReader, without overlapping native decoding. Empty/no-event provider failures still cannot be reconstructed by the app. Existing single-track AAC/ALAC extraction, native fallback and explicit multi-track limitations remain.

Device next step: open a source slot, reproduce once, expand 入力診断 and copy the log plus the displayed error. Test Photos, Take Video and Files separately, both slots. If the picker returns no event/File, the log should show opening/cancel rather than falsely reporting successful loading.

### ⑤ Fullscreen/audio boundary

Code inspection found no existing explicit fullscreen AudioContext/source rebuild or smoothing audio filter. The previous LISTEN path did, however, release and reload its muted native video at fullscreen boundaries. That is removed: fullscreen hides its panel and retains the same source URL/decoder, with no media restart just to change layout. Explicit transport operations still apply; leaving LISTEN/background/import releases it as before. The connection from this lifecycle to the user's audible iPhone symptom is a **hypothesis, not a reproduced root cause**. Fullscreen does not call native OS fullscreen APIs or change the output route. Active graph rendering is limited to the same 10 Hz cadence in normal/fullscreen modes, and smoothing uses linear-time prefix sums rather than repeated band scans.

Regression assertions preserve exact context, transport (including GainNodes), source assets, origin, gain result, offset, sample rate and channel identities across all three page fullscreen round-trips and smoothing changes, and instrument gain parameters to assert zero automation calls. Video fullscreen preserves the exact object URL. Existing native PCM sample-equivalence/scheduled-chunk tests remain. Physical acoustic output/headphone route equivalence on iPhone is **not measured**; this is not an audible-equivalence certification.

### ⑥ Transport / repeat

Normal PAUSE/STOP become 44px wide (roughly half their former footprint), retaining at least 44px height/tap area. Fullscreen PAUSE/STOP also use compact 44px controls. REPEAT ON/OFF is synchronized across both presentations. At the existing common-interval end it restarts the selected side at `limits()[0]`, retaining sync, gain setting/results and context. OFF keeps former stop behavior. STOP/background cancel a pending restart. This uses the existing guarded playback startup, so repeats may contain a short scheduling/read gap; it is not a gapless-loop feature.

### ⑦–⑧ Help

Top ? starts at the active LISTEN/COMPARE/DIFF/MEMO explanation. First level explains the purpose, the next gives specifications/usage/cautions, and K-weighting/LUFS/RMS/gating/Smoothing/FFT/SYNC offset/octave/dBFS links open beginner explanations with a Back action. Function-specific help maps directly to its topic. Original technical paragraphs and Original Level/Match Offset remain reachable. ABOUT stays an independent browsable index, not a main page or browser-history navigation. DIFF documentation is updated to the new current-position behavior.

### ⑨–⑪ Display analysis

Fresh MUSIC smoothing is OFF, with 1/6 and 1/3 still available. STANDARD remains independently fixed at 1/3 octave. The old DIFF read only `slots.*.power`, and the realtime sampling loop ran only on COMPARE: these were the confirmed reasons for static DIFF. DIFF now samples the same common time (B includes offset), accepts paired frames only when their timestamp/asset/context/transport is valid, and renders/ranks them at 10 Hz. Paused/stale/not-yet-ready state explicitly says whole-source average/analysis waiting. MUSIC applies display smoothing to each side's power before the existing six Default/Custom band comparison; STANDARD keeps its existing 31 bands. Numeric focus entries and bars use the same rows and settings. This remains band-aggregated power, not time-domain subtraction, and gain matching is not applied to original-signal plots. Focus buttons retain DOM identity during updates to avoid interrupting touch clicks. No raw FFT/PCM is mutated and no audio filter is connected.

### ⑫ MEMO + PHOTO

MEMO's REFERENCE selector/viewer is removed from that page only. Its original viewer is available via AIR REC's **保存済みREFERENCEを見る**; SAVE REFERENCE, old storage keys and live overlay remain intact. Existing memo sessionStorage autosave remains. Separate image/library and `capture=environment` camera controls add local photos to a draft. **記録を保存** atomically stores timestamp, text and original image Blobs in a separate IndexedDB database, with photo bytes separate from the record listing. Opening a record displays its text/photos without replacing the current session memo. Image URLs are revoked when views close; all saved image formats can be downloaded, even if a browser cannot preview one. The image CSP gains only `blob:`, not network access.

Safety limits for the new photo feature are 10 attachments/record and 25 MiB/image. Failed saves preserve drafts. These records are local to this origin/browser, not cloud backups; browser-data clearing, private browsing and quota restrictions may remove/prevent storage. A file:// deployment's storage behavior must be checked on the actual device. `capture` requests a camera but actual chooser behavior/HEIC support is platform-dependent. Browser-native File handler and IndexedDB/image decoding tests do not certify physical iPhone camera capture.

### Tests / reproduction

Run all prior six Node suites plus `node tests/display-diff.mjs` (OFF default, differential smoothing changes, prefix-sum agreement with COMPARE, source immutability). In `tests/server.mjs`'s `/tests`, **RUN ALL LANDSCAPE TESTS** now also runs **RUN ADDITIONAL FIXES TESTS**. The original camera.mov and 13-minute fixtures are unchanged. Test adaptations are explicit: previous direct long-help assertion now opens the second level (retains the long-text check); video fullscreen now asserts retained exact URL instead of released URL; baseline-markup comparison permits only the required image blob CSP addition. No audio tests were dropped.

Official platform references (not evidence that this user's device issue is fixed): [WebKit inline/muted video policies](https://webkit.org/blog/6784/new-video-policies-for-ios/) and [WebKit HTML Media Capture support](https://webkit.org/blog/7477/new-web-features-in-safari-10-1/).

Final automated checkpoint: all **7 Node suites PASS** (9/16/11/2/3/10/1 groups/scenarios), full native browser landscape run **227 checks PASS**, and `git diff --check` PASS. The photo-close regression waits for the native dialog close event rather than assuming it dispatches within 20ms; stored PNGs are verified decoded, not just inserted as img elements. This remains desktop-browser/synthetic-input evidence. Requests ④ (actual iPhone import failure root cause) and physical verification of ⑤/camera/library behavior are outstanding, not marked solved by these counts.

## Continuation: iPhone alternate audio tracks (retains all PR #8 changes)

Inspection found a concrete compatibility defect beyond the previous diagnostic work: `inspectMediaInput` rejected every movie with more than one audio track. [Apple TN3177](https://developer.apple.com/documentation/technotes/tn3177-understanding-alternate-audio-track-groups-in-movie-files) documents iPhone spatial recordings with an enabled stereo compatibility track and a disabled spatial alternative. Thus valid iPhone-produced movie layouts were rejected by code, regardless of Photos/camera/Files delivery. This is a confirmed rejected format, **not proof that the user's unavailable movie has that format**.

The importer now reads version 0/1 `tkhd` enabled flags, track IDs and alternate-group IDs. With multiple audio tracks it accepts only one common nonzero alternate group, unique valid IDs and exactly one enabled default; serialization order never chooses the track. The selected track must still be extractable AAC/ALAC with supported sample tables. Ambiguous/mixed groups, multiple/no defaults, unsupported default codecs and fragmented multi-track layouts remain explicit errors; we do not secretly switch to a disabled track or let a native decoder choose an unrelated one. Single-track/native behavior is unchanged.

The audio-only temporary container removes references to omitted tracks and clears its alternate-group membership, while retaining packet bytes and timing. Original video and SAVE data are unchanged. The selected track/compatibility limitation is disclosed in the load result, LISTEN, local input diagnostics and ABOUT. This is not APAC decoding or Photos Audio Mix reproduction. The original video's audio remains muted; only existing Web Audio output is heard. It does not introduce a second full video buffer or change fullscreen/gain/repeat/sync code.

New tests: five parser groups for order independence, version-1 headers, ambiguous defaults/group/ID rejection, unsupported enabled codec and fragmented multi-track rejection. `tests/alternate-fixture.js` derives a small synthetic movie from camera.mov: an unsupported disabled track comes before the enabled AAC track, with original media offsets preserved. **It is not genuine APAC-encoded media and not an actual iPhone recording.** Browser tests verify selected AAC PCM/duration exactly equal the original, A/B commits/disclosure, same-file shared PCM and LISTEN audio/video sync. Existing ④–⑫ regression tests remain in the aggregate suite.

Publication: PR #8 was still open/unmerged when work resumed. The new branch continues its exact commit, and the new PR targets main including all PR #8 work plus this continuation. PR #8 is not closed or mutated automatically. Prefer reviewing the new combined PR rather than merging overlapping PRs independently. Device Photos/Take Video selection and physical fullscreen sound equivalence remain unverified; please supply the failing movie or local diagnostic log to close that verification gap.

Continuation validation: all seven Node suites PASS (9/16/11/2/3/15/1 groups/scenarios); full browser landscape aggregate **233 checks PASS** (prior 227 + 6 alternate-track checks); `git diff --check` PASS. The entire prior suite was run again on the resumed code, including all ④–⑫ checks, not just the new parser. The unsupported disabled track in the fixture is synthetic; these results must not be described as a physical iPhone recording test.

## Single AAC QuickTime remux correction — device log follow-up

Base: merged PR #9, main `2ed48c65d2cd49325d5b72fce4e240e780a91315`. The user's new physical-device evidence supersedes the earlier unknown-picker/alternate-track hypotheses **for this incident**: the File arrives, MOV has avc1 + one enabled mp4a track (ID 2), nonfragmented, and `decodeAudioData` fails with EncodingError after audio-track-remux. Alternate-track handling is retained but is NOT this fix.

### Confirmed code defect vs. remaining device verification

The former remux changed ftyp to M4A/isom/mp42 but copied the QuickTime stsd verbatim. Our generated single-AAC MOV reproduces the structural defect: SoundDescription **version 1**, compression ID -2, packet fields, and **esds nested inside wave** survive into the supposedly ISO output. Chromium accepted that mixed dialect, so a successful desktop decode did not detect the defect. Apple's [sound sample descriptions](https://developer.apple.com/documentation/quicktime-file-format/sound_sample_descriptions) and [FFmpeg's MOV/MP4 writer](https://ffmpeg.org/doxygen/8.1/movenc_8c_source.html) distinguish these layouts. This is a confirmed remux incompatibility risk, **not proof of the precise CoreAudio rejection in the user's unavailable file**. We have the diagnostic log, not the failing movie or an iPhone test runner. Do not report the physical issue resolved until re-tested.

### Container audit / changes

| Component | Handling |
| --- | --- |
| ftyp / moov / mdat | M4A + M4A/isom/mp42 brands; audio-only rebuilt moov; referenced audio Blob slices only in mdat |
| stsd / AAC config | Convert QuickTime mp4a v0/v1/v2 to ISO v0 entry with direct esds; remove QT wave wrapper/packet fields; parse bounded variable-length ES/DecoderConfig/AudioSpecificConfig descriptors; retain esds/ASC bytes exactly, including extensions |
| mvhd / tkhd / mdhd | Validate version, nonzero timescales and safe durations; movie duration now follows selected audio track, not removed video; preserve audio track/media timescales and durations |
| trak / mdia / minf | Remove dangling track references and alternate group in extraction; ISO soun handler and self-contained dref; remove QT minf handler |
| stbl / stts / stsc / stsz | Keep compressed sample ordering/timing; audit stts sample count against stsz, time sum against mdhd, stsc first-chunk/order/sample-description IDs and sample totals |
| stco / co64 / sample offsets | Verify original chunks lie within source mdat; calculate all new offsets AFTER rebuilding variable-size headers; support both offset widths; reject overflow |
| edts / elst | Preserve AAC priming and leading-empty edits; validate version/length/rate/timeline bounds and total track duration; unsupported playback-rate edits fail explicitly, never silently stripped |

Additional local input diagnostics include source sample-entry version, original esds location, ASC object type/rate/channel configuration, channel count/sample rate, chunk/sample counts, audio bytes, timescales/durations, edit-list presence and first/end offsets. Build ID: `2026-09-30-iso-aac-remux-v3`. A malformed/unsupported header now produces a specific pre-decode error instead of forwarding an invalid remux. AAC object type indication other than MPEG-4 Audio (0x40) is explicitly unsupported by this normalizer; underlying browser AAC profile support still applies. ALAC remains on its existing sample-entry path.

The original compressed movie remains unchanged for LISTEN and SAVE. No video ArrayBuffer, transcoding, full-PCM duplicate, additional AudioContext, playback node, gain/sync change or UI change is introduced. Header work remains bounded by the existing 32 MiB moov cap. The existing transient one-file full PCM decode, serialized imports, IndexedDB chunks, shared same-file A/B assets and eight-chunk playback cache remain. This is not a claim that arbitrarily long recordings fit every iPhone's memory.

### Alternative PCM route considered

An original Blob URL could feed HTMLMediaElement → MediaElementAudioSourceNode → AudioWorklet → bounded PCM storage without copying the whole compressed movie. However, [Web Audio](https://www.w3.org/TR/webaudio-1.0/#MediaElementAudioSourceNode) routes that source through a realtime AudioContext, not the existing offline file decode. Capturing a complete 13-minute file would depend on realtime playback/foreground/user activation, interruption handling, resampling and a new complete-recording timeline. Playback speedup/seek capture cannot safely guarantee all original samples or existing sync/analysis semantics. This would be a material behavior change, not a transparent fallback, and is **not implemented**. There is also no full-original-MOV decode retry, which would reintroduce a full-video input buffer.

### Regression evidence and reproduction

- All seven mandatory Node suites PASS: 9/16/11/2/3/**19**/1 groups. Four new parser groups cover v0/v1/v2 + stco/co64, exact ASC and compressed payload, priming/empty edits, movie duration, malformed configs and inconsistent tables/timescales. Earlier artificial parser fixtures now include actual sound headers, ASC and timing tables instead of structurally incomplete stubs.
- Browser skill, desktop Chromium, full landscape aggregate: **237 checks PASS**. Four new assertions require the supplied camera fixture to match avc1 + **single enabled AAC ID 2**, QT v1/wave input, ISO v0/direct esds output, byte-exact descriptors and relocated offsets. Existing native decode verifies exact PCM length/samples, A/B commits, same-file sharing, LISTEN transport/video sync and all previous regression cases. This generated MOV is NOT represented as an iPhone-produced file.
- Independent FFmpeg 7.1 decode of original MOV and normalized M4A produced identical float-PCM SHA256: `f3124547fc53068ab8c60155641f7980b521a033a074f5246ba3d6ae95d59598`. No decoder warnings/errors. FFmpeg tolerance is additional evidence, not Safari certification.
- Optional `node tests/remux-ffmpeg.mjs /absolute/path/to/ffmpeg` checks that equality automatically using the existing `../fixtures/camera.mov`. On this restricted Windows host Node child-process launch returned EPERM, so the same check was run with the export mode below and FFmpeg directly; do not count the blocked launcher as a passing test.

```powershell
node tests/remux-ffmpeg.mjs --export ../fixtures/camera.mov ../fixtures/normalized-camera.m4a
ffmpeg -v error -i ../fixtures/camera.mov -map 0:a:0 -c:a pcm_f32le -f hash -hash sha256 -
ffmpeg -v error -i ../fixtures/normalized-camera.m4a -map 0:a:0 -c:a pcm_f32le -f hash -hash sha256 -
```

Device follow-up: load the SAME failing MOV into A then B with this build via Photos/Take Video/Files, inspect remux検証 diagnostics, verify both complete, LISTEN video/audio playback, SEEK, A/B, AUTO/MANUAL SYNC and background return. If it still fails, retain the error plus the new remux diagnostics and share a privacy-safe failing movie/iOS version. Physical Safari acceptance and the exact original file's ASC/edit-list details remain unverified.

## iOS 18 follow-up: physical failure persists — NOT RESOLVED

**Latest evidence:** user retested on iPhone / iOS 18.7 / Safari 18.7.7 and reports the same `EncodingError: Decoding failed` at `動画内音声のデコード`, path `audio-track-remux`. File delivery, video/quicktime, avc1 video, one enabled mp4a audio track ID 2 and nonfragmented structure are confirmed. PR #10's normalization did **not** resolve the reported case. Its earlier desktop success is not a Safari success criterion. The exact failing MOV, generated remux and full previous `remux検証` record are still unavailable; requested from the user. We cannot identify the actual CoreAudio rejection from the summary alone and must not claim root cause or completion.

### Implemented diagnostic continuation (build `2026-09-30-remux-audit-v4`)

The remux bytes themselves are unchanged from PR #10. Instead of trying another speculative container variant, `auditRemuxBlob` reads the **finished Blob** back before decode, separately from builder offset calculations. It reads top-level headers, bounded moov and three <=64-byte packet probes, never a full video or another full audio input buffer. It checks the serialized chunk offsets, every chunk's sample sizes/count, correspondence with the original chunk sizes, contiguous mdat coverage through the final byte, stts/mdhd totals, single audio track/handler and self-contained data reference. Missing smhd is reported as a warning (not silently called valid). Source packet probes at first/middle/last chunks are byte-compared; these are explicitly probes, not a claim of exhaustive payload comparison. The prior exact decoded PCM tests remain separate.

`入力診断` now records:

- `remux Blob読戻し監査`: actual Blob size/MIME, ftyp major/minor/compatible brands, codec, channel count/sample rate, track duration in seconds, movie/media timescales and durations, sample count and stts run durations, first/last **sample** start offsets and last sample size, mdat atom/payload start and exclusive end, stco/co64 type/count/values, source chunk positions, byte probes, AAC object type and exact ASC hex, track ID/enabled/group/data-reference, edit-list fields, top-level atom ranges and moov atom tree. moov tree ranges are relative to the beginning of moov; chunk/sample offsets are absolute in the finished Blob.
- `decodeAudioData直前`: the actual ArrayBuffer byteLength immediately before the native call, actual Blob size/MIME, path, OfflineAudioContext sample rate/state.
- Offset logs include all entries up to 128; larger tables show the first 64 and last 64 with explicit `omitted` count. Every entry is still audited. stts/elst display is capped at 32 entries with total counts; ASC hex caps at 4096 bytes with a truncation flag. These log bounds prevent a large sample table from overwhelming mobile memory. The complete tables remain in the downloadable remux file.

### Independent audio-element probe

Only after a failed remux decode, retain **one compressed audio Blob**, not PCM or another copy of the full video. Source dialog → **入力診断（端末内のみ）** adds:

1. **抽出音声をテスト再生（診断）**: explicitly stops A/B playback (retains its position/data) and calls a separate HTMLAudioElement.play() directly from the tap. No AudioContext or MediaElementAudioSourceNode is created or attached. This is diagnostic playback, not an alternate importer. It records metadata, loadeddata/canplay, play promise, playing, actual time advancement, media error and timeout. It stops after >=0.1 seconds of progress or a 10-second bound. Merely `canPlayType`, metadata or a resolved promise is NOT called playback success.
2. **抽出M4Aを保存（診断）**: save the exact Blob passed to decodeAudioData for inspection on an actual Mac/iPhone. Contains the original audio; nothing is uploaded automatically. Saving is user-initiated and distinct from existing SAVE AUDIO.
3. **診断音声を解放**: release the failed Blob. Starting the next import also releases it; closing the diagnostic/dialog or going to background releases native playback and its object URL. Successful imports retain no diagnostic Blob. Original A/B remain unchanged after failure.

`playback-progress` with a prior EncodingError supports investigating the Web Audio decode path, but does not certify all packets or prove a specific Safari defect. Media-element failure also leaves codec support/resource limits as candidates; it **does not uniquely prove a corrupt container**. Gesture denial and timeout are logged as inconclusive. This distinction follows the [HTML media error model](https://html.spec.whatwg.org/multipage/media.html). The implementation does not require WebCodecs: [WebKit's Safari 26 announcement](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) places AudioDecoder/AudioEncoder support after the user's Safari 18 environment.

### Tests and outstanding blocker

Node parser tests add completed-Blob log assertions, first/last sample distinction, corrupted offset/size/timing/data-reference and packet-probe rejection, and bounded reads. Browser `RUN REMUX DIAGNOSTIC TESTS` injects EncodingError at the native decoder *after* real single-track MOV extraction, asserts pre-decode byte counts and old-slot preservation, then runs the same Blob through a real HTMLAudioElement; also covers policy denial, close cleanup and next-import release. The injected exception tests recovery/diagnostics and is **not a reproduction of Safari's underlying failure**. Existing four-screen/gain/sync/repeat/fullscreen/photo/recovery tests are retained.

The physical bug remains open. Next required evidence: using this build, fail the same MOV import, open input diagnostics, tap **抽出音声をテスト再生（診断）**, and share the complete log plus (if privacy permits) the saved diagnostic M4A or a short MOV that also fails. Do not repeat importing A and B before saving the first diagnostic: the next import intentionally replaces/releases it. Do not mark the issue resolved until that actual device case imports successfully.

Diagnostic checkpoint: mandatory Node suites **7/7 PASS** (9/16/11/2/3/22/1 groups); full desktop browser aggregate **249 checks PASS** (237 retained + 12 diagnostic checks); `git diff --check` PASS. Independent FFmpeg float-PCM hash remains `f3124547fc53068ab8c60155641f7980b521a033a074f5246ba3d6ae95d59598`. Actual Safari 18 acceptance remains **FAILED in the latest user report**, not cleared by these tests. PR #10 remained open/unmerged at this continuation; the new branch continues its exact commit and includes it when targeting main.

## Display / fullscreen continuation: fixes 13–20 (2026-10-01)

Continues merged PR #11 (main `349d5ae8a4a7c7404b96f9a8aaefad29ee5e76f7`). Only the requested presentation changes and their tests are included; the MOV audit/importer, chunked storage, AudioContext recovery and sync algorithms are unchanged.

- **13:** COMPARE curves and B−A differences now add the same per-side `20*log10(playbackMatchGain(side))` used by playback. This applies to FILE and AIR REC, live aligned FFT windows and stopped average analysis, MUSIC and STANDARD. Turning OFF exactly restores raw display values. Original power arrays, PCM, Original Level and SAVE AUDIO sources are unchanged. Existing raw-signal silence/Nyquist eligibility checks remain before display offsets. The existing short playback gain ramp is unchanged; visual offsets show the target coefficient immediately. Earlier documentation saying graphs remain raw with GAIN MATCH ON is superseded by this section.
- **14 / 19:** A ▶ / B ▶ / ‖ / ■ and a shared SVG repeat icon, with text aria-labels/titles. Fullscreen controls use compact labels and a one-row layout; touch targets remain at least 44 px high. Exit uses an inward-corners icon.
- **15:** DIFF bars/meters, ranked numeric bands, largest difference and highlight consume the same smoothed difference rows. MUSIC OFF / 1/6 / 1/3 changes redraw immediately; STANDARD remains fixed 1/3. No smoothing is applied to audio. COMPARE and DIFF use paired current-time FFT frames, falling back together to averages if frames are not ready.
- **16:** The duplicate DIFF FOCUS title fullscreen button is removed; the existing shared graph/waveform-area entry remains.
- **17:** LISTEN fullscreen retains its large waveform, time and seek. COMPARE and DIFF fullscreen hide the mini waveform and give its space to the graph; normal-page waveform layout is restored on exit.
- **18 / 20:** Fixed COMPARE / DIFF tabs live outside the three variable control pages at the bottom of the fullscreen dialog. Switching moves DOM elements without closing the dialog, scheduling gain automation, rebuilding audio nodes or changing position, sync, gain, smoothing or the selected control page.

### Verification

- Mandatory Node suites **7/7 PASS**: regression 9, AudioContext 16, gain 11, comparison 2, bands 3, media input 22, display-diff 2 groups.
- Native desktop Chromium browser harness at **844 × 390: 288 checks PASS** (249 retained + 39 new display/fullscreen assertions). New checks compare rendered bar heights, ranked values and highlights to the same smoothed rows, verify FILE/AIR gain compensation and exact OFF restoration, and switch graphs on all three control pages while preserving active audio and issuing no gain automation.
- Additional small-landscape **568 × 320: 39/39 PASS**; fixed buttons remain visible on all control pages, no control-row overflow, graph height retained. LISTEN's waveform-height assertion is viewport-relative rather than an absolute 150 px requirement.
- Portrait **390 × 844: 3/3 fullscreen rotation-target checks PASS** and normal-screen visual inspection. No new swipe or browser-history navigation is introduced.
- `git diff --check` PASS. Standalone `index.html` rebuilt from maintained modules.

These are desktop browser viewport tests, not physical iPhone Safari tests. In particular, the reported iOS 18.7 / Safari 18.7.7 MOV `EncodingError` remains unresolved; PR #11 diagnostics and the request for the failing remux/log are retained unchanged. This presentation PR does not claim to fix or verify that device failure.
