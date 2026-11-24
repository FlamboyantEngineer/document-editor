// markdown-it-footnote ships no types: the plugin, as markdown-it's `use` takes it.
declare module 'markdown-it-footnote' {
  import type { PluginSimple } from 'markdown-it';

  const footnote: PluginSimple;
  export = footnote;
}
