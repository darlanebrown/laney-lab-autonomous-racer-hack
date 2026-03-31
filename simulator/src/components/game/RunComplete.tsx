'use client';

import { useEffect, useState } from 'react';
import { useGameStore } from '@/lib/stores/game-store';
import { saveRun, getStats, updateRunCaptureStatus, type AccumulatedStats, type TrainingRun } from '@/lib/data/training-data';
import { finalizeCapturedFramesToIndexedDb, getPendingCaptureFrameCount } from '@/lib/capture/frame-capture';
import { downloadBlob, exportRunCaptureZip } from '@/lib/capture/frame-store';
import { enqueueRunForSync, flushRunSyncQueue } from '@/lib/api/run-sync-queue';
import { CheckCircle, Database, Trophy, Timer, ChevronRight, Camera, Download } from 'lucide-react';

/**
 * Run complete overlay — shown after a driving session ends.
 * Saves the training data and shows a summary.
 */
export function RunComplete() {
  const mode = useGameStore((s) => s.mode);
  const [saved, setSaved] = useState(false);
  const [stats, setStats] = useState<AccumulatedStats | null>(null);
  const [runFrames, setRunFrames] = useState(0);
  const [runLaps, setRunLaps] = useState(0);
  const [captureFrames, setCaptureFrames] = useState(0);
  const [captureStatus, setCaptureStatus] = useState<'idle' | 'saving' | 'saved' | 'none' | 'error'>('idle');
  const [savedRun, setSavedRun] = useState<TrainingRun | null>(null);
  const [downloadingCapture, setDownloadingCapture] = useState(false);

  useEffect(() => {
    if (mode !== 'run-complete') {
      setSaved(false);
      setSavedRun(null);
      setCaptureStatus('idle');
      setCaptureFrames(0);
      return;
    }
    if (saved) return;

    const pendingCaptureFrames = getPendingCaptureFrameCount();
    setCaptureFrames(pendingCaptureFrames);

    void (async () => {
      const store = useGameStore.getState();
      const frames = store.controlLog.length;
      const laps = store.lapCount;

      let run: TrainingRun | null = null;
      if (frames > 0) {
        run = saveRun({
          trackId: store.trackId,
          driveMode: store.driveMode,
          lapCount: laps,
          frames,
          bestLapMs: store.bestLapMs,
          offTrackCount: store.offTrackCount,
          durationMs: store.elapsedMs,
          controlLog: store.controlLog,
          hasFrameCapture: false,
          captureFrameCount: 0,
        });
      }

      if (run && pendingCaptureFrames > 0) {
        try {
          setCaptureStatus('saving');
          const savedCaptureFrames = await finalizeCapturedFramesToIndexedDb({
            runId: run.id,
            trackId: run.trackId,
            driveMode: run.driveMode,
            durationMs: run.durationMs,
            lapCount: run.lapCount,
            bestLapMs: run.bestLapMs,
            offTrackCount: run.offTrackCount,
          });
          updateRunCaptureStatus(run.id, {
            hasFrameCapture: savedCaptureFrames > 0,
            captureFrameCount: savedCaptureFrames,
          });
          enqueueRunForSync(run.id);
          void flushRunSyncQueue();
          setCaptureFrames(savedCaptureFrames);
          setCaptureStatus(savedCaptureFrames > 0 ? 'saved' : 'none');
        } catch (error) {
          console.error('Failed to persist captured frames to IndexedDB', error);
          setCaptureStatus('error');
        }
      } else {
        setCaptureStatus(pendingCaptureFrames > 0 ? 'error' : 'none');
        if (run) {
          enqueueRunForSync(run.id);
          void flushRunSyncQueue();
        }
      }

      setSavedRun(run);
      setRunFrames(frames);
      setRunLaps(laps);
      setStats(getStats());
      setSaved(true);
    })();
  }, [mode, saved]);

  if (mode !== 'run-complete') return null;

  function backToMenu() {
    useGameStore.getState().setMode('menu');
  }

  async function downloadRunCapture() {
    if (!savedRun) return;
    setDownloadingCapture(true);
    try {
      const zip = await exportRunCaptureZip(savedRun.id);
      downloadBlob(zip, `deepracer-run-${savedRun.id}.zip`);
    } catch (error) {
      console.error(error);
      alert('No image capture export is available for this run yet.');
    } finally {
      setDownloadingCapture(false);
    }
  }

  return (
    <div className="absolute inset-0 z-30 bg-black/80 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-md w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto" />
          <h2 className="text-2xl font-bold text-white">Run Complete</h2>
          <p className="text-sm text-gray-400">Training data saved!</p>
        </div>

        {/* This run */}
        <div className="bg-white/5 rounded-xl p-4 space-y-3">
          <div className="text-xs text-gray-400 uppercase tracking-wider font-medium">This Run</div>
            <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-yellow-400" />
              <div>
                <div className="text-lg font-bold text-white">{runLaps}</div>
                <div className="text-[10px] text-gray-500">Laps</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-400" />
              <div>
                <div className="text-lg font-bold text-white">{runFrames.toLocaleString()}</div>
                <div className="text-[10px] text-gray-500">Data Frames</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-cyan-400" />
              <div>
                <div className="text-lg font-bold text-white">{captureFrames.toLocaleString()}</div>
                <div className="text-[10px] text-gray-500">Camera Frames</div>
              </div>
            </div>
          </div>
        </div>

        {/* Accumulated stats */}
        {stats && (
          <div className="bg-white/5 rounded-xl p-4 space-y-3">
            <div className="text-xs text-gray-400 uppercase tracking-wider font-medium">All-Time (This Browser)</div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-lg font-bold text-green-400">{stats.totalRuns}</div>
                <div className="text-[10px] text-gray-500">Runs</div>
              </div>
              <div>
                <div className="text-lg font-bold text-green-400">{stats.totalLaps}</div>
                <div className="text-[10px] text-gray-500">Laps</div>
              </div>
              <div>
                <div className="text-lg font-bold text-green-400">{stats.totalFrames.toLocaleString()}</div>
                <div className="text-[10px] text-gray-500">Frames</div>
              </div>
            </div>
            {stats.bestLapMs !== null && (
              <div className="text-center text-xs text-gray-400">
                <Timer className="w-3 h-3 inline mr-1" />
                All-time best lap: <span className="text-green-400 font-mono">{(stats.bestLapMs / 1000).toFixed(2)}s</span>
              </div>
            )}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={downloadRunCapture}
          disabled={!savedRun || captureStatus === 'saving' || captureFrames === 0 || downloadingCapture}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-cyan-700/80 enabled:hover:bg-cyan-600 disabled:bg-gray-800 disabled:text-gray-500 text-white font-medium transition-colors"
        >
          <Download className="w-4 h-4" />
          {downloadingCapture ? 'Preparing .zip...' : 'Download Run (.zip)'}
        </button>
        <button
          onClick={backToMenu}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
        >
          Continue <ChevronRight className="w-4 h-4" />
        </button>

        <p className="text-center text-[10px] text-gray-600">
          {captureStatus === 'saving' && 'Saving camera frames to IndexedDB...'}
          {captureStatus === 'saved' && 'Telemetry + camera frames saved locally. Export .zip to train offline.'}
          {captureStatus === 'none' && 'Telemetry saved locally. Camera capture was not available for this run.'}
          {captureStatus === 'error' && 'Telemetry saved, but camera frames failed to save. Check browser storage permissions.'}
        </p>
      </div>
    </div>
  );
}
