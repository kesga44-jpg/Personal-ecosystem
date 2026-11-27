/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** '1' zet de P-6-kluis aan (alleen test- en ontwikkelbuilds tot P-6 is vrijgegeven). */
  readonly VITE_PE_VAULT?: string;
}
