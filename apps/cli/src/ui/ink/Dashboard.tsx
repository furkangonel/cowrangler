import React from "react";
import { Box, Text } from "ink";
import os from "os";

/**
 * Dashboard — açılış banner'ı, artık Ink ağacının içinde.
 *
 * Neden Ink içinde (eskiden pre-mount console.log idi):
 *  - Resize'da scrollback temizlenip her şey tek seferde yeniden basılabilsin
 *    diye banner'ın da remount edilebilir Static akışında olması gerekiyor.
 *  - Native Box border → genişliğe göre kendiliğinden reflow; manuel sütun
 *    matematiği yok → dar/geniş terminalde bozulmaz.
 *
 * Tasarım: tek panel, solda logo + kimlik, altında hızlı komutlar. Eski
 * çift-panel boxen'dan daha sade.
 */

const OCTOPUS = ["  ▄▄▄▄▄▄▄", "  █ ███ █", "  ███████", " █▄█   █▄█"];
const ORANGE = "#FF4C00";
const BONE = "#F8F2E5";

interface DashboardProps {
  version: string;
  model: string;
  cwd: string;
  toolCount: number;
  skillCount: number;
  hasInstructions: boolean;
  cols: number;
}

export const Dashboard: React.FC<DashboardProps> = ({
  version,
  model,
  cwd,
  toolCount,
  skillCount,
  hasInstructions,
  cols,
}) => {
  const home = os.homedir();
  const path = cwd.startsWith(home) ? "~" + cwd.slice(home.length) : cwd;
  const modelShort = model.split("/").pop() || model;

  // Çok dar terminalde kompakt tek satır — asla taşma/kırılma.
  if (cols < 46) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text>
          <Text color={ORANGE} bold>
            ◆ Cowrangler
          </Text>
          <Text dimColor>{`  v${version}`}</Text>
        </Text>
        <Text color={BONE}>{modelShort}</Text>
        <Text dimColor>{`${toolCount} tools · ${skillCount} skills`}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box
        alignSelf="flex-start"
        borderStyle="round"
        borderColor={ORANGE}
        paddingX={2}
        paddingY={1}
        flexDirection="row"
      >
        {/* Sol: logo */}
        <Box flexDirection="column" marginRight={3}>
          {OCTOPUS.map((row, i) => (
            <Text key={i} color={ORANGE}>
              {row}
            </Text>
          ))}
        </Box>

        {/* Sağ: kimlik + komutlar */}
        <Box flexDirection="column">
          <Text>
            <Text color={ORANGE} bold>
              Cowrangler
            </Text>
            <Text dimColor>{`  v${version}`}</Text>
          </Text>
          <Text dimColor>Your personal AI agent</Text>
          <Box marginTop={1} flexDirection="column">
            <Text>
              <Text color={ORANGE}>◆ </Text>
              <Text color={BONE}>{modelShort}</Text>
            </Text>
            <Text dimColor>{path}</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>
              /help · /skills · /tools · /model · /key · /reset
            </Text>
          </Box>
        </Box>
      </Box>

      {/* Alt satır: özet + init ipucu */}
      <Box paddingLeft={1}>
        <Text color="#5CA4D4">{`${toolCount} tools`}</Text>
        <Text dimColor>{`  ·  ${skillCount} skills`}</Text>
        {hasInstructions ? (
          <Text color="#A5C27C">{"  ·  COWRNGLR.md ✓"}</Text>
        ) : (
          <Text dimColor>
            {"  ·  "}
            <Text color={ORANGE}>/init</Text>
            {" → COWRNGLR.md oluştur"}
          </Text>
        )}
      </Box>
    </Box>
  );
};
