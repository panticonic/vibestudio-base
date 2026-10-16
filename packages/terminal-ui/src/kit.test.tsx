import React from "react";
import { describe, expect, it } from "vitest";
import { renderToString } from "ink";
import { Callout, Card, Flex, Table, Text, Badge, mdxComponents } from "./index.js";

const md = mdxComponents as Record<string, React.FC<Record<string, unknown>>>;

describe("terminal-ui", () => {
  it("draws the browser vocabulary as text", () => {
    const out = renderToString(
      <Card>
        <Flex gap="2">
          <Text weight="bold">Build</Text>
          <Badge color="green">passing</Badge>
        </Flex>
        <Callout.Root color="amber">
          <Callout.Text>Two tests were skipped.</Callout.Text>
        </Callout.Root>
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Time</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            <Table.Row>
              <Table.Cell>unit</Table.Cell>
              <Table.Cell>4s</Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table.Root>
      </Card>,
      { columns: 60 }
    );
    expect(out).toContain("Build");
    expect(out).toContain("‹passing›");
    expect(out).toContain("Two tests were skipped.");
    expect(out).toMatch(/Name\s+Time/);
    expect(out).toMatch(/unit\s+4s/);
  });

  it("lays out the elements Markdown compiles to, with words outside <Text>", () => {
    const P = md["p"]!;
    const Ul = md["ul"]!;
    const Li = md["li"]!;
    const Strong = md["strong"]!;
    const out = renderToString(
      <>
        <P>
          Hello <Strong>terminal</Strong> world
        </P>
        <Ul>
          <Li>first</Li>
          <Li>second</Li>
        </Ul>
      </>,
      { columns: 40 }
    );
    expect(out).toContain("Hello terminal world");
    expect(out).toContain("• first");
    expect(out).toContain("• second");
  });
});
