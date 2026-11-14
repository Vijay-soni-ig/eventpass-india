import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeCsvCell } from "../src/lib/csv";

test("CSV cells quote values and escape embedded quotes", () => {
  assert.equal(escapeCsvCell('Visitor "One"'), '"Visitor ""One"""');
});

test("CSV cells neutralize spreadsheet formula prefixes", () => {
  for (const value of ["=1+1", "+SUM(A1:A2)", "-2+3", "@SUM(A1)", "  =HYPERLINK(\\"https://attacker.example\\")", "\t=1+1"]) {
    assert.equal(escapeCsvCell(value).startsWith('"\\''), true, value);
  }
});

test("CSV cells preserve ordinary values and empty values", () => {
  assert.equal(escapeCsvCell("Vijay Soni"), '"Vijay Soni"');
  assert.equal(escapeCsvCell("visitor@example.com"), '"visitor@example.com"');
  assert.equal(escapeCsvCell(null), '""');
});
