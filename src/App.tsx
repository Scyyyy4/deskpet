import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { rectsFromElements } from "./clickThrough";
import { useClickThrough } from "./useClickThrough";
import { useEdgeWalk } from "./useEdgeWalk";
import { useWindowResize } from "./useWindowResize";
import { RESIZE_DIRS } from "./windowSize";
import "./App.css";

type Mood = "idle" | "happy" | "sleep";

const moods: Mood[] = ["idle", "happy", "sleep"];

async function ensureAlwaysOnTop() {
  const win = getCurrentWindow();
  await win.setAlwaysOnTop(true);
  // Some Linux WMs drop the flag after focus changes; re-apply periodically.
  return window.setInterval(() => {
    void win.setAlwaysOnTop(true);
  }, 2000);
}

function App() {
  const [mood, setMood] = useState<Mood>("idle");
  const [menuOpen, setMenuOpen] = useState(false);
  const resizingRef = useRef(false);
  const walk = useEdgeWalk({
    paused: menuOpen || mood === "sleep",
    extraPausedRefs: [resizingRef],
  });
  const resize = useWindowResize({
    edge: walk.pose.edge,
    reanchor: walk.reanchor,
    resizingRef,
  });
  const petRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickThrough({
    hitRefs: [petRef, menuRef],
    extraHits: () =>
      rectsFromElements(
        resize.handlesRef.current
          ? [...resize.handlesRef.current.querySelectorAll(".resize-handle")]
          : [],
      ),
    pinnedRefs: [walk.interactingRef, resize.resizingRef],
  });

  const cycleMood = useCallback(() => {
    setMood((current) => {
      const next = moods[(moods.indexOf(current) + 1) % moods.length];
      return next;
    });
    setMenuOpen(false);
  }, []);

  const quit = useCallback(async () => {
    await getCurrentWindow().close();
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    void ensureAlwaysOnTop().then((id) => {
      timer = id;
    });
    return () => {
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main
      className="stage"
      data-edge={walk.pose.edge}
      style={{ "--pet-scale": resize.scale } as CSSProperties}
    >
      <div className="resize-frame" ref={resize.handlesRef}>
        {RESIZE_DIRS.map((dir) => (
          <div
            key={dir}
            className={`resize-handle ${dir}`}
            data-dir={dir}
            onPointerDown={resize.onHandlePointerDown}
            onPointerMove={resize.onHandlePointerMove}
            onPointerUp={resize.onHandlePointerUp}
            onPointerCancel={resize.onHandlePointerUp}
          />
        ))}
      </div>

      <div
        ref={petRef}
        className={`pet mood-${mood}${walk.pose.moving ? " walking" : ""}`}
        style={
          {
            "--pet-rot": `${walk.pose.rotation}deg`,
            "--pet-flip": walk.pose.facing === "left" ? -1 : 1,
          } as CSSProperties
        }
        onPointerDown={walk.onPointerDown}
        onPointerMove={walk.onPointerMove}
        onPointerUp={walk.onPointerUp}
        onPointerCancel={walk.onPointerUp}
        onWheel={resize.onWheel}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuOpen(true);
        }}
        onClick={() => {
          if (walk.shouldIgnoreClick()) return;
          if (menuOpen) {
            setMenuOpen(false);
            return;
          }
          cycleMood();
        }}
      >
        <div className="pet-gfx">
          <div className="shadow" />
          <div className="body">
            <div className="cheek left" />
            <div className="cheek right" />
            <div className={`eye left ${mood === "sleep" ? "closed" : ""}`} />
            <div className={`eye right ${mood === "sleep" ? "closed" : ""}`} />
            <div className={`mouth ${mood}`} />
          </div>
        </div>
      </div>

      {menuOpen && (
        <div
          ref={menuRef}
          className="menu"
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button type="button" onClick={cycleMood}>
            Change mood
          </button>
          <button type="button" className="danger" onClick={quit}>
            Quit
          </button>
        </div>
      )}
    </main>
  );
}

export default App;
