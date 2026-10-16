/** Colours the native chat draws with. A client maps its own palette onto this. */
export interface ChatNativeTheme {
  background: string;
  surfaceRaised: string;
  surfaceSunken: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  borderSubtle: string;
  accent: string;
  accentSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;
  codeBackground: string;
}

export const lightChatNativeTheme: ChatNativeTheme = {
  background: "#ffffff",
  surfaceRaised: "#ffffff",
  surfaceSunken: "#f4f4f6",
  text: "#16161a",
  textSecondary: "#53555f",
  textTertiary: "#7a7c87",
  border: "#c9cad2",
  borderSubtle: "#e2e3e8",
  accent: "#3b5bdb",
  accentSoft: "#eef1fd",
  success: "#2b8a3e",
  successSoft: "#ebf7ee",
  warning: "#b36b00",
  warningSoft: "#fdf3e3",
  danger: "#c92a2a",
  dangerSoft: "#fdecec",
  info: "#1971c2",
  infoSoft: "#e8f2fb",
  codeBackground: "#f1f2f5",
};

export const darkChatNativeTheme: ChatNativeTheme = {
  background: "#111214",
  surfaceRaised: "#1a1b1e",
  surfaceSunken: "#16171a",
  text: "#ececf0",
  textSecondary: "#a6a8b3",
  textTertiary: "#7d7f8a",
  border: "#3a3c44",
  borderSubtle: "#2a2c32",
  accent: "#7b93f5",
  accentSoft: "#1f2540",
  success: "#69c47c",
  successSoft: "#14241a",
  warning: "#e0a64a",
  warningSoft: "#2a2112",
  danger: "#f07c7c",
  dangerSoft: "#2c1717",
  info: "#6cb2ee",
  infoSoft: "#14212d",
  codeBackground: "#1d1e22",
};
