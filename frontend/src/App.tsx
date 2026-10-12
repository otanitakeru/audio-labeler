import { useEffect, useRef, useState } from "react";
import { Navigate, Route, BrowserRouter as Router, Routes, useNavigate } from "react-router-dom";
import AppHeader from "./components/AppHeader";
import AudioLoadDialog from "./components/AudioLoadDialog";
import ConfirmDialog from "./components/ConfirmDialog";
import Dialog from "./components/Dialog";
import SettingsPanel from "./components/SettingsPanel";
import { AudioFileOpenerProvider, useAudioFileOpener } from "./hooks/useAudioFileOpener";
import { AudioSessionProvider, useAudioSession } from "./hooks/useAudioSession";
import { DisplaySettingsProvider } from "./hooks/useDisplaySettings";
import { EditingSettingsProvider } from "./hooks/useEditingSettings";
import { SegmentsProvider } from "./hooks/useSegments";
import { ShortcutBindingsProvider } from "./hooks/useShortcutBindings";
import { SpeechDetectionProvider } from "./hooks/useSpeechDetection";
import { TranscriptionProvider } from "./hooks/useTranscription";
import { TranscriptionSettingsProvider } from "./hooks/useTranscriptionSettings";
import { useUnsavedChangesWarning } from "./hooks/useUnsavedChangesWarning";
import { VadSettingsProvider } from "./hooks/useVadSettings";
import { ViewOptionsProvider } from "./hooks/useViewOptions";
import EditScreen from "./pages/EditScreen";
import HomeScreen from "./pages/HomeScreen";

function AppLayout() {
  const { uploadId } = useAudioSession();
  const { isConfirmingDiscard, confirmDiscard, cancelDiscard, pendingAudioInfo, confirmLoad, cancelLoad } =
    useAudioFileOpener();
  const navigate = useNavigate();
  const previousUploadIdRef = useRef<string | null>(null);
  // 設定は画面遷移ではなくダイアログで開く。編集画面を残したまま(波形の再読み込みや表示位置のリセットなしに)設定を変えられるようにするため
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  useUnsavedChangesWarning();

  // 新しい音声が読み込まれた瞬間(ホーム画面/ヘッダーメニューどちらから読み込んでも)だけ編集画面へ遷移する
  useEffect(() => {
    if (uploadId && uploadId !== previousUploadIdRef.current) navigate("/edit");
    previousUploadIdRef.current = uploadId;
  }, [uploadId, navigate]);

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader onOpenSettings={() => setIsSettingsOpen(true)} />
      <main className="flex flex-1 flex-col gap-4 p-4">
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/edit" element={<EditScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Dialog open={isSettingsOpen} title="設定" onClose={() => setIsSettingsOpen(false)}>
        <SettingsPanel onClose={() => setIsSettingsOpen(false)} />
      </Dialog>
      {/* 音声の読み込みはホーム画面とヘッダーのどちらからも始まるため、確認と読み込みのダイアログはここで1つだけ出す */}
      <ConfirmDialog
        open={isConfirmingDiscard}
        title="新規音声を読み込む"
        message="書き出していないラベルは消えます。新しい音声を読み込みますか?"
        confirmLabel="読み込む"
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
      />
      <AudioLoadDialog info={pendingAudioInfo} onLoad={confirmLoad} onCancel={cancelLoad} />
    </div>
  );
}

function App() {
  return (
    <AudioSessionProvider>
      <SegmentsProvider>
        <DisplaySettingsProvider>
          <ViewOptionsProvider>
            <ShortcutBindingsProvider>
              <VadSettingsProvider>
                <SpeechDetectionProvider>
                  <TranscriptionSettingsProvider>
                    <TranscriptionProvider>
                      <EditingSettingsProvider>
                        <AudioFileOpenerProvider>
                          <Router>
                            <AppLayout />
                          </Router>
                        </AudioFileOpenerProvider>
                      </EditingSettingsProvider>
                    </TranscriptionProvider>
                  </TranscriptionSettingsProvider>
                </SpeechDetectionProvider>
              </VadSettingsProvider>
            </ShortcutBindingsProvider>
          </ViewOptionsProvider>
        </DisplaySettingsProvider>
      </SegmentsProvider>
    </AudioSessionProvider>
  );
}

export default App;
