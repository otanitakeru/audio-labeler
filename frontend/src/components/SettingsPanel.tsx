import { useState } from "react";
import Button from "./Button";
import ChannelInput from "./ChannelInput";
import NumberInput from "./NumberInput";
import ShortcutBindingRow from "./ShortcutBindingRow";
import { useAudioSession } from "../hooks/useAudioSession";
import {
  DEFAULT_MAIN_WAVEFORM_HEIGHT,
  DEFAULT_MINIMAP_HEIGHT,
  MAX_MAIN_WAVEFORM_HEIGHT,
  MAX_MINIMAP_HEIGHT,
  MIN_MAIN_WAVEFORM_HEIGHT,
  MIN_MINIMAP_HEIGHT,
  useDisplaySettings,
} from "../hooks/useDisplaySettings";
import { useShortcutBindings } from "../hooks/useShortcutBindings";
import { SHORTCUT_CATALOG, SHORTCUT_GROUPS } from "../shortcuts/catalog";

const CATEGORIES = ["音声読み込み", "表示設定", "ショートカットキー"] as const;
type Category = (typeof CATEGORIES)[number];

type SettingsPanelProps = {
  onClose: () => void;
};

// 変更はOKを押すまで下書き(draft*)にとどめ、OKでまとめて反映する。キャンセル・Esc・背景クリックで閉じたときは
// ダイアログごと中身が破棄されるため、下書きも捨てられる。波形の高さなどを変えるたびに背後の波形が読み込み直されるのも防げる
function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [category, setCategory] = useState<Category>(CATEGORIES[0]);
  const { uploadId, channel, channelCount, setChannel } = useAudioSession();
  const { mainWaveformHeight, setMainWaveformHeight, minimapHeight, setMinimapHeight } = useDisplaySettings();
  const { bindings, setBindings } = useShortcutBindings();

  const [draftChannel, setDraftChannel] = useState(channel);
  const [draftMainWaveformHeight, setDraftMainWaveformHeight] = useState(mainWaveformHeight);
  const [draftMinimapHeight, setDraftMinimapHeight] = useState(minimapHeight);
  const [draftBindings, setDraftBindings] = useState(bindings);

  const draftChannelOutOfRange = uploadId !== null && draftChannel >= channelCount;

  const applyAndClose = () => {
    setChannel(draftChannel);
    setMainWaveformHeight(draftMainWaveformHeight);
    setMinimapHeight(draftMinimapHeight);
    setBindings(draftBindings);
    onClose();
  };

  return (
    // カテゴリを切り替えてもダイアログの大きさが変わらないよう、大きさを固定する
    <div className="flex h-[min(760px,75vh)] w-[min(1080px,85vw)] flex-col gap-5">
      <div className="flex min-h-0 flex-1 gap-8">
        <nav className="w-48 shrink-0 border-r border-gray-300 pr-4">
          <ul className="flex flex-col gap-1">
            {CATEGORIES.map((c) => (
              <li key={c}>
                <button
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`w-full cursor-pointer rounded px-2 py-1 text-left font-semibold ${
                    c === category ? "bg-gray-200 text-gray-900" : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {c}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {category === "音声読み込み" && (
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto">
            <h2 className="m-0 text-xl font-semibold text-gray-900">音声読み込み</h2>

            <div className="flex flex-col gap-2">
              <div className="font-semibold text-gray-900">チャンネル</div>
              <p className="m-0 text-sm text-gray-500">
                読み込む音声ファイルのうち、使用するチャンネル番号を指定します。
              </p>
              <ChannelInput channel={draftChannel} onChangeChannel={setDraftChannel} />
              {draftChannelOutOfRange && (
                <p className="m-0 text-sm text-red-600">
                  読み込んだファイルに ch{draftChannel} は存在しません(0〜{channelCount - 1}で指定してください)
                </p>
              )}
            </div>
          </div>
        )}

        {category === "表示設定" && (
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto">
            <h2 className="m-0 text-xl font-semibold text-gray-900">表示設定</h2>

            <div className="flex flex-col gap-2">
              <div className="font-semibold text-gray-900">波形の高さ</div>
              <p className="m-0 text-sm text-gray-500">編集画面で拡大表示する波形の縦幅を調整します。</p>
              <div className="flex flex-wrap items-center gap-3">
                <NumberInput
                  unit="px"
                  min={MIN_MAIN_WAVEFORM_HEIGHT}
                  max={MAX_MAIN_WAVEFORM_HEIGHT}
                  value={draftMainWaveformHeight}
                  onChange={setDraftMainWaveformHeight}
                />
                <button
                  type="button"
                  onClick={() => setDraftMainWaveformHeight(DEFAULT_MAIN_WAVEFORM_HEIGHT)}
                  className="cursor-pointer rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  デフォルトに戻す
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="font-semibold text-gray-900">全体波形の高さ</div>
              <p className="m-0 text-sm text-gray-500">
                音声全体を縮小表示する波形(現在の表示範囲がハイライトされます)の縦幅を調整します。
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <NumberInput
                  unit="px"
                  min={MIN_MINIMAP_HEIGHT}
                  max={MAX_MINIMAP_HEIGHT}
                  value={draftMinimapHeight}
                  onChange={setDraftMinimapHeight}
                />
                <button
                  type="button"
                  onClick={() => setDraftMinimapHeight(DEFAULT_MINIMAP_HEIGHT)}
                  className="cursor-pointer rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  デフォルトに戻す
                </button>
              </div>
            </div>
          </div>
        )}

        {category === "ショートカットキー" && (
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto">
            <h2 className="m-0 text-xl font-semibold text-gray-900">ショートカットキー</h2>

            {SHORTCUT_GROUPS.map((group) => (
              <div key={group} className="flex flex-col gap-3">
                <div className="font-semibold text-gray-900">{group}</div>
                {SHORTCUT_CATALOG.filter((def) => def.group === group).map((def) => (
                  <ShortcutBindingRow
                    key={def.id}
                    def={def}
                    bindings={draftBindings}
                    onChange={(combo) => setDraftBindings((prev) => ({ ...prev, [def.id]: combo }))}
                  />
                ))}
              </div>
            ))}

            <p className="m-0 text-sm text-gray-500">Cmd(Ctrl) + スクロールで波形を横方向に拡大/縮小できます。</p>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 border-t border-gray-300 pt-4">
        <Button variant="secondary" onClick={onClose}>
          キャンセル
        </Button>
        <Button variant="primary" onClick={applyAndClose}>
          OK
        </Button>
      </div>
    </div>
  );
}

export default SettingsPanel;
