import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { getLogs } from "../lib/api";
import { Card } from "../components/ui";

export function LogsPage() {
  const [logs, setLogs] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const lines = await getLogs().catch(() => [] as string[]);
      if (alive) setLogs(lines);
    };
    tick();
    const id = setInterval(tick, 1200);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <Card className="flex h-[calc(100vh-180px)] flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <h3 className="text-sm font-semibold text-white">请求日志</h3>
        <span className="text-xs text-slate-500">最近 {logs.length} 条</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed">
        {logs.length === 0 ? (
          <p className="text-slate-600">暂无日志… 让 Claude Code 发起请求后这里会显示路由记录。</p>
        ) : (
          logs.map((line, i) => <LogLine key={i} line={line} />)
        )}
        <div ref={endRef} />
      </div>
    </Card>
  );
}

function LogLine({ line }: { line: string }) {
  if (!line.includes("\x1b[")) {
    const tone = /ERROR|error/i.test(line)
      ? "text-red-400"
      : /WARN|warn/i.test(line)
        ? "text-amber-300"
        : "text-slate-400";
    return <div className={tone}>{line}</div>;
  }
  return (
    <div>
      {parseAnsi(line).map((s, i) => (
        <span key={i} style={s.style}>
          {s.text}
        </span>
      ))}
    </div>
  );
}

// 最小的 ANSI SGR 渲染器（tracing 只发 \x1b[..m 序列，含 truecolor 38;2;r;g;b）
const ANSI_FG: Record<number, string> = {
  30: "#a1a1aa", 31: "#f87171", 32: "#4ade80", 33: "#facc15",
  34: "#60a5fa", 35: "#c084fc", 36: "#22d3ee", 37: "#e4e4e7",
};
const ANSI_BRIGHT_FG: Record<number, string> = {
  90: "#a1a1aa", 91: "#f87171", 92: "#4ade80", 93: "#facc15",
  94: "#60a5fa", 95: "#c084fc", 96: "#22d3ee", 97: "#fafafa",
};

function parseAnsi(line: string): { text: string; style: CSSProperties }[] {
  const spans: { text: string; style: CSSProperties }[] = [];
  const re = /\x1b\[([0-9;]*)m/g;
  let last = 0;
  let fg: string | null = null;
  let bold = false;
  let dim = false;
  let m: RegExpExecArray | null;
  const flush = (to: number) => {
    if (to > last) {
      const style: CSSProperties = {};
      if (fg) style.color = fg;
      if (bold) style.fontWeight = 600;
      if (dim) style.opacity = 0.65;
      spans.push({ text: line.slice(last, to), style });
    }
    last = to;
  };
  while ((m = re.exec(line))) {
    flush(m.index);
    last = m.index + m[0].length;
    const codes = m[1] === "" ? [0] : m[1].split(";").map(Number);
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i];
      if (c === 0) { fg = null; bold = dim = false; }
      else if (c === 1) bold = true;
      else if (c === 2) dim = true;
      else if (c === 22) bold = false;
      else if (c === 39) fg = null;
      else if (c >= 30 && c <= 37) fg = ANSI_FG[c];
      else if (c >= 90 && c <= 97) fg = ANSI_BRIGHT_FG[c];
      else if (c === 38 && codes[i + 1] === 2) {
        fg = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`;
        i += 4;
      }
    }
  }
  flush(line.length);
  return spans;
}
