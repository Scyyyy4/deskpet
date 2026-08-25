import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

type Mood = "idle" | "happy" | "sleep";

const moods: Mood[] = ["idle", "happy", "sleep"];

function App() {
  const [mood, setMood] = useState<Mood>("idle");
  const [menuOpen, setMenuOpen] = useState(false);

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main
      className="stage"
      data-tauri-drag-region
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuOpen(true);
      }}
      onClick={() => {
        if (menuOpen) {
          setMenuOpen(false);
          return;
        }
        cycleMood();
      }}
    >
      <div className={`pet mood-${mood}`} data-tauri-drag-region>
        <div className="shadow" data-tauri-drag-region />
        <div className="body" data-tauri-drag-region>
          <div className="cheek left" />
          <div className="cheek right" />
          <div className={`eye left ${mood === "sleep" ? "closed" : ""}`} />
          <div className={`eye right ${mood === "sleep" ? "closed" : ""}`} />
          <div className={`mouth ${mood}`} />
        </div>
      </div>

      {menuOpen && (
        <div
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
