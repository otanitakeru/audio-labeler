// docs/images/ のスクリーンショットを撮り直すスクリプト。手順は docs/README.md の「画像の撮り直し」を参照。
// 起動中のアプリ(http://localhost:5173)をヘッドレスの Chrome で操作して撮る。
//
// 使い方: node capture.mjs [音声ファイル]
//   音声ファイルを省略したときは mock-data/mock_wav.wav を使う
// 環境変数:
//   CHROME_PATH  Chrome の実行ファイル(既定は Mac の標準の場所)
//   APP_URL      アプリの URL(既定 http://localhost:5173)

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_DIR = resolve(ROOT, "docs/images");
const WAV = resolve(process.argv[2] ?? resolve(ROOT, "mock-data/mock_wav.wav"));
const CHROME_PATH =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const APP_URL = process.env.APP_URL ?? "http://localhost:5173";

// 画像に収まるよう、波形の高さを既定の600pxから縮める。ほかの設定は既定値のまま撮る
const MAIN_WAVEFORM_HEIGHT = 260;
// 以下は、波形の各帯の位置を求めるためのアプリ側の値(useDisplaySettings・timeAxisView・useWavesurfer)
const MINIMAP_HEIGHT = 60;
const TIME_AXIS_HEIGHT = 20;
const LABEL_BAR_HEIGHT = 40;
const ADJUST_BAR_HEIGHT = 14;
const WIDTH = 1280;
// 自動検出で見つかった先頭から順に入れるラベル
const LABELS = ["おはようございます", "今日は晴れです", "よろしくお願いします"];

if (!existsSync(WAV)) {
  console.error(
    `音声ファイルがありません: ${WAV}\n使い方: node capture.mjs <音声ファイル>`,
  );
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  defaultViewport: { width: WIDTH, height: 720, deviceScaleFactor: 1 },
  args: ["--lang=ja-JP"],
});
const page = await browser.newPage();

const shot = (name, options = {}) =>
  page.screenshot({ path: `${OUT_DIR}/${name}.png`, ...options });

const clickText = async (text) => {
  const el = await page.waitForSelector(
    `::-p-xpath(//*[self::button or self::label or self::a][normalize-space(.)='${text}'])`,
    { timeout: 5000 },
  );
  await el.click();
};

// 「表示」メニューの項目はチェックの印を含むため、文言の部分一致で探す
const clickViewMenuItem = async (text) => {
  const el = await page.waitForSelector(
    `::-p-xpath(//button[@role='menuitemcheckbox'][contains(., '${text}')])`,
    { timeout: 5000 },
  );
  await el.click();
};

