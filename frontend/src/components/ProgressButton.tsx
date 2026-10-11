type ProgressButtonProps = {
  label: string;
  // カーソルを当てたとき(キーボードでフォーカスしたときも)に、labelの代わりに出す文言。押すと行う操作を表す
  hoverLabel: string;
  // 0〜1。nullは進み具合がまだ分からない間(モデルの読み込み中など)で、枠全体をゆっくり点滅させる
  ratio: number | null;
  onClick: () => void;
};

// 処理中の表示を兼ねるボタン。Buttonと同じ大きさの枠に、進んだ分だけ左から色を塗っていく(件数などの文字を並べずに、
// 進み具合をひと目で分かるようにするため)。カーソルを当てると押したときの操作(中止など)の文言に変わる
function ProgressButton({ label, hoverLabel, ratio, onClick }: ProgressButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative cursor-pointer overflow-hidden rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:text-red-600 focus-visible:text-red-600"
    >
      {ratio === null ? (
        <span className="absolute inset-0 animate-pulse bg-gray-100" />
      ) : (
        <span
          className="absolute inset-y-0 left-0 bg-green-200 transition-[width] duration-500"
          style={{ width: `${ratio * 100}%` }}
        />
      )}
      {/* 2つの文言を同じ位置に重ね、見える方だけを切り替える。文字数が違ってもカーソルを当てたときにボタンの幅が変わらないようにするため */}
      <span className="relative grid">
        <span className="col-start-1 row-start-1 group-hover:invisible group-focus-visible:invisible">{label}</span>
        <span className="invisible col-start-1 row-start-1 group-hover:visible group-focus-visible:visible">
          {hoverLabel}
        </span>
      </span>
    </button>
  );
}

export default ProgressButton;
