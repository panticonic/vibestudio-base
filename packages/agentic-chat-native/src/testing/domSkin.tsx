/**
 * A DOM implementation of the quickfire skin contract, so the shared,
 * skin-driven components (transcript, conversation list) are testable under
 * vitest without a React Native runtime. It is a test fixture: the native
 * skin (`native/skin.tsx`) is the product.
 */
import type { ReactNode } from "react";
import type { QuickfireSkin } from "@workspace/quickfire-core/ui";

const text = (children: ReactNode) => <span>{children}</span>;

export const domSkin: QuickfireSkin = {
  Table: ({ head, rows }) => (
    <table>
      <thead>
        <tr>{head.map((cell, i) => <th key={i}>{cell}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, r) => (
          <tr key={r}>{row.map((cell, i) => <td key={i}>{cell}</td>)}</tr>
        ))}
      </tbody>
    </table>
  ),
  Input: ({ value, onChange, label }) => (
    <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />
  ),
  Box: ({ children, testId }) => <div data-testid={testId}>{children}</div>,
  Text: ({ children }) => text(children),
  Pressable: ({ children, onPress, label, disabled }) => (
    <button type="button" aria-label={label} disabled={disabled} onClick={onPress}>
      {children}
    </button>
  ),
  Icon: ({ name }) => <i data-icon={name} />,
  Spinner: () => <span role="progressbar" />,
  Divider: () => <hr />,
  Pill: ({ children }) => text(children),
  Disclosure: ({ summary, children, label, open, defaultOpen }) => (
    <details open={open ?? defaultOpen} aria-label={label}>
      <summary>{summary}</summary>
      {children}
    </details>
  ),
  Code: ({ text: source }) => <pre>{source}</pre>,
  Figure: ({ src, alt }) => <img src={src} alt={alt} />,
  Caret: () => <span>|</span>,
};
