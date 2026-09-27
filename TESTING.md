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
node tests/server.mjs
```

Open `http://127.0.0.1:8765/tests` and click RUN NATIVE TESTS. The test harness uses a synthetic MediaStream for recording, never a physical microphone, and adds no code to the shipped HTML. Only the harness permits same-origin fixture fetches; the production CSP is unchanged. Browser tests intentionally write test memo/reference values and restore their previous values.

To run RUN 13 MIN MP4 TEST, place `13min.mp4` and `13min-distinct.mp4` in the checkout's sibling `fixtures/` directory. Fixtures used here: synthetic 780-second H.264 16×16/1fps video with AAC 48kHz stereo audio. The second fixture is a remux with different container metadata, forcing independent byte identity and an independent decode. It is not a second acoustic performance. Example using FFmpeg:

```sh
ffmpeg -f lavfi -i 'color=c=black:s=16x16:r=1:d=780' -f lavfi -i 'aevalsrc=0.15*sin(2*PI*440*t)*(0.6+0.4*sin(2*PI*0.37*t))|0.15*sin(2*PI*880*t):s=48000:d=780' -c:v libx264 -preset ultrafast -c:a aac -b:a 96k -movflags +faststart ../fixtures/13min.mp4
ffmpeg -i ../fixtures/13min.mp4 -map 0 -c copy -metadata title='independent source fixture' ../fixtures/13min-distinct.mp4
```

The standalone HTML embeds `memory-audio.js` and `stream-analysis.js`; edit these sources, then run `node tools/build.mjs`. No runtime external script is required.

## Required iPhone acceptance test (not performed here)

Executed on 2026-09-27: 9 Node regression groups passed; 26 native browser checks passed in the Windows Codex in-app browser, including sample-exact offline rendering across a chunk boundary and synthetic-input MediaRecorder; 7 long-MP4 checks passed (same source and independent remux). These do not constitute iPhone/Safari device verification or an RSS measurement.

Record iPhone model, iOS/Safari version, source size/codec/duration, free storage and whether normal/private mode. Use the original failing MP4, not only the small synthetic video fixture.

1. Load the original 13-minute MP4 into A then the same file into B; repeat B replacement and CLEAR/reload at least five times. Verify no reload and original SAVE AUDIO output.
2. Load a genuinely different long MP4 into B with A retained; repeat replacement. Test long WAV/M4A and AIR REC as well. Watch process memory using connected Safari Web Inspector/device tooling where available.
3. Play continuously across several chunk boundaries and the entire file; listen for clicks/dropouts. Switch A/B repeatedly at the beginning, middle and end. Check seeking, PAUSE/STOP, manual ±1/±10 ms, positive/negative offsets and AUTO SYNC against known signals.
4. Verify waveform and both frequency displays, stereo content and levels, recording stop/interruption, SAVE AUDIO, reference and memo. Background/foreground the page and verify the existing pause/record-stop behavior.
5. Test decode failure, low storage/private mode, rapid switching/seek/STOP while reads are pending, reload/close, and two tabs. Confirm no wrong slot replacement, stale playback, loss of the other slot, or restoration of expired audio.

Do not mark this as iPhone-verified until those device tests pass.
