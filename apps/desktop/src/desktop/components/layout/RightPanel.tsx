import React, { useState, useCallback, useRef } from "react";
import { DiffPanel } from "../code/DiffPanel";
import { TerminalPanel } from "../code/TerminalPanel";
import { LivePreviewPanel } from "../code/LivePreviewPanel";
import { CodePlanPanel } from "../code/CodePlanPanel";
import { CodeTaskPanel } from "../code/CodeTaskPanel";
import { useUIStore } from "../../stores/ui.store";
import { FilePreviewPanel } from "../shared/FilePreviewModal";

export function RightPanel() {
  const {
    rightPanelOpen,
    codeRightTab,
    previewFile,
  } = useUIStore();

  const [width, setWidth] = useState(() => {
    try {
      const saved = localStorage.getItem("cowrangler.rightPanelWidth");
      return saved ? parseInt(saved, 10) : 380;
    } catch {
      return 380;
    }
  });
  const widthRef = useRef(width);
  widthRef.current = width;

  const startResize = useCallback((mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    const startX = mouseDownEvent.clientX;
    const startWidth = widthRef.current;
    let currentWidth = startWidth;

    const doResize = (mouseMoveEvent: MouseEvent) => {
      const deltaX = startX - mouseMoveEvent.clientX; // drag left to increase width
      const newWidth = Math.min(800, Math.max(280, startWidth + deltaX));
      currentWidth = newWidth;
      setWidth(newWidth);
    };

    const stopResize = () => {
      try {
        localStorage.setItem("cowrangler.rightPanelWidth", currentWidth.toString());
      } catch {}
      document.removeEventListener("mousemove", doResize);
      document.removeEventListener("mouseup", stopResize);
    };

    document.addEventListener("mousemove", doResize);
    document.addEventListener("mouseup", stopResize);
  }, []);

  if (!rightPanelOpen) return null;

  if (!codeRightTab && !previewFile) return null;

  return (
    <aside
      className="relative flex flex-col flex-shrink-0 border-l border-border-subtle bg-bg-secondary animate-slide-in"
      style={{ width: `${width}px` }}
    >
      {/* Resize Handle */}
      <div
        onMouseDown={startResize}
        className="absolute top-0 bottom-0 left-0 w-1.5 cursor-col-resize hover:bg-accent/40 transition-colors z-50"
        style={{ transform: "translateX(-3px)" }}
      />
      <div className="flex-1 min-h-0 overflow-hidden">
        {previewFile ? <FilePreviewPanel /> : <>
          {codeRightTab === "terminal" && <TerminalPanel />}
          {codeRightTab === "files" && <DiffPanel />}
          {codeRightTab === "run" && <LivePreviewPanel />}
          {codeRightTab === "plan" && <CodePlanPanel />}
          {codeRightTab === "task" && <CodeTaskPanel />}
        </>}
      </div>
    </aside>
  );
}
