export function prepareDesktopSetup(options: {
  profile: "claude" | "claude-3p";
  bundleRoot: string;
  projectPath?: string;
  resumeContext?: string;
}): { status: string; config: string; message: string };
