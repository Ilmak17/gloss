import assert from "node:assert/strict";
import { test } from "node:test";
import { listenKeyAction } from "../lib/listen-keys";

const press = (key: string, more: Partial<{ shiftKey: boolean; repeat: boolean; mod: boolean }> = {}) => ({ key, shiftKey: false, repeat: false, mod: false, ...more });
const reading = { typing: false, onControl: false, overlay: false, idle: false, canStart: true };

test("Space pauses the voice even when a button clicked earlier still has focus", () => {
  assert.equal(listenKeyAction(press(" "), reading), "toggle");
  assert.equal(listenKeyAction(press(" "), { ...reading, onControl: true }), "toggle");
});

test("holding Space pauses once instead of flickering between play and pause", () => {
  assert.equal(listenKeyAction(press(" ", { repeat: true }), reading), "ignore");
  assert.equal(listenKeyAction(press(" ", { repeat: true }), { ...reading, idle: true }), "ignore");
  assert.equal(listenKeyAction(press(" ", { repeat: true }), { ...reading, idle: true, canStart: false }), null, "held Space still scrolls an article");
});

test("with the voice off, Space starts it from the page, or presses the focused button", () => {
  const idle = { ...reading, idle: true };
  assert.equal(listenKeyAction(press(" "), idle), "start");
  assert.equal(listenKeyAction(press(" "), { ...idle, onControl: true }), null);
  assert.equal(listenKeyAction(press(" "), { ...idle, canStart: false }), null);
  assert.equal(listenKeyAction(press("ArrowRight", { shiftKey: true }), idle), null);
});

test("typing, open menus and shortcuts with modifiers keep their keys", () => {
  assert.equal(listenKeyAction(press(" "), { ...reading, typing: true }), null);
  assert.equal(listenKeyAction(press(" "), { ...reading, overlay: true }), null);
  assert.equal(listenKeyAction(press(" ", { mod: true }), reading), null);
});

test("Shift and the arrows move by sentence, minus and plus change speed", () => {
  assert.equal(listenKeyAction(press("ArrowLeft", { shiftKey: true }), reading), "back");
  assert.equal(listenKeyAction(press("ArrowRight", { shiftKey: true }), { ...reading, onControl: true }), "next");
  assert.equal(listenKeyAction(press("-"), reading), "slower");
  assert.equal(listenKeyAction(press("="), reading), "faster");
  assert.equal(listenKeyAction(press("+", { shiftKey: true }), reading), "faster");
  assert.equal(listenKeyAction(press("ArrowRight"), reading), null, "a plain arrow still turns the page");
});
