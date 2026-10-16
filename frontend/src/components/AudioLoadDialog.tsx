import { useEffect, useRef, useState } from "react";
import AudioFileDetails from "./AudioFileDetails";
import Button from "./Button";
import ChannelInput from "./ChannelInput";
import Dialog from "./Dialog";
import { Radio } from "./SettingFields";
import VadPresetSelect from "./VadPresetSelect";
import type { AudioLoadOptions } from "../hooks/useAudioFileOpener";
import type { AudioUploadProgress } from "../hooks/useAudioSession";
import { readLabelFile } from "../hooks/useLabelFile";
import { useLastAudioLoadChoices } from "../hooks/useLastAudioLoadChoices";
import { useVadSettings } from "../hooks/useVadSettings";
import type { LabeledRange } from "../formats/labelFormat";
import type { AfterLoadProcessing, AudioFileInfo } from "../types";

const AFTER_LOAD_PROCESSING_OPTIONS: { value: AfterLoadProcessing; label: string }[] = [
  { value: "none", label: "しない" },
  { value: "speechDetection", label: "自動検出まで" },
  { value: "transcription", label: "文字起こしまで" },
];

// ラベルファイルを選んだときは自動検出しない(PLAN.md 4章-1)。文字起こしは自動検出を挟まないため「まで」を付けない
const AFTER_LOAD_PROCESSING_OPTIONS_WITH_LABELS: { value: AfterLoadProcessing; label: string }[] = [
  { value: "none", label: "しない" },
  { value: "transcription", label: "文字起こし" },
];

type LabelFileSelection = { filename: string; ranges: LabeledRange[] | null; error: string | null };

type AudioLoadFormProps = {
  info: AudioFileInfo;
  onLoad: (options: AudioLoadOptions) => void;
  onCancel: () => void;
};

