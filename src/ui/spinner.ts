import ora, { Ora } from "ora";
import { Theme } from "./theme.js";

export class TaskSpinner {
  private spinner: Ora;

  constructor() {
    this.spinner = ora({
      spinner: "dots",
      color: "yellow",
    });
  }

  start(text: string) {
    this.spinner.text = Theme.dim(text);
    this.spinner.start();
  }

  update(text: string, type: "tool" | "skill" = "tool") {
    if (type === "skill") {
      this.spinner.text = Theme.main(`🧠 Loading SOP: ${text}...`);
    } else {
      this.spinner.text = Theme.info(`⚙ Executing: ${text}...`);
    }
  }

  stop() {
    this.spinner.stop();
  }
}
