import fs from "fs";
import path from "path";
import os from "os";
import yaml from "js-yaml";
import dotenv from "dotenv";

export const PROJECT_ROOT = process.cwd();
export const LOCAL_DIR = path.join(PROJECT_ROOT, ".cowrangler");
export const GLOBAL_DIR = path.join(os.homedir(), ".cowrangler");

export const DIRS = {
  local: {
    base: LOCAL_DIR,
    skills: path.join(LOCAL_DIR, "skills"),
    config: path.join(LOCAL_DIR, "config.yaml"),
    memory: path.join(LOCAL_DIR, "memory.md"),
    todo: path.join(LOCAL_DIR, "AGENT_TODO.md"),
  },
  global: {
    base: GLOBAL_DIR,
    skills: path.join(GLOBAL_DIR, "skills"),
    config: path.join(GLOBAL_DIR, "config.yaml"),
    credentials: path.join(GLOBAL_DIR, "credentials.env"),
  },
};

export function initEnvironment() {
  // 1. GLOBAL YAPILANDIRMA
  if (!fs.existsSync(DIRS.global.base))
    fs.mkdirSync(DIRS.global.base, { recursive: true });
  if (!fs.existsSync(DIRS.global.skills))
    fs.mkdirSync(DIRS.global.skills, { recursive: true });

  if (!fs.existsSync(DIRS.global.config)) {
    const defaultGlobal = {
      model: "openrouter/google/gemini-2.5-flash",
      saved_models: ["openrouter/google/gemini-2.5-flash"],
      system_prompt:
        "Sen kullanıcıya yardım eden, dosyalarla çalışabilen bir asistansın. Kullanıcının dilinde cevap ver. Dosya okumak, yazmak veya listelemek için sana verilen araçları kullan. Araçları kullanırken önce ne yapacağını düşün, sonra çağır. Her adımda net ve kısa açıklamalar yap.",
      temperature: 0.7,
      max_iterations: 15,
    };
    fs.writeFileSync(DIRS.global.config, yaml.dump(defaultGlobal), "utf-8");
  }

  if (!fs.existsSync(DIRS.global.credentials)) {
    fs.writeFileSync(
      DIRS.global.credentials,
      "# CoWrangler GLOBAL API KEYS\n",
      "utf-8",
    );
  }

  // 2. YEREL (PROJE) YAPILANDIRMASI
  if (!fs.existsSync(DIRS.local.base))
    fs.mkdirSync(DIRS.local.base, { recursive: true });
  if (!fs.existsSync(DIRS.local.skills))
    fs.mkdirSync(DIRS.local.skills, { recursive: true });

  if (!fs.existsSync(DIRS.local.memory)) {
    fs.writeFileSync(
      DIRS.local.memory,
      "# Proje Hafızası (Context)\nAjanın bu proje hakkında bilmesi gereken temel mimari kararları, klasör yapılarını, kullanılan teknolojileri veya kısıtlamaları buraya yazın. Ajan her başlatıldığında ilk olarak bu dosyayı okur.\n",
      "utf-8",
    );
  }

  if (!fs.existsSync(DIRS.local.todo)) {
    fs.writeFileSync(
      DIRS.local.todo,
      "# Aktif Görevler (State)\n- [ ] Yeni görevler veya ajanın kaldığı yerler buraya işlenir...\n",
      "utf-8",
    );
  }
}

// Merkezi credentials.env dosyasını ve ardından varsa projedeki .env dosyasını yükler
export function loadEnvironmentVariables() {
  if (fs.existsSync(DIRS.global.credentials)) {
    dotenv.config({ path: DIRS.global.credentials });
  }
  // Eğer proje içinde spesifik bir .env varsa globali ezer
  dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });
}

export function getConfig() {
  initEnvironment();

  let config: any = {};

  // Global Config'i oku
  if (fs.existsSync(DIRS.global.config)) {
    const globalCfg = yaml.load(
      fs.readFileSync(DIRS.global.config, "utf-8"),
    ) as any;
    config = { ...config, ...globalCfg };
  }

  // Yerel Config varsa, Global'in üzerine yaz (Override)
  if (fs.existsSync(DIRS.local.config)) {
    const localCfg = yaml.load(
      fs.readFileSync(DIRS.local.config, "utf-8"),
    ) as any;
    config = { ...config, ...localCfg };
  }

  return config;
}