function AudioLoadForm({ info, onLoad, onCancel }: AudioLoadFormProps) {
  const { lastChoices, saveChoices } = useLastAudioLoadChoices();
  // 前回のチャンネルがこの音声にないとき(前回は2chでch1、今回は1chなど)は先頭にする。
  // 1chの音声ではチャンネル欄を出さないため、そのままだと直せずに読み込めなくなる
  const [channel, setChannel] = useState(lastChoices.channel < info.channelCount ? lastChoices.channel : 0);
  const [labelFile, setLabelFile] = useState<LabelFileSelection | null>(null);
  const [processing, setProcessing] = useState(lastChoices.afterLoadProcessing);
  // 前回使ったプリセットは編集画面の「自動検出」ボタンと共通なので、読み込みの選択(lastChoices)とは別に持つ
  const { vadSettings, lastUsedPresets } = useVadSettings();
  const [vadPresetId, setVadPresetId] = useState(lastUsedPresets.wholeAudio.id);
  // アップロード中の表示から切り替わったときは、ダイアログはもう開いていてDialog側でフォーカスを当て直さないため、
  // ここで「読み込む」ボタンに当て、そのままEnterで読み込めるようにする
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, []);

  const hasLabels = labelFile !== null;
  // ラベルファイルを外したときに元の選択へ戻せるよう、選択そのものは書き換えずに表示と読み込みだけ読み替える
  const effectiveProcessing = hasLabels && processing === "speechDetection" ? "none" : processing;
  // ラベルファイルを選んだときの文字起こしは、自動検出を挟まない
  const runsSpeechDetection = !hasLabels && effectiveProcessing !== "none";
  const channelOutOfRange = channel >= info.channelCount;
  const canLoad = !channelOutOfRange && labelFile?.error == null;

  const selectLabelFile = async (file: File) => {
    const result = await readLabelFile(file, info.durationSec);
    setLabelFile(
      result.success
        ? { filename: file.name, ranges: result.ranges, error: null }
        : { filename: file.name, ranges: null, error: result.error },
    );
  };

  return (
    <form
      ref={formRef}
      className="flex w-[min(480px,85vw)] flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canLoad) return;
        // チャンネルは選んだときだけ覚える(1chの音声で0に戻さない)。処理は読み替える前の選択を覚え、
        // ラベルファイルを選んだために自動検出が使えなかっただけのときに、次回の初期値が「しない」にならないようにする
        saveChoices({
          channel: info.channelCount > 1 ? channel : lastChoices.channel,
          afterLoadProcessing: processing,
        });
        onLoad({
          channel,
          labelRanges: labelFile?.ranges ?? null,
          afterLoadProcessing: effectiveProcessing,
          vadPresetId,
        });
      }}
    >
      <div className="flex flex-wrap items-center gap-3 text-gray-900">
        <span>{info.filename}</span>
        <AudioFileDetails info={info} channel={channel} />
      </div>

      {/* 1チャンネルなら選ぶ余地がないため出さない */}
      {info.channelCount > 1 && (
        <div className="flex flex-col gap-2">
          <div className="font-semibold text-gray-900">チャンネル</div>
          <ChannelInput channel={channel} onChangeChannel={setChannel} />
          {channelOutOfRange && (
            <p className="m-0 text-sm text-red-600">
              ch{channel} はありません(0〜{info.channelCount - 1}で指定してください)
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="font-semibold text-gray-900">ラベル</div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
            ファイルを選択
            <input
              type="file"
              accept=".txt,.tsv,text/plain"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) selectLabelFile(file);
                e.target.value = "";
              }}
            />
          </label>
          {labelFile && (
            <>
              <span className="text-gray-900">{labelFile.filename}</span>
              <button
                type="button"
                onClick={() => setLabelFile(null)}
                className="cursor-pointer rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
              >
                外す
              </button>
            </>
          )}
        </div>
        {labelFile?.error && <p className="m-0 text-sm text-red-600">{labelFile.error}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <div className="font-semibold text-gray-900">読み込み後の処理</div>
        {(hasLabels ? AFTER_LOAD_PROCESSING_OPTIONS_WITH_LABELS : AFTER_LOAD_PROCESSING_OPTIONS).map((option) => (
          <Radio
            key={option.value}
            name="afterLoadProcessing"
            checked={effectiveProcessing === option.value}
            label={option.label}
            onSelect={() => setProcessing(option.value)}
          />
        ))}
      </div>

      {runsSpeechDetection && (
        <div className="flex flex-col gap-2">
          <div className="font-semibold text-gray-900">自動検出のプリセット</div>
          <VadPresetSelect presets={vadSettings.presets} value={vadPresetId} onChange={setVadPresetId} />
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>
          キャンセル
        </Button>
        <Button variant="primary" type="submit" disabled={!canLoad} autoFocusInDialog>
          読み込む
        </Button>
      </div>
    </form>
  );
}

type AudioUploadingViewProps = {
  progress: AudioUploadProgress;
  onCancel: () => void;
};

// アップロードが終わるまでの表示。大きなファイルでは数十秒かかるため、ファイルを選んだらすぐにダイアログを開き、
// 進み具合を出す(何も出さないと、ファイルを選べなかったように見えるため)
function AudioUploadingView({ progress, onCancel }: AudioUploadingViewProps) {
  const isSent = progress.sentRatio >= 1;
  return (
    <div className="flex w-[min(480px,85vw)] flex-col gap-6">
      <div className="text-gray-900">{progress.filename}</div>
      <div className="flex flex-col gap-2">
        <div className="h-2 overflow-hidden rounded-full bg-gray-200">
          <div
            // 送り終えた後(バックエンドの保存・確認を待つ間)は進み具合が分からないため、満たしたままゆっくり濃淡を変え、
            // 止まっていないことを示す
            className={`h-full bg-gray-900 transition-[width] duration-200 ${isSent ? "animate-pulse" : ""}`}
            style={{ width: `${progress.sentRatio * 100}%` }}
          />
        </div>
        <div className="text-sm text-gray-500">
          {isSent ? "ファイルを確認中..." : `アップロード中... ${Math.floor(progress.sentRatio * 100)}%`}
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>
          キャンセル
        </Button>
        {/* アップロード後に出す欄と同じ位置に、押せない状態で置いておく(終わったときにボタンの位置が動かないように) */}
        <Button variant="primary" disabled>
          読み込む
        </Button>
      </div>
    </div>
  );
}

type AudioLoadDialogProps = {
  // アップロード中の進み具合。アップロードしていなければnull
  uploadProgress: AudioUploadProgress | null;
  // アップロード済みで、読み込み方を決めてもらう音声。アップロード中・閉じているときはnull
  info: AudioFileInfo | null;
  onLoad: (options: AudioLoadOptions) => void;
  onCancel: () => void;
  onCancelUpload: () => void;
};

// 音声を読み込む前に、チャンネル・既存のラベル・読み込み後の処理をまとめて決めるダイアログ(PLAN.md 4章-1)。
// ファイルを選んだらすぐに開き、アップロードが終わるまでは進み具合を、終わったら各項目を出す。
// 各項目の初期値は前回選んだ内容にし、変えるものがなければEnterで読み込めるようにする
function AudioLoadDialog({ uploadProgress, info, onLoad, onCancel, onCancelUpload }: AudioLoadDialogProps) {
  return (
    <Dialog
      open={uploadProgress !== null || info !== null}
      title="音声を読み込む"
      onClose={info ? onCancel : onCancelUpload}
    >
      {info ? (
        <AudioLoadForm info={info} onLoad={onLoad} onCancel={onCancel} />
      ) : (
        uploadProgress && <AudioUploadingView progress={uploadProgress} onCancel={onCancelUpload} />
      )}
    </Dialog>
  );
}

export default AudioLoadDialog;
