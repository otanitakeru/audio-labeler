import { useEffect, useRef, useState } from "react";
import { Navigate, Route, BrowserRouter as Router, Routes, useNavigate } from "react-router-dom";
import AppHeader from "./components/AppHeader";
import Dialog from "./components/Dialog";
import SettingsPanel from "./components/SettingsPanel";
import { AudioSessionProvider, useAudioSession } from "./hooks/useAudioSession";
import { DisplaySettingsProvider } from "./hooks/useDisplaySettings";
import { SegmentsProvider } from "./hooks/useSegments";
import { ShortcutBindingsProvider } from "./hooks/useShortcutBindings";
import { VadSettingsProvider } from "./hooks/useVadSettings";
import EditScreen from "./pages/EditScreen";
import HomeScreen from "./pages/HomeScreen";

function AppLayout() {
  const { uploadId, channelOutOfRange } = useAudioSession();
  const navigate = useNavigate();
  const previousUploadIdRef = useRef<string | null>(null);
  // 設定は画面遷移ではなくダイアログで開く。編集画面を残したまま(波形の再読み込みや表示位置のリセットなしに)設定を変えられるようにするため
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // 新しい音声が読み込まれた瞬間(ホーム画面/ヘッダーメニューどちらから読み込んでも)だけ編集画面へ遷移し、
  // チャンネル番号が範囲外なら直せるよう設定ダイアログも開く。
  // uploadIdが変わっていない再レンダリングでは開かない(チャンネル変更のたびに開き直さないように)
  useEffect(() => {
    if (uploadId && uploadId !== previousUploadIdRef.current) {
      navigate("/edit");
      if (channelOutOfRange) setIsSettingsOpen(true);
    }
    previousUploadIdRef.current = uploadId;
  }, [uploadId, channelOutOfRange, navigate]);

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
    </div>
  );
}

function App() {
  return (
    <AudioSessionProvider>
      <SegmentsProvider>
        <DisplaySettingsProvider>
          <ShortcutBindingsProvider>
            <VadSettingsProvider>
              <Router>
                <AppLayout />
              </Router>
            </VadSettingsProvider>
          </ShortcutBindingsProvider>
        </DisplaySettingsProvider>
      </SegmentsProvider>
    </AudioSessionProvider>
  );
}

export default App;