// 開いているダイアログのまわりだけを切り取る
const dialogClip = async () => {
  const r = await page.evaluate(() => {
    const rect = [...document.querySelectorAll("dialog")]
      .find((d) => d.open)
      .getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  const margin = 16;
  return {
    x: r.x - margin,
    y: r.y - margin,
    width: r.width + 2 * margin,
    height: r.height + 2 * margin,
  };
};

// 波形(全体波形からラベル領域まで)を入れている要素の位置
const waveformRect = () =>
  page.evaluate(() => {
    const rect = document
      .querySelector(".relative.min-w-0.flex-1")
      .getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });

// 波形の下端まで入る高さにウィンドウを合わせる
const fitViewportToWaveform = async () => {
  const r = await waveformRect();
  await page.setViewport({
    width: WIDTH,
    height: Math.ceil(r.y + r.height + 40),
    deviceScaleFactor: 1,
  });
  await sleep(500);
};

const xpathRect = (xpath) =>
  page.evaluate((xp) => {
    const el = document.evaluate(
      xp,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;
    const rect = el.getBoundingClientRect();
    return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
  }, xpath);

const padRect = (r, p = 4) => ({
  x: r.x - p,
  y: r.y - p,
  w: r.w + 2 * p,
  h: r.h + 2 * p,
});

// 番号付きの枠を重ねる(docs/screen.md の表の番号と対応させる)
const annotate = (items) =>
  page.evaluate((items) => {
    const layer = document.createElement("div");
    layer.id = "__annotations";
    layer.style.cssText =
      "position:fixed;inset:0;pointer-events:none;z-index:99999";
    for (const { n, x, y, w, h } of items) {
      const box = document.createElement("div");
      box.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border:2px solid #e11d48;border-radius:6px`;
      const badge = document.createElement("div");
      badge.textContent = String(n);
      badge.style.cssText = `position:absolute;left:${x - 11}px;top:${y - 11}px;width:22px;height:22px;border-radius:11px;background:#e11d48;color:#fff;font:bold 13px/22px sans-serif;text-align:center`;
      layer.append(box, badge);
    }
    document.body.append(layer);
  }, items);

// 既定値の設定で撮るため、保存済みの設定を消してから始める
await page.goto(APP_URL, { waitUntil: "networkidle0" });
await page.evaluate((height) => {
  localStorage.clear();
  localStorage.setItem(
    "audio-labeler.displaySettings",
    JSON.stringify({ mainWaveformHeight: height }),
  );
}, MAIN_WAVEFORM_HEIGHT);
await page.reload({ waitUntil: "networkidle0" });

// 読み込みのダイアログ(「自動検出まで」を選んだ状態)
const input = await page.$("input[type=file]");
await input.uploadFile(WAV);
await page.waitForSelector("::-p-text(読み込み後の処理)", { timeout: 60000 });
await sleep(500);
await clickText("自動検出まで");
await sleep(300);
await shot("audio-load-dialog", { clip: await dialogClip() });
await clickText("読み込む");

// 自動検出が終わると「自動検出」ボタンが押せる状態に戻る
await page.waitForSelector(
  "::-p-xpath(//button[normalize-space(.)='自動検出' and not(@disabled)])",
  {
    timeout: 120000,
  },
);
await sleep(1500);

// 先頭の区間から順にラベルを入れ、2つ目の区間を選んだ状態にする
await page.keyboard.press("Escape");
for (const label of LABELS) {
  await page.keyboard.press("ArrowRight");
  await sleep(200);
  await page.keyboard.press("Enter");
  await sleep(200);
  await page.keyboard.type(label);
  await page.keyboard.press("Enter");
  await sleep(200);
}
await page.keyboard.press("ArrowLeft");
await sleep(500);

// 編集画面の構成(番号付き)
await fitViewportToWaveform();
const waveform = await waveformRect();
const timeAxisTop = waveform.y + MINIMAP_HEIGHT + MAIN_WAVEFORM_HEIGHT;
const labelBarTop = timeAxisTop + TIME_AXIS_HEIGHT;
const band = (n, y, h) => ({
  n,
  x: waveform.x - 2,
  y,
  w: waveform.width + 4,
  h,
});
const fileMenu = await xpathRect(
  "//header//button[normalize-space(.)='ファイル']",
);
const settingsButton = await xpathRect(
  "//header//button[normalize-space(.)='設定']",
);
await annotate([
  {
    n: 1,
    ...padRect({
      x: fileMenu.x,
      y: fileMenu.y,
      w: settingsButton.x + settingsButton.w - fileMenu.x,
      h: fileMenu.h,
    }),
  },
  { n: 2, ...padRect(await xpathRect("//main//span[contains(., 'kHz')]/..")) },
  {
    n: 3,
    ...padRect(
      await xpathRect(
        "//button[@aria-label='再生' or @aria-label='一時停止']/..",
      ),
    ),
  },
  {
    n: 4,
    ...padRect(await xpathRect("//button[normalize-space(.)='自動検出']/..")),
  },
  band(5, waveform.y, MINIMAP_HEIGHT),
  band(6, waveform.y + MINIMAP_HEIGHT + 2, MAIN_WAVEFORM_HEIGHT - 4),
  band(7, timeAxisTop, TIME_AXIS_HEIGHT),
  band(8, labelBarTop, LABEL_BAR_HEIGHT),
  band(9, labelBarTop + LABEL_BAR_HEIGHT, ADJUST_BAR_HEIGHT),
]);
await sleep(200);
await shot("screen-layout");
await page.evaluate(() => document.getElementById("__annotations").remove());

// ラベル帯・調整帯の拡大(選択中の区間を含む)
await shot("label-area", {
  clip: {
    x: waveform.x - 70,
    y: timeAxisTop - 120,
    width: waveform.width + 90,
    height: 120 + TIME_AXIS_HEIGHT + LABEL_BAR_HEIGHT + ADJUST_BAR_HEIGHT + 16,
  },
});

// 「ファイル」「表示」メニュー
const menuClip = { x: 0, y: 0, width: 520, height: 260 };
await clickText("ファイル");
await sleep(300);
await shot("menu-file", { clip: menuClip });
await page.keyboard.press("Escape");
await page.mouse.click(WIDTH - 80, 30);
await sleep(200);
await clickText("表示");
await sleep(300);
await shot("menu-view", { clip: menuClip });

// スペクトログラムと補助線をオンにした画面
await clickViewMenuItem("スペクトログラム");
await sleep(300);
await clickText("表示");
await sleep(300);
await clickViewMenuItem("補助線");
await page.waitForFunction(
  () => !document.body.innerText.includes("スペクトログラムを計算中"),
  { timeout: 60000 },
);
await sleep(1000);
await fitViewportToWaveform();
await shot("spectrogram");
for (const item of ["スペクトログラム", "補助線"]) {
  await clickText("表示");
  await sleep(200);
  await clickViewMenuItem(item);
  await sleep(200);
}
await page.setViewport({ width: WIDTH, height: 900, deviceScaleFactor: 1 });
await sleep(500);

// 自動検出のダイアログ(区間を選んでいて「対象」が出る状態)
await page.keyboard.press("ArrowRight");
await sleep(200);
await clickText("自動検出");
await sleep(400);
await shot("speech-detection-dialog", { clip: await dialogClip() });
await page.keyboard.press("Escape");
await sleep(300);

// 音声の切り出しのダイアログ
await clickText("ファイル");
await sleep(200);
await clickText("音声を切り出す");
await sleep(400);
await shot("segment-export-dialog", { clip: await dialogClip() });
await page.keyboard.press("Escape");
await sleep(300);

// 設定ダイアログの各カテゴリ
await clickText("設定");
await sleep(400);
for (const [category, name] of [
  ["表示設定", "settings-display"],
  ["編集", "settings-editing"],
  ["自動検出", "settings-detection"],
  ["文字起こし", "settings-transcription"],
  ["ショートカットキー", "settings-shortcuts"],
]) {
  const el = await page.waitForSelector(
    `::-p-xpath(//dialog//nav//button[normalize-space(.)='${category}'])`,
  );
  await el.click();
  await sleep(300);
  await shot(name, { clip: await dialogClip() });
}

await browser.close();
console.log(`${OUT_DIR} に保存しました`);
