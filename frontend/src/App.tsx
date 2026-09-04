import { useEffect, useRef } from "react";
import { Navigate, Route, BrowserRouter as Router, Routes, useNavigate } from "react-router-dom";
import AppHeader from "./components/AppHeader";
import { AudioSessionProvider, useAudioSession } from "./hooks/useAudioSession";
import { DisplaySettingsProvider } from "./hooks/useDisplaySettings";
import { ShortcutBindingsProvider } from "./hooks/useShortcutBindings";
import EditScreen from "./pages/EditScreen";
import HomeScreen from "./pages/HomeScreen";
import SettingsScreen from "./pages/SettingsScreen";

function AppLayout() {
  const { uploadId, channel, channelCount } = useAudioSession();
  const navigate = useNavigate();
  const previousUploadIdRef = useRef<string | null>(null);

  // 新しい音声が読み込まれた瞬間(ホーム画面/ヘッダーメニューどちらから読み込んでも)だけ、
  // チャンネルの妥当性に応じて編集画面または設定画面へ自動遷移する。
  // uploadIdが変わっていない再レンダリングでは遷移させない(設定画面に留まれるように)
  useEffect(() => {
    if (uploadId && uploadId !== previousUploadIdRef.current) {
      const channelOutOfRange = channel < 0 || channel >= channelCount;
      navigate(channelOutOfRange ? "/settings" : "/edit");
    }
    previousUploadIdRef.current = uploadId;
  }, [uploadId, channel, channelCount, navigate]);

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="flex flex-1 flex-col gap-4 p-4">
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/edit" element={<EditScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <AudioSessionProvider>
      <DisplaySettingsProvider>
        <ShortcutBindingsProvider>
          <Router>
            <AppLayout />
          </Router>
        </ShortcutBindingsProvider>
      </DisplaySettingsProvider>
    </AudioSessionProvider>
  );
}

export default App;
